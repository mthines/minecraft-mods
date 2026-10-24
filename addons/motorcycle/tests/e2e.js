// Played by simulated players on the test server: mc test motorcycle
import { Direction } from "@minecraft/server";

const BIKE = "family:motorcycle";

export async function placingTheItemPutsAMotorcycleDown(t) {
  const player = t.player();
  t.hold(player, BIKE);
  player.useItemInSlotOnBlock(0, t.at(0, -1, 2), Direction.Up);
  await t.until(() => t.entities(BIKE).length === 1, "No motorcycle appeared after using the item on the ground");
}

export async function aPlayerCanGetOn(t) {
  const bike = t.dimension.spawnEntity(BIKE, t.at(0, 0, 2));
  const player = t.player();
  await t.wait(5);
  player.interactWithEntity(bike);
  await t.until(() => player.getComponent("minecraft:riding")?.entityRidingOn?.typeId === BIKE, "The player didn't get on the motorcycle");
}

export async function sneakingAndHittingPicksItUp(t) {
  const bike = t.dimension.spawnEntity(BIKE, t.at(0, 0, 2));
  const player = t.player();
  await t.wait(5);
  player.isSneaking = true;
  player.attackEntity(bike);
  await t.until(() => !bike.isValid, "The motorcycle is still there after sneak-hitting it");
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const items = [...Array(inventory?.size ?? 0).keys()].map((i) => inventory?.getItem(i)?.typeId);
  t.assert(items.includes(BIKE), `The motorcycle isn't in the player's inventory: ${items.filter(Boolean).join(", ") || "empty"}`);
}
