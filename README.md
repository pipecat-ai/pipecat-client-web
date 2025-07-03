<h1><div align="center">
 <img alt="pipecat client web" width="500px" height="auto" src="https://raw.githubusercontent.com/pipecat-ai/pipecat-client-web/main/pipecat-web.png">
</div></h1>

[![Docs](https://img.shields.io/badge/documentation-blue)](https://docs.pipecat.ai/client/introduction)
![NPM Version](https://img.shields.io/npm/v/@pipecat-ai/client-js)

The official web client SDK for [Pipecat](https://github.com/pipecat-ai/pipecat), an open source Python framework for building voice and multimodal AI applications.

## Overview

This monorepo contains two packages:

- `client-js`: JavaScript/TypeScript SDK for connecting to and communicating with Pipecat servers
- `client-react`: React components and hooks for building Pipecat applications

The SDK handles:

- Device and media stream management
- Managing bot configuration
- Sending generic actions to the bot
- Handling bot messages and responses
- Managing session state and errors

To connect to a bot, you will need both this SDK and a transport implementation.

It’s also recommended for you to stand up your own server-side endpoints to handle authentication, and passing your bot process secrets (such as service API keys, etc) that would otherwise be compromised on the client.

The entry point for creating a client can be found via:

- [Pipecat JS](/client-js/) `@pipecat-ai/client-js`

React context, hooks and components:

- [Pipecat React](/client-react/) `@pipecat-ai/client-react`

**Transport packages:**

For connected use-cases, you must pass a transport instance to the constructor for your chosen protocol or provider.

For example, if you were looking to use WebRTC as a transport layer, you may use a provider like [Daily](https://daily.co). In this scenario, you’d construct a transport instance and pass it to the client accordingly:

```ts
import { PipecatClient } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";

const pcClient = new PipecatClient({
  transport: new DailyTransport(),
});
```

All Pipecat SDKs require a media transport for sending and receiving audio and video data over the Internet. Pipecat Web does not include any transport capabilities out of the box, so you will need to install the package for your chosen provider.

All transport packages (such as `DailyTransport`) extend from the Transport base class. You can extend this class if you are looking to implement your own or add additional functionality.

## Install

Install the Pipecat JS client library

```bash
npm install @pipecat-ai/client-js
```

Optionally, install the React client library

```bash
npm install @pipecat-ai/client-react
```

Lastly, install a transport layer, like Daily

```bash
npm install @pipecat-ai/daily-transport
```

## Quickstart

To connect to a bot, you will need both this SDK and a transport implementation.

It’s also recommended for you to stand up your own server-side endpoints to handle authentication, and passing your bot process secrets (such as service API keys, etc) that would otherwise be compromised on the client.

#### Starter projects:

Creating and starting a session with RTVI Web (using Daily as transport):

```typescript
import { PipecatClient, RTVIEvent, RTVIMessage } from "@pipecat-ai/client-js";
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
  await pcClient.connect({ endpoint: "https://your-server-side-url/connect" });
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

## Documentation

Pipecat Client Web implements a client instance that:

- Provides methods that handle the connectivity state and realtime interaction with your bot service.
- Manages media transport (such as audio and video).
- Provides callbacks and events for handling bot messages.
- Optionally facilitates server startup and connection via an endpoint you provide.

Docs and API reference can be found at https://docs.pipecat.ai/client/introduction.

## Hack on the framework

Install a provider transport

```bash
yarn
yarn workspace @pipecat-ai/client-js build
```

Watch for file changes:

```bash
yarn workspace @pipecat-ai/client-js run dev
```

## Contributing

We welcome contributions from the community! Whether you're fixing bugs, improving documentation, or adding new features, here's how you can help:

- **Found a bug?** Open an [issue](https://github.com/pipecat-ai/pipecat-client-web/issues)
- **Have a feature idea?** Start a [discussion](https://discord.gg/pipecat)
- **Want to contribute code?** Check our [CONTRIBUTING.md](CONTRIBUTING.md) guide
- **Documentation improvements?** [Docs](https://github.com/pipecat-ai/docs) PRs are always welcome

Before submitting a pull request, please check existing issues and PRs to avoid duplicates.

We aim to review all contributions promptly and provide constructive feedback to help get your changes merged.

## Getting help

➡️ [Join our Discord](https://discord.gg/pipecat)

➡️ [Read the docs](https://docs.pipecat.ai)

➡️ [Reach us on X](https://x.com/pipecat_ai)
