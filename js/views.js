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
    { k: "injAdj", label: "Inj adj", num: true, asc: true, title: "Points added/subtracted in predictions for injuries and QB changes (hover for detail)",
      fmt: t => t.injAdj ? h("span", { class: t.injAdj < 0 ? "neg" : "pos", title: (t.injNotes || []).join("\n"), style: { cursor: "help" } }, fmt.sgn(t.injAdj)) : h("span", { class: "muted" }, "–") },
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
      h("a", { class: "link", href: `#/${sport}/sim/${g.away}/${g.home}${g.neutral ? "/n" : ""}` }, "Simulate →")),
    injLine(A, H),
    marketBlock(sport, d, g, A, H));
}
function injLine(...ts) {
  const hit = ts.filter(t => t.injAdj);
  return hit.length ? h("div", { class: "inj-note" }, "⚕ ", hit.map(t => `${t.abbr} ${fmt.sgn(t.injAdj)}: ${t.injNotes.join("; ")}`).join(" · ")) : null;
}

/* What the book is actually offering next to what the model says. Model numbers are fair values,
   DraftKings numbers are real prices - keep them visibly separate. */
function marketBlock(sport, d, g, A, H) {
  const m = g.mkt;
  if (!m) return h("div", { class: "mkt muted" }, "No sportsbook line posted yet");
  const goals = sport === "nhl" || sport === "mlb";
  const bookP = noVigHome(m);
  const bits = [];
  if (!goals && m.spread != null) {
    const diff = g.margin + m.spread;                     // >0: model likes home more than the book
    const fav = diff > 0 ? H : A;
    bits.push(Math.abs(diff) < 0.5 ? "spread: agrees" : `spread: model ${fmt.n(Math.abs(diff), 1)} pts more on ${fav.abbr || fav.short}`);
  }
  if (bookP != null) bits.push(`win %: model ${fmt.pct(g.pHome)} vs book ${fmt.pct(bookP)} (${H.abbr || H.short})`);
  const projTot = sport !== "cfb" && g.projHome != null ? g.projHome + g.projAway : null;
  if (projTot != null && m.total != null) bits.push(`total: model ${fmt.n(projTot, 1)} vs ${m.total}`);
  return h("div", { class: "mkt" },
    h("div", { class: "mkt-line" }, h("span", { class: "chip book" }, m.book || "Book"),
      !goals && m.spread != null ? h("span", {}, h("b", {}, `${H.abbr || H.short} ${fmtSpread(m.spread)}`)) : null,
      m.total != null ? h("span", {}, `O/U `, h("b", {}, m.total)) : null,
      m.mlA != null ? h("span", {}, `ML `, h("b", {}, `${fmtML(m.mlA)} / ${fmtML(m.mlH)}`)) : null),
    bits.length ? h("div", { class: "mkt-cmp" }, bits.join(" · ")) : null,
    moveLine(m, H, goals), splitsLine(m, H, A));
}
function moveLine(m, H, goals) {            // opening line -> current line
  const o = m.open; if (!o) return null;
  const parts = [];
  if (!goals && o.spread != null && m.spread != null) parts.push(o.spread === m.spread ? `${H.abbr} ${fmtSpread(m.spread)} (no move)` : `${H.abbr} ${fmtSpread(o.spread)} → ${fmtSpread(m.spread)}`);
  if (goals && o.mlH != null && m.mlH != null) parts.push(o.mlH === m.mlH ? `${H.abbr} ${fmtML(m.mlH)} (no move)` : `${H.abbr} ${fmtML(o.mlH)} → ${fmtML(m.mlH)}`);
  if (o.total != null && m.total != null) parts.push(o.total === m.total ? `O/U ${m.total}` : `O/U ${o.total} → ${m.total}`);
  return parts.length ? h("div", { class: "mkt-cmp" }, "Opened: ", parts.join(" · ")) : null;
}
function splitsLine(m, H, A) {              // share of bets vs share of money, home side / over
  const s = m.splits; if (!s) return null;
  const items = [];
  if (s.spread_home_bets != null) items.push([`Spread`, s.spread_home_bets, s.spread_home_handle, `on ${H.abbr}`]);
  else if (s.ml_home_bets != null) items.push([`ML`, s.ml_home_bets, s.ml_home_handle, `on ${H.abbr}`]);
  if (s.over_bets != null) items.push([`Total`, s.over_bets, s.over_handle, "on the over"]);
  if (!items.length) return null;
  const sharp = items.some(([, b, mo]) => mo != null && Math.abs(b - mo) >= 15);
  return h("div", { class: "mkt-cmp" }, sharp ? h("span", { class: "chip warn", title: "Share of money differs from share of bets by 15+ points: bigger bettors disagree with the crowd" }, "💰 money ≠ tickets") : null, " Public: ",
    items.map(([lab, b, mo, side]) => `${lab} ${Math.round(b)}% of bets / ${Math.round(mo)}% of money ${side}`).join(" · "));
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
    if (filter === "disagree") ps = ps.filter(g => noVigHome(g.mkt) != null)
      .sort((a, b) => Math.abs(b.pHome - noVigHome(b.mkt)) - Math.abs(a.pHome - noVigHome(a.mkt)));
    box.replaceChildren(...(ps.length ? ps.map(g => gameCard(sport, d, g)) : [h("div", { class: "empty" }, "No upcoming games in the window.")]));
  };
  draw();
  mount(
    h("h1", {}, `${SPORTS[sport].full} Predictions`),
    h("p", { class: "lede" }, sport === "cfb" ? `Week ${d.upcomingWeek} - model spread and win probability for every FBS game.` :
      "Next few days of games - model margin, win probability (normal, σ=" + d.sigma + " " + d.unit + "), and projected score from team scoring rates."),
    h("div", { class: "toolbar" }, seg([["all", "All games"], ...(sport === "cfb" ? [["top", "Top-25 involved"]] : []), ["close", "Coin flips"], ["disagree", "Model vs book"]],
      filter, v => { filter = v; draw(); })),
    box,
    h("div", { class: "note" }, "\"Model\" numbers are our fair values. The DraftKings line (via ESPN) is what's actually being offered - it is refreshed each build, so check the book before acting, since lines move. None of these models has beaten closing lines in honest backtests, so a big model-vs-book gap is more often model error than value."),
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
      return h("div", { class: "heat" }, logo(t), h("div", {}, h("a", { class: "pname plink", href: `#/${sport}/player/${p.team}/${p.id}` }, p.name), h("div", { class: "pmeta" }, t.name)),
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
      { k: "name", label: "Player", asc: true, fmt: p => h("div", { class: "team-cell" }, p.img ? h("img", { class: "headshot", src: p.img, loading: "lazy", alt: "" }) : h("span", { class: "headshot" }), h("span", {}, h("a", { href: `#/${sport}/player/${id}/${p.id}`, class: "plink" }, p.name), p.qb1 ? h("span", { class: "chip good", style: { marginLeft: "6px" } }, "QB1") : null,
        p.inj ? h(p.injSrc ? "a" : "span", { class: "chip bad", style: { marginLeft: "6px" }, title: p.injNote || p.inj, href: p.injSrc || null, target: p.injSrc ? "_blank" : null }, p.inj) : null)) },
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
    { k: "line", label: "Book", nosort: true, title: "DraftKings line via ESPN, from this team's side", fmt: r => {
        const m = r.g.mkt; if (!m || r.g.state === "post") return "";
        if (["nhl", "mlb"].includes(sport) || m.spread == null) return h("span", { class: "mono" }, fmtML(r.home ? m.mlH : m.mlA));
        return h("span", { class: "mono" }, fmtSpread(r.home ? m.spread : -m.spread)); } },
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
    t.injAdj ? h("div", { class: "note warn" }, `Injury / QB adjustment in predictions: ${fmt.sgn(t.injAdj)} pts - ${t.injNotes.join("; ")}`) : null,
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

/* ---------- model vs closing line ---------- */
Views.record = async (sport) => {
  const [d, L] = await Promise.all([sportData(sport), load(`ledger_${sport}`)]);
  const s = L.summary || {}, spreadSport = ["cfb", "nfl", "nba"].includes(sport);
  const rec = r => r ? `${r[0]}-${r[1]}${r[2] ? `-${r[2]}` : ""}` : "–";
  const pctOf = r => r && r[0] + r[1] ? fmt.pct(r[0] / (r[0] + r[1]), 1) : "–";
  const all = Object.entries(L.games).map(([id, e]) => ({ id, ...e }));
  const graded = all.filter(e => e.hs != null && e.close && e.model).sort((a, b) => b.date.localeCompare(a.date));
  const pending = all.filter(e => e.hs == null).length;
  const side = (homeMargin, H, A) => Math.abs(homeMargin) < 0.25 ? "PK" : homeMargin > 0 ? `${H.abbr} -${fmt.n(homeMargin, 1)}` : `${A.abbr} -${fmt.n(-homeMargin, 1)}`;
  const kpi = (label, val, sub, good) => h("div", { class: "kpi" }, h("span", {}, label), h("b", { class: good == null ? "" : good ? "pos" : "neg" }, val), sub ? h("div", { class: "small muted" }, sub) : null);
  const rows = graded.map(e => {
    const H = team(d, e.home), A = team(d, e.away), m = e.model, c = e.close, margin = e.hs - e.as;
    const edge = c.spread != null ? m.margin + c.spread : null, res = c.spread != null ? margin + c.spread : null;
    const result = edge == null || Math.abs(edge) < 0.5 ? null : res === 0 ? "P" : (res > 0) === (edge > 0) ? "W" : "L";
    const q = noVigHome(c);
    return { e, H, A, edge, result, q, su: (m.pHome > 0.5) === (margin > 0) };
  });
  const cols = [
    { k: "date", label: "Date", sort: r => r.e.date, fmt: r => fmt.date(r.e.date) },
    { k: "game", label: "Game", nosort: true, fmt: r => h("span", { class: "team-cell" }, logo(r.A), r.A.abbr, h("span", { class: "muted" }, r.e.neutral ? "vs" : "@"), logo(r.H), r.H.abbr) },
    { k: "final", label: "Final", nosort: true, fmt: r => `${r.e.as}-${r.e.hs}` },
    spreadSport ? { k: "model", label: "Model line", nosort: true, fmt: r => h("span", { class: "mono" }, side(r.e.model.margin, r.H, r.A)) } : null,
    spreadSport ? { k: "close", label: "DK close", nosort: true, fmt: r => h("span", { class: "mono" }, r.e.close.spread == null ? "–" : side(-r.e.close.spread, r.H, r.A)) } : null,
    spreadSport ? { k: "edge", label: "Gap", num: true, sort: r => r.edge == null ? null : Math.abs(r.edge), title: "Points the model differed from the closing spread", fmt: r => r.edge == null ? "–" : fmt.n(Math.abs(r.edge), 1) } : null,
    spreadSport ? { k: "result", label: "Model side", sort: r => r.result, fmt: r => r.result ? h("b", { class: r.result === "W" ? "pos" : r.result === "L" ? "neg" : "" }, r.result) : h("span", { class: "muted" }, "agree") } : null,
    { k: "pm", label: `Model ${"home"} win%`, num: true, sort: r => r.e.model.pHome, fmt: r => fmt.pct(r.e.model.pHome) },
    { k: "pb", label: "Book home win%", num: true, sort: r => r.q, fmt: r => fmt.pct(r.q) },
    { k: "su", label: "Model winner", sort: r => r.su, fmt: r => h("b", { class: r.su ? "pos" : "neg" }, r.su ? "✓" : "✗") },
  ].filter(Boolean);
  mount(
    h("h1", {}, `${SPORTS[sport].full}: Model vs Market`),
    h("p", { class: "lede" }, "Every game graded two ways: our model's PREGAME numbers (snapshotted before kickoff and never edited after) against DraftKings' CLOSING line, the sharpest public number there is. " +
      (sport === "cfb" ? "CFB is backfilled for the whole season with no hindsight: each week is predicted from ratings fit only on games before it. FBS vs FBS only." : "Tracking started 10/26/26.")),
    s.n ? h("div", { class: "kpis" },
      kpi("Games graded", s.n, pending ? `${pending} pending` : null),
      kpi("Winner picked", `${fmt.pct(s.suModel, 1)} vs ${fmt.pct(s.suBook, 1)}`, "model vs book favorite", s.suModel >= s.suBook),
      kpi("Brier score", `${fmt.n(s.brierModel, 3)} vs ${fmt.n(s.brierBook, 3)}`, "win-prob accuracy, lower is better", s.brierModel <= s.brierBook),
      spreadSport ? kpi("Avg miss (pts)", `${fmt.n(s.maeModel, 1)} vs ${fmt.n(s.maeBook, 1)}`, "|final margin - line|, model vs close", s.maeModel <= s.maeBook) : null,
      spreadSport ? kpi("Model side vs close", rec(s.ats), `${pctOf(s.ats)} · break-even 52.4%`, s.ats && s.ats[0] / Math.max(1, s.ats[0] + s.ats[1]) > 0.524) : null,
      spreadSport ? kpi("Gap ≥ 3 pts", rec(s.atsBig), pctOf(s.atsBig), s.atsBig && s.atsBig[0] / Math.max(1, s.atsBig[0] + s.atsBig[1]) > 0.524) : null,
      s.ou && s.ou[0] + s.ou[1] ? kpi("Totals vs close", rec(s.ou), pctOf(s.ou), s.ou[0] / (s.ou[0] + s.ou[1]) > 0.524) : null)
      : h("div", { class: "card empty" }, `No graded games yet${pending ? ` - ${pending} games snapshotted and waiting on results` : ""}. Grades appear the morning after games finish.`),
    graded.length ? h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "Graded games"), table(cols, rows, { sort: "date", maxH: "640px" })) : null,
    h("div", { class: "note" }, "Green means the model beat the book on that measure, red means it didn't. Closing lines usually win: they price in injuries, weather and sharp money the model never sees. That's why this page exists - to keep the predictions honest, not to sell them."));
};

