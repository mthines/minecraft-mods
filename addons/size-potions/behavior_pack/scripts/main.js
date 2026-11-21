import { system, world } from "@minecraft/server";

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const DURATION = 12 * 60; // seconds the size lasts (12 minutes). Every potion starts it over.
const SHORT_DURATION = 3; // for players tagged family:short_potions (the e2e tests)
const WARN_AT = 60; // seconds left when you're told it's about to wear off
const COUNTDOWN_AT = 5; // seconds left when the last countdown starts
const LEFT = "family:size_left"; // dynamic property: seconds left, so a /reload keeps counting down
const LEVEL = "family:size_level"; // dynamic property: which size step you're on, see SCALES

// Each potion moves you one step on this ladder, from where you are now: a grow potion is 2.5 times bigger than you
// were (up to 10 times normal), a shrink potion 2.5 times smaller (down to a tenth). Level 0 is your normal size.
// player.json has one component group per step (scale, speed and collision box), and an event for each: family:size_p1,
// family:size_n3 and so on (p is bigger, n is smaller), and family:normal_size for level 0. The scales here must match it.
// Scripts can only read a player's scale, not set it, so the steps are fixed in player.json.
const SCALES = { "-3": 0.1, "-2": 0.16, "-1": 0.4, 0: 1, 1: 2.5, 2: 6.25, 3: 10 };
const MIN_LEVEL = -3;
const MAX_LEVEL = 3;
// The camera follows from just behind your head at your new height (cameras/presets/size_*_view.json set how far behind).
// Normal eyes are 1.62 blocks up.
const stepName = (level) => `size_${level < 0 ? "n" : "p"}${Math.abs(level)}`;
const EYES = 1.62;

const POTIONS = { "family:shrink_potion": -1, "family:grow_potion": 1 };

/** Cameras throw for simulated players (no screen), so a failed camera never stops the potion. */
function setView(player, level) {
  try {
    if (level !== 0) player.camera.setCamera(`family:${stepName(level)}_view`, { entityOffset: { x: 0, y: EYES * SCALES[level], z: 0 }, viewOffset: { x: 0, y: 0 } });
    else player.camera.clear();
  } catch {}
}

/** @param {import("@minecraft/server").Player} player */
function backToNormal(player) {
  player.triggerEvent("family:normal_size");
  setView(player, 0);
  player.setDynamicProperty(LEFT, undefined);
  player.setDynamicProperty(LEVEL, undefined);
  player.removeEffect("jump_boost");
  player.removeEffect("strength");
}

/** @param {import("@minecraft/server").Player} player */
function pop(player) {
  backToNormal(player);
  player.dimension.playSound("random.pop", player.location, { pitch: 0.8 });
  player.dimension.spawnParticle("minecraft:explosion_particle", player.location);
  player.onScreenDisplay.setActionBar("§ePop! You're back to your normal size.");
}

world.afterEvents.itemCompleteUse.subscribe(({ itemStack, source: player }) => {
  const step = POTIONS[itemStack?.typeId];
  if (!step || !player) return;
  const before = player.getDynamicProperty(LEVEL) ?? 0;
  const level = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, before + step));
  console.log(JSON.stringify({ "event.name": "minecraft.size_potions.drunk", "minecraft.player.name": player.name, "minecraft.potion.type": itemStack.typeId, "minecraft.size.scale": SCALES[level] }));

  if (level === 0) {
    backToNormal(player);
    player.dimension.playSound("random.pop", player.location, { pitch: 1.2 });
    player.onScreenDisplay.setActionBar("§eYou're back to your normal size.");
    return;
  }
  const seconds = player.hasTag("family:short_potions") ? SHORT_DURATION : DURATION;
  if (level !== before) {
    player.triggerEvent(`family:${stepName(level)}`);
    setView(player, level);
    player.setDynamicProperty(LEVEL, level);
  }
  player.setDynamicProperty(LEFT, seconds); // every potion, even one that changes nothing, starts the time over
  if (level > 0) {
    player.addEffect("jump_boost", seconds * SECONDS, { amplifier: level + 1, showParticles: false });
    player.addEffect("strength", seconds * SECONDS, { amplifier: level, showParticles: false });
  } else {
    player.removeEffect("jump_boost");
    player.removeEffect("strength");
  }
  player.dimension.playSound("random.levelup", player.location, { pitch: step > 0 ? 0.5 : 2 });
  const size = `${SCALES[level]}x`;
  if (level === before) player.onScreenDisplay.setActionBar(step > 0 ? `§aYou can't get any bigger: you're already ${size} HUGE!` : `§dYou can't get any smaller: you're already ${size}!`);
  else player.onScreenDisplay.setActionBar(step > 0 ? `§aYou grow to ${size} your normal size!` : `§dYou shrink to ${size} your normal size!`);
});

// Once a second: count down, warn a minute before the end and count the last seconds, then pop back to normal size.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!player?.isValid) continue; // NPCs come through as undefined
    const left = player.getDynamicProperty(LEFT);
    if (typeof left !== "number") continue;
    if (left <= 1) {
      pop(player);
      continue;
    }
    player.setDynamicProperty(LEFT, left - 1);
    if (left - 1 === WARN_AT) {
      player.sendMessage("§eYour size potion wears off in 1 minute! Drink another to start the time over.");
      player.onScreenDisplay.setActionBar("§eYour potion wears off in 1 minute!");
      player.playSound("random.orb", { pitch: 0.8 });
    }
    if (left - 1 <= COUNTDOWN_AT) {
      player.onScreenDisplay.setActionBar(`§eYour potion wears off in ${left - 1}...`);
      player.playSound("random.click", { pitch: 1.5 });
    }
  }
}, SECONDS);

// Joining again, or coming back after dying, always starts at normal size.
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  if (!player?.isValid) return;
  if (player.getDynamicProperty(LEFT) !== undefined || (player.getComponent("minecraft:scale")?.value ?? 1) !== 1) backToNormal(player);
});
