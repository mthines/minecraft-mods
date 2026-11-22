import { ButtonState, EntityDamageCause, EntityInitializationCause, EntitySwingSource, EquipmentSlot, GameMode, InputButton, ItemStack, Player, system, world } from "@minecraft/server";
import { lore, MAX_DESIGNS, recall, remember } from "./blueprint.js";
import { BASES, DYES, PART_BY_ID, PART_BY_KEY, PRESETS, partItem, presetItem, slotsOf } from "./catalog.js";
import { armament, damageOf, firstTarget, powerOf, ready, WEAPONS } from "./combat.js";
import { decode, dirToModel, encode, pack, partsOn, pickFilledSlot, pickFreeSlot, presetDesign, propertiesOf, seatsOf, toModel, unpack, count } from "./design.js";
import { driveStep, flightHint, flightOf, forward, hoverStep, planeStep, statsOf, velocityOf } from "./drive.js";
import { cellsToTill, fillOf, plowCells, tilled } from "./farm.js";
import { emit } from "./telemetry.js";

// Vehicles you build yourself. A vehicle is one entity with a grid of slots; five slots share one entity property
// (family:g0, family:g1, ...), a base-16 digit each, and the resource pack shows the part in each slot. See README.md.
const VEHICLES = Object.values(BASES).map((base) => base.item);
const WRENCH = "family:mech_wrench";
const BLUEPRINT = "family:mech_blueprint";
const SAVED = "family:mech_blueprint_saved";
const PACKED = "family:mech_packed";
const DESIGN = "mech:design"; // the item's dynamic property that holds a design
const REGISTRY = "mechanics:designs"; // the world's dynamic property that holds every design a blueprint ever saved
const READY = Object.fromEntries(Object.keys(PRESETS).map((name) => [presetItem(name), name]));
const TELEPORT_BLOCKS = 4;

const isVehicle = (/** @type {import("@minecraft/server").Entity | undefined} */ entity) => !!entity?.isValid && VEHICLES.includes(entity.typeId);
const baseOf = (/** @type {import("@minecraft/server").Entity} */ vehicle) => /** @type {keyof typeof BASES} */ (vehicle.typeId.slice("family:mech_".length));
const tell = (/** @type {Player} */ player, /** @type {string} */ text) => player.sendMessage(`§6Mechanics:§r ${text}`);
const heldBy = (/** @type {Player} */ player) => player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
const ridersOf = (/** @type {import("@minecraft/server").Entity} */ vehicle) => vehicle.getComponent("minecraft:rideable")?.getRiders() ?? [];

// ── A vehicle's design lives in its entity properties ────────────────────────

/** @param {import("@minecraft/server").Entity} vehicle @returns {import("./design.js").Design} */
function readDesign(vehicle) {
  const base = baseOf(vehicle);
  const values = Array.from({ length: propertiesOf(base) }, (_, g) => Number(vehicle.getProperty(`family:g${g}`) ?? 0));
  return { base, slots: unpack(values, slotsOf(base).length), paint: Number(vehicle.getProperty("family:paint") ?? 0) };
}

function writeDesign(/** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {import("./design.js").Design} */ design) {
  pack(design.slots).forEach((value, g) => vehicle.setProperty(`family:g${g}`, value));
  vehicle.setProperty("family:paint", design.paint);
  vehicle.triggerEvent(`family:set_seats_${seatsOf(design).key}`);
  infos.delete(vehicle.id);
}

/** What a vehicle drives like, worked out again only when its design changes. @type {Map<string, { design: import("./design.js").Design }>} */
const infos = new Map();
const cargoFill = new Map(); // vehicle id → how full its bed is, 0 to 1
function infoOf(/** @type {import("@minecraft/server").Entity} */ vehicle) {
  let info = infos.get(vehicle.id);
  if (!info) infos.set(vehicle.id, (info = { design: readDesign(vehicle) }));
  const fill = cargoFill.get(vehicle.id) ?? 0;
  return { design: info.design, flight: flightOf(info.design, fill), stats: statsOf(info.design, fill) };
}

