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
  await pcClient.connect({ endpoint: "https://your-connect-end-point-here/connect" });
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

## API

Please see API reference [here](https://docs.pipecat.ai/client/reference/js/introduction).
