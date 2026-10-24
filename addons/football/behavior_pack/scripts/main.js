import { Player, system, world } from "@minecraft/server";
import { GOAL_BLOCK, findGoal, findOpponent, isGoal, isPartOf, makePitch, scoredIn } from "./pitch.js";
import { emit } from "./telemetry.js";

const BALL = "family:football"; // the ball and the item that places it share the name
const WINNING_SCORE = 5;
const NEARBY = 64; // blocks from the middle of a pitch that count as playing
const KICK = 1.1;
const SAVE_KEY = "family:football_games";

/**
 * A match on a pitch. `ball` is the tag on its ball, so the ball is found again after a restart.
 * @typedef {import("./pitch.js").Pitch & { id: string, dimension: string, blue_score: number, red_score: number }} Game
 */

/** @type {Game[] | undefined} */
let games;
/** @type {Map<string, import("@minecraft/server").Vec3>} game id → where its ball was last tick */
const lastSpot = new Map();
/** @type {Map<string, string>} ball entity id → name of the last player who kicked it */
const lastKicker = new Map();
/** @type {Set<string>} games waiting for kick-off after a goal */
const paused = new Set();

function all() {
  games ??= JSON.parse(String(world.getDynamicProperty(SAVE_KEY) ?? "[]"));
  return /** @type {Game[]} */ (games);
}

/** @param {Game[]} list */
function save(list) {
  games = list;
  world.setDynamicProperty(SAVE_KEY, JSON.stringify(list));
}

/** @param {import("@minecraft/server").Dimension} dimension */
function typeAt(dimension) {
  /** @type {import("./pitch.js").GetType} */
  return (x, y, z) => {
    try {
      return dimension.getBlock({ x, y, z })?.typeId;
    } catch {
      return undefined; // outside the world, or not loaded
    }
  };
}

/** @param {Game} game */
const tagOf = (game) => `family:ball_${game.id}`;

/** @param {Game} game */
function playersNear(game) {
  return world.getDimension(game.dimension).getPlayers({ location: game.center, maxDistance: NEARBY }).filter(Boolean); // NPCs (simulated players from the npc mod) come through as undefined in other mods
}

/** @param {Game} game */
function ballOf(game) {
  return world.getDimension(game.dimension).getEntities({ type: BALL, tags: [tagOf(game)] })[0];
}

/** Puts the game's ball on the middle spot, removing any old one. @param {Game} game */
function kickOff(game) {
  const dimension = world.getDimension(game.dimension);
  for (const old of dimension.getEntities({ type: BALL, tags: [tagOf(game)] })) old.remove();
  const ball = dimension.spawnEntity(BALL, game.center);
  ball.addTag(tagOf(game));
  lastSpot.delete(game.id);
  paused.delete(game.id);
}

const scoreLine = (/** @type {Game} */ game) => `§9§lBlue ${game.blue_score} §r§f- §c§l${game.red_score} Red`;

/** @param {Game} game @param {string} title @param {string} subtitle */
function announce(game, title, subtitle, sound = "random.levelup") {
  for (const player of playersNear(game)) {
    player.onScreenDisplay.setTitle(title, { subtitle, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 15 });
    player.playSound(sound);
  }
}

// Placing the last block of a goal, with a matching goal across from it, starts a match.
world.afterEvents.playerPlaceBlock.subscribe(({ block, player }) => {
  if (block.typeId !== GOAL_BLOCK) return;
  const getType = typeAt(block.dimension);
  const { x, y, z } = block.location;
  const goal = findGoal(getType, x, y, z);
  if (!goal) return;
  const other = findOpponent(getType, goal);
  if (!other) {
    player.onScreenDisplay.setActionBar(`§aGoal built! §fBuild one the same size straight across, 8 to 96 blocks away.`);
    player.playSound("random.orb");
    return;
  }
  const pitch = makePitch(goal, other);
  const dimension = block.dimension.id;
  const same = (/** @type {Game} */ g) => g.dimension === dimension && JSON.stringify([g.blue, g.red]) === JSON.stringify([pitch.blue, pitch.red]);
  // Finishing a goal can only happen if it was broken, so a match already saved for these goals is stale.
  for (const old of all().filter(same)) ballOf(old)?.remove();

  const game = { id: `${system.currentTick}${Math.floor(Math.random() * 1000)}`, dimension, ...pitch, blue_score: 0, red_score: 0 };
  save([...all().filter((g) => !same(g)), game]);
  kickOff(game);
  announce(game, "§aKick-off!", `Blue vs Red. First to ${WINNING_SCORE} wins!`, "raid.horn");
  emit("football.game_started", { "minecraft.player.name": player.name, "minecraft.goal.width": goal.width, "minecraft.goal.height": goal.height });
});

