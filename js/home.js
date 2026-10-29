/* home.js — front page: today's biggest games (live scores from ESPN), top stories (live ESPN headlines),
   discussion of the day (data-driven question + its own Giscus thread), and quick-hit panels. */
const HOME_SPORTS = ["cfb", "nfl", "nba", "mlb", "nhl"];
let _homeTimer = null;

async function liveScores(games) {
  // one ESPN scoreboard call per sport per date the featured games fall on
  const keys = [...new Set(games.map(g => `${g.sport}|${new Date(g.date).toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "")}`))];
  const out = {};
  await Promise.all(keys.map(async k => {
    const [sp, day] = k.split("|");
    const extra = sp === "cfb" ? "&groups=80&limit=300" : "";
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${SPORTS[sp].path}/scoreboard?dates=${day}${extra}`);
      const j = await r.json();
      for (const e of j.events || []) {
        const c = e.competitions[0], st = c.status?.type || {};
        const side = Object.fromEntries(c.competitors.map(x => [x.homeAway, x.score]));
        out[e.id] = { state: st.state, detail: st.shortDetail, hs: side.home, as: side.away };
      }
    } catch { /* keep the scheduled view */ }
  }));
  return out;
}

async function liveStories(fallback) {
  try {
    const feeds = await Promise.all(HOME_SPORTS.map(sp =>
      fetch(`https://site.api.espn.com/apis/site/v2/sports/${SPORTS[sp].path}/news?limit=12`).then(r => r.json())
        .then(j => (j.articles || []).slice(0, 6).map((a, i) => ({ sport: sp, rank: i, headline: a.headline, desc: (a.description || "").slice(0, 220),
          img: a.images?.[0]?.url, link: a.links?.web?.href, published: a.published }))).catch(() => [])));
    const all = feeds.flat().sort((a, b) => a.rank - b.rank || HOME_SPORTS.indexOf(a.sport) - HOME_SPORTS.indexOf(b.sport));
    return all.length ? all.slice(0, 14) : fallback;
  } catch { return fallback; }
}

/* home.json picks the featured games once per build. If the day's build didn't run, its list is
   yesterday's - so re-pick today's games from each sport's predictions (several days deep), with the
   same scoring as build/home.py featured_games. ptDay comes from pickem.js (called after every script loads). */
const NATIONAL = new Set(["ESPN", "ABC", "FOX", "Fox", "CBS", "NBC", "TNT", "Prime Video", "FS1", "ESPN2", "Peacock", "TBS", "NFL Net", "truTV", "ESPNU", "CBSSN", "NBA TV"]);
const SPORT_W = { cfb: 1.15, nfl: 1.1, nba: 1.0, nhl: 0.95, mlb: 1.05 };
async function freshGames(home) {
  const today = ptDay(Date.now());
  if (home.date === today) return home.games;
  const t0 = new Date(today + "T12:00:00Z");
  const pool = [];
  await Promise.all(HOME_SPORTS.map(async sp => {
    const d = await sportData(sp).catch(() => null);
    if (!d) return;
    const n = Math.max(2, d.teams.length);
    for (const g of d.predictions) {
      const H = d._byId[g.home], A = d._byId[g.away];
      if (g.state === "post" || !H || !A) continue;
      const day = Math.round((new Date(ptDay(g.date) + "T12:00:00Z") - t0) / 864e5);
      if (day < 0 || day > 1) continue;
      const strength = [H, A].reduce((s, t) => s + 1 - ((t.rank || n) - 1) / (n - 1), 0) / 2;
      const close = 1 - 2 * Math.abs((g.pHome ?? 0.5) - 0.5);
      const tv = (g.tv || "").split(",").some(x => NATIONAL.has(x.trim())) ? 0.15 : 0;
      const score = (0.6 * strength + 0.3 * close + tv + (g.stype === 3 ? 0.35 : 0)) * SPORT_W[sp] - 0.25 * day;
      pool.push({ sport: sp, id: g.id, date: g.date, day, score, home: H, away: A, margin: g.margin, pHome: g.pHome, sp: g.sp,
                  mkt: g.mkt, tv: g.tv, neutral: g.neutral, unit: d.unit,
                  injNotes: [H, A].filter(t => t.injAdj).flatMap(t => t.injNotes || []) });
    }
  }));
  pool.sort((a, b) => b.score - a.score);
  const top = cands => { const per = {}; return cands.filter(x => (per[x.sport] = (per[x.sport] || 0) + 1) <= 3).slice(0, 8); };
  const todayOnly = top(pool.filter(x => x.day === 0));
  const pick = todayOnly.length >= 6 ? todayOnly : top(pool);
  return pick.length ? pick : home.games.filter(g => ptDay(g.date) >= today);
}

