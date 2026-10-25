import { system, world } from "@minecraft/server";

// Invincible: while it's on, nothing hurts players (mobs, other players, falling, fire, lava, drowning, hunger).
// mc invincible [on|off] sends "scriptevent family:invincible true|false|show". The answer goes to the log in the
// same words the server uses for game rules ("invincible = true"), so mc and mc dev read it like fall damage.
const EVENT = "family:invincible";
const ON = "family:invincible"; // world dynamic property: saved in the world, so it survives restarts

const isOn = () => world.getDynamicProperty(ON) === true;

world.beforeEvents.entityHurt.subscribe((event) => {
  // NPCs come through as undefined on the family server, so they can still be hurt.
  if (event.hurtEntity?.typeId === "minecraft:player" && isOn()) event.cancel = true;
});

system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
  if (id !== EVENT) return;
  if (message === "true" || message === "false") {
    world.setDynamicProperty(ON, message === "true");
    console.log(`invincible has been updated to ${isOn()}`);
    world.sendMessage(isOn() ? "§aEveryone is invincible now: nothing can hurt you!" : "§eInvincible is off: be careful again!");
  } else {
    console.log(`invincible = ${isOn()}`);
  }
});
