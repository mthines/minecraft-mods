import { ButtonState, InputButton, ItemStack, Player, system, world } from "@minecraft/server";
import { AIM_DOWN, AIM_UP, HALF_WIDTH, UNBREAKABLE, aimFrom, face, findTree, frontLayer, isLeaves, isLiquid, isLog, nextStep } from "./dig.js";
import { emit } from "./telemetry.js";

const RIG = "family:drill_rig"; // the entities and the items that put them down share their names
const CUTTER = "family:tree_cutter";
const MACHINES = [RIG, CUTTER];
/** Drill heads by how many blocks across they cut. */
const HEADS = { 3: "family:drill_head", 5: "family:big_drill_head", 7: "family:giant_drill_head" };
const FIT_EVENTS = { "family:fit_drill_head": 3, "family:fit_big_drill_head": 5, "family:fit_giant_drill_head": 7 };
const LAYER_TICKS = { 3: 6, 5: 9, 7: 12 }; // how long one layer takes: bigger heads are slower
const FELL_PER_TICK = 60; // blocks of a tree cut each tick, so a giant tree doesn't freeze the server
const DIMENSIONS = ["overworld", "nether", "the_end"];

const machines = () => DIMENSIONS.flatMap((id) => world.getDimension(id).getEntities({ families: ["heavy_machine"] }));
/** @param {import("@minecraft/server").Entity} machine */
const driverOf = (machine) => {
  const [driver] = machine.getComponent("minecraft:rideable")?.getRiders() ?? [];
  return driver instanceof Player ? driver : undefined; // undefined for NPCs, which other mods can't see
};

/**
 * Forward input set by the e2e tests, whose simulated players can't hold keys: player id → how far W is pressed.
 * @type {Map<string, number>}
 */
const testInput = new Map();
system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (id === "family:machine_input" && sourceEntity) testInput.set(sourceEntity.id, Number(message));
  if (id === "family:machine_jump" && sourceEntity instanceof Player) switchDrill(sourceEntity); // simulated players can't press jump while riding
});
/** @param {Player} player */
function pressingForward(player) {
  const test = testInput.get(player.id);
  if (test !== undefined) return test > 0.3;
  try {
    return player.inputInfo.getMovementVector().y > 0.3;
  } catch {
    return false;
  }
}

/**
 * @typedef {object} MachineState
 * @property {number} next the tick it can start on the next layer
 * @property {number} blocks cut since it started working, for telemetry
 * @property {boolean} climbing holding on in a shaft it drilled up
 * @property {string} driver the name of who drove it last, for telemetry
 * @property {string} driverId who's driving now: someone new gets on with the drill off
 * @property {boolean} on the drill is switched on (jump switches it)
 * @property {string} way which way it drills ahead, and the layer ahead: the tunnel's floor carries on from layer to layer
 * @property {number} layer
 * @property {number} floorIn the floor of the layer before (a sloping tunnel steps from there)
 * @property {number} floorOut this layer's floor
 * @property {number} riseIn how far a sloping tunnel was behind its slope when it got to this layer
 * @property {number} riseOut how far behind it will be after this layer, carried to the next one
 */
/** @type {Map<string, MachineState>} machine id → how it's doing */
const states = new Map();
const stateOf = (/** @type {import("@minecraft/server").Entity} */ machine) => {
  let state = states.get(machine.id);
  if (!state) states.set(machine.id, (state = { next: 0, blocks: 0, climbing: false, driver: "", driverId: "", on: false, way: "", layer: 0, floorIn: 0, floorOut: 0, riseIn: 0, riseOut: 0 }));
  return state;
};

/** @param {import("@minecraft/server").Entity} machine @param {boolean} working */
function setWorking(machine, working) {
  if (machine.getProperty("family:working") !== working) machine.setProperty("family:working", working);
  if (working) return;
  // A stretch of work ended: one game event for Dash0.
  const state = stateOf(machine);
  if (state.blocks > 0) {
    emit(machine.typeId === RIG ? "heavy_machines.drilled" : "heavy_machines.felled", {
      "minecraft.player.name": state.driver,
      "minecraft.machine.type": machine.typeId.replace("family:", ""),
      "minecraft.blocks.count": state.blocks,
      ...(machine.typeId === RIG ? { "minecraft.drill.size": Number(machine.getProperty("family:drill_size")) } : {}),
    });
  }
  state.blocks = 0;
}

