import { ItemStack, system, world } from "@minecraft/server";

const CAKE = "family:birthday_cake";
const FLAG = "family:dannebrog";
const BIRTHDAY_KID = "walter"; // lowercase: whoever's name has this in it gets a cake, a flag and the birthday outfit when they join. Change it for the next birthday.
const BIRTHDAY_NAME = "Walter";
const OUTFIT = ["birthday_hat", "birthday_shirt", "birthday_trousers", "birthday_boots"].map((name) => `family:${name}`);

const SECONDS = 20; // Minecraft counts time in ticks: 20 ticks = 1 second.
const RED = "minecraft:redstone_wire_dust_particle"; // these two particles have their own color: red, and white
const WHITE = "minecraft:basic_crit_particle";

// "Happy birthday" as [semitones above the first note, beats]. A beat is 6 ticks.
const SONG = [
  [0, 0.75], [0, 0.25], [2, 1], [0, 1], [5, 1], [4, 2],
  [0, 0.75], [0, 0.25], [2, 1], [0, 1], [7, 1], [5, 2],
  [0, 0.75], [0, 0.25], [12, 1], [9, 1], [5, 1], [4, 1], [2, 1],
  [10, 0.75], [10, 0.25], [9, 1], [5, 1], [7, 1], [5, 2],
];
const BEAT = 6;
const SONG_TICKS = SONG.reduce((sum, [, beats]) => sum + beats * BEAT, 0) + 2 * SECONDS;

let partyEndsAt = 0; // one song at a time: more cakes while it plays still give the effects, but no second song

function sound(dimension, id, location, options) {
  try {
    dimension.playSound(id, location, options);
  } catch {
    // the chunk may not be loaded
  }
}

function burst(dimension, center, particle) {
  // 12 particles in a ring, a few blocks up: bounded, and only a handful of bursts per party
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    try {
      dimension.spawnParticle(particle, { x: center.x + Math.cos(angle) * 2, y: center.y + 3, z: center.z + Math.sin(angle) * 2 });
    } catch {
      return; // the chunk isn't loaded
    }
  }
}

function startParty(player) {
  const dimension = player.dimension;
  const center = { ...player.location };
  const eachPlayer = world.getAllPlayers();

  for (const other of eachPlayer) {
    if (!other?.isValid) continue; // NPCs are undefined here
    other.onScreenDisplay.setTitle(`§cTillykke, §f${BIRTHDAY_NAME}§c!`, { subtitle: "§fHurra, hurra, hurra!", fadeInDuration: 5, stayDuration: 4 * SECONDS, fadeOutDuration: 10 });
  }

  // The song, in a harp, where the cake was eaten.
  let tick = 0;
  for (const [semitones, beats] of SONG) {
    system.runTimeout(() => sound(dimension, "note.harp", center, { pitch: 0.8 * 2 ** (semitones / 12), volume: 1.5 }), tick);
    tick += beats * BEAT;
  }
  // Red and white fireworks bursts and the pop, a few times during the song.
  for (let i = 0; i < 6; i++) {
    system.runTimeout(() => {
      burst(dimension, center, i % 2 === 0 ? RED : WHITE);
      sound(dimension, "firework.large_blast", center, { volume: 1 });
      sound(dimension, "firework.twinkle", center, { volume: 1 });
    }, i * 25);
  }
}

// Runs when a player finishes eating the cake.
world.afterEvents.itemCompleteUse.subscribe(({ itemStack, source: player }) => {
  if (itemStack?.typeId !== CAKE || !player?.isValid) return;
  player.addEffect("speed", 30 * SECONDS, { amplifier: 1 });
  player.addEffect("jump_boost", 30 * SECONDS, { amplifier: 1 });
  player.addEffect("regeneration", 10 * SECONDS);
  player.onScreenDisplay.setActionBar("§cTillykke! §fHip hip hurra!");

  const first = system.currentTick >= partyEndsAt;
  if (first) {
    partyEndsAt = system.currentTick + SONG_TICKS;
    startParty(player);
  }
  console.log(JSON.stringify({ "event.name": "minecraft.birthday.cake_eaten", "minecraft.player.name": player.name, "minecraft.birthday.party_started": first }));
});