/** Ends matches: the ball goes, and everyone nearby sees the final score. @param {Game[]} ended @param {string} [by] */
function endGames(ended, by) {
  if (ended.length === 0) return;
  save(all().filter((g) => !ended.includes(g)));
  for (const game of ended) {
    ballOf(game)?.remove();
    announce(game, "§eFull time!", scoreLine(game));
    emit("football.game_ended", { "minecraft.player.name": by ?? "nobody", "minecraft.football.blue_score": game.blue_score, "minecraft.football.red_score": game.red_score });
  }
}

// Breaking a goal ends its match.
world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation, player }) => {
  if (brokenBlockPermutation.type.id !== GOAL_BLOCK) return;
  const { x, y, z } = block.location;
  endGames(all().filter((g) => g.dimension === block.dimension.id && (isPartOf(g.blue, x, y, z) || isPartOf(g.red, x, y, z))), player.name);
});

// Goals can also go without a player breaking them: explosions, pistons, or /fill.
system.runInterval(() => {
  endGames(all().filter((g) => {
    if (playersNear(g).length === 0) return false; // not loaded: can't tell
    const getType = typeAt(world.getDimension(g.dimension));
    return !isGoal(getType, g.blue) || !isGoal(getType, g.red);
  }));
}, 20);

/** Kicks the ball where the player is looking; sneaking makes it a low pass. @param {Player} player @param {import("@minecraft/server").Entity} ball */
function kick(player, ball) {
  const look = player.getViewDirection();
  const flat = Math.hypot(look.x, look.z) || 1;
  const lift = player.isSneaking ? 0.1 : 0.35;
  ball.applyImpulse({ x: (look.x / flat) * KICK, y: lift, z: (look.z / flat) * KICK });
  player.playSound("random.pop");
  lastKicker.set(ball.id, player.name);
}

// Hit the ball to kick it. Sneak and hit a ball that isn't in a match to pick it up.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity: ball }) => {
  if (ball?.typeId !== BALL || !(player instanceof Player)) return;
  const inMatch = ball.getTags().some((t) => t.startsWith("family:ball_"));
  if (player.isSneaking && !inMatch) {
    ball.remove();
    player.runCommand(`give @s ${BALL}`);
    return;
  }
  kick(player, ball);
});

// Use (right-click, or the Kick button on a touch screen) runs the ball's family:kicked event
// (entities/football.json). The kicker is the nearest player, as the event doesn't say who.
world.afterEvents.dataDrivenEntityTrigger.subscribe(
  ({ entity: ball }) => {
    const [player] = ball.dimension.getPlayers({ location: ball.location, maxDistance: 6, closest: 1 });
    if (player) kick(player, ball);
  },
  { entityTypes: [BALL], eventTypes: ["family:kicked"] },
);

// Every tick: point the ball where it rolls, and check for goals.
system.runInterval(() => {
  for (const ball of world.getDimension("overworld").getEntities({ type: BALL })) {
    const v = ball.getVelocity();
    if (Math.hypot(v.x, v.z) > 0.02) ball.setRotation({ x: 0, y: (Math.atan2(-v.x, v.z) * 180) / Math.PI });
  }

  for (const game of all()) {
    if (paused.has(game.id) || playersNear(game).length === 0) continue; // nobody here: the area may not be loaded
    const ball = ballOf(game);
    if (!ball) {
      kickOff(game); // lost, picked up, or fell somewhere
      continue;
    }
    const now = ball.location;
    const before = lastSpot.get(game.id) ?? now;
    lastSpot.set(game.id, now);
    const into = scoredIn(game, before, now);
    if (!into) continue;

    const team = into === "blue" ? "red" : "blue";
    game[`${team}_score`] += 1;
    save(all());
    paused.add(game.id);
    const scorer = lastKicker.get(ball.id);
    emit("football.goal", { "minecraft.player.name": scorer ?? "nobody", "minecraft.football.team": team, "minecraft.football.blue_score": game.blue_score, "minecraft.football.red_score": game.red_score });
    const color = team === "blue" ? "§9" : "§c";

    if (game[`${team}_score`] >= WINNING_SCORE) {
      announce(game, `${color}${team === "blue" ? "Blue" : "Red"} wins!`, scoreLine(game), "random.totem");
      emit("football.game_won", { "minecraft.football.team": team, "minecraft.football.blue_score": game.blue_score, "minecraft.football.red_score": game.red_score });
      game.blue_score = 0;
      game.red_score = 0;
      save(all());
    } else {
      announce(game, `${color}GOAL!`, `${scorer ? `${scorer} scores! ` : ""}${scoreLine(game)}`, "firework.blast");
    }
    system.runTimeout(() => {
      if (all().includes(game)) kickOff(game);
    }, 60);
  }
}, 1);

// The score on screen for everyone near a match.
system.runInterval(() => {
  for (const game of all()) for (const player of playersNear(game)) player.onScreenDisplay.setActionBar(scoreLine(game));
}, 20);
