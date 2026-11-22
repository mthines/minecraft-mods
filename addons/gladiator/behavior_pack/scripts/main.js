// Gladiator: build a ring of sandstone around a gold block, stand inside with a friend, and both press a button.
// A countdown, a fan crowd, the same gear for both, and a fight where nobody really gets hurt: at 2 hearts you're knocked out.
import { EnchantmentType, EquipmentSlot, ItemLockMode, ItemStack, Player, system, world } from "@minecraft/server";
import { KO_HEALTH, MAX_HEALTH, capDamage, countsInFight, isKnockedOut } from "./fight.js";
import * as rankings from "./ranking.js";
import { backInside, crowdSpots, exitSpot, findRing, isButton, isInside, middleOf, MAX_RADIUS } from "./ring.js";
import { emit } from "./telemetry.js";

const FAN = "family:gladiator_fan";
const HOLDER = "family:gladiator_holder";
const GEAR_LORE = "§6Gladiator gear";
const STASH = "family:gladiator_stash"; // on the player: where their own things are, so they come back after any crash
const OWNER = "family:gladiator_owner"; // on the holder: whose things it keeps
const RANKING_KEY = "family:gladiator_ranking";

const READY_TICKS = 200; // the second press must come within 10 seconds of the first
const COUNTDOWN = 3;
const FIGHT_TICKS = 3 * 60 * 20; // a match nobody wins in 3 minutes is a draw
const CHECK_PERIOD = 5; // ticks between looks at the fighters
const MAX_STRIKES = 3; // times a fighter can leave the ring before they forfeit
const MAX_MATCHES = 4; // rings fighting at the same time
const NEARBY = 40; // blocks from the ring's middle that see the titles
const LINGER_TICKS = 100; // the fans cheer a little after the end, then go
const ANNOUNCE_VOLUME = 0.25; // horns and fanfares at full volume are painfully loud
const HOLDER_SLOTS = 54;
const EQUIPMENT = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]; // holder slots 36 to 40
const DIMENSIONS = ["overworld", "nether", "the_end"];

/**
 * @typedef {{ id: string, name: string, strikes: number }} Fighter
 * @typedef {{ key: string, dimension: string, ring: import("./ring.js").Ring, phase: "waiting" | "countdown" | "fight" | "over", fighters: Fighter[], crowd: string[], startTick: number, lastCheer: number, checks: number }} Match
 */

/** @type {Map<string, Match>} ring → its match (one per ring) */
const matches = new Map();
/** @type {Map<string, Match>} player id → the match they're in */
const inMatch = new Map();
/** @type {number | undefined} */
let loop;

const dimensionOf = (/** @type {Match} */ m) => world.getDimension(m.dimension);
const keyOf = (/** @type {string} */ dimension, /** @type {import("./ring.js").Ring} */ r) => `${dimension}:${r.x},${r.y},${r.z}`;

/** The player, if they're still here. NPCs and gone players give undefined. @param {string} id */
function playerOf(id) {
  const e = world.getEntity(id);
  return e?.isValid && e instanceof Player ? e : undefined;
}

/** @param {import("@minecraft/server").Dimension} dimension */
function typeAt(dimension) {
  return (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
    try {
      return dimension.getBlock({ x, y, z })?.typeId;
    } catch {
      return undefined; // not loaded
    }
  };
}

/** The y a person or fan stands at near x, z: on the ground next to the ring. */
function standY(/** @type {import("@minecraft/server").Dimension} */ dimension, x, z, y0) {
  for (let y = y0 + 3; y >= y0 - 3; y--) {
    try {
      const block = dimension.getBlock({ x: Math.floor(x), y, z: Math.floor(z) });
      if (block && !block.isAir && !block.isLiquid) return y + 1;
    } catch {
      return y0;
    }
  }
  return y0;
}

/** Players near the ring. NPCs (simulated players from the npc mod) come through as undefined in other mods. @param {Match} m */
const nearby = (m) => dimensionOf(m).getPlayers({ location: middleOf(m.ring), maxDistance: NEARBY }).filter(Boolean);