/* ---------- message board (Giscus: GitHub Discussions on the site repo) ----------
   Each thread is one Discussion in the Announcements category, matched by a fixed term
   ("cfb-general", ...). Only maintainers + the Giscus app can open discussions there, so
   visitors reply inside the standing threads instead of spawning new ones. */
const GISCUS = { repo: "BeavsKneesSportsLab/beavskneessportslab.github.io", repoId: "R_kgDOVYjOUQ",
                 category: "Announcements", categoryId: "DIC_kwDOVYjOUc4DJs7O" };
const BOARD_THREADS = {
  cfb: [["general", "General"], ["gameday", "Game Day"], ["beavs", "Beavs Corner"], ["recruiting", "Recruiting & Portal"], ["model", "Model Talk"]],
  pro: [["general", "General"], ["gameday", "Game Day"], ["trades", "Trade Talk"], ["model", "Model Talk"]],
};
Views.board = async (sport) => {
  const threads = BOARD_THREADS[sport] || BOARD_THREADS.pro;
  let cur = threads[0][0];
  const box = h("div", { class: "card board" });
  const draw = () => {
    box.replaceChildren();
    const dark = document.documentElement.dataset.theme !== "light";
    const s = document.createElement("script");
    Object.entries({ src: "https://giscus.app/client.js", "data-repo": GISCUS.repo, "data-repo-id": GISCUS.repoId,
      "data-category": GISCUS.category, "data-category-id": GISCUS.categoryId, "data-mapping": "specific",
      "data-term": `${sport}-${cur}`, "data-strict": "1", "data-reactions-enabled": "1", "data-emit-metadata": "0",
      "data-input-position": "top", "data-theme": dark ? "dark" : "light", "data-lang": "en",
      crossorigin: "anonymous" }).forEach(([k, v]) => s.setAttribute(k, v));
    s.async = true;
    box.append(s);
  };
  draw();
  mount(
    h("h1", {}, `${SPORTS[sport].full} Message Board`),
    h("p", { class: "lede" }, "Talk ball. Anyone can read; posting takes a free GitHub account (it keeps the spam out). Be decent - posts that aren't get removed."),
    h("div", { class: "toolbar" }, seg(threads, cur, v => { cur = v; draw(); })),
    box);
};

