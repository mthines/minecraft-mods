import { system, world } from "@minecraft/server";

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const DURATION = 30; // seconds you stay tiny or giant
const SHORT_DURATION = 3; // for players tagged family:short_potions (the e2e tests)
const WARN_AT = 5; // seconds left when the countdown starts
const LEFT = "family:size_left"; // dynamic property: seconds left, so a /reload keeps counting down

// Each potion triggers an event in this mod's player.json, which swaps a component group with the
// scale and collision box. Scripts can only read a player's scale, not set it.
// The camera follows from just behind your head at your new height (cameras/presets/*_view.json set how far behind).
// Normal eyes are 1.62 blocks up; change `eyes` to move the view up or down.
const POTIONS = {
  "family:shrink_potion": { event: "family:shrink", message: "§dYou shrink down, tiny as a mouse!", camera: "family:tiny_view", eyes: 1.62 * 0.25 },
  "family:grow_potion": { event: "family:grow", message: "§aYou grow into a GIANT!", camera: "family:giant_view", eyes: 1.62 * 2.5 },
};

/** Cameras throw for simulated players (no screen), so a failed camera never stops the potion. */
function setView(player, potion) {
  try {
    if (potion) player.camera.setCamera(potion.camera, { entityOffset: { x: 0, y: potion.eyes, z: 0 }, viewOffset: { x: 0, y: 0 } });
    else player.camera.clear();
  } catch {}
}

/** @param {import("@minecraft/server").Player} player */
function backToNormal(player) {
  player.triggerEvent("family:normal_size");
  setView(player);
  player.setDynamicProperty(LEFT, undefined);
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
  const potion = POTIONS[itemStack?.typeId];
  if (!potion || !player) return;
  const seconds = player.hasTag("family:short_potions") ? SHORT_DURATION : DURATION;
  player.triggerEvent(potion.event); // drinking the other potion swaps straight to it
  setView(player, potion);
  player.setDynamicProperty(LEFT, seconds);
  if (potion.event === "family:grow") {
    player.addEffect("jump_boost", seconds * SECONDS, { amplifier: 2, showParticles: false });
    player.addEffect("strength", seconds * SECONDS, { amplifier: 1, showParticles: false });
  } else {
    player.removeEffect("jump_boost");
    player.removeEffect("strength");
  }
  player.dimension.playSound("random.levelup", player.location, { pitch: potion.event === "family:grow" ? 0.5 : 2 });
  player.onScreenDisplay.setActionBar(potion.message);
  console.log(JSON.stringify({ "event.name": "minecraft.size_potions.drunk", "minecraft.player.name": player.name, "minecraft.potion.type": itemStack.typeId }));
});

// Once a second: count down, warn near the end, and pop back to normal size.
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
    if (left - 1 <= WARN_AT) {
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