// ── Putting parts on, and taking them off ────────────────────────────────────

/** The player holding `item` who is closest to the vehicle. */
function holderOf(/** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {string} */ item) {
  /** @type {Player | undefined} */
  let best;
  let bestDistance = 8;
  for (const player of vehicle.dimension.getPlayers({ location: vehicle.location, maxDistance: bestDistance })) {
    if (!player || heldBy(player)?.typeId !== item) continue; // no player: an NPC, which other mods can't see
    const d = Math.hypot(player.location.x - vehicle.location.x, player.location.z - vehicle.location.z);
    if (d < bestDistance) [best, bestDistance] = [player, d];
  }
  return best;
}

function consume(/** @type {Player} */ player) {
  if (player.getGameMode() === GameMode.Creative) return;
  const container = player.getComponent("minecraft:inventory")?.container;
  const item = container?.getItem(player.selectedSlotIndex);
  if (!container || !item) return;
  if (item.amount > 1) {
    item.amount--;
    container.setItem(player.selectedSlotIndex, item);
  } else container.setItem(player.selectedSlotIndex, undefined);
}

function give(/** @type {Player} */ player, /** @type {ItemStack} */ stack) {
  const left = player.getComponent("minecraft:inventory")?.container?.addItem(stack);
  if (left) player.dimension.spawnItem(left, player.location); // inventory full: drop it
}

/** Where a player aims at a vehicle, in the vehicle's own space. */
function aimAt(/** @type {Player} */ player, /** @type {import("@minecraft/server").Entity} */ vehicle) {
  const heading = vehicle.getRotation().y;
  return { origin: toModel(player.getHeadLocation(), vehicle.location, heading), dir: dirToModel(player.getViewDirection(), heading) };
}

function addPart(/** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {string} */ key) {
  const part = PART_BY_KEY[key];
  const player = holderOf(vehicle, partItem(key));
  if (!player) return;
  // Using a part on a vehicle with a seat would also get you on it: get off again.
  system.runTimeout(() => {
    if (player.isValid && vehicle.isValid && player.getComponent("minecraft:riding")?.entityRidingOn?.id === vehicle.id) vehicle.getComponent("minecraft:rideable")?.ejectRider(player);
  }, 1);
  if (ridersOf(vehicle).some((rider) => rider?.id !== player.id)) return tell(player, "Get off first, then you can change the vehicle.");
  const design = readDesign(vehicle);
  const slot = pickFreeSlot(design, key, aimAt(player, vehicle));
  if (slot < 0) return tell(player, key === "seat" ? `No room for that seat: this ${BASES[design.base].name.toLowerCase()} is full, or you aimed at a spot that isn't a seat spot (the cells in the middle of the deck), already has a part, or is too close to another seat.` : `The ${part.name.toLowerCase()} doesn't fit there. Aim at a free spot it can go in.`);
  design.slots[slot] = part.id;
  writeDesign(vehicle, design);
  consume(player);
  vehicle.dimension.playSound("random.anvil_use", vehicle.location, { volume: 0.5, pitch: 1.4 });
  emit("mechanics.part_added", { "minecraft.mechanics.base": design.base, "minecraft.mechanics.part": key, "minecraft.mechanics.parts": partsOn(design) });
}

function removePart(/** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {Player} */ player) {
  if (ridersOf(vehicle).length) return tell(player, "Get off first, then you can change the vehicle.");
  const design = readDesign(vehicle);
  const slot = pickFilledSlot(design, aimAt(player, vehicle));
  if (slot < 0) return tell(player, "Aim at a part to take it off.");
  const part = PART_BY_ID[design.slots[slot]];
  design.slots[slot] = 0;
  writeDesign(vehicle, design);
  give(player, new ItemStack(partItem(part.key)));
  vehicle.dimension.playSound("random.anvil_use", vehicle.location, { volume: 0.5, pitch: 0.8 });
}

