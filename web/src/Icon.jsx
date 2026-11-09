// Draws an icon from icons.js: an emoji, or a small shape (block, ingot, gem, nugget, pile, lump) in its own color.
const shade = (hex, by) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const to = by < 0 ? 0 : 255;
  return `#${[r, g, b].map((c) => Math.round(c + (to - c) * Math.abs(by)).toString(16).padStart(2, "0")).join("")}`;
};

/** What a block looks like on top of its color, in a 64 box (the block is 8..56). */
function Pattern({ pattern, color }) {
  const dark = shade(color, -0.3), light = shade(color, 0.35);
  const line = { stroke: dark, strokeWidth: 2.5, fill: "none", strokeLinecap: "round" };
  switch (pattern) {
    case "bricks": return <path {...line} d="M8 24H56M8 40H56M32 8V24M20 24V40M44 24V40M32 40V56" />;
    case "tiles": return <path {...line} d="M32 8V56M8 32H56" />;
    case "cobble": return <g fill={dark} opacity=".55"><circle cx="20" cy="20" r="8" /><circle cx="42" cy="22" r="7" /><circle cx="24" cy="42" r="7" /><circle cx="44" cy="44" r="8" /></g>;
    case "mossy": return <g><g fill={dark} opacity=".5"><circle cx="20" cy="20" r="8" /><circle cx="42" cy="22" r="7" /><circle cx="24" cy="42" r="7" /><circle cx="44" cy="44" r="8" /></g><g fill="#5fa03a"><circle cx="16" cy="14" r="6" /><circle cx="48" cy="16" r="5" /><circle cx="30" cy="30" r="4" /><circle cx="46" cy="48" r="5" /></g></g>;
    case "speck": return <g fill={dark} opacity=".6"><circle cx="18" cy="18" r="2.5" /><circle cx="38" cy="14" r="2" /><circle cx="48" cy="30" r="2.5" /><circle cx="24" cy="34" r="2" /><circle cx="40" cy="46" r="2.5" /><circle cx="16" cy="48" r="2" /></g>;
    case "layers": return <path {...line} d="M8 22H56M8 36H56M8 48H56" />;
    case "planks": return <path {...line} d="M8 21H56M8 34H56M8 47H56" />;
    case "smooth": return <path d="M14 14L40 14L14 40Z" fill={light} opacity=".55" />;
    case "glass": return <g><path d="M16 14L30 14L14 30Z M40 14L46 14L14 46L14 40Z" fill="#fff" opacity=".6" /><rect x="12" y="12" width="40" height="40" rx="4" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2.5" /></g>;
    case "wool": return <g fill={light} opacity=".7"><circle cx="20" cy="20" r="4" /><circle cx="36" cy="18" r="4" /><circle cx="48" cy="30" r="4" /><circle cx="26" cy="34" r="4" /><circle cx="40" cy="46" r="4" /><circle cx="18" cy="48" r="4" /></g>;
    case "terracotta": return <path {...line} d="M8 32H56M32 8V56" opacity=".5" />;
    default: return null;
  }
}

function Shape({ icon: { shape, color, pattern } }) {
  const dark = shade(color, -0.3), light = shade(color, 0.3), edge = shade(color, -0.5);
  switch (shape) {
    case "block":
      return <g><rect x="8" y="8" width="48" height="48" rx="6" fill={color} stroke={edge} strokeWidth="3" /><Pattern pattern={pattern} color={color} /></g>;
    case "ingot":
      return <g stroke={edge} strokeWidth="2" strokeLinejoin="round"><path d="M8 40L20 20H58L46 40Z" fill={light} /><path d="M8 40H46V52H8Z" fill={color} /><path d="M46 40L58 20V32L46 52Z" fill={dark} /></g>;
    case "gem":
      return <g stroke={edge} strokeWidth="2" strokeLinejoin="round"><path d="M18 12H46L58 26L32 58L6 26Z" fill={color} /><path d="M6 26H58M18 12L24 26L32 58L40 26L46 12M24 26H40" fill="none" /><path d="M18 12L6 26H24Z" fill={light} /><path d="M46 12L58 26H40Z" fill={dark} /></g>;
    case "nugget":
      return <g stroke={edge} strokeWidth="2"><circle cx="22" cy="40" r="12" fill={color} /><circle cx="42" cy="38" r="10" fill={light} /><circle cx="34" cy="22" r="9" fill={dark} /></g>;
    case "pile":
      return <g stroke={edge} strokeWidth="2" strokeLinejoin="round"><path d="M6 54Q16 20 32 12Q48 20 58 54Z" fill={color} /><g fill={light} stroke="none"><circle cx="26" cy="40" r="3.5" /><circle cx="38" cy="34" r="3" /><circle cx="34" cy="48" r="3.5" /><circle cx="20" cy="50" r="2.5" /></g></g>;
    case "lump":
      return <g stroke={edge} strokeWidth="2" strokeLinejoin="round"><path d="M10 40Q8 22 24 16Q40 8 52 22Q60 36 48 50Q30 58 14 50Z" fill={color} /><path d="M24 22Q34 20 40 28" fill="none" stroke={light} strokeWidth="3" strokeLinecap="round" /></g>;
    default:
      return null;
  }
}

/** Sized by --icon in CSS (56px by default), so phones can draw smaller ones. */
export function Icon({ icon }) {
  if (typeof icon === "string") return <span className="emoji" style={{ fontSize: `calc(var(--icon, 56px) * ${icon.length > 3 ? 0.75 : 1})` }} aria-hidden>{icon}</span>;
  return <svg className="shape" viewBox="0 0 64 64" aria-hidden><Shape icon={icon} /></svg>;
}
