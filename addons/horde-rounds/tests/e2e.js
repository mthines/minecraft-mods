// Played by simulated players on the test server: mc test horde-rounds
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
  await t.until(() => horde(t).length > 0, `Round ${round} has a nest but no horde: there are no guards around it`, 100);
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
