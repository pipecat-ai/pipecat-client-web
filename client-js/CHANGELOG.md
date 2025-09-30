# Changelog

All notable changes to **Pipecat Client JS** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added support for an optional `source` field in the `BotTranscript` events, indicating whether the transcript came from the LLM or the TTS.
- Introduced new `botStarted` callback to allow clients access to the return value from their start bot REST endpoint via a callback. This also opens up the ability to access this value when calling `startBotAndConnect()`.
- Added new `sendText()` method to support the new RTVI `send-text` event. The method takes a string, along with an optional set of options to control whether the bot should respond immediately and/or whether the bot should respond with audio (vs. text only). Note: This is a replacement for the current `appendToContext()` method and changes the default of `run_immediately` to `True`.

### Deprecated

- Deprecated `appendToContext()` in lieu of the new `sendText()` method. This sets a standard for future methods like `sendImage()`.

## [1.3.0]

### Added

- Add rest_helpers and utils to client-js library
- Added support for registering a generic callback for LLM function call events to maintain consistency and flexibility.
- Added two new `RTVIError` types:
  - `BotAlreadyStartedError`: thrown when a `startBot()`, `connect()`, or `startBotAndConnect()` are called after having already started/connected.
  - `InvalidTransportParamsError`: thrown on `connect()` when the provided `TransportConnectionParams` are invalid.
- Added `unregisterFunctionCallHandler()` and `unregisterAllFunctionCallHandlers()` for, well, unregistering registered function call handlers :).

### Fixed

- Fixed issue where devices would not initialize automatically when using `startBotAndConnect()`

## [1.2.0]

- Improved flexibility and clarity around `connect()`:
  - Renamed `ConnectionEndpoint` to `APIRequest` for clarity.
  - Deprecated use of `connect()` with a `ConnectionEndpoint` params type in favor of separating out the authorization step from the connection step. Uses of `connect()` with a `ConnectionEndpoint` should be updated to call `startBotAndConnect()` instead. See below.  `connect()` now performs only the portion of the logic for connecting the transport. If called with a `ConnectionEndpoint`, it will call `startBotAndConnect()` under the hood.
  - Introduced `startBot()` for performing just the endpoint POST for kicking off a bot process and optionally returning connection parameters required by the transport.
  - Introduced `startBotAndConnect()` which takes an `APIRequest` and calls both `startBot()` and `connect()`, passing any data returned from the `startBot()` endpoint to `connect()` as transport parameters.

## [1.1.0]

- Added support for handling errors with the local cam/mic/speaker by introducing a new PipecatClient callback, `onDeviceError`, and RTVI event, `deviceError`.

## [1.0.1]

- Added `TransportStateEnum` that provides the same values as the `TransportState` type, but as a runtime enum that can be used with Object.values() and other runtime operations.

## [1.0.0]

- RTVI 1.0 Protocol Updates:
  - client-ready/bot-ready messages now both include a version and about section
  - action-related messages have been removed (deprecated) in lieu of client-server messages and some built-in types
  - service configuration message have been removed (security concerns. should be replaced with custom client-server messages)
  - new client-message and server-response messages for custom messaging
  - new append-to-context message
  - All RTVI base types have moved to the new `rtvi` folder
- RTVIClient is now PipecatClient w/ changes to support the above RTVI Protocol updates
  - The constructor no longer takes `params` with pipeline configuration information or endpoint configuration
  - `connect()` now takes a set of parameters defined and needed by the transport in use. Or, alternatively, it takes an endpoint configuration to obtain the transport params.
  - REMOVED:
    - All actions-related methods and types: `action()`, `describeActions()`, `onActionsAvailable`, etc.
    - All configuration-related methods and types: `getConfig()`, `updateConfig()`, `describeConfig()`, `onConfig`, `onConfigDescribe`, etc.
    - All helper-related methods, types and files: `RTVIClientHelper`, `registerHelper`, `LLMHelper`, etc.
    - `transportExpiry()`
  - NEW:
    - built-in function call handling: `registerFunctionCallHandler()`
    - built-in ability to append to llm context: `appendToContext()`
    - ability to send a message and wait for a response: `sendClientRequest()`
    - added rtvi version and an about section to `client-ready` with information about the client platform, browser, etc.
    - `UnsupportedFeatureError`: A new error transports can throw for features they have not implemented or cannot support.
  - CHANGED:
    - sending a client message (send and forget style): `sendMessage()` -> `sendClientMessage()`
  - Added warning log on `bot-ready` if the server version < 1.0.0, indicating that rtvi communication problems are likely

