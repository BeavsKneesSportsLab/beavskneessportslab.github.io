/* pickem.js — pick'em for every sport: weekly CFB (10 biggest games + the Beavs) and NFL, daily NBA,
   NHL and MLB. Spread sports (CFB/NFL/NBA) are picked against the DraftKings spread; NHL/MLB are picked
   straight up at the DraftKings moneyline. Scored in units so sports compare fairly: spread +1 cover /
   -1 miss / 0 push; moneyline pays the odds picked at (+150 -> +1.5, -150 -> +0.67), a miss is -1.
   Accounts and picks live in Supabase (email magic link). Grading happens here from the site's final
   scores; a pick the server stamped after kickoff is void. "Beavs Model" plays too. */
const SUPA = { url: "https://uamgliqqkdgbozqyufvj.supabase.co", key: "sb_publishable_kBQ7ZvABLuoiuwDKuXcStQ_ndwXqGex" };
const Pickem = {};
const PK_SPORTS = ["cfb", "nfl", "nba", "nhl", "mlb"];
const DAILY = new Set(["nba", "nhl", "mlb"]);
const ML_SPORTS = new Set(["nhl", "mlb"]);
let _sb = null;

async function sb() {
  if (_sb) return _sb;
  if (!window.supabase) await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
    s.onload = res; s.onerror = rej; document.head.append(s);
  });
  // PKCE: the magic link comes back as ?code=... (the URL hash is the site's router)
  _sb = window.supabase.createClient(SUPA.url, SUPA.key, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } });
  return _sb;
}

// Called on page load: finishes a magic-link sign-in and returns to the pick'em page.
async function finishSignIn() {
  const q = new URLSearchParams(location.search);
  if (!q.get("code")) return;
  const c = await sb();
  await c.auth.getSession();                                   // detectSessionInUrl exchanges the code
  history.replaceState(null, "", location.pathname + "#/pickem");
  route();
}

const ptDay = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const mlPay = ml => ml == null ? null : ml > 0 ? ml / 100 : 100 / -ml;     // profit per unit risked

/* Slates. Weekly sports: the next week with lines. Daily sports: one slate per Pacific date. */
function slates(sport, d) {
  const T = d._byId;
  const ok = g => g.mkt && T[g.home] && T[g.away] && g.state !== "post" &&
    (ML_SPORTS.has(sport) ? g.mkt.mlH != null && g.mkt.mlA != null : g.mkt.spread != null);
  let games = d.predictions.filter(ok);
  if (!games.length) return [];
  if (DAILY.has(sport)) {
    const days = [...new Set(games.map(g => ptDay(g.date)))].sort();
    return days.map(day => ({ key: day, label: new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      games: games.filter(g => ptDay(g.date) === day).sort((a, b) => a.date.localeCompare(b.date)) }));
  }
  const wk = Math.min(...games.map(g => g.week || 99));
  games = games.filter(g => (g.week || 99) === wk);
  if (sport === "cfb") {
    const rk = g => Math.min(T[g.home].rank || 200, T[g.away].rank || 200) + 0.35 * Math.max(T[g.home].rank || 200, T[g.away].rank || 200);
    const beavs = games.filter(g => [T[g.home].abbr, T[g.away].abbr].includes("ORST"));
    games = [...new Set([...beavs, ...games.sort((a, b) => rk(a) - rk(b)).slice(0, 10)])];
  }
  return [{ key: `${d.season || 2026}-w${wk}`, label: `Week ${wk}`, games: games.sort((a, b) => a.date.localeCompare(b.date)) }];
}

/* -> {res: win|loss|push|void, units} or null if not final. pick.line = home spread (spread sports)
   or the moneyline of the side picked (NHL/MLB). */
function grade(pick, g) {
  if (!g || g.state !== "post" || g.hs == null || pick.line == null) return null;
  if (new Date(pick.updated_at) > new Date(g.date)) return { res: "void", units: 0 };
  if (ML_SPORTS.has(pick.sport)) {
    const won = (g.hs > g.as) === (pick.pick === g.home);
    return won ? { res: "win", units: mlPay(Number(pick.line)) } : { res: "loss", units: -1 };
  }
  const r = (g.hs - g.as) + Number(pick.line);                // > 0: home covered
  if (r === 0) return { res: "push", units: 0 };
  return (r > 0) === (pick.pick === g.home) ? { res: "win", units: 1 } : { res: "loss", units: -1 };
}

