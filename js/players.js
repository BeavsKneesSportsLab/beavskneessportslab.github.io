/* players.js — player pages (bio, season numbers, live game log), player compare, MLB Hot Stove. */
const Players = {};

function findPlayer(P, tid, pid) {
  if (tid && P[tid]) { const p = P[tid].find(x => x.id === pid); if (p) return [p, tid]; }
  for (const [t, ros] of Object.entries(P)) { const p = ros.find(x => x.id === pid); if (p) return [p, t]; }
  return [null, null];
}
function playerHref(sport, tid, pid) { return `#/${sport}/player/${tid}/${pid}`; }

const STAT_LABELS = {
  pts: "PTS", reb: "REB", ast: "AST", stl: "STL", blk: "BLK", tpm: "3PM", min: "MIN",
  g: "G", a: "A", sog: "SOG", h: "H", hr: "HR", rbi: "RBI", r: "R", pa: "PA",
  passYds: "Pass yds", passTD: "Pass TD", rushYds: "Rush yds", rushTD: "Rush TD", rec: "Rec", recYds: "Rec yds", recTD: "Rec TD", tkl: "Tkl", sacks: "Sacks", int: "INT",
};

async function gameLog(sport, p) {
  if (sport === "mlb") {
    const id = p.id.replace(/^mlb/, ""), group = p.pos === "P" || p.pos === "SP" || p.pos === "RP" ? "pitching" : "hitting";
    const j = await fetch(`https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=gameLog&season=2026&group=${group}`).then(r => r.json());
    const sp = (j.stats?.[0]?.splits || []).slice().reverse().slice(0, 25);
    const keys = group === "pitching" ? ["inningsPitched", "hits", "earnedRuns", "baseOnBalls", "strikeOuts", "era"] : ["atBats", "hits", "homeRuns", "rbi", "runs", "baseOnBalls", "strikeOuts", "avg"];
    const labels = group === "pitching" ? ["IP", "H", "ER", "BB", "K", "ERA"] : ["AB", "H", "HR", "RBI", "R", "BB", "K", "AVG"];
    return { labels, rows: sp.map(s => ({ date: s.date, opp: `${s.isHome ? "vs" : "@"} ${s.opponent?.abbreviation || s.opponent?.name || ""}`, res: s.isWin === true ? "W" : s.isWin === false ? "L" : "", stats: keys.map(k => s.stat?.[k] ?? "–") })) };
  }
  const j = await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/${SPORTS[sport].path}/athletes/${p.id}/gamelog`).then(r => r.json());
  const st = (j.seasonTypes || [])[0];
  if (!st) return { labels: [], rows: [] };
  const evs = st.categories.flatMap(c => c.events || []);
  return { labels: j.labels || [], season: st.displayName, rows: evs.map(e => { const m = j.events?.[e.eventId] || {};
    return { date: m.gameDate, opp: `${m.atVs || ""} ${m.opponent?.abbreviation || ""}`, res: `${m.gameResult || ""} ${m.score || ""}`.trim(), stats: e.stats }; }) };
}

Players.page = async (sport, args) => {
  const [tidArg, pid] = args.length > 1 ? args : [null, args[0]];
  const [d, P] = await Promise.all([sportData(sport), load(`${sport}_players`)]);
  const [p, tid] = findPlayer(P, tidArg, pid);
  if (!p) return mount(h("div", { class: "card empty" }, "Player not found in the current rosters."));
  const t = team(d, tid), isPro = sport !== "cfb";
  const kv = (label, val) => val == null || val === "" ? null : h("div", { class: "kpi" }, h("span", {}, label), h("b", {}, val));
  // football: real per-game averages from season totals (p.sim can hold the sim's starter-volume projection)
  const per = p.tot && p.gp ? Object.entries(p.tot).filter(([k, v]) => v && STAT_LABELS[k]).map(([k, v]) => [k, v / p.gp])
                            : Object.entries(p.sim || {}).filter(([k, v]) => v && STAT_LABELS[k]);
  const tot = Object.entries(p.tot || {}).filter(([k, v]) => v && STAT_LABELS[k]);
  const logBox = h("div", { class: "card tight" }, h("div", { class: "empty" }, "Loading game log…"));
  gameLog(sport, p).then(g => {
    if (!g.rows.length) { logBox.replaceChildren(h("div", { class: "empty" }, "No games logged this season.")); return; }
    logBox.replaceChildren(h("div", { class: "card-head" }, h("h2", {}, "Game log"), h("span", { class: "small muted" }, h("span", { class: "live-dot" }), g.season || "2026 season", " · live")),
      table([{ k: "date", label: "Date", sort: r => r.date, fmt: r => r.date ? fmt.date(r.date) : "" }, { k: "opp", label: "Opp", nosort: true }, { k: "res", label: "Result", nosort: true },
        ...g.labels.map((lb, i) => ({ k: "s" + i, label: lb, num: true, nosort: true, fmt: r => r.stats?.[i] ?? "–" }))], g.rows, { sort: "date", maxH: "560px" }));
  }).catch(() => logBox.replaceChildren(h("div", { class: "empty" }, "Couldn't load the game log right now.")));
  mount(
    h("div", { class: "team-hero", style: { background: `linear-gradient(120deg, ${t.color}, ${shade(t.color)})` } },
      p.img ? h("img", { class: "headshot xl", src: p.img, alt: "" }) : logo(t, "lg"),
      h("div", {}, h("h1", {}, p.name, p.qb1 ? h("span", { class: "chip good", style: { marginLeft: "10px", verticalAlign: "middle" } }, "QB1") : null),
        h("div", { style: { opacity: .9 } }, [p.pos, p.jersey ? `#${p.jersey}` : null, p.cls, p.age ? `age ${p.age}` : null, p.ht, p.wt].filter(Boolean).join(" · ")),
        h("a", { class: "team-cell", href: `#/${sport}/team/${tid}`, style: { color: "#fff", marginTop: "6px" } }, logo(t), t.name)),
      h("div", { class: "stats" }, p.inj ? h("div", { class: "stat" }, h("b", {}, p.inj), h("span", {}, "Status")) : null,
        isPro && p.salary ? h("div", { class: "stat" }, h("b", {}, fmt.money(p.salary) + (p.salEst ? "*" : "")), h("span", {}, `Salary · ${p.yrs ?? "?"} yrs`)) : null,
        isPro && p.tv ? h("div", { class: "stat" }, h("b", {}, fmt.n(p.tv.now, 0)), h("span", {}, "Trade value")) : null)),
    p.injNote ? h("div", { class: "note warn" }, p.injNote, p.injSrc ? [" · ", h("a", { class: "link", href: p.injSrc, target: "_blank", rel: "noopener" }, "source")] : null) : null,
    h("div", { class: "grid", style: { gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }, id: "plGrid" },
      h("div", { class: "grid", style: { alignContent: "start" } },
        h("div", { class: "card" }, h("h2", {}, "Season"), p.line ? h("p", { class: "muted" }, p.line) : null,
          per.length ? [h("h3", {}, sport === "cfb" || sport === "nfl" ? "Per game played" : "Per game"), h("div", { class: "kpis", style: { marginTop: 0 } }, per.map(([k, v]) => kv(STAT_LABELS[k], fmt.n(v, v >= 10 ? 0 : 1))))] : null,
          tot.length ? [h("h3", { style: { marginTop: "12px" } }, "Season totals"), h("div", { class: "kpis", style: { marginTop: 0 } }, tot.map(([k, v]) => kv(STAT_LABELS[k], fmt.n(v, 0))))] : null),
        isPro && p.tv ? h("div", { class: "card" }, h("h2", {}, "Trade profile"),
          h("div", { class: "kpis", style: { marginTop: 0 } }, kv("Value now", fmt.n(p.tv.now, 0)), kv("Future value", fmt.n(p.tv.fut, 0)), kv("Contract surplus", fmt.sgn(p.tv.sur, 0)), kv("Market value", fmt.money(p.mv))),
          h("a", { class: "btn sm", href: `#/${sport}/trade/${tid}/${p.id}`, style: { marginTop: "10px", display: "inline-block" } }, "Shop him in the trade simulator")) : null,
        h("div", { class: "card" }, h("h2", {}, "Compare"), comparePicker(sport, P, d, tid, p))),
      logBox));
  if (matchMedia("(max-width: 900px)").matches) $("#plGrid").style.gridTemplateColumns = "1fr";
};

