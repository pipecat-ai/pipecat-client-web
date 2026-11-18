/**
 * Copyright (c) 2026, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

/**
 * Generates `rtvi/generated/protocol.ts` from the RTVI protocol's AsyncAPI
 * document, which Pipecat publishes for each protocol version. The document is
 * kept in `rtvi/spec/<version>/rtvi.asyncapi.json`, for the version
 * `RTVI_PROTOCOL_VERSION` in `rtvi/messages.ts` names.
 *
 *   node scripts/rtvi-protocol.mjs sync [--ref <git ref> | --pipecat <path>]
 *       Copies the version's document from Pipecat, then generates: from the
 *       pipecat-ai/pipecat repository at a ref, `main` unless one is given, or
 *       from a local Pipecat checkout.
 *   node scripts/rtvi-protocol.mjs generate
 *       Writes the generated file from the kept document.
 *   node scripts/rtvi-protocol.mjs check
 *       Fails when the generated file isn't what the kept document produces.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "json-schema-to-typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "rtvi", "generated", "protocol.ts");
const PIPECAT_SPEC = join(
  "src",
  "pipecat",
  "processors",
  "frameworks",
  "rtvi",
  "spec"
);
const SCHEMAS = "#/components/schemas/";
// Every generated type's name starts with it, so none can be the same as a
// public type's: Parcel's declaration bundler doesn't always tell them apart.
const PREFIX = "Protocol";

function protocolVersion() {
  const source = readFileSync(join(ROOT, "rtvi", "messages.ts"), "utf8");
  const match = source.match(/RTVI_PROTOCOL_VERSION = "([^"]+)"/);
  if (!match)
    throw new Error("RTVI_PROTOCOL_VERSION not found in rtvi/messages.ts");
  return match[1];
}

function documentPath(version) {
  return join(ROOT, "rtvi", "spec", version, "rtvi.asyncapi.json");
}

/** A schema with no keyword that constrains its value, which allows any value. */
function allowsAnything(schema) {
  return ![
    "type",
    "$ref",
    "anyOf",
    "allOf",
    "oneOf",
    "const",
    "enum",
    "properties",
    "items",
  ].some((keyword) => keyword in schema);
}

/**
 * The document's schemas as json-schema-to-typescript reads them: references
 * point into `definitions`, and a schema that allows any value is `unknown`,
 * which the tool would otherwise make an object.
 */
function definitions(document) {
  const text = JSON.stringify(document.components.schemas).replaceAll(
    SCHEMAS,
    "#/definitions/"
  );
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties") {
        for (const field of Object.values(value)) {
          if (allowsAnything(field)) field.tsType = "unknown";
          visit(field);
        }
      } else {
        visit(value);
      }
    }
  };
  const schemas = JSON.parse(text);
  visit(schemas);
  for (const [name, schema] of Object.entries(schemas)) {
    schema.title = PREFIX + (schema.title ?? name);
  }
  return schemas;
}

const PRETTIER = JSON.parse(
  readFileSync(join(ROOT, "..", ".prettierrc"), "utf8")
);

async function schemaTypes(document) {
  const all = definitions(document);
  const parts = [];
  for (const [name, schema] of Object.entries(all)) {
    // Each schema is compiled on its own and declares only itself; the schemas
    // it refers to are declared when their own turn comes. A schema that
    // refers to itself, such as a tree's node, does so through the root.
    const own = JSON.parse(
      JSON.stringify(schema).replaceAll(`"#/definitions/${name}"`, '"#"')
    );
    const ts = await compile({ ...own, definitions: all }, PREFIX + name, {
      bannerComment: "",
      additionalProperties: false,
      declareExternallyReferenced: false,
      format: false,
    });
    parts.push(ts.trim());
  }
  return parts.join("\n\n");
}

/** The TypeScript type of a message's `data`, from its schema in the envelope. */
function dataType(schema, names) {
  if (schema === undefined) return "undefined";
  if (schema.$ref) return names.get(schema.$ref.slice(SCHEMAS.length));
  if (schema.allOf?.length === 1) return dataType(schema.allOf[0], names);
  if (schema.anyOf)
    return schema.anyOf.map((s) => dataType(s, names)).join(" | ");
  if (allowsAnything(schema)) return "unknown";
  throw new Error(`No type for message data ${JSON.stringify(schema)}`);
}

