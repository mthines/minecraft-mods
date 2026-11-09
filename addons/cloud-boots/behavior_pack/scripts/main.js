import { EquipmentSlot, system, world } from "@minecraft/server";

// Clouds are only a picture in the sky, so with cloud boots on, invisible barrier blocks go under the
// player's feet at cloud height, and come out again once nobody in cloud boots stands there.
// Crouching lets you fall through.
const BOOTS = "family:cloud_boots";
const FLOOR = "minecraft:barrier";
const CLOUD_TOP = 193; // where the player stands: Bedrock draws the clouds at 192, and standing there put you inside them. The floor is the block just below
const CATCH = 6; // blocks above the clouds where a falling player gets a floor: more than a fall moves in a tick
const SAVED = "cloud-boots:floor";

/** @type {Map<string, { x: number, y: number, z: number }>} barriers this mod put in the overworld, by "x,y,z" */
const placed = new Map();

const keyOf = ({ x, y, z }) => `${x},${y},${z}`;

const wearsBoots = (player) => player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Feet)?.typeId === BOOTS;

function save() {
  world.setDynamicProperty(SAVED, JSON.stringify([...placed.values()]));
}

// Barriers saved by an earlier run belong to nobody now: they come out on the first tick.
system.run(() => {
  for (const spot of JSON.parse(String(world.getDynamicProperty(SAVED) ?? "[]"))) placed.set(keyOf(spot), spot);
});

let tick = 0;
system.runInterval(() => {
  tick++;
  const overworld = world.getDimension("overworld");
  /** @type {Map<string, { x: number, y: number, z: number }>} */
  const needed = new Map();
  for (const player of world.getAllPlayers()) {
    if (!player) continue; // NPCs (simulated players from the npc mod) come through as undefined in other mods
    if (player.dimension.id !== "minecraft:overworld" || player.isSneaking || !wearsBoots(player)) continue;
    const { x, y, z } = player.location;
    if (y < CLOUD_TOP - 0.01 || y > CLOUD_TOP + CATCH) continue;
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const spot = { x: Math.floor(x) + dx, y: CLOUD_TOP - 1, z: Math.floor(z) + dz };
        needed.set(keyOf(spot), spot);
      }
    // Clouds are soft: falling onto them doesn't hurt.
    if (player.getVelocity().y < -0.5) player.addEffect("slow_falling", 10, { showParticles: false });
    // A puff under the feet while walking on the clouds.
    if (tick % 4 === 0 && y < CLOUD_TOP + 0.1) {
      try {
        overworld.spawnParticle("minecraft:white_smoke_particle", { x, y: CLOUD_TOP + 0.1, z });
      } catch {
        // particles are only decoration
      }
    }
  }

  let changed = false;
  for (const [key, spot] of needed) {
    if (placed.has(key)) continue;
    const block = overworld.getBlock(spot);
    if (!block?.isAir) continue; // never replace a real block
    block.setType(FLOOR);
    placed.set(key, spot);
    changed = true;
  }
  for (const [key, spot] of placed) {
    if (needed.has(key)) continue;
    const block = overworld.getBlock(spot);
    if (!block) continue; // chunk not loaded: try again later
    if (block.typeId === FLOOR) block.setType("minecraft:air");
    placed.delete(key);
    changed = true;
  }
  if (changed) save();
}, 1);