function featuredCard(g, live, big, why) {
  const L = live[g.id] || {};
  const state = L.state || "pre";
  const H = g.home, A = g.away, pH = g.pHome ?? 0.5;
  const goals = g.sport === "nhl" || g.sport === "mlb";
  const fav = g.margin >= 0 ? H : A, m = Math.abs(g.margin || 0);
  const modelTxt = m < (goals ? 0.03 : 0.25) ? "Pick'em" : goals ? `${fav.abbr} ${fmt.pct(Math.max(pH, 1 - pH))}` : `${fav.abbr} -${(Math.round(m * 2) / 2).toFixed(1)}`;
  const row = (t, score, p, side) => h("div", { class: "fg-row" },
    h("a", { class: "nm", href: `#/${g.sport}/team/${t.id}` }, logo(t, big ? "md" : ""),
      h("span", { class: "nm-txt" }, h("span", {}, g.sport === "cfb" && t.rank && t.rank <= 25 ? h("span", { class: "rank" }, t.rank) : null, t.short || t.name),
        spLine(g, side)),
      h("span", { class: "muted small" }, g.sport === "cfb" ? t.record || "" : t.w != null ? fmt.rec(t) : "")),
    state === "pre" ? h("span", { class: "pct" }, fmt.pct(p)) : h("b", { class: "score" }, score ?? "–"));
  const status = state === "in" ? h("span", { class: "chip live" }, h("span", { class: "live-dot" }), L.detail || "Live")
    : state === "post" ? h("span", { class: "chip" }, L.detail || "Final")
    : h("span", { class: "muted small" }, `${fmt.date(g.date)} · ${fmt.time(g.date)}`);
  return h("div", { class: "fg" + (big ? " big" : "") },
    h("div", { class: "fg-top" }, h("span", { class: "chip league" }, SPORTS[g.sport].name), status, g.tv ? h("span", { class: "muted small" }, g.tv.split(",")[0]) : null),
    big ? h("div", { class: "fg-kicker" }, "Game of the day") : null,
    row(A, L.as, 1 - pH, "away"), row(H, L.hs, pH, "home"),
    h("div", { class: "fg-foot" },
      h("span", {}, "Model ", h("b", {}, modelTxt)),
      g.mkt ? h("span", {}, "DK ", h("b", {}, goals || g.mkt.spread == null ? `${fmtML(g.mkt.mlA)}/${fmtML(g.mkt.mlH)}` : `${H.abbr} ${fmtSpread(g.mkt.spread)}`)) : null,
      h("a", { class: "link", href: `#/${g.sport}/sim/${A.id}/${H.id}${g.neutral ? "/n" : ""}` }, "Sim →")),
    g.injNotes?.length ? h("div", { class: "inj-note", title: g.injNotes.join("\n") }, "⚕ ",
      g.injNotes.map(n => n.replace(/:.*- ([-+]\d+(?:\.\d)?) pts$/, " ($1)")).slice(0, 2).join(" · ")) : null,
    why || null);
}

function storyList(stories) {
  if (!stories.length) return h("div", { class: "empty" }, "No headlines right now.");
  const [lead, ...rest] = stories;
  return h("div", {},
    h("a", { class: "story-lead", href: lead.link, target: "_blank", rel: "noopener" },
      lead.img ? h("img", { src: lead.img, alt: "", loading: "lazy" }) : null,
      h("div", {}, h("span", { class: "chip league" }, SPORTS[lead.sport].name), h("h3", {}, lead.headline), h("p", { class: "muted" }, lead.desc))),
    rest.slice(0, 9).map(s => h("a", { class: "story", href: s.link, target: "_blank", rel: "noopener" },
      s.img ? h("img", { src: s.img, alt: "", loading: "lazy" }) : h("span", { class: "story-ph" }),
      h("div", {}, h("div", { class: "story-h" }, s.headline),
        h("div", { class: "muted small" }, `${SPORTS[s.sport].name}${s.published ? " · " + fmt.ago(s.published) : ""}`)))));
}