/** @param {Player[]} players @param {string} title @param {string} subtitle @param {string} [sound] */
function announce(players, title, subtitle, sound) {
  for (const player of players) {
    try {
      player.onScreenDisplay.setTitle(title, { subtitle, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
      if (sound) player.playSound(sound, { volume: ANNOUNCE_VOLUME });
    } catch {
      // gone
    }
  }
}

/** Sounds and particles are decoration: the chunk may not be loaded. @param {() => void} fn */
function decoration(fn) {
  try {
    fn();
  } catch {
    // not loaded, or an unknown particle
  }
}

// ---------------------------------------------------------------- ranking

/** @type {import("./ranking.js").Ranking | undefined} */
let ranking;
const board = () => (ranking ??= rankings.parse(world.getDynamicProperty(RANKING_KEY)));

function recordWin(/** @type {string} */ winner, /** @type {string} */ loser) {
  ranking = rankings.record(board(), winner, loser);
  world.setDynamicProperty(RANKING_KEY, JSON.stringify(ranking));
  system.sendScriptEvent("family:gladiator_ranking", JSON.stringify(ranking)); // for other mods and the tests: the ranking changed
}

const topMessage = () => (board().length === 0 ? "§7No gladiator has won yet." : `§6§lTop gladiators\n§r${rankings.lines(board()).join("\n")}`);

// `/scriptevent family:gladiator_top` shows the ranking to whoever ran it, or to everyone from a command block or the console.
system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity }) => {
  if (id !== "family:gladiator_top") return;
  if (sourceEntity instanceof Player) sourceEntity.sendMessage(topMessage());
  else world.sendMessage(topMessage());
});

// ---------------------------------------------------------------- your own things

/** A copy of an item with what a rebuild needs. Only used if the holder is lost: the real items are moved, not copied. @param {ItemStack} item @param {number} slot */
function describe(item, slot) {
  return {
    s: slot,
    t: item.typeId,
    a: item.amount,
    n: item.nameTag,
    l: item.getLore().slice(0, 4),
    e: item.getComponent("minecraft:enchantable")?.getEnchantments().map((e) => [e.type.id, e.level]),
    d: item.getComponent("minecraft:durability")?.damage,
  };
}

/** The sword, shield and armor both fighters get. Locked to the inventory and kept on death, so they can't be thrown away. */
function gear() {
  const make = (/** @type {string} */ type) => {
    const item = new ItemStack(type, 1);
    item.setLore([GEAR_LORE]);
    item.lockMode = ItemLockMode.inventory;
    item.keepOnDeath = true;
    return item;
  };
  return { sword: make("minecraft:iron_sword"), shield: make("minecraft:shield"), armor: ["minecraft:iron_helmet", "minecraft:iron_chestplate", "minecraft:iron_leggings", "minecraft:iron_boots"].map(make) };
}

/**
 * Moves everything a player owns (backpack, hotbar, armor, off hand) into a hidden holder at the ring's middle.
 * Items are moved between containers, so nothing is copied or lost: enchantments, names and contents stay as they are.
 * @param {Player} player @param {Match} m
 */
