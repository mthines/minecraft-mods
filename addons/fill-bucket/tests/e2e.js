// Played by simulated players on the test server: mc test fill-bucket
import { BlockPermutation, Direction } from "@minecraft/server";

const WALL = "minecraft:stone_bricks";

/** A wall frame in the plane z = 3, 5 wide and 5 high, with a 3×3 hole. `gap` leaves out one block of the frame. */
function frame(t, gap) {
  for (let x = -2; x <= 2; x++) {
    for (let y = 0; y <= 4; y++) {
      const edge = x === -2 || x === 2 || y === 0 || y === 4;
      if (edge && !(gap && x === 2 && y === 2)) t.place(WALL, x, y, 3);
    }
  }
}
const typeAt = (t, x, y, z) => t.dimension.getBlock(t.at(x, y, z))?.typeId;
const holeBlocks = (t) => [-1, 0, 1].flatMap((x) => [1, 2, 3].map((y) => typeAt(t, x, y, 3)));

/** Hits a mob next to the player with the bucket in hand: the other way to hit, for a player with no block in reach. */
function hitAMob(t, player) {
  const pig = t.dimension.spawnEntity("minecraft:pig", { x: player.location.x + 1, y: player.location.y, z: player.location.z });
  t.assert(player.attackEntity(pig), "Couldn't hit the mob with the bucket");
}

/** Stands a player with the bucket and clicks the top of the bottom beam: the inside of the frame. */
async function click(t, player, item = "family:fill_bucket") {
  t.hold(player, item);
  await t.wait(5);
  player.lookAtBlock(t.at(0, 0, 3));
  t.assert(player.useItemInSlotOnBlock(0, t.at(0, 0, 3), Direction.Up), "Couldn't use the bucket on the frame");
}

export async function theBucketFillsTheHoleInAFrame(t) {
  frame(t, false);
  const player = t.player("Builder");
  await click(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === WALL), () => `The hole should be 9 stone bricks, but is: ${holeBlocks(t).join(", ")}`, 40);
  t.assert(typeAt(t, 0, 1, 2) === "minecraft:air" && typeAt(t, 0, 1, 4) === "minecraft:air", "The fill spread outside the wall's layer");
}

export async function aFrameWithAGapDoesNotFillAnything(t) {
  frame(t, true);
  const player = t.player("Builder");
  await click(t, player);
  await t.wait(40);
  t.assert(holeBlocks(t).every((b) => b === "minecraft:air"), `A leaking frame was filled: ${holeBlocks(t).join(", ")}`);
}

export async function hittingABlockWithTheBucketUndoesTheFill(t) {
  frame(t, false);
  const player = t.player("Builder", 0, 1); // close enough to reach the frame
  await click(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === WALL), "The hole wasn't filled", 40);
  await t.wait(10);
  t.assert(player.breakBlock(t.at(-2, 2, 3)), "The player couldn't start hitting the frame"); // the frame's side: a hit on a block
  await t.until(() => holeBlocks(t).every((b) => b === "minecraft:air"), () => `Undo left: ${holeBlocks(t).join(", ")}`, 40);
  t.assert(typeAt(t, -2, 2, 3) === WALL, "Undo took the frame away too");
}

export async function theFillCannotBeUndoneAfterTenSeconds(t) {
  frame(t, false);
  const player = t.player("Builder");
  await click(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === WALL), "The hole wasn't filled", 40);
  await t.wait(220);
  hitAMob(t, player);
  await t.wait(30);
  t.assert(holeBlocks(t).every((b) => b === WALL), "The fill was undone after more than 10 seconds");
}

const STEP = "minecraft:cobblestone";

/** Builds the first blocks of a staircase along x in the plane z = 3 from `[dx, dy]` cells, and clicks the top of the last one from behind. */
async function clickStairs(t, cells, from = -10) {
  for (const [x, y] of cells) t.place(STEP, x, y, 3);
  const player = t.player("Stairs", from, 3);
  const [x, y] = cells[cells.length - 1];
  t.hold(player, "family:fill_bucket");
  await t.wait(5);
  player.lookAtBlock(t.at(x, y, 3));
  t.assert(player.useItemInSlotOnBlock(0, t.at(x, y, 3), Direction.Up), "Couldn't use the bucket on the stairs");
}
const built = (t, cells) => cells.every(([x, y]) => typeAt(t, x, y, 3) === STEP);

// up, straight, up, straight, up
const UP_STRAIGHT = [[-6, 0], [-5, 1], [-4, 1], [-3, 2], [-2, 2], [-1, 3]];

