// Wins and losses per player name. Pure, so it can be unit tested (tests/ranking.test.mjs).
// Stored as a list of { n: name, w: wins, l: losses }: a plain object keyed by name would break on a player called "__proto__".

export const MAX_ENTRIES = 200;

/** @typedef {{ n: string, w: number, l: number }[]} Ranking */

/** @param {unknown} json what was saved @returns {Ranking} */
export function parse(json) {
  try {
    const list = JSON.parse(String(json ?? "[]"));
    return Array.isArray(list) ? list.filter((e) => e && typeof e.n === "string" && Number.isFinite(e.w) && Number.isFinite(e.l)) : [];
  } catch {
    return [];
  }
}

const better = (/** @type {Ranking[number]} */ a, /** @type {Ranking[number]} */ b) => b.w - a.w || a.l - b.l || a.n.localeCompare(b.n);

/** A new ranking with one win for `winner` and one loss for `loser`. Keeps the best MAX_ENTRIES players. @param {Ranking} ranking */
export function record(ranking, winner, loser) {
  const next = ranking.map((e) => ({ ...e }));
  const entry = (/** @type {string} */ name) => {
    let found = next.find((e) => e.n === name);
    if (!found) next.push((found = { n: name, w: 0, l: 0 }));
    return found;
  };
  entry(winner).w++;
  entry(loser).l++;
  return next.sort(better).slice(0, MAX_ENTRIES);
}

/** The best `n` players. @param {Ranking} ranking */
export const top = (ranking, n = 3) => [...ranking].sort(better).slice(0, n);

/** @param {Ranking} ranking @param {number} [n] */
export function lines(ranking, n = 3) {
  return top(ranking, n).map((e, i) => `${["§61st", "§72nd", "§c3rd"][i] ?? `${i + 1}th`} §f${e.n}§7: ${e.w} win${e.w === 1 ? "" : "s"}, ${e.l} loss${e.l === 1 ? "" : "es"}`);
}
