/* extras.js — site-wide helpers: header search (teams, players, pages), "My Teams" favorites (saved in this
   browser), and the "How it works" page. */

/* ---------- search ---------- */
const PAGES = [
  ["Pick'em", "#/pickem", "Play against the spread"], ["Beavers", "#/beavers", "Oregon State, every sport"],
  ["How it works", "#/about", "What the numbers mean"], ["Beavs Knees Poll", "#/cfb/poll", "CFB"],
  ["Playoff Odds", "#/cfb/playoff", "CFB"], ["Heisman", "#/cfb/heisman", "CFB"], ["Transfer Portal", "#/cfb/portal", "CFB"],
  ["Recruiting", "#/cfb/recruiting", "CFB"],
  ...Object.entries(SPORTS).flatMap(([k, s]) => [[`${s.name} Power Ratings`, `#/${k}/ratings`, s.full], [`${s.name} Predictions`, `#/${k}/predictions`, s.full]]),
];
const Search = {
  _idx: null,
  async index() {
    if (this._idx) return this._idx;
    const sports = Object.keys(SPORTS);
    const [datas, players] = await Promise.all([
      Promise.all(sports.map(s => sportData(s).catch(() => null))),
      Promise.all(sports.map(s => playerIndex(s)))]);
    const out = [];
    sports.forEach((s, i) => {
      const d = datas[i]; if (!d) return;
      for (const t of d.teams) out.push({ kind: "team", sport: s, t, href: `#/${s}/team/${t.id}`,
        keys: [t.name, t.short, t.abbr, t.loc, t.nick].filter(Boolean).map(x => x.toLowerCase()) });
      for (const [pid, name, pos, tid] of players[i] || []) {
        const t = d._byId[tid]; if (!t) continue;
        out.push({ kind: "player", sport: s, t, name, pos, href: `#/${s}/player/${tid}/${pid}`, keys: [name.toLowerCase()] });
      }
    });
    for (const [name, href, sub] of PAGES) out.push({ kind: "page", name, sub, href, keys: [name.toLowerCase()] });
    return (this._idx = out);
  },
  find(idx, q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) return [];
    const score = x => {
      let best = 0;
      for (const k of x.keys) {
        if (k === q) best = Math.max(best, 100);
        else if (k.startsWith(q)) best = Math.max(best, 60);
        else if (k.split(/[\s.'-]+/).some(w => w.startsWith(q))) best = Math.max(best, 40);
        else if (k.includes(q)) best = Math.max(best, 15);
      }
      return best ? best + (x.kind === "team" ? 8 : x.kind === "page" ? 5 : 0) + (x.sport === "cfb" ? 2 : 0) : 0;
    };
    return idx.map(x => [score(x), x]).filter(([s]) => s).sort((a, b) => b[0] - a[0]).slice(0, 14).map(([, x]) => x);
  },
  open() {
    if ($(".search-modal")) return;
    const input = h("input", { class: "in search-in", type: "search", placeholder: "Search teams, players, pages…", "aria-label": "Search", autocomplete: "off" });
    const list = h("div", { class: "search-list" }, h("div", { class: "muted small" }, "Type a team (\"Gonzaga\", \"Beavers\"), a player (\"Fahey\") or a page."));
    let sel = 0, hits = [];
    const close = () => { modal.remove(); document.removeEventListener("keydown", onKey); };
    const go = x => { close(); location.hash = x.href; };
    const draw = () => list.replaceChildren(...(hits.length ? hits.map((x, i) => h("a", { class: "search-hit" + (i === sel ? " on" : ""), href: x.href, onclick: e => { e.preventDefault(); go(x); } },
      x.kind === "page" ? h("span", { class: "logo" }, "↗") : logo(x.t),
      h("span", { class: "search-nm" }, x.kind === "team" ? x.t.name : x.name),
      h("span", { class: "muted small" }, x.kind === "team" ? `${SPORTS[x.sport].name} team` : x.kind === "player" ? `${x.pos} · ${x.t.short} · ${SPORTS[x.sport].name}` : x.sub)))
      : [h("div", { class: "muted small" }, input.value.trim().length < 2 ? "Keep typing…" : "No matches.")]));
    const onKey = e => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown" && hits.length) { sel = (sel + 1) % hits.length; draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp" && hits.length) { sel = (sel - 1 + hits.length) % hits.length; draw(); e.preventDefault(); }
      else if (e.key === "Enter" && hits[sel]) go(hits[sel]);
    };
    const modal = h("div", { class: "search-modal", onclick: e => { if (e.target === modal) close(); } },
      h("div", { class: "search-box card" }, h("div", { class: "search-row" }, input, h("button", { class: "btn sm ghost", onclick: close }, "Close")), list));
    document.body.append(modal);
    document.addEventListener("keydown", onKey);
    input.focus();
    const ready = this.index();
    input.addEventListener("input", async () => { const idx = await ready; hits = this.find(idx, input.value); sel = 0; draw(); });
  },
};
(function searchButton() {
  const b = h("button", { class: "theme-btn search-btn", title: "Search (press /)", "aria-label": "Search", onclick: () => Search.open() }, "🔍", h("span", { class: "search-lbl" }, " Search"));
  $("#themeBtn").before(b);
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { e.preventDefault(); Search.open(); }
  });
})();

