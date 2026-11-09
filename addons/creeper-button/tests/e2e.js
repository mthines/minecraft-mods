// Played by simulated players on the test server: mc test creeper-button
import { EquipmentSlot } from "@minecraft/server";

const health = (entity) => entity.getComponent("minecraft:health")?.currentValue ?? 0;
const head = (player) => player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Head)?.typeId;

export async function theButtonGoesBoomAndHurtsOnlyMobs(t) {
  const player = t.player("Creeper");
  const mob = t.dimension.spawnEntity("minecraft:husk", t.at(2.5, 0, 0.5));
  t.dimension.setBlockType(t.at(0, 0, 2), "minecraft:oak_planks");
  await t.wait(10);
  const playerFull = health(player);
  const mobFull = health(mob);
  const startY = player.location.y;

  t.hold(player, "family:creeper_button");
  t.assert(player.useItemInSlot(0), "Couldn't press Use with the button");
  await t.until(() => head(player) === "minecraft:creeper_head", "Pressing the button didn't put a creeper head on", 10);

  let highest = startY;
  await t.until(() => {
    highest = Math.max(highest, player.location.y);
    return !mob.isValid || health(mob) < mobFull;
  }, () => `The husk still has full health (${mobFull}) after the boom`, 80);
  await t.until(() => {
    highest = Math.max(highest, player.location.y);
    return highest > startY + 1.5;
  }, () => `The boom only lifted the player ${(highest - startY).toFixed(1)} blocks`, 20);

  await t.wait(60); // landed again
  t.assert(health(player) >= playerFull, `The boom hurt the player (${health(player)} of ${playerFull})`);
  t.assert(t.dimension.getBlock(t.at(0, 0, 2))?.typeId === "minecraft:oak_planks", "The boom broke a block");
  t.assert(head(player) !== "minecraft:creeper_head", "The creeper head should come off after the boom");
}
