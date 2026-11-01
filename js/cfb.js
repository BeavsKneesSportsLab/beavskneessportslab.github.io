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
    hotSeatCard(d, await load("cfb_extras").catch(() => null)),
    h("div", { class: "note" }, `Through week ${d.asOfWeek}. "Results #" uses only 2026 games (no preseason prior), so it is the purest read of on-field play - and the noisiest early in the year.`));
};

CFB.recruiting = async () => {
  const [d, r] = await Promise.all([sportData("cfb"), load("cfb_recruiting")]);
  const years = [...new Set(Object.values(r.history).flatMap(y => Object.keys(y)))].sort();
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
    h("p", { class: "lede" }, `The ${r.classYear} class board, landing-spot speculation for uncommitted prospects, and every program's class rankings over the years next to where its power rating sits today. Classes are ranked by the 247Sports Composite: each class's score is a weighted sum of its commits' composite ratings, so elite prospects count far more than depth.`)];
  if (r.teamRanks?.length) {
    const rk = r.teamRanks.filter(x => x.id && d._byId[x.id]).map(x => ({ ...x, t: team(d, x.id) }));
    parts.push(h("div", { class: "card tight" },
      h("div", { class: "card-head" }, h("h2", {}, `${r.classYear} class rankings`), h("span", { class: "muted small" }, r.rankSource || "")),
      table([
        { k: "rank", label: "#", num: true, asc: true },
        { k: "t", label: "Team", sort: x => x.t.name, asc: true, fmt: x => teamLink("cfb", x.t) },
        { k: "points", label: "Points", num: true, title: "247 Composite team score: weighted sum of every commit's composite rating", fmt: x => fmt.n(x.points, 2) },
        { k: "commits", label: "Commits", num: true },
        { k: "five", label: "5★", num: true }, { k: "four", label: "4★", num: true }, { k: "three", label: "3★", num: true },
        { k: "avg", label: "Avg rating", num: true, title: "Average 247 Composite player rating (0-100)", fmt: x => fmt.n(x.avg, 2) },
        { k: "pw", label: "Power #", num: true, asc: true, sort: x => x.t.rank, fmt: x => x.t.rank ?? "–" },
      ], rk, { sort: "rank", asc: true, maxH: "560px" })));
  }
  if (r.pending) {
    parts.push(h("div", { class: "note warn" }, `Individual ${r.classYear} recruits and the landing-spot speculation come from the CollegeFootballData API, whose monthly quota is used up. They fill in automatically on the first build after it resets (Nov 1). The class rankings above are a dated snapshot of 247Sports' composite page.`));
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
      h("div", { class: "card tight" }, h("h2", {}, `Top ${r.classYear} commits`),
        table([
          { k: "rank", label: "#", num: true, asc: true },
          { k: "name", label: "Prospect", asc: true, fmt: x => h("div", {}, h("b", {}, x.name), h("div", { class: "small muted" }, `${x.pos} · ${x.city || ""}, ${x.state || ""}`)) },
          { k: "stars", label: "★", fmt: x => stars(x.stars) },
          { k: "team", label: "Committed to", sort: x => team(d, x.team).name, fmt: x => teamLink("cfb", team(d, x.team), { short: true }) },
        ], r.commits.slice(0, 150), { sort: "rank", asc: true, maxH: "560px" }))));
    parts.push(h("div", { class: "note" }, r.method));
  }
  parts.push(h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, `Class rankings, ${years[0]}-${years[years.length - 1]}`),
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