/* ---------- My Teams ---------- */
const MyTeams = {
  KEY: "bk-myteams",
  list() { try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); } catch { return []; } },
  has(sport, id) { return this.list().includes(`${sport}:${id}`); },
  toggle(sport, id) {
    const k = `${sport}:${id}`, l = this.list();
    const next = l.includes(k) ? l.filter(x => x !== k) : [...l, k];
    try { localStorage.setItem(this.KEY, JSON.stringify(next)); } catch {}
    return next.includes(k);
  },
  button(sport, t) {
    const b = h("button", { class: "fav-btn" });
    const draw = on => { b.textContent = on ? "★ My team" : "☆ Add to My Teams"; b.classList.toggle("on", on);
      b.title = on ? "Remove from My Teams" : "Show this team first on the home page (saved in this browser)"; };
    b.addEventListener("click", () => draw(this.toggle(sport, t.id)));
    draw(this.has(sport, t.id));
    return b;
  },
  /* home card: each favorite's last result and next game with the model's line */
  async homeCard() {
    const favs = this.list().map(k => k.split(":")).filter(([s]) => SPORTS[s]);
    if (!favs.length) return h("div", { class: "card mvm-strip fav-hint" },
      h("b", {}, "☆ My Teams"), h("span", { class: "muted" }, "Open any team's page and tap \"Add to My Teams\" to see its next game and model line right here."),
      h("button", { class: "btn sm ghost", onclick: () => Search.open() }, "Find a team"));
    const rows = await Promise.all(favs.map(async ([s, id]) => {
      const d = await sportData(s).catch(() => null);
      const t = d && d._byId[id]; if (!t) return null;
      const mine = g => g.home === id || g.away === id;
      const last = d.schedule.filter(g => mine(g) && g.state === "post" && g.hs != null).sort((a, b) => b.date.localeCompare(a.date))[0];
      const next = [...d.predictions, ...d.schedule].filter(g => mine(g) && g.state !== "post").sort((a, b) => a.date.localeCompare(b.date))[0];
      const pred = next && d.predictions.find(g => g.id === next.id);
      const opp = g => team(d, g.home === id ? g.away : g.home), at = g => g.neutral ? "vs" : g.home === id ? "vs" : "@";
      let lastTxt = null;
      if (last) { const us = last.home === id ? last.hs : last.as, them = last.home === id ? last.as : last.hs;
        lastTxt = h("span", { class: us > them ? "pos" : us < them ? "neg" : "" }, `${us > them ? "W" : us < them ? "L" : "T"} ${us}-${them} ${at(last)} ${opp(last).short}`); }
      let line = null;
      if (pred) { const m = pred.home === id ? pred.margin : -pred.margin, p = pred.home === id ? pred.pHome : 1 - pred.pHome;
        line = ["nhl", "mlb"].includes(s) ? `Model ${fmt.pct(p)} to win` : `Model ${m >= 0 ? "-" : "+"}${(Math.round(Math.abs(m) * 2) / 2).toFixed(1)} · ${fmt.pct(p)}`; }
      return h("a", { class: "fav-row", href: `#/${s}/team/${id}` },
        logo(t), h("div", { class: "fav-main" },
          h("div", {}, h("b", {}, t.short || t.name), h("span", { class: "chip league" }, SPORTS[s].name),
            isCollege(s) && t.ap ? h("span", { class: "muted small" }, ` AP #${t.ap}`) : null,
            h("span", { class: "muted small" }, ` ${s === "cfb" ? t.record || "" : fmt.rec(t)}`)),
          h("div", { class: "small muted" }, lastTxt ? ["Last: ", lastTxt] : "No games yet",
            next ? [" · Next: ", `${at(next)} ${opp(next).short}, ${fmt.date(next.date)} ${fmt.time(next.date)}`] : "")),
        line ? h("span", { class: "fav-line small" }, line) : null);
    }));
    return h("section", { class: "card fav-card" },
      h("div", { class: "card-head" }, h("h2", {}, "★ My Teams"), h("span", { class: "muted small" }, "Saved in this browser · star or unstar on any team page")),
      h("div", { class: "fav-grid" }, rows.filter(Boolean)));
  },
};