// Using a part or a dye on a vehicle is a data-driven event (minecraft:interact), which works for simulated players too.
world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity: vehicle, eventId }) => {
  if (!isVehicle(vehicle)) return;
  const part = /^family:part_(\w+)$/.exec(eventId);
  if (part) return addPart(vehicle, part[1]);
  const paint = /^family:paint_(\d+)$/.exec(eventId);
  if (!paint) return;
  const player = holderOf(vehicle, `minecraft:${DYES[Number(paint[1])]}_dye`);
  if (player) consume(player);
  infos.delete(vehicle.id);
}, { entityTypes: VEHICLES });

// ── Showing where a part would go ────────────────────────────────────────────

/** A point in the vehicle's own space, in the world. */
function toWorld(/** @type {{ x: number, y: number, z: number }} */ model, /** @type {import("@minecraft/server").Entity} */ vehicle) {
  const r = (vehicle.getRotation().y * Math.PI) / 180;
  const at = vehicle.location;
  return { x: at.x + model.x * Math.cos(r) + model.z * Math.sin(r), y: at.y + model.y, z: at.z + model.x * Math.sin(r) - model.z * Math.cos(r) };
}

// Holding a part (or the wrench) and looking at a vehicle: sparkles show the cell it would go in (or come off). Every 4 ticks, only for such players.
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!player) continue; // NPCs come through as undefined in other mods
    const held = heldBy(player)?.typeId;
    const key = held === WRENCH ? "wrench" : held?.startsWith("family:mech_") ? held.slice("family:mech_".length) : "";
    if (!key || (key !== "wrench" && !PART_BY_KEY[key])) continue;
    try {
      const vehicle = player.getEntitiesFromViewDirection({ maxDistance: 8, families: ["mechanics_vehicle"] })[0]?.entity;
      if (!isVehicle(vehicle) || !vehicle) continue;
      const design = readDesign(vehicle);
      const aim = aimAt(player, vehicle);
      const slot = key === "wrench" ? pickFilledSlot(design, aim) : pickFreeSlot(design, key, aim);
      if (slot < 0) continue;
      const place = slotsOf(design.base)[slot];
      const point = toWorld({ x: place.x, y: BASES[design.base].deckTop + place.y + place.cell / 2, z: place.z }, vehicle);
      player.dimension.spawnParticle(key === "wrench" ? "minecraft:redstone_ore_dust_particle" : "minecraft:villager_happy", point);
    } catch {
      // the vehicle went away, or the chunk isn't loaded
    }
  }
}, 4);

// ── Hitting a vehicle: the wrench, the blueprint, and picking it up ──────────

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity: vehicle }) => {
  if (!(player instanceof Player) || !isVehicle(vehicle)) return; // no player or vehicle: an NPC, which other mods can't see
  const held = heldBy(player);
  if (held?.typeId === WRENCH) removePart(/** @type {import("@minecraft/server").Entity} */ (vehicle), player);
  else if (held?.typeId === BLUEPRINT) saveBlueprint(/** @type {import("@minecraft/server").Entity} */ (vehicle), player);
  else if (!held && player.isSneaking) packUp(/** @type {import("@minecraft/server").Entity} */ (vehicle), player);
});

/** Sneak and hit with an empty hand: the vehicle folds into an item that remembers its design (a bare base just becomes its item). */
function packUp(/** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {Player} */ player) {
  if (ridersOf(vehicle).length) return tell(player, "Get off first, then you can pick it up.");
  const design = readDesign(vehicle);
  const bare = partsOn(design) === 0 && design.paint === 0;
  const item = new ItemStack(bare ? BASES[design.base].item : PACKED);
  if (!bare) {
    item.setDynamicProperty(DESIGN, encode(design));
    item.setLore(lore(design, (id) => PART_BY_ID[id].name));
  }
  const container = vehicle.getComponent("minecraft:inventory")?.container;
  for (let i = 0; i < (container?.size ?? 0); i++) {
    const stack = container?.getItem(i);
    if (stack) vehicle.dimension.spawnItem(stack, vehicle.location); // the cargo is left on the ground
  }
  give(player, item);
  infos.delete(vehicle.id);
  vehicle.remove();
  if (!bare) emit("mechanics.vehicle_packed", { "minecraft.mechanics.base": design.base, "minecraft.mechanics.parts": partsOn(design) });
}