/* ---------- pro season projections ---------- */
Views.projections = async (sport) => {
  const [d, p] = await Promise.all([sportData(sport), load(`${sport}_season`)]);
  const rows = p.teams.map(x => ({ ...x, t: team(d, x.id) }));
  const pct = v => v >= 0.995 && v < 1 ? ">99%" : v > 0 && v < 0.005 ? "<1%" : fmt.pct(v);
  const confs = [...new Set(rows.map(x => x.conf))].sort();
  const confLabel = c => sport === "nfl" ? c : `${c}ern Conference`;
  const titleWord = { nfl: "Super Bowl", nba: "NBA title", nhl: "Stanley Cup" }[sport];
  const cards = h("div", { class: "grid g2" }, confs.map(c => {
    const cr = rows.filter(x => x.conf === c).sort((a, b) => b.conf_title - a.conf_title).slice(0, 6), mx = cr[0].conf_title;
    return h("div", { class: "card" }, h("h2", {}, `${confLabel(c)}: win the conference`),
      cr.map(x => h("div", { class: "mini-row" }, h("a", { class: "team-cell", href: `#/${sport}/team/${x.id}` }, logo(x.t), x.t.short),
        h("span", { style: { display: "flex", gap: "8px", alignItems: "center" } }, h("div", { class: "bar", style: { width: "80px" } }, h("i", { style: { width: `${100 * x.conf_title / mx}%` } })),
          h("b", { style: { width: "44px", textAlign: "right" } }, pct(x.conf_title))))));
  }));
  const tbl = table([
    { k: "t", label: "Team", sort: x => x.t.name, asc: true, fmt: x => teamLink(sport, x.t) },
    { k: "div", label: "Division", asc: true },
    { k: "w", label: "Proj. record", fmt: x => sport === "nhl" ? `${fmt.n(x.w, 0)}-${fmt.n(x.l, 0)}-${fmt.n(x.otl, 0)}` : `${fmt.n(x.w, 1)}-${fmt.n(x.l, 1)}` },
    sport === "nhl" ? { k: "pts", label: "Proj. pts", num: true, fmt: x => fmt.n(x.pts, 0) } : null,
    { k: "playoffs", label: "Playoffs", num: true, fmt: x => h("b", {}, pct(x.playoffs)) },
    sport === "nba" ? { k: "playin", label: "Play-in", num: true, title: "Finishes 7th-10th in the conference", fmt: x => pct(x.playin) } : null,
    { k: "div_title", label: "Win division", num: true, fmt: x => pct(x.div_title) },
    { k: "top_seed", label: sport === "nfl" ? "#1 seed (bye)" : sport === "nba" ? "#1 seed" : "Top div. winner", num: true, fmt: x => pct(x.top_seed) },
    { k: "conf_title", label: "Win conference", num: true, fmt: x => pct(x.conf_title) },
    { k: "title", label: titleWord, num: true, fmt: x => h("b", { class: x.title > 0.08 ? "pos" : "" }, pct(x.title)) },
  ].filter(Boolean), rows, { sort: "title" });
  mount(
    h("h1", {}, `${SPORTS[sport].full} Season Odds`),
    h("p", { class: "lede" }, `${p.sims.toLocaleString()} simulations of the remaining ${p.remaining} games and the full playoffs, off our power ratings (injury adjustments on the next week of games). ` +
      { nfl: "Format: 4 division winners + 3 wild cards per conference, #1 seed bye, reseeding.", nba: "Format: top 6 + play-in per conference, best-of-7 series.", nhl: "Format: top 3 per division + 2 wild cards per conference, division bracket, best-of-7." }[sport]),
    cards,
    sport === "nfl" ? draftCard(d, rows) : null,
    h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "Every team"), tbl),
    h("div", { class: "note" }, "Each simulated season gives every team a season-long rating shock (true strength is uncertain), plays every game off the model's win probability, and runs the real playoff format. Tiebreakers are simplified to record, then a coin flip weighted by strength."));
};

function draftCard(d, rows) {
  const r = rows.filter(x => x.avgPick != null).sort((a, b) => a.avgPick - b.avgPick).slice(0, 16);
  return h("div", { class: "card tight", style: { marginTop: "16px" } },
    h("div", { class: "card-head" }, h("h2", {}, "Projected 2027 draft order"), h("span", { class: "muted small" }, "From the season sims · own picks only (trades not tracked)")),
    table([
      { k: "avgPick", label: "Proj. pick", num: true, asc: true, fmt: (x, i) => h("b", {}, i + 1) },
      { k: "t", label: "Team", nosort: true, fmt: x => teamLink("nfl", x.t) },
      { k: "rec", label: "Proj. record", nosort: true, fmt: x => `${fmt.n(x.w, 1)}-${fmt.n(x.l, 1)}` },
      { k: "ap", label: "Avg pick", num: true, nosort: true, fmt: x => fmt.n(x.avgPick, 1) },
      { k: "pick1", label: "#1 pick", num: true, nosort: true, fmt: x => fmt.pct(x.pick1) },
      { k: "top5", label: "Top 5", num: true, nosort: true, fmt: x => fmt.pct(x.top5) },
    ], r, { sort: "avgPick", asc: true }));
}
