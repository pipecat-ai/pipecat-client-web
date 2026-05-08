<h1><div align="center">
 <img alt="pipecat js" width="500px" height="auto" src="https://raw.githubusercontent.com/pipecat-ai/pipecat-client-web/main/pipecat-js.png">
</div></h1>

[![Docs](https://img.shields.io/badge/documentation-blue)](https://docs.pipecat.ai/client/introduction)
![NPM Version](https://img.shields.io/npm/v/@pipecat-ai/client-js)

## Install

```bash
yarn add @pipecat-ai/client-js
# or
npm install @pipecat-ai/client-js
```

## Quick Start

Instantiate a `PipecatClient` instance, wire up the bot's audio, and start the conversation:

```ts
import { RTVIEvent, RTVIMessage, PipecatClient } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";

const pcClient = new PipecatClient({
  transport: new DailyTransport(),
  enableMic: true,
  enableCam: false,
  callbacks: {
    onConnected: () => {
      console.log("[CALLBACK] User connected");
    },
    onDisconnected: () => {
      console.log("[CALLBACK] User disconnected");
    },
    onTransportStateChanged: (state: string) => {
      console.log("[CALLBACK] State change:", state);
    },
    onBotConnected: () => {
      console.log("[CALLBACK] Bot connected");
    },
    onBotDisconnected: () => {
      console.log("[CALLBACK] Bot disconnected");
    },
    onBotReady: () => {
      console.log("[CALLBACK] Bot ready to chat!");
    },
  },
});

try {
  await pcClient.startBotAndConnect({ endpoint: "https://your-connect-end-point-here/connect" });
} catch (e) {
  console.error(e.message);
}

// Events
pcClient.on(RTVIEvent.TransportStateChanged, (state) => {
  console.log("[EVENT] Transport state change:", state);
});
pcClient.on(RTVIEvent.BotReady, () => {
  console.log("[EVENT] Bot is ready");
});
pcClient.on(RTVIEvent.Connected, () => {
  console.log("[EVENT] User connected");
});
pcClient.on(RTVIEvent.Disconnected, () => {
  console.log("[EVENT] User disconnected");
});
```

## UI Agent Protocol (v1)

`PipecatClient` is the primary client-side entry point for the UI Agent Protocol, paired with the `UIAgent` class in [`pipecat-subagents`](https://github.com/pipecat-ai/pipecat-subagents) on the Python side. It lets a server-side agent observe the page (via the streamed accessibility snapshot) and drive it (via named UI commands and structured events).

```ts
import { PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";

const pcClient = new PipecatClient({
  transport: ...,
  callbacks: {
    onUICommand: (data) => {
      if (data.command === "toast") showToast(data.payload);
    },
    onUITask: (data) => updateTaskProgress(data),
  },
});

// Server-to-client commands (e.g. "scroll the user to this ref",
// "highlight this element", or any app-defined command).
const onUICommand = (data) => {
  if (data.command === "toast") showToast(data.payload);
};
pcClient.on(RTVIEvent.UICommand, onUICommand);

// Server-to-client task lifecycle envelopes.
pcClient.on(RTVIEvent.UITask, (data) => {
  updateTaskProgress(data);
});

// Client-to-server events (e.g. a click that should bypass the LLM).
button.addEventListener("click", () => {
  pcClient.sendUIEvent("nav_click", { view: "home" });
});

// Stream accessibility snapshots so the server agent can see what's
// on screen. Auto-fires on DOM mutations, focus, scroll, resize.
pcClient.startUISnapshotStream({ debounceMs: 200 });
```

The wire format includes typed envelopes for the long-running task lifecycle (`group_started`, `task_update`, `task_completed`, `group_completed`); use `client.on(RTVIEvent.UITask, ...)` to observe them and `cancelUITask(...)` to cancel an in-flight task group. `A11ySnapshotStreamer` remains exported as a low-level implementation API. See the package CHANGELOG for the full v1 entry.

## API

Please see API reference [here](https://docs.pipecat.ai/client/reference/js/introduction).
