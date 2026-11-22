// Played by simulated players on the test server: mc test laser-drill
import { ItemStack } from "@minecraft/server";

const blockAt = (t, x, y, z) => t.dimension.getBlock(t.at(x, y, z))?.typeId;

/** Fills a box of blocks, `x, y, z` from the arena's middle. */
function fill(t, type, [x1, y1, z1], [x2, y2, z2]) {
  const a = t.at(x1, y1, z1);
  const b = t.at(x2, y2, z2);
  t.dimension.runCommand(`fill ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z} ${type}`);
}

/** Every block in the layer (x -1..1, y 0..2, at z) is `type`, or a message saying which isn't. */
function layerIs(t, type, z) {
  for (let x = -1; x <= 1; x++) for (let y = 0; y <= 2; y++) if (blockAt(t, x, y, z) !== type) return `${blockAt(t, x, y, z)} at ${x}, ${y}, ${z}, wanted ${type}`;
  return "";
}

/** A player holding the drill, facing a wall of stone that starts one block ahead and is 9 wide, 7 high and `depth` deep. */
async function setUp(t, depth = 20) {
  fill(t, "stone", [-4, 0, 2], [4, 6, 1 + depth]);
  const player = t.player("Driller");
  player.setItem(new ItemStack("family:laser_drill", 1), 0, true);
  await t.wait(10);
  player.lookAtLocation(t.at(0.5, 1.5, 10.5));
  await t.until(() => player.getViewDirection().z > 0.97, "The test player never turned to the wall", 20);
  return player;
}

export async function theDrillDigsATunnelThreeWideAndThreeHighWhileHeld(t) {
  const player = await setUp(t);
  t.assert(blockAt(t, 0, 1, 5) === "minecraft:stone", "The wall should be stone before the drill is used");
  player.useItemInSlot(0); // hold the button
  await t.until(() => blockAt(t, 0, 1, 12) === "minecraft:air", "The tunnel never got 12 blocks deep while the button was held", 60);
  player.stopUsingItem();
  for (const z of [2, 5, 9]) {
    const bad = layerIs(t, "minecraft:air", z);
    t.assert(!bad, `The tunnel should be clear 3 wide and 3 high at z ${z}, but ${bad}`);
  }
  t.assert(blockAt(t, 2, 1, 5) === "minecraft:stone" && blockAt(t, -2, 1, 5) === "minecraft:stone", "The tunnel is wider than 3");
  t.assert(blockAt(t, 0, 3, 5) === "minecraft:stone" && blockAt(t, 0, -1, 5) !== "minecraft:air", "The tunnel is higher than 3 (or digs the floor)");
}

export async function theDrillStopsWhenTheButtonIsReleased(t) {
  const player = await setUp(t, 30);
  player.useItemInSlot(0);
  await t.until(() => blockAt(t, 0, 1, 6) === "minecraft:air", "The drill never started", 40);
  player.stopUsingItem();
  await t.wait(10); // a step that was already on its way
  const depth = [...Array(30).keys()].reverse().find((i) => blockAt(t, 0, 1, 2 + i) === "minecraft:air");
  await t.wait(30);
  t.assert(blockAt(t, 0, 1, 2 + depth + 1) === "minecraft:stone", "The tunnel kept getting longer after the button was released");
}

export async function theDrillDigsObsidianAndDeepslateButNotBedrockOrWater(t) {
  const player = await setUp(t, 20);
  fill(t, "obsidian", [-1, 0, 4], [1, 2, 5]);
  fill(t, "deepslate", [-1, 0, 6], [1, 2, 7]);
  fill(t, "bedrock", [0, 1, 8], [0, 1, 8]);
  fill(t, "water", [0, 1, 10], [0, 1, 10]);
  fill(t, "chest", [1, 0, 12], [1, 0, 12]);
  player.useItemInSlot(0);
  await t.until(() => blockAt(t, 0, 1, 16) === "minecraft:air", "The tunnel never got past the water, bedrock and chest", 80);
  player.stopUsingItem();
  t.assert(!layerIs(t, "minecraft:air", 4), `The obsidian wasn't dug: ${layerIs(t, "minecraft:air", 4)}`);
  t.assert(!layerIs(t, "minecraft:air", 7), `The deepslate wasn't dug: ${layerIs(t, "minecraft:air", 7)}`);
  t.assert(blockAt(t, 0, 1, 8) === "minecraft:bedrock", `The bedrock was dug (${blockAt(t, 0, 1, 8)})`);
  t.assert(blockAt(t, -1, 1, 8) === "minecraft:air" && blockAt(t, 1, 1, 8) === "minecraft:air", "The beam stopped at the bedrock instead of clearing around it");
  t.assert(blockAt(t, 0, 1, 10) === "minecraft:water", `The water source was cleared (${blockAt(t, 0, 1, 10)})`);
  t.assert(blockAt(t, 1, 0, 12) === "minecraft:chest", `The chest was dug (${blockAt(t, 1, 0, 12)})`);
}

export async function theDrillDigsDownAndUpWhenYouLookThatWay(t) {
  fill(t, "stone", [-3, -1, -3], [3, -1, 3]); // floor under the arena's middle
  const player = t.player("Digger");
  player.setItem(new ItemStack("family:laser_drill", 1), 0, true);
  await t.wait(10);
  fill(t, "stone", [-3, 8, -3], [3, 14, 3]);
  player.lookAtLocation(t.at(0.5, 20, 0.5));
  await t.until(() => player.getViewDirection().y > 0.97, "The test player never looked up", 20);
  player.useItemInSlot(0);
  await t.until(() => blockAt(t, 0, 12, 0) === "minecraft:air", "The shaft never got up through the ceiling", 60);
  player.stopUsingItem();
  t.assert(blockAt(t, 1, 10, 1) === "minecraft:air" && blockAt(t, 2, 10, 0) === "minecraft:stone", "The shaft isn't 3 wide");
}