function stash(player, m) {
  const dimension = player.dimension;
  const mid = middleOf(m.ring);
  const holder = dimension.spawnEntity(HOLDER, { x: mid.x, y: mid.y + 1, z: mid.z });
  const holderBox = holder.getComponent("minecraft:inventory")?.container;
  const box = player.getComponent("minecraft:inventory")?.container;
  const worn = player.getComponent("minecraft:equippable");
  if (!holderBox || !box || !worn) {
    holder.remove();
    throw new Error("no containers");
  }
  holder.setDynamicProperty(OWNER, player.name);
  try {
    const backup = [];
    for (let i = 0; i < box.size; i++) {
      const item = box.getItem(i);
      if (!item) continue;
      backup.push(describe(item, i));
      box.moveItem(i, i, holderBox);
    }
    EQUIPMENT.forEach((slot, i) => {
      const item = worn.getEquipment(slot);
      if (!item) return;
      backup.push(describe(item, 36 + i));
      holderBox.setItem(36 + i, item);
      worn.setEquipment(slot, undefined);
    });
    for (let i = 0; i < box.size; i++) if (box.getItem(i)) throw new Error("something stayed in the backpack");
    let saved = JSON.stringify({ h: holder.id, d: dimension.id, x: mid.x, y: mid.y + 1, z: mid.z, items: backup });
    if (saved.length > 30000) saved = JSON.stringify({ h: holder.id, d: dimension.id, x: mid.x, y: mid.y + 1, z: mid.z, items: [] }); // too big to keep a copy: the holder is the real thing
    player.setDynamicProperty(STASH, saved);
  } catch (error) {
    giveBackFrom(player, holder); // put back what already moved
    throw error;
  }
}

/** Takes the fight gear away. @param {Player} player */
function removeGear(player) {
  const box = player.getComponent("minecraft:inventory")?.container;
  const worn = player.getComponent("minecraft:equippable");
  if (box) {
    for (let i = 0; i < box.size; i++) if (box.getItem(i)?.getLore().includes(GEAR_LORE)) box.setItem(i, undefined);
  }
  if (worn) {
    for (const slot of EQUIPMENT) if (worn.getEquipment(slot)?.getLore().includes(GEAR_LORE)) worn.setEquipment(slot, undefined);
  }
}

/** Moves everything in the holder back to the player, and removes the holder once it's empty. @param {Player} player @param {import("@minecraft/server").Entity} holder */
function giveBackFrom(player, holder) {
  const holderBox = holder.getComponent("minecraft:inventory")?.container;
  const box = player.getComponent("minecraft:inventory")?.container;
  const worn = player.getComponent("minecraft:equippable");
  if (!holderBox || !box || !worn) return false;
  removeGear(player);
  for (let i = 0; i < holderBox.size; i++) {
    const item = holderBox.getItem(i);
    if (!item) continue;
    if (i < 36 && !box.getItem(i)) {
      holderBox.moveItem(i, i, box);
    } else if (i >= 36 && i < 36 + EQUIPMENT.length && !worn.getEquipment(EQUIPMENT[i - 36])) {
      worn.setEquipment(EQUIPMENT[i - 36], item);
      holderBox.setItem(i, undefined);
    } else {
      // The slot has something else now (picked up during the fight): the item goes anywhere in the backpack, or on the floor.
      const left = box.addItem(item);
      holderBox.setItem(i, undefined);
      if (left) player.dimension.spawnItem(left, player.location);
    }
  }
  for (let i = 0; i < holderBox.size; i++) if (holderBox.getItem(i)) return false;
  holder.remove();
  player.setDynamicProperty(STASH, undefined);
  return true;
}

/** Rebuilds what the backup remembers: only when the holder is gone for good. @param {Player} player @param {{ items?: any[] }} data */
function rebuild(player, data) {
  const box = player.getComponent("minecraft:inventory")?.container;
  const worn = player.getComponent("minecraft:equippable");
  removeGear(player);
  for (const entry of data.items ?? []) {
    try {
      const item = new ItemStack(entry.t, entry.a);
      if (entry.n) item.nameTag = entry.n;
      if (entry.l?.length) item.setLore(entry.l);
      for (const [type, level] of entry.e ?? []) item.getComponent("minecraft:enchantable")?.addEnchantment({ type: new EnchantmentType(type), level });
      const durability = item.getComponent("minecraft:durability");
      if (durability && entry.d) durability.damage = entry.d;
      if (entry.s >= 36 && worn && !worn.getEquipment(EQUIPMENT[entry.s - 36])) worn.setEquipment(EQUIPMENT[entry.s - 36], item);
      else if (box) {
        const left = box.addItem(item);
        if (left) player.dimension.spawnItem(left, player.location);
      }
    } catch {
      // an item that no longer exists
    }
  }
  player.setDynamicProperty(STASH, undefined);
}

