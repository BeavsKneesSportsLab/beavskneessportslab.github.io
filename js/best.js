/* best.js — Best Bets: the strict card. Only plays from a rule that has already beaten the closing line in our own
   graded history (data/best_bets.json, built in the cloud by build/best_bets.py). */
const Best = {};
Best.view = async () => {
  const d = await load("best_bets").catch(() => null);
  const SP = { nfl: "NFL", nba: "NBA", nhl: "NHL", mlb: "MLB", cfb: "CFB", cbb: "CBB" };
  const pct = x => x == null ? "–" : (100 * x).toFixed(1) + "%";
  const intro = h("p", { class: "lede" },
    "The strict card. A play only makes it here if it comes from a rule that has ", h("b", {}, "already beaten the closing line"),
    " in our own graded history, with enough games that it isn't a hot streak. Most days that means a handful of plays; some days, none. ",
    "Every play is a flat 2U, locked once and graded at the price taken.");
  if (!d) return mount(h("h1", {}, "Best Bets"), intro, h("div", { class: "card empty" }, "The first Best Bets card builds at the next update."));
  const days = Object.keys(d.cards || {}).sort().reverse();
  const SD = {};
  const sports = [...new Set(Object.values(d.cards).flatMap(c => (c.picks || []).concat(c.watch || []).map(p => p.sport)))];
  await Promise.all(sports.map(async x => { SD[x] = await sportData(x).catch(() => null); }));
  const logo = (p, which, size) => {
    const sd = SD[p.sport], id = which === "home" ? p.homeId : p.awayId, t = sd && id ? team(sd, id) : null;
    return t?.logo ? h("img", { class: "yak-logo", src: t.logo, alt: "", loading: "lazy", style: { width: size + "px", height: size + "px" } })
                   : h("span", { class: "yak-logo ph", style: { width: size + "px", height: size + "px" } }, (p[which] || "?").split(" ").map(w => w[0]).slice(0, 2).join(""));
  };
  const chipRes = p => p.result ? h("span", { class: `chip ${p.result === "W" ? "good" : p.result === "L" ? "bad" : ""}` },
    `${p.result === "W" ? "Won" : p.result === "L" ? "Lost" : "Push"} ${fmt.sgn(p.profit, 2)}u`) : null;
  const chipWhen = p => {
    if (p.result) return null;
    const ms = new Date(p.date) - Date.now();
    if (ms <= 0) return h("span", { class: "chip warn" }, h("span", { class: "live-dot" }), "In progress");
    const hr = Math.floor(ms / 36e5), mn = Math.round((ms % 36e5) / 6e4);
    return h("span", { class: "chip" }, hr >= 20 ? fmt.time(p.date) : `Starts in ${hr ? hr + "h " : ""}${mn}m`);
  };
  const row = (p, watch) => h("div", { class: "yak-pick" + (watch ? " lean" : "") + (p.result ? ` r-${p.result}` : "") },
    h("div", { class: "yak-u u3" }, watch ? "–" : `${p.units}U`),
    p.market === "total" ? h("div", { class: "yak-pair" }, logo(p, "away", 30), logo(p, "home", 30)) : logo(p, p.side, 44),
    h("div", { class: "yak-main" },
      h("div", { class: "yak-top" },
        h("span", { class: "chip league" }, SP[p.sport] || p.sport),
        h("b", { class: "yak-name" }, p.pick), h("span", { class: "mono yak-odds" }, fmtML(p.odds)), chipRes(p), watch ? null : chipWhen(p),
        p.early ? h("span", { class: "chip", title: `Early tip: locked ${fmt.time(p.lockedAt)}, before the 1 PM card` }, "⏰ Early lock") : null,
        h("span", { class: "chip", title: "How far our model is from the line" }, `Gap ${p.gap}`)),
      h("div", { class: "small muted yak-game" }, logo(p, "away", 16), ` ${p.away} @ `, logo(p, "home", 16), ` ${p.home} · ${fmt.date(p.date)} ${fmt.time(p.date)}`,
        p.final ? ` · Final: ${p.final}` : "", p.clv != null ? ` · CLV ${fmt.sgn(p.clv, 1)}` : ""),
      h("div", { class: "small yak-why" }, p.why.join(" · "))));
  const stats = ps => {
    const g = ps.filter(p => p.result);
    const w = g.filter(p => p.result === "W").length, l = g.filter(p => p.result === "L").length, pu = g.length - w - l;
    const risk = g.reduce((s, p) => s + p.units, 0), prof = g.reduce((s, p) => s + p.profit, 0);
    const cl = g.filter(p => p.clv != null);
    return { w, l, pu, n: g.length, risk, prof, roi: risk ? prof / risk : null, clv: cl.length ? cl.reduce((s, p) => s + p.clv, 0) / cl.length : null, pend: ps.length - g.length };
  };
  const all = days.flatMap(dd => (d.cards[dd].picks || []).map(p => ({ ...p, day: dd })));
  const rules = (d.rules || []).slice().sort((a, b) => (b.pass - a.pass) || (b.lo - a.lo));
  let day = days[0], view = "card", showAll = false;
  const body = h("div");
  const barCard = () => {
    const shown = showAll ? rules : rules.filter((r, i) => r.pass || i < 8);
    return h("div", { class: "card", style: { marginTop: "16px" } },
      h("div", { class: "card-head" }, h("h2", {}, "📏 The bar"), h("span", { class: "muted small" }, `re-checked every update · ${rules.filter(r => r.pass).length} of ${rules.length} rules qualify`)),
      h("p", { class: "small muted", style: { margin: "0 0 8px" } },
        `Each rule is graded on every finished game in our records, betting our model's side at the closing line. To qualify it needs ${d.bar?.minN || 150}+ games, `,
        `a win rate whose 95% confidence floor is above the ${pct(d.bar?.breakeven)} break-even at -110, and a winning record in both the earlier and later halves of its history. `,
        "A rule that slips below the bar stops producing picks on the next update."),
      table([
        { k: "label", label: "Rule", nosort: true },
        { k: "rec", label: "Record", nosort: true, fmt: r => `${r.w}-${r.l}` },
        { k: "pct", label: "Win %", num: true, fmt: r => pct(r.pct) },
        { k: "lo", label: "95% floor", num: true, fmt: r => h("span", { class: r.lo > (d.bar?.breakeven || .5238) ? "pos" : "" }, pct(r.lo)) },
        { k: "halves", label: "Halves", nosort: true, fmt: r => `${pct(r.h1)} / ${pct(r.h2)}` },
        { k: "pass", label: "Status", nosort: true, fmt: r => r.pass ? h("span", { class: "chip good" }, "✅ Active") : h("span", { class: "muted small" }, r.why) },
      ], shown, {}),
      h("button", { class: "btn sm", style: { marginTop: "8px" }, onclick: () => { showAll = !showAll; draw(); } }, showAll ? "Show fewer" : `Show all ${rules.length} rules`));
  };
  const draw = () => {
    if (view === "card") {
      const c = day ? d.cards[day] : null, picks = c?.picks || [], watch = (c && c.status === "watch" && c.watch) || [];
      const s = stats(picks), at = stats(all);
      const tile = (lab, val, cls) => h("div", { class: "yak-tile" }, h("span", {}, lab), h("b", { class: cls || "" }, val));
      body.replaceChildren(...[
        days.length ? h("div", { class: "toolbar" },
          h("select", { class: "in", onchange: e => { day = e.target.value; draw(); } },
            days.map(x => h("option", { value: x, selected: x === day }, new Date(x + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })))),
          h("span", { class: "muted small" }, c?.status === "watch" ? `On-watch list updated ${fmt.time(c.watchedAt)} · the card locks at 1 PM PT` : c ? `Card locked ${fmt.time(c.lockedAt)} · prices are what was available at lock` : "")) : null,
        h("div", { class: "yak-hero" },
          tile("Active rules", `${(d.active || []).length}`),
          tile("Today's plays", `${picks.length}`),
          tile("Today", s.n ? `${s.w}-${s.l}${s.pu ? "-" + s.pu : ""} · ${fmt.sgn(s.prof, 2)}u` : "–", s.prof > 0 ? "pos" : s.prof < 0 ? "neg" : ""),
          tile("All-time", at.n ? `${at.w}-${at.l}${at.pu ? "-" + at.pu : ""} · ${fmt.sgn(at.prof, 2)}u` : "–", at.prof > 0 ? "pos" : at.prof < 0 ? "neg" : ""),
          tile("Avg CLV", at.clv == null ? "–" : `${fmt.sgn(at.clv, 2)} pts`, (at.clv || 0) > 0 ? "pos" : (at.clv || 0) < 0 ? "neg" : "")),
        h("div", { class: "card" },
          h("div", { class: "card-head" }, h("h2", {}, "✅ Best Bets"), h("span", { class: "muted small" }, `${picks.length} plays · ${picks.reduce((x, p) => x + p.units, 0)}U`)),
          picks.length ? picks.map(p => row(p, false))
            : h("div", { class: "muted" }, c?.status === "watch" ? "Nothing locked yet. Plays lock about an hour before tip, or at 1 PM PT." : "Nothing cleared the bar today, so there are no Best Bets. That's the point of the bar.")),
        watch.length ? h("div", { class: "card yak-leans", style: { marginTop: "16px" } },
          h("div", { class: "card-head" }, h("h2", {}, "👀 On watch"), h("span", { class: "muted small" }, "Unofficial · qualifies at the current line · locks at 1 PM PT if it still does")),
          watch.map(p => row(p, true))) : null,
        barCard()].filter(Boolean));
    } else {
      const s = stats(all);
      const byDay = days.map(k => ({ k, ...stats(d.cards[k].picks || []) }));
      body.replaceChildren(
        h("div", { class: "card" }, h("h2", {}, "Best Bets tracker"),
          h("div", { class: "kpis", style: { marginTop: 0 } },
            h("div", { class: "kpi" }, h("span", {}, "Record"), h("b", {}, `${s.w}-${s.l}${s.pu ? "-" + s.pu : ""}`)),
            h("div", { class: "kpi" }, h("span", {}, "Units"), h("b", { class: s.prof >= 0 ? "pos" : "neg" }, `${fmt.sgn(s.prof, 2)}u`)),
            h("div", { class: "kpi" }, h("span", {}, "ROI"), h("b", { class: (s.roi || 0) >= 0 ? "pos" : "neg" }, s.roi == null ? "–" : fmt.sgn(100 * s.roi, 1) + "%")),
            h("div", { class: "kpi", title: "Points better (+) or worse than the closing line, on average" }, h("span", {}, "Avg CLV"), h("b", { class: (s.clv || 0) >= 0 ? "pos" : "neg" }, s.clv == null ? "–" : `${fmt.sgn(s.clv, 2)} pts`)),
            h("div", { class: "kpi" }, h("span", {}, "Pending"), h("b", {}, s.pend)))),
        h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "Daily log"),
          byDay.length ? table([
            { k: "k", label: "Date" },
            { k: "rec", label: "Record", nosort: true, fmt: r => r.n ? `${r.w}-${r.l}${r.pu ? "-" + r.pu : ""}` : "–" },
            { k: "prof", label: "Units", num: true, fmt: r => r.n ? h("b", { class: r.prof >= 0 ? "pos" : "neg" }, fmt.sgn(r.prof, 2)) : "–" },
            { k: "pend", label: "Pending", num: true },
          ], byDay, { sort: "k" }) : h("div", { class: "muted small" }, "Nothing graded yet.")),
        barCard());
    }
  };
  draw();
  mount(h("h1", {}, "Best Bets"), intro,
    h("div", { class: "toolbar" }, seg([["card", "Today's card"], ["tracker", "Tracker"]], view, v => { view = v; draw(); })),
    body,
    h("div", { class: "note" }, "Best Bets is not YAK's Picks. YAK's card follows where the betting money is going and hasn't proven an edge yet; this card only uses rules that have. ",
      "Betting splits can veto a Best Bet (heavy money on the other side) but never create one. A record against the closing line is still a small sample until it has a few hundred games, so the bar can and will change its mind. For fun and analysis, not betting advice."));
};