/* ---------- How it works ---------- */
const About = {
  view() {
    const sec = (title, ...kids) => h("section", { class: "card about" }, h("h2", {}, title), ...kids);
    const dl = items => h("dl", { class: "about-dl" }, items.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
    mount(
      h("h1", {}, "How it works"),
      h("p", { class: "lede" }, "Everything on this site in plain English: what our numbers mean, where they come from, and how Pick'em is scored."),
      h("div", { class: "grid g2" },
        sec("Power ratings",
          h("p", {}, "Every team gets a rating: how many points better or worse it is than an average team on a neutral field. Oregon State at +3.0 would be favored by 3 over an average FBS team; a team at -10 would be a 10-point underdog."),
          dl([["Rating", "Points better (+) or worse (-) than average. Hockey and baseball use goals and runs."],
              ["Power rank", "Where the rating ranks. This is our model, nothing else."],
              ["AP rank (college)", "The small number next to a team name is the real AP Top 25 poll, updated from ESPN. It's separate from our rank on purpose: the poll is voters' opinion, the rating is the scoreboard."],
              ["Injury / QB adjustment", "When a key player (like a starting QB) is out, the rating used for predictions and rank moves by our estimate of that player's value."]]),
          h("p", { class: "muted small" }, "Ratings are fit to every score this season, weighted toward recent games and started from last season's numbers, so they lean on last year early and on this year by midseason. They update after each game day.")),
        sec("Predictions",
          dl([["Model spread", "Rating gap plus home-field edge. \"ORST -3.5\" means we'd make Oregon State a 3.5-point favorite."],
              ["Win %", "How often the favorite wins a game with that spread, based on how much real scores vary around predictions."],
              ["DK line", "DraftKings' actual line, via ESPN. It moves; check the book."],
              ["Model vs Market", "Our running record against closing lines. Honest note: none of these models beats the closing line over the long run, so a big model-vs-book gap is usually our error, not a gift."]])),
        sec("Pick'em",
          dl([["Spread sports", "CFB, college hoops, NFL and NBA are picked against the DraftKings spread: +1 for a cover, -1 for a miss, 0 for a push."],
              ["Moneyline sports", "NHL and MLB are picked straight up at the moneyline. A win pays the odds (+150 pays +1.5, -150 pays +0.67); a loss is -1."],
              ["Locks", "Each pick locks at that game's start. Picks saved after kickoff don't count."],
              ["Leaderboard", "Ranked by units. The Beavs Model and Parker's Picks play too, so you can see who you're beating."]]),
          h("a", { class: "btn sm", href: "#/pickem" }, "Play Pick'em →")),
        sec("Parker's Picks & Top 25",
          dl([["Units", "How much Parker risks on a pick: 5U is his strongest play. Results assume -110 odds, so a 3U win pays +2.73U."],
              ["Season record", "Every week's picks graded at the line Parker took, added up."],
              ["Parker's Top 25", "His weekly college football ballot. \"Model\" shows where our ratings have each team."]])),
        sec("Data & updates",
          h("p", {}, "Scores, schedules, rosters, lines and the AP poll come from ESPN; NHL and MLB detail from the official league stats services; college football detail from CollegeFootballData. Data rebuilds a few times a day; live scores on the home page and Predictions refresh every minute."),
          h("p", { class: "muted small" }, "An independent fan project, not affiliated with Oregon State University or any league. For fun and analysis, not betting advice."))));
  },
};
