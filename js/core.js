/* core.js — data loading, routing, DOM + formatting helpers shared by every view. */
const SPORTS = {
  cfb: { name: "CFB", full: "College Football", path: "football/college-football", featured: true,
         tabs: [["ratings", "Power Ratings"], ["predictions", "Predictions"], ["disappoint", "Most Disappointing"],
                ["recruiting", "Recruiting"], ["portal", "Transfer Portal"], ["record", "Model vs Market"], ["sim", "Game Sim"], ["teams", "Teams"], ["board", "Message Board"]] },
  nfl: { name: "NFL", full: "NFL", path: "football/nfl" },
  nba: { name: "NBA", full: "NBA", path: "basketball/nba" },
  mlb: { name: "MLB", full: "MLB", path: "baseball/mlb" },
  nhl: { name: "NHL", full: "NHL", path: "hockey/nhl" },
};
const PRO_TABS = [["ratings", "Power Ratings"], ["predictions", "Predictions"], ["record", "Model vs Market"], ["standings", "Standings"],
                  ["rumors", "Trade Rumors"], ["trade", "Trade Simulator"], ["sim", "Game Sim"], ["teams", "Teams"], ["board", "Message Board"]];
for (const k of ["nfl", "nba", "mlb", "nhl"]) SPORTS[k].tabs = PRO_TABS;

const _cache = {};
function load(name) {
  if (!_cache[name]) {
    _cache[name] = fetch(`data/${name}.json`, { cache: "no-cache" }).then(r => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    }).catch(e => { delete _cache[name]; throw e; });
  }
  return _cache[name];
}
async function sportData(sport) {
  const d = await load(sport);
  if (!d._byId) {
    d._byId = Object.fromEntries(d.teams.map(t => [t.id, t]));
  }
  return d;
}
const team = (d, id) => d._byId[id] || { id, name: "TBD/FCS", short: "FCS", abbr: "FCS", logo: "", color: "#666" };