function comparePicker(sport, P, d, tid, p) {
  const all = Object.entries(P).flatMap(([t, ros]) => ros.filter(x => x.sim && Object.keys(x.sim).length).map(x => ({ t, x })));
  const list = h("div", { class: "pick-list" });
  const input = h("input", { class: "in", placeholder: "Search a player to compare…", style: { width: "100%" }, oninput: e => {
    const q = e.target.value.toLowerCase();
    list.replaceChildren(...(q.length < 2 ? [] : all.filter(o => o.x.name.toLowerCase().includes(q) && o.x.id !== p.id).slice(0, 8).map(o =>
      h("a", { class: "mini-row", href: `#/${sport}/compare/${tid}/${p.id}/${o.t}/${o.x.id}` }, h("span", { class: "team-cell" }, logo(team(d, o.t)), o.x.name), h("span", { class: "muted small" }, o.x.pos)))));
  } });
  return h("div", {}, input, list);
}

Players.compare = async (sport, args) => {
  const [t1, p1, t2, p2] = args;
  const [d, P] = await Promise.all([sportData(sport), load(`${sport}_players`)]);
  const [a, ta] = findPlayer(P, t1, p1), [b, tb] = findPlayer(P, t2, p2);
  if (!a || !b) return mount(h("div", { class: "card empty" }, "One of those players isn't on a current roster."));
  const keys = [...new Set([...Object.keys(a.sim || {}), ...Object.keys(b.sim || {})])].filter(k => STAT_LABELS[k] && ((a.sim || {})[k] || (b.sim || {})[k]));
  const row = (label, va, vb, better = "high", dp = 1) => {
    const na = typeof va === "number" ? va : null, nb = typeof vb === "number" ? vb : null;
    const win = na != null && nb != null && na !== nb ? ((na > nb) === (better === "high") ? "a" : "b") : null;
    return h("tr", {}, h("td", { class: "num" + (win === "a" ? " pos" : "") }, na != null ? fmt.n(na, dp) : va ?? "–"), h("td", { class: "muted", style: { textAlign: "center" } }, label),
      h("td", { class: win === "b" ? "pos" : "" }, nb != null ? fmt.n(nb, dp) : vb ?? "–"));
  };
  const head = (p, t) => h("a", { class: "cmp-head", href: playerHref(sport, t, p.id) }, p.img ? h("img", { class: "headshot xl", src: p.img, alt: "" }) : logo(team(d, t), "lg"),
    h("b", {}, p.name), h("span", { class: "muted small" }, `${p.pos} · ${team(d, t).short}`));
  mount(h("h1", {}, "Player compare"),
    h("div", { class: "card" }, h("div", { class: "cmp-heads" }, head(a, ta), h("span", { class: "vs" }, "vs"), head(b, tb)),
      h("table", { class: "t cmp" }, h("tbody", {},
        row("Age", a.age, b.age, "low", 0),
        sport !== "cfb" ? row("Salary", a.salary ? fmt.money(a.salary) : "–", b.salary ? fmt.money(b.salary) : "–") : null,
        sport !== "cfb" && a.tv && b.tv ? row("Trade value", a.tv.now, b.tv.now, "high", 0) : null,
        row("Games", a.gp, b.gp, "high", 0),
        keys.map(k => row(`${STAT_LABELS[k]} / g`, (a.sim || {})[k] ?? 0, (b.sim || {})[k] ?? 0, k === "int" ? "high" : "high"))))),
    h("p", { class: "muted small" }, "Green marks the better number. Per-game figures are season averages (football: per game played)."));
};

