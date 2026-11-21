// Played by simulated players on the test server: mc test bathroom
import { Direction } from "@minecraft/server";

const TOILET = "family:toilet";
const SINK = "family:sink";
const SHOWER = "family:shower";

export async function placingTheItemPutsAToiletDown(t) {
  const player = t.player();
  t.hold(player, TOILET);
  player.useItemInSlotOnBlock(0, t.at(0, -1, 2), Direction.Up);
  await t.until(() => t.entities(TOILET).length === 1, "No toilet appeared after using the item on the ground");
}

export async function sittingOnTheToiletForAWhileMakesYouFast(t) {
  const toilet = t.dimension.spawnEntity(TOILET, t.at(0, 0, 2));
  const player = t.player();
  await t.wait(5);
  player.interactWithEntity(toilet);
  await t.until(() => player.getComponent("minecraft:riding")?.entityRidingOn?.typeId === TOILET, "The player didn't sit on the toilet");
  await t.wait(80); // longer than the shortest visit that counts
  t.assert(!player.getEffect("speed"), "No speed yet while still sitting");
  toilet.getComponent("minecraft:rideable").ejectRiders();
  await t.until(() => player.getEffect("speed"), "Getting up after a long sit should give speed", 40);
}

export async function aQuickVisitGivesNoSpeed(t) {
  const toilet = t.dimension.spawnEntity(TOILET, t.at(0, 0, 2));
  const player = t.player();
  await t.wait(5);
  player.interactWithEntity(toilet);
  await t.until(() => player.getComponent("minecraft:riding")?.entityRidingOn?.typeId === TOILET, "The player didn't sit on the toilet");
  await t.wait(10);
  toilet.getComponent("minecraft:rideable").ejectRiders();
  await t.wait(30);
  t.assert(!player.getEffect("speed"), "A quick visit shouldn't give speed");
}

export async function aShowerPutsOutAPlayerOnFire(t) {
  const shower = t.dimension.spawnEntity(SHOWER, t.at(0, 0, 2));
  const player = t.player();
  await t.wait(5);
  t.assert(player.interactWithEntity(shower), "The player couldn't use the shower");
  await t.wait(5);
  player.teleport(t.at(0.5, 0, 2.5));
  player.setOnFire(20, true);
  await t.until(() => !player.isOnFire, "The shower should put out the fire", 60);
}

export async function theSinkCanBeUsed(t) {
  const sink = t.dimension.spawnEntity(SINK, t.at(0, 0, 2));
  const player = t.player();
  await t.wait(5);
  t.assert(player.interactWithEntity(sink), "The player couldn't use the sink");
  await t.wait(40); // its sounds play without script errors (the run reports those at the end)
}

export async function sneakingAndHittingPicksItUp(t) {
  const sink = t.dimension.spawnEntity(SINK, t.at(0, 0, 2));
  const player = t.player();
  await t.wait(5);
  player.isSneaking = true;
  player.attackEntity(sink);
  await t.until(() => !sink.isValid, "The sink is still there after sneak-hitting it");
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const items = [...Array(inventory?.size ?? 0).keys()].map((i) => inventory?.getItem(i)?.typeId);
  t.assert(items.includes(SINK), `The sink isn't in the player's inventory: ${items.filter(Boolean).join(", ") || "empty"}`);
}