export async function theBucketKeepsBuildingAnUpStraightStaircaseUntilSomethingIsInTheWay(t) {
  t.place("minecraft:glass", 3, 5, 3); // the pattern wants a block here
  await clickStairs(t, UP_STRAIGHT);
  const more = [[0, 3], [1, 4], [2, 4]];
  await t.until(() => built(t, more), () => `The staircase wasn't continued: ${more.map(([x, y]) => typeAt(t, x, y, 3)).join(", ")}`, 40);
  await t.wait(20);
  t.assert(typeAt(t, 3, 5, 3) === "minecraft:glass", "The bucket built through the block in the way");
  t.assert(typeAt(t, 4, 5, 3) === "minecraft:air" && typeAt(t, 3, 4, 3) === "minecraft:air", "The staircase kept going past the block in the way");
}

export async function theBucketKeepsBuildingADownStaircase(t) {
  const down = [[-6, 6], [-5, 5], [-4, 5], [-3, 4], [-2, 4], [-1, 3]];
  await clickStairs(t, down);
  const more = [[0, 3], [1, 2], [2, 2], [3, 1], [4, 1], [5, 0]];
  await t.until(() => built(t, more), () => `The down staircase wasn't continued: ${more.map(([x, y]) => typeAt(t, x, y, 3)).join(", ")}`, 60);
}

export async function theStaircaseStopsWhereTheLineYouBuiltGoesAnotherWay(t) {
  t.place(STEP, 1, 3, 3); // two straights in a row: (0, 3) then (1, 3), where the pattern wants to go up
  await clickStairs(t, UP_STRAIGHT);
  await t.until(() => typeAt(t, 0, 3, 3) === STEP, "The bucket didn't add the block that joins the landing", 40);
  await t.wait(20);
  t.assert(typeAt(t, 1, 4, 3) === "minecraft:air", "The staircase went up where the line you built goes straight");
}

export async function twoStepsAreNotEnoughToSeeAPattern(t) {
  await clickStairs(t, [[-6, 0], [-5, 1], [-4, 1]]);
  await t.wait(40);
  t.assert(typeAt(t, -3, 2, 3) === "minecraft:air" && typeAt(t, -3, 1, 3) === "minecraft:air", "The bucket guessed a pattern from up and straight");
}

/** Real stair blocks: each faces up the stairs (weirdo_direction 0 = east). */
function placeStairs(t, cells) {
  const permutation = BlockPermutation.resolve("minecraft:oak_stairs", { weirdo_direction: 0, upside_down_bit: false });
  for (const [x, y] of cells) t.dimension.getBlock(t.at(x, y, 3)).setPermutation(permutation);
}
const stairAt = (t, x, y) => typeAt(t, x, y, 3) === "minecraft:oak_stairs";

export async function theBucketContinuesAStaircaseOfRealStairBlocks(t) {
  const cells = [[-3, 0], [-2, 1], [-1, 2]];
  placeStairs(t, cells);
  t.place("minecraft:glass", 3, 6, 3);
  const player = t.player("Stairs", -8, 3);
  t.hold(player, "family:fill_bucket");
  await t.wait(5);
  player.lookAtBlock(t.at(-1, 2, 3));
  t.assert(player.useItemInSlotOnBlock(0, t.at(-1, 2, 3), Direction.Up), "Couldn't use the bucket on the stairs");
  await t.wait(40);
  const found = [[0, 3], [1, 4], [2, 5]].map(([x, y]) => typeAt(t, x, y, 3)).join(", ");
  t.assert(found === "minecraft:oak_stairs, minecraft:oak_stairs, minecraft:oak_stairs", `The stairs weren't continued: ${found}`);
}

export async function aLoneStairBlockContinuesAsAStaircaseUpTheWayItFaces(t) {
  placeStairs(t, [[-1, 0]]);
  t.place("minecraft:glass", 3, 4, 3);
  // Looking sideways: the stair's own direction decides, not where the player looks.
  const player = t.player("Stairs", -3, 6);
  t.hold(player, "family:fill_bucket");
  await t.wait(5);
  player.lookAtBlock(t.at(-1, 0, 3));
  t.assert(player.useItemInSlotOnBlock(0, t.at(-1, 0, 3), Direction.Up), "Couldn't use the bucket on the stair");
  await t.until(() => [[0, 1], [1, 2], [2, 3]].every(([x, y]) => stairAt(t, x, y)), () => `The lone stair wasn't continued: ${[[0, 1], [1, 2], [2, 3]].map(([x, y]) => typeAt(t, x, y, 3)).join(", ")}`, 40);
  await t.wait(20);
  t.assert(typeAt(t, 3, 4, 3) === "minecraft:glass" && typeAt(t, 4, 4, 3) === "minecraft:air", "The staircase went through the block in the way");
}

