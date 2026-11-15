// For ./mc: node tools/telemetry.mjs <event> [key=text | key:int=5 | key:bool=true]...
// Sends one event (tools/lib/telemetry.mjs). Always exits 0 and prints nothing: telemetry never breaks a command.
import { emit, parseAttributes } from "./lib/telemetry.mjs";

const [name, ...pairs] = process.argv.slice(2);
if (name) await emit(name, parseAttributes(pairs));