/* ---------- DOM ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
function mount(...nodes) { const app = $("#app"); app.replaceChildren(...nodes.filter(n => n != null && n !== false)); window.scrollTo(0, 0); }

function logo(t, cls = "") {
  return t && t.logo ? h("img", { class: `logo ${cls}`, src: t.logo, alt: "", loading: "lazy" })
                     : h("span", { class: `logo ${cls}` });
}
function teamLink(sport, t, opts = {}) {
  return h("a", { class: "team-cell", href: `#/${sport}/team/${t.id}` }, logo(t),
           h("span", {}, opts.short ? (t.short || t.abbr) : t.name));
}

/* ---------- format ---------- */
const fmt = {
  n: (x, d = 1) => x == null || isNaN(x) ? "–" : Number(x).toFixed(d),
  sgn: (x, d = 1) => x == null || isNaN(x) ? "–" : (x > 0 ? "+" : "") + Number(x).toFixed(d),
  pct: (x, d = 0) => x == null ? "–" : (100 * x).toFixed(d) + "%",
  money: x => x == null ? "–" : x >= 1e6 ? `$${(x / 1e6).toFixed(x >= 1e8 ? 0 : 1)}M` : `$${Math.round(x / 1e3)}K`,
  date: s => new Date(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
  time: s => new Date(s).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  ago: s => {
    const m = (Date.now() - new Date(s)) / 6e4;
    return m < 60 ? `${Math.max(1, m | 0)}m ago` : m < 1440 ? `${(m / 60) | 0}h ago` : `${(m / 1440) | 0}d ago`;
  },
  rec: t => t.otl ? `${t.w}-${t.l}-${t.otl}` : `${t.w}-${t.l}`,
};
function spreadText(sport, d, g) {
  // margin > 0 means home favored; football/basketball show a spread, hockey/baseball a run/goal edge.
  const fav = g.margin >= 0 ? team(d, g.home) : team(d, g.away);
  const m = Math.abs(g.margin);
  if (m < (["nhl", "mlb"].includes(sport) ? 0.03 : 0.25)) return "Pick'em";
  if (["nhl", "mlb"].includes(sport)) return `${fav.abbr || fav.short} by ${m.toFixed(2)} ${d.unit}`;
  return `${fav.abbr || fav.short} -${(Math.round(m * 2) / 2).toFixed(1)}`;
}
/* ---------- sportsbook lines (DraftKings via ESPN) ---------- */
const mlProb = ml => ml == null ? null : ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
const fmtML = ml => ml == null ? "–" : ml > 0 ? `+${ml}` : `${ml}`;
function noVigHome(m) {             // book's win probability for the home side with the vig removed
  const h = mlProb(m?.mlH), a = mlProb(m?.mlA);
  return h == null || a == null ? null : h / (h + a);
}
const fmtSpread = s => s == null ? "–" : s === 0 ? "PK" : (s > 0 ? "+" : "") + s;
function american(p) {
  if (p <= 0 || p >= 1) return "–";
  return p >= 0.5 ? `${Math.round(-100 * p / (1 - p))}` : `+${Math.round(100 * (1 - p) / p)}`;
}

/* ---------- sortable table ---------- */
/* cols: [{k, label, num, fmt(row)->node|string, sort(row)->value, cls}] */
function table(cols, rows, opts = {}) {
  let sortK = opts.sort || null, asc = !!opts.asc;
  const tbody = h("tbody");
  const ths = cols.map(c => h("th", { class: c.num ? "num" : "", title: c.title || "" }, c.label));
  const draw = () => {
    let rs = rows.slice();
    if (sortK) {
      const c = cols.find(c => c.k === sortK);
      const val = c.sort || (r => r[c.k]);
      rs.sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null) return 1; if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (opts.limit) rs = rs.slice(0, opts.limit);
    tbody.replaceChildren(...rs.map((r, i) => h("tr", { onclick: opts.onRow ? () => opts.onRow(r) : null,
      style: opts.onRow ? { cursor: "pointer" } : null },
      cols.map(c => h("td", { class: (c.num ? "num " : "") + (c.cls || "") },
        c.fmt ? c.fmt(r, i) : r[c.k] ?? "–")))));
    ths.forEach((th, i) => {
      th.classList.toggle("sorted", cols[i].k === sortK);
      th.classList.toggle("asc", cols[i].k === sortK && asc);
    });
  };
  ths.forEach((th, i) => th.addEventListener("click", () => {
    const k = cols[i].k;
    if (cols[i].nosort) return;
    if (sortK === k) asc = !asc; else { sortK = k; asc = !!cols[i].asc; }
    draw();
  }));
  draw();
  const wrap = h("div", { class: "tbl-wrap", style: opts.maxH ? { maxHeight: opts.maxH, overflowY: "auto" } : null },
                 h("table", { class: "t" }, h("thead", {}, h("tr", {}, ths)), tbody));
  wrap.redraw = (newRows) => { if (newRows) rows = newRows; draw(); };
  return wrap;
}

function seg(options, value, onChange) {
  const el = h("div", { class: "seg" });
  const draw = () => el.replaceChildren(...options.map(([v, label]) =>
    h("button", { class: v === value ? "on" : "", onclick: () => { value = v; draw(); onChange(v); } }, label)));
  draw();
  return el;
}
function teamSelect(d, value, onChange, opts = {}) {
  const teams = d.teams.slice().sort((a, b) => a.name.localeCompare(b.name));
  const s = h("select", { class: "in", onchange: e => onChange(e.target.value) },
    opts.blank ? h("option", { value: "" }, opts.blank) : null,
    teams.map(t => h("option", { value: t.id, selected: t.id === value }, t.name)));
  return s;
}
function errorBox(e) {
  return h("div", { class: "card empty" }, "Couldn't load this view: ", String(e.message || e),
           h("div", { class: "small" }, "Run build/run_all.py to (re)generate the data files."));
}
function stars(n) { return n ? "★".repeat(n) : "–"; }
const PHI = x => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { // Abramowitz-Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
