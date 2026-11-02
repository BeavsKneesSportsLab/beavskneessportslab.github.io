/* picks.js — "Parker's Picks of the Week" home card. Hand-written each week: add the new week to PICK_WEEKS below
   (an empty picks list shows "Picks TBD"). Past weeks stay selectable with their graded record.
   Each pick names the ESPN game id and the picked team's id; kickoff, the current DraftKings line and
   the result (cover / loss / push against Parker's line) come from data/cfb.json. */
const PICKS_TITLE = "Parker's Picks of the Week";
const PICK_WEEKS = {
  9: { sport: "cfb", picks: [
    { game: "401858509", team: "30", line: 6.5, units: 5,
      text: "Everyone is on Ohio State this week, and USC is coming off a bad loss to Wisconsin and has looked borderline awful. But Lincoln Riley's job is on the line, the public is all over an Ohio State team that's traveling across the country, and the Buckeyes are down to backup QB Luke Fahey with Julian Sayin out. Give me the Trojans to cover." },
    { game: "401858501", team: "135", line: 20.5, units: 4,
      text: "Minnesota is 5-2 and has won three of its last four. This team is hot, and it's facing an Indiana team that nearly lost in the Big House last week and whose offense has scored 15 and 13 points in its last two games. I like the Gophers to cover, with a 5/10 on the upset alert." },
    { game: "401856737", team: "344", line: 20.5, units: 4,
      text: "Kamario Taylor is out for the year, and without him this team isn't what it had the potential to be. But Arch has looked awful all year, and this game eerily reminds me of the Florida debacles (last year's, and this year's 27-24 home loss). Texas is a better team than it was last year, but the Longhorns are way too prone to mistakes to win by 21." },
    { game: "401858505", team: "2483", line: -3.5, units: 4,
      text: "I hate betting Oregon, but there's a big public move on Northwestern (the line opened at -7.5). Chip Kelly, now Northwestern's offensive coordinator, comes back to Autzen looking for his first win there since leaving Oregon. But I think the Ducks, whose defense has looked amazing the past couple of weeks, will finally get it done despite the awful struggles on offense. Give me the Ducks to win and cover." },
    { game: "401856734", team: "61", line: -12.5, units: 3,
      text: "Georgia is my personal favorite to win the national championship this year. Despite a horrible showing against Auburn, the Bulldogs have a chance to bounce back in a big way against a Florida team that has struggled since its early success. Even with a potential look-ahead spot at Ole Miss next week, I think the Dawgs get it done in Atlanta." },
    { game: "401856842", team: "12", line: 4.5, units: 3,
      text: "Arizona has really turned up the heat the last couple of weeks (39-3 over Iowa State last time out), and frankly, if you replaced its logo with the Alabama A, it would be ranked top 5. Texas Tech is 6-1 but hasn't looked the part, and Cincinnati just beat the Red Raiders by 13. I don't expect them to be any different against the Wildcats." },
    { game: "401860924", team: "204", line: -5.5, units: 3,
      text: "This line opened around -7, but with no injury news or any other indicators it has slid to -5.5. Fresno State's last game was an embarrassing loss to a very weak San Diego State team (the same SDSU the Beavs beat 66-14), and with Oregon State coming off a bye, I just can't see the Bulldogs keeping this close. If the Beavs' Air Raid offense produces, this one will get ugly quick." },
    { game: "401858281", team: "59", line: 8.5, units: 2,
      text: "Pitt has dropped three in a row, including a 29-point loss to Miami last week. The public is fading the Yellow Jackets heavily in a season I'm sure they'd like to forget, but I have confidence that Alberto Mendoza, the younger brother of Heisman winner Fernando Mendoza, can get it done on the road." },
  ] },
  10: { sport: "cfb", picks: [] },
};

