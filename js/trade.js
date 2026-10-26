/* trade.js — trade simulator: build a two-team trade, check league rules, and estimate whether each front office accepts.

Player value (from the build): 'now' = production converted to a market salary on the league's own pay curve
(0-100 scale), 'fut' = the same adjusted for age vs the sport's peak, 'sur' = contract surplus over the years left.
Each team weighs now vs future by its situation (power rank: contender / middle / rebuilder), consolidates
packages with a power mean (two quarters are worth less than a dollar), pays for roster spots, and protects
its starting QB / goalie. P(accept) is a logistic on the percentage value gained. */
const Trade = {};

const MODE_W = { contend: [0.75, 0.25], middle: [0.55, 0.45], rebuild: [0.3, 0.7] };
const POWER_K = { nba: 1.6, nfl: 1.3, nhl: 1.4, mlb: 1.25 };
const KEY_POS = { nfl: ["QB"], nhl: ["G"] };
const PICK_YEARS = [2027, 2028, 2029];

function teamMode(d, t) {
  const n = d.teams.length;
  return t.rank <= n / 3 ? "contend" : t.rank > (2 * n) / 3 ? "rebuild" : "middle";
}
function assetValue(sport, d, a, recv, retained) {
  const mode = teamMode(d, recv);
  const [wn, wf] = MODE_W[mode];
  if (a.pick) {
    const base = d.rules.pick_vals[a.round] || 1;
    return base * { rebuild: 1.3, middle: 1.0, contend: 0.75 }[mode] * Math.pow(0.9, a.year - PICK_YEARS[0]);
  }
  const tv = a.tv || { now: 3, fut: 3, sur: 0 };
  let sur = tv.sur;
  if (retained) sur += (a.salary * 0.5) / d.rules.max_sal * 100 * Math.min(a.yrs || 1, 4) * 0.3;
  return wn * tv.now + wf * tv.fut + 0.5 * Math.max(-30, sur);
}
function packageValue(sport, vals) {
  const k = POWER_K[sport] || 1.3;
  const pos = vals.filter(v => v > 0), neg = vals.filter(v => v < 0);
  return Math.pow(pos.reduce((s, v) => s + Math.pow(v, k), 0), 1 / k) + neg.reduce((s, v) => s + v, 0);
}

function evaluate(sport, d, P, st) {
  const [aId, bId] = st.teams;
  const res = {};
  for (const [me, them] of [[aId, bId], [bId, aId]]) {
    const T = team(d, me);
    const out = st.assets[me], inc = st.assets[them];
    const vIn = packageValue(sport, inc.map(a => assetValue(sport, d, a, T, st.retain[them])));
    const vOut = packageValue(sport, out.map(a => assetValue(sport, d, a, T, false)));
    let penalty = 0;
    const notes = [];
    const pIn = inc.filter(a => !a.pick).length, pOut = out.filter(a => !a.pick).length;
    if (pIn > pOut) penalty += (pIn - pOut) * (sport === "nba" ? 2 : 0.6);
    for (const pos of KEY_POS[sport] || []) {
      const ros = (P[me] || []).filter(p => p.pos === pos).sort((x, y) => y.tv.now - x.tv.now);
      const starter = ros[0];
      if (starter && out.some(a => a.id === starter.id)) {
        const repl = inc.filter(a => a.pos === pos).sort((x, y) => y.tv.now - x.tv.now)[0];
        if (!repl || repl.tv.now < starter.tv.now * 0.8) {
          const pen = assetValue(sport, d, starter, T) * (teamMode(d, T) === "rebuild" ? 0.15 : 0.35);
          penalty += pen; notes.push(`Losing its starting ${pos} with no replacement (−${pen.toFixed(0)})`);
        }
      }
    }
    const gain = vIn - vOut - penalty;
    const pct = gain / Math.max(vOut, 8);
    const p = 1 / (1 + Math.exp(-(pct - 0.04) / 0.06));
    res[me] = { vIn, vOut, penalty, gain, pct, p, mode: teamMode(d, T), notes };
  }
  return res;
}

