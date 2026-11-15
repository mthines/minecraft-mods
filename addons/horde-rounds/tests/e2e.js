// Played by simulated players on the test server: mc test horde-rounds
import { groundAt } from "../behavior_pack/scripts/ground.js";

const HORN = "family:horde_horn";
const NEST = "family:horde_nest";

const nests = (t) => t.dimension.getEntities({ type: NEST });
const horde = (t) => t.dimension.getEntities({ tags: ["family:horde"] });
const apples = (player) => {
  const inventory = player.getComponent("minecraft:inventory").container;
  let n = 0;
  for (let i = 0; i < inventory.size; i++) if (inventory.getItem(i)?.typeId === "minecraft:golden_apple") n++;
  return n;
};
const guards = (t) => t.dimension.getEntities({ tags: ["family:horde_guard"] });
const far = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Blows the horn once. Blows come a second apart: one tap is one blow. */
async function blow(t, player) {
  await t.wait(25);
  t.hold(player, HORN);
  t.assert(player.useItemInSlot(0), "Couldn't blow the horn");
}

/** The nest that is new since `known` (entity ids), or fails. A far nest waits for its chunks to load, so it can take a while. */
const newNest = (t, known, why) => t.until(() => nests(t).find((n) => !known.includes(n.id)), why, 500);

/** Round `round` has one nest, far from the players, and guards around it. */
async function assertRound(t, player, nest, round) {
  await t.wait(40); // a second nest a moment later would be a bug
  t.assert(nests(t).length === 1, `Round ${round} should have one nest, but there are ${nests(t).length}`);
  const away = far(nest.location, player.location);
  t.assert(away > 120, `Round ${round}'s nest should be far away so it has to be found, but it is ${Math.round(away)} blocks away`);
  // The guards stand at the nest once a player is close (far from every player a hostile mob despawns at once).
  t.assert(!guards(t).length, `Round ${round}'s guards are out before anyone came near the nest`);
  player.teleport({ x: nest.location.x + 6, y: nest.location.y + 1, z: nest.location.z });
  await t.until(() => guards(t).length > 0, `Round ${round} has a nest but no guards come out when a player gets close`, 100);
}

/** Destroys the nest, waits for the horde to go, and blows the horn to skip the break. */
async function clearRound(t, player, nest, round) {
  nest.kill();
  await t.until(() => horde(t).length === 0, `The horde stayed after round ${round}'s nest was destroyed`, 80);
  await blow(t, player); // in the break: starts the next round now
}

/** Ends the game, whatever it is doing. */
async function stop(t, player) {
  await blow(t, player);
  await t.until(() => nests(t).length === 0, "Blowing the horn didn't end the game", 100);
}

export async function blowingTheHornStartsRoundOneWithAFarNestAndGuards(t) {
  const player = t.player("Blower");
  await blow(t, player);
  try {
    const nest = await newNest(t, [], "No Horde Nest appeared after blowing the horn");
    await assertRound(t, player, nest, 1);
    t.assert(nest.getComponent("minecraft:health").currentValue > 0, "The nest has no health");
  } finally {
    await stop(t, player);
  }
  await t.until(() => horde(t).length === 0, "The horde stayed after the game ended", 60);
}

export async function destroyingTheNestClearsTheRoundAndRoundTwoHasANestAndAHorde(t) {
  const player = t.player("Hero");
  const applesBefore = apples(player);
  await blow(t, player);
  try {
    const first = await newNest(t, [], "No Horde Nest appeared");
    await assertRound(t, player, first, 1);
    await clearRound(t, player, first, 1);
    t.assert(apples(player) > applesBefore, "The player got no golden apple for clearing the round");
    const second = await newNest(t, [first.id], "Round 2 never put up a nest");
    await assertRound(t, player, second, 2);
  } finally {
    await stop(t, player);
  }
}

export async function roundsOneToThreeAllWork(t) {
  const player = t.player("Hero");
  await blow(t, player);
  try {
    const known = [];
    for (const round of [1, 2, 3]) {
      const nest = await newNest(t, known, `Round ${round} never put up a nest`);
      known.push(nest.id);
      await assertRound(t, player, nest, round);
      if (round < 3) await clearRound(t, player, nest, round);
    }
  } finally {
    await stop(t, player);
  }
}

/** Enemies of the horde that aren't guards at the nest, within `blocks` of the player. */
const marching = (t, player, blocks = 45) => horde(t).filter((m) => !m.hasTag("family:horde_guard") && far(m.location, player.location) < blocks);

export async function theHordeComesToThePlayersAndKeepsComing(t) {
  const player = t.player("Hero");
  await blow(t, player);
  try {
    await newNest(t, [], "No Horde Nest appeared");
    await t.until(() => marching(t, player).length > 0, "No enemies came near the player: the nest is far away, the horde has to come to them", 400);
    // They keep coming: killing them all doesn't end it, more arrive.
    for (const mob of marching(t, player)) mob.remove();
    await t.until(() => marching(t, player).length > 0, "The horde stopped coming after the first enemies were gone", 400);
  } finally {
    await stop(t, player);
  }
}

export async function theNestNeverStandsOnWater(t) {
  // A pond 4 blocks across and 2 deep over the ground, and dry land next to it.
  for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) for (const dy of [0, 1]) t.place("minecraft:water", x, dy, 8 + z);
  const spot = (dx, dz) => t.at(dx, 0, dz);
  const over = (dx, dz) => groundAt(t.dimension, spot(dx, dz).x, spot(dx, dz).z);
  t.assert(over(1, 9) === undefined, "A spot in the middle of the pond counts as dry land");
  t.assert(over(-6, -6) !== undefined, "Dry land next to the pond doesn't count as dry land");
}
