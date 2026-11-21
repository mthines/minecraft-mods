// Played by simulated players on the test server: mc test nuke
const NUKE = "family:nuke";

export async function aNukeClearsABigCraterButNotFarAway(t) {
  // a stone tower 8 blocks away to aim at, and another one far outside the crater
  for (let y = 0; y < 4; y++) {
    t.place("minecraft:stone", 0, y, 8);
    t.place("minecraft:stone", 0, y, 40);
  }
  const player = t.player();
  await t.wait(5);
  t.hold(player, NUKE);
  await t.until(() => {
    player.lookAtLocation(t.at(0.5, 3.5, 8.5));
    return player.getBlockFromViewDirection({ maxDistance: 20 })?.block.typeId === "minecraft:stone";
  }, "The test player never turned to the tower", 20);
  player.useItemInSlot(0);
  const block = (x, y, z) => t.dimension.getBlock(t.at(x, y, z))?.typeId;
  await t.until(() => block(0, 0, 8) === "minecraft:air" && block(0, -1, 14) === "minecraft:air", () => `The tower and the ground around it should be gone (${block(0, 0, 8)}, ${block(0, -1, 14)})`, 20 * 20);
  t.assert(block(0, 1, 40) === "minecraft:stone", "Far away from the crater, the other tower should still stand");
}
