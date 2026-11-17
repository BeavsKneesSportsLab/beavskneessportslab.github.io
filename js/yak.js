/* yak.js — YAK's Sharp Picks + YAK's Lottos: today's locked card and the running tracker. Data: data/yak_picks.json
   (built in the cloud by build/yak_picks.py; picks lock once a day and are graded at the price taken). */
const Yak = {};
Yak.view = async () => {
  const d = await load("yak_picks").catch(() => null);
  if (!d || !Object.keys(d.cards || {}).length)
    return mount(h("h1", {}, "YAK's Sharp Picks"), h("div", { class: "card empty" }, "The first card locks at the next morning build. Check back soon."));
  const days = Object.keys(d.cards).sort().reverse();
  let day = days[0], view = "card";
  const body = h("div");
  const SP = { nfl: "NFL", nba: "NBA", nhl: "NHL", mlb: "MLB", cfb: "CFB", cbb: "CBB", ufc: "UFC" };
  const resChip = p => p.result ? h("span", { class: `chip ${p.result === "W" ? "good" : p.result === "L" ? "bad" : ""}` },
      `${p.result === "W" ? "Won" : p.result === "L" ? "Lost" : "Push"} ${fmt.sgn(p.profit, 2)}u`) : h("span", { class: "chip" }, "Pending");
  const pickRow = (p, lotto) => h("div", { class: "yak-pick" + (lotto ? " lotto" : "") },
    h("div", { class: "yak-u" + (lotto ? " l" : ` u${p.units}`) }, lotto ? "¼U" : `${p.units}U`),
    h("div", { class: "yak-main" },
      h("div", { class: "yak-top" },
        h("span", { class: "chip league" }, SP[p.sport] || p.sport),
        h("b", { class: "yak-name" }, p.pick), h("span", { class: "mono yak-odds" }, fmtML(p.odds)), resChip(p)),
      h("div", { class: "small muted" }, `${p.away} ${p.sport === "ufc" ? "vs" : "@"} ${p.home} · ${fmt.date(p.date)} ${fmt.time(p.date)}`,
        p.final ? ` · Final: ${p.final}` : "", p.clv != null ? ` · CLV ${fmt.sgn(p.clv, 1)}${p.market === "ml" ? " pts" : ""}` : ""),
      h("div", { class: "small yak-why" }, p.why.join(" · "))));
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
      const c = d.cards[day];
      const risk = c.sharp.reduce((s, p) => s + p.units, 0);
      body.replaceChildren(
        h("div", { class: "toolbar" }, h("select", { class: "in", onchange: e => { day = e.target.value; draw(); } },
          days.map(x => h("option", { value: x, selected: x === day }, new Date(x + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })))),
          h("span", { class: "muted small" }, `Locked ${fmt.time(c.lockedAt)} · prices are what was available at lock`)),
        h("div", { class: "card" },
          h("div", { class: "card-head" }, h("h2", {}, "🔪 YAK's Sharp Picks"), h("span", { class: "muted small" }, `${c.sharp.length} plays · ${risk}U risked`)),
          c.sharp.length ? c.sharp.map(p => pickRow(p, false)) : h("div", { class: "muted" }, "No sharp plays qualified today.")),
        h("div", { class: "card", style: { marginTop: "16px" } },
          h("div", { class: "card-head" }, h("h2", {}, "🎟️ YAK's Lottos"), h("span", { class: "muted small" }, `${c.lotto.length} plays · ${fmt.n(c.lotto.length * 0.25, 2)}U risked · +750 to +4000`)),
          c.lotto.length ? c.lotto.map(p => pickRow(p, true)) : h("div", { class: "muted" }, "No long shot priced as +EV today, so none were forced.")));
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
  mount(
    h("h1", {}, "YAK's Sharp Picks"),
    h("p", { class: "lede" }, "A daily card built from where the money is going: DraftKings' betting splits (money share well ahead of ticket share), the multi-book consensus where it exists, line movement since the open, and our models. ",
      "Sized 5U down to 1U by strength, plus ", h("b", {}, "YAK's Lottos"), ": quarter-unit long shots (+750 to +4000) our models price as +EV. ",
      "Each day's card locks in the morning and every pick is graded at the price taken."),
    h("div", { class: "toolbar" }, seg([["card", "Today's card"], ["tracker", "Tracker"]], view, v => { view = v; draw(); })),
    body,
    h("div", { class: "note" }, "How picks are chosen: a side needs DraftKings money at least 15 points ahead of tickets; it gains for the consensus agreeing, the line moving its way and our model agreeing, and loses for the line moving against it. ",
      "Thin markets, games whose own flags contradict, and moneylines outside -250 to +300 are skipped, with one pick per game. Lottos need positive expected value after our model is blended with the book's price. ",
      "CLV (closing-line value) says whether we beat the final line, which shows real edge long before win-loss does. For fun and analysis, not betting advice."));
};
