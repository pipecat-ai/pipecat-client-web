---
name: update-rtvi
description: Bring client-js up to a new RTVI protocol version that Pipecat released, from syncing its AsyncAPI document to handling every change it brings
---

Bring client-js up to a new version of the RTVI protocol. Pipecat publishes an AsyncAPI document for each protocol version; client-js keeps the one for the version it speaks and generates its protocol types from it. This skill syncs the new document, lists what changed, and carries each change through client-js the way the existing messages are handled.

`AGENTS.md` describes the document, the generator and the tests that check client-js against it. Read its "Protocol document" entry first.

## Arguments

```
/update-rtvi [VERSION]
```

- `VERSION` (optional): the protocol version to move to, such as `2.4.0`. Without it, use the newest version in Pipecat's `released.json`.

## Instructions

Paths below are relative to `client-js/`.

### Step 1: Find the version

Read the protocol versions Pipecat has released, with the Pipecat release that first shipped each:

```bash
curl -s https://raw.githubusercontent.com/pipecat-ai/pipecat/main/src/pipecat/processors/frameworks/rtvi/spec/released.json
```

Compare with `RTVI_PROTOCOL_VERSION` in `rtvi/messages.ts`. When client-js already speaks the newest version, or `VERSION`, stop and say so.

A version that isn't in `released.json` hasn't shipped, and its document can still change: only move to it if the developer asks, syncing from `main`.

### Step 2: Sync the document

Keep the current document for the comparison in Step 3, then bump the version and sync from the Pipecat release that shipped it (its `pipecat` value, as a tag: `1.18.0` is `v1.18.0`):

```bash
cp rtvi/spec/<old>/rtvi.asyncapi.json /tmp/rtvi-<old>.json
# set RTVI_PROTOCOL_VERSION in rtvi/messages.ts to <new>, and update the version comment above it
npm run rtvi:sync -- --ref v<pipecat release>
git rm -r rtvi/spec/<old>
```

The sync writes `rtvi/spec/<new>/rtvi.asyncapi.json` and regenerates `rtvi/generated/protocol.ts`. client-js keeps only the document of the version it speaks.

### Step 3: List what changed

Compare the two documents and list each change a client sees, by kind:

- **Messages** added or removed, by direction (`receiveClientMessages` is what clients send, `sendServerMessages` what the server sends).
- **Fields** added, removed, or made optional or required; enum and `const` values added.
- **Deprecations**: a message's `x-rtvi-deprecated`, a field's `deprecated: true`.
- **Gating**: a message's `x-rtvi-min-client-version` and `x-rtvi-enabled-by`.
- **Behaviors**: entries of `x-rtvi-behaviors` added or changed.

A short script that loads both documents and compares `components.messages`, `components.schemas` and `x-rtvi-behaviors` is the reliable way; don't eyeball a diff of the JSON. Show the list to the developer before editing anything.

### Step 4: Let the tests point at the work

```bash
npm test
npm run typecheck
```

- `tests/rtvi_document.spec.ts` fails for each server message client-js doesn't handle, for each message type it knows that the document doesn't have, and for each message it sends that no longer matches its schema.
- `tests/rtvi_types.ts`, through `npm run typecheck`, names each public type that no longer accepts what the server sends, or that builds what the server doesn't accept.

Every failure should be on the Step 3 list. One that isn't means the list missed a change: go back to Step 3.

### Step 5: Carry each change through

Follow the code that already handles the same kind of change.

**A new server message.** Agree on its event name and payload with the developer first; they're public API. Then add:

- its `RTVIMessageType` value, and its data type in `rtvi/messages.ts`: an alias of the generated type, named after the existing ones (`AudioLevelData = ProtocolAudioLevelMessageData`);
- its `RTVIEvent` value and `RTVIEvents` signature in `rtvi/events.ts`;
- its `RTVIEventCallbacks` entry and wrapped callback in `client/client.ts`, and its `case` in `handleMessage`;
- its entry in `ServerData` in `tests/rtvi_types.ts`;
- a test in `tests/client.spec.ts` that the callback and the event both get the data, in the table style the existing messages use.