function catalog(document, names) {
  const messages = Object.fromEntries(
    Object.entries(document.components.messages).map(([key, m]) => [key, m])
  );
  const byOperation = (operation) =>
    document.operations[operation].messages.map(
      (ref) => messages[ref.$ref.split("/").pop()]
    );
  const client = byOperation("receiveClientMessages");
  const server = byOperation("sendServerMessages");
  const union = (list) =>
    list.map((m) => `  | ${JSON.stringify(m.name)}`).join("\n");
  const dataMap = (list) =>
    list
      .map(
        (m) =>
          `  ${JSON.stringify(m.name)}: ${dataType(m.payload.properties.data, names)};`
      )
      .join("\n");
  const details = server
    .map((m) => {
      const fields = [
        m["x-rtvi-enabled-by"] &&
          `enabledBy: ${JSON.stringify(m["x-rtvi-enabled-by"])}`,
        m["x-rtvi-min-client-version"] &&
          `minClientVersion: ${JSON.stringify(m["x-rtvi-min-client-version"])}`,
        m["x-rtvi-deprecated"] &&
          `deprecated: ${JSON.stringify(m["x-rtvi-deprecated"])}`,
      ].filter(Boolean);
      return `  ${JSON.stringify(m.name)}: { ${fields.join(", ")} },`;
    })
    .join("\n");
  return `/** The type of every message a client sends. */
export type ProtocolClientMessageType =
${union(client)};

/** The type of every message the server sends. */
export type ProtocolServerMessageType =
${union(server)};

/** The \`data\` of each client message, \`undefined\` for one that carries none. */
export interface ProtocolClientMessageData {
${dataMap(client)}
}

/** The \`data\` of each server message, \`undefined\` for one that carries none. */
export interface ProtocolServerMessageData {
${dataMap(server)}
}

/**
 * For each server message: the server setting that turns it on, the lowest
 * client protocol version the server sends it to, and what replaces it when
 * it is deprecated.
 */
export const PROTOCOL_SERVER_MESSAGES: Record<
  ProtocolServerMessageType,
  { enabledBy?: string; minClientVersion?: string; deprecated?: string }
> = {
${details}
};`;
}

async function generate(version) {
  const document = JSON.parse(readFileSync(documentPath(version), "utf8"));
  if (document.info.version !== version) {
    throw new Error(
      `The kept document is for ${document.info.version}, not ${version}`
    );
  }
  const types = await schemaTypes(document);
  // The names json-schema-to-typescript gave each schema, for the catalog.
  const declared = [
    ...types.matchAll(/^export (?:interface|type) (\w+)/gm),
  ].map((match) => match[1]);
  const names = new Map(
    Object.keys(document.components.schemas).map((name) => [
      name,
      declared.find((d) => d.toLowerCase() === (PREFIX + name).toLowerCase()),
    ])
  );
  const source = `/**
 * Generated from rtvi/spec/${version}/rtvi.asyncapi.json by
 * scripts/rtvi-protocol.mjs. Do not edit; run \`npm run rtvi:generate\`.
 */

/** The protocol version this file describes. */
export const PROTOCOL_VERSION = ${JSON.stringify(version)};

${types}

${catalog(document, names)}
`;
  const { format } = await import("prettier");
  return format(source, { ...PRETTIER, parser: "typescript" });
}

/** The version's document from Pipecat: a local checkout's, or GitHub's at a ref. */
async function pipecatDocument(version, args) {
  const option = (name) => {
    const index = args.indexOf(name);
    if (index !== -1 && !args[index + 1]) {
      throw new Error("Usage: sync [--ref <git ref> | --pipecat <path>]");
    }
    return index === -1 ? undefined : args[index + 1];
  };
  const checkout = option("--pipecat");
  if (checkout) {
    const path = join(checkout, PIPECAT_SPEC, version, "rtvi.asyncapi.json");
    if (!existsSync(path)) {
      throw new Error(`No document for protocol ${version} at ${path}`);
    }
    return readFileSync(path, "utf8");
  }
  const ref = option("--ref") ?? "main";
  const path = [...PIPECAT_SPEC.split(/[\\/]/), version, "rtvi.asyncapi.json"];
  const url = `https://raw.githubusercontent.com/pipecat-ai/pipecat/${ref}/${path.join("/")}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `No document for protocol ${version} at ${url}: ${response.status}`
    );
  }
  return response.text();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const version = protocolVersion();
  if (command === "sync") {
    mkdirSync(dirname(documentPath(version)), { recursive: true });
    writeFileSync(documentPath(version), await pipecatDocument(version, args));
  }
  if (command === "sync" || command === "generate") {
    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, await generate(version));
  } else if (command === "check") {
    if (readFileSync(OUTPUT, "utf8") !== (await generate(version))) {
      console.error(
        "rtvi/generated/protocol.ts is out of date; run `npm run rtvi:generate`."
      );
      process.exit(1);
    }
  } else {
    throw new Error(`Unknown command ${command}; use sync, generate or check.`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
