// What the grown-ups do with ./mc (kits given, peace on, a world switched) as events for the OpenTelemetry Collector,
// which sends them to Dash0 next to the game events (server/otelcol/config.yaml). ./mc calls tools/telemetry.mjs; mc dev and
// the kit menu on the iPad both run ./mc, so they are counted too. MC_SOURCE says which one ("mc-dev", "web", else "cli").
// Never in the way: no Collector running (telemetry off) or a slow one only costs a moment, and nothing is ever printed.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const ENDPOINT = "http://127.0.0.1:4318/v1/logs";
const TIMEOUT_MS = 1000;

/**
 * `key=text`, `key:int=5` or `key:bool=true` (the part after the first `=` is the value, so it can hold `=`).
 * @param {string[]} pairs
 * @returns {Record<string, string | number | boolean>}
 */
export function parseAttributes(pairs) {
  /** @type {Record<string, string | number | boolean>} */
  const attributes = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at < 1) continue;
    const [key, type] = pair.slice(0, at).split(":");
    const text = pair.slice(at + 1);
    if (type === "int") {
      if (Number.isInteger(Number(text)) && text.trim() !== "") attributes[key] = Number(text);
    } else if (type === "bool") attributes[key] = text === "true";
    else attributes[key] = text;
  }
  return attributes;
}

/** @param {string | number | boolean} value */
const anyValue = (value) =>
  typeof value === "number" ? { intValue: String(value) } : typeof value === "boolean" ? { boolValue: value } : { stringValue: value };

/**
 * One OTLP/HTTP JSON log record, shaped like the game events: the event name twice (as `eventName` and as the `event.name`
 * attribute) and a `minecraft.` prefix.
 * @param {string} name what happened, like "admin.kit_given"
 * @param {Record<string, string | number | boolean>} [attributes]
 * @param {{ source?: string, now?: number }} [options]
 */
export function buildPayload(name, attributes = {}, { source = "cli", now = Date.now() } = {}) {
  const eventName = `minecraft.${name}`;
  const nanos = `${now}000000`;
  const all = { "event.name": eventName, "minecraft.admin.source": source, ...attributes };
  return {
    resourceLogs: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "mc-tools" } }] },
        scopeLogs: [
          {
            scope: { name: "mc" },
            logRecords: [
              {
                timeUnixNano: nanos,
                observedTimeUnixNano: nanos,
                severityNumber: 9,
                severityText: "INFO",
                body: { stringValue: eventName },
                eventName,
                attributes: Object.entries(all).map(([key, value]) => ({ key, value: anyValue(value) })),
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Sends one event; resolves to whether the Collector took it, and never throws.
 * @param {string} name @param {Record<string, string | number | boolean>} [attributes]
 * @param {{ url?: string, source?: string, env?: NodeJS.ProcessEnv }} [options]
 */
export async function emit(name, attributes = {}, { env = process.env, url = env.MC_TELEMETRY_URL || ENDPOINT, source = env.MC_SOURCE || "cli" } = {}) {
  if (env.MC_TELEMETRY === "off") return false;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload(name, attributes, { source })),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * How many players are online, for events about things that kick them; -1 when the server can't say.
 * @param {string} container
 */
export async function onlineCount(container) {
  const run = promisify(execFile);
  try {
    const since = new Date().toISOString();
    await run("docker", ["exec", container, "send-command", "list"]);
    await new Promise((done) => setTimeout(done, 800));
    const { stdout, stderr } = await run("docker", ["logs", "--since", since, container]);
    return Number(`${stdout}\n${stderr}`.match(/There are (\d+)\/\d+ players online/)?.[1] ?? -1);
  } catch {
    return -1;
  }
}