/** The machine stands in water or lava. @param {import("@minecraft/server").Entity} machine */
function inLiquid(machine) {
  if (machine.isInWater) return true;
  const { x, y, z } = machine.location;
  return [0, 1].some((up) => isLiquid(machine.dimension.getBlock({ x, y: y + up, z })?.typeId ?? ""));
}

/**
 * Breaks blocks as a player would (they drop what they drop), then puts the drops in the driver's inventory.
 * @param {import("@minecraft/server").Entity} machine
 * @param {Player} driver
 * @param {import("@minecraft/server").Block[]} blocks
 */
function breakBlocks(machine, driver, blocks) {
  const { dimension } = machine;
  for (const block of blocks) {
    const { x, y, z } = block.location;
    dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
  }
  if (!blocks.length) return;
  const middle = { x: 0, y: 0, z: 0 };
  for (const block of blocks) for (const axis of /** @type {const} */ (["x", "y", "z"])) middle[axis] += block.location[axis] / blocks.length;
  const reach = Math.max(...blocks.map((b) => Math.hypot(b.location.x - middle.x, b.location.y - middle.y, b.location.z - middle.z))) + 2;
  system.runTimeout(() => {
    const inventory = driver.isValid ? driver.getComponent("minecraft:inventory")?.container : undefined;
    if (!inventory) return;
    for (const item of dimension.getEntities({ type: "minecraft:item", location: middle, maxDistance: reach })) {
      const stack = item.getComponent("minecraft:item")?.itemStack;
      if (!stack) continue;
      const left = inventory.addItem(stack);
      item.remove();
      if (left) dimension.spawnItem(left, machine.location); // inventory full: it waits by the machine
    }
  }, 1);
}

// ── The drill rig ────────────────────────────────────────────────────────────

/** @param {import("@minecraft/server").Entity} rig @param {Player} driver */
function drill(rig, driver) {
  const state = stateOf(rig);
  if (state.driverId !== driver.id) Object.assign(state, { driverId: driver.id, on: false }); // someone just got on: the drill starts off
  const size = /** @type {3 | 5 | 7} */ (Number(rig.getProperty("family:drill_size")));
  const { x: pitch, y: yaw } = driver.getRotation();
  const { aim, dir, slope } = aimFrom(pitch, yaw);
  const tilt = aim === AIM_UP ? -90 : aim === AIM_DOWN ? 90 : Math.round((-Math.atan(slope) * 180) / Math.PI);
  if (rig.getProperty("family:tilt") !== tilt) rig.setProperty("family:tilt", tilt);
  // Climbing a shaft, the rig holds on until the driver looks down, or it's standing on something again.
  if (state.climbing && aim !== AIM_UP && (aim === AIM_DOWN || solidBelow(rig))) land(rig);

  if (system.currentTick % 10 === 0 && system.currentTick >= state.next) showControls(driver, size, state.on, tilt);
  if (system.currentTick < state.next) return; // still on the last layer
  if (!state.on || !pressingForward(driver)) return void setWorking(rig, false);

  if (inLiquid(rig)) return stop(rig, driver, "§cThe drill doesn't work in water or lava.");
  const rigFloor = Math.floor(rig.location.y + 0.01);
  let at = rig.location;
  let step = /** @type {-1 | 0 | 1} */ (0);
  if (aim === 0) {
    // A sloping tunnel: each layer, its floor steps up, down, or stays from the layer before, by where the driver looks now.
    const way = `${dir.x},${dir.z}`;
    const layer = frontLayer(rig.location, dir);
    if (state.way !== way || layer !== state.layer) {
      const onward = state.way === way && Math.abs(layer - state.layer) === 1;
      Object.assign(state, onward ? { floorIn: state.floorOut, riseIn: state.riseOut } : { floorIn: rigFloor, riseIn: 0 }, { way, layer });
    }
    const next = nextStep(state.riseIn, slope);
    step = next.step;
    Object.assign(state, { floorOut: state.floorIn + step, riseOut: next.rise });
    at = { ...rig.location, y: state.floorIn };
  } else state.way = "";
  const blocks = face(at, dir, size, step, rigFloor + size - 1).map((b) => rig.dimension.getBlock(b)).filter((b) => b !== undefined);
  // Water or lava in the face, or right around it, would pour into the tunnel.
  const around = blocks.flatMap((b) => [b.above(), b.below(), b.north(), b.south(), b.east(), b.west()]);
  if ([...blocks, ...around].some((b) => b && (isLiquid(b.typeId) || b.isWaterlogged))) return stop(rig, driver, "§cThere's water or lava ahead: the drill stops.");
  const solid = blocks.filter((b) => !b.isAir && !UNBREAKABLE.has(b.typeId));
  if (!solid.length) return void setWorking(rig, false); // nothing in front: it just drives

  breakBlocks(rig, driver, solid);
  if (aim === AIM_UP) {
    if (!state.climbing) {
      rig.triggerEvent("family:climb");
      state.climbing = true;
    }
    // Straight up only: the layer it cut is over all of the rig, wherever it is in the shaft. Moved sideways, it went into the wall.
    rig.teleport({ ...rig.location, y: Math.floor(rig.location.y + 0.01) + 1 });
  }
  rig.dimension.playSound("block.grindstone.use", rig.location, { pitch: 0.6, volume: 1 });
  rig.dimension.spawnParticle("minecraft:large_explosion", solid[Math.floor(solid.length / 2)].center());
  state.next = system.currentTick + LAYER_TICKS[size];
  state.blocks += solid.length;
  state.driver = driver.name;
  setWorking(rig, true);
}