Pickem.view = async () => {
  const D = Object.fromEntries(await Promise.all(PK_SPORTS.map(async s => [s, await sportData(s)])));
  const c = await sb().catch(() => null);
  if (!c) return mount(h("div", { class: "card empty" }, "Couldn't load the pick'em service. Try again in a minute."));
  const { data: { session } } = await c.auth.getSession();
  const user = session?.user || null;
  let profile = null;
  if (user) profile = (await c.from("profiles").select("*").eq("id", user.id).maybeSingle()).data;

  const S = Object.fromEntries(PK_SPORTS.map(s => [s, slates(s, D[s])]));
  let sport = PK_SPORTS.find(s => S[s].length) || "cfb", tab = "slate", slateKey = S[sport][0]?.key;
  const body = h("div");
  const sportSeg = h("div");

  async function loadPicks(filter) {
    let q = c.from("picks").select("user_id,game_id,sport,week,pick,line,updated_at").limit(20000);
    if (filter?.sport) q = q.eq("sport", filter.sport);
    if (filter?.week) q = q.eq("week", filter.week);
    if (filter?.user) q = q.eq("user_id", filter.user);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function drawSlate() {
    const list = S[sport], s = list.find(x => x.key === slateKey) || list[0];
    if (!s) { body.replaceChildren(h("div", { class: "card empty" }, `No ${SPORTS[sport].name} games with lines posted yet - books post them about a day out.`)); return; }
    const mine = user ? Object.fromEntries((await loadPicks({ user: user.id, week: s.key, sport })).map(p => [p.game_id, p])) : {};
    const isML = ML_SPORTS.has(sport), d = D[sport];
    const card = g => {
      const H = team(d, g.home), A = team(d, g.away), m = g.mkt;
      const locked = new Date(g.date) <= new Date();
      const p = mine[g.id];
      // model's side: vs the spread for spread sports; for ML sports, the side the model prices better than the book
      const bookP = noVigHome(m);
      const modelSide = isML ? (bookP != null && g.pHome > bookP ? g.home : g.away) : (g.margin + m.spread > 0 ? g.home : g.away);
      const save = async (t, line) => {
        const { error } = await c.from("picks").upsert({ game_id: g.id, sport, week: s.key, pick: t.id, line }, { onConflict: "user_id,game_id" });
        if (error) alert("Couldn't save that pick: " + error.message); else drawSlate();
      };
      const btn = (t, shown, line) => h("button", { class: "pk-btn" + (p?.pick === t.id ? " on" : ""), disabled: locked || !user || !profile, onclick: () => save(t, line) },
        logo(t), h("span", {}, t.short || t.name), h("b", {}, shown));
      const away = isML ? btn(A, fmtML(m.mlA), m.mlA) : btn(A, fmtSpread(-m.spread), m.spread);
      const home = isML ? btn(H, fmtML(m.mlH), m.mlH) : btn(H, fmtSpread(m.spread), m.spread);
      return h("div", { class: "pk-game" + (locked ? " locked" : "") },
        h("div", { class: "game-meta" }, h("span", {}, `${fmt.date(g.date)} · ${fmt.time(g.date)}`), h("span", {}, locked ? "🔒 Locked" : (g.tv || "").split(",")[0])),
        h("div", { class: "pk-row" }, away, h("span", { class: "muted small" }, "@"), home),
        h("div", { class: "pk-foot muted small" }, "Model likes ", h("b", {}, team(d, modelSide).abbr),
          isML ? ` (model ${fmt.pct(modelSide === g.home ? g.pHome : 1 - g.pHome)} vs book ${bookP == null ? "–" : fmt.pct(modelSide === g.home ? bookP : 1 - bookP)})`
               : ` (model line ${fmt.sgn(-g.margin, 1)} ${H.abbr})`,
          p ? h("span", { class: "chip good", style: { marginLeft: "auto" } }, `Your pick: ${team(d, p.pick).abbr}`) : null));
    };
    const n = Object.keys(mine).length;
    body.replaceChildren(
      list.length > 1 ? h("div", { class: "toolbar" }, seg(list.map(x => [x.key, x.label]), s.key, v => { slateKey = v; drawSlate(); })) : null,
      h("p", { class: "muted" }, `${SPORTS[sport].full} · ${s.label} · ${s.games.length} games · ${isML ? "pick the winner at the DraftKings moneyline" : "pick each side against the DraftKings spread"}. ${user && profile ? `${n} of ${s.games.length} picked.` : ""}`),
      h("div", { class: "pk-grid" }, s.games.map(card)));
  }

  async function drawBoard() {
    body.replaceChildren(h("div", { class: "card empty" }, "Loading leaderboard…"));
    const [picks, profs] = await Promise.all([loadPicks({}), c.from("profiles").select("id,display_name").then(r => r.data || [])]);
    const name = Object.fromEntries(profs.map(p => [p.id, p.display_name]));
    const ledgers = Object.fromEntries(await Promise.all(PK_SPORTS.map(async s => [s, await load(`ledger_${s}`).catch(() => null)])));
    const sched = Object.fromEntries(PK_SPORTS.map(s => [s, Object.fromEntries((D[s].schedule || []).map(g => [g.id, g]))]));
    const rowsFor = filter => {
      const agg = {};
      for (const p of picks) {
        if (filter && !filter(p)) continue;
        const r = grade(p, sched[p.sport]?.[p.game_id]); if (!r || r.res === "void") continue;
        const a = agg[p.user_id] ||= { w: 0, l: 0, p: 0, u: 0 };
        a[r.res === "win" ? "w" : r.res === "loss" ? "l" : "p"]++; a.u += r.units;
      }
      return Object.entries(agg).map(([u, a]) => ({ who: name[u] || "anonymous", ...a, pct: a.w / Math.max(1, a.w + a.l) }));
    };
    // the model on every graded game anyone picked, at the closing line
    const modelRow = filter => {
      const games = {};
      for (const p of picks) if (!filter || filter(p)) games[p.game_id] = p.sport;
      const a = { w: 0, l: 0, p: 0, u: 0 };
      for (const [gid, sp] of Object.entries(games)) {
        const e = ledgers[sp]?.games?.[gid];
        if (!e || e.hs == null || !e.close || !e.model) continue;
        if (ML_SPORTS.has(sp)) {
          const q = noVigHome(e.close); if (q == null) continue;
          const home = e.model.pHome > q, won = (e.hs > e.as) === home;
          const ml = home ? e.close.mlH : e.close.mlA;
          if (won) { a.w++; a.u += mlPay(ml); } else { a.l++; a.u -= 1; }
        } else {
          if (e.close.spread == null) continue;
          const edge = e.model.margin + e.close.spread, res = (e.hs - e.as) + e.close.spread;
          if (res === 0) a.p++; else if ((res > 0) === (edge > 0)) { a.w++; a.u += 1; } else { a.l++; a.u -= 1; }
        }
      }
      return a.w + a.l + a.p ? { who: "🦫 Beavs Model", ...a, pct: a.w / Math.max(1, a.w + a.l), bot: true } : null;
    };
    const cols = [
      { k: "rank", label: "#", num: true, nosort: true, fmt: (r, i) => i + 1 },
      { k: "who", label: "Player", nosort: true, fmt: r => r.bot ? h("b", { class: "muted" }, r.who) : h("b", {}, r.who) },
      { k: "rec", label: "Record", nosort: true, fmt: r => `${r.w}-${r.l}${r.p ? "-" + r.p : ""}` },
      { k: "pct", label: "Win %", num: true, fmt: r => fmt.pct(r.pct, 1) },
      { k: "u", label: "Units", num: true, fmt: r => h("b", { class: r.u >= 0 ? "pos" : "neg" }, fmt.sgn(r.u, 2)) },
    ];
    const withModel = (rows, f) => { const m = modelRow(f); if (m) rows.push(m); return rows; };
    let boardSport = "all";
    const seasonBox = h("div"), periodBox = h("div"), periodSel = h("div");
    const drawSeason = () => {
      const f = boardSport === "all" ? null : p => p.sport === boardSport;
      const rows = withModel(rowsFor(f), f);
      seasonBox.replaceChildren(rows.length ? table(cols, rows, { sort: "u" }) : h("div", { class: "empty" }, "No graded picks yet - results post the morning after games."));
      const keys = [...new Set(picks.filter(p => !f || f(p)).map(p => `${p.sport}|${p.week}`))].sort((a, b) => b.split("|")[1].localeCompare(a.split("|")[1]));
      const label = k => { const [sp, wk] = k.split("|"); return `${SPORTS[sp].name} ${/w\d+$/.test(wk) ? "week " + wk.split("w")[1] : new Date(wk + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`; };
      const drawPeriod = k => { const [sp, wk] = k.split("|"); const f2 = p => p.sport === sp && p.week === wk;
        const r2 = withModel(rowsFor(f2), f2);
        periodBox.replaceChildren(r2.length ? table(cols, r2, { sort: "u" }) : h("div", { class: "empty" }, "Nothing graded yet for that slate.")); };
      periodSel.replaceChildren(keys.length ? h("select", { class: "in", onchange: e => drawPeriod(e.target.value) }, keys.map(k => h("option", { value: k }, label(k)))) : "");
      if (keys.length) drawPeriod(keys[0]); else periodBox.replaceChildren(h("div", { class: "empty" }, "No slates played yet."));
    };
    body.replaceChildren(
      h("div", { class: "toolbar" }, seg([["all", "All sports"], ...PK_SPORTS.map(s => [s, SPORTS[s].name])], boardSport, v => { boardSport = v; drawSeason(); })),
      h("div", { class: "grid g2" },
        h("div", { class: "card tight" }, h("h2", {}, "Season leaderboard"), seasonBox),
        h("div", { class: "card tight" }, h("div", { class: "card-head" }, h("h2", {}, "By slate"), periodSel), periodBox)));
    drawSeason();
  }

  const signIn = () => {
    const email = h("input", { class: "in", type: "email", placeholder: "you@example.com", style: { minWidth: "240px" } });
    const msg = h("span", { class: "muted small" });
    return h("div", { class: "card pk-auth" }, h("h2", {}, "Sign in to play"),
      h("p", { class: "muted" }, "Enter your email and we'll send a one-click sign-in link. No password. Open the link in this same browser."),
      h("div", { class: "toolbar" }, email, h("button", { class: "btn", onclick: async () => {
        if (!/^\S+@\S+\.\S+$/.test(email.value)) { msg.textContent = "Enter a valid email."; return; }
        msg.textContent = "Sending…";
        const { error } = await c.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
        msg.textContent = error ? `Couldn't send: ${error.message}` : "Check your email for the sign-in link.";
      } }, "Email me a link"), msg));
  };
  const nameSetup = () => {
    const nm = h("input", { class: "in", placeholder: "Display name (2-24 chars)", maxlength: 24 });
    const msg = h("span", { class: "muted small" });
    return h("div", { class: "card pk-auth" }, h("h2", {}, "Pick a display name"), h("p", { class: "muted" }, "This is what shows on the leaderboard."),
      h("div", { class: "toolbar" }, nm, h("button", { class: "btn", onclick: async () => {
        const v = nm.value.trim();
        if (v.length < 2) { msg.textContent = "At least 2 characters."; return; }
        const { error } = await c.from("profiles").upsert({ id: user.id, display_name: v });
        if (error) msg.textContent = error.code === "23505" ? "That name's taken." : error.message; else Pickem.view();
      } }, "Save"), msg));
  };

  const draw = () => (tab === "slate" ? drawSlate() : drawBoard()).catch(e => body.replaceChildren(errorBox(e)));
  const drawSportSeg = () => sportSeg.replaceChildren(tab === "slate" ? seg(PK_SPORTS.map(s => [s, `${SPORTS[s].name}${S[s].length ? "" : " ·"}`]), sport,
    v => { sport = v; slateKey = S[v][0]?.key; draw(); }) : "");
  mount(
    h("div", { class: "card-head" }, h("div", {}, h("h1", {}, "Pick'em"), h("p", { class: "lede", style: { margin: 0 } },
      "Weekly CFB (the 10 biggest games + the Beavs) and NFL against the spread; daily NBA against the spread; daily NHL and MLB straight up at the moneyline. Scored in units: +1 per cover, -1 per miss; moneyline wins pay the odds (+150 = +1.5). Picks lock at kickoff. Can you beat the model?")),
      user ? h("div", { class: "small muted", style: { textAlign: "right" } }, profile ? h("b", {}, profile.display_name) : user.email, h("br"),
        h("a", { class: "link", href: "javascript:void 0", onclick: async () => { await c.auth.signOut(); Pickem.view(); } }, "Sign out")) : null),
    !user ? signIn() : !profile ? nameSetup() : null,
    h("div", { class: "toolbar", style: { marginTop: "12px" } },
      seg([["slate", "Make picks"], ["board", "Leaderboard"]], tab, v => { tab = v; drawSportSeg(); draw(); }), sportSeg),
    body);
  drawSportSeg();
  draw();
};