/** Hit a vehicle with a blank blueprint and the blueprint remembers its design. */
function saveBlueprint(/** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {Player} */ player) {
  const design = readDesign(vehicle);
  const saved = new ItemStack(SAVED);
  saved.setDynamicProperty(DESIGN, encode(design));
  saved.setLore(lore(design, (id) => PART_BY_ID[id].name));
  consume(player); // one blank blueprint becomes the saved one
  give(player, saved);
  known = remember(registry(), design);
  world.setDynamicProperty(REGISTRY, JSON.stringify(known));
  console.log(`[mechanics] design ${encode(design)}`); // one line a person can paste to Claude to make it a ready-made design (see README.md)
  player.playSound("random.levelup", { volume: 0.5 });
  tell(player, `Saved this ${BASES[design.base].name.toLowerCase()} on the blueprint. Use it on the ground to build another one, for free.`);
  emit("mechanics.blueprint_saved", { "minecraft.mechanics.base": design.base, "minecraft.mechanics.parts": partsOn(design) });
}
/** Every design a blueprint ever saved, read once. */
/** @type {string[] | undefined} */
let known;
const registry = () => (known ??= recall(world.getDynamicProperty(REGISTRY)).slice(-MAX_DESIGNS));

// ── Building a vehicle from an item ──────────────────────────────────────────

/** Puts a vehicle with `design` down where `player` looks, pointing the way they look. */
function build(/** @type {Player} */ player, /** @type {import("./design.js").Design} */ design) {
  const block = player.getBlockFromViewDirection({ maxDistance: 10 })?.block;
  if (!block) return tell(player, "Look at the ground and use it there."), undefined;
  const vehicle = player.dimension.spawnEntity(BASES[design.base].item, { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 });
  vehicle.setRotation({ x: 0, y: player.getRotation().y });
  writeDesign(vehicle, design);
  emit("mechanics.vehicle_built", { "minecraft.mechanics.base": design.base, "minecraft.mechanics.parts": partsOn(design) });
  return vehicle;
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (!(player instanceof Player)) return;
  const id = itemStack.typeId;
  const design = id === PACKED || id === SAVED ? decode(itemStack.getDynamicProperty(DESIGN)) : READY[id] ? presetDesign(/** @type {keyof typeof PRESETS} */ (READY[id])) : undefined;
  if (!design) return;
  if (!build(player, design)) return;
  if (id !== SAVED) consume(player); // a saved blueprint can be used again, and building from it costs nothing
});

// Tell whoever just put a base down how it works.
world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  if (cause !== EntityInitializationCause.Spawned || !isVehicle(entity) || partsOn(readDesign(entity)) > 0) return;
  for (const player of entity.dimension.getPlayers({ location: entity.location, maxDistance: 8 })) {
    if (player) player.sendMessage("§6Vehicle base!§r Hold a part and use it on the base, aiming at the spot where it goes: parts stack up in layers and snap next to each other. A seat lets you drive: W goes, A and D steer. Hit it with the wrench to take a part off, and sneak-hit it with an empty hand to pick it up.");
  }
});

// ── Driving ──────────────────────────────────────────────────────────────────

// A simulated player's movement keys don't reach scripts while riding, so the tests hold them with
// /scriptevent family:mech_input <forward>[,<left>[,<jump>]] (and let go with an empty message).
/** @type {Map<string, { x: number, y: number, jump: boolean }>} */
const testInput = new Map();
system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (id !== "family:mech_input" || !sourceEntity) return;
  if (message === "") return void testInput.delete(sourceEntity.id);
  const [y, x = 0, jump = 0] = message.split(",").map(Number);
  testInput.set(sourceEntity.id, { x, y, jump: !!jump });
});

