import { ItemStack, Player, system, world } from "@minecraft/server";
import { SAMPLE_TICKS, createRides } from "./ride.js";
import { emit } from "./telemetry.js";

const MOTORCYCLE = "family:motorcycle"; // the entity and the item that places it share the name
const rides = createRides();

// Speedometer while riding, and a game event for Dash0 when a ride ends.
system.runInterval(() => {
  /** @type {Map<string, Player>} */
  const players = new Map();
  for (const player of world.getAllPlayers()) {
    if (!player) continue; // NPCs (simulated players from the npc mod) come through as undefined in other mods
    if (player.getComponent("minecraft:riding")?.entityRidingOn?.typeId === MOTORCYCLE) players.set(player.name, player);
  }
  const { speeds, ended } = rides.sample(new Map([...players].map(([name, p]) => [name, p.location])));
  for (const [name, speed] of speeds) players.get(name)?.onScreenDisplay.setActionBar(`§c§lMotorcycle  §f${speed} km/h`);
  for (const ride of ended) {
    emit("motorcycle.ride", {
      "minecraft.player.name": ride.player,
      "minecraft.ride.distance_m": ride.meters,
      "minecraft.ride.top_speed_kmh": ride.topKmh,
      "minecraft.ride.duration_s": ride.seconds,
    });
  }
}, SAMPLE_TICKS);

// Tell whoever just put a motorcycle down how it works.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (!entity.isValid || entity.typeId !== MOTORCYCLE) return;
  for (const player of entity.dimension.getPlayers({ location: entity.location, maxDistance: 8 })) {
    if (!player) continue;
    player.sendMessage("§cMotorcycle!§r Use it to get on, steer with the movement keys, sneak to get off. Sneak and hit it to pick it up.");
  }
});

// Sneak and hit a motorcycle to put it back in your inventory.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity: bike }) => {
  if (bike?.typeId !== MOTORCYCLE || !(player instanceof Player) || !player.isSneaking) return;
  if (bike.getComponent("minecraft:rideable")?.getRiders().length) return; // not while someone is on it
  const left = player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(MOTORCYCLE));
  if (left) bike.dimension.spawnItem(left, bike.location); // inventory full: drop it instead
  bike.remove();
});
