// Played by simulated players on the test server: mc test cafe
const health = (player) => player.getComponent("minecraft:health");

export async function coffeeMakesYouSuperFast(t) {
  const player = t.player("Barista");
  await t.wait(5);
  t.hold(player, "family:coffee");
  player.useItemInSlot(0);
  await t.until(() => player.getEffect("speed")?.amplifier === 2, () => `No super speed after drinking coffee (speed: ${player.getEffect("speed")?.amplifier})`, 80);
}

export async function cakeHealsYou(t) {
  const player = t.player("Guest");
  await t.wait(5);
  health(player)?.setCurrentValue(6);
  t.hold(player, "family:cake_slice");
  player.useItemInSlot(0);
  await t.until(() => player.getEffect("regeneration"), () => "No regeneration after eating cake", 80);
}
