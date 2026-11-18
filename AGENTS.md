# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Repository

npm-workspaces monorepo for the Pipecat web client SDK (the client side of the RTVI protocol spoken by the Python [Pipecat](https://github.com/pipecat-ai/pipecat) server):

- `client-js/` → `@pipecat-ai/client-js`: framework-agnostic TypeScript client.
- `client-react/` → `@pipecat-ai/client-react`: React provider, hooks, and components built on `client-js`.

Concrete transports (Daily, WebSocket, SmallWebRTC, …) are **not** in this repo; they live in `pipecat-ai/pipecat-client-web-transports` and subclass `Transport` from `client-js`.

## Commands

Use npm (the repo has `package-lock.json` and CI runs `npm install`; the README's `yarn` instructions are stale).

```bash
npm install
npm run build                      # builds both packages (client-js first)
npm test --workspaces --if-present # what CI runs

npm test -w client-js              # or -w client-react
npm run lint -w client-js          # eslint, --max-warnings 0
npm run typecheck -w client-js     # tsc, with the checks in tests/rtvi_types.ts (Jest doesn't type-check)
npm run dev -w client-js           # parcel watch

# single file / single test
npm test -w client-react -- tests/conversation/integration/userInput.test.tsx
npm test -w client-js -- tests/client.spec.ts -t "part of test name"

# RTVI protocol document: copy it from Pipecat's main (or --ref <tag>, or --pipecat <checkout>) and regenerate
npm run rtvi:sync -w client-js
npm run rtvi:generate -w client-js
```

- Builds use Parcel (`parcel build --no-cache`), outputting CJS + ESM + `.d.ts` to each package's `dist/`.
- `client-js`'s `build` script runs the full Jest suite before bundling, so a failing test fails the build.
- Tests are Jest + ts-jest in jsdom. `client-react`'s Jest config maps `@pipecat-ai/client-js` to `../client-js/index.ts` (source), so React tests see client-js changes without rebuilding. Building or type-checking `client-react` resolves the workspace package's `dist/`, so rebuild `client-js` first.
- The pre-commit hook runs `lint-staged` (eslint on staged TS files). Prettier config is in `.prettierrc`.

## Commits, PRs, releases

- Conventional Commits; allowed scopes are `client-js`/`js`, `client-react`/`react`, or none. CI (`lint-commits`) requires at least one conventional commit per PR. Use `!` for breaking changes.
- Releases are driven by release-please per package (`release-please-config.json`), tagged per component. PR descriptions carry a `## Release Notes` section (see `.github/pull_request_template.md`) whose bullets, grouped by package and `####` category, are copied verbatim into the CHANGELOGs by `.github/scripts/curate-release-notes.mjs`. The project's `pr-description` skill writes these.
- When a PR touching `client-js/**` or `client-react/src/**` merges, `update-docs.yml` opens a docs PR in `pipecat-ai/docs` using `.claude/skills/update-docs/SOURCE_DOC_MAPPING.md`. Update that mapping when adding a new public source file or moving where an API is documented.

## Architecture

### client-js

- **`PipecatClient`** (`client/client.ts`) is a typed `EventEmitter` (`RTVIEvents`). Every event is delivered two ways: the constructor's `callbacks` option and `.on(RTVIEvent.X)`. The constructor builds `wrappedCallbacks` that call the user's callback and then `emit`, and hands those to the transport via `transport.initialize(options, handleMessage)`.
- **`Transport`** (`client/transport.ts`) is the abstract base that transports implement: device management, `_connect`/`_disconnect`, `sendMessage`, tracks. The transport invokes lifecycle/media callbacks directly and forwards every inbound RTVI message to `PipecatClient.handleMessage`, a `switch` over `RTVIMessageType` that maps messages to callbacks/events. `client.transport` returns a `TransportWrapper` proxy, not the raw instance.
- **`MessageDispatcher`** (`client/dispatcher.ts`) implements request/response over RTVI: it queues outbound messages by id, resolves them on `server-response`/`error-response`, and garbage-collects them on timeout.
- **Decorators** (`client/decorators.ts`): `@transportReady`, `@transportInState([...])`, and similar guards make public methods throw when called in the wrong transport state.
- **Protocol document**: `rtvi/spec/<version>/rtvi.asyncapi.json` is Pipecat's AsyncAPI document of the RTVI protocol, for the version `RTVI_PROTOCOL_VERSION` names, and `rtvi/generated/protocol.ts` holds the types generated from it by `scripts/rtvi-protocol.mjs`: each message's data, the message types by direction, and each server message's setting, minimum client version and deprecation. Neither is edited by hand, and `tests/rtvi_protocol.spec.ts` fails when the generated file is out of date or the versions differ. Every generated name starts with `Protocol`, so none matches a public type's name, which Parcel's declaration bundler can't always tell apart. The generated types aren't exported from the package: the public types in `rtvi/messages.ts` are built on them, as aliases where the document describes a type fully, and as the generated type plus the fields older bots send where it doesn't. A public type stays hand-written where client-js accepts more than the wire, such as `URL`s for files. `tests/rtvi_document.spec.ts` checks client-js against the document: every server message is handled or listed in `IGNORED` with a reason, each example reaches the app (also with a field it doesn't know), and every message client-js sends matches its schema. `tests/rtvi_types.ts` checks at compile time that each public message type accepts what the server sends and that what the client builds matches what the server accepts, with known differences listed in `Known`. A new message in the document fails these until it's handled or listed. The `update-rtvi` skill carries a new protocol version that Pipecat released through client-js.
- **`rtvi/`** is the protocol definition and most of the public API: `messages.ts` (`RTVIMessageType`, payload types, `RTVI_PROTOCOL_VERSION`, client-ready/about-client), `events.ts` (`RTVIEvent` enum + `RTVIEvents` signatures), `errors.ts`, `common_types.ts` (transport state, `MediaState`), `ui.ts` (UI Worker Protocol types).
- Adding a new server→client message usually touches all of: the `RTVIMessageType` and data type in `rtvi/messages.ts`, `RTVIEvent` and `RTVIEvents` in `rtvi/events.ts`, `RTVIEventCallbacks` plus the wrapped callback in `client.ts`, and a `case` in `handleMessage`.
- Behavior depends on the bot's protocol version and capabilities, which are parsed from `bot-ready` (`_botVersion`, `_botCapabilities`), e.g. gating `BotOutput` support and `sendFile`. Deprecated events and callbacks stay in place, marked `@deprecated` and pointing at their replacements, with one-time warnings.
- **UI Worker Protocol**: `A11ySnapshotStreamer` and `rtvi/a11y_walker.ts` serialize the DOM's accessibility tree into `ui-snapshot` messages. The client sends `ui-event`s and receives `ui-command` / `ui-job-group` messages.

### client-react

- `PipecatClientProvider` takes a `PipecatClient` and nests a Jotai `Provider` (an optional external `jotaiStore` can be passed in), an `RTVIEventContext` that fans events out to `useRTVIClientEvent`, and state providers for transport state, media state, media support, bot capabilities, and conversation.
- **Conversation** (`src/conversation/`) is the most intricate part of the package. `useConversationEventWiring` subscribes to RTVI events and calls pure `(get, set, …)` reducer-style functions in `conversationActions.ts`, which mutate Jotai atoms in `conversationAtoms.ts`. It assembles user turns (from `UserInput`/transcripts), bot turns (from `BotOutput`, legacy vs. v2 protocol chosen at `BotReady`, with spoken/unspoken cursors in `botOutput.ts`), function-call lifecycle, backchannels, interruptions, and sent-text status. `usePipecatConversation` is the public read API. Because the action functions take `get`/`set`, tests can drive them without React.
- Conversation tests use a scenario DSL (`tests/conversation/helpers/conversationDSL.ts`, `storeHarness.ts`) to script event sequences against a Jotai store. Prefer extending it over hand-rolling event sequences.
- UI Worker Protocol bindings: `UIJobGroupsProvider`, `useUIEventSender`, `useUICommandHandler`, `useUISnapshot`, and opt-in DOM handlers in `defaultUICommandHandlers.ts`.
- Inside `client-react`, the `@/…` import alias maps to `src/` (tsconfig `paths` and the Jest `moduleNameMapper`).
