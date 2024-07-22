import Daily, {
  DailyCall,
  DailyEventObjectAppMessage,
  DailyEventObjectLocalAudioLevel,
  DailyEventObjectParticipant,
  DailyEventObjectParticipantLeft,
  DailyEventObjectRemoteParticipantsAudioLevel,
  DailyEventObjectTrack,
  DailyParticipant,
} from "@daily-co/daily-js";

import { VoiceClientOptions, VoiceMessage } from "..";
import type { TransportState } from ".";
import { Participant, Tracks, Transport } from ".";

export class DailyTransport extends Transport {
  protected _state: TransportState = "idle";

  private _daily: DailyCall;
  private _localAudioLevelObserver: (level: number) => void;
  private _botAudioLevelObserver: (level: number) => void;
  private _botId: string = "";
  private _expiry: number | undefined = undefined;

  private _selectedCam: MediaDeviceInfo | Record<string, never> = {};
  private _selectedMic: MediaDeviceInfo | Record<string, never> = {};

  constructor(
    options: VoiceClientOptions,
    onMessage: (ev: VoiceMessage) => void
  ) {
    super(options, onMessage);

    this._daily = Daily.createCallObject({
      videoSource: options.enableCam ?? false,
      audioSource: options.enableMic ?? false,
      dailyConfig: {},
    });

    this._daily
      .startCamera({
        videoSource: options.enableCam ?? false,
        audioSource: options.enableMic ?? false,
      })
      .then(async (infos) => {
        const { devices } = await this._daily.enumerateDevices();
        const cams = devices.filter((d) => d.kind === "videoinput");
        const mics = devices.filter((d) => d.kind === "audioinput");
        this._callbacks.onAvailableCamsUpdated?.(cams);
        this._callbacks.onAvailableMicsUpdated?.(mics);
        this._selectedCam = infos.camera;
        this._callbacks.onCamUpdated?.(infos.camera as MediaDeviceInfo);
        this._selectedMic = infos.mic;
        this._callbacks.onMicUpdated?.(infos.mic as MediaDeviceInfo);
      });

    this._daily.on("available-devices-updated", (ev) => {
      this._callbacks.onAvailableCamsUpdated?.(
        ev.availableDevices.filter((d) => d.kind === "videoinput")
      );
      this._callbacks.onAvailableMicsUpdated?.(
        ev.availableDevices.filter((d) => d.kind === "audioinput")
      );
    });

    this._daily.on("selected-devices-updated", (ev) => {
      if (this._selectedCam?.deviceId !== ev.devices.camera) {
        this._selectedCam = ev.devices.camera;
        this._callbacks.onCamUpdated?.(ev.devices.camera as MediaDeviceInfo);
      }
      if (this._selectedMic?.deviceId !== ev.devices.mic) {
        this._selectedMic = ev.devices.mic;
        this._callbacks.onMicUpdated?.(ev.devices.mic as MediaDeviceInfo);
      }
    });

    this._localAudioLevelObserver = () => {};
    this._botAudioLevelObserver = () => {};
  }

  get state(): TransportState {
    return this._state;
  }

  private set state(state: TransportState) {
    this._state = state;
    this._callbacks.onTransportStateChanged?.(state);
  }

  async getAllCams() {
    const { devices } = await this._daily.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  updateCam(camId: string) {
    this._daily
      .setInputDevicesAsync({
        videoDeviceId: camId,
      })
      .then((infos) => {
        this._selectedCam = infos.camera;
      });
  }

  get selectedCam() {
    return this._selectedCam;
  }

  async getAllMics() {
    const { devices } = await this._daily.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }

  updateMic(micId: string) {
    this._daily
      .setInputDevicesAsync({
        audioDeviceId: micId,
      })
      .then((infos) => {
        this._selectedMic = infos.mic;
      });
  }

  get selectedMic() {
    return this._selectedMic;
  }

  enableMic(enable: boolean) {
    this._daily.setLocalAudio(enable);
  }

  get isMicEnabled() {
    return this._daily.localAudio();
  }

  enableCam(enable: boolean) {
    this._daily.setLocalVideo(enable);
  }

  get isCamEnabled() {
    return this._daily.localVideo();
  }

  get expiry(): number | undefined {
    return this._expiry;
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
    this.state = "connecting";

    this.attachEventListeners();

    try {
      await this._daily.join({
        // TODO: Remove hardcoded Daily domain
        url: `https://rtvi.daily.co/${url}`,
        token,
      });
      // Get room expiry
      const room = await this._daily.room();
      if (room && "id" in room) {
        this._expiry = room.config?.exp;
      }
    } catch (e) {
      //@TODO: Error handling here
      console.error("Failed to join call", e);
      return;
    }

    // Instantiate audio processors
    this._localAudioLevelObserver = this.createAudioLevelProcessor(
      dailyParticipantToParticipant(this._daily.participants().local)
    );
    await this._daily.startLocalAudioLevelObserver(100);
    await this._daily.startRemoteParticipantsAudioLevelObserver(100);

    this.state = "connected";

    this._callbacks.onConnected?.();
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
    this._daily.on("app-message", this.handleAppMessage.bind(this));
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
    this._daily.off("app-message", this.handleAppMessage);
    this._daily.off("left-meeting", this.handleLeftMeeting);
  }

  async disconnect() {
    this._daily.stopLocalAudioLevelObserver();
    this._daily.stopRemoteParticipantsAudioLevelObserver();

    await this._daily.leave();

    this.detachEventListeners();
  }

  public sendMessage(message: VoiceMessage) {
    console.log("Sending message: ", message);
    this._daily.sendAppMessage(message, "*");
  }

  private handleAppMessage(ev: DailyEventObjectAppMessage) {
    // Bubble any messages with realtime-ai label
    if (ev.data.label === "rtvi") {
      this._onMessage({
        type: ev.data.type,
        data: ev.data,
      } as VoiceMessage);
    }
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
    this.state = "disconnected";
    this._botId = "";
    this._callbacks.onDisconnected?.();
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
