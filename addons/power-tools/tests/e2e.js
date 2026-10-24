// Played by simulated players on the test server: mc test power-tools
import { Direction, ItemStack } from "@minecraft/server";

/** Puts `block` in front of a player holding `tool`, breaks it, and returns how many ticks it took and what dropped. */
async function dig(t, tool, block, { giveUpAfter = 40 } = {}) {
  const player = t.player("Digger");
  player.setItem(new ItemStack(tool, 1), 0, true);
  t.place(block, 0, 1, 2);
  await t.wait(10);
  player.lookAtBlock(t.at(0, 1, 2));
  player.breakBlock(t.at(0, 1, 2), Direction.North);
  let ticks = 0;
  while (t.dimension.getBlock(t.at(0, 1, 2))?.typeId === block && ticks < giveUpAfter) {
    await t.wait(1);
    ticks++;
  }
  player.stopBreakingBlock();
  await t.wait(5);
  const drops = t.entities("minecraft:item").map((item) => item.getComponent("minecraft:item")?.itemStack.typeId);
  return { ticks, broken: ticks < giveUpAfter, drops };
}

export async function theDrillBreaksStoneAlmostInstantly(t) {
  const { ticks, drops } = await dig(t, "family:drill", "minecraft:stone");
  t.assert(ticks <= 3, `Stone took ${ticks} ticks with the drill; it should be almost instant`);
  t.assert(drops.includes("minecraft:cobblestone"), `Stone should drop cobblestone, but dropped: ${drops.join(", ") || "nothing"}`);
}

export async function theDrillBreaksDeepslateAtOnce(t) {
  const { ticks, drops } = await dig(t, "family:drill", "minecraft:deepslate");
  t.assert(ticks <= 2, `Deepslate took ${ticks} ticks with the drill; it should break at once, like stone`);
  t.assert(drops.includes("minecraft:cobbled_deepslate"), `Deepslate should drop cobbled deepslate, but dropped: ${drops.join(", ") || "nothing"}`);
}

export async function theDrillBreaksCobbledDeepslateAtOnce(t) {
  const { ticks } = await dig(t, "family:drill", "minecraft:cobbled_deepslate");
  t.assert(ticks <= 2, `Cobbled deepslate took ${ticks} ticks with the drill; it should break at once, like stone`);
}

export async function theDrillBreaksDeepslateOreAtOnce(t) {
  const { ticks, drops } = await dig(t, "family:drill", "minecraft:deepslate_diamond_ore");
  t.assert(ticks <= 2, `Deepslate diamond ore took ${ticks} ticks with the drill; it should break at once, like stone`);
  t.assert(drops.includes("minecraft:diamond"), `Deepslate diamond ore should drop a diamond, but dropped: ${drops.join(", ") || "nothing"}`);
}

export async function theDrillMinesDiamondsLikeADiamondPickaxe(t) {
  const { drops } = await dig(t, "family:drill", "minecraft:diamond_ore");
  t.assert(drops.includes("minecraft:diamond"), `Diamond ore should drop a diamond, but dropped: ${drops.join(", ") || "nothing"}`);
}

export async function theChainsawCutsLogsAlmostInstantly(t) {
  const { ticks, drops } = await dig(t, "family:chainsaw", "minecraft:oak_log");
  t.assert(ticks <= 3, `An oak log took ${ticks} ticks with the chainsaw; it should be almost instant`);
  t.assert(drops.includes("minecraft:oak_log"), `The log should drop, but dropped: ${drops.join(", ") || "nothing"}`);
}

export async function theChainsawCutsLeavesAlmostInstantly(t) {
  const { ticks } = await dig(t, "family:chainsaw", "minecraft:oak_leaves");
  t.assert(ticks <= 3, `Oak leaves took ${ticks} ticks with the chainsaw; they should be almost instant`);
}

export async function theChainsawIsNoGoodOnStone(t) {
  const { ticks } = await dig(t, "family:chainsaw", "minecraft:stone", { giveUpAfter: 15 });
  t.assert(ticks >= 15, `Stone broke in ${ticks} ticks with the chainsaw; that's the drill's job`);
}

export async function thePowerShovelDigsDirtAlmostInstantly(t) {
  const { ticks, drops } = await dig(t, "family:power_shovel", "minecraft:dirt");
  t.assert(ticks <= 3, `Dirt took ${ticks} ticks with the power shovel; it should be almost instant`);
  t.assert(drops.includes("minecraft:dirt"), `Dirt should drop, but dropped: ${drops.join(", ") || "nothing"}`);
}

export async function thePowerShovelDigsGravelToo(t) {
  const { ticks } = await dig(t, "family:power_shovel", "minecraft:gravel");
  t.assert(ticks <= 3, `Gravel took ${ticks} ticks with the power shovel; it should be almost instant`);
}

export async function thePowerShovelIsNoGoodOnStone(t) {
  const { ticks } = await dig(t, "family:power_shovel", "minecraft:stone", { giveUpAfter: 15 });
  t.assert(ticks >= 15, `Stone broke in ${ticks} ticks with the power shovel; that's the drill's job`);
}

/** Hits a husk once with `tool` and returns how much health it took. */
async function whack(t, tool) {
  const player = t.player("Fighter");
  player.setItem(new ItemStack(tool, 1), 0, true);
  const mob = t.dimension.spawnEntity("minecraft:husk", t.at(0.5, 0, 2));
  await t.wait(10);
  const health = () => mob.getComponent("minecraft:health")?.currentValue ?? 0;
  const full = health();
  player.lookAtEntity(mob);
  player.attackEntity(mob);
  await t.until(() => !mob.isValid || health() < full, `The ${tool} never hurt the husk`, 20);
  return mob.isValid ? full - health() : full;
}

export async function theDrillHitsHard(t) {
  const took = await whack(t, "family:drill");
  t.assert(took >= 12, `A drill hit took ${took.toFixed(1)} health; it should take about 15 (a diamond sword takes 8)`);
}

export async function theChainsawHitsHarder(t) {
  const took = await whack(t, "family:chainsaw");
  t.assert(took >= 15, `A chainsaw hit took ${took.toFixed(1)} health; it should take about 18`);
}

export async function thePowerShovelHitsHardToo(t) {
  const took = await whack(t, "family:power_shovel");
  t.assert(took >= 10, `A power shovel hit took ${took.toFixed(1)} health; it should take about 12`);
}