/**
 * The Danish flag, hung on a pole in front of the player: 14 wide and 10 high, with the white cross' upright
 * nearer the pole like the real one. `keep` only fills air, so it never breaks what someone built.
 * @param {import("@minecraft/server").Player} player
 */
function raiseFlag(player) {
  const hit = player.getBlockFromViewDirection({ maxDistance: 40 });
  if (!hit) {
    player.onScreenDisplay.setActionBar("§cPeg på jorden for at sætte flaget op");
    return false;
  }
  const base = hit.block.above(); // the pole stands on the block that was hit
  const look = player.getViewDirection();
  // The flag goes to the player's right, so it reads the right way round from where they stand.
  const alongX = Math.abs(look.z) > Math.abs(look.x);
  const sign = alongX ? (look.z > 0 ? -1 : 1) : look.x > 0 ? 1 : -1;
  const at = (column, up) => (alongX ? `${base.x + sign * column} ${base.y + up} ${base.z}` : `${base.x} ${base.y + up} ${base.z + sign * column}`);
  const commands = [
    `fill ${at(0, 0)} ${at(0, 13)} oak_fence keep`,
    // the white cross first: `keep` doesn't paint over what's there, so the red fills what's left
    `fill ${at(5, 4)} ${at(6, 13)} white_wool keep`,
    `fill ${at(1, 8)} ${at(14, 9)} white_wool keep`,
    `fill ${at(1, 4)} ${at(14, 13)} red_wool keep`,
  ];
  try {
    for (const command of commands) player.dimension.runCommand(command);
  } catch {
    player.onScreenDisplay.setActionBar("§cDer er ikke plads til flaget her");
    return false;
  }
  sound(player.dimension, "random.levelup", base, { volume: 1 });
  return true;
}

const lastFlag = new Map(); // player id -> tick, so one click doesn't put up two flags
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack?.typeId !== FLAG || !player?.isValid) return;
  if (system.currentTick - (lastFlag.get(player.id) ?? -100) < 10) return;
  lastFlag.set(player.id, system.currentTick);
  if (raiseFlag(player) && player.getGameMode?.() !== "Creative") {
    const container = player.getComponent("minecraft:inventory")?.container;
    const slot = player.selectedSlotIndex;
    const stack = container?.getItem(slot);
    if (stack?.typeId === FLAG) {
      if (stack.amount > 1) {
        stack.amount -= 1;
        container.setItem(slot, stack);
      } else container.setItem(slot, undefined);
    }
  }
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => lastFlag.delete(playerId));

function has(player, typeId) {
  const container = player.getComponent("minecraft:inventory")?.container;
  for (let slot = 0; slot < (container?.size ?? 0); slot++) if (container.getItem(slot)?.typeId === typeId) return true;
  return false;
}

function worn(player, typeId) {
  const equipment = player.getComponent("minecraft:equippable");
  return ["Head", "Chest", "Legs", "Feet"].some((slot) => equipment?.getEquipment(slot)?.typeId === typeId);
}

// The birthday kid gets a cake, a flag and the birthday outfit when they join (or come back after dying), if they have none.
// Not for NPCs, nor e2e test players (family:e2e).
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  if (!player?.isValid || player.hasTag("family:npc") || player.hasTag("family:e2e")) return;
  if (!player.name.toLowerCase().includes(BIRTHDAY_KID)) return;
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  if (!has(player, CAKE)) container.addItem(new ItemStack(CAKE, 2));
  if (!has(player, FLAG)) container.addItem(new ItemStack(FLAG, 2));
  for (const piece of OUTFIT) if (!has(player, piece) && !worn(player, piece)) container.addItem(new ItemStack(piece, 1));
  player.onScreenDisplay.setTitle(`§cTillykke med fødselsdagen, §f${player.name}§c!`, { subtitle: "§fSpis kagen og sæt Dannebrog op", fadeInDuration: 10, stayDuration: 4 * SECONDS, fadeOutDuration: 20 });
});