const Picks = {
  async homeCard() {
    const d = await sportData("cfb").catch(() => null);
    if (!d) return null;
    const weeks = Object.keys(PICK_WEEKS).map(Number).sort((a, b) => a - b);
    const sel = h("select", { class: "ballot-week", "aria-label": "Picks week" },
      weeks.slice().reverse().map(w => h("option", { value: w }, `Week ${w}`)));
    const box = h("div", {});
    sel.addEventListener("change", () => box.replaceChildren(this.week(d, +sel.value)));
    box.replaceChildren(this.week(d, weeks[weeks.length - 1]));
    return h("section", { class: "card ppicks" },
      h("div", { class: "card-head" }, h("h2", {}, `🎯 ${PICKS_TITLE}`), sel),
      this.season(d),
      box,
      h("div", { class: "ppicks-foot" },
        h("span", { class: "muted small" }, "Lines are the prices Parker took; \"DK now\" is DraftKings' current line. Results graded against Parker's line, at -110. This is not betting advice. Please play responsibly."),
        h("a", { class: "btn sm", href: "#/pickem" }, "Think you can pick better? Play Pick'em →")));
  },

  /* season strip: record, units, ROI, best/worst week and a running-units bar per week */
  season(d) {
    const G = Object.keys(PICK_WEEKS).map(Number).sort((a, b) => a - b)
      .map(wk => ({ wk, ...this.grade(d, PICK_WEEKS[wk]) })).filter(g => g.graded);
    if (!G.length) return null;
    const sum = k => G.reduce((s, g) => s + g[k], 0);
    const w = sum("w"), l = sum("l"), p = sum("p"), net = sum("net"), risk = sum("risked");
    const best = G.reduce((a, b) => b.net > a.net ? b : a), worst = G.reduce((a, b) => b.net < a.net ? b : a);
    let run = 0;
    const pts = G.map(g => ({ wk: g.wk, net: g.net, run: (run += g.net) }));
    const top = Math.max(1, ...pts.map(x => Math.abs(x.net)));
    const u = x => `${x >= 0 ? "+" : ""}${x.toFixed(2)}U`;
    return h("div", { class: "pseason" },
      h("div", { class: "pseason-stats" },
        h("div", {}, h("b", {}, `${w}-${l}${p ? `-${p}` : ""}`), h("span", {}, "Season record")),
        h("div", {}, h("b", { class: net >= 0 ? "pos" : "neg" }, u(net)), h("span", {}, "Units")),
        h("div", {}, h("b", { class: net >= 0 ? "pos" : "neg" }, `${net >= 0 ? "+" : ""}${(100 * net / Math.max(1, risk)).toFixed(1)}%`), h("span", {}, "Return on risk")),
        G.length > 1 ? h("div", {}, h("b", {}, `Wk ${best.wk} ${u(best.net)}`), h("span", {}, "Best week")) : null,
        G.length > 1 ? h("div", {}, h("b", {}, `Wk ${worst.wk} ${u(worst.net)}`), h("span", {}, "Worst week")) : null),
      h("div", { class: "pseason-bars", role: "img", "aria-label": "Units won or lost each week" },
        pts.map(x => h("div", { class: "pbar", title: `Week ${x.wk}: ${u(x.net)} (season ${u(x.run)})` },
          h("div", { class: "pbar-col" }, h("i", { class: x.net >= 0 ? "up" : "down", style: { height: `${Math.max(3, 46 * Math.abs(x.net) / top)}%` } })),
          h("span", {}, `Wk ${x.wk}`)))));
  },

  week(d, wk) {
    const P = PICK_WEEKS[wk];
    if (!P.picks.length) {
      const prev = PICK_WEEKS[wk - 1] && this.grade(d, PICK_WEEKS[wk - 1]);
      return h("div", { class: "ppicks-tbd" },
        h("p", {}, h("b", {}, `Week ${wk} picks: TBD.`), " Check back before kickoff."),
        prev && prev.graded ? h("p", { class: "muted small" }, `Last week (Week ${wk - 1}): ${prev.summary}. Pick Week ${wk - 1} above to see the picks.`) : null);
    }
    const G = this.grade(d, P);
    return h("div", {},
      h("div", { class: "muted small", style: { margin: "0 0 8px" } },
        G.graded ? `Week ${wk}: ${G.summary}` : `Week ${wk} · ${P.picks.length} picks · ${G.units}U`),
      h("div", { class: "ppick-grid" }, G.rows));
  },

  /* -> {rows, results: [{game, team, res}], w, l, p, net, risked, graded, summary} */
  grade(d, P) {
    const games = Object.fromEntries([...d.schedule, ...d.predictions].map(g => [g.id, g]));   // predictions carry the live mkt
    let w = 0, l = 0, p = 0, net = 0, risked = 0;
    const results = [];
    const rows = P.picks.map(pk => {
      const g = games[pk.game];
      if (!g) return null;
      const home = g.home === pk.team, T = team(d, pk.team), O = team(d, home ? g.away : g.home);
      const lineTxt = pk.line > 0 ? `+${pk.line}` : `${pk.line}`;
      let res = null;
      if (g.state === "post" && g.hs != null) {
        const us = home ? g.hs : g.as, them = home ? g.as : g.hs, m = us + pk.line - them;
        res = m > 0 ? "W" : m < 0 ? "L" : "P";
        results.push({ game: pk.game, team: pk.team, res });
        if (res !== "P") risked += pk.units;
        if (res === "W") { w++; net += pk.units * 100 / 110; } else if (res === "L") { l++; net -= pk.units; } else p++;
        res = h("span", { class: "chip " + (res === "W" ? "good" : res === "L" ? "bad" : "") },
          `${res === "W" ? "Win" : res === "L" ? "Loss" : "Push"} · ${T.abbr} ${us}-${them}`);
      }
      const dk = g.mkt?.spread != null ? (home ? g.mkt.spread : -g.mkt.spread) : null;
      return h("div", { class: "ppick" },
        h("div", { class: "ppick-top" },
          h("a", { class: "team-cell", href: `#/cfb/team/${T.id}` }, logo(T), h("b", {}, `${T.short} ${lineTxt}`)),
          h("span", { class: "chip accent" }, `${pk.units}U`),
          res || h("span", { class: "muted small" }, dk != null ? `DK now ${dk > 0 ? "+" : ""}${dk}` : "")),
        h("div", { class: "muted small" }, `${home ? "vs" : g.neutral ? "vs" : "@"} ${O.short}${g.neutral ? " (Atlanta)" : ""} · ${fmt.date(g.date)} ${fmt.time(g.date)}`),
        h("p", {}, pk.text));
    }).filter(Boolean);
    const units = P.picks.reduce((s, x) => s + x.units, 0);
    return { rows, results, w, l, p, net, risked, units, graded: w + l + p,
             summary: `${w}-${l}${p ? `-${p}` : ""} · ${net >= 0 ? "+" : ""}${net.toFixed(2)}U` };
  },
};
