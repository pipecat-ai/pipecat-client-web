# Source-to-Doc Mapping — pipecat-client-web

The profile for the shared `update-docs` skill, which lives in
`pipecat-ai/pipecat` at `.claude/skills/update-docs/SKILL.md` and is published
through the `pipecat-dev-skills` marketplace. `PROFILE_CONTRACT.md` beside it
describes what this file has to provide.

Two differences from the Python profiles are worth reading before using the
tables below.

**The mapping is not one file to one page.** Sixteen `use*.ts` hooks share a
single page, and one class (`PipecatClient`) is split across three. Resolving a
change means finding the *section* it belongs to, not just the file.

**This repo does not own every page under `api-reference/client/js/`.** The six
concrete transports are published from `pipecat-ai/pipecat-client-web-transports`
and documented in the same directory. Only `transports/transport.mdx` — the base
class — belongs to this repo. Editing a concrete transport's page from here
means editing another package's documentation from source that does not define
it.

## Scope

Everything under `client-js/` and `client-react/src/` is in scope. Both are
published packages (`@pipecat-ai/client-js`, `@pipecat-ai/client-react`).

Exclude:

- `client-js/tests/**`, `client-react/tests/**`
- `node_modules/`, `dist/`, `*.d.ts` build output
- `client-js/index.ts`, `client-js/client/index.ts`, `client-js/rtvi/index.ts`,
  `client-react/src/index.ts` — barrel files that only re-export

A barrel file is excluded because it re-exports, not because it is uninteresting:
if one **stops** exporting a name, that name has left the public API, which is a
documentation change. Treat a removed export line as a change to whichever page
documents that name.

## Skip list

| File | Why |
| --- | --- |
| `client-js/client/decorators.ts` | `@transportReady` / `@getIfTransportInState` guards. Their effect — a method throwing when called in the wrong state — is documented on the methods themselves, not as its own surface. |
| `client-js/client/dispatcher.ts` | Internal message routing between client and transport. |
| `client-js/client/utils.ts`, `client-react/src/useMergedRef.ts`, `client-react/src/conversation/utils.ts` | Internal helpers, not exported from the package roots. |
| `client-react/src/conversation/conversationAtoms.ts` | Jotai store internals. The exported surface is `usePipecatConversation`. |

Nothing else. In particular `rtvi/` is not internal — it holds the protocol
types, events, and errors that make up most of the documented API.

## Base classes

| File | Pages to check |
| --- | --- |
| `client-js/client/transport.ts` | `api-reference/client/js/transports/transport.mdx` first — it is the base every transport implements. A change to its abstract surface also changes what the six concrete transport pages have to describe, but **those pages are owned by `pipecat-client-web-transports`**: report them as a cross-repo finding rather than editing them. |
| `client-js/rtvi/messages.ts` | `api-reference/client/js/callbacks.mdx`, `api-reference/client/js/client-methods.mdx`. Holds `RTVI_PROTOCOL_VERSION` and the message/data types. A protocol version bump is documentation-visible on both. |

## Non-standard locations

| File | Page and section |
| --- | --- |
| `client-js/client/client.ts` | Split three ways: `PipecatClientOptions` → `api-reference/client/js/client-constructor.mdx`; the `PipecatClient` methods → `api-reference/client/js/client-methods.mdx`; `RTVIEventCallbacks`, `FunctionCallParams`, `FunctionCallCallback` → `api-reference/client/js/callbacks.mdx`. Decide by which of the three a changed symbol belongs to. |
| `client-js/rtvi/events.ts` | `api-reference/client/js/callbacks.mdx` — `RTVIEvent` is the event-name enum the callbacks table is keyed on |
| `client-js/rtvi/errors.ts` | `api-reference/client/js/errors.mdx` |
| `client-js/rtvi/common_types.ts` | Wherever the changed type is used. `TransportState` appears on `api-reference/client/js/callbacks.mdx`, `js/transports/transport.mdx`, and `react/hooks.mdx`; `Participant` on `callbacks.mdx`. Grep the type name — these are referenced far more widely than they are defined. |
| `client-js/rtvi/ui.ts`, `client-js/rtvi/a11y_walker.ts`, `client-js/client/A11ySnapshotStreamer.ts` | `api-reference/client/react/hooks.mdx` — the UI-command and snapshot surface is documented through the React hooks that consume it (`useUISnapshot`, `useUICommandHandler`, `useUIJobGroups`), not on a page of its own |
| `client-js/client/rest_helpers.ts` | `api-reference/client/js/client-constructor.mdx` — the `endpoint`/`requestData` connect helpers |
| `client-js/client/logger.ts` | `api-reference/client/js/overview.mdx` |

