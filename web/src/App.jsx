import { Icon } from "./Icon.jsx";
import { avatars, landscapes, OPTION_HINTS, OPTION_ICONS, OPTION_NAMES, typeIcon } from "./icons.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Same structure as the k menu in mc dev: a category, then its kits, then a kit's types (like wood → spruce).
// A category with one kit (armor) opens that kit right away. Searching finds every kit and type.
const get = (url) => fetch(url).then((r) => r.json());

export function App() {
  const [menu, setMenu] = useState(null);
  const [failed, setFailed] = useState(false);
  const [path, setPath] = useState([]); // [category] or [category, kit]
  const [search, setSearch] = useState("");
  const [players, setPlayers] = useState([]);
  const [who, setWho] = useState("@a");
  const [craft, setCraft] = useState(false);
  const [tab, setTab] = useState("kits");
  const [places, setPlaces] = useState([]);
  const [sure, setSure] = useState(false);
  const [game, setGame] = useState(null); // { options: [{ id, on }], worlds: [{ name, current }] }
  const [switchTo, setSwitchTo] = useState(null); // a world waiting for a second tap, because players are online
  const faces = useMemo(() => avatars(players), [players]);
  const [toast, setToast] = useState(null);
  const timer = useRef();

  useEffect(() => { get("/api/places").then((d) => setPlaces(d.places)).catch(() => {}); }, []);
  useEffect(() => { get("/api/menu").then(setMenu).catch(() => setFailed(true)); }, []);
  useEffect(() => {
    const load = () => get("/api/players").then((d) => { setPlayers(d.players); setWho((w) => (w === "@a" || d.players.includes(w) ? w : "@a")); }).catch(() => {});
    load();
    const id = setInterval(() => !document.hidden && load(), 8000);
    return () => clearInterval(id);
  }, []);

  const say = useCallback((text, ok) => {
    clearTimeout(timer.current);
    setToast({ text, ok });
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const give = async (kit, label) => {
    say(`Giving ${label}…`, true);
    const r = await fetch("/api/give", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kit, who, craft }) })
      .then((res) => res.json()).catch(() => ({ error: "Can't reach the kit server." }));
    say(r.ok ? `✅ Gave ${label} to ${who === "@a" ? "everyone" : who}!` : `😕 ${r.error}`, !!r.ok);
  };

  useEffect(() => {
    if (tab !== "game") return;
    // The worlds come at once; the rules (fall damage, PvP, …) take a second to ask the server, and fill in when they arrive.
    get("/api/game").then((g) => setGame((old) => ({ ...g, options: g.options.map((o) => ({ ...o, on: o.on ?? old?.options.find((x) => x.id === o.id)?.on })) })))
      .then(() => get("/api/game/rules"))
      .then(({ rules }) => setGame((g) => ({ ...g, options: g.options.map((o) => (o.id in rules ? { ...o, on: rules[o.id] } : o)) })))
      .catch(() => say("😕 Can't reach the kit server.", false));
  }, [tab, say]);

  const flip = async (id, on) => {
    setGame((g) => ({ ...g, options: g.options.map((o) => (o.id === id ? { ...o, on } : o)) }));
    const r = await fetch("/api/option", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, on }) })
      .then((res) => res.json()).catch(() => ({ error: "Can't reach the kit server." }));
    if (!r.ok) {
      setGame((g) => ({ ...g, options: g.options.map((o) => (o.id === id ? { ...o, on: !on } : o)) }));
      say(`😕 ${r.error}`, false);
    }
  };

  const play = async (name) => {
    const force = switchTo === name;
    say("🌍 Switching worlds… this takes a minute", true);
    const r = await fetch("/api/world", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, force }) })
      .then((res) => res.json()).catch(() => ({ error: "Can't reach the kit server." }));
    if (r.needsConfirm) {
      setSwitchTo(name);
      setTimeout(() => setSwitchTo((w) => (w === name ? null : w)), 6000);
      return say(`⚠️ ${r.players.join(", ")} will be kicked! Tap again to switch`, false);
    }
    setSwitchTo(null);
    if (r.ok) get("/api/game").then((g) => setGame((old) => ({ ...g, options: old.options }))).catch(() => {});
    say(r.ok ? "✅ New world is ready!" : `😕 ${r.error}`, !!r.ok);
  };

  const doIt = async (action, text, extra = {}) => {
    say(`${text}…`, true);
    const r = await fetch("/api/do", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, who, ...extra }) })
      .then((res) => res.json()).catch(() => ({ error: "Can't reach the kit server." }));
    say(r.ok ? `✅ ${r.message || "Done!"}` : `😕 ${r.error}`, !!r.ok);
  };
  const clear = () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    setSure(false);
    doIt("clear", "Emptying backpacks");
  };

  const kits = useMemo(() => menu?.categories.flatMap((c) => c.kits) ?? [], [menu]);
  const category = menu?.categories.find((c) => c.name === path[0]);
  const kit = category?.kits.find((k) => k.name === path[1]);
  const hasCraft = (kit ? [kit] : category?.kits ?? kits).some((k) => k.craft);

  // One tile: opens (category, kit with types) or gives (anything else).
  const kitTile = (k, back) => ({
    key: k.name, emoji: k.emoji, title: k.name, sub: k.types ? `${k.types.length} kinds` : k.label,
    onClick: () => (k.types ? setPath([k.category, k.name]) : give(k.name, k.name)), open: !!k.types, back,
  });
  const typeTile = (k, type) => ({ key: `${k.name}-${type}`, emoji: typeIcon(k.name, type) ?? k.emoji, title: type, sub: k.name, onClick: () => give(`${k.name}-${type}`, type) });

  let tiles, title, back;
  const onKits = tab === "kits";
  const q = search.trim().toLowerCase();
  if (tab === "game") {
    title = "Game";
    const icons = landscapes(game?.worlds.map((w) => w.name) ?? []);
    tiles = [
      ...(game?.options ?? []).map((o) => ({
        key: o.id, emoji: OPTION_ICONS[o.id], title: OPTION_NAMES[o.id], sub: OPTION_HINTS[o.id], section: "rules", state: o.on,
        onClick: () => (o.on === undefined ? say("⏳ One moment…", true) : o.on === null ? say("😕 Is the server running?", false) : flip(o.id, !o.on)),
      })),
      ...(game?.worlds ?? []).map((w) => ({
        key: `world-${w.name}`, emoji: icons.get(w.name), title: w.name, sub: w.current ? "you are here" : switchTo === w.name ? "tap again!" : "", section: "worlds",
        here: w.current, danger: switchTo === w.name, onClick: () => (w.current ? say("🌍 You're already here!", true) : play(w.name)),
      })),
    ];
  } else if (tab === "do") {
    title = "Do something";
    tiles = [
      { key: "day", emoji: "🌞", title: "Make it day", onClick: () => doIt("day", "Making it day") },
      { key: "enemies", emoji: "💀", title: "Kill enemies", sub: "zombies, creepers…", onClick: () => doIt("enemies", "Removing enemies") },
      { key: "clear", emoji: "🧹", title: sure ? "Tap again to empty!" : "Clear backpack", sub: sure ? `for ${who === "@a" ? "everyone" : who}` : "item bar stays", danger: sure, onClick: clear },
    ];
  } else if (tab === "find") {
    title = "Find a place";
    tiles = places.map((p) => { const [emoji, ...rest] = p.label.split(" "); return { key: p.value, emoji, title: rest.join(" ").replace(/\s*\(.*\)/, ""), sub: rest.join(" ").match(/\((.*)\)/)?.[1], onClick: () => doIt("find", "Looking", { place: p.value }) }; });
  } else if (!menu) tiles = [];
  else if (q) {
    title = "Search";
    tiles = kits.flatMap((k) => [
      ...(`${k.name} ${k.label ?? ""}`.toLowerCase().includes(q) && !k.types ? [kitTile(k)] : []),
      ...(k.types ? (k.name.includes(q) ? [kitTile(k)] : []) : []),
      ...(k.types ?? []).filter((t) => `${k.name}-${t}`.includes(q)).map((t) => typeTile(k, t)),
    ]);
  } else if (kit?.types) {
    title = `${kit.emoji} ${kit.name}`;
    back = () => setPath(category.kits.length === 1 ? [] : [category.name]);
    tiles = kit.types.map((t) => typeTile(kit, t));
  } else if (category) {
    title = `${category.emoji} ${category.name}`;
    back = () => setPath([]);
    tiles = category.kits.map((k) => kitTile(k));
  } else {
    title = "Which kit?";
    tiles = menu.categories.map((c) => ({
      key: c.name, emoji: c.emoji, title: c.name, sub: c.kits.slice(0, 3).map((k) => k.name).join(", ") + (c.kits.length > 3 ? ", …" : ""), open: true,
      onClick: () => setPath(c.kits.length === 1 ? (c.kits[0].types ? [c.name, c.kits[0].name] : []) : [c.name]) || (c.kits.length === 1 && !c.kits[0].types && give(c.kits[0].name, c.kits[0].name)),
    }));
  }

  return (
    <div className="app">
      <header>
        <div className="row">
          {onKits && back ? <button className="back" onClick={back} aria-label="Back">←</button> : null}
          <h1>{title}</h1>
          {onKits && <input type="search" placeholder="🔍 Find a kit" value={search} onChange={(e) => setSearch(e.target.value)} enterKeyHint="search" />}
        </div>
        {tab !== "game" && <div className="row chips" role="group" aria-label="Give to">
          <span className="label">{onKits ? "Give to" : tab === "find" ? "Tell" : "For"}</span>
          {["@a", ...players].map((p) => (
            <button key={p} className={`chip ${who === p ? "on" : ""}`} onClick={() => setWho(p)}>{p === "@a" ? "👥 Everyone" : `${faces.get(p)} ${p}`}</button>
          ))}
          {!players.length && <span className="dim">nobody online</span>}
          {onKits && hasCraft && <button className={`chip craft ${craft ? "on" : ""}`} onClick={() => setCraft(!craft)}>🛠️ + crafting table</button>}
        </div>}
      </header>
      <main>
        {failed && <p className="empty">Can't reach the kit server. Is <code>./mc web</code> running?</p>}
        {menu && onKits && !tiles.length && <p className="empty">No kits found 🤷</p>}
        <div className="grid">
          {tiles.map((t, at) => [
            t.section && t.section !== tiles[at - 1]?.section ? <h2 key={`h-${t.section}`} className="section">{t.section === "rules" ? "⚙️ Rules" : "🌍 Worlds"}</h2> : null,
            <button key={t.key} className={`tile ${t.danger ? "danger" : ""} ${t.here ? "here" : ""} ${t.state === true ? "on" : ""} ${t.state === undefined && t.section === "rules" ? "loading" : ""}`} onClick={t.onClick}>
              {(t.state !== undefined || t.section === "rules") && <span className="badge">{t.state === undefined ? "…" : t.state === null ? "?" : t.state ? "✔ ON" : "✖ OFF"}</span>}
              <Icon icon={typeof t.emoji === "string" ? t.emoji.trim() || "📦" : t.emoji} />
              <span className="name">{t.title}</span>
              {t.sub && t.sub !== t.title && <span className="sub">{t.sub}</span>}
              {t.open && <span className="more">›</span>}
            </button>,
          ])}
        </div>
      </main>
      <nav>
        {[["kits", "🎒", "Kits"], ["do", "⚡", "Do"], ["find", "🧭", "Find"], ["game", "⚙️", "Game"]].map(([id, emoji, name]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); setSearch(""); }}><span>{emoji}</span>{name}</button>
        ))}
      </nav>
      {toast && <div className={`toast ${toast.ok ? "" : "bad"}`} role="status">{toast.text}</div>}
    </div>
  );
}
