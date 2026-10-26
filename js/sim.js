/* sim.js — Monte Carlo game simulator: any two teams, any venue, up to 100k runs, with player box-score projections.

Team scoring: expected points come from the power-rating margin (incl. home edge when the venue is one team's
home) split around a projected total built from both teams' scoring rates. Football/basketball draw team
scores from normals (margin sd = the sport's sigma); hockey uses Poisson goals; baseball uses a gamma-Poisson
(overdispersed) run model. Ties go to OT / extras weighted by the rating edge.
Player lines: each player's per-game averages, scaled by how far his team's simulated score landed from its
expectation (stat-specific elasticity), then sampled (Poisson for counts, normal for yards/points). */
const Sim = {};

const SIM_STATS = {
  nba: [["pts", "PTS", 1.0, "n"], ["reb", "REB", 0.2, "p"], ["ast", "AST", 0.6, "p"], ["tpm", "3PM", 0.8, "p"], ["stl", "STL", 0, "p"], ["blk", "BLK", 0, "p"]],
  nhl: [["g", "G", 1.0, "p"], ["a", "A", 1.0, "p"], ["sog", "SOG", 0.4, "p"]],
  mlb: [["h", "H", 0.6, "p"], ["hr", "HR", 0.8, "p"], ["r", "R", 1.0, "p"], ["rbi", "RBI", 1.0, "p"]],
  nfl: [["passYds", "Pass Yds", 0.5, "y"], ["passTD", "Pass TD", 1.0, "p"], ["rushYds", "Rush Yds", 0.5, "y"], ["rushTD", "Rush TD", 1.0, "p"],
        ["rec", "Rec", 0.4, "p"], ["recYds", "Rec Yds", 0.5, "y"], ["recTD", "Rec TD", 1.0, "p"], ["tkl", "Tkl", 0, "p"], ["sacks", "Sacks", 0, "p"]],
};
SIM_STATS.cfb = SIM_STATS.nfl;