## Pattern matching

Two many-to-one rules cover most of `client-react/`:

| Source | Page |
| --- | --- |
| `client-react/src/use*.ts` (16 hooks) | `api-reference/client/react/hooks.mdx` — one `##` section per hook |
| `client-react/src/PipecatClient*.tsx`, `client-react/src/VoiceVisualizer.tsx` | `api-reference/client/react/components.mdx` — one `##` section per component |
| `client-react/src/*Provider.tsx`, `*Context.ts` | `api-reference/client/react/components.mdx` for the provider component; `api-reference/client/react/overview.mdx` for the setup example |
| `client-react/src/conversation/**` | `api-reference/client/react/hooks.mdx`, the `usePipecatConversation` section |
| `client-react/src/defaultUICommandHandlers.ts` | `api-reference/client/react/hooks.mdx` — exports hooks (`useDefaultScrollToHandler`, `useDefaultFocusHandler`) documented there alongside the rest |
| `client-react/src/uiJobGroupsTypes.ts` | `api-reference/client/react/hooks.mdx` — `JobGroup` and `UIJobGroupsAPI` are the return shape of `useUIJobGroups` |

A new hook or component means a **new section on an existing page**, not a new
page. Find the alphabetical or grouped position the page already uses and insert
there.

## Search

When the tables come up empty, grep `DOCS_PATH` for:

- The exported symbol name — hooks and components are documented under their
  exact export (`usePipecatClientTransportState`, `PipecatClientMicToggle`).
- For a type or option, the field name in backticks, then the type name.
- For protocol behavior, the `RTVIEvent` member name.

Search `api-reference/client/` broadly rather than one SDK's directory: the same
concept is documented per-SDK, and a JS change often has an iOS, Android,
React Native, or C++ page describing the same thing. Those are **not** this
repo's to edit — report them so someone can carry the change across.

## Section vocabulary

| Section | Built from | Form |
| --- | --- | --- |
| Constructor options | the options interface (`PipecatClientOptions`) | `<ParamField>` entries |
| Methods | public class methods | `##` per method, signature in a fenced `typescript` block, then params |
| Callbacks | `RTVIEventCallbacks` members and `RTVIEvent` | table of callback name, signature, description |
| Hooks | one exported hook | `##` per hook, with signature, return shape, and a usage example |
| Components | one exported component | `##` per component, with props as `<ParamField>` |
| Errors | `RTVIError` subclasses | `##` per class with when it is thrown |

Types come from TypeScript itself, so a `<ParamField>` `type` should be the
declared type verbatim (`string | null`, `RTVIEventCallbacks`), not a prose
paraphrase. An optional property (`foo?: string`) is documented as optional
rather than as `string | undefined`.

## Guide directories

- `client/concepts/` — transport choice, RTVI protocol, state machine
- `client/guides/` — practical how-tos
- `client/get-started/` — quickstart, which pins exact package names and versions

Examples in `client/get-started/` install packages by name. A rename or a new
peer dependency has to reach that page or the quickstart stops working.

## New pages

New pages are rare here — a new hook or component is a section, not a page. A
page is warranted only for a genuinely new surface, and in that case:

Create `DOCS_PATH/api-reference/client/js/<name>.mdx` or
`DOCS_PATH/api-reference/client/react/<name>.mdx`:

````
---
title: "Name"
"og:title": "Name - JavaScript SDK"
sidebarTitle: "Short"
description: "110-140 chars naming the classes or hooks the page documents."
---

[What it is and when to reach for it.]

## Installation

```bash
npm install @pipecat-ai/client-js
```

## Usage

```typescript
[Minimal working example]
```

## API Reference

[ParamField or per-symbol sections, matching the vocabulary above]
````

The `og:title` suffix is required, not optional: several SDKs document the same
concept under the same short title, and the docs metadata lint enforces a unique
effective unfurl title site-wide.

### Registration

Add the path, without `.mdx`, to `DOCS_PATH/docs.json` under the client SDK's
group. There is no support-matrix page to update.
