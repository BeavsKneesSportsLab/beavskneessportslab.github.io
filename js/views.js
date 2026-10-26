/* views.js — views shared by every sport: ratings, predictions, standings, rumors, teams, team page, home. */
const Views = {};

Views.ratings = async (sport) => {
  const d = await sportData(sport);
  const isCfb = sport === "cfb";
  let conf = "", q = "";
  const rows = () => d.teams.filter(t => t.rating != null)
    .filter(t => !conf || t.conf === conf || t.group === conf)
    .filter(t => !q || t.name.toLowerCase().includes(q));
  const maxR = Math.max(...d.teams.map(t => Math.abs(t.rating || 0)));
  const cols = [
    { k: "rank", label: "#", num: true, asc: true, fmt: t => h("span", { class: "rank" }, t.rank ?? "–") },
    { k: "name", label: "Team", asc: true, fmt: t => teamLink(sport, t) },
    isCfb ? { k: "conf", label: "Conf", asc: true } : null,
    { k: "w", label: "Record", sort: t => isCfb ? parseInt(t.record) : t.w / Math.max(1, t.gp), fmt: t => isCfb ? t.record || "–" : fmt.rec(t) },
    { k: "rating", label: `Rating (${d.unit})`, num: true, title: "Neutral-site margin vs an average team",
      fmt: t => h("span", { class: "mono" }, fmt.sgn(t.rating, sport === "nhl" || sport === "mlb" ? 2 : 1)) },
    { k: "bar", label: "", nosort: true, fmt: t => h("div", { class: "diverge" }, h("i", { style: {
        left: t.rating >= 0 ? "50%" : `${50 - 50 * Math.abs(t.rating) / maxR}%`,
        width: `${50 * Math.abs(t.rating) / maxR}%`, background: t.rating >= 0 ? "var(--good)" : "var(--bad)" } })) },
    isCfb ? { k: "resultsOnly", label: "Results-only", num: true, title: "Fit on 2026 games alone - no preseason prior",
              fmt: t => t.resultsOnly == null ? "–" : `${fmt.sgn(t.resultsOnly)} (#${t.resultsRank})` } : null,
    isCfb ? { k: "preseason", label: "Preseason", num: true, fmt: t => fmt.sgn(t.preseason) } : null,
    isCfb ? { k: "projW", label: "Proj. W", num: true, title: "Wins so far + model win probability of every remaining game",
              fmt: t => fmt.n(t.projW) } : null,
    !isCfb ? { k: "off", label: "Off", num: true, title: `Scoring vs league avg (${d.unit}/g, shrunk)`, fmt: t => fmt.sgn(t.off, 2) } : null,
    !isCfb ? { k: "dfn", label: "Def", num: true, title: "Allowed vs league avg (negative = better)", asc: true, fmt: t => fmt.sgn(t.dfn, 2) } : null,
    !isCfb ? { k: "last10", label: "Last 10", nosort: true, fmt: t => h("span", { class: "mono" }, t.last10 || "") } : null,
  ].filter(Boolean);
  const tbl = table(cols, rows(), { sort: "rank", asc: true });
  const confs = [...new Set(d.teams.map(t => t.conf).filter(Boolean))].sort();
  mount(
    h("h1", {}, `${SPORTS[sport].full} Power Ratings`),
    h("p", { class: "lede" }, d.method + (isCfb ? ` · Through week ${d.asOfWeek}.` : "") +
      ` Rating = expected margin vs an average team on a neutral field; home edge ${fmt.n(d.hfa, 2)} ${d.unit}.`),
    h("div", { class: "toolbar" },
      h("input", { placeholder: "Search team…", oninput: e => { q = e.target.value.toLowerCase(); tbl.redraw(rows()); } }),
      isCfb ? h("select", { onchange: e => { conf = e.target.value; tbl.redraw(rows()); } },
                h("option", { value: "" }, "All conferences"), confs.map(c => h("option", { value: c }, c))) : null),
    h("div", { class: "card tight" }, tbl),
    isCfb ? h("div", { class: "note" }, "Reference model, not a betting signal: in honest backtests it has never beaten a closing spread (test RMSE 15.80 vs market 15.37).") : null,
  );
};

