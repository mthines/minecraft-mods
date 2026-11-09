import { networkInterfaces } from "node:os";

/** The addresses another device on the wifi can open the kit menu at, wifi first (en0), VPNs and virtual networks last. @param {number} port */
export function lanUrls(port) {
  const found = Object.entries(networkInterfaces()).flatMap(([name, list = []]) => list.filter((i) => i.family === "IPv4" && !i.internal).map((i) => ({ name, ip: i.address })));
  const wifi = (/** @type {string} */ name) => (/^en\d/.test(name) ? 0 : 1);
  return found.sort((a, b) => wifi(a.name) - wifi(b.name)).map(({ ip }) => `http://${ip}:${port}`);
}
