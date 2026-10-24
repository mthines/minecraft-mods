// Game events for the OpenTelemetry Collector, which sends them to Dash0 (see server/otelcol/config.yaml).
// Each event is one JSON line in the server console; the Collector turns it into a log record.

/**
 * @param {string} name what happened, like "trampoline.bounce"
 * @param {Record<string, string | number | boolean>} [attributes] details, like the trampoline size
 */
export function emit(name, attributes = {}) {
  console.log(JSON.stringify({ "event.name": `minecraft.${name}`, ...attributes }));
}