The event's and callback's JSDoc say what the message means, and, for a message with `x-rtvi-enabled-by`, that the bot sends it only when enabled, naming the setting. The bot-audio-level and system-log events are examples. To leave a message out instead, list it in `IGNORED` in `tests/rtvi_document.spec.ts` with the reason, only when the developer decides so.

**A new client message.** Agree on the public method with the developer first. A bot older than the new version doesn't accept it, so the method raises `RTVIErrors.UnsupportedFeatureError` for one, checking `_botVersion` as `_assertBotSupportsSendFile` does. Add a test of both cases, and check the message matches its schema: the client-message test in `tests/rtvi_document.spec.ts` lists the messages it sends.

**A new field in an existing message.** A public type that is an alias of a generated type has it already. A hand-written one gets it added, with its description from the document; `npm run typecheck` names the type when the field's absence makes it disagree. A field only newer bots send is optional for the app, since older bots leave it out.

**A field the new version removes or tightens.** Older bots still send the old form, so the public type keeps it: the generated type plus the old field, as `BotOutputData` keeps `spoken`. Keep any fallback in the client for the old form.

**A deprecated message or field.** Mark the event, the callback and the field `@deprecated`, naming the replacement. For a deprecated event, warn once when an app subscribes to it, as `onBotTranscript` does. Keep handling it: older bots still send it.

**A new or changed behavior.** Read its description and check the client code that relies on it, such as `MessageDispatcher` for answers carrying a request's `id`, or the conversation code in client-react for the order of `bot-output` messages. Change the code only when the behavior asks something new of the client.

### Step 6: Verify

```bash
npm test
npm run typecheck
npx eslint . --ignore-pattern dist --report-unused-disable-directives --max-warnings 0
npm run build
npx tsc --noEmit --strict dist/index.d.ts
npm test -w client-react        # from the repo root
```

The type check of `dist/index.d.ts` matters: Parcel bundles the declarations, and a type that is fine in the sources can come out broken there, such as an alias referring to itself. Generated names start with `Protocol` to avoid that; keep public names from starting with it.

When a test fails, find out what it means before changing it. In particular, don't move a message into `IGNORED`, or a type into `Known` in `tests/rtvi_types.ts`, to make a test pass.

### Step 7: Summary

Report, for the PR:

```markdown
## RTVI protocol <old> → <new>

- **Changes**: <the Step 3 list>.
- **client-js**: <each change and how client-js handles it: new events and callbacks, new methods, fields, deprecations>.
- **Left out**: <messages added to IGNORED, with the developer's reason, or "none">.
```

Then draft the PR's `## Release Notes` section with the `pr-description` skill: each new event, callback or method is an addition, each deprecation a deprecation.

## Guardrails

- Never edit `rtvi/spec/` or `rtvi/generated/` by hand: sync and regenerate.
- Never drop support for older bots: their fields, messages and fallbacks stay.
- Never add public API (an event, callback or method) without the developer agreeing to its name and shape.
- Never move a message into `IGNORED`, or a type into `Known`, without the developer's decision and a stated reason.

## Checklist

- [ ] The version was found in Pipecat's `released.json`, and the document synced from the release that shipped it
- [ ] Every change between the two documents was listed by kind before any edit
- [ ] Every test and type-check failure matched a listed change
- [ ] Each new server message has its type, event, callback, `handleMessage` case, `ServerData` entry and test
- [ ] Each new client message has a method that checks the bot's version
- [ ] Deprecations are marked, with their replacement, and older bots still work
- [ ] Tests, type check, lint, build, the declarations' type check and client-react's tests pass
- [ ] The summary and the Release Notes draft are written
