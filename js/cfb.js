/* cfb.js — CFB-only views: disappointment index, recruiting, transfer portal, team extras. */
const CFB = {};

CFB.disappoint = async () => {
  const d = await sportData("cfb");
  const rows = d.disappoint.map(x => ({ ...x, t: team(d, x.id) }));
  const maxI = Math.max(...rows.map(r => Math.abs(r.index)));
  const line = r => h("div", { style: { display: "grid", gridTemplateColumns: "1fr auto", gap: "6px", padding: "8px 0", borderBottom: "1px solid var(--line)" } },
    h("div", {}, h("a", { class: "team-cell", href: `#/cfb/team/${r.id}` }, logo(r.t), r.t.short),
      h("div", { class: "small muted", style: { marginTop: "3px" } },
        `Talent #${r.talentRank} · Preseason #${r.preRank} → Now #${r.curRank} · ${r.actW}-${r.gp - r.actW} (expected ${fmt.n(r.expW)} W)`)),
    h("b", { class: r.index < 0 ? "neg" : "pos", style: { alignSelf: "center" } }, fmt.sgn(r.index, 2)));
  const cols = [
    { k: "t", label: "Team", sort: r => r.t.name, asc: true, fmt: r => teamLink("cfb", r.t) },
    { k: "conf", label: "Conf", sort: r => r.t.conf, asc: true, fmt: r => r.t.conf },
    { k: "talentRank", label: "Talent #", num: true, asc: true, title: "247 team talent composite rank (FBS)" },
    { k: "preRank", label: "Preseason #", num: true, asc: true },
    { k: "curRank", label: "Results #", num: true, asc: true, title: "Rank of the 2026-only rating (no prior)" },
    { k: "dRating", label: "Δ Rating", num: true, title: "Results-only rating minus preseason rating (pts)", fmt: r => h("span", { class: r.dRating < 0 ? "neg" : "pos" }, fmt.sgn(r.dRating)) },
    { k: "actW", label: "W", num: true },
    { k: "expW", label: "Exp W", num: true, title: "Wins expected from preseason ratings against the actual schedule played", fmt: r => fmt.n(r.expW) },
    { k: "dWins", label: "W vs Exp", num: true, fmt: r => h("span", { class: r.dWins < 0 ? "neg" : "pos" }, fmt.sgn(r.dWins)) },
    { k: "talentResid", label: "vs Talent", num: true, title: "Results-only rating minus what the roster's talent level predicts", fmt: r => h("span", { class: r.talentResid < 0 ? "neg" : "pos" }, fmt.sgn(r.talentResid)) },
    { k: "index", label: "Index", num: true, asc: true, fmt: r => h("span", { class: "mono" }, fmt.sgn(r.index, 2)) },
    { k: "bar", label: "", nosort: true, fmt: r => h("div", { class: "diverge" }, h("i", { style: {
        left: r.index >= 0 ? "50%" : `${50 - 50 * Math.abs(r.index) / maxI}%`, width: `${50 * Math.abs(r.index) / maxI}%`,
        background: r.index >= 0 ? "var(--good)" : "var(--bad)" } })) },
  ];
  let onlyP5 = false;
  const P5 = ["SEC", "Big Ten", "Big 12", "ACC", "Ind."];
  const tbl = table(cols, rows, { sort: "index", asc: true });
  const listBad = h("div"), listGood = h("div");
  const draw = () => {
    const rs = onlyP5 ? rows.filter(r => P5.includes(r.t.conf)) : rows;
    listBad.replaceChildren(...rs.slice(0, 12).map(line));
    listGood.replaceChildren(...rs.slice(-12).reverse().map(line));
    tbl.redraw(rs);
  };
  draw();
  mount(
    h("h1", {}, "Most Disappointing (and Most Surprising)"),
    h("p", { class: "lede" }, "Who is falling furthest short of what their talent and preseason power rating said they'd be - and who is blowing past it. ",
      "The index blends three gaps, each standardized: on-field rating vs preseason rating (40%), actual wins vs wins the preseason ratings expected against the schedule actually played (35%), and on-field rating vs what the roster's talent composite predicts (25%)."),
    h("div", { class: "toolbar" }, seg([["all", "All FBS"], ["p5", "Power conferences + ND"]], "all", v => { onlyP5 = v === "p5"; draw(); })),
    h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("h2", {}, "😬 Most disappointing"), listBad),
      h("div", { class: "card" }, h("h2", {}, "🚀 Biggest overachievers"), listGood)),
    h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "Full board"), tbl),
    h("div", { class: "note" }, `Through week ${d.asOfWeek}. "Results #" uses only 2026 games (no preseason prior), so it is the purest read of on-field play - and the noisiest early in the year.`));
};

