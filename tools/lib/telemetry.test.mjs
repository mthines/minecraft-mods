import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { buildPayload, emit, parseAttributes } from "./telemetry.mjs";

const record = (payload) => payload.resourceLogs[0].scopeLogs[0].logRecords[0];
const attributes = (payload) => Object.fromEntries(record(payload).attributes.map(({ key, value }) => [key, value]));

test("attributes: text, whole numbers and booleans, and a value may hold =", () => {
  assert.deepEqual(parseAttributes(["a=x", "n:int=12", "b:bool=false", "e=k=v", "bad", "x:int=nope"]), { a: "x", n: 12, b: false, e: "k=v" });
});

test("an event is a named log record with its source, like the game events", () => {
  const payload = buildPayload("admin.kit_given", { "minecraft.kit.items": 12, "minecraft.kit.craft": true, "minecraft.kit.name": "drill" }, { source: "web", now: 1 });
  assert.equal(record(payload).eventName, "minecraft.admin.kit_given");
  assert.deepEqual(attributes(payload), {
    "event.name": { stringValue: "minecraft.admin.kit_given" },
    "minecraft.admin.source": { stringValue: "web" },
    "minecraft.kit.items": { intValue: "12" },
    "minecraft.kit.craft": { boolValue: true },
    "minecraft.kit.name": { stringValue: "drill" },
  });
});

test("emit posts the event to the Collector", async () => {
  /** @type {any} */
  let got;
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => { got = { url: req.url, body: JSON.parse(text) }; res.end("{}"); });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}/v1/logs`;
  try {
    assert.equal(await emit("admin.action", { "minecraft.action.name": "day" }, { url, source: "mc-dev", env: {} }), true);
    assert.equal(got.url, "/v1/logs");
    assert.equal(attributes(got.body)["minecraft.admin.source"].stringValue, "mc-dev");
    got = undefined;
    assert.equal(await emit("admin.action", {}, { url, env: { MC_TELEMETRY: "off" } }), false);
    assert.equal(got, undefined, "off sends nothing");
  } finally {
    server.close();
  }
});

test("emit never throws when nothing listens", async () => {
  assert.equal(await emit("admin.action", {}, { url: "http://127.0.0.1:1/v1/logs", env: {} }), false);
});