/** @param {Player} player */
function findHolder(player, data) {
  const known = world.getEntity(data.h);
  if (known?.isValid && known.typeId === HOLDER) return known;
  try {
    return world.getDimension(data.d).getEntities({ type: HOLDER, location: data, maxDistance: 6 }).find((e) => e.getDynamicProperty(OWNER) === player.name);
  } catch {
    return undefined;
  }
}

/**
 * Gives a player their things back if a fight left them in a holder: after a crash, a restart, a death or a disconnect.
 * The holder's chunk may not be loaded yet, so it loads a small area around it (a ticking area) and tries for a few seconds.
 * @param {Player} player
 */
function recover(player, attempt = 0) {
  if (!player.isValid || inMatch.has(player.id)) return;
  const raw = player.getDynamicProperty(STASH);
  if (typeof raw !== "string") return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    player.setDynamicProperty(STASH, undefined);
    return;
  }
  const area = "gladiator_recover";
  const dimension = world.getDimension(data.d);
  const holder = findHolder(player, data);
  if (holder) {
    if (giveBackFrom(player, holder)) {
      decoration(() => dimension.runCommand(`tickingarea remove ${area}`));
      player.sendMessage("§aYour things are back from the gladiator ring.");
      emit("gladiator.items_recovered", { "minecraft.player.name": player.name });
      return;
    }
  }
  if (attempt === 0) decoration(() => dimension.runCommand(`tickingarea add circle ${Math.floor(data.x)} ${Math.floor(data.y)} ${Math.floor(data.z)} 2 ${area}`));
  if (attempt < 10) {
    system.runTimeout(() => recover(player, attempt + 1), 20);
    return;
  }
  // The holder is gone (someone used /kill on it): rebuild from the copy kept on the player.
  decoration(() => dimension.runCommand(`tickingarea remove ${area}`));
  rebuild(player, data);
  player.sendMessage("§eYour things were rebuilt from a copy.");
  emit("gladiator.items_rebuilt", { "minecraft.player.name": player.name });
}

world.afterEvents.playerSpawn.subscribe(({ player }) => {
  if (!player) return; // an NPC
  system.runTimeout(() => {
    if (player.isValid) recover(player);
  }, 40);
});

// ---------------------------------------------------------------- the crowd

/** Takes away every fan near a ring, not only this match's. Also sweeps leftovers from a crash. @param {Match} m */
function removeFans(m) {
  for (const id of m.crowd) {
    try {
      world.getEntity(id)?.remove();
    } catch {
      // gone
    }
  }
  m.crowd = [];
  try {
    for (const fan of dimensionOf(m).getEntities({ type: FAN, location: middleOf(m.ring), maxDistance: m.ring.radius + 12 })) fan.remove();
  } catch {
    // not loaded
  }
}

/** @param {Match} m */
function spawnFans(m) {
  removeFans(m);
  const dimension = dimensionOf(m);
  for (const spot of crowdSpots(m.ring)) {
    try {
      const fan = dimension.spawnEntity(FAN, { x: spot.x, y: standY(dimension, spot.x, spot.z, m.ring.y), z: spot.z });
      fan.setRotation({ x: 0, y: spot.yaw });
      m.crowd.push(fan.id);
    } catch {
      // that spot isn't loaded: a smaller crowd
    }
  }
}

/** The fans cheer: a happy sound and sparkles over a few of them. At most once every few ticks per match. @param {Match} m */
function cheer(m, big = false) {
  const now = system.currentTick;
  if (!big && now - m.lastCheer < 8) return;
  m.lastCheer = now;
  const dimension = dimensionOf(m);
  decoration(() => dimension.playSound("random.orb", middleOf(m.ring), { volume: 0.5, pitch: 1 + Math.random() * 0.6 }));
  for (let i = 0; i < (big ? 4 : 2); i++) {
    const fan = world.getEntity(m.crowd[Math.floor(Math.random() * m.crowd.length)] ?? "");
    if (fan?.isValid) decoration(() => dimension.spawnParticle(Math.random() < 0.5 ? "minecraft:villager_happy" : "minecraft:heart_particle", { x: fan.location.x, y: fan.location.y + 2.2, z: fan.location.z }));
  }
}

