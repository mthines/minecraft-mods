import { ButtonState, EntityDamageCause, GameMode, InputButton, ItemStack, system, world } from "@minecraft/server";
import { fresh, glide, step } from "./jump.js";
import { emit } from "./telemetry.js";

const FEATHER = "family:golden_feather";
const SPAWN_FEATHERS = 10; // everyone has at least this many golden feathers after joining or respawning
const FLAP = 0.7; // how hard a flap throws you up (a normal jump is about 0.42)
const KNOCKED_SINK = 0.077; // knocked along with no push up each tick, a player sinks a steady 0.077 blocks a tick
const PUSH_LIFT = 2.35; // each 0.01 of push up knocked in every tick sinks 0.0235 blocks a tick slower (measured in game)
const STEER = 0.2; // how quickly gliding turns to where you steer (1 = at once)
const KNOCKBACK_KEEPS = 0.73; // a player keeps about this much of a sideways knockback after air drag

/** @type {Map<string, import("./jump.js").JumpState>} */
const states = new Map();
/** @type {Map<string, { x: number, z: number, speed: number, fall: number }>} player id → their gliding velocity across, the speed it heads for, and blocks a tick down */
const glides = new Map();
/** @type {Map<string, number>} player id → the tick until which landing doesn't hurt: forever while they flap or glide, a moment after landing */
const softLanding = new Map();
/**
 * Input set by the e2e tests, whose simulated players can't hold buttons: player id → what they "press".
 * @type {Map<string, { jump: boolean, forward: number, left: number, crouch: boolean }>}
 */
const testInput = new Map();

system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (id !== "family:jump_input" || !sourceEntity) return;
  const [jump, forward = "0", left = "0", crouch] = message.split(" ");
  testInput.set(sourceEntity.id, { jump: jump === "down", forward: Number(forward), left: Number(left), crouch: crouch === "crouch" });
});

/** @param {import("@minecraft/server").Player} player */
function input(player) {
  const test = testInput.get(player.id);
  if (test) return test;
  try {
    const move = player.inputInfo.getMovementVector();
    const pressed = (button) => player.inputInfo.getButtonState(button) === ButtonState.Pressed;
    return { jump: pressed(InputButton.Jump), forward: move.y, left: move.x, crouch: pressed(InputButton.Sneak) };
  } catch {
    return { jump: false, forward: 0, left: 0, crouch: false };
  }
}

/** @param {import("@minecraft/server").Player} player */
function canFly(player) {
  if (player.isFlying || player.isGliding || player.isInWater || player.isSwimming || player.getComponent("minecraft:riding")) return false;
  const mode = player.getGameMode();
  return mode === GameMode.Survival || mode === GameMode.Adventure;
}

/** @param {import("@minecraft/server").Player} player */
function feathers(player) {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  let count = 0;
  for (let slot = 0; slot < (inventory?.size ?? 0); slot++) {
    const item = inventory?.getItem(slot);
    if (item?.typeId === FEATHER) count += item.amount;
  }
  return count;
}

/** Golden diamonds for flaps left, grey for used ones. */
const featherBar = (left, used) => `§6${"◆".repeat(left)}§8${"◆".repeat(used)}`;

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!player) continue; // NPCs (simulated players from the npc mod) come through as undefined in other mods
    const before = states.get(player.id) ?? fresh();
    const v = player.getVelocity();
    const onGround = player.isOnGround;
    const have = onGround ? 0 : feathers(player); // only counted in the air, where it matters
    const { jump, forward, left, crouch } = input(player);
    const { state, action } = step(before, { jump, onGround, falling: v.y < -0.05, feathers: have, canFly: canFly(player) });
    states.set(player.id, state);
    if (onGround && before.flaps > 0) player.onScreenDisplay.setActionBar("§6Feathers back!");
    if (onGround && softLanding.get(player.id) === Infinity) softLanding.set(player.id, system.currentTick + 5);
    if (action !== "glide") glides.delete(player.id);
    if (action === "none") continue;

    softLanding.set(player.id, Infinity);
    if (action === "flap") {
      player.applyKnockback({ x: v.x, z: v.z }, FLAP);
      player.dimension.spawnParticle("minecraft:cauldron_explosion_emitter", player.location);
      player.playSound("mob.phantom.flap", { pitch: 1.4, volume: 0.6 });
      player.onScreenDisplay.setActionBar(featherBar(have - state.flaps, state.flaps));
      emit("double_jump.flap", { "minecraft.player.name": player.name, "minecraft.feathers.left": have - state.flaps });
    } else {
      // Glide: steer with the movement keys, relative to where you look. Falling fast into it, or diving, makes it fast.
      // It dives while crouching (steeper the further down you look), or looking straight down.
      const look = player.getViewDirection();
      const flat = Math.hypot(look.x, look.z) || 1;
      const ahead = { x: look.x / flat, z: look.z / flat };
      const toLeft = { x: ahead.z, z: -ahead.x };
      let way = { x: ahead.x * forward + toLeft.x * left, z: ahead.z * forward + toLeft.z * left };
      const steering = Math.hypot(way.x, way.z) > 0.1;
      const across = glides.get(player.id) ?? { x: v.x, z: v.z, speed: Math.hypot(v.x, v.z), fall: -v.y };
      if (!steering) way = { x: across.x, z: across.z };
      const { speed, sink } = glide(across.speed, { fall: across.fall, pitch: -look.y, steering, crouching: crouch });
      // Turn the heading towards where you steer; the speed comes straight from the glide, which is smooth already.
      const unit = (p) => { const l = Math.hypot(p.x, p.z); return l > 0.001 ? { x: p.x / l, z: p.z / l } : undefined; };
      const was = unit(across) ?? unit(way) ?? { x: 0, z: 0 };
      const want = unit(way) ?? was;
      const heading = unit({ x: was.x + (want.x - was.x) * STEER, z: was.z + (want.z - was.z) * STEER }) ?? want;
      across.x = heading.x * speed;
      across.z = heading.z * speed;
      across.speed = speed;
      across.fall = sink;
      glides.set(player.id, across);
      // The glide keeps its own fall: the velocity the game reports back doesn't match what the knockback set.
      player.applyKnockback({ x: across.x / KNOCKBACK_KEEPS, z: across.z / KNOCKBACK_KEEPS }, (KNOCKED_SINK - sink) / PUSH_LIFT);
      if (before.wasDown !== jump || system.currentTick % 10 === 0) player.onScreenDisplay.setActionBar(featherBar(have - state.flaps, state.flaps));
    }
  }
}, 1);

// Spawning (joining, or coming back after dying) tops the golden feathers up, so everyone can fly straight away.
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  if (!player?.isValid || player.hasTag("family:npc")) return; // isValid: they may have left already
  const missing = SPAWN_FEATHERS - feathers(player);
  if (missing <= 0) return;
  player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(FEATHER, missing));
  player.onScreenDisplay.setActionBar(`§6${SPAWN_FEATHERS} golden feathers: jump in the air to fly!`);
  emit("double_jump.spawn_feathers", { "minecraft.player.name": player.name, "minecraft.feathers.given": missing });
});

// Like A Short Hike, coming down after flapping or gliding never hurts.
world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.damageSource.cause !== EntityDamageCause.fall) return;
  if ((softLanding.get(event.hurtEntity?.id ?? "") ?? 0) >= system.currentTick) event.cancel = true;
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  states.delete(playerId);
  glides.delete(playerId);
  softLanding.delete(playerId);
  testInput.delete(playerId);
});
