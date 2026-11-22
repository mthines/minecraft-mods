// 8×8 pixel pictures for the mod's items, drawn twice as big. `.` is see-through, C is the item's own color,
// o outline, K black, S silver, B glass blue, R red, Y yellow, G olive, W white.
export const ART = {
  racer: ["........", "...oo...", "..oBBo..", ".oCCCCo.", "oCCCCCCo", "oCCCCCCo", ".KSooSK.", "..KK.KK."],
  hauler: ["........", ".oooooo.", ".oCCoBo.", ".oCCoBo.", "oCCCooCo", "oCCCCCCo", ".KSoooSK", "..KK..KK"],
  farm: ["........", "....oo..", "...oBBo.", "..oCCCo.", ".oCCCCoK", "oCCCCoKK", ".SoooKKK", "..SS..KK"],
  seat: ["........", "..oooo..", "..oCCo..", "..oCCo..", "..oCCo..", ".ooCCooo", ".oCCCCCo", ".oooooo."],
  body: ["........", ".oooooo.", ".oCCCCo.", ".oCCCCo.", ".oCCCCo.", ".oCCCCo.", ".oooooo.", "........"],
  glass: ["........", ".oooooo.", ".oBWBBo.", ".oWBBBo.", ".oBBBBo.", ".oBBBBo.", ".oooooo.", "........"],
  thruster: ["........", "..oooo..", ".oSSSSo.", ".oSCCSo.", ".oSSSSo.", "..oKKo..", "..RYYR..", "...RR..."],
  wing: ["........", ".......o", "......oC", ".....oCC", "...ooCCo", "..oCCCo.", ".oCCoo..", "oooo...."],
  plow: ["........", "..S..S..", "..S..S..", ".oYYYYo.", ".oYYYYo.", "oSSoSSoS", "oS.oS.oS", "o..o..o."],
  gatling: ["........", "........", "ooooooo.", "oSSSSSSo", "oSSSSSSo", "oooooooK", "..oGGo.K", "..oGGo.."],
  rocket: ["........", "..oooooo", ".oGGGGGo", "oGKGKGGo", "oGGGGGGo", "oGKGKGGo", ".oGGGGGo", "..oooooo"],
  laser: ["........", "........", "......RR", ".ooooSRR", "oSSSSSS.", "oSSSSSS.", ".oooo...", ".oGGo..."],
  slab: ["........", "........", "........", ".oooooo.", ".oCCCCo.", ".oCCCCo.", ".oooooo.", "........"],
  ramp: ["........", "......oo", ".....oCo", "....oCCo", "...oCCCo", "..oCCCCo", ".oCCCCCo", ".oooooo."],
  ramp_back: ["........", "oo......", "oCo.....", "oCCo....", "oCCCo...", "oCCCCo..", "oCCCCCo.", ".oooooo."],
  light: ["........", "..oooo..", ".oYYYYo.", ".oYWWYo.", ".oYWWYo.", ".oYYYYo.", "..oooo..", "........"],
  spoiler: ["........", "........", "oooooooo", "oCCCCCCo", "oooooooo", "..oK.oK.", "..oK.oK.", "..oK.oK."],
  wrench: ["........", "..oo.oo.", ".oSSoSSo", ".oSSSSo.", "..oSSo..", "..oCCo..", "..oCCo..", "...oo..."],
  wheel: ["........", "..oooo..", ".oKKKKo.", "oKKSSKKo", "oKKSSKKo", ".oKKKKo.", "..oooo..", "........"],
  blueprint: ["........", "oooooooo", "oCCCCCCo", "oCWWCWCo", "oCCCCCCo", "oCWCWWCo", "oCCCCCCo", "oooooooo"],
  blueprint_saved: ["........", "oooooooo", "oCCCCCCo", "oCWWCWCo", "oCCCCCYo", "oCWCWYYo", "oCCCCYCo", "oooooooo"],
  packed: ["........", ".oooooo.", "oCCCCCCo", "oCooooCo", "oCCCCCCo", "oCCooCCo", "oCCCCCCo", ".oooooo."],
};
// Which picture and color each item uses.
export const LOOK = {
  racer: ["racer", "#d83a34"], hauler: ["hauler", "#3a6fd8"], farm: ["farm", "#4f9a3a"],
  seat: ["seat", "#8a4a32"], body: ["body", "#d8d8d8"], glass: ["glass", "#a8dcff"], thruster: ["thruster", "#6a6e74"], wing: ["wing", "#e8e8e8"],
  plow: ["plow", "#e8c020"], slab: ["slab", "#d8d8d8"], ramp: ["ramp", "#d8d8d8"], ramp_back: ["ramp_back", "#d8d8d8"], light: ["light", "#e8c020"], spoiler: ["spoiler", "#d02020"], gatling: ["gatling", "#8a8e94"], rocket: ["rocket", "#5a6a46"], laser: ["laser", "#c8ccd2"],
  wrench: ["wrench", "#d89a30"], wheel: ["wheel", "#444"], blueprint: ["blueprint", "#3a78c8"], blueprint_saved: ["blueprint_saved", "#3a78c8"], packed: ["packed", "#b0824a"],
  ready_sports_car: ["racer", "#e02020"], ready_truck: ["hauler", "#2a5ac8"], ready_tractor: ["farm", "#40a030"], ready_jet: ["racer", "#e8e8f0"],
};
const COLORS = { o: "#1c1c22", K: "#141418", S: "#b8bcc2", B: "#8fc8f0", R: "#d02020", Y: "#e8c020", G: "#4b5a3a", W: "#f4f4f4" };

/** The picture as 16×16 RGBA pixels. */
export function pixels(/** @type {string} */ key) {
  const [art, main] = LOOK[key];
  const rows = ART[art];
  const rgba = Buffer.alloc(16 * 16 * 4);
  const hex = (/** @type {string} */ h) => [1, 3, 5].map((i) => parseInt(h.length === 4 ? h[(i + 1) / 2] + h[(i + 1) / 2] : h.slice(i, i + 2), 16));
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = rows[y >> 1][x >> 1];
      if (ch === ".") continue;
      const [r, g, b] = hex(ch === "C" ? main : COLORS[ch]);
      rgba.set([r, g, b, 255], (y * 16 + x) * 4);
    }
  }
  return rgba;
}