/** A few bursts of sparkles and firework sounds over the ring: 3 bursts, 8 particles each. @param {Match} m */
function fireworks(m) {
  const dimension = dimensionOf(m);
  const mid = middleOf(m.ring);
  for (let burst = 0; burst < 3; burst++) {
    system.runTimeout(() => {
      decoration(() => dimension.playSound(burst === 1 ? "firework.twinkle" : "firework.blast", mid, { volume: 0.5 }));
      for (let i = 0; i < 8; i++) {
        decoration(() => dimension.spawnParticle("minecraft:totem_particle", { x: mid.x + (Math.random() - 0.5) * 6, y: mid.y + 3 + Math.random() * 3, z: mid.z + (Math.random() - 0.5) * 6 }));
      }
    }, burst * 10);
  }
}

// ---------------------------------------------------------------- starting

/** @param {Player} player @param {string} text */
const say = (player, text) => player.onScreenDisplay.setActionBar(text);

/** @type {Map<string, number>} player id → tick of their last press, so one press heard twice counts once */
const lastPress = new Map();

/** @param {Player} player @param {import("@minecraft/server").Block} block */
function pressed(player, block) {
  if (!isButton(block.typeId)) return;
  const now = system.currentTick;
  if (now - (lastPress.get(player.id) ?? -10) < 4) return;
  lastPress.set(player.id, now);
  const { x, y, z } = block.location;
  const ring = findRing(typeAt(block.dimension), x, y, z); // up to a couple of thousand lookups, only when a player presses a button
  if (ring) press(player, block.dimension.id, ring);
}

// A stone button stays pressed for a second and a pressed button sends no buttonPush, so two kids sharing one button
// could be counted once: using the block is heard too (the kit has two buttons, one each).
world.afterEvents.buttonPush.subscribe(({ block, source }) => {
  if (source instanceof Player) pressed(source, block);
});
world.afterEvents.playerInteractWithBlock.subscribe(({ block, player, isFirstEvent }) => {
  if (isFirstEvent && player) pressed(player, block);
});

/** Someone pressed the button of `ring`. @param {Player} player @param {string} dimension @param {import("./ring.js").Ring} ring */
function press(player, dimension, ring) {
  const key = keyOf(dimension, ring);
  if (!isInside(ring, player.location, -0.3)) return say(player, "§eStep inside the ring to fight");
  if (world.gameRules.pvp === false) return say(player, "§cFighting (PvP) is switched off in this world. Ask a grown-up to turn it on.");
  const mine = inMatch.get(player.id);
  let m = matches.get(key);
  if (mine && mine !== m) return say(player, "§eYou are already in a fight");

  if (m && m.phase !== "waiting") return say(player, "§eA fight is going on in this ring");
  if (m) {
    const first = m.fighters[0];
    if (first.id === player.id) return say(player, "§aYou are ready! §fWaiting for a challenger");
    const waiting = playerOf(first.id);
    if (waiting && isInside(ring, waiting.location, 0)) return accept(m, player);
    forget(m); // the first one left: this press starts a new wait
    m = undefined;
  }
  if (matches.size >= MAX_MATCHES) return say(player, "§eToo many fights at once. Try again in a moment");

  m = { key, dimension, ring, phase: "waiting", fighters: [{ id: player.id, name: player.name, strikes: 0 }], crowd: [], startTick: 0, lastCheer: 0, checks: 0 };
  matches.set(key, m);
  inMatch.set(player.id, m);
  say(player, "§aYou are ready! §fWaiting for a challenger");
  for (const other of nearby(m)) if (other.id !== player.id) other.sendMessage(`§e${player.name} wants to fight! Stand in the ring and press the button within 10 seconds.`);
  const waitingMatch = m;
  system.runTimeout(() => {
    if (waitingMatch.phase !== "waiting") return;
    const first = playerOf(waitingMatch.fighters[0].id);
    forget(waitingMatch);
    if (first) say(first, "§7Nobody accepted the challenge");
  }, READY_TICKS);
}

