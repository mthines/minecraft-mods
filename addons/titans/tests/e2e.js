// Played by simulated players on the test server: mc test titans

const TITAN = "family:titan";
const BOULDER = "family:boulder";
const health = (entity) => entity.getComponent("minecraft:health")?.currentValue ?? 0;
const burning = (entity) => entity.isValid && entity.getComponent("minecraft:onfire") !== undefined;

function titan(t, dx = 0, dz = 0) {
  return t.dimension.spawnEntity(TITAN, t.at(dx + 0.5, 0, dz + 0.5));
}

export async function aTitanRipsUpATreeNearbyForAClub(t) {
  for (let dy = 0; dy < 4; dy++) t.place("minecraft:oak_log", 3, dy, 0);
  const giant = titan(t);
  await t.wait(2);
  t.assert(giant.getProperty("family:has_tree") === false, "The titan already had a tree before it found one");
  await t.until(() => giant.getProperty("family:has_tree"), "The titan didn't pick up the tree next to it", 80);
  const left = [0, 1, 2, 3].filter((dy) => t.dimension.getBlock(t.at(3, dy, 0))?.typeId === "minecraft:oak_log");
  t.assert(left.length === 0, `The tree is still standing after the titan took it (${left.length} logs left)`);
}

export async function aTitanWithoutATreeNearbyHasNoClub(t) {
  const giant = titan(t);
  await t.wait(40);
  t.assert(giant.getProperty("family:has_tree") === false, "The titan got a club with no tree around");
}

export async function aTitanThrowsBouldersAtAPlayer(t) {
  const player = t.player("Hero", 10, 0);
  await t.wait(5);
  const full = health(player);
  titan(t, -2, 0);
  await t.until(() => t.entities(BOULDER).length > 0, "The titan didn't throw a boulder", 60);
  await t.until(() => health(player) < full, () => `The boulder didn't hurt the player (${health(player)} of ${full})`, 80);
}

export async function atHalfHealthTheHairCatchesFireAndBouldersBurn(t) {
  const player = t.player("Hero", 10, 0);
  player.addEffect("resistance", 600, { amplifier: 3, showParticles: false }); // live long enough to get set on fire
  await t.wait(5);
  const giant = titan(t, -2, 0);
  await t.wait(2);
  t.assert(giant.getProperty("family:fiery") === false, "The titan had fiery hair at full health");
  giant.applyDamage(30);
  await t.wait(12); // past the hurt cooldown, which would turn the next hit into just the difference
  t.assert(giant.getProperty("family:fiery") === false, "The titan's hair caught fire with most of its health left");
  giant.applyDamage(50);
  await t.until(() => giant.getProperty("family:fiery"), "The titan's hair didn't catch fire at half health", 20);
  await t.until(() => burning(player), "A boulder from the fiery titan didn't set the player on fire", 140);
}
