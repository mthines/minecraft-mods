// Played by simulated players on the test server: mc test portal-gun
import { ItemStack } from "@minecraft/server";

/** Two stone walls facing each other across the arena: one 5 blocks south of the middle, one 6 blocks north. */
function buildWalls(t) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = 0; dy <= 2; dy++) {
      t.place("minecraft:stone", dx, dy, 5);
      t.place("minecraft:stone", dx, dy, -6);
    }
  }
}

/** Turns the player to a spot, until it really does. */
async function aim(t, player, spot) {
  await t.until(() => {
    player.lookAtLocation(spot);
    const from = player.getHeadLocation();
    const d = { x: spot.x - from.x, y: spot.y - from.y, z: spot.z - from.z };
    const look = player.getViewDirection();
    return (look.x * d.x + look.y * d.y + look.z * d.z) / Math.hypot(d.x, d.y, d.z) > 0.9995;
  }, "The test player never turned to the wall", 20);
}

/** Shoots a portal at a spot: blue, or orange while sneaking. */
async function shoot(t, player, spot, orange = false) {
  await aim(t, player, spot);
  player.isSneaking = orange;
  t.assert(player.useItemInSlot(0), "Couldn't press Use");
  await t.wait(2);
  player.stopUsingItem();
  player.isSneaking = false;
  await t.wait(20); // a simulated player can't use an item again right away
}

export async function walkingIntoTheBluePortalComesOutOfTheOrangeOne(t) {
  buildWalls(t);
  const player = t.player("Portal");
  t.hold(player, "family:portal_gun");
  await t.wait(10);
  await shoot(t, player, t.at(0.5, 0.5, 5)); // the south wall's face
  await shoot(t, player, t.at(0.5, 0.5, -5), true); // the north wall's face

  player.move(0, 1); // walk south, into the blue portal
  await t.until(() => player.location.z < t.at(0, 0, -3).z, () => `The player never came out of the orange portal (at z ${(player.location.z - t.origin.z).toFixed(1)})`, 120);
  player.stopMoving();
  t.assert(Math.abs(player.location.x - t.at(0.5).x) < 1, "The player came out beside the orange portal");
}

export async function aPigAndADroppedItemFallThroughAFloorPortal(t) {
  buildWalls(t);
  const player = t.player("Portal");
  t.hold(player, "family:portal_gun");
  await t.wait(10);
  await shoot(t, player, t.at(-2.5, 0, 0.5)); // the ground 3 blocks west (the trampoline mod's starter chest can stand east of a new player)
  await shoot(t, player, t.at(0.5, 0.5, -5), true); // the north wall's face

  const pig = t.dimension.spawnEntity("minecraft:pig", t.at(-2.5, 0, 0.5));
  const item = t.dimension.spawnItem(new ItemStack("minecraft:apple", 1), t.at(-2.5, 0.3, 0.5));
  const outOfOrange = (entity) => entity.isValid && entity.location.z < t.at(0, 0, -3).z && Math.abs(entity.location.x - t.at(0.5).x) < 1.5;
  await t.until(() => outOfOrange(pig), () => `The pig never came out of the orange portal (at ${JSON.stringify(pig.location)})`);
  await t.until(() => outOfOrange(item), "The apple never came out of the orange portal");
}
