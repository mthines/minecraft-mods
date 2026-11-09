// Played by simulated players on the test server: mc test fill-bucket
import { Direction } from "@minecraft/server";

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

/** Stands a player with the bucket and clicks the top of the bottom beam: the inside of the frame. */
async function click(t, player) {
  t.hold(player, "family:fill_bucket");
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

export async function usingTheBucketInTheAirUndoesTheFill(t) {
  frame(t, false);
  const player = t.player("Builder");
  await click(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === WALL), "The hole wasn't filled", 40);
  await t.wait(10);
  t.assert(player.useItemInSlot(0), "Couldn't use the bucket in the air");
  await t.until(() => holeBlocks(t).every((b) => b === "minecraft:air"), () => `Undo left: ${holeBlocks(t).join(", ")}`, 40);
  t.assert(typeAt(t, -2, 2, 3) === WALL, "Undo took the frame away too");
}

export async function theFillCannotBeUndoneAfterThreeSeconds(t) {
  frame(t, false);
  const player = t.player("Builder");
  await click(t, player);
  await t.until(() => holeBlocks(t).every((b) => b === WALL), "The hole wasn't filled", 40);
  await t.wait(80);
  player.useItemInSlot(0);
  await t.wait(30);
  t.assert(holeBlocks(t).every((b) => b === WALL), "The fill was undone after more than 3 seconds");
}