function rng() { return Math.random(); }
function normal(mu, sd) { let u = 0, v = 0; while (!u) u = rng(); v = rng(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function poisson(l) {
  if (l <= 0) return 0;
  if (l > 30) return Math.max(0, Math.round(normal(l, Math.sqrt(l))));
  const L = Math.exp(-l); let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}
function gamma(k, theta) { // Marsaglia-Tsang, k >= 1
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = normal(0, 1); v = 1 + c * x; } while (v <= 0); v = v * v * v;
    const u = rng(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * theta; }
}

// Turn a continuous points draw into a real football score: ~72% of points as touchdowns, the rest field
// goals, with the occasional missed PAT / two-point try. Keeps the normal's mean and spread.
function footballScore(x) {
  const pts = Math.max(0, x);
  const td = Math.max(0, Math.round((pts * 0.72) / 7 + (rng() - 0.5) * 0.6));
  const fg = Math.max(0, Math.round((pts - 7 * td) / 3));
  let s = 7 * td + 3 * fg;
  for (let i = 0; i < td; i++) { const u = rng(); if (u < 0.04) s -= 1; else if (u < 0.07) s += 1; }
  if (rng() < 0.02) s += 2;
  return s;
}

function pickPlayers(sport, ros) {
  const has = ros.filter(p => p.sim && Object.keys(p.sim).length);
  const by = (k, n, f = () => true) => has.filter(f).sort((a, b) => (b.sim[k] || 0) - (a.sim[k] || 0)).slice(0, n).filter(p => p.sim[k] > 0);
  if (sport === "nba") return by("min", 10);
  if (sport === "nhl") return has.filter(p => p.pos !== "G").sort((a, b) => (b.sim.g + b.sim.a) - (a.sim.g + a.sim.a)).slice(0, 12);
  if (sport === "mlb") return by("pa", 9);
  const seen = new Set(), out = [];
  for (const p of [...by("passYds", 1), ...by("rushYds", 2), ...by("recYds", 4), ...has.slice().sort((a, b) => ((b.sim.tkl || 0) + 4 * (b.sim.sacks || 0)) - ((a.sim.tkl || 0) + 4 * (a.sim.sacks || 0))).slice(0, 3)])
    if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  return out;
}

function scoringRates(d, sport) {
  if (sport !== "cfb") return Object.fromEntries(d.teams.map(t => [t.id, [t.off || 0, t.dfn || 0]]));
  const acc = {};
  for (const g of d.schedule) {
    if (g.state !== "post" || g.hs == null) continue;
    for (const [me, pf, pa] of [[g.home, g.hs, g.as], [g.away, g.as, g.hs]]) {
      const a = acc[me] ||= [0, 0, 0]; a[0] += pf; a[1] += pa; a[2]++;
    }
  }
  const all = Object.values(acc), L = all.reduce((s, a) => s + a[0], 0) / Math.max(1, all.reduce((s, a) => s + a[2], 0));
  d.leagueAvg = L || d.leagueAvg;
  return Object.fromEntries(Object.entries(acc).map(([id, [pf, pa, n]]) => { const s = n / (n + 4); return [id, [s * (pf / n - L), s * (pa / n - L)]]; }));
}

Sim.run = (sport, d, A, B, homeId, N, players) => {
  const sigma = d.sigma, hfa = d.hfa, L = d.leagueAvg;
  const sc = d._rates ||= scoringRates(d, sport);
  const [oA, dA] = sc[A.id] || [0, 0], [oB, dB] = sc[B.id] || [0, 0];
  const m = (A.rating || 0) - (B.rating || 0) + (homeId === A.id ? hfa : homeId === B.id ? -hfa : 0);
  const T = Math.max(L * 1.2, 2 * L + oA + dB + oB + dA);
  const eA = Math.max(0.2, T / 2 + m / 2), eB = Math.max(0.2, T / 2 - m / 2);
  const sA = new Int16Array(N), sB = new Int16Array(N);
  let wins = 0, ot = 0;
  const pEdge = PHI(m / sigma);
  for (let i = 0; i < N; i++) {
    let a, b;
    if (sport === "nhl") { a = poisson(eA); b = poisson(eB); }
    else if (sport === "mlb") { a = poisson(gamma(3.5, eA / 3.5)); b = poisson(gamma(3.5, eB / 3.5)); }
    else if (sport === "nba") { const sd = sigma / Math.SQRT2; a = Math.max(60, Math.round(normal(eA, sd))); b = Math.max(60, Math.round(normal(eB, sd))); }
    else { const sd = sigma / Math.SQRT2; a = footballScore(normal(eA, sd)); b = footballScore(normal(eB, sd)); }
    if (a === b) {
      ot++;
      if (sport === "nba") { while (a === b) { a += Math.max(0, Math.round(normal(eA * 5 / 48, 3))); b += Math.max(0, Math.round(normal(eB * 5 / 48, 3))); } }
      else {
        const pA = sport === "nhl" ? 0.5 + (pEdge - 0.5) * 0.5 : sport === "mlb" ? 0.5 + (pEdge - 0.5) * 0.6 : pEdge;
        const add = sport === "nfl" ? 3 : sport === "cfb" ? (rng() < 0.5 ? 7 : 8) : 1;
        if (rng() < pA) a += add; else b += add;
      }
    }
    sA[i] = a; sB[i] = b; if (a > b) wins++;
  }
  // player box scores on the first P runs
  const P = Math.min(N, 20000), stats = SIM_STATS[sport];
  const box = [];
  for (const [side, tm, arr, e] of [["A", A, sA, eA], ["B", B, sB, eB]]) {
    for (const pl of pickPlayers(sport, players[tm.id] || [])) {
      const st = stats.filter(([k]) => pl.sim[k] > 0);
      const draws = st.map(() => new Float32Array(P));
      for (let i = 0; i < P; i++) {
        const ratio = Math.max(0.15, arr[i] / e);
        st.forEach(([k, , el, kind], j) => {
          const mu = pl.sim[k] * Math.pow(ratio, el);
          draws[j][i] = kind === "p" ? poisson(mu) : kind === "y" ? Math.max(0, normal(mu, 0.45 * mu + 6)) : Math.max(0, normal(mu, 0.3 * mu + 2));
        });
      }
      box.push({ side, pl, st: st.map(([k, label], j) => {
        const s = Array.from(draws[j]).sort((x, y) => x - y);
        const mean = s.reduce((a, b) => a + b, 0) / P;
        return { k, label, mean, p10: s[Math.floor(P * 0.1)], p90: s[Math.floor(P * 0.9)] };
      }) });
    }
  }
  return { N, m, eA, eB, sA, sB, wins, ot, box };
};

function summarize(res) {
  const { N, sA, sB } = res;
  const med = a => { const s = Array.from(a).sort((x, y) => x - y); return s[s.length >> 1]; };
  const counts = new Map(); let best = "", bestN = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < N; i++) {
    sumA += sA[i]; sumB += sB[i];
    const k = sA[i] + "-" + sB[i], c = (counts.get(k) || 0) + 1; counts.set(k, c);
    if (c > bestN) { bestN = c; best = k; }
  }
  const margins = Array.from(sA, (a, i) => a - sB[i]);
  return { avgA: sumA / N, avgB: sumB / N, medA: med(sA), medB: med(sB), mode: best, modeN: bestN, margins };
}

