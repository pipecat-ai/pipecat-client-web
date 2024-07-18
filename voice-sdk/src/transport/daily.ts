import Daily, {
  DailyCall,
  DailyEventObjectLocalAudioLevel,
  DailyEventObjectParticipant,
  DailyEventObjectParticipantLeft,
  DailyEventObjectRemoteParticipantsAudioLevel,
  DailyEventObjectTrack,
  DailyParticipant,
} from "@daily-co/daily-js";

import { Participant, Tracks, Transport, TransportState } from ".";
import { VoiceClientOptions } from "..";

export class DailyTransport extends Transport {
  private _state: TransportState;
  private _daily: DailyCall;
  private _localAudioLevelObserver: (level: number) => void;
  private _botAudioLevelObserver: (level: number) => void;
  private _botId: string = "";

  constructor(options: VoiceClientOptions) {
    super(options);

    this._state = TransportState.Idle;

    this._daily = Daily.createCallObject({
      videoSource: false,
      audioSource: options.enableMic ?? false,
      dailyConfig: {},
    });

    this._localAudioLevelObserver = () => {};
    this._botAudioLevelObserver = () => {};
  }

  private updateState(state: TransportState) {
    this._state = state;
    this._callbacks?.onStateChange?.(state);
  }

  get state() {
    return this._state;
  }

  enableMic(enable: boolean) {
    this._daily.setLocalAudio(enable);
  }

  get isMicEnabled() {
    return this._daily.localAudio();
  }

  tracks() {
    const participants = this._daily?.participants() ?? {};
    const bot = participants?.[this._botId];

    const tracks: Tracks = {
      local: {
        audio: participants?.local?.tracks?.audio?.persistentTrack,
        video: participants?.local?.tracks?.video?.persistentTrack,
      },
    };

    if (bot) {
      tracks.bot = {
        audio: bot?.tracks?.audio?.persistentTrack,
        video: bot?.tracks?.video?.persistentTrack,
      };
    }

    return tracks;
  }

  async connect({ url, token }: { url: string; token: string }) {
    this.updateState(TransportState.Connecting);

    this.attachEventListeners();

    try {
      await this._daily.join({
        // TODO: Remove hardcoded Daily domain
        url: `https://pipecat-demos.daily.co/${url}`,
        token,
      });
    } catch (e) {
      //@TODO: Error handling here
      console.error("Failed to join call", e);
      this.updateState(TransportState.Error);
      return;
    }

    this._callbacks.onConnected?.();
    this.updateState(TransportState.Connected);

    this._localAudioLevelObserver = this.createAudioLevelProcessor(
      dailyParticipantToParticipant(this._daily.participants().local)
    );

    this._daily.startLocalAudioLevelObserver(100);
    this._daily.startRemoteParticipantsAudioLevelObserver(100);
  }

  private attachEventListeners() {
    this._daily.on("track-started", this.handleTrackStarted.bind(this));
    this._daily.on("track-stopped", this.handleTrackStopped.bind(this));
    this._daily.on(
      "participant-joined",
      this.handleParticipantJoined.bind(this)
    );
    this._daily.on("participant-left", this.handleParticipantLeft.bind(this));

    this._daily.on("local-audio-level", this.handleLocalAudioLevel.bind(this));
    this._daily.on(
      "remote-participants-audio-level",
      this.handleRemoteAudioLevel.bind(this)
    );

    this._daily.on("left-meeting", this.handleLeftMeeting.bind(this));
  }

  private detachEventListeners() {
    this._daily.off("track-started", this.handleTrackStarted);
    this._daily.off("track-stopped", this.handleTrackStopped);
    this._daily.off("participant-joined", this.handleParticipantJoined);
    this._daily.off("participant-left", this.handleParticipantLeft);

    this._daily.off("local-audio-level", this.handleLocalAudioLevel);
    this._daily.off(
      "remote-participants-audio-level",
      this.handleRemoteAudioLevel
    );

    this._daily.off("left-meeting", this.handleLeftMeeting);
  }

  async disconnect() {
    this.detachEventListeners();

    this._daily.stopLocalAudioLevelObserver();
    this._daily.stopRemoteParticipantsAudioLevelObserver();

    await this._daily.leave();

    this._callbacks.onDisconnected?.();
    this.updateState(TransportState.Disconnected);
  }

  private handleTrackStarted(ev: DailyEventObjectTrack) {
    this._callbacks.onTrackStarted?.(
      ev.track,
      ev.participant ? dailyParticipantToParticipant(ev.participant) : undefined
    );
  }

  private handleTrackStopped(ev: DailyEventObjectTrack) {
    this._callbacks.onTrackStopped?.(
      ev.track,
      ev.participant ? dailyParticipantToParticipant(ev.participant) : undefined
    );
  }

  private handleParticipantJoined(ev: DailyEventObjectParticipant) {
    const p = dailyParticipantToParticipant(ev.participant);

    this._callbacks.onParticipantJoined?.(p);

    if (p.local) return;

    this._botAudioLevelObserver = this.createAudioLevelProcessor(p);

    this._botId = ev.participant.session_id;

    this._callbacks.onBotConnected?.(p);
  }

  private handleParticipantLeft(ev: DailyEventObjectParticipantLeft) {
    const p = dailyParticipantToParticipant(ev.participant);

    this._callbacks.onParticipantLeft?.(p);

    if (p.local) return;

    this._botId = "";

    this._callbacks.onBotDisconnected?.(p);
  }

  private handleLocalAudioLevel(ev: DailyEventObjectLocalAudioLevel) {
    this._localAudioLevelObserver(ev.audioLevel);
    this._callbacks.onLocalAudioLevel?.(ev.audioLevel);
  }

  private handleRemoteAudioLevel(
    ev: DailyEventObjectRemoteParticipantsAudioLevel
  ) {
    const participants = this._daily.participants();
    const ids = Object.keys(ev.participantsAudioLevel);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const level = ev.participantsAudioLevel[id];
      this._botAudioLevelObserver(level);
      this._callbacks.onRemoteAudioLevel?.(
        level,
        dailyParticipantToParticipant(participants[id])
      );
    }
  }

  private handleLeftMeeting() {
    this._botId = "";
    this._callbacks.onDisconnected?.();
    this.updateState(TransportState.Disconnected);
  }

  private createAudioLevelProcessor(
    participant: Participant,
    threshold: number = 0.05,
    silenceDelay: number = 750 // in milliseconds
  ) {
    let speaking = false;
    let silenceTimeout: ReturnType<typeof setTimeout> | null = null;

    return (level: number): void => {
      if (level > threshold) {
        if (silenceTimeout) {
          clearTimeout(silenceTimeout);
          silenceTimeout = null;
        }
        if (!speaking) {
          speaking = true;
          if (participant.local) {
            this._callbacks.onLocalStartedTalking?.();
          } else {
            this._callbacks.onBotStartedTalking?.(participant);
          }
        }
      } else if (speaking && !silenceTimeout) {
        silenceTimeout = setTimeout(() => {
          speaking = false;
          if (participant.local) {
            this._callbacks.onLocalStoppedTalking?.();
          } else {
            this._callbacks.onBotStoppedTalking?.(participant);
          }
          silenceTimeout = null; // Ensure to reset the timeout to null
        }, silenceDelay);
      }
    };
  }
}

const dailyParticipantToParticipant = (p: DailyParticipant): Participant => ({
  id: p.user_id,
  local: p.local,
  name: p.user_name,
});
