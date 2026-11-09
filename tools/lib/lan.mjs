import { execFileSync } from "node:child_process";
import { hostname, networkInterfaces } from "node:os";

/** The Mac's Bonjour name, like Madss-MacBook-Pro.local: it stays the same when the wifi gives the Mac a new IP. */
function localName() {
  try {
    if (process.platform === "darwin") return `${execFileSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).trim()}.local`;
  } catch {}
  const name = hostname();
  return name.endsWith(".local") ? name : undefined;
}

/**
 * The addresses another device on the wifi can open the kit menu at: the .local name first (an app added to the Home
 * Screen keeps working), then the IPs, wifi (en0) before VPNs and virtual networks.
 * @param {number} port
 */
export function lanUrls(port) {
  const found = Object.entries(networkInterfaces()).flatMap(([name, list = []]) => list.filter((i) => i.family === "IPv4" && !i.internal).map((i) => ({ name, ip: i.address })));
  const wifi = (/** @type {string} */ name) => (/^en\d/.test(name) ? 0 : 1);
  const name = found.length ? localName() : undefined;
  return [...(name ? [name] : []), ...found.sort((a, b) => wifi(a.name) - wifi(b.name)).map(({ ip }) => ip)].map((host) => `http://${host}:${port}`);
}
