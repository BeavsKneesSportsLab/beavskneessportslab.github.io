/* yak.js — YAK's Sharp Picks + YAK's Lottos: today's locked card and the running tracker. Data: data/yak_picks.json
   (built in the cloud by build/yak_picks.py; picks lock once a day and are graded at the price taken). */
const Yak = {};
Yak.view = async () => {
  const d = await load("yak_picks").catch(() => null);
  if (!d || !Object.keys(d.cards || {}).length)
    return mount(h("h1", {}, "YAK's Sharp Picks"), h("div", { class: "card empty" }, "The first card locks at the next morning build. Check back soon."));
  const days = Object.keys(d.cards).sort().reverse();
  // logos: picks carry team / fighter ids (older ones are looked up in each sport's games by game id)
  const sports = [...new Set(Object.values(d.cards).flatMap(c => c.sharp.concat(c.lotto).map(p => p.sport)))];
  const SD = {}, UFCD = sports.includes("ufc") ? await load("ufc").catch(() => null) : null;
  await Promise.all(sports.filter(x => x !== "ufc").map(async x => { SD[x] = await sportData(x).catch(() => null); }));
  const sides = p => {
    if (p.sport === "ufc") {
      const f = UFCD && (UFCD.upcoming.concat(UFCD.recent).flatMap(e => e.fights).find(x => x.id === p.gid));
      const A = UFCD?.fighters[p.awayId || f?.a] || {}, H = UFCD?.fighters[p.homeId || f?.b] || {};
      return { A: { img: A.img, name: p.away, round: true }, H: { img: H.img, name: p.home, round: true } };
    }
    const sd = SD[p.sport];
    let aId = p.awayId, hId = p.homeId;
    if (sd && !hId) { const g = sd.predictions.concat(sd.schedule || [], sd.recent || []).find(x => x.id === p.gid); if (g) { aId = g.away; hId = g.home; } }
    const A = sd && aId ? team(sd, aId) : {}, H = sd && hId ? team(sd, hId) : {};
    return { A: { img: A.logo, name: p.away, color: A.color }, H: { img: H.logo, name: p.home, color: H.color } };
  };
  const pic = (x, size, cls = "") => x?.img ? h("img", { class: "yak-logo " + cls + (x.round ? " round" : ""), src: x.img, alt: "", loading: "lazy", style: { width: size + "px", height: size + "px" } })
                                           : h("span", { class: "yak-logo ph " + cls, style: { width: size + "px", height: size + "px" } }, (x?.name || "?").split(" ").map(w => w[0]).slice(0, 2).join(""));
  /* ---- live scores (ESPN, in the browser): team sports via the homepage's liveScores(), UFC per fight ---- */
  let live = {};
  const liveKey = p => `${p.sport}|${p.gid}`;
  const ufcLive = async ps => {
    const out = {}, days = [...new Set(ps.map(p => new Date(p.date).toLocaleDateString("en-CA", { timeZone: "America/New_York" }).replace(/-/g, "")))];
    await Promise.all(days.map(async day => {
      try {
        const j = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${day}`)).json();
        for (const e of j.events || []) for (const c of e.competitions || []) {
          const st = c.status?.type || {}, cs = (c.competitors || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
          out[c.id] = { state: st.state, detail: st.shortDetail || st.detail, ids: cs.map(x => String(x.id)), winner: cs.findIndex(x => x.winner) };
        }
      } catch { /* keep the locked view */ }
    }));
    return out;
  };
  const refreshLive = async () => {
    const c = d.cards[day];
    const ps = c ? c.sharp.concat(c.lotto).filter(p => !p.result && new Date(p.date) <= Date.now() + 15 * 6e4) : [];
    if (!ps.length) return false;
    const team = ps.filter(p => p.sport !== "ufc"), ufc = ps.filter(p => p.sport === "ufc");
    const [a, b] = await Promise.all([team.length ? liveScores(team.map(p => ({ sport: p.sport, id: p.gid, date: p.date }))) : {}, ufc.length ? ufcLive(ufc) : {}]);
    const next = {};
    for (const p of team) if (a[p.gid]) next[liveKey(p)] = a[p.gid];
    for (const p of ufc) if (b[p.gid]) next[liveKey(p)] = b[p.gid];
    live = next;
    return ps.some(p => (next[liveKey(p)] || {}).state === "in" || new Date(p.date) > Date.now());
  };
  /* where the pick stands right now: score, and whether it's covering / leading / on pace */
  const liveInfo = p => {
    const L = live[liveKey(p)];
    if (!L || L.state === "pre") return null;
    const fin = L.state === "post";
    if (p.sport === "ufc") {
      if (!fin) return { text: `🔴 ${L.detail || "Live"}`, cls: "warn" };
      if (L.winner < 0) return { text: `Final · ${L.detail || ""}`, cls: "" };
      const ourIdx = p.side === "away" ? 0 : 1;           // fighter a = first listed = our "away"
      const won = L.winner === ourIdx;
      return { text: `Final · ${won ? "won" : "lost"} (grading at next update)`, cls: won ? "good" : "bad", res: won ? "W" : "L" };
    }
    const hs = +L.hs, as = +L.as;
    if (isNaN(hs) || isNaN(as)) return null;
    const score = `${p.away} ${as} - ${p.home} ${hs}`;
    let edge, label;
    if (p.market === "total") {
      const t = hs + as; edge = (t - p.line) * (p.side === "over" ? 1 : -1);
      label = fin ? `${t} total` : `${t} so far, line ${p.line}`;
    } else {
      const m = p.side === "home" ? hs - as : as - hs;
      edge = p.market === "spread" ? m + p.line : m;
      const who = p.side === "home" ? p.home : p.away;
      label = p.market === "spread" ? `${who} ${edge > 0 ? "covering" : edge < 0 ? "not covering" : "on the number"}${edge ? ` by ${Math.abs(edge)}` : ""}`
                                    : `${who} ${m > 0 ? "leading" : m < 0 ? "trailing" : "tied"}`;
    }
    if (fin) {
      const res = edge > 0 ? "W" : edge < 0 ? "L" : "P";
      return { text: `Final: ${score} · ${res === "W" ? "won" : res === "L" ? "lost" : "push"} (grading at next update)`, cls: res === "W" ? "good" : res === "L" ? "bad" : "", res };
    }
    return { text: `🔴 ${L.detail} · ${score} · ${label}`, cls: p.market === "total" && !fin ? "" : edge > 0 ? "good" : edge < 0 ? "bad" : "" };
  };
  const liveRow = p => { const i = liveInfo(p); return i ? h("div", { class: `yak-live ${i.cls}` }, i.text) : null; };
  const status = p => {
    if (p.result) return null;
    const li = liveInfo(p);
    if (li?.res) return h("span", { class: `chip ${li.res === "W" ? "good" : li.res === "L" ? "bad" : ""}` }, li.res === "W" ? "Won*" : li.res === "L" ? "Lost*" : "Push*");
    if (li) return h("span", { class: "chip warn" }, h("span", { class: "live-dot" }), "Live");
    const ms = new Date(p.date) - Date.now();
    if (ms <= 0) return h("span", { class: "chip warn" }, h("span", { class: "live-dot" }), "In progress");
    const hr = Math.floor(ms / 36e5), mn = Math.round((ms % 36e5) / 6e4);
    return h("span", { class: "chip" }, hr >= 20 ? fmt.time(p.date) : `Starts in ${hr ? hr + "h " : ""}${mn}m`);
  };
  let day = days[0], view = "card";
  const body = h("div");
  const SP = { nfl: "NFL", nba: "NBA", nhl: "NHL", mlb: "MLB", cfb: "CFB", cbb: "CBB", ufc: "UFC" };
  const resChip = p => p.result ? h("span", { class: `chip ${p.result === "W" ? "good" : p.result === "L" ? "bad" : ""}` },
      `${p.result === "W" ? "Won" : p.result === "L" ? "Lost" : "Push"} ${fmt.sgn(p.profit, 2)}u`) : null;   // ungraded picks show status() instead
  const hero = (p, s) => p.market === "total"
    ? h("div", { class: "yak-pair" }, pic(s.A, 30, "a"), pic(s.H, 30, "b"))
    : pic(p.side === "home" ? s.H : s.A, 44);
  const pickRow = (p, lotto) => {
    const s = sides(p), mine = p.market === "total" ? null : (p.side === "home" ? s.H : s.A);
    return h("div", { class: "yak-pick" + (lotto ? " lotto" : "") + (p.result ? ` r-${p.result}` : ""),
                      style: mine?.color ? `--team:${mine.color}` : null },
      h("div", { class: "yak-u" + (lotto ? " l" : ` u${p.units}`) }, lotto ? "¼U" : `${p.units}U`),
      hero(p, s),
      h("div", { class: "yak-main" },
        h("div", { class: "yak-top" },
          h("span", { class: "chip league" }, SP[p.sport] || p.sport),
          h("b", { class: "yak-name" }, p.pick), h("span", { class: "mono yak-odds" }, fmtML(p.odds)), resChip(p), status(p),
          p.early ? h("span", { class: "chip", title: `Early tip: locked as an official play at ${fmt.time(p.lockedAt)}, before the 1 PM card` }, "⏰ Early lock") : null),
        h("div", { class: "small muted yak-game" }, pic(s.A, 16), ` ${p.away} ${p.sport === "ufc" ? "vs" : "@"} `, pic(s.H, 16), ` ${p.home} · ${fmt.date(p.date)} ${fmt.time(p.date)}`,
          p.final ? ` · Final: ${p.final}` : "", p.clv != null ? ` · CLV ${fmt.sgn(p.clv, 1)}${p.market === "ml" ? " pts" : ""}` : ""),
        liveRow(p),
        h("div", { class: "small yak-why" }, p.why.join(" · "))));
  };
  const spotlight = p => {
    const s = sides(p), mine = p.market === "total" ? null : (p.side === "home" ? s.H : s.A);
    return h("div", { class: "yak-spot", style: mine?.color ? `--team:${mine.color}` : null },
      h("div", { class: "yak-spot-tag" }, "⭐ YAK's Top Play · 5U"),
      h("div", { class: "yak-spot-row" },
        p.market === "total" ? h("div", { class: "yak-pair big" }, pic(s.A, 54, "a"), pic(s.H, 54, "b")) : pic(mine, 72),
        h("div", { style: { minWidth: 0 } },
          h("div", { class: "yak-spot-pick" }, p.pick, h("span", { class: "mono" }, ` ${fmtML(p.odds)}`)),
          h("div", { class: "small muted" }, `${p.away} ${p.sport === "ufc" ? "vs" : "@"} ${p.home} · ${SP[p.sport]} · ${fmt.date(p.date)} ${fmt.time(p.date)}`),
          h("div", { style: { marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" } }, resChip(p), status(p)), liveRow(p))),
      h("div", { class: "small yak-why", style: { marginTop: "8px" } }, p.why.join(" · ")));
  };
  const stats = ps => {
    const g = ps.filter(p => p.result);
    const w = g.filter(p => p.result === "W").length, l = g.filter(p => p.result === "L").length, pu = g.filter(p => p.result === "P").length;
    const risk = g.reduce((s, p) => s + p.units, 0), prof = g.reduce((s, p) => s + p.profit, 0);
    const clv = g.filter(p => p.clv != null && p.market !== "ml");
    return { w, l, pu, risk, prof, roi: risk ? prof / risk : null, n: g.length, pend: ps.length - g.length,
             clv: clv.length ? clv.reduce((s, p) => s + p.clv, 0) / clv.length : null, clvN: clv.length };
  };
  const all = k => days.flatMap(dd => d.cards[dd][k].map(p => ({ ...p, day: dd })));
  const kpis = (s, label) => h("div", { class: "kpis", style: { marginTop: 0 } },
    h("div", { class: "kpi" }, h("span", {}, `${label} record`), h("b", {}, `${s.w}-${s.l}${s.pu ? "-" + s.pu : ""}`)),
    h("div", { class: "kpi" }, h("span", {}, "Units"), h("b", { class: s.prof >= 0 ? "pos" : "neg" }, `${fmt.sgn(s.prof, 2)}u`)),
    h("div", { class: "kpi" }, h("span", {}, "ROI"), h("b", { class: (s.roi || 0) >= 0 ? "pos" : "neg" }, s.roi == null ? "–" : fmt.sgn(100 * s.roi, 1) + "%")),
    h("div", { class: "kpi", title: "Average points better (+) or worse than the closing spread/total; the earliest sign of real edge" }, h("span", {}, "Avg CLV (spr/tot)"),
      h("b", { class: (s.clv || 0) >= 0 ? "pos" : "neg" }, s.clv == null ? "–" : `${fmt.sgn(s.clv, 2)} pts`)),
    h("div", { class: "kpi" }, h("span", {}, "Pending"), h("b", {}, s.pend)));
  const curve = ps => {
    const g = ps.filter(p => p.result).sort((a, b) => a.date.localeCompare(b.date));
    if (g.length < 2) return null;
    let c = 0; const pts = g.map(p => (c += p.profit));
    const W = 600, H = 120, lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), sp = hi - lo || 1;
    const X = i => 6 + i * (W - 12) / (pts.length - 1), Y = v => H - 6 - (v - lo) * (H - 12) / sp;
    return h("div", { html: `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:8px" role="img" aria-label="Cumulative units">
      <line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)" stroke-dasharray="4 4"/>
      <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${pts.map((v, i) => `${X(i)},${Y(v)}`).join(" ")}"/></svg>` });
  };
  const breakdown = (ps, key, label, order) => {
    const groups = {};
    for (const p of ps.filter(p => p.result)) (groups[key(p)] ||= []).push(p);
    const rows = Object.entries(groups).map(([k, g]) => ({ k, ...stats(g) })).sort((a, b) => order ? order(a.k, b.k) : b.risk - a.risk);
    return rows.length ? table([
      { k: "k", label, nosort: true },
      { k: "rec", label: "Record", nosort: true, fmt: r => `${r.w}-${r.l}${r.pu ? "-" + r.pu : ""}` },
      { k: "prof", label: "Units", num: true, fmt: r => h("span", { class: r.prof >= 0 ? "pos" : "neg" }, fmt.sgn(r.prof, 2)) },
      { k: "roi", label: "ROI", num: true, fmt: r => r.roi == null ? "–" : fmt.sgn(100 * r.roi, 1) + "%" },
    ], rows, {}) : h("div", { class: "muted small" }, "Nothing graded yet.");
  };
  const draw = () => {
    if (view === "card") {
      const c = d.cards[day], leaning = c.status === "leans", LN = (leaning && c.leans) || { sharp: [], lotto: [] };
      const risk = c.sharp.reduce((s, p) => s + p.units, 0);
      const ds = stats(c.sharp), dl = stats(c.lotto), at = stats(all("sharp").concat(all("lotto")));
      const best = c.sharp.find(p => p.units === 5);
      const leanRow = (p, lotto) => { const r = pickRow({ ...p, result: null }, lotto); r.classList.add("lean"); return r; };
      const leansCard = leaning ? h("div", { class: "card yak-leans" },
        h("div", { class: "card-head" }, h("h2", {}, "👀 Leans"), h("span", { class: "muted small" }, `Unofficial · refreshes every update until 1 PM PT · not tracked`)),
        h("p", { class: "small muted", style: { margin: "0 0 8px" } }, "Where the money looks right now. Splits are thin early in the day, so these move. Units shown are where each play would land if the card published now. ",
          "A lean on a game that tips before 1 PM locks as an official 3U play about an hour before tip."),
        LN.sharp.length ? LN.sharp.map(p => leanRow(p, false)) : h("div", { class: "muted" }, "Nothing qualifies yet."),
        LN.lotto.length ? h("h3", { style: { marginTop: "12px" } }, "🎟️ Lotto leans") : null,
        LN.lotto.map(p => leanRow(p, true))) : null;
      let streak = 0, st = null;
      for (const p of all("sharp").filter(p => p.result && p.result !== "P").sort((a, b) => b.date.localeCompare(a.date))) {
        if (st === null) st = p.result; if (p.result !== st) break; streak++;
      }
      const tile = (lab, val, cls) => h("div", { class: "yak-tile" }, h("span", {}, lab), h("b", { class: cls || "" }, val));
      body.replaceChildren(...[
        h("div", { class: "toolbar" }, h("select", { class: "in", onchange: e => { day = e.target.value; draw(); } },
          days.map(x => h("option", { value: x, selected: x === day }, new Date(x + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })))),
          h("span", { class: "muted small" }, leaning ? `Leans updated ${fmt.time(c.leans?.updatedAt)} · official card publishes at 1 PM PT`
            : `${c.status ? "Official card published" : "Locked"} ${fmt.time(c.lockedAt)} · prices are what was available at lock`)),
        h("div", { class: "yak-hero" },
          tile("Today's plays", `${c.sharp.length} + ${c.lotto.length} 🎟️`),
          tile("Units risked", `${risk + c.lotto.length * 0.25}U`),
          tile("Today so far", ds.n + dl.n ? `${ds.w + dl.w}-${ds.l + dl.l}${ds.pu + dl.pu ? "-" + (ds.pu + dl.pu) : ""}` : "–"),
          tile("Today's units", ds.n + dl.n ? `${fmt.sgn(ds.prof + dl.prof, 2)}u` : "–", ds.prof + dl.prof > 0 ? "pos" : ds.prof + dl.prof < 0 ? "neg" : ""),
          tile("All-time", at.n ? `${fmt.sgn(at.prof, 2)}u` : "–", at.prof > 0 ? "pos" : at.prof < 0 ? "neg" : ""),
          tile("Sharp streak", streak ? `${st === "W" ? "🔥" : "🧊"} ${streak}${st}` : "–")),
        best ? spotlight(best) : null,
        leaning && !c.sharp.length && !c.lotto.length ? null : h("div", { class: "card", style: leaning ? { marginBottom: "16px" } : null },
          h("div", { class: "card-head" }, h("h2", {}, leaning ? "⏰ Official early plays" : "🔪 YAK's Sharp Picks"), h("span", { class: "muted small" }, `${c.sharp.length} plays · ${risk}U risked`)),
          c.sharp.length ? c.sharp.filter(p => p !== best).map(p => pickRow(p, false)) : h("div", { class: "muted" }, leaning ? "No early sharp plays." : "No sharp plays qualified today."),
          leaning && c.lotto.length ? c.lotto.map(p => pickRow(p, true)) : null),
        leansCard,
        leaning ? null : h("div", { class: "card", style: { marginTop: "16px" } },
          h("div", { class: "card-head" }, h("h2", {}, "🎟️ YAK's Lottos"), h("span", { class: "muted small" }, `${c.lotto.length} plays · ${fmt.n(c.lotto.length * 0.25, 2)}U risked · +750 to +4000`)),
          c.lotto.length ? c.lotto.map(p => pickRow(p, true)) : h("div", { class: "muted" }, "No long shot priced as +EV today, so none were forced."))].filter(Boolean));
    } else {
      const S = all("sharp"), L = all("lotto");
      const byDay = Object.entries(days.reduce((m, dd) => (m[dd] = stats(d.cards[dd].sharp.concat(d.cards[dd].lotto)), m), {}))
        .map(([k, s]) => ({ k, ...s, sh: stats(d.cards[k].sharp), lo: stats(d.cards[k].lotto) }));
      body.replaceChildren(
        h("div", { class: "card" }, h("h2", {}, "🔪 Sharp Picks tracker"), kpis(stats(S), "Sharp"), curve(S),
          h("div", { class: "grid g2", style: { marginTop: "12px" } },
            h("div", {}, h("h3", {}, "By unit tier"), breakdown(S, p => `${p.units}U`, "Tier", (a, b) => parseInt(b) - parseInt(a))),
            h("div", {}, h("h3", {}, "By sport / market"), breakdown(S, p => `${SP[p.sport]} ${p.market === "ml" ? "ML" : p.market === "spread" ? "spread" : "total"}`, "Bucket")))),
        h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, "🎟️ Lottos tracker"), kpis(stats(L), "Lotto"), curve(L),
          h("div", { style: { marginTop: "12px" } }, h("h3", {}, "By sport"), breakdown(L, p => SP[p.sport], "Sport"))),
        h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "Daily log"),
          table([
            { k: "k", label: "Date", asc: false },
            { k: "sh", label: "Sharp", nosort: true, fmt: r => `${r.sh.w}-${r.sh.l}${r.sh.pu ? "-" + r.sh.pu : ""} (${fmt.sgn(r.sh.prof, 2)}u)` },
            { k: "lo", label: "Lottos", nosort: true, fmt: r => `${r.lo.w}-${r.lo.l} (${fmt.sgn(r.lo.prof, 2)}u)` },
            { k: "prof", label: "Day units", num: true, fmt: r => h("b", { class: r.prof >= 0 ? "pos" : "neg" }, fmt.sgn(r.prof, 2)) },
            { k: "pend", label: "Pending", num: true },
          ], byDay, { sort: "k" })));
    }
  };
  draw();
  const here = stillOn();
  clearInterval(Yak._timer);
  const tick = async () => {
    if (!here()) return clearInterval(Yak._timer);
    const more = await refreshLive();
    if (here() && view === "card") draw();
    if (!more) clearInterval(Yak._timer);
  };
  tick();
  Yak._timer = setInterval(tick, 60000);
  mount(
    h("h1", {}, "YAK's Sharp Picks"),
    h("p", { class: "lede" }, "A daily card built from where the money is going: DraftKings' betting splits (money share well ahead of ticket share), the multi-book consensus where it exists, line movement since the open, and our models. ",
      "Sized 5U down to 1U by strength, plus ", h("b", {}, "YAK's Lottos"), ": quarter-unit long shots (+750 to +4000) our models price as +EV. ",
      "From 7 AM to 1 PM PT the page shows live ", h("b", {}, "Leans"), " (unofficial); the official card publishes at 1 PM, and plays on games that tip earlier lock as official 3U picks about an hour before tip. Every official pick is graded at the price taken."),
    h("div", { class: "toolbar" }, seg([["card", "Today's card"], ["tracker", "Tracker"]], view, v => { view = v; draw(); })),
    body,
    h("div", { class: "note" }, "How picks are chosen: a side needs DraftKings money at least 15 points ahead of tickets; it gains for the consensus agreeing, the line moving its way and our model agreeing, and loses for the line moving against it. ",
      "Thin markets (money above 95% or a 50/50 ticket split, usually a handful of bets), picks where the line moved against the money, picks our model says lose, games whose own flags contradict, and moneylines outside -250 to +300 are skipped, with one pick per game. Lottos need positive expected value after our model is blended with the book's price. ",
      "CLV (closing-line value) says whether we beat the final line, which shows real edge long before win-loss does. For fun and analysis, not betting advice."));
};
