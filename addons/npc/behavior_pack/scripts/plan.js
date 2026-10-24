// What an NPC can be told to do, and the check every plan goes through before it runs.
// Plain logic, shared by the mod and by `mc npc` (which asks Claude to write plans): npm test

/** Places are relative to the player the NPC is helping: blocks forward, right, and up from their feet. */
export const ACTIONS = `
{"do":"say","text":"Hi!"}                         say something in chat
{"do":"come"}                                     walk over to the player
{"do":"follow","seconds":60}                      follow the player around (0 = until told something else)
{"do":"go","at":{"forward":5,"right":0,"up":0}}    walk to a place
{"do":"dig","at":{"forward":2,"right":0,"up":0},"width":3,"length":3,"depth":2}
                                                  dig a hole: width (left-right) x length (forward) blocks centered on "at", depth blocks down into the ground under "at"
{"do":"build","block":"minecraft:cobblestone","at":{"forward":3,"right":0,"up":0},"width":5,"length":1,"height":3,"hollow":false}
                                                  build a box of blocks centered on "at", going up from "at" ("hollow": only the outside walls)
{"do":"attack","mob":"minecraft:zombie","seconds":30}   fight the nearest mob of that type ("hostile" = any monster)
{"do":"jump"}                                     jump
{"do":"wait","seconds":3}                         wait
{"do":"leave"}                                    leave the game
`.trim();

const LIMITS = { width: 16, length: 16, depth: 16, height: 16, seconds: 600 };

/**
 * Checks a plan like {"npc":"new","actions":[...]} and returns it cleaned up, or the problems.
 * @param {any} plan
 * @returns {{ ok: true, plan: { npc: string, actions: any[] } } | { ok: false, errors: string[] }}
 */
export function checkPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") return { ok: false, errors: ["a plan is a JSON object"] };
  const npc = typeof plan.npc === "string" && plan.npc ? plan.npc : "new";
  if (!Array.isArray(plan.actions) || plan.actions.length === 0) errors.push("actions should be a list with at least one action");
  const actions = (Array.isArray(plan.actions) ? plan.actions : []).slice(0, 20).map((action, i) => {
    const where = `action ${i + 1} (${action?.do})`;
    const out = { do: action?.do };
    const number = (key, min, fallback) => {
      const value = action[key] ?? fallback;
      if (!Number.isFinite(value) || value < min || value > (LIMITS[key] ?? Infinity)) errors.push(`${where}: ${key} should be a number from ${min} to ${LIMITS[key]}`);
      out[key] = Math.round(value);
    };
    const place = () => {
      const at = action.at ?? {};
      for (const key of ["forward", "right", "up"]) {
        if (at[key] !== undefined && (!Number.isFinite(at[key]) || Math.abs(at[key]) > 64)) errors.push(`${where}: at.${key} should be a number from -64 to 64`);
      }
      out.at = { forward: Math.round(at.forward ?? 0), right: Math.round(at.right ?? 0), up: Math.round(at.up ?? 0) };
    };
    switch (action?.do) {
      case "say":
        if (typeof action.text !== "string" || !action.text) errors.push(`${where}: text is missing`);
        out.text = String(action.text ?? "").slice(0, 200);
        break;
      case "follow":
        number("seconds", 0, 0);
        break;
      case "go":
        place();
        break;
      case "dig":
        place();
        number("width", 1, 1);
        number("length", 1, 1);
        number("depth", 1, 1);
        break;
      case "build":
        place();
        if (typeof action.block !== "string" || !/^[a-z0-9_]+:[a-z0-9_]+$/.test(action.block)) errors.push(`${where}: block should look like minecraft:cobblestone`);
        out.block = action.block;
        number("width", 1, 1);
        number("length", 1, 1);
        number("height", 1, 1);
        out.hollow = action.hollow === true;
        break;
      case "attack":
        out.mob = typeof action.mob === "string" && action.mob ? action.mob : "hostile";
        number("seconds", 1, 30);
        break;
      case "wait":
        number("seconds", 0, 1);
        break;
      case "come":
      case "jump":
      case "leave":
        break;
      default:
        errors.push(`${where}: unknown action; use one of say, come, follow, go, dig, build, attack, jump, wait, leave`);
    }
    return out;
  });
  return errors.length ? { ok: false, errors } : { ok: true, plan: { npc, actions } };
}

/**
 * The player's facing, snapped to north, east, south, or west, so holes and walls line up with the world.
 * @param {{ x: number, z: number }} look the player's view direction
 */
export function facing(look) {
  return Math.abs(look.x) > Math.abs(look.z) ? { x: Math.sign(look.x), z: 0 } : { x: 0, z: Math.sign(look.z) || 1 };
}

/**
 * The block at a place given relative to the player's feet and facing.
 * @param {{ x: number, y: number, z: number }} feet @param {{ x: number, z: number }} ahead from facing()
 * @param {{ forward: number, right: number, up: number }} at
 */
export function blockAt(feet, ahead, at) {
  const right = { x: -ahead.z, z: ahead.x };
  return {
    x: Math.floor(feet.x) + ahead.x * at.forward + right.x * at.right,
    y: Math.floor(feet.y) + at.up,
    z: Math.floor(feet.z) + ahead.z * at.forward + right.z * at.right,
  };
}

/**
 * Every block of a box centered on `at`: width across, length forward, and `layers` going from at.up by `step` (1 up, -1 down).
 * @returns {{ x: number, y: number, z: number, edge: boolean }[]} in order, layer by layer
 */
export function box(feet, ahead, at, width, length, layers, step) {
  const blocks = [];
  const across = (n) => Array.from({ length: n }, (_, i) => i - Math.floor((n - 1) / 2));
  for (let layer = 0; layer < layers; layer++) {
    for (const f of across(length)) {
      for (const r of across(width)) {
        const edge = f === across(length)[0] || f === across(length).at(-1) || r === across(width)[0] || r === across(width).at(-1);
        blocks.push({ ...blockAt(feet, ahead, { forward: at.forward + f, right: at.right + r, up: at.up + layer * step }), edge });
      }
    }
  }
  return blocks;
}