/** @type {Map<string, { speed: number, last: number, blocked?: number }>} the speed of a vehicle, the tick it was last driven, and for how many ticks a step has been in its way */
const speeds = new Map();
/** @type {Map<string, string>} the plow's last cells, by vehicle id */
const plowed = new Map();

function inputOf(/** @type {Player} */ player) {
  const test = testInput.get(player.id);
  if (test) return test;
  let jump = false;
  try {
    jump = player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  } catch {
    // no buttons to read
  }
  return { ...player.inputInfo.getMovementVector(), jump };
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!player) continue; // NPCs come through as undefined in other mods
    const vehicle = player.getComponent("minecraft:riding")?.entityRidingOn;
    if (!isVehicle(vehicle) || !vehicle) continue;
    if (vehicle.getComponent("minecraft:rideable")?.getRiders()[0]?.id !== player.id) continue; // only whoever sat down first drives
    drive(player, vehicle);
  }
}, 1);

function drive(/** @type {Player} */ player, /** @type {import("@minecraft/server").Entity} */ vehicle) {
  const { design, flight, stats } = infoOf(vehicle);
  const keys = inputOf(player);
  const tick = system.currentTick;
  // A ride that stopped (everyone got off) starts from standing still the next time, not from the speed it had.
  const prev = speeds.get(vehicle.id);
  const state = prev && tick - prev.last <= 2 ? prev : { speed: 0, last: tick };
  state.last = tick;
  const heading = vehicle.getRotation().y;

  if (flight.mode === "plane") {
    const next = planeStep(state.speed, keys.y, player.getViewDirection(), flight);
    state.speed = next.speed;
    vehicle.setRotation({ x: 0, y: player.getRotation().y });
    vehicle.clearVelocity();
    vehicle.applyImpulse(next.velocity);
  } else if (flight.mode === "hover") {
    const next = hoverStep({ heading, speed: state.speed }, keys, keys.jump, flight, stats);
    state.speed = next.speed;
    vehicle.setRotation({ x: 0, y: next.heading });
    const v = velocityOf(next.heading, next.speed);
    vehicle.clearVelocity();
    vehicle.applyImpulse({ x: v.x, y: next.vy, z: v.z });
  } else {
    const next = driveStep({ heading, speed: state.speed }, keys, stats);
    state.speed = next.speed;
    vehicle.setRotation({ x: 0, y: next.heading });
    const v = velocityOf(next.heading, next.speed);
    const now = vehicle.getVelocity();
    vehicle.applyImpulse({ x: v.x - now.x, y: 0, z: v.z - now.z }); // sets the speed exactly; gravity is left alone
    if (next.speed > 0.02) stepUp(vehicle, next.heading, BASES[design.base].width, state);
    else state.blocked = 0;
    if (design.base === "farm" && count(design, "plow") > 0 && next.speed > 0.02) plow(vehicle, next.heading);
  }
  speeds.set(vehicle.id, state);

  // Weapons, the bursts of a gatling already underway.
  fireBursts(player, vehicle, design);

  if (tick % 20 === 0 && BASES[design.base].cargo) {
    const container = vehicle.getComponent("minecraft:inventory")?.container;
    if (container) cargoFill.set(vehicle.id, fillOf(container.emptySlotsCount, container.size));
  }
  if (tick % 10 === 0) {
    const kmh = Math.round(Math.abs(state.speed) * 20 * 3.6);
    const guns = armament(design).map(({ kind, n }) => `${kind}${n > 1 ? ` ×${n}` : ""}`).join(" ");
    player.onScreenDisplay.setActionBar(`§6§l${BASES[design.base].name}§r  ${kmh} km/h${guns ? `  🎯 ${guns} (tap attack)` : ""}  ${flightHint(flight)}`.trimEnd());
  }
}