## [0.4.1] - 2025-06-11

- Fixed state intialization for `useRTVIClientCamControl()` and `useRTVIClientMicControl()`

## [0.4.0] - 2025-06-03

- Updated transport wrapper to disallow calling `initDevices()` directly
- `useRTVIClientMediaDevices()` now automatically initializes its device state
- Added new hooks `useRTVIClientMicControl()` and `useRTVIClientCamControl()`
- Added new headless components `RTVIClientMicToggle` and `RTVIClientCamToggle`
- Added new props to `VoiceVisualizer` component: `barCount`, `barLineCap` and `barOrigin`
- Updated dependencies per `npm audit`

## [0.3.5] - 2025-03-20

- Added a getter to the client for getting the underlying transport. The transport that is returned is safe-guarded so that calls like `connect`/`disconnect` which should be called by the client are rejected.

- Added missing support for handling fatal transport errors. Transports should call the onError callback with a data field `fatal: true` to trigger an client disconnect.

- Improved action types for cleaner handling

## [0.3.4] - 2025-03-13

### Changes

- Changed transport initialization to only occur in the RTVIClient constructor and not in its `disconnect`. This allows Transports to better reason about and be in control of what happens in both the initialize and disconnect methods.

## [0.3.3] - 2025-02-28

### Added

- Added an `onBotLlmSearchResponse` callback and `BotLlmSearchResponse` event to correspond with `RTVIBotLLMSearchResponseMessage`.

- Added an `onServerMessage` callback and `ServerMessage` event to correspond with `RTVIServerMessage`.

## [0.3.2] - 2024-12-16

### Added

- Screen media sharing methods implemented:
  - Added `startScreenShare` and `stopScreenShare` methods to `RTVIClient` and `Transport`.
  - Added `isSharingScreen` getter to `RTVIClient` and `Transport`.

### Changes

- `baseUrl` and `endpoints` are now optional parameters in the `RTVIClient` constructor (`RTVIClientParams`), allowing developers to connect directly to a transport without requiring a handshake auth bundle.
  - Note: Most transport services require an API key for secure operation, and setting these keys dangerously on the client is not recommended for production. This change intends to simplify testing and local developement where running a server-side connect method can be cumbersome.

## [0.3.1] - 2024-12-10

### Fixed

- Incorrect package.lock version resulted in types being omitted from the previous build. This has been fixed (0.3.0 has been unpublished).

## [0.3.0] - 2024-12-10

### Changed

- The RTVI client web libraries are now part of Pipecat. Repo and directory names have changed from RTVI to Pipecat.
- Package names have also been updated:
  - `realtime-ai` is now `@pipecat-ai/client-js`
  - `realtime-ai-react` is now `@pipecat-ai/client-react`

Please update your imports to the new package names.

## [0.2.3] - 2024-12-09

### Fixed

- Added initial callback for `onSpeakerUpdated` event
- Fixed event name typo - `TrackedStopped` should be `TrackStopped`

## [0.2.2] - 2024-11-12

### Added

- `disconnectBot()` method added to `RTVIClient` that disconnects the bot from the session, but keeps the session alive for the connected user.
- `logger` singleton added and used within all `RTVIClient` files. This aims to provide more granular control over console output - with verbose logging enabled, RTVI can be a little noisy.
- `setLogLevel` method added to `RTVIClient` to allow developers to set the log level.
- `disconnectBot()` method added to `RTVIMessage` to allow developers to tell the bot to leave a session.

## [0.2.1] - 2024-10-28

### Removed

