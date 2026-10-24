import { EquipmentSlot, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { sail } from "./sail.js";

const SABER = "family:pirate_saber";
const SHIP = "family:pirate_ship"; // the entity and the item that puts it on the water share the name
const PIRATE = "family:pirate";
const BURN_SECONDS = 5;
const CREW_DISTANCE = 16; // how close a pirate must be to jump aboard with their captain
const SEATS_FOR_FRIENDS = 2; // pirates leave this many seats free, so friends can still get on
const NAMES = ["Redbeard", "Peg-Leg Pete", "One-Eyed Jack", "Salty Sam", "Barnacle Bill", "Captain Polly", "Stormy Anne", "Cannonball Carl", "Goldtooth Gus", "Mad Molly"];

const DIMENSIONS = ["overworld", "nether", "the_end"];
const ships = () => DIMENSIONS.flatMap((id) => world.getDimension(id).getEntities({ type: SHIP }));
const isWater = (/** @type {import("@minecraft/server").Block | undefined} */ block) => !!block?.typeId.includes("water");

// A hit with the pirate saber sets the mob on fire. Pirates always fight with theirs.
world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
  const attacker = damageSource.damagingEntity;
  if (!attacker?.isValid || !hurtEntity?.isValid) return; // no hurtEntity: an NPC, which other mods can't see
  if (attacker.typeId === "minecraft:player") {
    const held = attacker.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
    if (held?.typeId !== SABER) return;
  } else if (attacker.typeId !== PIRATE) return;
  hurtEntity.setOnFire(BURN_SECONDS, true);
  hurtEntity.dimension.spawnParticle("minecraft:basic_flame_particle", hurtEntity.getHeadLocation());
});

// ── The ship ─────────────────────────────────────────────────────────────────

// Use the ship item while looking at water to put the ship there, pointing the way you look.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId !== SHIP) return;
  const water = player.getBlockFromViewDirection({ includeLiquidBlocks: true, maxDistance: 10 })?.block;
  if (!isWater(water) || !water) return void player.sendMessage("§6Pirate ship:§r look at water and use it there, it only sails on water.");
  const ship = player.dimension.spawnEntity(SHIP, { x: water.x + 0.5, y: water.y + 0.6, z: water.z + 0.5 });
  ship.setRotation({ x: 0, y: player.getRotation().y });
  if (player.getGameMode() !== GameMode.Creative) player.getComponent("minecraft:inventory")?.container?.setItem(player.selectedSlotIndex, undefined);
  player.sendMessage("§6Ahoy, a pirate ship!§r Use it to climb aboard: the first one aboard steers, friends can come along. W sails, A and D turn, sneak to get off. Your pirate friends jump aboard with you. Sneak and hit it to pick it up.");
});

// Riders sit in the order they got on, and move up a seat when someone ahead of them gets off.
// So the first seat, at the wheel, is the captain's: the player there sails the ship with their movement keys.
// When the captain gets off, the next one aboard moves up to the wheel and takes over.
/** @type {Map<string, string>} ship id → its captain's id, to tell a new captain they've taken over */
const captains = new Map();
system.runInterval(() => {
  for (const ship of ships()) {
    const rideable = ship.getComponent("minecraft:rideable");
    if (!ship.isValid || !rideable) continue;
    let riders = rideable.getRiders();
    // A pirate never takes the wheel: the ones ahead of the first player go to the back.
    const first = riders.findIndex((rider) => rider instanceof Player);
    if (first > 0) {
      for (const pirate of riders.slice(0, first)) {
        if (pirate?.typeId !== PIRATE) continue; // undefined: an NPC, which other mods can't see
        rideable.ejectRider(pirate);
        rideable.addRider(pirate);
      }
      riders = rideable.getRiders();
    }
    const captain = riders[0];
    if (!(captain instanceof Player)) {
      captains.delete(ship.id);
      continue;
    }
    if (captains.get(ship.id) !== captain.id) {
      if (captains.has(ship.id)) captain.sendMessage("§6Aye, captain!§r You're at the wheel now: W sails, A and D turn.");
      captains.set(ship.id, captain.id);
    }
    const { heading, push } = sail(ship.getRotation().y, captain.inputInfo.getMovementVector(), ship.getVelocity());
    ship.setRotation({ x: 0, y: heading });
    const below = { x: ship.location.x, y: ship.location.y - 0.3, z: ship.location.z };
    if (ship.isInWater || isWater(ship.dimension.getBlock(below))) ship.applyImpulse({ x: push.x, y: 0, z: push.z });
    if (system.currentTick % 20 !== 0) continue;
    captain.onScreenDisplay.setActionBar("§6§lPirate ship§r  W sail · A/D turn · sneak to get off");
    for (const rider of riders.slice(1)) {
      if (rider instanceof Player) rider.onScreenDisplay.setActionBar(`§6§lPirate ship§r  ${captain.name} is the captain · sneak to get off`);
    }
  }
}, 1);

// Sneak and hit an empty ship to put it back in your inventory.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity: ship }) => {
  if (ship?.typeId !== SHIP || !(player instanceof Player) || !player.isSneaking) return;
  if (ship.getComponent("minecraft:rideable")?.getRiders().length) return; // not while anyone is aboard
  const left = player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(SHIP));
  if (left) ship.dimension.spawnItem(left, ship.location); // inventory full: drop it instead
  ship.remove();
});

// ── Pirate friends ───────────────────────────────────────────────────────────

// Every new pirate gets a pirate name, and joins the crew of the player who brought them.
world.afterEvents.entitySpawn.subscribe(({ entity: pirate }) => {
  if (!pirate.isValid || pirate.typeId !== PIRATE) return;
  if (!pirate.nameTag) pirate.nameTag = NAMES[Math.floor(Math.random() * NAMES.length)];
  const [player] = pirate.dimension.getPlayers({ location: pirate.location, maxDistance: 8, closest: 1 });
  const tameable = pirate.getComponent("minecraft:tameable");
  if (!player || !tameable || tameable.isTamed) return;
  tameable.tame(player);
  player.sendMessage(`§6Ahoy!§r ${pirate.nameTag} joined your crew. Pirates follow you, fight monsters, and sail with you.`);
});

/** The player a pirate sails with, or undefined. @param {import("@minecraft/server").Entity} pirate */
const captainOf = (pirate) => pirate.getComponent("minecraft:tameable")?.tamedToPlayerId;

// A captain's crew jumps aboard with them, and gets off when they do.
system.runInterval(() => {
  for (const ship of ships()) {
    const rideable = ship.getComponent("minecraft:rideable");
    if (!ship.isValid || !rideable) continue;
    const riders = rideable.getRiders();
    const players = riders.filter((rider) => rider instanceof Player).map((player) => player.id);
    for (const pirate of riders.filter((rider) => rider?.typeId === PIRATE)) {
      if (!players.includes(captainOf(pirate) ?? "")) rideable.ejectRider(pirate);
    }
    if (!players.length) continue;
    let free = rideable.seatCount - SEATS_FOR_FRIENDS - rideable.getRiders().length;
    for (const pirate of ship.dimension.getEntities({ type: PIRATE, location: ship.location, maxDistance: CREW_DISTANCE })) {
      if (free <= 0) break;
      if (!players.includes(captainOf(pirate) ?? "") || pirate.getComponent("minecraft:riding")) continue;
      if (rideable.addRider(pirate)) free--;
    }
  }
}, 10);