function rulesCheck(sport, d, P, st) {
  const r = d.rules, checks = [];
  const salOf = (a, retained) => a.pick ? 0 : (a.salary || 0) * (retained ? 0.5 : 1);
  const today = new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.deadline)) {
    checks.push(today <= r.deadline ? ["ok", `Before the trade deadline (~${r.deadline})`] : ["fail", `Past the trade deadline (~${r.deadline}) - would have to wait for the offseason`]);
  } else checks.push(["ok", `Trade window: ${r.deadline}`]);
  for (const [me, them] of [st.teams, st.teams.slice().reverse()]) {
    const T = team(d, me);
    const outSal = st.assets[me].reduce((s, a) => s + salOf(a, st.retain[me]), 0);
    const inSal = st.assets[them].reduce((s, a) => s + salOf(a, st.retain[them]), 0);
    // retaining keeps half of the outgoing salary on this team's books
    const after = T.payroll - outSal + inSal;
    const nOut = st.assets[me].filter(a => !a.pick).length, nIn = st.assets[them].filter(a => !a.pick).length;
    const rosterAfter = (P[me] || []).length - nOut + nIn;
    const tag = T.abbr;
    if (sport === "nba") {
      if (after <= r.cap) checks.push(["ok", `${tag} stays under the cap after the deal (${fmt.money(after)})`]);
      else {
        let allowed, rule;
        if (after > r.apron2) {
          allowed = outSal; rule = "second-apron team: no taking back more salary";
          if (nOut > 1) checks.push(["fail", `${tag} is over the 2nd apron (${fmt.money(r.apron2)}) - can't aggregate player salaries`]);
        } else if (after > r.apron1) { allowed = outSal * 1.1; rule = "first-apron team: 110% of outgoing"; }
        else if (outSal <= 7.5e6) { allowed = 2 * outSal + 250e3; rule = "200% + $250K"; }
        else if (outSal <= 29e6) { allowed = outSal + 7.5e6; rule = "outgoing + $7.5M"; }
        else { allowed = 1.25 * outSal + 250e3; rule = "125% + $250K"; }
        checks.push(inSal <= allowed ? ["ok", `${tag} salary match OK: takes ${fmt.money(inSal)} for ${fmt.money(outSal)} (${rule})`]
                                    : ["fail", `${tag} salary match fails: takes ${fmt.money(inSal)} but may only take ${fmt.money(allowed)} (${rule})`]);
      }
      const standard = (P[me] || []).filter(p => p.salary >= r.min_sal * 0.9).length - nOut + nIn;
      if (standard > r.roster_max && nIn > nOut) checks.push(["warn", `${tag} would carry ${standard} standard contracts (max ${r.roster_max}) - must waive someone`]);
    } else if (sport === "nfl") {
      const net = inSal - outSal;
      checks.push(net > 10e6 ? ["warn", `${tag} adds ${fmt.money(net)} in salary - needs that much cap room (ESPN payroll includes IR/practice squad, so space isn't verified)`]
                             : ["ok", `${tag} net salary change ${net >= 0 ? "+" : ""}${fmt.money(net)}`]);
    } else if (sport === "nhl") {
      checks.push(after <= r.cap ? ["ok", `${tag} under the ${fmt.money(r.cap)} cap after the deal (${fmt.money(after)}, est.)`]
                                 : ["warn", `${tag} would be over the ${fmt.money(r.cap)} cap (${fmt.money(after)} est.) - needs LTIR room or retention`]);
    } else if (sport === "mlb") {
      if (after > r.cap) checks.push(["warn", `${tag} payroll ${fmt.money(after)} (est.) is over the ${fmt.money(r.cap)} luxury-tax line`]);
      if (rosterAfter > 40) checks.push(["warn", `${tag} 40-man roster would hit ${rosterAfter} - must DFA someone`]);
    }
    for (const a of st.assets[me]) if (a.ntc) checks.push(["warn", `${a.name} has a trade restriction (recently signed / no-trade clause) - needs consent or must wait`]);
    if (sport === "nba") {
      const firsts = st.assets[me].filter(a => a.pick && a.round === "1st").map(a => a.year).sort();
      if (firsts.some((y, i) => firsts[i + 1] === y + 1)) checks.push(["warn", `${tag} trades 1sts in back-to-back years - Stepien rule (needs protections)`]);
    }
  }
  if (!st.assets[st.teams[0]].length || !st.assets[st.teams[1]].length) checks.push(["fail", "Both sides need to send something"]);
  return checks;
}

function verdictLabel(p) {
  return p >= 0.8 ? ["Accepts", "good"] : p >= 0.55 ? ["Leaning yes", "good"] : p >= 0.3 ? ["Needs a sweetener", "warn"] : p >= 0.1 ? ["Unlikely", "bad"] : ["Hangs up", "bad"];
}

