// Played by simulated players on the test server: mc test npc
// "Asker" plays the person who asks; the NPC mod spawns its own NPCs next to them.
import { world } from "@minecraft/server";

/** Sends the mod a request, the way mc npc does. */
const send = (t, request) => t.dimension.runCommand(`scriptevent family:npc ${JSON.stringify(request)}`);

const npcs = () => world.getPlayers({ tags: ["family:npc"] });

/** An asker facing south (+z), so "forward" is +z and "right" is -x. */
async function asker(t) {
  const player = t.player("Asker");
  await t.wait(10);
  player.lookAtLocation(t.at(0.5, 1.6, 20));
  await t.wait(2);
  return player;
}

/** Sends every NPC away, so the next test starts with none. */
async function sendAway(t) {
  for (const npc of npcs()) send(t, { near: "Asker", npc: npc.name, actions: [{ do: "leave" }] });
  await t.until(() => npcs().length === 0, "An NPC didn't leave", 40);
}

export async function anNpcJoinsNextToYou(t) {
  const me = await asker(t);
  send(t, { spawn: true, near: "Asker" });
  await t.until(() => npcs().length === 1, "No NPC joined", 40);
  const [npc] = npcs();
  const away = Math.hypot(npc.location.x - me.location.x, npc.location.z - me.location.z);
  t.assert(away < 4, `The NPC joined ${away.toFixed(1)} blocks away; it should be right next to the player`);
  await sendAway(t);
}

export async function anNpcDigsAHole(t) {
  await asker(t);
  send(t, { near: "Asker", actions: [{ do: "dig", at: { forward: 4 }, width: 3, length: 3, depth: 2 }] });
  const left = () => {
    const solid = [];
    for (const dx of [-1, 0, 1]) for (const dz of [3, 4, 5]) for (const dy of [-1, -2]) if (!t.dimension.getBlock(t.at(dx, dy, dz))?.isAir) solid.push(`${dx},${dy},${dz}`);
    return solid;
  };
  await t.until(() => left().length === 0, () => `The 3x3x2 hole still has blocks at ${left().join(" ")}`, 200);
  await sendAway(t);
}

export async function anNpcBuildsAWall(t) {
  await asker(t);
  send(t, { near: "Asker", actions: [{ do: "build", block: "minecraft:cobblestone", at: { forward: 5 }, width: 3, length: 1, height: 2 }] });
  const missing = () => {
    const out = [];
    for (const dx of [-1, 0, 1]) for (const dy of [0, 1]) if (t.dimension.getBlock(t.at(dx, dy, 5))?.typeId !== "minecraft:cobblestone") out.push(`${dx},${dy}`);
    return out;
  };
  await t.until(() => missing().length === 0, () => `The 3x2 wall is missing blocks at ${missing().join(" ")}`, 200);
  await sendAway(t);
}

export async function anNpcComesWhenCalled(t) {
  const me = await asker(t);
  send(t, { near: "Asker", actions: [{ do: "go", at: { forward: 8 } }] });
  await t.until(() => npcs().length === 1 && npcs()[0].location.z - me.location.z > 6, "The NPC never walked 8 blocks forward", 200);
  const [npc] = npcs();
  send(t, { near: "Asker", npc: npc.name, actions: [{ do: "come" }] });
  await t.until(() => Math.hypot(npc.location.x - me.location.x, npc.location.z - me.location.z) < 3.5, "The NPC didn't come back when called", 200);
  await sendAway(t);
}

export async function anNpcFightsMonsters(t) {
  await asker(t);
  const husk = t.dimension.spawnEntity("minecraft:husk", t.at(0.5, 0, 6.5));
  send(t, { near: "Asker", actions: [{ do: "attack", mob: "hostile", seconds: 20 }] });
  await t.until(() => !husk.isValid || (husk.getComponent("minecraft:health")?.currentValue ?? 0) <= 0, "The NPC didn't beat the husk", 400);
  await sendAway(t);
}

export async function aBadPlanIsRefused(t) {
  await asker(t);
  send(t, { near: "Asker", actions: [{ do: "explode" }] });
  await t.wait(20);
  t.assert(npcs().length === 0, "A plan with an unknown action still spawned an NPC");
}

export async function npcsCanBeSentAway(t) {
  await asker(t);
  send(t, { spawn: true, near: "Asker" });
  send(t, { spawn: true, near: "Asker" });
  await t.until(() => npcs().length === 2, "Two NPCs didn't join", 40);
  const [first] = npcs();
  send(t, { remove: first.name });
  await t.until(() => npcs().length === 1, `${first.name} didn't leave when sent away by name`, 40);
  send(t, { remove: "all" });
  await t.until(() => npcs().length === 0, "The last NPC didn't leave when all were sent away", 40);
}

export async function npcsFromBeforeAReloadCanBeSentAway(t) {
  await asker(t);
  // The mod forgets its NPCs when scripts reload; they're still in the game with the tag.
  const leftover = t.player("Leftover");
  leftover.addTag("family:npc");
  await t.until(() => npcs().length === 1, "The leftover NPC isn't there", 40);
  send(t, { remove: "all" });
  await t.until(() => npcs().length === 0, "An NPC from before a reload didn't leave when all were sent away", 40);
}
