// Played by simulated players on the test server: mc test invincible
import { EntityDamageCause } from "@minecraft/server";

const health = (player) => player.getComponent("minecraft:health")?.currentValue ?? 0;

/** Turns invincible on or off the way mc invincible does, with a script event. */
async function invincible(t, on) {
  t.dimension.runCommand(`scriptevent family:invincible ${on}`);
  await t.wait(2);
}

export async function nothingHurtsAnInvinciblePlayer(t) {
  const player = t.player("Untouchable");
  await t.wait(5);
  await invincible(t, true);
  try {
    const full = health(player);
    player.applyDamage(6, { cause: EntityDamageCause.entityAttack });
    player.applyDamage(6, { cause: EntityDamageCause.fall });
    const zombie = t.dimension.spawnEntity("minecraft:husk", t.at(0.5, 0, 1.5));
    await t.wait(60);
    zombie.remove();
    t.assert(health(player) === full, `An invincible player got hurt: health ${health(player)} of ${full}`);
  } finally {
    await invincible(t, false);
  }
  const full = health(player);
  player.applyDamage(4, { cause: EntityDamageCause.entityAttack });
  await t.until(() => health(player) < full, "With invincible off, damage should hurt again");
}
