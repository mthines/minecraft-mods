// Played by simulated players on the test server: mc test rainbow-cookie
const health = (player) => player.getComponent("minecraft:health");

export async function aCookieHealsYouToFullLife(t) {
  const player = t.player("Hungry");
  await t.wait(5);
  health(player)?.setCurrentValue(4);
  t.hold(player, "family:rainbow_cookie");
  player.useItemInSlot(0);
  await t.until(() => health(player)?.currentValue === health(player)?.effectiveMax, () => `Still at ${health(player)?.currentValue} of ${health(player)?.effectiveMax} life after eating a cookie`, 80);
  t.assert(player.getEffect("speed"), "The cookie should make you fast too");
}