CFB.recruiting = async () => {
  const [d, r] = await Promise.all([sportData("cfb"), load("cfb_recruiting")]);
  const years = Object.keys(Object.values(r.history)[0] || {}).sort();
  const histRows = Object.entries(r.history).map(([id, yrs]) => {
    const ranks = years.map(y => yrs[y]?.[0] ?? null);
    const valid = ranks.filter(x => x != null);
    return { id, t: team(d, id), ranks, avg: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
             trend: valid.length >= 2 ? valid[0] - valid[valid.length - 1] : null };
  }).filter(x => x.t.name !== "TBD/FCS");
  const histCols = [
    { k: "t", label: "Team", sort: x => x.t.name, asc: true, fmt: x => teamLink("cfb", x.t) },
    ...years.map((y, i) => ({ k: "y" + y, label: `${y} class`, num: true, asc: true, sort: x => x.ranks[i], fmt: x => x.ranks[i] ?? "–" })),
    { k: "avg", label: "Avg rank", num: true, asc: true, fmt: x => fmt.n(x.avg) },
    { k: "trend", label: "Trend", num: true, title: "Rank improvement from first to last class shown", fmt: x => x.trend == null ? "–" : h("span", { class: x.trend > 0 ? "pos" : x.trend < 0 ? "neg" : "" }, fmt.sgn(x.trend, 0)) },
    { k: "rank", label: "Power #", num: true, asc: true, sort: x => x.t.rank, fmt: x => x.t.rank ?? "–" },
  ];
  const parts = [h("h1", {}, "Recruiting"),
    h("p", { class: "lede" }, `The ${r.classYear} class board with landing-spot speculation for uncommitted prospects, plus five years of class rankings next to where each program's power rating sits today.`)];
  if (r.pending) {
    parts.push(h("div", { class: "note warn" }, `Individual ${r.classYear} recruits and the landing-spot speculation come from the CollegeFootballData API, whose monthly quota is used up. They fill in automatically on the next build after it resets (Nov 1). Class rankings below come from the local database.`));
  } else {
    const open = r.uncommitted.map(x => ({ ...x }));
    parts.push(h("div", { class: "grid g2" },
      h("div", { class: "card tight" }, h("h2", {}, `Top uncommitted - speculative landing spots`),
        table([
          { k: "rank", label: "#", num: true, asc: true },
          { k: "name", label: "Prospect", asc: true, fmt: x => h("div", {}, h("b", {}, x.name), h("div", { class: "small muted" }, `${x.pos} · ${x.city || ""}, ${x.state || ""}`)) },
          { k: "stars", label: "★", fmt: x => stars(x.stars) },
          { k: "landing", label: "Most likely", nosort: true, fmt: x => h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
              x.landing.slice(0, 3).map(l => { const t = team(d, l.id); return h("span", { class: "chip", title: t.name }, logo(t), ` ${t.abbr} ${fmt.pct(l.p)}`); })) },
        ], open, { sort: "rank", asc: true, maxH: "560px" })),
      h("div", { class: "card tight" }, h("h2", {}, `${r.classYear} team class rankings`),
        table([{ k: "rank", label: "#", num: true, asc: true }, { k: "team", label: "Team", fmt: x => x.id ? teamLink("cfb", team(d, x.id)) : x.team },
               { k: "points", label: "Points", num: true, fmt: x => fmt.n(x.points, 1) },
               { k: "n", label: "Commits", num: true, sort: x => r.commits.filter(c => c.team === x.id).length, fmt: x => r.commits.filter(c => c.team === x.id).length }],
              r.teamRanks.slice(0, 80), { sort: "rank", asc: true, maxH: "560px" }))));
    parts.push(h("div", { class: "note" }, r.method));
  }
  parts.push(h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "Class rankings, last five cycles"),
    table(histCols, histRows, { sort: "avg", asc: true, maxH: "640px" })));
  mount(...parts);
};

