/* pickem.js — weekly pick'em against the DraftKings spread (CFB top games + every NFL game).
   Accounts and picks live in Supabase (email magic-link sign-in). Grading happens here in the browser
   from the site's own final scores: 1 point per cover, 0.5 per push, and any pick the server stamped
   after kickoff is void. "Beavs Model" plays too, picking the side our model prefers vs the line. */
const SUPA = { url: "https://uamgliqqkdgbozqyufvj.supabase.co", key: "sb_publishable_kBQ7ZvABLuoiuwDKuXcStQ_ndwXqGex" };
const Pickem = {};
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

// Called on every page load: finishes a magic-link sign-in and returns to the pick'em page.
async function finishSignIn() {
  const q = new URLSearchParams(location.search);
  if (!q.get("code")) return;
  const c = await sb();
  await c.auth.getSession();                                   // detectSessionInUrl exchanges the code
  history.replaceState(null, "", location.pathname + "#/pickem");
  route();
}

function slate(sport, d) {
  const T = d._byId;
  let games = d.predictions.filter(g => g.mkt && g.mkt.spread != null && T[g.home] && T[g.away] && g.state !== "post");
  if (!games.length) return { week: null, games: [] };
  const wk = Math.min(...games.map(g => g.week || 99));
  games = games.filter(g => (g.week || 99) === wk);
  if (sport === "cfb") {
    const rk = g => Math.min(T[g.home].rank || 200, T[g.away].rank || 200) + 0.35 * Math.max(T[g.home].rank || 200, T[g.away].rank || 200);
    const beavs = games.filter(g => [T[g.home].abbr, T[g.away].abbr].includes("ORST"));
    games = [...new Set([...beavs, ...games.sort((a, b) => rk(a) - rk(b)).slice(0, 10)])];
  }
  return { week: `${d.season || 2026}-w${wk}`, wk, games: games.sort((a, b) => a.date.localeCompare(b.date)) };
}

function grade(pick, g) {               // g: schedule row with final score
  if (!g || g.state !== "post" || g.hs == null || pick.line == null) return null;
  if (new Date(pick.updated_at) > new Date(g.date)) return "void";
  const res = (g.hs - g.as) + Number(pick.line);              // > 0: home covered
  if (res === 0) return "push";
  return (res > 0) === (pick.pick === g.home) ? "win" : "loss";
}