/**
 * What the drill does now, under the hotbar.
 * @param {Player} driver @param {number} size @param {boolean} on @param {number} tilt degrees down (negative: up)
 */
function showControls(driver, size, on, tilt) {
  const name = `§6§lDrill rig§r ${size}×${size}`;
  if (!on) return driver.onScreenDisplay.setActionBar(`${name}  §7drill off§r · jump to turn it on · sneak to get off`);
  const where = tilt === -90 ? "straight up" : tilt === 90 ? "straight down" : tilt === 0 ? "straight ahead" : `sloping ${tilt > 0 ? "down" : "up"} ${Math.abs(tilt)}°`;
  driver.onScreenDisplay.setActionBar(`${name}  §adrill on§r · W drills ${where} · jump to turn it off`);
}

/** Jump turns the drill of the rig you're driving on or off. @param {Player} player */
function switchDrill(player) {
  const rig = player.getComponent("minecraft:riding")?.entityRidingOn;
  if (!rig?.isValid || rig.typeId !== RIG || driverOf(rig)?.id !== player.id) return;
  const state = stateOf(rig);
  state.driverId = player.id;
  state.on = !state.on;
  if (!state.on) setWorking(rig, false);
  rig.dimension.playSound(state.on ? "random.click" : "random.wood_click", rig.location, { pitch: state.on ? 0.6 : 0.4 });
  const size = Number(rig.getProperty("family:drill_size"));
  showControls(player, size, state.on, Number(rig.getProperty("family:tilt")));
}
world.afterEvents.playerButtonInput.subscribe(({ player }) => {
  if (player) switchDrill(player);
}, { buttons: [InputButton.Jump], state: ButtonState.Pressed });

/** @param {import("@minecraft/server").Entity} machine @param {Player} driver @param {string} why */
function stop(machine, driver, why) {
  setWorking(machine, false);
  driver.onScreenDisplay.setActionBar(why);
  stateOf(machine).next = system.currentTick + 20;
}

/** Something solid under the rig to stand on. @param {import("@minecraft/server").Entity} rig */
function solidBelow(rig) {
  const { x, y, z } = rig.location;
  return [-HALF_WIDTH + 0.2, 0, HALF_WIDTH - 0.2].some((dx) =>
    [-HALF_WIDTH + 0.2, 0, HALF_WIDTH - 0.2].some((dz) => {
      const block = rig.dimension.getBlock({ x: x + dx, y: y - 0.5, z: z + dz });
      return block !== undefined && !block.isAir && !block.isLiquid;
    }),
  );
}

/** @param {import("@minecraft/server").Entity} rig */
function land(rig) {
  rig.triggerEvent("family:land");
  stateOf(rig).climbing = false;
}

// Using a drill head on the rig puts it on; the old one drops next to the rig.
world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity: rig, eventId }) => {
  const size = FIT_EVENTS[/** @type {keyof typeof FIT_EVENTS} */ (eventId)];
  if (!size || !rig.isValid) return;
  const old = Number(rig.getDynamicProperty("family:head") ?? 3);
  rig.setDynamicProperty("family:head", size);
  rig.dimension.spawnItem(new ItemStack(HEADS[/** @type {3 | 5 | 7} */ (old)]), rig.location);
  rig.dimension.playSound("random.anvil_use", rig.location, { volume: 0.6 });
  for (const player of rig.dimension.getPlayers({ location: rig.location, maxDistance: 8 })) {
    if (player) player.sendMessage(`§6Drill rig:§r the ${size}×${size} drill head is on. It cuts ${size} blocks across.`);
  }
}, { entityTypes: [RIG] });

// ── The tree cutter ──────────────────────────────────────────────────────────