- `realtime-ai-daily` has been moved to [@daily-co/realtime-ai-daily](https://github.com/daily-co/realtime-ai-daily) to align to being a provider agnostic codebase. The last release for the Daily transport package is `0.2.0`, which is still available with `npm install realtime-ai-daily` (https://www.npmjs.com/package/realtime-ai-daily). Please update your project imports to the new package install.

### Changed

- `onBotText` callback renamed to `onBotLlmText` for consistency. `onBotText` has been marked as deprecated.
- `onUserText` callback and events removed as unused.
- `onBotLlmText` callback correctly accepts a `text:BotLLMTextData` typed parameter.
- `onBotTranscript` callback correctly accepts a `text:BotLLMTextData` typed parameter (previously `TranscriptData`)
- `botLlmStarted`, `botLlmStopped`, `botTtsStarted`, `botTtsStopped`, `onBotStartedSpeaking` and `onBotStoppedSpeaking` pass no parameters. Previously, these callbacks were given a participant object which was unused.
- `TTSTextData` type renamed to `BotTTSTextData` for consistency.

### Fixed

- `endpoints` is redefined as a partial, meaning you no longer receive a linting error when you only want to override a single endpoint.

## [0.2.0] - 2024-09-13

RTVI 0.2.0 removes client-side configuration, ensuring that state management is handled exclusively by the bot or the developer’s application logic. Clients no longer maintain an internal config array that can be modified outside of a ready state. Developers who require stateful configuration before a session starts should implement it independently.

This change reinforces a key design principle of the RTVI standard: the bot should always be the single source of truth for configuration, and RTVI clients should remain stateless.

Additionally, this release expands action capabilities, enabling disconnected action dispatch, and renames key classes and types from` VoiceClientX` to `RTVIClientX`. Where possible, we have left deprecated aliases to maintain backward compatibility.

### Added

- `params` client constructor option, a partial object that will be sent as JSON stringified body params at `connect()` to your hosted endpoint. If you want to declare initial configuration in your client, or specify start services on the client, you can declare them here.
  - baseUrl: string;
  - headers?: Headers;
  - endpoints?: connect | action;
  - requestData?: object;
  - config?: RTVIClientConfigOption[];
  - Any additional request params for all fetch requests, e.g. `[key: string]: unknown;`
- `endpoints` (as part of `params`) declares two default endpoints that are appended to your `baseUrl`. `connect/` (start a realtime bot session) and `/action` (for disconnect actions).
- `onConfig` and `RTVIEvent.Config` callback & event added, triggered by `getConfig` voice message.
- `@transportReady` decorator added to methods that should only be called at runtime. Note: decorator support required several Parcel configuration changes and additional dev dependencies.
- `@getIfTransportInState` getter decorator added to getter methods that should only be called in a specified transport state.
- `rtvi_client_version` is now sent as a body parameter to the `connect` fetch request, enabling bot <> client compatibility checks.
- `action()` will now function when in a disconnected state. When not connected, this method expects a HTTP streamed response from the `action` endpoint declared in your params.
- New callbacks and events:
  - `onBotTtsText` Bot TTS text output
  - `onBotTtsStarted` Bot TTS response starts
  - `onBotTtsStopped` Bot TTS response stops
  - `onBotText` Streaming chunk/word, directly after LLM
  - `onBotLlmStarted` Bot LLM response starts
  - `onBotLlmStopped` Bot LLM response stops
  - `onUserText` Aggregated user text which is sent to LLM
  - `onStorageItemStored` Item was stored to storage

### Changed

- `start()` has been renamed to `connect()`.
- Client no longer expects a `services` map as a constructor param (note: remains in place but flagged as deprecated.) If you want to pass a services map to your endpoint, please use `params`.
- `customHeaders` has been renamed to `headers`.
- Config getter and setter methods (`getConfig` and `updateConfig`) are only supported at runtime.
- `updateConfig` promise is typed to `Promise<VoiceMessage>` (previously `unknown` to support offline updates.)
- `getConfig` promise is typed to `Promise<VoiceClientOptions[]>` (previously `unknown` to support offline updates.)
- `services` getter and setter methods have been deprecated.
- `getServiceOptionsFromConfig`, `getServiceOptionValueFromConfig`, `setConfigOptions` and `setServiceOptionInConfig` are now async to support `getConfig` at runtime and accept an optional `config` param for working with local config arrays.
- `registerHelper` no longer checks for a registered service and instead relies on string matching.
- LLM Helper `getContext()` now accepts optional `config` param for working with local configs.
- `customAuthHandler` updated to receive `startParams` as second dependency.
- jest tests updated to reflect changes.
- `VoiceClientOptions` is now `RTVIClientOptions`.
- `VoiceClientConfigOption` is now `RTVIClientConfigOption`.
- `VoiceEvent` is now `RTVIEvent`.

### Fixed

- `RTVIMessageType.CONFIG` message now correctly calls `onConfig` and `RTIEvents.Config`.

### Deprecated

- `getBotConfig` has been renamed to `getConfig` to match the bot action name / for consistency.
- voiceClient.config getter is deprecated.
- `config` and `services` constructor params should now be set inside of `params` and are optional.
- `customBodyParams` and `customHeaders` have been marked as deprecated. Use `params` instead.

### Removed

- `RTVIClient.partialToConfig` removed (unused)
- `nanoid` dependency removed.

## [0.1.10] - 2024-09-06

- LLMContextMessage content not types to `unknown` to support broader LLM use-cases.

## [0.1.9] - 2024-09-04

### Changed

- `voiceClient.action()` now returns a new type `VoiceMessageActionResponse` that aligns to RTVI's action response shape. Dispatching an action is the same as dispatching a `VoiceMessage` except the messageDispatcher will type the response accordingly. `action-response` will resolve or reject as a `VoiceMessageActionResponse`, whereas any other message type is typed as a `VoiceMessage`. This change makes it less verbose to handle action responses, where the `data` blob will always contain a `result` property.
- LLM Helper `getContext` returns a valid promise return type (`Promise<LLMContext>`).
- LLMHelper `getContext` resolves with the action result (not the data object).
- LLMHelper `setContext` returns a valid promise return type (`Promise<boolean>`).
- LLMHelper `setContext` resolves with the action result boolean (not the data object).
- LLMHelper `appendToMessages` returns a valid promise return type (`Promise<boolean>`).
- LLMHelper `appendToMessages` resolves with the action result boolean (not the data object).

### Fixed

- `customAuthHandler` is now provided with the timeout object, allowing developers to manually clear it (if set) in response to their custom auth logic.
- `getServiceOptionsFromConfig` returns `unknown | undefined` when a service option is not found in the config definition.
- `getServiceOptionsValueFromConfig` returns `unknown | undefined` when a service option or value is not found in the config definition.
- `getServiceOptionValueFromConfig` returns a deep clone of the value, to avoid nested references.
- `VoiceMessageType.CONFIG_AVAILABLE` resolves the dispatched action, allowing `describeConfig()` to be awaited.
- `VoiceMessageType.ACTIONS_AVAILABLE` resolves the dispatched action, allowing `describeActions()` to be awaited.

### Added

- Action dispatch tests

## [0.1.8] - 2024-09-02

### Fixed

- `getServiceOptionsFromConfig` and `getServiceOptionValueFromConfig` return a deep clone of property to avoid references in returned values.
- LLM Helper `getContext` now returns a new instance of context when not in ready state.

### Changed

- `updateConfig` now calls the `onConfigUpdated` callback (and event) when not in ready state.

## [0.1.7] - 2024-08-28

### Fixed

- All config mutation methods (getServiceOptionsFromConfig, getServiceOptionValueFromConfig, setServiceOptionInConfig) now work when not in a ready state.

### Added

- New config method: `getServiceOptionValueFromConfig`. Returns value of config service option with passed service key and option name.
- setServiceOptionInConfig now accepts either one or many ConfigOption arguments (and will set or update all)
- setServiceOptionInConfig now accepts an optional 'config' param, which it will use over the default VoiceClient config. Useful if you want to mutate an existing config option across multiple services before calling `updateConfig`.
- New config method `setConfigOptions` updates multiple service options by running each item through `setServiceOptionInConfig`.

### Fixed

- "@daily-co/daily-js" should not be included in the `rtvi-client-js` package.json. This dependency is only necessary for `rtvi-client-js-daily`.
- Jest unit tests added for config manipulation within `rtvi-client-js` (`yarn run test`)

## [0.1.6] - 2024-08-26

### Fixed

- `getServiceOptionsFromConfig` should return a new object, not an instance of the config. This prevents methods like `setContext` from mutating local config unintentionally.

## [0.1.5] - 2024-08-19

### Added

- Client now sends a `client-ready` message once it receives a track start event from the transport. This avoids scenarios where the bot starts speaking too soon, before the client has had a change to subscribe to the audio track.

## [0.1.4] - 2024-08-19

### Added

- VoiceClientVideo component added to `rtvi-client-react` for rendering local or remote video tracks
- partialToConfig voice client method that returns a new VoiceClientConfigOption[] from provided partial. Does not update config.

### Fixed

- Fixes an issue when re-creating a DailyVoiceClient. Doing so will no longer result in throwing an error. Note: Simultaneous DailyVoiceClient instances is not supported. Creating a new DailyVoiceClient will invalidate any pre-existing ones.

## [0.1.3] - 2024-08-17

### Added

- `setServiceOptionsInConfig` Returns mutated / merged config for specified key and service config option
- Voice client constructor `customBodyParams:object`. Add custom request parameters to send with the POST request to baseUrl
- Set voice client services object (when client has not yet connected)

### Fixed

- Pass timeout to customAuthHandler

## [0.1.2] - 2024-08-16

- API refactor to align to RTVI 0.1
