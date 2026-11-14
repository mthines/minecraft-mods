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

/** Blows the horn once. */
function blow(t, player) {
  t.hold(player, HORN);
  t.assert(player.useItemInSlot(0), "Couldn't blow the horn");
}

export async function blowingTheHornStartsRoundOneWithANestAndGuards(t) {
  const player = t.player("Blower");
  blow(t, player);
  try {
    await t.until(() => nests(t).length === 1, "No Horde Nest appeared after blowing the horn");
    await t.until(() => horde(t).length > 0, "The nest has no guards around it");
    const nest = nests(t)[0];
    t.assert(nest.getComponent("minecraft:health").currentValue > 0, "The nest has no health");
  } finally {
    await t.wait(25); // one tap is one blow: wait before blowing again
    blow(t, player);
    await t.until(() => nests(t).length === 0, "Blowing the horn again didn't end the game", 60);
  }
  await t.until(() => horde(t).length === 0, "The horde stayed after the game ended", 60);
}

export async function destroyingTheNestClearsTheRoundAndStartsTheNext(t) {
  const player = t.player("Hero");
  const applesBefore = apples(player);
  blow(t, player);
  try {
    const first = await t.until(() => nests(t)[0], "No Horde Nest appeared");
    await t.until(() => horde(t).length > 0, "The nest has no guards around it");
    first.kill();
    await t.until(() => horde(t).length === 0, "The horde stayed after the nest was destroyed", 60);
    t.assert(apples(player) > applesBefore, "The player got no golden apple for clearing the round");
    // After the break the next round puts up a new nest.
    const second = await t.until(() => nests(t).find((n) => n.id !== first.id), "No new nest after the break", 400);
    t.assert(second.isValid, "The next round's nest isn't there");
  } finally {
    await t.wait(25);
    blow(t, player);
    await t.until(() => nests(t).length === 0, "Blowing the horn again didn't end the game", 60);
  }
}