/** @param {import("@minecraft/server").Entity} cutter @param {Player} driver */
function cut(cutter, driver) {
  const state = stateOf(cutter);
  if (system.currentTick % 10 === 0 && system.currentTick >= state.next) driver.onScreenDisplay.setActionBar("§2§lTree cutter§r  drive into a tree to cut it all down · sneak to get off");
  if (system.currentTick < state.next) return;
  setWorking(cutter, false);
  if (!pressingForward(driver)) return;
  if (inLiquid(cutter)) return stop(cutter, driver, "§cThe tree cutter doesn't work in water or lava.");
  // The trunk in front: the 3 blocks across the front, from the ground up to the driver's head.
  const { dir } = aimFrom(0, driver.getRotation().y);
  const trunk = face(cutter.location, dir, 3).find((at) => isLog(cutter.dimension.getBlock(at)?.typeId ?? ""));
  if (!trunk) return;
  const tree = findTree(trunk, (at) => {
    const block = cutter.dimension.getBlock(at);
    if (!block) return undefined;
    return { type: block.typeId, natural: isLeaves(block.typeId) ? block.permutation.getState("persistent_bit") !== true : undefined };
  });
  if (!tree) return stop(cutter, driver, "§eThat's not a tree: logs with no leaves are someone's building.");
  // Logs from the bottom up, then the leaves: a bit each tick.
  const blocks = [...tree.logs.sort((a, b) => a.y - b.y), ...tree.leaves];
  const batches = Math.ceil(blocks.length / FELL_PER_TICK);
  for (let i = 0; i < batches; i++) {
    system.runTimeout(() => {
      if (!cutter.isValid) return;
      const batch = blocks.slice(i * FELL_PER_TICK, (i + 1) * FELL_PER_TICK).map((at) => cutter.dimension.getBlock(at)).filter((b) => b !== undefined && !b.isAir);
      breakBlocks(cutter, driver, batch);
    }, i);
  }
  cutter.dimension.playSound("mob.sheep.shear", cutter.location, { pitch: 0.5, volume: 1 });
  cutter.dimension.playSound("random.break", trunk, { pitch: 0.7, volume: 1 });
  driver.onScreenDisplay.setActionBar(`§2§lTimber!§r ${tree.logs.length} logs`);
  state.next = system.currentTick + batches + 20;
  state.blocks += tree.logs.length;
  state.driver = driver.name;
  setWorking(cutter, true);
}

// ── Both machines ────────────────────────────────────────────────────────────

system.runInterval(() => {
  for (const machine of machines()) {
    if (!machine.isValid) continue;
    const driver = driverOf(machine);
    if (!driver) {
      setWorking(machine, false);
      if (stateOf(machine).climbing) land(machine); // nobody holding the controls: down it comes
      continue;
    }
    if (machine.typeId === RIG) drill(machine, driver);
    else cut(machine, driver);
  }
}, 1);

// Tell whoever just put a machine down how it works.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (!entity.isValid || !MACHINES.includes(entity.typeId)) return;
  const how = entity.typeId === RIG
    ? "§6Drill rig!§r Use it to get on, and jump to turn the drill on. Then hold W and look where you want to drill: ahead, sloping up or down, or straight up or down. Use a bigger drill head on it to drill 5×5 or 7×7. It won't drill in water or lava."
    : "§2Tree cutter!§r Use it to get on, then drive into a tree: it cuts the whole tree down, branches and all.";
  for (const player of entity.dimension.getPlayers({ location: entity.location, maxDistance: 8 })) {
    if (player) player.sendMessage(`${how} Sneak and hit it to pick it up.`);
  }
});

// Sneak and hit a machine to put it back in your inventory, with its drill head.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: player, hitEntity: machine }) => {
  if (!machine || !MACHINES.includes(machine.typeId) || !(player instanceof Player) || !player.isSneaking) return;
  if (machine.getComponent("minecraft:rideable")?.getRiders().length) return; // not while someone is on it
  const inventory = player.getComponent("minecraft:inventory")?.container;
  const items = [new ItemStack(machine.typeId)];
  const head = Number(machine.getDynamicProperty("family:head") ?? 3);
  if (machine.typeId === RIG && head !== 3) items.push(new ItemStack(HEADS[/** @type {5 | 7} */ (head)])); // the rig item comes with the 3×3 head
  for (const item of items) {
    const left = inventory?.addItem(item);
    if (left) machine.dimension.spawnItem(left, machine.location); // inventory full: drop it instead
  }
  states.delete(machine.id);
  machine.remove();
});
