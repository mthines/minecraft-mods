// NPCs: simulated players that join next to you and do what they're told.
// mc npc sends them plans (see plan.js) as a script event: scriptevent family:npc {"near":"You","npc":"new","actions":[...]}
import { GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { spawnSimulatedPlayer } from "@minecraft/server-gametest";
import { box, blockAt, checkPlan, facing } from "./plan.js";
import { emit } from "./telemetry.js";

const NAMES = ["Bob", "Alma", "Sam", "Ida", "Max", "Luna", "Otto", "Freja", "Leo", "Nova"];
const NPC_TAG = "family:npc"; // other mods skip players with this tag, like the trampoline starter chest

/** @type {Map<string, { player: import("@minecraft/server-gametest").SimulatedPlayer, job: number, busy: boolean }>} by name */
const npcs = new Map();

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const center = (block) => ({ x: block.x + 0.5, y: block.y, z: block.z + 0.5 });

/** Spawns an NPC two blocks in front of `near`. */
function spawn(near, name) {
  name ??= NAMES.find((n) => !npcs.has(n) && !world.getPlayers({ name: n }).length) ?? `Helper${npcs.size + 1}`;
  const ahead = facing(near.getViewDirection());
  const spot = center(blockAt(near.location, ahead, { forward: 2, right: 0, up: 0 }));
  const player = spawnSimulatedPlayer({ dimension: near.dimension, ...spot }, name, GameMode.Survival);
  player.addTag(NPC_TAG);
  player.giveItem(new ItemStack("minecraft:diamond_sword", 1), true);
  player.lookAtEntity(near);
  const npc = { player, job: 0, busy: false };
  npcs.set(name, npc);
  emit("npc.joined", { "minecraft.npc.name": name, "minecraft.player.name": near.name });
  return npc;
}

/** Sends NPCs away: one by name, or "all". Returns their names. */
function sendAway(who) {
  const gone = [];
  for (const [name, npc] of npcs) {
    if (who !== "all" && who !== name) continue;
    npcs.delete(name);
    if (npc.player.isValid) npc.player.disconnect();
    gone.push(name);
  }
  // NPCs from before a script reload aren't in npcs any more, but still have the tag. Kicking doesn't remove them.
  for (const player of world.getPlayers({ tags: [NPC_TAG] })) {
    if ((who !== "all" && who !== player.name) || gone.includes(player.name)) continue;
    if (!("disconnect" in player) || typeof player.disconnect !== "function") {
      console.warn(`[NPC] Couldn't send ${player.name} away. A restart clears every NPC: mc restart`);
      continue;
    }
    player.disconnect();
    gone.push(player.name);
  }
  return gone;
}

/** Walks to a spot. False if it couldn't get there in time. */
async function goTo(npc, spot, isCurrent, closeEnough = 1.5, seconds = 20) {
  npc.player.navigateToLocation(spot, 1);
  for (let tick = 0; tick < seconds * 20; tick += 5) {
    if (!isCurrent()) return false;
    if (distance(npc.player.location, spot) <= closeEnough) break;
    if (tick % 40 === 35) npc.player.navigateToLocation(spot, 1); // paths can go stale when blocks change
    await system.waitTicks(5);
  }
  npc.player.stopMoving();
  return distance(npc.player.location, spot) <= closeEnough + 1;
}

/** Runs a checked plan. A newer plan for the same NPC stops this one. */
async function run(npc, near, actions) {
  const job = ++npc.job;
  npc.busy = true;
  try {
    await doActions(npc, near, actions, () => npc.job === job && npc.player.isValid);
  } finally {
    if (npc.job === job) npc.busy = false;
  }
}

/** @param {() => boolean} isCurrent false once a newer plan took over, or the NPC left */
async function doActions(npc, near, actions, isCurrent) {
  // Places in the plan are relative to where the player stood and looked when they asked.
  const feet = { ...near.location };
  const ahead = facing(near.getViewDirection());
  const { dimension } = npc.player;
  const nextTo = (at, length) => center(blockAt(feet, ahead, { ...at, forward: at.forward - Math.ceil(length / 2) - 1 }));

  for (const action of actions) {
    if (!isCurrent()) return;
    switch (action.do) {
      case "say":
        npc.player.chat(action.text);
        break;
      case "come":
        if (near.isValid) await goTo(npc, near.location, isCurrent, 2.5);
        break;
      case "go":
        await goTo(npc, center(blockAt(feet, ahead, action.at)), isCurrent);
        break;
      case "follow": {
        const until = action.seconds ? system.currentTick + action.seconds * 20 : Infinity;
        while (isCurrent() && near.isValid && system.currentTick < until) {
          if (distance(npc.player.location, near.location) > 3.5) npc.player.navigateToEntity(near, 1);
          else {
            npc.player.stopMoving();
            npc.player.lookAtEntity(near);
          }
          await system.waitTicks(10);
        }
        npc.player.stopMoving();
        break;
      }
      case "dig":
        await goTo(npc, nextTo(action.at, action.length), isCurrent, 2);
        for (const spot of box(feet, ahead, { ...action.at, up: action.at.up - 1 }, action.width, action.length, action.depth, -1)) {
          if (!isCurrent()) return;
          const block = dimension.getBlock(spot);
          if (!block || block.isAir || block.typeId === "minecraft:bedrock") continue;
          npc.player.lookAtBlock(spot);
          dimension.runCommand(`setblock ${spot.x} ${spot.y} ${spot.z} air destroy`); // drops and crumbles like breaking it
          await system.waitTicks(2);
        }
        break;
      case "build":
        await goTo(npc, nextTo(action.at, action.length), isCurrent, 2);
        for (const spot of box(feet, ahead, action.at, action.width, action.length, action.height, 1)) {
          if (!isCurrent()) return;
          if (action.hollow && !spot.edge) continue;
          const block = dimension.getBlock(spot);
          if (!block?.isAir && !block?.isLiquid) continue; // builds around what's already there
          npc.player.lookAtBlock(spot);
          try {
            block.setType(action.block);
          } catch {
            npc.player.chat(`I don't know a block called ${action.block}.`);
            break;
          }
          dimension.playSound("use.stone", spot);
          await system.waitTicks(2);
        }
        break;
      case "attack": {
        const until = system.currentTick + action.seconds * 20;
        const query = action.mob === "hostile" ? { families: ["monster"] } : { type: action.mob };
        while (isCurrent() && system.currentTick < until) {
          const [target] = dimension.getEntities({ ...query, location: npc.player.location, maxDistance: 24, closest: 1 });
          if (!target) break;
          if (distance(npc.player.location, target.location) > 2.5) npc.player.navigateToEntity(target, 1);
          else {
            npc.player.lookAtEntity(target);
            npc.player.attackEntity(target);
          }
          await system.waitTicks(10);
        }
        npc.player.stopMoving();
        break;
      }
      case "jump":
        npc.player.jump();
        await system.waitTicks(10);
        break;
      case "wait":
        await system.waitTicks(action.seconds * 20);
        break;
      case "leave":
        npcs.delete(npc.player.name);
        npc.player.disconnect();
        return;
    }
  }
}

system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
  if (id !== "family:npc") return;
  let request;
  try {
    request = JSON.parse(message);
  } catch {
    return console.warn(`[NPC] Not JSON: ${message}`);
  }
  if (request.list) return console.log(JSON.stringify({ "npc.list": [...new Set([...npcs.keys(), ...world.getPlayers({ tags: [NPC_TAG] }).map((p) => p.name)])] }));
  if (request.remove) return console.log(JSON.stringify({ "npc.removed": sendAway(request.remove) }));
  const near = (request.near && world.getPlayers({ name: request.near })[0]) ?? world.getAllPlayers().find((p) => !p.hasTag(NPC_TAG));
  if (!near) return console.warn("[NPC] Nobody to spawn next to: join the server first.");
  if (request.spawn) return void spawn(near);
  const checked = checkPlan(request);
  if (!checked.ok) return console.warn(`[NPC] Can't do that plan: ${checked.errors.join("; ")}`);
  const { npc: name, actions } = checked.plan;
  const npc = (name !== "new" && npcs.get(name)) || spawn(near, name !== "new" && !world.getPlayers({ name }).length ? name : undefined);
  emit("npc.told", { "minecraft.npc.name": npc.player.name, "minecraft.player.name": near.name, "minecraft.npc.actions": actions.map((a) => a.do).join(",") });
  run(npc, near, actions).catch((e) => console.warn(`[NPC] ${npc.player.name} got stuck: ${e}`));
});

// Between jobs, NPCs look at the nearest player, like they're paying attention.
system.runInterval(() => {
  for (const [name, npc] of npcs) {
    if (!npc.player.isValid) {
      npcs.delete(name);
      continue;
    }
    const [player] = npc.player.dimension
      .getPlayers({ location: npc.player.location, maxDistance: 8, closest: 2 })
      .filter((p) => p.id !== npc.player.id && !(p instanceof Player && p.hasTag(NPC_TAG)));
    if (player && !npc.busy) npc.player.lookAtEntity(player);
  }
}, 20);