function gameCard(sport, d, g) {
  const H = team(d, g.home), A = team(d, g.away);
  const pH = g.pHome, pA = 1 - pH;
  const row = (t, p, proj, fav) => h("div", { class: "game-row" + (fav ? " fav" : "") },
    h("a", { class: "nm", href: `#/${sport}/team/${t.id}` }, logo(t), h("span", {}, (t.rank && sport === "cfb" && t.rank <= 25 ? `${t.rank} ` : "") + (t.short || t.name))),
    h("span", { class: "proj" }, proj != null ? fmt.n(proj, sport === "nhl" || sport === "mlb" ? 1 : 0) : ""),
    h("span", { class: "pct" }, fmt.pct(p)));
  const projH = g.projHome, projA = g.projAway;
  const done = g.state === "post";
  return h("div", { class: "game" },
    h("div", { class: "game-meta" }, h("span", {}, `${fmt.date(g.date)} · ${fmt.time(g.date)}`),
      h("span", {}, g.neutral ? "Neutral" : "", g.tv ? ` ${g.tv}` : "")),
    row(A, pA, projA, pA > pH), row(H, pH, projH, pH >= pA),
    h("div", { class: "wp" }, h("i", { style: { width: `${pA * 100}%`, background: A.color } }),
      h("i", { style: { width: `${pH * 100}%`, background: H.color } })),
    h("div", { class: "game-foot" }, h("span", {}, "Model: ", h("b", {}, spreadText(sport, d, g))),
      h("span", {}, done ? `Final ${g.as}-${g.hs}` : `Fair ML ${american(pA)} / ${american(pH)}`),
      h("a", { class: "link", href: `#/${sport}/sim/${g.away}/${g.home}${g.neutral ? "/n" : ""}` }, "Simulate →")));
}

Views.predictions = async (sport) => {
  const d = await sportData(sport);
  let preds = d.predictions.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (sport === "cfb") {
    preds = preds.map(g => ({ ...g, projHome: (d.leagueAvg * 2) / 2 + g.margin / 2, projAway: d.leagueAvg - g.margin / 2 }));
  }
  let filter = "all";
  const box = h("div", { class: "games" });
  const draw = () => {
    let ps = preds;
    if (filter === "top" && sport === "cfb") ps = ps.filter(g => (team(d, g.home).rank || 99) <= 25 || (team(d, g.away).rank || 99) <= 25);
    if (filter === "close") ps = ps.filter(g => Math.abs(g.pHome - 0.5) < 0.12);
    box.replaceChildren(...(ps.length ? ps.map(g => gameCard(sport, d, g)) : [h("div", { class: "empty" }, "No upcoming games in the window.")]));
  };
  draw();
  mount(
    h("h1", {}, `${SPORTS[sport].full} Predictions`),
    h("p", { class: "lede" }, sport === "cfb" ? `Week ${d.upcomingWeek} - model spread and win probability for every FBS game.` :
      "Next few days of games - model margin, win probability (normal, σ=" + d.sigma + " " + d.unit + "), and projected score from team scoring rates."),
    h("div", { class: "toolbar" }, seg([["all", "All games"], ...(sport === "cfb" ? [["top", "Top-25 involved"]] : []), ["close", "Coin flips"]],
      filter, v => { filter = v; draw(); })),
    box,
    h("div", { class: "note" }, "Fair ML is the model's no-vig price, not a book line. Compare it against a real sportsbook number before reading anything into it."),
  );
};