/** Drops a match that never got going. @param {Match} m */
function forget(m) {
  m.phase = "over";
  if (matches.get(m.key) === m) matches.delete(m.key);
  for (const f of m.fighters) if (inMatch.get(f.id) === m) inMatch.delete(f.id);
}

/** The second press: the fight is on. @param {Match} m @param {Player} second */
function accept(m, second) {
  m.fighters.push({ id: second.id, name: second.name, strikes: 0 });
  m.phase = "countdown";
  inMatch.set(second.id, m);
  spawnFans(m);
  decoration(() => dimensionOf(m).playSound("mob.villager.yes", middleOf(m.ring), { volume: 0.6 }));
  announce(nearby(m), "§6Gladiators, get ready!", `${m.fighters[0].name} vs ${m.fighters[1].name}`, "random.levelup");
  emit("gladiator.match_accepted", { "minecraft.player.name": m.fighters[0].name, "minecraft.gladiator.challenger": m.fighters[1].name });
  system.runTimeout(() => countdown(m, COUNTDOWN), 40);
}

/** @param {Match} m */
const fightersHere = (m) => {
  const players = m.fighters.map((f) => playerOf(f.id));
  return players.every((p) => p && isInside(m.ring, p.location, 0.5)) ? /** @type {Player[]} */ (players) : undefined;
};

/** Cancels a match before the fight: nothing was moved yet. @param {Match} m @param {string} why */
function cancel(m, why) {
  if (m.phase === "over") return;
  forget(m);
  removeFans(m);
  for (const f of m.fighters) {
    const p = playerOf(f.id);
    if (p) say(p, why);
  }
}

/** @param {Match} m @param {number} n seconds left */
function countdown(m, n) {
  if (m.phase !== "countdown") return;
  const players = fightersHere(m);
  if (!players) return cancel(m, "§eThe fight is off: someone left the ring");
  if (n > 0) {
    announce(nearby(m), `§e${n}`, "", "note.hat");
    system.runTimeout(() => countdown(m, n - 1), 20);
    return;
  }
  try {
    for (const player of players) stash(player, m);
  } catch (error) {
    for (const player of players) recover(player);
    cancel(m, "§cSomething went wrong, the fight is off. Your things are safe");
    console.warn(`gladiator: couldn't start a match: ${error}`);
    return;
  }
  const kit = gear();
  for (const player of players) {
    const box = player.getComponent("minecraft:inventory")?.container;
    const worn = player.getComponent("minecraft:equippable");
    box?.setItem(0, kit.sword.clone());
    worn?.setEquipment(EquipmentSlot.Offhand, kit.shield.clone());
    [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet].forEach((slot, i) => worn?.setEquipment(slot, kit.armor[i].clone()));
    player.selectedSlotIndex = 0;
    reset(player);
    // Hits do less (2 hearts is a long way from a hit), and the fight takes the whole 3 minutes at most.
    player.addEffect("resistance", FIGHT_TICKS + 100, { amplifier: 1, showParticles: false });
  }
  m.phase = "fight";
  m.startTick = system.currentTick;
  announce(nearby(m), "§c§lFIGHT!", "Knock out your opponent!", "raid.horn");
  loop ??= system.runInterval(checkFights, CHECK_PERIOD);
  emit("gladiator.match_started", { "minecraft.player.name": m.fighters[0].name, "minecraft.gladiator.challenger": m.fighters[1].name, "minecraft.gladiator.radius": m.ring.radius });
}

/** Full health, no effects, no fire. @param {Player} player */
function reset(player) {
  for (const effect of player.getEffects()) player.removeEffect(effect.typeId);
  player.getComponent("minecraft:health")?.resetToMaxValue();
  player.extinguishFire();
}

// ---------------------------------------------------------------- the fight

