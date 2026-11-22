// Laser drill: hold right-click and a beam digs a 3x3 tunnel the way you look, as long as you hold.
//
// The tunnel runs along the axis you mostly look along (not the exact view direction), straight, from your own block on. That way
// each step is one box, so one fillBlocks clears 4 layers (36 blocks) instead of dozens of setblocks. It starts where you press,
// and keeps its direction until you let go. Nothing drops: 9 blocks a layer at 40 layers a second would be hundreds of item
// entities. Bedrock, liquids and blocks with an inventory stay (see KEEP in tunnel.js).
import { BlockVolume, system, world } from "@minecraft/server";
import { KEEP, LAYERS_PER_STEP, MAX_LAYERS, STEP_TICKS, directionOf, layers, nextCount, startOf, tipOf } from "./tunnel.js";

const DRILL = "family:laser_drill";
const FILLS_PER_TICK = 4; // all players together: the server has one script thread
const BEAM = "minecraft:blue_flame_particle";

/** @type {Map<string, { dimension: import("@minecraft/server").Dimension, axis: "x" | "y" | "z", sign: 1 | -1, start: { x: number, y: number, z: number }, done: number, due: number, steps: number }>} player id → their beam. Insertion order is the turn order. */
const beams = new Map();

/** @param {import("@minecraft/server").Player} player */
function holdsDrill(player) {
  return player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex)?.typeId === DRILL;
}

world.afterEvents.itemStartUse.subscribe(({ source: player, itemStack }) => {
  if (!player?.isValid || itemStack?.typeId !== DRILL) return; // NPCs come through as undefined
  const { axis, sign } = directionOf(player.getViewDirection());
  beams.set(player.id, { dimension: player.dimension, axis, sign, start: startOf(player.getHeadLocation(), axis, sign), done: 0, due: 0, steps: 0 });
});

const stop = ({ source: player }) => {
  if (player) beams.delete(player.id);
};
world.afterEvents.itemStopUse.subscribe(stop);
world.afterEvents.itemReleaseUse.subscribe(stop);
world.afterEvents.playerLeave.subscribe(({ playerId }) => beams.delete(playerId));

/** Clears the next layers of a beam. Returns false when the beam is over. */
function step(beam) {
  const count = nextCount(beam.done);
  if (count === 0) return false;
  const range = beam.dimension.heightRange;
  const box = layers(beam.start, beam.axis, beam.sign, beam.done, count, { min: range.min, max: range.max - 1 });
  if (!box) return false; // out of the world, up or down
  try {
    beam.dimension.fillBlocks(new BlockVolume(box.from, box.to), "minecraft:air", { blockFilter: { excludeTypes: KEEP } });
  } catch {
    return false; // the next blocks are in a chunk that isn't loaded
  }
  beam.done += count;
  beam.steps++;
  // Decoration: a spark at the tip, and now and then a sound and a few more sparks along the beam.
  try {
    const tip = tipOf(beam.start, beam.axis, beam.sign, beam.done);
    beam.dimension.spawnParticle(BEAM, tip);
    if (beam.steps % 3 === 1) {
      beam.dimension.playSound("mob.shulker.shoot", tip, { pitch: 0.6, volume: 2 });
      for (let back = 1; back <= 3; back++) beam.dimension.spawnParticle(BEAM, tipOf(beam.start, beam.axis, beam.sign, Math.max(1, beam.done - back * 8)));
    }
  } catch {
    // the chunk may not be loaded
  }
  return count === LAYERS_PER_STEP && beam.done < MAX_LAYERS;
}

system.runInterval(() => {
  if (beams.size === 0) return;
  let fills = 0;
  for (const [id, beam] of [...beams]) {
    if (fills >= FILLS_PER_TICK) break;
    if (system.currentTick < beam.due) continue;
    const player = world.getEntity(id);
    if (!player?.isValid || player.dimension.id !== beam.dimension.id || !holdsDrill(player)) {
      beams.delete(id);
      continue;
    }
    fills++;
    beam.due = system.currentTick + STEP_TICKS;
    beams.delete(id); // go to the back of the line, so a crowd takes turns when the budget is short
    if (step(beam)) beams.set(id, beam);
  }
});
