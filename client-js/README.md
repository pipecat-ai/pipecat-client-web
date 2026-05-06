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

`UIAgentClient` and `A11ySnapshotStreamer` are the client-side primitives for the UI Agent Protocol, paired with the `UIAgent` class in [`pipecat-subagents`](https://github.com/pipecat-ai/pipecat-subagents) on the Python side. They let a server-side agent observe the page (via the streamed accessibility snapshot) and drive it (via named UI commands and structured events).

```ts
import { PipecatClient, UIAgentClient, A11ySnapshotStreamer } from "@pipecat-ai/client-js";

const pcClient = new PipecatClient({ transport: ... });

// One UIAgentClient per PipecatClient. attach() subscribes to the
// UI command/task channels; the returned detach is symmetric.
const uiAgent = new UIAgentClient(pcClient);
const detach = uiAgent.attach();

// Server-to-client commands (e.g. "scroll the user to this ref",
// "highlight this element", or any app-defined command).
uiAgent.registerCommandHandler("toast", (payload) => {
  showToast(payload.title, payload.description);
});

// Client-to-server events (e.g. a click that should bypass the LLM).
button.addEventListener("click", () => {
  uiAgent.sendEvent("nav_click", { view: "home" });
});

// Stream accessibility snapshots so the server agent can see what's
// on screen. Auto-fires on DOM mutations, focus, scroll, resize.
const streamer = new A11ySnapshotStreamer(uiAgent, { debounceMs: 200 });
streamer.start();
```

The wire format includes typed envelopes for the long-running task lifecycle (`group_started`, `task_update`, `task_completed`, `group_completed`); see `addTaskListener(...)` and `cancelTask(...)` on `UIAgentClient`. See the package CHANGELOG for the full v1 entry.

## API

Please see API reference [here](https://docs.pipecat.ai/client/reference/js/introduction).
