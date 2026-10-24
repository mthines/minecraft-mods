// Played by simulated players on the test server: mc test football
import { Direction } from "@minecraft/server";
import { findGoal, findOpponent } from "../behavior_pack/scripts/pitch.js";

const BALL = "family:football";
const GOAL = "minecraft:white_concrete";

/** A 5 wide, 3 high goal across x with its first post `dx, dz` from the middle; skips the last block if `leaveOut`. */
function buildGoal(t, dx, dz, leaveOut = false) {
  const blocks = [[0, 0], [0, 1], [0, 2], [4, 0], [4, 1], [4, 2], [1, 2], [2, 2], [3, 2]];
  for (const [u, dy] of leaveOut ? blocks.slice(0, -1) : blocks) t.place(GOAL, dx + u, dy, dz);
}

const ballInMatch = (t) => t.entities(BALL).find((b) => b.getTags().some((tag) => tag.startsWith("family:ball_")));

/** Builds two goals 16 apart; a player places the last block, which should start a match. */
async function startMatch(t) {
  buildGoal(t, -2, -8);
  buildGoal(t, -2, 8, true);
  const player = t.player("Builder", 0, 5);
  t.hold(player, GOAL, 1);
  // The left-out crossbar block goes against the east side of the one next to it.
  t.assert(player.useItemInSlotOnBlock(0, t.at(0, 2, 8), Direction.East), "The player couldn't place the last goal block");
  return t.until(() => ballInMatch(t), () => `No ball appeared: the match didn't start. ${whatTheModSees(t)}`);
}

/** What the mod's own goal finder makes of the two goals, to explain a failure. */
function whatTheModSees(t) {
  const getType = (x, y, z) => t.dimension.getBlock({ x, y, z })?.typeId;
  const near = findGoal(getType, t.at(-2, 0, 8).x, t.at(-2, 0, 8).y, t.at(-2, 0, 8).z);
  const far = findGoal(getType, t.at(-2, 0, -8).x, t.at(-2, 0, -8).y, t.at(-2, 0, -8).z);
  return `Goal finder: ${JSON.stringify({ near, far, opponent: near && findOpponent(getType, near) })}`;
}

export async function finishingTheSecondGoalStartsAMatch(t) {
  const ball = await startMatch(t);
  const middle = t.at(0.5, 0, 0.5);
  const off = Math.hypot(ball.location.x - middle.x, ball.location.z - middle.z);
  t.assert(off < 2, `The ball should start in the middle, but it's ${off.toFixed(1)} blocks away`);
}

export async function goalsOfDifferentSizesDontStartAMatch(t) {
  buildGoal(t, -2, -8);
  for (const [u, dy] of [[0, 0], [0, 1], [0, 2], [0, 3], [4, 0], [4, 1], [4, 2], [4, 3], [1, 3], [2, 3]]) t.place(GOAL, -2 + u, dy, 8);
  const player = t.player("Builder", 0, 5);
  t.hold(player, GOAL, 1);
  t.assert(player.useItemInSlotOnBlock(0, t.at(0, 3, 8), Direction.East), "The player couldn't place the last goal block");
  await t.wait(40);
  t.assert(!ballInMatch(t), "A match started with a 3 high and a 4 high goal");
}

export async function hittingTheBallKicksIt(t) {
  const ball = t.dimension.spawnEntity(BALL, t.at(0.5, 0, 2.5));
  const player = t.player("Kicker", 0, 0);
  await t.wait(10);
  const before = { ...ball.location };
  player.lookAtEntity(ball);
  player.attackEntity(ball);
  await t.until(() => Math.hypot(ball.location.x - before.x, ball.location.z - before.z) > 2, "The ball didn't move 2 blocks after a kick");
}

export async function usingTheBallKicksIt(t) {
  const ball = t.dimension.spawnEntity(BALL, t.at(0.5, 0, 2.5));
  const player = t.player("Kicker", 0, 0);
  await t.wait(10);
  const before = { ...ball.location };
  player.lookAtEntity(ball);
  t.assert(player.interactWithEntity(ball), "The player couldn't use the ball");
  await t.until(() => Math.hypot(ball.location.x - before.x, ball.location.z - before.z) > 2, "The ball didn't move 2 blocks after using it");
}

export async function theBallInAGoalScores(t) {
  const ball = await startMatch(t);
  // Roll the ball into the goal at z = -8 (Blue's goal), through the middle of its mouth.
  ball.teleport(t.at(0.5, 0, -6.5));
  await t.wait(2);
  ball.applyImpulse({ x: 0, y: 0, z: -1 });
  // After a goal the ball goes back to the middle as a new ball.
  await t.until(() => {
    const now = ballInMatch(t);
    return now && now.id !== ball.id && Math.abs(now.location.z - t.at(0, 0, 0.5).z) < 2;
  }, "No goal: the ball never went back to the middle", 200);
}