CFB.portal = async () => {
  const [d, p] = await Promise.all([sportData("cfb"), load("cfb_portal")]);
  let status = "all", pos = "", q = "";
  const entries = p.entries.map(e => ({ ...e, status: e.to ? "committed" : e.elig === "Withdrawn" ? "withdrawn" : "available" }));
  const ent = () => entries.filter(e => (status === "all" || e.status === status) && (!pos || e.pos === pos) &&
    (!q || e.name.toLowerCase().includes(q) || (e.from || "").toLowerCase().includes(q) || (e.to || "").toLowerCase().includes(q)));
  const eTbl = table([
    { k: "name", label: "Player", asc: true, fmt: e => h("b", {}, e.name) },
    { k: "pos", label: "Pos", asc: true },
    { k: "stars", label: "★", num: true, fmt: e => stars(e.stars) },
    { k: "rating", label: "Rating", num: true, fmt: e => e.rating ? fmt.n(e.rating, 3) : "–" },
    { k: "from", label: "From", asc: true, fmt: e => e.fromId ? teamLink("cfb", team(d, e.fromId), { short: true }) : e.from },
    { k: "to", label: "To / speculation", sort: e => e.to || "~", asc: true, fmt: e => e.to ? (e.toId ? teamLink("cfb", team(d, e.toId), { short: true }) : e.to)
        : e.spots ? h("div", { style: { display: "flex", gap: "5px" } }, h("span", { class: "chip warn" }, "?"), e.spots.slice(0, 3).map(s => { const t = team(d, s.id); return h("span", { class: "chip", title: t.name }, `${t.abbr} ${fmt.pct(s.p)}`); }))
        : h("span", { class: "muted" }, e.status) },
    { k: "date", label: "Entered", asc: false },
  ], ent(), { sort: "rating", maxH: "620px" });
  const teamRows = p.teams.map(a => ({ ...a, t: team(d, a.id) }));
  const tTbl = table([
    { k: "t", label: "Team", sort: a => a.t.name, asc: true, fmt: a => teamLink("cfb", a.t) },
    { k: "in", label: "In", num: true }, { k: "out", label: "Out", num: true },
    { k: "inStars", label: "★ in", num: true }, { k: "outStars", label: "★ out", num: true },
    { k: "net", label: "Net ★", num: true, fmt: a => h("b", { class: a.net >= 0 ? "pos" : "neg" }, fmt.sgn(a.net, 0)) },
    { k: "inAvg", label: "Avg in rating", num: true, fmt: a => a.inAvg ? fmt.n(a.inAvg, 3) : "–" },
    { k: "topIn", label: "Top additions", nosort: true, cls: "wrap", fmt: a => h("span", { class: "small muted" }, a.topIn.join(" · ")) },
  ], teamRows, { sort: "net", maxH: "520px" });
  const outlook = d.outlook.map(o => ({ ...o, t: team(d, o.id) }));
  const oTbl = table([
    { k: "t", label: "Team", sort: o => o.t.name, asc: true, fmt: o => teamLink("cfb", o.t) },
    { k: "activity", label: "Projected churn", num: true, fmt: o => h("div", { style: { display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" } },
        h("span", { class: "mono" }, fmt.n(o.activity, 2)), h("div", { class: "bar", style: { width: "70px" } }, h("i", { style: { width: `${Math.min(100, o.activity / outlook[0].activity * 100)}%` } }))) },
    { k: "seniors", label: "Seniors", num: true },
    { k: "needs", label: "Biggest holes (seniors / group size)", nosort: true, cls: "wrap", fmt: o => h("span", { class: "small" }, o.needs.map(n => `${n.g} ${n.sr}/${n.n}`).join(" · ")) },
    { k: "hotSeat", label: "Disappoint idx", num: true, asc: true, title: "From the disappointment board; a bad year raises coaching-change and exodus risk", fmt: o => h("span", { class: o.hotSeat < 0 ? "neg" : "pos" }, fmt.sgn(o.hotSeat, 2)) },
  ], outlook, { sort: "activity", maxH: "520px" });
  const posList = [...new Set(entries.map(e => e.pos).filter(Boolean))].sort();
  mount(
    h("h1", {}, "Transfer Portal"),
    h("p", { class: "lede" }, `${p.total.toLocaleString()} entries in the ${p.cycle} cycle. Team gains and losses, every entrant with destination speculation for the ones still available, and a ${p.cycle + 1} outlook built from each roster's departing seniors.`),
    h("div", { class: "grid g2" },
      h("div", { class: "card tight" }, h("h2", {}, `${p.cycle} portal: net gains by team`), tTbl),
      h("div", { class: "card tight" }, h("h2", {}, `${p.cycle + 1} portal outlook (speculative)`),
        h("p", { class: "muted small", style: { padding: "0 16px" } }, "Who will be most active this winter: departing seniors at high-leverage positions (QB weighted 3x, lines 1.4x) plus disappointment-board pressure."), oTbl)),
    h("div", { class: "card", style: { marginTop: "16px" } },
      h("div", { class: "card-head" }, h("h2", {}, "Entrants"),
        h("div", { class: "toolbar", style: { margin: 0 } },
          h("input", { placeholder: "Player or school…", oninput: e => { q = e.target.value.toLowerCase(); eTbl.redraw(ent()); } }),
          h("select", { onchange: e => { pos = e.target.value; eTbl.redraw(ent()); } }, h("option", { value: "" }, "All positions"), posList.map(x => h("option", { value: x }, x))),
          seg([["all", "All"], ["available", "Available"], ["committed", "Committed"], ["withdrawn", "Withdrawn"]], status, v => { status = v; eTbl.redraw(ent()); }))),
      eTbl),
    h("div", { class: "note" }, p.method + (p.liveNext ? "" : ` The ${p.cycle + 1} portal window has not opened yet; once entries appear in the data feed they show up here on the next build.`)));
};

CFB.teamExtras = async (d, id) => {
  const [p, r] = await Promise.all([load("cfb_portal").catch(() => null), load("cfb_recruiting").catch(() => null)]);
  const out = [];
  const dis = d.disappoint.find(x => x.id === id);
  if (dis) out.push(h("div", { class: "card" }, h("h2", {}, "Expectation check"),
    h("div", { class: "kpis", style: { marginTop: 0 } },
      h("div", { class: "kpi" }, h("span", {}, "Talent rank"), h("b", {}, `#${dis.talentRank}`)),
      h("div", { class: "kpi" }, h("span", {}, "Preseason rank"), h("b", {}, `#${dis.preRank}`)),
      h("div", { class: "kpi" }, h("span", {}, "Results rank"), h("b", {}, `#${dis.curRank}`)),
      h("div", { class: "kpi" }, h("span", {}, "Wins vs exp."), h("b", { class: dis.dWins < 0 ? "neg" : "pos" }, fmt.sgn(dis.dWins))),
      h("div", { class: "kpi" }, h("span", {}, "Disappoint idx"), h("b", { class: dis.index < 0 ? "neg" : "pos" }, fmt.sgn(dis.index, 2))))));
  if (p) {
    const a = p.teams.find(x => x.id === id);
    const ins = p.entries.filter(e => e.toId === id).slice(0, 10), outs = p.entries.filter(e => e.fromId === id).slice(0, 10);
    const li = (e, other) => h("div", { style: { display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "13px" } },
      h("span", {}, h("b", {}, e.name), ` ${e.pos} ${stars(e.stars)}`), h("span", { class: "muted small" }, other || "–"));
    out.push(h("div", { class: "card" }, h("h2", {}, `${p.cycle} portal`),
      a ? h("p", { class: "muted small" }, `${a.in} in (${a.inStars}★) · ${a.out} out (${a.outStars}★) · net ${fmt.sgn(a.net, 0)}★`) : null,
      h("div", { class: "grid g2" }, h("div", {}, h("h3", {}, "Incoming"), ins.length ? ins.map(e => li(e, e.from)) : h("div", { class: "muted small" }, "None")),
        h("div", {}, h("h3", {}, "Outgoing"), outs.length ? outs.map(e => li(e, e.to || e.status || (e.elig === "Withdrawn" ? "withdrew" : "unsigned"))) : h("div", { class: "muted small" }, "None")))));
  }
  const o = d.outlook.find(x => x.id === id);
  if (o) out.push(h("div", { class: "card" }, h("h2", {}, `${(p?.cycle || 2026) + 1} roster holes`),
    h("p", { class: "muted small" }, `${o.seniors} seniors on the roster of ${o.roster}.`),
    o.needs.map(n => h("div", { style: { display: "flex", alignItems: "center", gap: "10px", padding: "3px 0" } },
      h("b", { style: { width: "34px" } }, n.g), h("div", { class: "bar", style: { flex: 1 } }, h("i", { style: { width: `${100 * n.sr / Math.max(1, n.n)}%` } })),
      h("span", { class: "small muted" }, `${n.sr}/${n.n} seniors`)))));
  if (r && r.history[id]) {
    const yrs = Object.entries(r.history[id]).sort();
    out.push(h("div", { class: "card" }, h("h2", {}, "Recruiting classes"),
      h("div", { class: "kpis", style: { marginTop: 0 } }, yrs.map(([y, [rk, pts]]) => h("div", { class: "kpi" }, h("span", {}, y), h("b", {}, `#${rk}`))))));
  }
  return out;
};