CFB.playoff = async () => {
  const [d, p] = await Promise.all([sportData("cfb"), load("cfb_playoff")]);
  const rows = p.teams.map(x => ({ ...x, t: team(d, x.id) }));
  const pct = (v, dp = 0) => v >= 0.995 && v < 1 ? ">99%" : v > 0 && v < 0.005 ? "<1%" : fmt.pct(v, dp);
  const bar = (v, max = 1) => h("div", { class: "bar", style: { width: "80px" } }, h("i", { style: { width: `${100 * v / max}%` } }));
  const seedCard = b => { const t = team(d, b.id), x = rows.find(r => r.id === b.id);
    return h("a", { class: "seed", href: `#/cfb/team/${t.id}` }, h("span", { class: "seed-n" }, b.seed), logo(t), h("span", { class: "seed-nm" }, t.short),
      b.auto ? h("span", { class: "chip", title: "Projected conference champion (auto-bid)" }, "AQ") : null, h("span", { class: "muted small" }, pct(x.cfp))); };
  const B = p.bracket;
  const bracket = h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Projected bracket"), h("span", { class: "muted small" }, "Seeds = average simulated seed among the projected field")),
    h("div", { class: "bracket" },
      h("div", { class: "br-col" }, h("h3", {}, "First-round byes"), B.slice(0, 4).map(seedCard)),
      h("div", { class: "br-col" }, h("h3", {}, "First round (higher seed hosts)"),
        [[4, 11], [5, 10], [6, 9], [7, 8]].map(([a, b]) => h("div", { class: "br-game" }, seedCard(B[a]), h("span", { class: "muted small", style: { padding: "0 8px" } }, "vs"), seedCard(B[b]))))));
  const titleTop = rows.slice().sort((a, b) => b.title - a.title).slice(0, 12), tmax = titleTop[0].title;
  const titleCard = h("div", { class: "card" }, h("h2", {}, "National title odds"),
    titleTop.map(x => h("div", { class: "mini-row" }, h("a", { class: "team-cell", href: `#/cfb/team/${x.id}` }, logo(x.t), x.t.short),
      h("span", { style: { display: "flex", alignItems: "center", gap: "8px" } }, bar(x.title, tmax), h("b", { style: { width: "48px", textAlign: "right" } }, pct(x.title, 1))))));
  const confs = [...new Set(rows.map(x => x.conf))].filter(c => c !== "Ind.").sort();
  const confCards = h("div", { class: "grid g4" }, confs.map(c => h("div", { class: "card" }, h("h3", {}, c),
    rows.filter(x => x.conf === c).sort((a, b) => b.conf_title - a.conf_title).slice(0, 4).map(x =>
      h("div", { class: "mini-row" }, h("a", { class: "team-cell", href: `#/cfb/team/${x.id}` }, logo(x.t), x.t.short),
        h("span", { class: "small" }, h("b", {}, pct(x.conf_title)), h("span", { class: "muted" }, ` · title game ${pct(x.ccg)}`)))))));
  const tbl = table([
    { k: "t", label: "Team", sort: x => x.t.name, asc: true, fmt: x => teamLink("cfb", x.t) },
    { k: "conf", label: "Conf", asc: true },
    { k: "rec", label: "Proj. record", sort: x => x.wins, fmt: x => `${fmt.n(x.wins)}-${fmt.n(x.losses)}` },
    { k: "bowl", label: "Bowl elig.", num: true, title: "6+ wins (incl. a conference title game)", fmt: x => pct(x.bowl) },
    { k: "ccg", label: "Title game", num: true, fmt: x => pct(x.ccg) },
    { k: "conf_title", label: "Win conf", num: true, fmt: x => pct(x.conf_title) },
    { k: "cfp", label: "Make CFP", num: true, fmt: x => h("b", {}, pct(x.cfp)) },
    { k: "bye", label: "Bye", num: true, fmt: x => pct(x.bye) },
    { k: "semi", label: "Semis", num: true, fmt: x => pct(x.semi) },
    { k: "final", label: "Final", num: true, fmt: x => pct(x.final) },
    { k: "title", label: "Title", num: true, fmt: x => h("b", { class: x.title > 0.05 ? "pos" : "" }, pct(x.title, 1)) },
  ], rows, { sort: "cfp", maxH: "640px" });
  let conf = "";
  const confSel = h("select", { class: "in", onchange: e => { conf = e.target.value; tbl.redraw(rows.filter(x => !conf || x.conf === conf)); } },
    h("option", { value: "" }, "All conferences"), [...confs, "Ind."].map(c => h("option", { value: c }, c)));
  mount(
    h("h1", {}, "College Football Playoff Odds"),
    h("p", { class: "lede" }, `${p.sims.toLocaleString()} simulations of the rest of the season, through week ${p.asOfWeek}: every remaining game, every conference title game, a 12-team field picked by a committee proxy, and the full playoff. Uses current ratings including injury / QB adjustments.`),
    h("div", { class: "grid", style: { gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)" }, id: "poGrid" }, bracket, titleCard),
    h("h2", { style: { marginTop: "18px" } }, "Conference races"), confCards,
    h("div", { class: "card tight", style: { marginTop: "16px" } }, h("div", { class: "card-head" }, h("h2", {}, "Every team"), confSel), tbl),
    h("div", { class: "note" }, "How it works: each simulated season gives every team a season-long rating shock (we don't know anyone's true strength exactly), plays every game with the model's win probabilities, stages conference title games for the top two in each league, ranks teams by a résumé score (rating minus ~6 pts per loss, plus a bonus for a conference title), takes the five best conference champions plus seven at-large teams, and plays the bracket. It's a model of the committee, not the committee."));
  if (matchMedia("(max-width: 900px)").matches) $("#poGrid").style.gridTemplateColumns = "1fr";
};

function hotSeatCard(d, x) {
  if (!x?.hotSeat?.length) return null;
  const rows = x.hotSeat.slice(0, 25).map(c => ({ ...c, t: team(d, c.id) }));
  const mx = rows[0].score;
  return h("div", { class: "card tight", style: { marginTop: "16px" } },
    h("div", { class: "card-head" }, h("h2", {}, "🔥 Coaching hot seat"), h("span", { class: "muted small" }, "Speculative - no buyout or AD-politics data")),
    table([
      { k: "t", label: "Team", sort: c => c.t.name, asc: true, fmt: c => teamLink("cfb", c.t) },
      { k: "coach", label: "Coach", asc: true, fmt: c => h("b", {}, c.coach) },
      { k: "years", label: "Year", num: true, title: "Season at this school (per ESPN)" },
      { k: "record", label: "Record", nosort: true },
      { k: "talentRank", label: "Talent #", num: true, asc: true },
      { k: "score", label: "Heat", num: true, fmt: c => h("div", { style: { display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" } },
          h("span", { class: "mono" }, fmt.n(c.score, 2)), h("div", { class: "bar", style: { width: "70px" } }, h("i", { style: { width: `${Math.max(0, 100 * c.score / mx)}%`, background: "var(--bad)" } }))) },
      { k: "why", label: "Why", nosort: true, cls: "wrap", fmt: c => h("span", { class: "small muted" }, c.why.join(" · ")) },
    ], rows, { sort: "score" }),
    h("p", { class: "muted small", style: { padding: "0 16px 12px" } }, "Heat = how far the team trails expectations (disappointment index, flipped) plus pressure for losing with elite talent or a losing record, scaled by tenure: year 1 is protected, years 2-5 are the prove-it window."));
}

CFB.heisman = async () => {
  const [d, x] = await Promise.all([sportData("cfb"), load("cfb_extras")]);
  const H = x.heisman;
  const rows = H.board.map(c => ({ ...c, t: team(d, c.team) }));
  const sl = H.sleepers.map(c => ({ ...c, t: team(d, c.team) }));
  const mx = Math.max(...rows.map(r => r.market));
  const who = c => h("div", { class: "team-cell" }, c.img ? h("img", { class: "headshot", src: c.img, alt: "", loading: "lazy" }) : h("span", { class: "headshot" }),
    h("div", {}, c.id ? h("a", { class: "plink", href: `#/cfb/player/${c.team}/${c.id}` }, h("b", {}, c.name)) : h("b", {}, c.name),
      h("div", { class: "muted small" }, `${c.pos || ""} · ${c.t.short}${c.t.rank ? ` (#${c.t.rank}, ${c.t.record})` : ""}`)));
  mount(
    h("h1", {}, "Heisman Tracker"),
    h("p", { class: "lede" }, "The race as the betting markets see it, with our model's take beside it. The model compares each player to others at his own position (so receivers can rank), then adds team success. It knows nothing about narrative or signature moments, which is exactly where Heismans get won."),
    h("div", { class: "grid g3" }, rows.slice(0, 3).map((c, i) => h("div", { class: "card heis" + (i === 0 ? " first" : "") },
      h("div", { class: "kicker" }, ["Front-runner", "2nd", "3rd"][i]),
      who(c),
      h("div", { class: "heis-odds" }, fmt.pct(c.market)), h("div", { class: "small muted" }, `market · our model ${fmt.pct(c.model)} (#${c.modelRank ?? "–"})`),
      h("div", { class: "small", style: { marginTop: "6px" } }, c.line)))),
    h("div", { class: "card tight", style: { marginTop: "16px" } },
      h("div", { class: "card-head" }, h("h2", {}, "The race"), h("span", { class: "muted small" }, "Market as of ", H.asOf, " · ", h("a", { class: "link", href: H.sourceUrl, target: "_blank", rel: "noopener" }, "source"))),
      table([
        { k: "who", label: "Player", sort: c => c.name, asc: true, fmt: who },
        { k: "line", label: "Season", nosort: true, cls: "wrap", fmt: c => h("span", { class: "small" }, c.line, c.out ? h("span", { class: "chip bad", style: { marginLeft: "6px" } }, "Out") : null) },
        { k: "market", label: "Market", num: true, fmt: c => h("div", { style: { display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end" } },
            h("div", { class: "bar", style: { width: "70px" } }, h("i", { style: { width: `${100 * c.market / mx}%` } })), h("b", {}, fmt.pct(c.market, 1))) },
        { k: "model", label: "Our model", num: true, title: "Our model's vote share", fmt: c => fmt.pct(c.model, 1) },
        { k: "modelRank", label: "Model #", num: true, asc: true },
      ], rows, { sort: "market" })),
    h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "🔍 Model sleepers"),
      h("p", { class: "muted small", style: { padding: "0 16px" } }, "Players our model rates highly whom the market isn't pricing. Usually that means team record or national attention is holding them back."),
      table([
        { k: "modelRank", label: "Model #", num: true, asc: true },
        { k: "who", label: "Player", nosort: true, fmt: who },
        { k: "line", label: "Season", nosort: true, cls: "wrap", fmt: c => h("span", { class: "small" }, c.line) },
        { k: "model", label: "Model share", num: true, fmt: c => fmt.pct(c.model, 1) },
      ], sl, { sort: "modelRank", asc: true })),
    h("div", { class: "note" }, H.source + ". Market numbers are refreshed weekly; between refreshes they can lag a big Saturday."));
};


/* ---------- the Beavs Knees Poll (Parker's top 25) ---------- */
function moveChip(r) {
  if (r.prev == null) return h("span", { class: "chip accent" }, "NEW");
  const d = r.prev - r.rank;
  return d === 0 ? h("span", { class: "muted small" }, "–") : h("b", { class: d > 0 ? "pos" : "neg" }, `${d > 0 ? "▲" : "▼"}${Math.abs(d)}`);
}
CFB.poll = async () => {
  const [d, p] = await Promise.all([sportData("cfb"), load("cfb_poll")]);
  let wi = p.weeks.length - 1;
  const body = h("div");
  const draw = () => {
    const w = p.weeks[wi], prevW = p.weeks[wi - 1];
    const rows = w.top25.map(r => ({ ...r, t: r.id ? team(d, r.id) : { name: r.entered, short: r.entered } }));
    const inNow = new Set(w.top25.map(r => r.id));
    const dropped = prevW ? prevW.top25.filter(r => r.id && !inNow.has(r.id)).map(r => team(d, r.id)) : [];
    const movers = rows.filter(r => r.prev != null).sort((a, b) => (b.prev - b.rank) - (a.prev - a.rank));
    const tbl = table([
      { k: "rank", label: "#", num: true, asc: true, fmt: r => h("b", { class: "poll-rank" }, r.rank) },
      { k: "t", label: "Team", nosort: true, fmt: r => r.id ? teamLink("cfb", r.t) : h("span", { class: "neg" }, r.entered) },
      { k: "rec", label: "Record", nosort: true, fmt: r => r.t.record || "–" },
      { k: "mv", label: wi ? "vs last week" : "", nosort: true, fmt: r => wi ? moveChip(r) : "" },
      { k: "model", label: "Our model #", num: true, title: "Where our power rating ranks this team", fmt: r => r.model ?? "–" },
      { k: "gap", label: "Poll vs model", num: true, nosort: true, title: "Positive = you rank them higher than the model does",
        fmt: r => r.model == null ? "–" : h("span", { class: r.model - r.rank > 5 ? "pos" : r.rank - r.model > 5 ? "neg" : "muted" }, fmt.sgn(r.model - r.rank, 0)) },
    ], rows, { sort: "rank", asc: true });
    body.replaceChildren(
      h("div", { class: "grid", style: { gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)" }, id: "pollGrid" },
        h("div", { class: "card tight" }, h("div", { class: "card-head" }, h("h2", {}, `Week ${w.week}`), h("span", { class: "muted small" }, "Ranked by Parker")), tbl),
        h("div", { class: "grid", style: { alignContent: "start" } },
          w.firstOut.length ? h("div", { class: "card" }, h("h2", {}, "First 4 out"),
            w.firstOut.map((r, i) => h("div", { class: "mini-row" }, h("span", { class: "team-cell" }, h("span", { class: "rank" }, 26 + i), r.id ? [logo(team(d, r.id)), h("a", { href: `#/cfb/team/${r.id}` }, team(d, r.id).short)] : r.entered),
              h("span", { class: "muted small" }, r.id ? team(d, r.id).record : "")))) : null,
          movers.length ? h("div", { class: "card" }, h("h2", {}, "Biggest moves"),
            [...movers.slice(0, 3), ...movers.slice(-3).reverse()].filter((r, i, a) => a.indexOf(r) === i && r.prev !== r.rank).map(r =>
              h("div", { class: "mini-row" }, h("span", { class: "team-cell" }, logo(r.t), r.t.short), h("span", {}, `#${r.prev} → #${r.rank} `, moveChip(r))))) : null,
          dropped.length ? h("div", { class: "card" }, h("h2", {}, "Dropped out"), h("p", { class: "muted" }, dropped.map(t => t.short).join(" · "))) : null,
          h("div", { class: "card" }, h("h2", {}, "You vs the model"), h("p", { class: "muted small" }, "Where your poll and our power rating disagree most this week."),
            rows.filter(r => r.model != null).sort((a, b) => Math.abs(b.model - b.rank) - Math.abs(a.model - a.rank)).slice(0, 5).map(r =>
              h("div", { class: "mini-row" }, h("span", { class: "team-cell" }, logo(r.t), r.t.short), h("span", { class: "small" }, `You #${r.rank} · model #${r.model}`)))))),
      history());
    if (matchMedia("(max-width: 900px)").matches) $("#pollGrid").style.gridTemplateColumns = "1fr";
  };
  const history = () => {
    const ids = [...new Set(p.weeks.flatMap(w => w.top25.map(r => r.id)).filter(Boolean))];
    const rows = ids.map(id => ({ id, t: team(d, id), ranks: p.weeks.map(w => w.top25.find(r => r.id === id)?.rank ?? null) }));
    const last = rows.map(r => r.ranks[r.ranks.length - 1]);
    return h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "Poll history"),
      table([
        { k: "t", label: "Team", sort: r => r.t.name, asc: true, fmt: r => teamLink("cfb", r.t) },
        ...p.weeks.map((w, i) => ({ k: "w" + w.week, label: `Wk ${w.week}`, num: true, asc: true, sort: r => r.ranks[i] ?? 99, fmt: r => r.ranks[i] ?? h("span", { class: "muted" }, "–") })),
        { k: "weeks", label: "Weeks ranked", num: true, sort: r => r.ranks.filter(x => x != null).length, fmt: r => r.ranks.filter(x => x != null).length },
      ], rows, { sort: "w" + p.weeks[p.weeks.length - 1].week, asc: true, maxH: "560px" }));
  };
  mount(
    h("div", { class: "card-head" }, h("div", {}, h("h1", {}, "🦫 The Beavs Knees Poll"),
      h("p", { class: "lede", style: { margin: 0 } }, "Our own weekly top 25, voted by a committee of one. Compared against what our power model thinks.")),
      h("div", {}, seg(p.weeks.map((w, i) => [i, `Wk ${w.week}`]), wi, v => { wi = v; draw(); }))),
    p.issues?.length ? h("div", { class: "note warn" }, "Poll data notes: ", p.issues.join(" · ")) : null,
    body);
  draw();
};