/** @param {string} id */
const fighterMatch = (id) => {
  const m = inMatch.get(id);
  return m?.phase === "fight" ? m : undefined;
};

// Only the other fighter's hits count. Everything else (a spectator's hit, a fall, a monster) does nothing to a fighter,
// and a fighter can't hurt a bystander. A hit from the other fighter is capped so it can never kill: this is the
// safety that works before the damage lands, so nobody dies, drops, or loses anything.
world.beforeEvents.entityHurt.subscribe((event) => {
  if (inMatch.size === 0) return;
  const hurt = event.hurtEntity;
  if (!hurt) return;
  const { cause, damagingEntity } = event.damageSource;
  const m = fighterMatch(hurt.id);
  if (m) {
    if (cause === "selfDestruct") return; // /kill is a grown-up's choice
    const opponent = m.fighters.find((f) => f.id !== hurt.id);
    if (!countsInFight(cause, damagingEntity?.id, opponent?.id ?? "")) {
      event.cancel = true;
      return;
    }
    // The life already shows the damage in this event (a 34 damage hit on 20 life reads -14), so the life before the hit is the two added.
    const before = (hurt.getComponent("minecraft:health")?.currentValue ?? MAX_HEALTH) + event.damage;
    event.damage = capDamage(before, event.damage);
    return;
  }
  if (damagingEntity && hurt.typeId === "minecraft:player" && fighterMatch(damagingEntity.id)) event.cancel = true;
});

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
  if (inMatch.size === 0 || !hurtEntity) return;
  const m = fighterMatch(hurtEntity.id);
  if (!m) return;
  const opponent = m.fighters.find((f) => f.id !== hurtEntity.id);
  if (!opponent || !countsInFight(damageSource.cause, damageSource.damagingEntity?.id, opponent.id)) return;
  cheer(m);
  // The life shows the hit one tick later: look then.
  system.run(() => {
    if (m.phase !== "fight" || !hurtEntity.isValid) return;
    if (isKnockedOut(hurtEntity.getComponent("minecraft:health")?.currentValue ?? MAX_HEALTH)) end(m, { winner: opponent, loser: m.fighters.find((f) => f.id === hurtEntity.id), why: "ko" });
  });
});

// A fighter who dies anyway (a grown-up's /kill): the other wins, and the dead one's things come back when they respawn.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (inMatch.size === 0 || !deadEntity) return;
  const m = fighterMatch(deadEntity.id);
  if (m) end(m, { winner: m.fighters.find((f) => f.id !== deadEntity.id), loser: m.fighters.find((f) => f.id === deadEntity.id), why: "died" });
}, { entityTypes: ["minecraft:player"] });

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  const m = inMatch.get(playerId);
  if (!m) return;
  if (m.phase === "fight") end(m, { winner: m.fighters.find((f) => f.id !== playerId), loser: m.fighters.find((f) => f.id === playerId), why: "left" });
  else cancel(m, "§eThe fight is off: someone left the game");
});

/** Every few ticks while a fight is on: look at the two fighters of each match, and nothing else. At most 4 matches, 2 players each. */
function checkFights() {
  let fights = 0;
  for (const m of [...matches.values()]) {
    if (m.phase !== "fight") continue;
    fights++;
    m.checks++;
    if (system.currentTick - m.startTick > FIGHT_TICKS) {
      end(m, { why: "draw" });
      continue;
    }
    for (const f of m.fighters) {
      if (m.phase !== "fight") break;
      const other = m.fighters.find((o) => o !== f);
      const p = playerOf(f.id);
      if (!p) {
        end(m, { winner: other, loser: f, why: "left" });
        break;
      }
      if (isKnockedOut(p.getComponent("minecraft:health")?.currentValue ?? MAX_HEALTH)) {
        end(m, { winner: other, loser: f, why: "ko" });
        break;
      }
      if (isInside(m.ring, p.location, 1)) continue;
      f.strikes++;
      if (f.strikes >= MAX_STRIKES) {
        end(m, { winner: other, loser: f, why: "forfeit" });
        break;
      }
      say(p, `§cStay inside the ring! (${f.strikes} of ${MAX_STRIKES})`);
      decoration(() => p.teleport(backInside(m.ring, p.location), { dimension: dimensionOf(m), facingLocation: middleOf(m.ring) }));
    }
    if (m.phase === "fight" && m.checks % 8 === 0) cheer(m);
  }
  if (fights === 0 && loop !== undefined) {
    system.clearRun(loop);
    loop = undefined;
  }
}

