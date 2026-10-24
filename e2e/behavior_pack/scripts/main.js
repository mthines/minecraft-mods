// Runs the e2e tests when the runner sends: scriptevent family:e2e run
// tools/e2e.mjs copies each mod's tests/e2e.js into mods/ and writes mods/index.js.
import { system, world } from "@minecraft/server";
import { tests } from "./mods/index.js";
import { makeTester } from "./tester.js";

const ARENA_SPACING = 48; // blocks between tests, so they can't bump into each other
const TIMEOUT_TICKS = 30 * 20;

/** @param {Record<string, unknown>} event */
const report = (event) => console.log(JSON.stringify(event));

system.afterEvents.scriptEventReceive.subscribe(({ id }) => {
  if (id === "family:e2e") void runAll();
});

async function runAll() {
  const dimension = world.getDimension("overworld");
  let passed = 0;
  for (const [i, test] of tests.entries()) {
    const corner = { x: i * ARENA_SPACING + 16, z: 16 };
    const size = ARENA_SPACING - 16;
    // Keep this test's arena loaded with nobody around: real players never join the test server.
    // One small area per test, as Minecraft limits how big one can be.
    // It reaches a whole chunk past the arena: a chunk at the area's edge can wait for its neighbor to load
    // (the test world's chunk at x 480 never did), and then the arena never finishes loading.
    dimension.runCommand(`tickingarea add ${corner.x - 16} 0 ${corner.z - 16} ${corner.x + size + 16} 0 ${corner.z + size + 16} e2e_${i} true`);
    const start = system.currentTick;
    /** @type {Awaited<ReturnType<typeof makeTester>> | undefined} */
    let t;
    try {
      t = await makeTester(dimension, corner, size);
      const tester = t;
      const finished = await Promise.race([test.run(tester).then(() => true), tester.wait(TIMEOUT_TICKS).then(() => false)]);
      if (!finished) throw new Error("took longer than 30 seconds");
      passed++;
      report({ "e2e.mod": test.mod, "e2e.test": test.name, "e2e.result": "pass", "e2e.ticks": system.currentTick - start });
    } catch (e) {
      report({ "e2e.mod": test.mod, "e2e.test": test.name, "e2e.result": "fail", "e2e.ticks": system.currentTick - start, "e2e.error": e instanceof Error ? e.message : String(e) });
    } finally {
      t?.cleanUp();
      dimension.runCommand(`tickingarea remove e2e_${i}`);
    }
  }
  report({ "e2e.done": true, "e2e.passed": passed, "e2e.failed": tests.length - passed });
}