export async function stairBlocksOfDifferentTypesAreOneStaircase(t) {
  placeStairs(t, [[-3, 0], [-1, 2]]);
  t.dimension.getBlock(t.at(-2, 1, 3)).setPermutation(BlockPermutation.resolve("minecraft:stone_stairs", { weirdo_direction: 0, upside_down_bit: false }));
  t.place("minecraft:glass", 2, 5, 3);
  const player = t.player("Stairs", -8, 3);
  t.hold(player, "family:fill_bucket");
  await t.wait(5);
  player.lookAtBlock(t.at(-1, 2, 3));
  t.assert(player.useItemInSlotOnBlock(0, t.at(-1, 2, 3), Direction.Up), "Couldn't use the bucket on the stairs");
  await t.until(() => [[0, 3], [1, 4]].every(([x, y]) => stairAt(t, x, y)), () => `Mixed stairs weren't one staircase: ${[[0, 3], [1, 4]].map(([x, y]) => typeAt(t, x, y, 3)).join(", ")}`, 40);
}

export async function sneakingPicksTheHoleFillInsteadOfTheStairs(t) {
  // A stair block inside a closed 3x3 frame: a click builds stairs, sneaking fills the frame's hole.
  frame(t, false);
  const stair = BlockPermutation.resolve("minecraft:oak_stairs", { weirdo_direction: 0, upside_down_bit: false });
  t.dimension.getBlock(t.at(0, 0, 3)).setPermutation(stair); // the frame's bottom middle is a stair
  const player = t.player("Builder", 0, 0);
  player.isSneaking = true;
  t.hold(player, "family:fill_bucket");
  await t.wait(5);
  player.lookAtBlock(t.at(0, 0, 3));
  t.assert(player.useItemInSlotOnBlock(0, t.at(0, 0, 3), Direction.Up), "Couldn't use the bucket");
  await t.until(() => holeBlocks(t).every((b) => b === "minecraft:oak_stairs"), () => `Sneaking should fill the hole: ${holeBlocks(t).join(", ")}`, 40);
}

/** A 5×5 ring of blocks on the ground in front of the player: a floor with a 3×3 hole. */
function ring(t) {
  for (let x = -2; x <= 2; x++) for (let z = 1; z <= 5; z++) if (x === -2 || x === 2 || z === 1 || z === 5) t.place(WALL, x, 0, z);
}
const floorHole = (t) => [-1, 0, 1].flatMap((x) => [2, 3, 4].map((z) => typeAt(t, x, 0, z)));

/** Sneak and use in the air `times`: the bucket's mode moves on. */
async function changeMode(t, player, times) {
  if (!player.getComponent("minecraft:inventory").container.getItem(0)?.typeId.startsWith("family:fill_bucket")) t.hold(player, "family:fill_bucket");
  player.isSneaking = true;
  for (let i = 0; i < times; i++) {
    await t.wait(10);
    t.assert(player.useItemInSlot(0), "Couldn't use the bucket in the air");
  }
  await t.wait(10);
  player.isSneaking = false;
}

async function clickRing(t, player) {
  player.lookAtBlock(t.at(-2, 0, 3));
  t.assert(player.useItemInSlotOnBlock(0, t.at(-2, 0, 3), Direction.East), "Couldn't use the bucket on the ring");
}

export async function floorModeFillsTheFloorRing(t) {
  ring(t);
  const player = t.player("Builder");
  await changeMode(t, player, 3); // auto, stairs, wall, floor
  await clickRing(t, player);
  await t.until(() => floorHole(t).every((b) => b === WALL), () => `Floor mode should fill the ring: ${floorHole(t).join(", ")}`, 40);
}

export async function wallModeDoesNotFillAFloorRing(t) {
  ring(t);
  const player = t.player("Builder");
  await changeMode(t, player, 2); // auto, stairs, wall
  await clickRing(t, player);
  await t.wait(40);
  t.assert(floorHole(t).every((b) => b === "minecraft:air"), `Wall mode filled the floor: ${floorHole(t).join(", ")}`);
}

export async function stairsModeDoesNotFillAHole(t) {
  frame(t, false);
  const player = t.player("Builder");
  await changeMode(t, player, 1); // auto, stairs
  const held = () => player.getComponent("minecraft:inventory").container.getItem(0)?.typeId;
  t.assert(held() === "family:fill_bucket_stairs", `Sneak and use should swap in the stairs bucket, but the player holds ${held()}`);
  player.lookAtBlock(t.at(0, 0, 3));
  t.assert(player.useItemInSlotOnBlock(0, t.at(0, 0, 3), Direction.Up), "Couldn't use the bucket on the frame");
  await t.wait(40);
  t.assert(holeBlocks(t).every((b) => b === "minecraft:air"), `Stairs mode filled the hole: ${holeBlocks(t).join(", ")}`);
}

export async function sneakAndUseInTheAirDoesNotUndoTheFill(t) {
  frame(t, false);
  const player = t.player("Builder");
  await click(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === WALL), "The hole wasn't filled", 40);
  await t.wait(10);
  player.isSneaking = true;
  t.assert(player.useItemInSlot(0), "Couldn't use the bucket in the air");
  await t.wait(30);
  t.assert(holeBlocks(t).every((b) => b === WALL), "Sneak and use in the air undid the fill: it should change the mode");
}