/* ---------- MLB Hot Stove: official transactions feed, live ---------- */
Players.hotStove = async (sport) => {
  const d = await sportData("mlb");
  const byMlbName = Object.fromEntries(d.teams.map(t => [t.name.toLowerCase(), t]));
  const end = new Date(), start = new Date(Date.now() - 45 * 864e5);
  const iso = x => x.toISOString().slice(0, 10);
  const box = h("div", { class: "card tight" }, h("div", { class: "empty" }, "Loading transactions…"));
  let kind = "all", tid = "", items = [];
  const KINDS = { "Signed as Free Agent": "signing", "Trade": "trade", "Signed": "signing", "Released": "release", "Designated for Assignment": "dfa",
                  "Declared Free Agency": "free agent", "Contract Option": "option", "Selected": "callup", "Outrighted": "outright" };
  const kindOf = x => { for (const [k, v] of Object.entries(KINDS)) if ((x.typeDesc || "").includes(k)) return v; return "other"; };
  const draw = () => {
    const rows = items.filter(x => (kind === "all" || x.k === kind) && (!tid || x.teamId === tid));
    box.replaceChildren(...(rows.length ? rows.slice(0, 200).map(x => h("div", { class: "rumor" },
      h("div", {}, x.description), h("div", { class: "rumor-meta" }, h("span", { class: "chip " + (x.k === "trade" ? "accent" : x.k === "signing" ? "good" : "") }, x.k),
        h("span", {}, fmt.date(x.date)), x.team ? h("a", { class: "chip", href: `#/mlb/team/${x.team.id}` }, x.team.abbr) : null)))
      : [h("div", { class: "empty" }, "No transactions match.")]));
  };
  fetch(`https://statsapi.mlb.com/api/v1/transactions?sportId=1&startDate=${iso(start)}&endDate=${iso(end)}`).then(r => r.json()).then(j => {
    items = (j.transactions || []).filter(x => x.description).map(x => {
      const t = byMlbName[(x.toTeam?.name || x.fromTeam?.name || "").toLowerCase()];
      return { ...x, k: kindOf(x), team: t, teamId: t?.id, date: x.date || x.effectiveDate };
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    draw();
  }).catch(() => box.replaceChildren(h("div", { class: "empty" }, "Couldn't reach MLB's transactions feed.")));
  mount(h("h1", {}, "MLB Hot Stove"),
    h("p", { class: "lede" }, "Every signing, trade, release, option decision and free-agency filing from MLB's official transactions feed, last 45 days, pulled live. Free agency opens after the World Series."),
    h("div", { class: "toolbar" }, seg([["all", "All"], ["signing", "Signings"], ["trade", "Trades"], ["free agent", "Free agents"], ["option", "Options"], ["release", "Releases"]], kind, v => { kind = v; draw(); }),
      teamSelect(d, tid, v => { tid = v; draw(); }, { blank: "All teams" })),
    box);
};
