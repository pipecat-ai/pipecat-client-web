<h1><div align="center">
 <img alt="pipecat react" width="500px" height="auto" src="https://raw.githubusercontent.com/pipecat-ai/pipecat-client-web/main/pipecat-react.png">
</div></h1>

[![Docs](https://img.shields.io/badge/documentation-blue)](https://docs.pipecat.ai/client/introduction)
![NPM Version](https://img.shields.io/npm/v/@pipecat-ai/client-react)

## Install

```bash
npm install @pipecat-ai/client-js @pipecat-ai/client-react
```

## Quick Start

Instantiate a `PipecatClient` instance and pass it down to the `PipecatClientProvider`. Render the `<PipecatClientAudio>` component to have audio output setup automatically.

```tsx
import { PipecatClient } from "@pipecat-ai/client-js";
import { PipecatClientAudio, PipecatClientProvider } from "@pipecat-ai/client-react";

const client = new PipecatClient({
  transport: myTransportType.create(),
});

render(
  <PipecatClientProvider client={client}>
    <MyApp />
    <PipecatClientAudio />
  </PipecatClientProvider>
);
```

We recommend starting the voiceClient from a click of a button, so here's a minimal implementation of `<MyApp>` to get started:

```tsx
import { usePipecatClient } from "@pipecat-ai/client-react";

const MyApp = () => {
  const client = usePipecatClient();
  return <button onClick={() => client.start()}>OK Computer</button>;
};
```

## Components

### PipecatClientProvider

The root component for providing Pipecat client context to your application.

#### Props

- `client` (PipecatClient, required): A singleton instance of PipecatClient.

```jsx
<PipecatClientProvider client={pcClient}>
  {/* Child components */}
</PipecatClientProvider>
```

### PipecatClientAudio

Creates a new `<audio>` element that mounts the bot's audio track.

#### Props

No props

```jsx
<PipecatClientAudio />
```

### PipecatClientVideo

Creates a new `<video>` element that renders either the bot or local participant's video track.

#### Props

- `participant` ("local" | "bot"): Defines which participant's video track is rendered
- `fit` ("contain" | "cover", optional): Defines whether the video should be fully contained or cover the box. Default: 'contain'.
- `mirror` (boolean, optional): Forces the video to be mirrored, if set.
- `onResize(dimensions: object)` (function, optional): Triggered whenever the video's rendered width or height changes. Returns the video's native `width`, `height` and `aspectRatio`.

```jsx
<PipecatClientVideo
  participant="local"
  fit="cover"
  mirror
  onResize={({ aspectRatio, height, width }) => {
    console.log("Video dimensions changed:", { aspectRatio, height, width });
  }}
/>
```

### PipecatClientCamToggle

This is a stateful headless component and exposes the user's camEnabled state and an `onClick` handler to toggle the state.

#### Props

- `onCamEnabledChanged(enabled: boolean)` (function, optional): Triggered when the user's camEnabled state changes
- `disabled` (boolean, optional): Disables the cam toggle

```jsx
<PipecatClientCamToggle>
  {({ disabled, isCamEnabled, onClick }) => (
    <button disabled={disabled} onClick={onClick}>
      {isCamEnabled ? "Turn off" : "Turn on"} camera
    </button>
  )}
</PipecatClientCamToggle>
```

### PipecatClientMicToggle

This is a stateful headless component and exposes the user's micEnabled state and an `onClick` handler to toggle the state.

#### Props

- `onMicEnabledChanged(enabled: boolean)` (function, optional): Triggered when the user's micEnabled state changes
- `disabled` (boolean, optional): Disables the mic toggle

```jsx
<PipecatClientMicToggle>
  {({ disabled, isMicEnabled, onClick }) => (
    <button disabled={disabled} onClick={onClick}>
      {isMicEnabled ? "Mute" : "Unmute"} microphone
    </button>
  )}
</PipecatClientMicToggle>
```

### VoiceVisualizer

Renders a visual representation of audio input levels on a `<canvas>` element.
The visualization consists of vertical bars.

#### Props

- `participantType` (string, required): The participant type to visualize audio for.
- `backgroundColor` (string, optional): The background color of the canvas. Default: 'transparent'.
- `barColor` (string, optional): The color of the audio level bars. Default: 'black'.
- `barCount` (number, optional): The amount of bars to render. Default: 5
- `barGap` (number, optional): The gap between bars in pixels. Default: 12.
- `barLineCap` ('round' | 'square', optional): The line cap for each bar. Default: 'round'
- `barOrigin` ('bottom' | 'center' | 'top', optional): The origin from where the bars grow to full height. Default: 'center'
- `barWidth` (number, optional): The width of each bar in pixels. Default: 30.
- `barMaxHeight` (number, optional): The maximum height at full volume of each bar in pixels. Default: 120.

```jsx
<VoiceVisualizer
  participantType="local"
  backgroundColor="white"
  barColor="black"
  barGap={1}
  barWidth={4}
  barMaxHeight={24}
/>
```

## Hooks

### usePipecatClient

Provides access to the `PipecatClient` instance originally passed to [`PipecatClientProvider`](#rtviclientprovider).

```jsx
import { usePipecatClient } from "@pipecat-ai/client-react";

function MyComponent() {
  const pcClient = usePipecatClient();
}
```

### useRTVIClientEvent

Allows subscribing to RTVI events.
It is advised to wrap handlers with `useCallback`.

#### Arguments

- `event` (RTVIEvent, required)
- `handler` (function, required)

```jsx
import { useCallback } from "react";
import { RTVIEvent, TransportState } from "@pipecat-ai/client-js";
import { useRTVIClientEvent } from "@pipecat-ai/client-react";

function EventListener() {
  useRTVIClientEvent(
    RTVIEvent.TransportStateChanged,
    useCallback((transportState: TransportState) => {
      console.log("Transport state changed to", transportState);
    }, [])
  );
}
```

### usePipecatClientCamControl

Allows to control the user's camera state.

```jsx
import { usePipecatClientCamControl } from "@pipecat-ai/client-react";

function CustomCamToggle() {
  const { enableCam, isCamEnabled } = usePipecatClientCamControl();
}
```

### usePipecatClientMicControl

Allows to control the user's microphone state.

```jsx
import { usePipecatClientMicControl } from "@pipecat-ai/client-react";

function CustomMicToggle() {
  const { enableMic, isMicEnabled } = usePipecatClientMicControl();
}
```

### usePipecatClientMediaDevices

Manage and list available media devices.

```jsx
import { usePipecatClientMediaDevices } from "@pipecat-ai/client-react";

function DeviceSelector() {
  const {
    availableCams,
    availableMics,
    selectedCam,
    selectedMic,
    updateCam,
    updateMic,
  } = usePipecatClientMediaDevices();

  return (
    <>
      <select
        name="cam"
        onChange={(ev) => updateCam(ev.target.value)}
        value={selectedCam?.deviceId}
      >
        {availableCams.map((cam) => (
          <option key={cam.deviceId} value={cam.deviceId}>
            {cam.label}
          </option>
        ))}
      </select>
      <select
        name="mic"
        onChange={(ev) => updateMic(ev.target.value)}
        value={selectedMic?.deviceId}
      >
        {availableMics.map((mic) => (
          <option key={mic.deviceId} value={mic.deviceId}>
            {mic.label}
          </option>
        ))}
      </select>
    </>
  );
}
```

### usePipecatClientMediaTrack

Access audio and video tracks.

#### Arguments

- `trackType` ("audio" | "video", required)
- `participantType` ("bot" | "local", required)

```jsx
import { usePipecatClientMediaTrack } from "@pipecat-ai/client-react";

function MyTracks() {
  const localAudioTrack = usePipecatClientMediaTrack("audio", "local");
  const botAudioTrack = usePipecatClientMediaTrack("audio", "bot");
}
```

### usePipecatClientTransportState

Returns the current transport state.

```jsx
import { usePipecatClientTransportState } from "@pipecat-ai/client-react";

function ConnectionStatus() {
  const transportState = usePipecatClientTransportState();
}
```
