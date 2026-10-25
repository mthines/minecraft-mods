// Played by simulated players on the test server: mc test double-jump
// Simulated players can't hold a button, so the tests "press" jump through a script event the mod listens for.
import { ItemStack } from "@minecraft/server";

/** @param {import("@minecraft/server").Player} player @param {"down" | "up"} jump @param {number} [forward] @param {boolean} [crouch] */
const press = (player, jump, forward = 0, crouch = false) => player.runCommand(`scriptevent family:jump_input ${jump} ${forward} 0${crouch ? " crouch" : ""}`);

/** How many golden feathers the player carries. */
function feathersOf(player) {
  const inventory = player.getComponent("minecraft:inventory").container;
  let count = 0;
  for (let slot = 0; slot < inventory.size; slot++) {
    const item = inventory.getItem(slot);
    if (item?.typeId === "family:golden_feather") count += item.amount;
  }
  return count;
}

/** A player carrying `feathers` golden feathers, instead of the 64 spawning gives. */
async function hiker(t, feathers, dx = 0, dz = 0) {
  const player = t.player("Hiker", dx, dz);
  await t.until(() => feathersOf(player) >= 64, "Spawning gave no golden feathers", 40);
  player.getComponent("minecraft:inventory").container.clearAll();
  if (feathers) player.getComponent("minecraft:inventory").container.setItem(9, new ItemStack("family:golden_feather", feathers));
  return player;
}

export async function spawningGivesFeathers(t) {
  const player = t.player("Hiker");
  await t.until(() => feathersOf(player) === 64, () => `A new player should get 64 golden feathers, but has ${feathersOf(player)}`, 40);
  player.getComponent("minecraft:inventory").container.clearAll();
  player.getComponent("minecraft:inventory").container.setItem(9, new ItemStack("family:golden_feather", 3)); // some used up
  player.kill();
  await t.wait(20);
  player.respawn();
  await t.until(() => feathersOf(player) === 64, () => `After respawning the player should have 64 golden feathers again, but has ${feathersOf(player)}`, 60);
}

/** Jumps from the ground and waits until the player is in the air. */
async function jumpUp(t, player) {
  await t.wait(10);
  player.jump();
  await t.until(() => !player.isOnGround, "The player never left the ground", 20);
  await t.wait(3);
}

/** Taps jump in the air `times` times. */
async function flap(player, t, times) {
  for (let i = 0; i < times; i++) {
    press(player, "down");
    await t.wait(1);
    press(player, "up");
    await t.wait(6);
  }
}

/** The highest the player gets in `ticks`, in blocks above the ground. */
async function peak(t, player, ticks) {
  let top = player.location.y;
  for (let i = 0; i < ticks; i++) {
    await t.wait(1);
    top = Math.max(top, player.location.y);
  }
  return top - t.origin.y;
}

export async function aNormalJumpStaysNormal(t) {
  const player = await hiker(t, 5);
  await jumpUp(t, player);
  const height = await peak(t, player, 15);
  t.assert(height < 1.6, `A normal jump reached ${height.toFixed(1)} blocks; it should be about 1.25`);
}

export async function eachFeatherIsAFlap(t) {
  const player = await hiker(t, 4);
  await jumpUp(t, player);
  await flap(player, t, 4);
  const height = await peak(t, player, 10);
  t.assert(height > 6, `Four flaps with four feathers only reached ${height.toFixed(1)} blocks`);
}

export async function moreFlapsThanFeathersDoNothing(t) {
  const player = await hiker(t, 1);
  await jumpUp(t, player);
  await flap(player, t, 4);
  const height = await peak(t, player, 10);
  t.assert(height < 4, `One feather should give one flap, but four presses reached ${height.toFixed(1)} blocks`);
}

export async function noFeathersNoFlap(t) {
  const player = await hiker(t, 0);
  await jumpUp(t, player);
  await flap(player, t, 1);
  const height = await peak(t, player, 10);
  t.assert(height < 1.6, `Without golden feathers a press in the air reached ${height.toFixed(1)} blocks`);
}

export async function holdingJumpGlidesDownSlowly(t) {
  const player = await hiker(t, 4);
  await jumpUp(t, player);
  await flap(player, t, 4);
  press(player, "down");
  await t.until(() => player.getVelocity().y < -0.05, "The player never started coming down", 40);
  await t.wait(10);
  const from = player.location.y;
  await t.wait(20);
  const perTick = (from - player.location.y) / 20;
  press(player, "up");
  t.assert(!player.isOnGround && perTick > 0.01 && perTick < 0.1, `Gliding sank ${perTick.toFixed(3)} blocks a tick; it should float down slowly and steadily, about 0.04`);
}

