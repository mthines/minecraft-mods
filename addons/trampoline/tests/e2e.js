// Played by simulated players on the test server: mc test trampoline
import { Direction } from "@minecraft/server";
import { FINISHED_EDGE, edgeBlocks } from "../behavior_pack/scripts/trampoline.js";

/** A 2×2 trampoline on the ground, its bed corner 2, 2 from the middle; a player places its last edge block. */
async function buildTrampoline(t) {
  const size = 2;
  for (const [dx, dz] of [[2, 2], [3, 2], [2, 3], [3, 3]]) t.place("minecraft:slime", dx, 0, dz);
  const edge = edgeBlocks({ x: 2, y: 0, z: 2, size });
  const last = edge.find((b) => b.x === 1 && b.z === 2);
  for (const b of edge) if (b !== last) t.place("minecraft:oak_planks", b.x, b.y, b.z);

  // On a corner, next to the gap; its starter chest lands outside the trampoline.
  const player = t.player("Builder", 1, 1);
  t.hold(player, "minecraft:birch_planks", 1);
  await t.wait(5);
  t.assert(player.useItemInSlotOnBlock(0, t.at(last.x, -1, last.z), Direction.Up), "The player couldn't place the last edge block");
  return { player, edge };
}

export async function aFinishedTrampolineTurnsBlack(t) {
  const { edge } = await buildTrampoline(t);
  const typeAt = (b) => t.dimension.getBlock(t.at(b.x, b.y, b.z))?.typeId;
  await t.until(
    () => edge.every((b) => typeAt(b) === FINISHED_EDGE),
    () => `The edge didn't turn black: ${edge.map(typeAt).join(", ")}`,
  );
}

export async function theBlackTrampolineStillBounces(t) {
  const { player } = await buildTrampoline(t);
  await t.wait(10);
  player.teleport(t.at(2.5, 1, 2.5));
  const startY = player.location.y;
  await t.until(() => player.location.y > startY + 2, "The player didn't bounce on the black trampoline");
}

export async function aNewPlayerGetsAStarterChestWithTheOtherModsToo(t) {
  const player = t.player("Newcomer", -4, -4);
  const chest = () => {
    const { x, y, z } = player.location;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const block = t.dimension.getBlock({ x: Math.floor(x) + dx, y: Math.floor(y), z: Math.floor(z) + dz });
      if (block?.typeId === "minecraft:chest") return block.getComponent("minecraft:inventory")?.container;
    }
  };
  await t.until(() => chest(), "No starter chest appeared next to the new player", 100);
  const container = chest();
  const inside = new Set();
  for (let slot = 0; slot < (container?.size ?? 0); slot++) {
    const item = container?.getItem(slot);
    if (item) inside.add(item.typeId);
  }
  const missing = ["minecraft:slime", "family:drill", "family:golden_feather", "family:pistol", "family:bullet", "family:grenade"].filter((item) => !inside.has(item));
  t.assert(missing.length === 0, `The starter chest is missing ${missing.join(", ")}`);
}
