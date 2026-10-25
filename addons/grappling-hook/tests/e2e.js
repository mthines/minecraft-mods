// Played by simulated players on the test server: mc test grappling-hook

const health = (entity) => entity.getComponent("minecraft:health")?.currentValue ?? 0;

/** Turns the player to a spot, until it really does. */
async function aim(t, player, spot) {
  await t.until(() => {
    player.lookAtLocation(spot);
    const from = player.getHeadLocation();
    const d = { x: spot.x - from.x, y: spot.y - from.y, z: spot.z - from.z };
    const look = player.getViewDirection();
    return (look.x * d.x + look.y * d.y + look.z * d.z) / Math.hypot(d.x, d.y, d.z) > 0.9995;
  }, "The test player never turned to where it aims", 20);
}

/** A stone wall 12 blocks ahead (south), 7 blocks high. */
function buildWall(t) {
  for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy < 7; dy++) t.place("minecraft:stone", dx, dy, 12);
}

export async function theHookPullsYouUpToAHighWall(t) {
  buildWall(t);
  const player = t.player("Hooker");
  t.hold(player, "family:grappling_hook");
  await t.wait(10);
  const start = player.location;
  const full = health(player);
  // The top of the wall's face, 7 blocks up.
  await aim(t, player, t.at(0.5, 6.5, 12));
  t.assert(player.useItemInSlot(0), "Couldn't press Use");
  player.stopUsingItem();
  await t.until(
    () => player.location.z > start.z + 9 && player.location.y > start.y + 4,
    () => `The hook didn't pull the player up to the wall: from ${fmt(start)} to ${fmt(player.location)}`,
  );
  // Let go at the top: they float down slowly, with no fall damage.
  await t.until(() => player.isOnGround, "The player never landed after letting go", 400);
  t.assert(health(player) >= full, `The player took fall damage after the hook (${health(player)} of ${full})`);
}

export async function sneakingLetsGoOfTheRope(t) {
  buildWall(t);
  const player = t.player("Sneaker");
  t.hold(player, "family:grappling_hook");
  await t.wait(10);
  const start = player.location;
  await aim(t, player, t.at(0.5, 1.5, 12));
  t.assert(player.useItemInSlot(0), "Couldn't press Use");
  player.stopUsingItem();
  await t.until(() => player.location.z > start.z + 2, "The hook didn't start pulling");
  player.isSneaking = true;
  await t.wait(15);
  t.assert(player.location.z < start.z + 9, `Sneaking didn't let go: the player still reached the wall (${fmt(player.location)})`);
}

export async function theHookPullsAMobToYou(t) {
  const player = t.player("Fisher");
  t.hold(player, "family:grappling_hook");
  const mob = t.dimension.spawnEntity("minecraft:husk", t.at(0.5, 0, 12.5));
  await t.wait(10);
  const before = mob.location.z;
  await aim(t, player, mob.getHeadLocation());
  t.assert(player.useItemInSlot(0), "Couldn't press Use");
  player.stopUsingItem();
  await t.until(() => mob.location.z < before - 3, () => `The husk wasn't pulled closer (z ${before.toFixed(1)} → ${mob.location.z.toFixed(1)})`, 40);
}

const fmt = ({ x, y, z }) => `${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`;