function giscusInto(box, term) {
  const dark = document.documentElement.dataset.theme !== "light";
  const s = document.createElement("script");
  Object.entries({ src: "https://giscus.app/client.js", "data-repo": GISCUS.repo, "data-repo-id": GISCUS.repoId,
    "data-category": GISCUS.category, "data-category-id": GISCUS.categoryId, "data-mapping": "specific", "data-term": term,
    "data-strict": "1", "data-reactions-enabled": "1", "data-emit-metadata": "0", "data-input-position": "top",
    "data-theme": dark ? "dark" : "light", "data-lang": "en", crossorigin: "anonymous" }).forEach(([k, v]) => s.setAttribute(k, v));
  s.async = true;
  box.replaceChildren(s);
}

Views.home = async () => {
  clearInterval(_homeTimer);
  const home = await load("home").catch(() => ({ games: [], stories: [], topic: null }));
  home.games = await freshGames(home);
  const [cfb, ledger, poll] = await Promise.all([sportData("cfb").catch(() => null), load("ledger_cfb").catch(() => null), load("cfb_poll").catch(() => null)]);
  const gamesBox = h("div", { class: "fg-grid" });
  // the "why" write-ups need each sport's full ratings; cards redraw every minute, so remember which are open
  const sd = {}, openWhy = new Set();
  let lastLive = {};
  const why = g => { const d = sd[g.sport], p = d?.predictions.find(x => x.id === g.id); return p ? whyBox(g.sport, d, p, openWhy) : null; };
  const drawGames = live => { lastLive = live; gamesBox.replaceChildren(...(home.games.length
    ? home.games.map((g, i) => featuredCard(g, live, i === 0, why(g)))
    : [h("div", { class: "empty" }, "No games on the slate today.")])); };
  drawGames({});
  Promise.all([...new Set(home.games.map(g => g.sport))].map(sp => sportData(sp).then(d => { sd[sp] = d; }).catch(() => {})))
    .then(() => drawGames(lastLive));
  liveScores(home.games).then(drawGames);
  _homeTimer = setInterval(() => { if (location.hash.replace(/^#\/?/, "") === "") liveScores(home.games).then(drawGames); else clearInterval(_homeTimer); }, 60000);

  const osuCard = await OSU.homeCard().catch(() => null);
  const picksCard = await Picks.homeCard().catch(() => null);
  const storiesBox = h("div", {}, storyList(home.stories || []));
  liveStories(home.stories || []).then(s => storiesBox.replaceChildren(storyList(s)));

  const t = home.topic;
  const thread = h("div", { class: "board-mini" });
  const topicCard = t ? h("div", { class: "card topic" },
    h("div", { class: "kicker" }, "💬 Discussion of the day"),
    h("h2", {}, t.title), h("p", {}, t.blurb),
    h("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", margin: "8px 0 4px" } },
      h("a", { class: "btn sm", href: t.link }, "See the numbers"), h("a", { class: "btn sm ghost", href: "#/cfb/board" }, "All message boards")),
    thread) : null;
  if (t) giscusInto(thread, t.term);

  const ranked = cfb ? cfb.teams.filter(x => x.rank).sort((a, b) => a.rank - b.rank) : [];
  const top = ranked.slice(0, 10), bottom = ranked.slice(-10);
  const s = ledger?.summary;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  mount(
    h("div", { class: "home-head" }, h("img", { class: "home-logo", src: "img/beaver-full.jpg", alt: "" }),
      h("div", {}, h("h1", {}, "Beavs Knees Sports Lab"), h("div", { class: "muted" }, today)),
      h("div", { class: "home-links" }, HOME_SPORTS.map(k => h("a", { class: "chip", href: `#/${k}/${k === "cfb" ? "ratings" : "predictions"}` }, SPORTS[k].name)))),
    h("section", {}, h("div", { class: "card-head" }, h("h2", {}, "Today's biggest games"),
      h("span", { class: "muted small" }, h("span", { class: "live-dot" }), "Live scores update every minute")), gamesBox),
    picksCard,
    h("div", { class: "home-grid" },
      h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Top stories"), h("span", { class: "muted small" }, "via ESPN")), storiesBox),
      h("div", { class: "home-side" }, osuCard, topicCard)),
    home.onThisDate?.length ? h("section", { style: { marginTop: "16px" } },
      h("h2", {}, "📅 On this date"),
      h("div", { class: "grid g3" }, home.onThisDate.map(f => h("div", { class: "card otd" },
        h("div", { class: "otd-top" }, h("span", { class: "chip league" }, SPORTS[f.sport].name), h("span", { class: "otd-year" }, f.year),
          h("span", { class: "muted small" }, f.exact ? f.ago : `this week, ${f.ago}`)),
        h("p", { class: "otd-text" }, f.text),
        h("div", { class: "muted small" }, f.detail, f.link ? [" · ", h("a", { class: "link", href: f.link, target: "_blank", rel: "noopener" }, "Box score →")] : null))))) : null,
    cfb ? h("div", { class: "grid g4 home-lists", style: { marginTop: "16px" } },
      poll ? listCard(`🦫 Beavs Knees Poll · Wk ${poll.weeks.at(-1).week}`, "#/cfb/poll", "Full poll →", poll.weeks.at(-1).top25.slice(0, 10).filter(r => r.id).map(r => {
        const t = team(cfb, r.id); return h("div", { class: "mini-row" }, h("span", { class: "team-cell" }, h("span", { class: "rank" }, r.rank), logo(t), h("a", { href: `#/cfb/team/${t.id}` }, t.short)), moveChip(r)); })) : null,
      listCard("Model Top 10", "#/cfb/ratings", "All →", top.map(x => rankRow(x, x.rating))),
      listCard("CFB Bottom 10", "#/cfb/ratings", "All →", bottom.map(x => rankRow(x, x.rating))),
      listCard("😬 Most disappointing", "#/cfb/disappoint", "Board →", cfb.disappoint.slice(0, 10).map(x => expRow(team(cfb, x.id), x))),
      listCard("🚀 Biggest overachievers", "#/cfb/disappoint", "Board →", cfb.disappoint.slice(-10).reverse().map(x => expRow(team(cfb, x.id), x)))) : null,
    s && s.n ? h("a", { class: "card mvm-strip", href: "#/cfb/record" },
      h("b", {}, "Model vs Market"),
      h("span", {}, `${s.n} CFB games graded`),
      h("span", {}, "Winner picked ", h("b", {}, `${fmt.pct(s.suModel, 1)}`), " vs book ", h("b", {}, fmt.pct(s.suBook, 1))),
      h("span", {}, "Model side vs close ", h("b", {}, `${s.ats[0]}-${s.ats[1]}-${s.ats[2]}`)),
      h("span", { class: "link" }, "Full record →")) : null);
};

function listCard(title, href, linkTxt, rows) {
  return h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, title), h("a", { class: "link small", href }, linkTxt)), rows);
}
function rankRow(x, rating) {
  return h("div", { class: "mini-row" }, h("span", { class: "team-cell" }, h("span", { class: "rank" }, x.rank), logo(x), h("a", { href: `#/cfb/team/${x.id}` }, x.short)),
    h("span", { class: "mono" }, fmt.sgn(rating)));
}
function expRow(t, x) {        // record vs. wins the preseason ratings expected, with the index
  return h("div", { class: "mini-row" }, h("a", { class: "team-cell", href: `#/cfb/team/${t.id}` }, logo(t), t.short),
    h("span", { class: "small muted", title: `Talent #${x.talentRank} · preseason #${x.preRank} → now #${x.curRank} on results` },
      `${x.actW}-${x.gp - x.actW} · exp ${fmt.n(x.expW)} `, h("b", { class: x.index < 0 ? "neg" : "pos" }, fmt.sgn(x.index, 2))));
}