Pickem.view = async () => {
  const [cfb, nfl] = await Promise.all([sportData("cfb"), sportData("nfl")]);
  const D = { cfb, nfl };
  const c = await sb().catch(() => null);
  if (!c) return mount(h("div", { class: "card empty" }, "Couldn't load the pick'em service. Try again in a minute."));
  const { data: { session } } = await c.auth.getSession();
  const user = session?.user || null;
  let profile = null;
  if (user) profile = (await c.from("profiles").select("*").eq("id", user.id).maybeSingle()).data;

  let sport = "cfb", tab = "slate";
  const body = h("div");
  const S = { cfb: slate("cfb", cfb), nfl: slate("nfl", nfl) };

  async function loadPicks(filter) {
    let q = c.from("picks").select("user_id,game_id,sport,week,pick,line,updated_at").limit(10000);
    if (filter?.sport) q = q.eq("sport", filter.sport);
    if (filter?.week) q = q.eq("week", filter.week);
    if (filter?.user) q = q.eq("user_id", filter.user);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function drawSlate() {
    const s = S[sport];
    if (!s.games.length) { body.replaceChildren(h("div", { class: "card empty" }, `No ${SPORTS[sport].name} games with lines posted yet.`)); return; }
    const mine = user ? Object.fromEntries((await loadPicks({ user: user.id, week: s.week, sport })).map(p => [p.game_id, p])) : {};
    const card = g => {
      const H = team(D[sport], g.home), A = team(D[sport], g.away), sp = g.mkt.spread;
      const locked = new Date(g.date) <= new Date();
      const p = mine[g.id];
      const modelSide = g.margin + sp > 0 ? g.home : g.away;
      const btn = (t, line) => h("button", { class: "pk-btn" + (p?.pick === t.id ? " on" : ""), disabled: locked || !user || !profile,
        onclick: async () => {
          const { error } = await c.from("picks").upsert({ game_id: g.id, sport, week: s.week, pick: t.id, line: sp }, { onConflict: "user_id,game_id" });
          if (error) alert("Couldn't save that pick: " + error.message); else drawSlate();
        } }, logo(t), h("span", {}, t.short || t.name), h("b", {}, fmtSpread(line)));
      return h("div", { class: "pk-game" + (locked ? " locked" : "") },
        h("div", { class: "game-meta" }, h("span", {}, `${fmt.date(g.date)} · ${fmt.time(g.date)}`), h("span", {}, locked ? "🔒 Locked" : g.tv || "")),
        h("div", { class: "pk-row" }, btn(A, -sp), h("span", { class: "muted small" }, "@"), btn(H, sp)),
        h("div", { class: "pk-foot muted small" }, "Model likes ", h("b", {}, team(D[sport], modelSide).abbr), ` (model line ${fmt.sgn(-g.margin, 1)} ${H.abbr})`,
          p ? h("span", { class: "chip good", style: { marginLeft: "auto" } }, `Your pick: ${team(D[sport], p.pick).abbr}`) : null));
    };
    const n = Object.keys(mine).length;
    body.replaceChildren(
      h("p", { class: "muted" }, `${SPORTS[sport].full} · week ${s.wk} · ${s.games.length} games · pick each side against the DraftKings spread. ${user && profile ? `${n} of ${s.games.length} picked.` : ""}`),
      h("div", { class: "pk-grid" }, s.games.map(card)));
  }

  async function drawBoard() {
    body.replaceChildren(h("div", { class: "card empty" }, "Loading leaderboard…"));
    const [picks, profs] = await Promise.all([loadPicks({}), c.from("profiles").select("id,display_name").then(r => r.data || [])]);
    const name = Object.fromEntries(profs.map(p => [p.id, p.display_name]));
    const rowsFor = filter => {
      const agg = {};
      for (const p of picks) {
        if (filter && !filter(p)) continue;
        const g = (D[p.sport].schedule || []).find(x => x.id === p.game_id);
        const r = grade(p, g); if (!r || r === "void") continue;
        const a = agg[p.user_id] ||= { w: 0, l: 0, p: 0 };
        a[r === "win" ? "w" : r === "loss" ? "l" : "p"]++;
      }
      return Object.entries(agg).map(([u, a]) => ({ who: name[u] || "anonymous", ...a, pts: a.w + 0.5 * a.p, pct: a.w / Math.max(1, a.w + a.l) }));
    };
    // the model's record on every graded game anyone picked, from the closing-line ledger
    const modelRow = async filter => {
      const graded = new Set(picks.filter(p => !filter || filter(p)).map(p => p.game_id));
      let w = 0, l = 0, pu = 0;
      for (const sp of ["cfb", "nfl"]) {
        const L = await load(`ledger_${sp}`).catch(() => null);
        for (const [gid, e] of Object.entries(L?.games || {})) {
          if (!graded.has(gid) || e.hs == null || !e.close || e.close.spread == null) continue;
          const edge = e.model.margin + e.close.spread, res = (e.hs - e.as) + e.close.spread;
          if (res === 0) pu++; else if ((res > 0) === (edge > 0)) w++; else l++;
        }
      }
      return w + l + pu ? { who: "🦫 Beavs Model", w, l, p: pu, pts: w + 0.5 * pu, pct: w / Math.max(1, w + l), bot: true } : null;
    };
    const cols = [
      { k: "rank", label: "#", num: true, nosort: true, fmt: (r, i) => i + 1 },
      { k: "who", label: "Player", nosort: true, fmt: r => r.bot ? h("b", { class: "muted" }, r.who) : h("b", {}, r.who) },
      { k: "rec", label: "Record", nosort: true, fmt: r => `${r.w}-${r.l}${r.p ? "-" + r.p : ""}` },
      { k: "pct", label: "Cover %", num: true, fmt: r => fmt.pct(r.pct, 1) },
      { k: "pts", label: "Points", num: true, fmt: r => h("b", {}, fmt.n(r.pts, 1)) },
    ];
    const season = rowsFor(null), mr = await modelRow(null);
    if (mr) season.push(mr);
    const weeks = [...new Set(picks.map(p => `${p.sport}|${p.week}`))].sort().reverse();
    const weekBox = h("div");
    const drawWeek = key => {
      const [sp, wk] = key.split("|");
      const rows = rowsFor(p => p.sport === sp && p.week === wk);
      modelRow(p => p.sport === sp && p.week === wk).then(m => {
        if (m) rows.push(m);
        weekBox.replaceChildren(rows.length ? table(cols, rows, { sort: "pts" }) : h("div", { class: "empty" }, "No graded picks yet for that week."));
      });
    };
    body.replaceChildren(h("div", { class: "grid g2" },
      h("div", { class: "card tight" }, h("h2", {}, "Season leaderboard"), season.length ? table(cols, season, { sort: "pts" }) : h("div", { class: "empty" }, "No graded picks yet - results post the morning after games.")),
      h("div", { class: "card tight" }, h("div", { class: "card-head" }, h("h2", {}, "By week"),
        weeks.length ? h("select", { class: "in", onchange: e => drawWeek(e.target.value) }, weeks.map(k => { const [sp, wk] = k.split("|"); return h("option", { value: k }, `${SPORTS[sp].name} ${wk.replace(/^\d+-w/, "week ")}`); })) : null),
        weekBox)));
    if (weeks.length) drawWeek(weeks[0]);
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
  mount(
    h("div", { class: "card-head" }, h("div", {}, h("h1", {}, "Pick'em"), h("p", { class: "lede", style: { margin: 0 } }, "Pick against the DraftKings spread every week: the 10 biggest CFB games (plus the Beavs) and every NFL game. 1 point per cover, ½ per push, picks lock at kickoff. Can you beat the model?")),
      user ? h("div", { class: "small muted", style: { textAlign: "right" } }, profile ? h("b", {}, profile.display_name) : user.email, h("br"),
        h("a", { class: "link", href: "javascript:void 0", onclick: async () => { await c.auth.signOut(); Pickem.view(); } }, "Sign out")) : null),
    !user ? signIn() : !profile ? nameSetup() : null,
    h("div", { class: "toolbar", style: { marginTop: "12px" } },
      seg([["slate", "This week's picks"], ["board", "Leaderboard"]], tab, v => { tab = v; draw(); }),
      seg([["cfb", "CFB"], ["nfl", "NFL"]], sport, v => { sport = v; if (tab === "slate") draw(); })),
    body);
  draw();
};