/** A block a vehicle can't drive through (Block.isSolid is false for plenty of full blocks, stone among them). */
const blocks = (/** @type {import("@minecraft/server").Block | undefined} */ block) => !!block && !block.isAir && !block.isLiquid;
const HOP = 0.5; // upward speed of a hop: clears a block, like a jump
const HOP_TICKS = 6; // a hop that hasn't got it over the step by now: lift it up

/** A solid block in the way, with room above it: hop up it, or lift the vehicle up if the hop didn't do it. Three block lookups. */
function stepUp(/** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {number} */ heading, /** @type {number} */ width, /** @type {{ blocked?: number }} */ state) {
  const dir = forward(heading);
  const reach = width / 2 + 0.4;
  const at = vehicle.location;
  const x = at.x + dir.x * reach;
  const z = at.z + dir.z * reach;
  try {
    const ahead = vehicle.dimension.getBlock({ x, y: at.y + 0.1, z });
    if (!blocks(ahead)) return void (state.blocked = 0);
    const room = vehicle.dimension.getBlock({ x, y: at.y + 1.1, z });
    const head = vehicle.dimension.getBlock({ x, y: at.y + 2.1, z });
    if (blocks(room) || blocks(head)) return;
    state.blocked = (state.blocked ?? 0) + 1;
    if (state.blocked >= HOP_TICKS) {
      state.blocked = 0;
      vehicle.teleport({ x: at.x + dir.x * 0.5, y: at.y + 1.05, z: at.z + dir.z * 0.5 });
    } else if (vehicle.isOnGround) {
      vehicle.applyImpulse({ x: 0, y: HOP - vehicle.getVelocity().y, z: 0 });
    }
  } catch {
    // the chunk ahead isn't loaded
  }
}

/** The plow tills three blocks behind it, but only when it moves into a new block. */
function plow(/** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {number} */ heading) {
  const { key, cells } = cellsToTill(plowCells(vehicle.location, heading), plowed.get(vehicle.id));
  if (!cells.length) return;
  plowed.set(vehicle.id, key);
  const y = Math.floor(vehicle.location.y + 0.05) - 1;
  try {
    for (const { x, z } of cells) {
      const block = vehicle.dimension.getBlock({ x, y, z });
      const above = vehicle.dimension.getBlock({ x, y: y + 1, z });
      const to = block && above?.isAir ? tilled(block.typeId) : undefined;
      if (to) block?.setType(to);
    }
  } catch {
    // the chunk isn't loaded
  }
}

// ── Weapons ──────────────────────────────────────────────────────────────────

/** @type {Map<string, { left: number, next: number }>} the gatling's burst, by vehicle id */
const bursts = new Map();
/** @type {Map<string, Map<string, number>>} the tick each weapon kind can fire again, by vehicle id */
const cooldowns = new Map();

// Tap (left-click) while driving: every weapon on the vehicle fires.
world.afterEvents.playerSwingStart.subscribe(({ player, swingSource }) => {
  if (!player || swingSource !== EntitySwingSource.Attack) return; // no player: an NPC
  const vehicle = player.getComponent("minecraft:riding")?.entityRidingOn;
  if (!isVehicle(vehicle) || !vehicle || vehicle.getComponent("minecraft:rideable")?.getRiders()[0]?.id !== player.id) return;
  const design = infoOf(vehicle).design;
  let next = cooldowns.get(vehicle.id);
  if (!next) cooldowns.set(vehicle.id, (next = new Map()));
  for (const { kind, n } of armament(design)) {
    if (!ready(next, kind, system.currentTick)) continue;
    next.set(kind, system.currentTick + WEAPONS[kind].cooldown);
    if (kind === "gatling") bursts.set(vehicle.id, { left: WEAPONS.gatling.burst, next: 0 });
    else if (kind === "laser") shoot(player, vehicle, "laser", n);
    else shootRocket(player, vehicle, n);
  }
});

