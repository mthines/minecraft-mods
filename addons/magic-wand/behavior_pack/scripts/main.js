import { EntityDamageCause, EntitySwingSource, Player, system, world } from "@minecraft/server";

const WAND = "family:magic_wand";
const RANGE = 30; // blocks a spell reaches
const COOLDOWN = 10; // ticks between spells (20 ticks = 1 second)
const FRIEND = "family:friend"; // tag on mobs the friend spell has charmed

/** The wand's spells, in the order right-click goes through them. */
const SPELLS = [
  { name: "§cFire", particle: "minecraft:basic_flame_particle", sound: "mob.blaze.shoot", cast: (mob, player) => burn(mob, player) },
  { name: "§fPush", particle: "minecraft:white_smoke_particle", sound: "mob.enderdragon.flap", cast: (mob, player) => push(mob, player) },
  { name: "§dFriend", particle: "minecraft:heart_particle", sound: "random.levelup", cast: (mob, player) => befriend(mob, player) },
];

/** @type {Map<string, number>} player id → which spell their wand casts */
const chosen = new Map();
/** @type {Map<string, number>} player id → tick they may cast again */
const nextCast = new Map();

/** @param {import("@minecraft/server").Entity} mob @param {Player} player */
function burn(mob, player) {
  mob.applyDamage(10, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
  mob.setOnFire(3, true);
}

/** Throws the mob far away from the player, and a little up. @param {import("@minecraft/server").Entity} mob @param {Player} player */
function push(mob, player) {
  const look = player.getViewDirection();
  const flat = Math.hypot(look.x, look.z) || 1;
  mob.applyKnockback({ x: (look.x / flat) * 4, z: (look.z / flat) * 4 }, 0.8);
}

/**
 * Makes the mob a friend: it stays the same mob, but can't hurt players or other
 * friends any more, and fights the monsters around it instead.
 * Tameable mobs (wolves, cats, ...) are tamed by the player as well.
 * @param {import("@minecraft/server").Entity} mob @param {Player} player
 */
function befriend(mob, player) {
  if (mob instanceof Player) return;
  mob.addTag(FRIEND);
  if (!mob.nameTag) mob.nameTag = "§d♥ Ven";
  try {
    mob.getComponent("minecraft:tameable")?.tame(player);
  } catch {
    // already tame, or tamed by someone else
  }
  const { x, y, z } = mob.location;
  for (let i = 0; i < 6; i++) {
    mob.dimension.spawnParticle("minecraft:heart_particle", { x: x + Math.random() - 0.5, y: y + 1 + Math.random(), z: z + Math.random() - 0.5 });
  }
}

/** @param {import("@minecraft/server").Entity | undefined} entity */
const isFriend = (entity) => !!entity?.isValid && entity.hasTag(FRIEND);

// Friends' hits and arrows do nothing to players or to other friends.
world.beforeEvents.entityHurt.subscribe((event) => {
  const { hurtEntity, damageSource } = event;
  if (isFriend(damageSource.damagingEntity) && (hurtEntity instanceof Player || isFriend(hurtEntity))) event.cancel = true;
});

const ENEMY_RANGE = 16; // blocks a friend looks for monsters to fight
const STEP = 0.6; // blocks a friend moves toward its enemy every 5 ticks (about walking speed)
const REACH = 2; // blocks from which a friend can hit
const HIT = 4; // damage of a friend's hit
const HIT_EVERY = 20; // ticks between a friend's hits
/** @type {Map<string, number>} friend id → tick it may hit again */
const nextHit = new Map();

// Mobs' own brains keep chasing the player, so the script walks friends to the
// nearest monster that isn't a friend and makes them hit it.
system.runInterval(() => {
  for (const dimension of ["overworld", "nether", "the_end"].map((id) => world.getDimension(id))) {
    for (const friend of dimension.getEntities({ tags: [FRIEND] })) {
      // Friends made before friends could fight carry a weakness that takes all their strength.
      if (friend.getEffect("weakness")) friend.removeEffect("weakness");
      const [enemy] = dimension.getEntities({ location: friend.location, maxDistance: ENEMY_RANGE, families: ["monster"], excludeTags: [FRIEND], closest: 1 });
      if (!enemy) continue;
      const from = friend.location;
      const to = enemy.location;
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      if (distance > REACH) {
        const step = STEP / distance;
        friend.tryTeleport({ x: from.x + (to.x - from.x) * step, y: from.y, z: from.z + (to.z - from.z) * step }, { facingLocation: to, checkForBlocks: true });
      } else if (system.currentTick >= (nextHit.get(friend.id) ?? 0)) {
        nextHit.set(friend.id, system.currentTick + HIT_EVERY);
        enemy.applyDamage(HIT, { cause: EntityDamageCause.entityAttack, damagingEntity: friend });
      }
    }
  }
}, 5);

world.afterEvents.entityRemove.subscribe(({ removedEntityId }) => nextHit.delete(removedEntityId));

// A friendly creeper fizzles instead of blowing up.
world.beforeEvents.explosion.subscribe((event) => {
  if (isFriend(event.source)) event.cancel = true;
});

/** The first mob along the player's aim, unless a wall is closer. @param {Player} player */
function aimedAt(player) {
  const head = player.getHeadLocation();
  const wall = player.getBlockFromViewDirection({ maxDistance: RANGE });
  const wallDistance = wall
    ? Math.hypot(wall.block.x + wall.faceLocation.x - head.x, wall.block.y + wall.faceLocation.y - head.y, wall.block.z + wall.faceLocation.z - head.z)
    : RANGE;
  const hit = player
    .getEntitiesFromViewDirection({ maxDistance: wallDistance, excludeTypes: ["minecraft:item", "minecraft:xp_orb"] })
    .find(({ entity }) => entity && entity.id !== player.id); // no entity: an NPC, which other mods can't see
  return { hit, reach: hit?.distance ?? wallDistance };
}

/** @param {Player} player */
function cast(player) {
  if (system.currentTick < (nextCast.get(player.id) ?? 0)) return;
  nextCast.set(player.id, system.currentTick + COOLDOWN);
  const spell = SPELLS[chosen.get(player.id) ?? 0];
  const { hit, reach } = aimedAt(player);

  // A sparkly trail so you can see the spell fly.
  const head = player.getHeadLocation();
  const look = player.getViewDirection();
  try {
    for (let d = 1.5; d < reach; d += 0.8) {
      player.dimension.spawnParticle(spell.particle, { x: head.x + look.x * d, y: head.y + look.y * d, z: head.z + look.z * d });
    }
  } catch {
    // the trail stops where the loaded world ends
  }
  player.dimension.playSound(spell.sound, head);
  if (hit?.entity.isValid) spell.cast(hit.entity, player);
}

/** @param {Player} player */
function switchSpell(player) {
  const next = ((chosen.get(player.id) ?? 0) + 1) % SPELLS.length;
  chosen.set(player.id, next);
  player.onScreenDisplay.setActionBar(`Spell: ${SPELLS[next].name}`);
  player.playSound("random.orb", { pitch: 1.2 + next * 0.2 });
}

// Left-click (an attack swing) casts the spell, in the air or at a mob.
world.afterEvents.playerSwingStart.subscribe(
  ({ player, heldItemStack }) => {
    if (heldItemStack?.typeId === WAND) cast(player);
  },
  { swingSource: EntitySwingSource.Attack },
);

// Right-click picks the next spell, so sneaking stays free for walking.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack.typeId === WAND) switchSpell(player);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  chosen.delete(playerId);
  nextCast.delete(playerId);
});