Views.standings = async (sport) => {
  const d = await sportData(sport);
  const rows = d.teams.slice();
  const cols = [
    { k: "name", label: "Team", asc: true, fmt: t => teamLink(sport, t) },
    { k: "w", label: "W", num: true }, { k: "l", label: "L", num: true },
    sport === "nhl" ? { k: "otl", label: "OTL", num: true } : null,
    sport === "nhl" ? { k: "pts", label: "PTS", num: true, sort: t => 2 * t.w + t.otl, fmt: t => 2 * t.w + t.otl } : null,
    { k: "pct", label: "Win %", num: true, sort: t => t.w / Math.max(1, t.gp), fmt: t => fmt.n(t.w / Math.max(1, t.gp), 3) },
    { k: "pf", label: "PF/G", num: true, sort: t => t.pf / Math.max(1, t.gp), fmt: t => fmt.n(t.pf / Math.max(1, t.gp)) },
    { k: "pa", label: "PA/G", num: true, sort: t => t.pa / Math.max(1, t.gp), fmt: t => fmt.n(t.pa / Math.max(1, t.gp)) },
    { k: "diff", label: "Diff/G", num: true, sort: t => (t.pf - t.pa) / Math.max(1, t.gp), fmt: t => h("span", { class: t.pf >= t.pa ? "pos" : "neg" }, fmt.sgn((t.pf - t.pa) / Math.max(1, t.gp))) },
    { k: "home", label: "Home", nosort: true, fmt: t => `${t.homeRec[0]}-${t.homeRec[1]}` },
    { k: "away", label: "Away", nosort: true, fmt: t => `${t.awayRec[0]}-${t.awayRec[1]}` },
    { k: "standing", label: "Division", asc: true, fmt: t => h("span", { class: "muted small" }, t.standing || "") },
    { k: "rank", label: "Power #", num: true, asc: true },
  ].filter(Boolean);
  mount(h("h1", {}, `${SPORTS[sport].full} Standings`),
        h("p", { class: "lede" }, "Computed from every final game on ESPN's scoreboard this season."),
        h("div", { class: "card tight" }, table(cols, rows, { sort: "pct" })));
};

function rumorItem(sport, d, x) {
  return h("div", { class: "rumor" },
    h("a", { class: "rumor-title", href: x.link, target: "_blank", rel: "noopener" }, x.title),
    x.snippet ? h("div", { class: "muted small", style: { marginTop: "3px" } }, x.snippet) : null,
    h("div", { class: "rumor-meta" },
      h("span", { class: "chip " + (x.kind === "trade" ? "accent" : x.kind === "signing" ? "good" : "") }, x.kind),
      h("span", {}, `${x.source} · ${fmt.ago(x.date)}`),
      x.teams.slice(0, 4).map(id => { const t = team(d, id); return h("a", { href: `#/${sport}/team/${id}`, class: "chip", title: t.name }, t.abbr); }),
      x.players.slice(0, 4).map(p => h("span", { class: "chip" }, p.name))));
}