function fireBursts(/** @type {Player} */ player, /** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {import("./design.js").Design} */ design) {
  const burst = bursts.get(vehicle.id);
  if (!burst || system.currentTick < burst.next) return;
  const guns = Math.min(3, count(design, "gatling"));
  if (guns === 0 || burst.left <= 0) return void bursts.delete(vehicle.id);
  burst.left--;
  burst.next = system.currentTick + WEAPONS.gatling.gap;
  shoot(player, vehicle, "gatling", guns);
}

/** What a shot from `player` hits: the first mob along the aim, unless a wall is closer; never the vehicle or anyone on it. */
function sight(/** @type {Player} */ player, /** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {number} */ range) {
  const head = player.getHeadLocation();
  const look = player.getViewDirection();
  const wall = player.getBlockFromViewDirection({ maxDistance: range });
  const wallDistance = wall ? Math.hypot(wall.block.x + wall.faceLocation.x - head.x, wall.block.y + wall.faceLocation.y - head.y, wall.block.z + wall.faceLocation.z - head.z) : range;
  const skip = [vehicle.id, ...ridersOf(vehicle).map((rider) => rider?.id ?? "")];
  const hit = firstTarget(player.getEntitiesFromViewDirection({ maxDistance: wallDistance, excludeTypes: ["minecraft:item", "minecraft:xp_orb"] }), skip);
  const distance = hit?.distance ?? wallDistance;
  return { head, look, hit, distance, point: { x: head.x + look.x * distance, y: head.y + look.y * distance, z: head.z + look.z * distance } };
}

function shoot(/** @type {Player} */ player, /** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {"gatling" | "laser"} */ kind, /** @type {number} */ n) {
  const { head, look, hit, distance } = sight(player, vehicle, WEAPONS[kind].range);
  if (hit?.entity) hurt(hit.entity, player, damageOf(kind, n));
  trail(player, head, look, Math.min(distance, kind === "laser" ? 40 : 24), kind === "laser" ? 2 : 3);
  try {
    if (kind === "laser" || system.currentTick % 4 === 0) player.dimension.playSound(kind === "laser" ? "mob.guardian.attack_loop" : "firework.blast", head, { pitch: kind === "laser" ? 1.8 : 1.6, volume: 0.5 });
  } catch {
    // only decoration
  }
}

function shootRocket(/** @type {Player} */ player, /** @type {import("@minecraft/server").Entity} */ vehicle, /** @type {number} */ n) {
  const { head, look, distance, point } = sight(player, vehicle, WEAPONS.rocket.range);
  trail(player, head, look, Math.min(distance, 30), 4);
  const options = { breaksBlocks: true, causesFire: false };
  try {
    player.dimension.createExplosion(point, powerOf(n), { ...options, source: player }); // the driver gets the credit
  } catch {
    try {
      player.dimension.createExplosion(point, powerOf(n), options);
    } catch {
      // the chunk isn't loaded any more
    }
  }
}

/** A short trail of sparks so you can see where a shot goes (capped, it's decoration). */
function trail(/** @type {Player} */ player, /** @type {import("@minecraft/server").Vector3} */ head, /** @type {import("@minecraft/server").Vector3} */ look, /** @type {number} */ reach, /** @type {number} */ step) {
  try {
    for (let d = 3; d < reach; d += step) player.dimension.spawnParticle("minecraft:basic_crit_particle", { x: head.x + look.x * d, y: head.y + look.y * d, z: head.z + look.z * d });
  } catch {
    // the trail stops where the loaded world ends
  }
}

function hurt(/** @type {import("@minecraft/server").Entity} */ entity, /** @type {Player} */ shooter, /** @type {number} */ damage) {
  try {
    entity.applyDamage(damage, { cause: EntityDamageCause.entityAttack, damagingEntity: shooter });
  } catch {
    // already gone
  }
}

// Forget vehicles that are gone (picked up another way, killed with /kill, unloaded).
system.runInterval(() => {
  for (const map of [speeds, plowed, bursts, cooldowns, cargoFill, infos]) {
    for (const id of map.keys()) if (!world.getEntity(id)) map.delete(id);
  }
}, 200);

