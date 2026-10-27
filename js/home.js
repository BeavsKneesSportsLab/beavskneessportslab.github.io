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

function featuredCard(g, live, big) {
  const L = live[g.id] || {};
  const state = L.state || "pre";
  const H = g.home, A = g.away, pH = g.pHome ?? 0.5;
  const goals = g.sport === "nhl" || g.sport === "mlb";
  const fav = g.margin >= 0 ? H : A, m = Math.abs(g.margin || 0);
  const modelTxt = m < (goals ? 0.03 : 0.25) ? "Pick'em" : goals ? `${fav.abbr} ${fmt.pct(Math.max(pH, 1 - pH))}` : `${fav.abbr} -${(Math.round(m * 2) / 2).toFixed(1)}`;
  const row = (t, score, p) => h("div", { class: "fg-row" },
    h("a", { class: "nm", href: `#/${g.sport}/team/${t.id}` }, logo(t, big ? "md" : ""),
      h("span", {}, g.sport === "cfb" && t.rank && t.rank <= 25 ? h("span", { class: "rank" }, t.rank) : null, t.short || t.name),
      h("span", { class: "muted small" }, g.sport === "cfb" ? t.record || "" : t.w != null ? fmt.rec(t) : "")),
    state === "pre" ? h("span", { class: "pct" }, fmt.pct(p)) : h("b", { class: "score" }, score ?? "–"));
  const status = state === "in" ? h("span", { class: "chip live" }, h("span", { class: "live-dot" }), L.detail || "Live")
    : state === "post" ? h("span", { class: "chip" }, L.detail || "Final")
    : h("span", { class: "muted small" }, `${fmt.date(g.date)} · ${fmt.time(g.date)}`);
  return h("div", { class: "fg" + (big ? " big" : "") },
    h("div", { class: "fg-top" }, h("span", { class: "chip league" }, SPORTS[g.sport].name), status, g.tv ? h("span", { class: "muted small" }, g.tv.split(",")[0]) : null),
    big ? h("div", { class: "fg-kicker" }, "Game of the day") : null,
    row(A, L.as, 1 - pH), row(H, L.hs, pH),
    h("div", { class: "fg-foot" },
      h("span", {}, "Model ", h("b", {}, modelTxt)),
      g.mkt ? h("span", {}, "DK ", h("b", {}, goals || g.mkt.spread == null ? `${fmtML(g.mkt.mlA)}/${fmtML(g.mkt.mlH)}` : `${H.abbr} ${fmtSpread(g.mkt.spread)}`)) : null,
      h("a", { class: "link", href: `#/${g.sport}/sim/${A.id}/${H.id}${g.neutral ? "/n" : ""}` }, "Sim →")),
    g.injNotes?.length ? h("div", { class: "inj-note", title: g.injNotes.join("\n") }, "⚕ ",
      g.injNotes.map(n => n.replace(/:.*- ([-+]\d+(?:\.\d)?) pts$/, " ($1)")).slice(0, 2).join(" · ")) : null);
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
  const [cfb, ledger] = await Promise.all([sportData("cfb").catch(() => null), load("ledger_cfb").catch(() => null)]);
  const gamesBox = h("div", { class: "fg-grid" });
  const drawGames = live => gamesBox.replaceChildren(...(home.games.length
    ? home.games.map((g, i) => featuredCard(g, live, i === 0))
    : [h("div", { class: "empty" }, "No games on the slate today.")]));
  drawGames({});
  liveScores(home.games).then(drawGames);
  _homeTimer = setInterval(() => { if (location.hash.replace(/^#\/?/, "") === "") liveScores(home.games).then(drawGames); else clearInterval(_homeTimer); }, 60000);

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
    h("div", { class: "home-head" }, h("img", { class: "home-logo", src: "img/benny.png", alt: "" }),
      h("div", {}, h("h1", {}, "Beavs Knees Sports Lab"), h("div", { class: "muted" }, today)),
      h("div", { class: "home-links" }, HOME_SPORTS.map(k => h("a", { class: "chip", href: `#/${k}/${k === "cfb" ? "ratings" : "predictions"}` }, SPORTS[k].name)))),
    h("section", {}, h("div", { class: "card-head" }, h("h2", {}, "Today's biggest games"),
      h("span", { class: "muted small" }, h("span", { class: "live-dot" }), "Live scores update every minute")), gamesBox),
    h("div", { class: "home-grid" },
      h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Top stories"), h("span", { class: "muted small" }, "via ESPN")), storiesBox),
      topicCard),
    cfb ? h("div", { class: "grid g4 home-lists", style: { marginTop: "16px" } },
      listCard("CFB Top 10", "#/cfb/ratings", "All →", top.map(x => rankRow(x, x.rating))),
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