export async function eachModeIsItsOwnBucketWithItsOwnPicture(t) {
  const player = t.player("Builder");
  const held = () => player.getComponent("minecraft:inventory").container.getItem(0)?.typeId;
  t.hold(player, "family:fill_bucket");
  const seen = [held()];
  for (let i = 0; i < 5; i++) {
    await changeMode(t, player, 1);
    seen.push(held());
  }
  t.assert(
    seen.join(" ") === "family:fill_bucket family:fill_bucket_stairs family:fill_bucket_wall family:fill_bucket_floor family:fill_bucket_line family:fill_bucket",
    `The buckets should go plain, stairs, wall, floor, line, plain: ${seen.join(", ")}`,
  );
}

/** A player holding the line bucket clicks the side of the block at `at` (dx, dy, dz) facing `face`. */
async function lineClick(t, at, face) {
  const player = t.player("Liner", at[0], at[2] - 3);
  t.hold(player, "family:fill_bucket_line");
  await t.wait(5);
  player.lookAtBlock(t.at(...at));
  t.assert(player.useItemInSlotOnBlock(0, t.at(...at), face), "Couldn't use the line bucket");
  return player;
}
const row = (t, from, to, y = 1, z = 3) => Array.from({ length: to - from + 1 }, (_, i) => typeAt(t, from + i, y, z));

export async function lineModeFillsTheGapBetweenTwoPosts(t) {
  t.place(STEP, -3, 1, 3);
  t.place(STEP, 3, 1, 3);
  const player = await lineClick(t, [-3, 1, 3], Direction.East);
  await t.until(() => row(t, -2, 2).every((b) => b === STEP), () => `The gap between the posts wasn't filled: ${row(t, -2, 2).join(", ")}`, 40);
  t.assert(typeAt(t, -4, 1, 3) === "minecraft:air" && typeAt(t, 4, 1, 3) === "minecraft:air", "The line went past the posts");
  // Hitting with the bucket undoes it.
  await t.wait(10);
  hitAMob(t, player);
  await t.until(() => row(t, -2, 2).every((b) => b === "minecraft:air"), () => `Undo left: ${row(t, -2, 2).join(", ")}`, 40);
  t.assert(typeAt(t, -3, 1, 3) === STEP && typeAt(t, 3, 1, 3) === STEP, "Undo took a post away");
}

export async function lineModeFillsUpwardsBetweenAFloorAndACeiling(t) {
  t.place(STEP, 0, 1, 3);
  t.place(STEP, 0, 6, 3);
  await lineClick(t, [0, 1, 3], Direction.Up);
  await t.until(() => [2, 3, 4, 5].every((y) => typeAt(t, 0, y, 3) === STEP), "The gap between the floor block and the ceiling block wasn't filled", 40);
}

export async function lineModeDoesNothingWithoutABlockAtTheOtherEnd(t) {
  t.place(STEP, -3, 1, 3);
  await lineClick(t, [-3, 1, 3], Direction.East);
  await t.wait(40);
  t.assert(row(t, -2, 14).every((b) => b === "minecraft:air"), `The bucket filled a line with no block at the other end: ${row(t, -2, 14).join(", ")}`);
}

export async function usingTheBucketInTheAirNoLongerUndoes(t) {
  frame(t, false);
  const player = t.player("Builder");
  await click(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === WALL), "The hole wasn't filled", 40);
  await t.wait(10);
  t.assert(player.useItemInSlot(0), "Couldn't use the bucket in the air");
  await t.wait(30);
  t.assert(holeBlocks(t).every((b) => b === WALL), "Using the bucket in the air undid the fill: hitting does that now");
}

export async function theBucketDoesNotBreakBlocksSoHittingYourBuildIsSafe(t) {
  t.place(WALL, 0, 0, 3);
  const player = t.player("Builder");
  t.hold(player, "family:fill_bucket");
  await t.wait(5);
  player.lookAtBlock(t.at(0, 0, 3));
  player.breakBlock(t.at(0, 0, 3));
  await t.wait(120);
  t.assert(typeAt(t, 0, 0, 3) === WALL, "Hitting a block with the bucket broke it");
}

export async function hittingAMobWithTheBucketUndoesTheFill(t) {
  frame(t, false);
  const player = t.player("Builder");
  await click(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === WALL), "The hole wasn't filled", 40);
  await t.wait(10);
  hitAMob(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === "minecraft:air"), () => `Undo left: ${holeBlocks(t).join(", ")}`, 40);
  t.assert(typeAt(t, -2, 2, 3) === WALL, "Undo took the frame away too");
}