function histogram(margins, sport, left, right) {
  const cap = { nba: 35, nfl: 35, cfb: 45, nhl: 6, mlb: 8 }[sport];
  const step = cap > 10 ? 2 : 1;
  const bins = new Map();
  for (const m of margins) { const v = Math.max(-cap, Math.min(cap, m)); const b = Math.round(v / step) * step; bins.set(b, (bins.get(b) || 0) + 1); }
  const keys = []; for (let k = -cap; k <= cap; k += step) keys.push(k);
  const max = Math.max(...keys.map(k => bins.get(k) || 0));
  return h("div", {}, h("div", { class: "hist" }, keys.map(k => h("i", { class: k < 0 ? "b" : "", title: `${k > 0 ? "+" : ""}${k}: ${fmt.pct((bins.get(k) || 0) / margins.length, 1)}`,
      style: { height: `${100 * (bins.get(k) || 0) / max}%` } }))),
    h("div", { class: "hist-axis" }, h("span", {}, `◀ ${left} by ${cap}+`), h("span", {}, "0"), h("span", {}, `${right} by ${cap}+ ▶`)));
}

Sim.view = async (sport, args) => {
  const d = await sportData(sport);
  const players = await load(`${sport}_players`).catch(() => ({}));
  const sorted = d.teams.slice().sort((a, b) => (a.rank || 999) - (b.rank || 999));
  let aId = args[0] || sorted[0].id, bId = args[1] || sorted[1].id;
  let venue = args[2] === "n" ? "neutral" : bId, N = 20000, line = "", total = "";
  // prefill the DraftKings spread/total when these two teams have an upcoming game with a posted line
  const bookFor = (a, b) => (d.schedule || []).find(g => g.state !== "post" && g.mkt &&
    ((g.home === a && g.away === b) || (g.home === b && g.away === a)));
  const prefill = () => {
    const g = bookFor(aId, bId);
    line = g && g.mkt.spread != null ? String(g.home === aId ? g.mkt.spread : -g.mkt.spread) : "";
    total = g && g.mkt.total != null ? String(g.mkt.total) : "";
    if (lineIn) { lineIn.value = line; totIn.value = total; bookTag.textContent = g ? `${g.mkt.book} line filled in` : ""; }
  };
  let lineIn, totIn, bookTag;
  prefill();
  const out = h("div", { style: { marginTop: "16px" } });
  const venueSel = h("select", { class: "in", onchange: e => { venue = e.target.value; } });
  const fillVenues = () => { venueSel.replaceChildren(h("option", { value: "neutral" }, "Neutral site"),
    ...d.teams.filter(t => t.venue).sort((x, y) => (x.venue || "").localeCompare(y.venue || "")).map(t =>
      h("option", { value: t.id, selected: t.id === venue }, `${t.venue}${t.city ? " - " + t.city : ""} (${t.abbr})`)));
    venueSel.value = venue; };
  fillVenues();
  const sel = (v, set) => teamSelect(d, v, x => { set(x); }, {});
  const go = () => {
    const A = team(d, aId), B = team(d, bId);
    if (aId === bId) { out.replaceChildren(h("div", { class: "card empty" }, "Pick two different teams.")); return; }
    out.replaceChildren(h("div", { class: "card empty" }, `Running ${N.toLocaleString()} simulations…`));
    setTimeout(() => {
      const t0 = performance.now();
      const homeId = venue === "neutral" ? null : venue;
      const res = Sim.run(sport, d, A, B, homeId, N, players);
      const s = summarize(res);
      render(A, B, homeId, res, s, performance.now() - t0);
      history.replaceState(null, "", `#/${sport}/sim/${aId}/${bId}${homeId === bId ? "" : homeId === aId ? "" : "/n"}`);
    }, 20);
  };
  const render = (A, B, homeId, res, s, ms) => {
    const pA = res.wins / res.N, pB = 1 - pA;
    const [ma, mb] = s.mode.split("-");
    const dec = sport === "nhl" || sport === "mlb" ? 2 : 1;
    const lineNum = parseFloat(line), totNum = parseFloat(total);
    const cover = !isNaN(lineNum) ? s.margins.filter(x => x + lineNum > 0).length / res.N : null;
    const push = !isNaN(lineNum) ? s.margins.filter(x => x + lineNum === 0).length / res.N : 0;
    const over = !isNaN(totNum) ? Array.from(res.sA, (a, i) => a + res.sB[i]).filter(x => x > totNum).length / res.N : null;
    const where = homeId === A.id ? `at ${A.venue}` : homeId === B.id ? `at ${B.venue}` : `neutral site${venue !== "neutral" ? "" : ""}`;
    const who = (t, p, big) => h("div", { class: "who" }, logo(t, "lg"), h("div", {}, t.name), h("div", { class: "big", style: { color: p >= 0.5 ? "var(--accent)" : "var(--muted)" } }, fmt.pct(p, 1)), h("div", { class: "muted small" }, `fair ${american(p)}`));
    const boxTbl = side => {
      const rows = res.box.filter(b => b.side === side);
      if (!rows.length) return h("div", { class: "empty" }, "No player stat lines available for this team yet.");
      const labels = [...new Set(rows.flatMap(r => r.st.map(x => x.label)))];
      return table([{ k: "name", label: "Player", sort: r => r.pl.name, asc: true, fmt: r => h("div", {}, h("b", {}, r.pl.name), h("span", { class: "muted small" }, ` ${r.pl.pos || ""}`)) },
        ...labels.map(lb => ({ k: lb, label: lb, num: true, sort: r => r.st.find(x => x.label === lb)?.mean ?? -1,
          fmt: r => { const x = r.st.find(x => x.label === lb); return x ? h("div", {}, h("b", {}, fmt.n(x.mean, x.mean >= 10 ? 0 : 1)), h("div", { class: "muted", style: { fontSize: "10.5px" } }, `${fmt.n(x.p10, 0)}–${fmt.n(x.p90, 0)}`)) : "–"; } }))],
        rows, {});
    };
    out.replaceChildren(
      h("div", { class: "card" },
        h("div", { class: "result-hero" }, who(A, pA), h("div", { class: "vs" }, "vs"), who(B, pB)),
        h("p", { class: "muted small", style: { textAlign: "center", margin: "10px 0 0" } }, `${res.N.toLocaleString()} sims ${where} · ${ms.toFixed(0)} ms · expected ${A.abbr} ${fmt.n(res.eA, dec)} - ${B.abbr} ${fmt.n(res.eB, dec)}`),
        h("div", { class: "kpis" },
          h("div", { class: "kpi" }, h("span", {}, "Most likely winner"), h("b", {}, pA >= 0.5 ? A.short || A.abbr : B.short || B.abbr)),
          h("div", { class: "kpi" }, h("span", {}, "Median score"), h("b", {}, `${s.medA} – ${s.medB}`)),
          h("div", { class: "kpi" }, h("span", {}, "Average score"), h("b", {}, `${fmt.n(s.avgA, 1)} – ${fmt.n(s.avgB, 1)}`)),
          h("div", { class: "kpi" }, h("span", {}, "Most common final"), h("b", {}, `${ma} – ${mb}`), h("span", { class: "muted", style: { textTransform: "none" } }, `${fmt.pct(s.modeN / res.N, 1)} of sims`)),
          h("div", { class: "kpi" }, h("span", {}, "Model line"), h("b", {}, `${res.m >= 0 ? A.abbr : B.abbr} ${sport === "nhl" || sport === "mlb" ? "+" + fmt.n(Math.abs(res.m), 2) : "-" + fmt.n(Math.abs(res.m), 1)}`)),
          h("div", { class: "kpi" }, h("span", {}, "Projected total"), h("b", {}, fmt.n(s.avgA + s.avgB, 1))),
          h("div", { class: "kpi" }, h("span", {}, sport === "mlb" ? "Extra innings" : sport === "nhl" ? "OT / shootout" : "Overtime"), h("b", {}, fmt.pct(res.ot / res.N, 1))),
          cover != null ? h("div", { class: "kpi" }, h("span", {}, `${A.abbr} ${lineNum > 0 ? "+" : ""}${lineNum} covers`), h("b", {}, fmt.pct(cover, 1)), push ? h("span", { class: "muted" }, `push ${fmt.pct(push, 1)}`) : null) : null,
          over != null ? h("div", { class: "kpi" }, h("span", {}, `Over ${totNum}`), h("b", {}, fmt.pct(over, 1))) : null),
        h("h3", { style: { marginTop: "18px" } }, `Margin distribution (${A.abbr} minus ${B.abbr})`),
        histogram(s.margins, sport, B.abbr, A.abbr)),
      h("div", { class: "grid g2", style: { marginTop: "16px" } },
        h("div", { class: "card tight" }, h("div", { class: "card-head" }, h("h2", { class: "team-cell" }, logo(A), `${A.short || A.name} projected box`), h("span", { class: "muted small" }, "avg (10th–90th pct)")), boxTbl("A")),
        h("div", { class: "card tight" }, h("div", { class: "card-head" }, h("h2", { class: "team-cell" }, logo(B), `${B.short || B.name} projected box`), h("span", { class: "muted small" }, "avg (10th–90th pct)")), boxTbl("B"))),
      h("div", { class: "note" }, "Player projections scale each player's season per-game averages by how his team's score landed in each simulation. They know nothing about injuries, matchups or minutes changes unless the roster data does."));
  };
  const swap = () => { [aId, bId] = [bId, aId]; Sim.view(sport, [aId, bId, venue === "neutral" ? "n" : undefined]); };
  mount(
    h("h1", {}, `${SPORTS[sport].full} Game Simulator`),
    h("p", { class: "lede" }, "Any two teams, any venue. Runs the matchup thousands of times off our power ratings and each team's scoring profile, then projects every key player's stat line."),
    h("div", { class: "card" },
      h("div", { class: "sim-setup" },
        h("div", { class: "field" }, h("label", {}, "Team A"), sel(aId, v => { if (venue === aId) { venue = v; fillVenues(); } aId = v; prefill(); })),
        h("div", { class: "vs" }, h("button", { class: "btn ghost sm", onclick: swap, title: "Swap" }, "⇄")),
        h("div", { class: "field" }, h("label", {}, "Team B"), sel(bId, v => { if (venue === bId) { venue = v; fillVenues(); } bId = v; prefill(); }))),
      h("div", { class: "grid g4", style: { marginTop: "12px", alignItems: "end" } },
        h("div", { class: "field" }, h("label", {}, "Venue"), venueSel),
        h("div", { class: "field" }, h("label", {}, "Simulations"), h("select", { class: "in", onchange: e => N = +e.target.value },
          [1000, 5000, 20000, 50000, 100000].map(n => h("option", { value: n, selected: n === N }, n.toLocaleString())))),
        h("div", { class: "field" }, h("label", {}, `Optional line for Team A`), h("div", { style: { display: "flex", gap: "6px" } },
          lineIn = h("input", { class: "in", placeholder: "Spread e.g. -3.5", value: line, oninput: e => line = e.target.value }),
          totIn = h("input", { class: "in", placeholder: "Total", value: total, oninput: e => total = e.target.value })),
          bookTag = h("div", { class: "small muted", style: { marginTop: "4px" } }, bookFor(aId, bId) ? `${bookFor(aId, bId).mkt.book} line filled in` : "")),
        h("div", { class: "field" }, h("button", { class: "btn", style: { width: "100%" }, onclick: go }, "Simulate ▶")))),
    out);
  go();
};