Views.rumors = async (sport) => {
  const [d, r] = await Promise.all([sportData(sport), load(`rumors_${sport}`)]);
  let kind = "all", tid = "";
  const list = h("div", { class: "card tight" });
  const draw = () => {
    const items = r.items.filter(x => (kind === "all" || x.kind === kind) && (!tid || x.teams.includes(tid)));
    list.replaceChildren(...(items.length ? items.slice(0, 120).map(x => rumorItem(sport, d, x)) : [h("div", { class: "empty" }, "Nothing matching.")]));
  };
  draw();
  const hot = h("div", { class: "card" }, h("h2", {}, "🔥 Heat index"), h("p", { class: "muted small" }, "Most-mentioned players in the last 21 days (trade mentions count double)."),
    r.hot.length ? r.hot.slice(0, 15).map(p => {
      const t = team(d, p.team);
      return h("div", { class: "heat" }, logo(t), h("div", {}, h("div", { class: "pname" }, p.name), h("div", { class: "pmeta" }, t.name)),
        h("span", { class: "flames" }, `${p.n}${p.trade ? ` · ${p.trade}T` : ""}`),
        h("a", { class: "btn sm ghost", href: `#/${sport}/trade/${p.team}/${p.id}` }, "Trade sim"));
    }) : h("div", { class: "empty" }, "No player mentions yet."));
  mount(
    h("h1", {}, `${SPORTS[sport].full} Trade Rumors`),
    h("p", { class: "lede" }, "Headlines from the Trade Rumors network and ESPN, auto-tagged to teams and players. The history grows with every rebuild (60-day window). Updated " + fmt.ago(r.generated) + "."),
    h("div", { class: "toolbar" }, seg([["all", "All"], ["trade", "Trades"], ["rumor", "Rumors"], ["signing", "Signings"], ["news", "News"]], kind, v => { kind = v; draw(); }),
      teamSelect(d, tid, v => { tid = v; draw(); }, { blank: "All teams" })),
    h("div", { class: "grid", style: { gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)" } }, list, hot));
  if (matchMedia("(max-width: 900px)").matches) $("#app .grid").style.gridTemplateColumns = "1fr";
};

Views.teams = async (sport) => {
  const d = await sportData(sport);
  const groups = {};
  for (const t of d.teams) (groups[sport === "cfb" ? t.conf || "Other" : (t.standing || "").replace(/^\S+ in /, "") || "League"] ||= []).push(t);
  mount(h("h1", {}, `${SPORTS[sport].full} Teams`),
    h("p", { class: "lede" }, "Every team page has a live roster pulled straight from ESPN, the schedule with model predictions, and " + (sport === "cfb" ? "portal + recruiting activity." : "team-tagged trade rumors.")),
    h("div", { class: "grid g3" }, Object.keys(groups).sort().map(g => h("div", { class: "card" }, h("h3", {}, g),
      groups[g].sort((a, b) => (a.rank || 999) - (b.rank || 999)).map(t => h("div", { style: { padding: "4px 0", display: "flex", justifyContent: "space-between" } },
        teamLink(sport, t), h("span", { class: "muted small" }, sport === "cfb" ? t.record : fmt.rec(t))))))));
};

/* ---------- team page ---------- */
async function liveRoster(sport, id) {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${SPORTS[sport].path}/teams/${id}/roster`);
  if (!r.ok) throw new Error("roster " + r.status);
  const j = await r.json();
  let ath = j.athletes || [];
  if (ath.length && ath[0].items) ath = ath.flatMap(g => g.items);
  return ath.map(a => ({ id: a.id, name: a.displayName, pos: a.position?.abbreviation || "", jersey: a.jersey,
    age: a.age, ht: a.displayHeight, wt: a.displayWeight, cls: a.experience?.abbreviation, img: a.headshot?.href,
    inj: a.injuries?.[0]?.status, salary: a.contract?.salary, yrs: a.contract?.yearsRemaining }));
}

Views.team = async (sport, id) => {
  const d = await sportData(sport);
  const t = team(d, id);
  const isCfb = sport === "cfb";
  const players = await load(`${sport}_players`).catch(() => ({}));
  const built = players[id] || [];
  const builtById = Object.fromEntries(built.map(p => [p.id, p]));
  const sched = d.schedule.filter(g => g.home === id || g.away === id);

  const rosterBox = h("div", {}, h("div", { class: "empty" }, "Loading live roster…"));
  const posOrder = ["QB", "RB", "WR", "TE", "OL", "OT", "G", "C", "DL", "DE", "DT", "LB", "CB", "S", "DB", "PG", "SG", "SF", "PF", "F", "SP", "RP", "P", "LW", "RW", "D"];
  const drawRoster = (ros, live) => {
    const rows = ros.map(p => ({ ...builtById[p.id], ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)) }));
    const cols = [
      { k: "jersey", label: "#", num: true, asc: true, sort: p => +p.jersey || 999 },
      { k: "name", label: "Player", asc: true, fmt: p => h("div", { class: "team-cell" }, p.img ? h("img", { class: "headshot", src: p.img, loading: "lazy", alt: "" }) : h("span", { class: "headshot" }), h("span", {}, p.name, p.inj ? h("span", { class: "chip bad", style: { marginLeft: "6px" } }, p.inj) : null)) },
      { k: "pos", label: "Pos", asc: true, sort: p => { const i = posOrder.indexOf(p.pos); return i < 0 ? 99 : i; } },
      isCfb ? { k: "cls", label: "Class" } : { k: "age", label: "Age", num: true },
      { k: "ht", label: "Ht" }, { k: "wt", label: "Wt" },
      { k: "line", label: "Season", nosort: true, fmt: p => h("span", { class: "muted small" }, p.line || "") },
      !isCfb ? { k: "salary", label: "Salary", num: true, fmt: p => p.salary ? h("span", {}, fmt.money(p.salary), p.salEst ? h("span", { class: "muted small" }, " est") : "") : "–" } : null,
      !isCfb ? { k: "yrs", label: "Yrs", num: true } : null,
      !isCfb ? { k: "tv", label: "Trade value", num: true, sort: p => p.tv?.now, fmt: p => p.tv ? h("span", { class: "mono" }, fmt.n(p.tv.now, 0)) : "–" } : null,
    ].filter(Boolean);
    rosterBox.replaceChildren(
      h("div", { class: "card-head" }, h("h2", {}, `Roster (${rows.length})`),
        h("span", { class: "small muted" }, live ? [h("span", { class: "live-dot" }), "Live from ESPN"] : "Snapshot from last build")),
      table(cols, rows, { sort: isCfb ? "pos" : "tv", asc: isCfb, maxH: "620px" }));
  };
  liveRoster(sport, id).then(r => drawRoster(r, true)).catch(() => drawRoster(built, false));

  const schedRows = sched.map(g => {
    const home = g.home === id, opp = team(d, home ? g.away : g.home);
    const my = home ? g.hs : g.as, their = home ? g.as : g.hs;
    const p = g.pHome != null ? (home ? g.pHome : 1 - g.pHome) : null;
    return { g, home, opp, my, their, p };
  });
  const schedTbl = table([
    { k: "date", label: "Date", sort: r => r.g.date, asc: true, fmt: r => fmt.date(r.g.date) },
    { k: "opp", label: "Opponent", nosort: true, fmt: r => h("span", { class: "team-cell" }, h("span", { class: "muted" }, r.g.neutral ? "vs" : r.home ? "vs" : "@"), logo(r.opp), r.opp.short || r.opp.name) },
    { k: "res", label: "Result", nosort: true, fmt: r => r.g.state === "post" && r.my != null ? h("b", { class: r.my > r.their ? "pos" : "neg" }, `${r.my > r.their ? "W" : "L"} ${r.my}-${r.their}`) : h("span", { class: "muted" }, r.g.state === "in" ? "Live" : "") },
    isCfb ? { k: "p", label: "Model win %", num: true, nosort: true, fmt: r => r.p == null ? "–" : h("span", { class: r.p >= 0.5 ? "pos" : "neg" }, fmt.pct(r.p)) } : null,
    { k: "sim", label: "", nosort: true, fmt: r => r.g.state !== "post" ? h("a", { class: "link small", href: `#/${sport}/sim/${r.g.away}/${r.g.home}${r.g.neutral ? "/n" : ""}` }, "Sim") : "" },
  ].filter(Boolean), schedRows, { sort: "date", asc: true, maxH: "520px" });

  const side = [];
  if (isCfb) side.push(...await CFB.teamExtras(d, id));
  else {
    const r = await load(`rumors_${sport}`).catch(() => null);
    const items = r ? r.items.filter(x => x.teams.includes(id)).slice(0, 12) : [];
    side.push(h("div", { class: "card tight" }, h("div", { class: "card-head" }, h("h2", {}, "Rumors & news"),
      h("a", { class: "btn sm ghost", href: `#/${sport}/trade/${id}` }, "Build a trade")),
      items.length ? items.map(x => rumorItem(sport, d, x)) : h("div", { class: "empty" }, "No tagged items in the window.")));
  }
  const stat = (v, l) => h("div", { class: "stat" }, h("b", {}, v), h("span", {}, l));
  mount(
    h("div", { class: "team-hero", style: { background: `linear-gradient(120deg, ${t.color}, ${t.alt === t.color ? "#111" : shade(t.color)})` } },
      logo(t, "lg"), h("div", {}, h("h1", {}, t.name), h("div", { style: { opacity: .85 } }, [isCfb ? t.conf : t.standing, t.venue].filter(Boolean).join(" · "))),
      h("div", { class: "stats" }, stat(isCfb ? t.record || "–" : fmt.rec(t), "Record"), stat(`#${t.rank ?? "–"}`, "Power rank"),
        stat(fmt.sgn(t.rating, sport === "nhl" || sport === "mlb" ? 2 : 1), "Rating"),
        isCfb ? stat(fmt.n(t.projW), "Proj. wins") : stat(fmt.money(t.payroll), "Payroll"))),
    h("div", { class: "grid", style: { gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)" }, id: "teamGrid" },
      h("div", { class: "grid" }, h("div", { class: "card" }, rosterBox)),
      h("div", { class: "grid", style: { alignContent: "start" } }, h("div", { class: "card tight" }, h("h2", {}, "Schedule"), schedTbl), ...side)));
  if (matchMedia("(max-width: 900px)").matches) $("#teamGrid").style.gridTemplateColumns = "1fr";
};
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.round(c * 0.45)).toString(16).padStart(2, "0");
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/* ---------- home ---------- */
Views.home = async () => {
  const meta = await load("meta").catch(() => ({}));
  const cfb = await sportData("cfb").catch(() => null);
  const tiles = Object.entries(SPORTS).map(([k, s]) => h("a", { class: "sport-tile", href: `#/${k}/${k === "cfb" ? "ratings" : "predictions"}` },
    h("b", {}, s.full, s.featured ? " ★" : ""), h("span", {}, meta[k] ? `Built ${fmt.ago(meta[k].built)}` : "")));
  const top = cfb ? cfb.teams.filter(t => t.rank).sort((a, b) => a.rank - b.rank).slice(0, 10) : [];
  const big = cfb ? cfb.predictions.filter(g => (team(cfb, g.home).rank || 99) <= 30 && (team(cfb, g.away).rank || 99) <= 30)
                    .sort((a, b) => Math.abs(a.pHome - .5) - Math.abs(b.pHome - .5)).slice(0, 6)
                    .map(g => ({ ...g, projHome: cfb.leagueAvg + g.margin / 2, projAway: cfb.leagueAvg - g.margin / 2 })) : [];
  const worst = cfb ? cfb.disappoint.slice(0, 5) : [];
  mount(
    h("div", { class: "hero-home" }, h("img", { class: "hero-logo", src: "img/benny.png", alt: "Benny the Beaver" }), h("h1", {}, "Beavs Knees Sports Lab"),
      h("p", {}, "Our own power ratings and predictions for CFB, NFL, NBA, MLB and NHL - plus live rosters, trade rumors, a trade simulator, a Monte Carlo game simulator, and the CFB recruiting / portal / disappointment boards."),
      h("div", { class: "sport-tiles" }, tiles)),
    cfb ? h("div", { class: "grid g3" },
      h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "CFB Top 10"), h("a", { class: "link small", href: "#/cfb/ratings" }, "All 138 →")),
        top.map(t => h("div", { style: { display: "flex", justifyContent: "space-between", padding: "5px 0" } },
          h("span", { class: "team-cell" }, h("span", { class: "rank" }, t.rank), logo(t), h("a", { href: `#/cfb/team/${t.id}` }, t.short)),
          h("span", { class: "mono" }, fmt.sgn(t.rating))))),
      h("div", { class: "card", style: { gridColumn: "span 1" } }, h("div", { class: "card-head" }, h("h2", {}, `Week ${cfb.upcomingWeek}: closest big games`), h("a", { class: "link small", href: "#/cfb/predictions" }, "All →")),
        big.length ? big.map(g => { const H = team(cfb, g.home), A = team(cfb, g.away); return h("a", { href: `#/cfb/sim/${g.away}/${g.home}${g.neutral ? "/n" : ""}`, style: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" } },
          h("span", {}, `${A.short} @ ${H.short}`), h("b", {}, spreadText("cfb", cfb, g))); }) : h("div", { class: "empty" }, "None this week.")),
      h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Most disappointing"), h("a", { class: "link small", href: "#/cfb/disappoint" }, "Full board →")),
        worst.map(x => { const t = team(cfb, x.id); return h("div", { style: { display: "flex", justifyContent: "space-between", padding: "5px 0" } },
          h("a", { class: "team-cell", href: `#/cfb/team/${t.id}` }, logo(t), t.short), h("span", { class: "small muted" }, `${x.actW}-${x.gp - x.actW} · exp ${fmt.n(x.expW)} W`)); }))) : errorBox(new Error("cfb.json missing")));
};