export async function glidingForwardIsFastAndNeverClimbs(t) {
  const player = await hiker(t, 4, 0, -12);
  player.lookAtLocation(t.at(0.5, 8, 12)); // looking up: gliding still mustn't climb
  await jumpUp(t, player);
  await flap(player, t, 4);
  press(player, "down", 1);
  await t.until(() => player.getVelocity().y < -0.05, "The player never started coming down", 40);
  const start = { ...player.location };
  let highest = start.y;
  for (let i = 0; i < 30; i++) {
    await t.wait(1);
    highest = Math.max(highest, player.location.y);
  }

  press(player, "up");
  const far = Math.hypot(player.location.x - start.x, player.location.z - start.z);
  t.assert(far > 7, `Gliding forward for 1.5 seconds only went ${far.toFixed(1)} blocks`);
  t.assert(highest - start.y < 0.3, `Gliding climbed ${(highest - start.y).toFixed(1)} blocks; only flaps go up`);
}

/** Flaps high, falls until coming down faster than `fall` blocks a tick, then glides forward: blocks across per tick. */
async function glideAfterFalling(t, fall, dx) {
  const player = await hiker(t, 8, dx, -12);
  player.lookAtLocation(t.at(dx + 0.5, 1.6, 12));
  await jumpUp(t, player);
  await flap(player, t, 8);
  await t.until(() => player.getVelocity().y < -fall, `The player never fell faster than ${fall}`, 80);
  press(player, "down", 1);
  await t.wait(5);
  const start = { ...player.location };
  await t.wait(15);
  press(player, "up");
  return Math.hypot(player.location.x - start.x, player.location.z - start.z) / 15;
}

export async function fallingFastIntoAGlideMakesItFaster(t) {
  const gentle = await glideAfterFalling(t, 0.05, 0);
  const fast = await glideAfterFalling(t, 0.7, 4);
  t.assert(fast > gentle * 1.25 && fast > 0.55, `Gliding after a fast fall went ${fast.toFixed(2)} blocks a tick, after a gentle one ${gentle.toFixed(2)}: the fall should turn into speed`);
}

/** Flaps high, then glides forward looking `degrees` down, maybe crouching: blocks sunk per tick once settled. */
async function sinkLookingDown(t, degrees, dx, crouch = false) {
  const player = await hiker(t, 8, dx, -12);
  // Simulated players ignore setRotation, so keep looking at a point that far down ahead.
  const aim = () => player.lookAtLocation({ ...player.location, y: player.location.y + 1.62 - 10 * Math.tan((degrees * Math.PI) / 180), z: player.location.z + 10 });
  const glideTicks = async (ticks) => { for (let i = 0; i < ticks; i++) { aim(); await t.wait(1); } };
  await jumpUp(t, player);
  await flap(player, t, 8);
  press(player, "down", 1, crouch);
  await t.until(() => player.getVelocity().y < -0.02, "The player never started coming down", 40);
  await glideTicks(10);
  const from = player.location.y;
  await glideTicks(10);
  press(player, "up");
  const pitch = Math.asin(-player.getViewDirection().y) * (180 / Math.PI);
  t.assert(Math.abs(pitch - degrees) < 3, `The player should look ${degrees}° down, but looked ${pitch.toFixed(0)}°`);
  t.assert(!player.isOnGround, `Gliding ${degrees}° down hit the ground`);
  return (from - player.location.y) / 10;
}

export async function onlyCrouchingOrLookingStraightDownDives(t) {
  const level = await sinkLookingDown(t, 0, 0);
  const wellDown = await sinkLookingDown(t, 60, 4);
  const straightDown = await sinkLookingDown(t, 85, 8);
  const crouched = await sinkLookingDown(t, 0, 12, true);
  const sinks = `level ${level.toFixed(3)}, 60° down ${wellDown.toFixed(3)}, 85° down ${straightDown.toFixed(3)}, crouching ${crouched.toFixed(3)} blocks a tick`;
  t.assert(wellDown < level + 0.02, `Looking well down without crouching should still float: ${sinks}`);
  t.assert(straightDown > level * 4, `Looking straight down should dive: ${sinks}`);
  t.assert(crouched > level * 3, `Crouching should dive: ${sinks}`);
}

export async function landingAfterFlappingDoesNotHurt(t) {
  const player = await hiker(t, 4);
  await jumpUp(t, player);
  await flap(player, t, 4);
  const health = () => player.getComponent("minecraft:health")?.currentValue ?? 0;
  const full = health();
  await t.until(() => player.isOnGround, "The player never came down", 200);
  await t.wait(5);
  t.assert(health() === full, `Landing after flapping hurt: health ${health()} of ${full}`);
}

export async function feathersComeBackOnLanding(t) {
  const player = await hiker(t, 1);
  await jumpUp(t, player);
  await flap(player, t, 1);
  await t.until(() => player.isOnGround, "The player never came down", 100);
  await jumpUp(t, player);
  await flap(player, t, 1);
  const height = await peak(t, player, 15);
  t.assert(height > 2.5, `After landing the feather should flap again, but the jump only reached ${height.toFixed(1)} blocks`);
}