// ---------------------------------------------------------------- the end

/**
 * Ends a fight: everyone gets their own things back and full health, the loser is moved out of the ring, and the winner is champion.
 * @param {Match} m @param {{ winner?: Fighter, loser?: Fighter, why: string }} result
 */
function end(m, { winner, loser, why }) {
  if (m.phase === "over") return;
  forget(m);
  const dimension = dimensionOf(m);
  const mid = middleOf(m.ring);
  for (const f of m.fighters) {
    const p = playerOf(f.id);
    if (!p || (why === "died" && f === loser)) continue; // they come back to their things when they next join or respawn
    try {
      for (const effect of p.getEffects()) p.removeEffect(effect.typeId);
      const data = p.getDynamicProperty(STASH);
      if (typeof data === "string") recover(p);
      p.getComponent("minecraft:health")?.resetToMaxValue();
      if (f === loser) {
        const spot = exitSpot(m.ring, p.location, Math.random() * Math.PI * 2);
        p.teleport({ x: spot.x, y: standY(dimension, spot.x, spot.z, m.ring.y), z: spot.z }, { dimension, facingLocation: mid });
        decoration(() => dimension.spawnParticle("minecraft:totem_particle", { x: p.location.x, y: p.location.y + 2, z: p.location.z }));
      }
    } catch (error) {
      console.warn(`gladiator: couldn't finish for ${f.name}: ${error}`);
    }
  }
  const players = nearby(m);
  emit("gladiator.match_ended", { "minecraft.gladiator.result": winner ? why : "draw", "minecraft.player.name": winner?.name ?? "nobody", "minecraft.gladiator.loser": loser?.name ?? "nobody" });

  if (!winner || !loser) {
    announce(players, "§eDraw!", "Nobody won this time", "random.orb");
    cheer(m, true);
    system.runTimeout(() => removeFans(m), LINGER_TICKS);
    return;
  }
  recordWin(winner.name, loser.name);
  announce(players, "§e§lK.O.!", `${loser.name} is knocked out`, "random.orb");
  decoration(() => dimension.playSound("random.levelup", mid, { volume: 0.4, pitch: 0.7 }));
  cheer(m, true);
  const champion = playerOf(winner.id);
  if (champion) {
    const prize = new ItemStack("minecraft:golden_apple", 1);
    const left = champion.getComponent("minecraft:inventory")?.container?.addItem(prize);
    if (left) dimension.spawnItem(left, champion.location);
  }
  system.runTimeout(() => {
    announce(nearby(m), "§6§lChampion!", `${winner.name} wins!`, "random.levelup");
    fireworks(m);
    cheer(m, true);
    world.sendMessage(`§6${winner.name} beat ${loser.name} in the gladiator ring!\n${topMessage()}`);
  }, 50);
  system.runTimeout(() => removeFans(m), LINGER_TICKS + 50);
}

// ---------------------------------------------------------------- after a restart

function startup() {
  for (const id of DIMENSIONS) {
    try {
      // Fans that stayed after a crash or a restart mid-match. (Holders are never removed: they keep somebody's things.)
      for (const fan of world.getDimension(id).getEntities({ type: FAN })) fan.remove();
    } catch {
      // not loaded
    }
  }
  for (const player of world.getAllPlayers()) if (player) recover(player);
}
world.afterEvents.worldLoad.subscribe(startup);
system.run(() => {
  try {
    startup();
  } catch {
    // the world isn't ready: worldLoad does it
  }
});

export { MAX_RADIUS, KO_HEALTH };