Trade.view = async (sport, args) => {
  const d = await sportData(sport);
  const P = await load(`${sport}_players`);
  const byRank = d.teams.slice().sort((a, b) => a.rank - b.rank);
  const aId = args[0] || byRank[byRank.length - 1].id;
  const bId = args[1] && args[1] !== aId && d._byId[args[1]] ? args[1] : (byRank[0].id === aId ? byRank[1].id : byRank[0].id);
  const st = { teams: [aId, bId], assets: { [aId]: [], [bId]: [] }, retain: { [aId]: false, [bId]: false } };
  if (args[1] && !d._byId[args[1]]) {                      // #/sport/trade/team/playerId
    const pl = (P[aId] || []).find(p => p.id === args[1]);
    if (pl) st.assets[aId].push(pl);
  }
  const cols = [h("div"), h("div")];
  const verdict = h("div");

  const drawSide = i => {
    const me = st.teams[i], T = team(d, me);
    const ros = (P[me] || []).slice().sort((x, y) => y.tv.now - x.tv.now);
    const sel = new Set(st.assets[me].filter(a => !a.pick).map(a => a.id));
    let q = "";
    const list = h("div", { class: "roster-pick" });
    const drawList = () => list.replaceChildren(...ros.filter(p => !q || p.name.toLowerCase().includes(q) || p.pos.toLowerCase() === q).map(p =>
      h("div", { class: "row" + (sel.has(p.id) ? " sel" : ""), onclick: () => {
          if (sel.has(p.id)) st.assets[me] = st.assets[me].filter(a => a.id !== p.id); else st.assets[me].push(p);
          drawSide(i); update(); } },
        h("input", { type: "checkbox", checked: sel.has(p.id), tabindex: -1 }),
        h("div", { style: { minWidth: 0 } }, h("div", { class: "pname" }, p.name, p.inj ? h("span", { class: "chip bad", style: { marginLeft: "5px" } }, p.inj) : null, p.ntc ? h("span", { class: "chip warn", style: { marginLeft: "5px" } }, "NTC") : null),
          h("div", { class: "pmeta" }, [p.pos, p.age ? `age ${p.age}` : null, p.line].filter(Boolean).join(" · "))),
        h("div", { style: { textAlign: "right" } }, h("div", { class: "mono" }, fmt.n(p.tv.now, 0)),
          h("div", { class: "pmeta" }, `${fmt.money(p.salary)}${p.salEst ? "*" : ""} · ${p.yrs ?? "?"}y`)))));
    drawList();
    const roundSel = h("select", { class: "in" }, Object.keys(d.rules.pick_vals).map(r => h("option", { value: r }, r)));
    const yearSel = h("select", { class: "in" }, PICK_YEARS.map(y => h("option", { value: y }, y)));
    cols[i].replaceChildren(h("div", { class: "card" },
      h("div", { class: "card-head" }, h("div", { class: "team-cell", style: { gap: "10px" } }, logo(T, "md"),
          teamSelect(d, me, v => { if (v === st.teams[1 - i]) return; st.assets[v] = []; st.retain[v] = false; delete st.assets[me]; st.teams[i] = v; drawSide(i); update(); })),
        h("span", { class: "chip" }, `#${T.rank} · ${teamMode(d, T)}`)),
      h("div", { class: "small muted" }, `Payroll ${fmt.money(T.payroll)}${d.rules.salaryEstimated ? " (est.)" : ""} · ${fmt.rec(T)}`),
      h("h3", { style: { marginTop: "12px" } }, `${T.abbr} sends`),
      h("div", { class: "pkg" }, st.assets[me].length ? st.assets[me].map(a => h("span", { class: "asset" },
        a.pick ? `${a.year} ${a.round}` : h("span", {}, h("b", {}, a.name), ` ${a.pos} · ${fmt.money(a.salary)}`),
        h("button", { onclick: () => { st.assets[me] = st.assets[me].filter(x => x !== a); drawSide(i); update(); }, title: "Remove" }, "✕")))
        : h("span", { class: "muted small" }, "Click players below or add a pick")),
      h("div", { class: "toolbar" },
        h("input", { placeholder: "Filter roster / position…", oninput: e => { q = e.target.value.toLowerCase(); drawList(); }, style: { flex: 1 } }),
        roundSel, yearSel, h("button", { class: "btn ghost sm", onclick: () => {
          const a = { pick: true, id: `pk-${me}-${yearSel.value}-${roundSel.value}-${Math.random()}`, year: +yearSel.value, round: roundSel.value, name: `${yearSel.value} ${roundSel.value}` };
          st.assets[me].push(a); drawSide(i); update(); } }, "+ Pick"),
        sport === "nhl" ? h("label", { class: "small", style: { display: "flex", gap: "5px", alignItems: "center" } },
          h("input", { type: "checkbox", checked: st.retain[me], onchange: e => { st.retain[me] = e.target.checked; update(); } }), "Retain 50%") : null),
      list,
      h("div", { class: "pmeta", style: { marginTop: "6px" } }, "Right column: trade value (0-100) · salary · years left", d.rules.salaryEstimated ? " · * salary estimated from production (no public salary feed)" : "")));
  };

  const update = () => {
    const [aId, bId] = st.teams, A = team(d, aId), B = team(d, bId);
    if (!st.assets[aId].length && !st.assets[bId].length) {
      verdict.replaceChildren(h("div", { class: "card empty" }, "Add players or picks to both sides to evaluate the trade."));
      return;
    }
    const ev = evaluate(sport, d, P, st), checks = rulesCheck(sport, d, P, st);
    const legal = !checks.some(c => c[0] === "fail");
    const overall = legal ? ev[aId].p * ev[bId].p : 0;
    const card = (T, e) => { const [lab, cls] = verdictLabel(e.p); return h("div", { class: "verdict" },
      h("div", { class: "head" }, logo(T, "md"), h("div", {}, h("b", {}, T.name), h("div", { class: "small muted" }, `${e.mode} - values ${e.mode === "rebuild" ? "youth & picks" : e.mode === "contend" ? "win-now production" : "a balance"}`)),
        h("div", { class: "pct " + (cls === "good" ? "pos" : cls === "bad" ? "neg" : "") }, fmt.pct(e.p))),
      h("span", { class: `chip ${cls}` }, lab),
      h("div", { class: "small", style: { marginTop: "8px" } }, `Gets ${fmt.n(e.vIn, 0)} · gives ${fmt.n(e.vOut, 0)}${e.penalty ? ` · costs ${fmt.n(e.penalty, 0)}` : ""} → `, h("b", { class: e.gain >= 0 ? "pos" : "neg" }, `${fmt.sgn(e.gain, 0)} (${fmt.sgn(100 * e.pct, 0)}%)`)),
      e.notes.map(n => h("div", { class: "small neg" }, n))); };
    // what would make it work: cheapest single addition from the other side that gets the reluctant team to 60%
    const sugg = [];
    for (const [reluct, giver] of [[aId, bId], [bId, aId]]) {
      if (ev[reluct].p >= 0.55) continue;
      const have = new Set(st.assets[giver].map(a => a.id));
      const cands = (P[giver] || []).filter(p => !have.has(p.id)).slice()
        .concat(Object.keys(d.rules.pick_vals).flatMap(rd => PICK_YEARS.slice(0, 2).map(y => ({ pick: true, id: `pk-${giver}-${y}-${rd}`, year: y, round: rd, name: `${y} ${rd}` }))));
      const scored = [];
      for (const c of cands) {
        st.assets[giver].push(c);
        const e2 = evaluate(sport, d, P, st);
        st.assets[giver].pop();
        if (e2[reluct].p >= 0.6) scored.push({ c, pR: e2[reluct].p, pG: e2[giver].p, cost: assetValue(sport, d, c, team(d, giver)) });
      }
      scored.sort((x, y) => x.cost - y.cost);
      for (const s of scored.slice(0, 3)) sugg.push({ giver, reluct, ...s });
    }
    verdict.replaceChildren(h("div", { class: "card" },
      h("div", { class: "card-head" }, h("h2", {}, "Verdict"),
        h("div", { style: { textAlign: "right" } }, h("div", { class: "small muted" }, "Chance this trade happens"), h("div", { style: { fontSize: "28px", fontWeight: 800 } }, fmt.pct(overall)))),
      h("div", { class: "grid g2" }, card(A, ev[aId]), card(B, ev[bId])),
      h("h3", { style: { marginTop: "16px" } }, "League rules"),
      h("ul", { class: "checks" }, checks.map(([s, t]) => h("li", { class: s === "ok" ? "" : s }, t))),
      sugg.length ? [h("h3", { style: { marginTop: "16px" } }, "What would make it work"),
        sugg.map(s => { const G = team(d, s.giver), R = team(d, s.reluct); return h("div", { style: { display: "flex", gap: "10px", alignItems: "center", padding: "5px 0", flexWrap: "wrap" } },
          h("button", { class: "btn sm ghost", onclick: () => { st.assets[s.giver].push(s.c); drawSide(st.teams.indexOf(s.giver)); update(); } }, "Add"),
          h("span", {}, `${G.abbr} adds `, h("b", {}, s.c.name), s.c.pos ? ` (${s.c.pos})` : "", ` → ${R.abbr} ${fmt.pct(s.pR)}, ${G.abbr} ${fmt.pct(s.pG)}`)); })] : null));
  };

  mount(
    h("h1", {}, `${SPORTS[sport].full} Trade Simulator`),
    h("p", { class: "lede" }, "Build a trade, check it against the league's salary and roster rules, and see whether each front office would actually take it. Each team values players by its situation: contenders pay for production now, rebuilders for youth, picks and cheap contracts."),
    h("div", { class: "trade-cols" }, cols),
    h("div", { style: { marginTop: "16px" } }, verdict),
    h("div", { class: "note" }, `Rules use ${d.rules.cap_label} figures (${fmt.money(d.rules.cap)}). This is a model of how teams value assets, not inside information - no-trade clauses, injuries and front-office quirks can override it.`));
  drawSide(0); drawSide(1); update();
};
