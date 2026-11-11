/* ufc.js — UFC: fight cards (DraftKings odds + Elo), results, official rankings, fighter ratings, model vs market,
   fighter pages. Data: data/ufc.json (+ ufc_fights.json on fighter pages). Routes: #/ufc/{cards|results|rankings|elo|ufcmarket}
   and #/ufc/fighter/{espnId}. */
const UFC = {};
UFC.data = async () => {
  const d = await load("ufc");
  if (!d._rank) {                       // fighter id -> best official rank label ("C" champ, "#4", "P4P #2")
    d._rank = {};
    for (const div of d.rankings) {
      const p4p = /pound/i.test(div.name);
      for (const r of div.ranks) if (r.id && !p4p) d._rank[r.id] = r.rk === 0 ? "C" : `#${r.rk}`;
    }
  }
  return d;
};
const U = {
  f: (d, id) => d.fighters[id] || { name: "Unknown" },
  link: (d, id, name, opts = {}) => h("a", { href: `#/ufc/fighter/${id}`, class: "ufc-name" + (opts.cls ? " " + opts.cls : "") },
    d._rank[id] ? h("span", { class: "chip " + (d._rank[id] === "C" ? "accent" : ""), style: { marginRight: "5px" } }, d._rank[id] === "C" ? "Champ" : d._rank[id]) : null,
    name || U.f(d, id).name),
  rec: (d, id, fallback) => U.f(d, id).pro || fallback || "",
  pct: p => p == null ? "–" : `${Math.round(100 * p)}%`,
  book: o => { if (!o) return null; const a = mlProb(o.mlA), b = mlProb(o.mlB); return a / (a + b); },
  when: s => new Date(s).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  wcShort: wc => (wc || "").replace(/^W /, "Women's ").replace("Light Heavyweight", "Light Heavy"),
  photo: (f, size = 56) => f.img ? h("img", { src: f.img, alt: "", loading: "lazy", class: "ufc-photo", style: { width: size + "px", height: size + "px" } })
                                 : h("span", { class: "ufc-photo ufc-ph", style: { width: size + "px", height: size + "px" } }, (f.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("")),
};

/* ---------- Fight cards ---------- */
UFC.cards = async (args = []) => {
  const d = await UFC.data();
  if (!d.upcoming.length) return mount(h("h1", {}, "Fight Cards"), h("div", { class: "card empty" }, "No upcoming UFC events in the feed right now."));
  let ev = d.upcoming.find(e => e.id === args[0]) || d.upcoming[0];
  const body = h("div");
  const fightRow = f => {
    const book = U.book(f.odds), pA = f.pA;
    const fav = book == null ? null : book >= 0.5 ? 0 : 1;
    const elo = pA == null ? null : pA >= 0.5 ? 0 : 1;
    const disagree = book != null && elo != null && fav !== elo && Math.abs(pA - 0.5) > 0.03;
    const side = (i) => {
      const id = i ? f.b : f.a, fr = U.f(d, id), ml = f.odds ? (i ? f.odds.mlB : f.odds.mlA) : null, op = f.odds ? (i ? f.odds.openB : f.odds.openA) : null;
      return h("div", { class: "ufc-side" + (i ? " r" : "") },
        U.photo(fr, 52),
        h("div", { class: "ufc-who" },
          U.link(d, id, f.names[i]),
          h("div", { class: "small muted" }, [U.rec(d, id, f.recs[i]), fr.country].filter(Boolean).join(" · ")),
          h("div", { class: "ufc-odds" },
            ml != null ? h("b", { class: "mono" }, fmtML(ml)) : h("span", { class: "muted small" }, "no line"),
            op != null && op !== ml ? h("span", { class: "muted small", title: "Opening line" }, ` (open ${fmtML(op)})`) : null)));
    };
    return h("div", { class: "ufc-fight" },
      h("div", { class: "ufc-meta small muted" },
        h("span", {}, U.wcShort(f.wc)), f.rounds ? h("span", {}, ` · ${f.rounds} rds`) : null,
        f.order === 1 ? h("span", { class: "chip accent", style: { marginLeft: "6px" } }, "Main event") : null,
        disagree ? h("span", { class: "chip warn", style: { marginLeft: "6px" }, title: "Elo favors the betting underdog" }, "Elo disagrees") : null),
      h("div", { class: "ufc-pair" }, side(0), h("div", { class: "ufc-vs muted" }, "vs"), side(1)),
      book != null || pA != null ? h("div", { class: "ufc-probs" },
        probBar("Book", book, f), probBar("Elo", pA, f)) : null);
  };
  const probBar = (label, p, f) => p == null ? null : h("div", { class: "ufc-pb" },
    h("span", { class: "small muted", style: { width: "34px" } }, label),
    h("span", { class: "mono small", style: { width: "34px", textAlign: "right" } }, U.pct(p)),
    h("div", { class: "ufc-split" }, h("i", { style: { width: `${100 * p}%` } })),
    h("span", { class: "mono small", style: { width: "34px" } }, U.pct(1 - p)));
  const draw = () => {
    const segs = {};
    for (const f of ev.fights) (segs[f.seg || "Card"] ||= []).push(f);
    const order = ["Main Card", "Prelims", "Early Prelims"];
    const keys = Object.keys(segs).sort((a, b) => (order.indexOf(a) + 9) % 9 - (order.indexOf(b) + 9) % 9);
    const lined = ev.fights.filter(f => f.odds).length;
    body.replaceChildren(
      h("div", { class: "card-head", style: { marginTop: "6px" } },
        h("div", {}, h("h2", { style: { margin: 0 } }, ev.name), h("div", { class: "muted small" }, `${U.when(ev.date)} · ${ev.fights.length} fights · ${lined} with DraftKings lines`))),
      ...keys.map(k => h("div", { class: "card", style: { marginBottom: "14px" } }, h("h3", { style: { marginTop: 0 } }, k), segs[k].map(fightRow))));
  };
  draw();
  mount(
    h("h1", {}, "UFC Fight Cards"),
    h("p", { class: "lede" }, "Every bout on the upcoming cards with DraftKings moneylines (and where they opened) next to our Elo fighter rating's win probability. ",
      "The bars split each fight: book (vig removed) on top, Elo below. ", h("b", {}, "Elo disagrees"), " flags fights where the rating likes the betting underdog. ",
      h("a", { class: "link", href: "#/ufc/ufcmarket" }, "How Elo has done against the book →")),
    h("div", { class: "toolbar" }, h("select", { class: "in", onchange: e => { ev = d.upcoming.find(x => x.id === e.target.value); draw(); } },
      d.upcoming.map(e => h("option", { value: e.id, selected: e === ev }, `${new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${e.name}`)))),
    body,
    h("div", { class: "note" }, `Lines are DraftKings via ESPN and refresh with each build. Fights the feed lists without a line simply haven't been priced yet. Updated ${fmt.ago(d.generated)}.`));
};

/* ---------- Results ---------- */
UFC.results = async (args = []) => {
  const d = await UFC.data();
  let ev = d.recent.find(e => e.id === args[0]) || d.recent[0];
  const body = h("div");
  const draw = () => {
    const rows = ev.fights.map(f => {
      const w = f.win === 1 ? 0 : f.win === 0 ? 1 : null;
      const book = U.book(f.odds);
      const wBook = w == null || book == null ? null : w === 0 ? book : 1 - book;
      const wElo = w == null || f.pA == null ? null : w === 0 ? f.pA : 1 - f.pA;
      return { ...f, w, wBook, wElo, wML: w == null || !f.odds ? null : w === 0 ? f.odds.mlA : f.odds.mlB };
    });
    const upsets = rows.filter(r => r.wBook != null && r.wBook < 0.5).length;
    body.replaceChildren(h("div", { class: "card tight" },
      h("div", { class: "card-head" }, h("h2", {}, ev.name), h("span", { class: "muted small" }, `${fmt.date(ev.date)} · ${upsets} upset${upsets === 1 ? "" : "s"} by the closing line`)),
      table([
        { k: "seg", label: "", nosort: true, fmt: r => h("span", { class: "muted small" }, r.order === 1 ? "Main" : (r.seg || "").replace("Early Prelims", "Early").replace("Main Card", "Main card")) },
        { k: "win", label: "Result", nosort: true, cls: "wrap", fmt: r => r.w == null ? h("span", {}, U.link(d, r.a, r.names[0]), " vs ", U.link(d, r.b, r.names[1]), h("span", { class: "chip", style: { marginLeft: "6px" } }, r.win === 0.5 ? "Draw" : "No contest"))
            : h("span", {}, h("b", {}, U.link(d, r.w ? r.b : r.a, r.names[r.w])), h("span", { class: "muted" }, " def. "), U.link(d, r.w ? r.a : r.b, r.names[1 - r.w])) },
        { k: "wc", label: "Division", asc: true, fmt: r => h("span", { class: "small" }, U.wcShort(r.wc)) },
        { k: "method", label: "Method", asc: true, fmt: r => r.method ? h("span", {}, h("b", {}, r.method), r.how && r.how !== r.method ? h("span", { class: "muted small" }, ` ${r.how}`) : null) : "–" },
        { k: "rd", label: "Rd", num: true, fmt: r => r.rd ? `${r.rd} · ${r.clock || ""}` : "–" },
        { k: "wML", label: "Winner's line", num: true, title: "Winner's DraftKings moneyline", fmt: r => r.wML == null ? "–" : h("span", {}, h("span", { class: "mono" }, fmtML(r.wML)), r.wBook < 0.5 ? h("span", { class: "chip warn", style: { marginLeft: "5px" } }, "Upset") : null) },
        { k: "wElo", label: "Elo had winner", num: true, fmt: r => r.wElo == null ? "–" : h("span", { class: r.wElo >= 0.5 ? "pos" : "neg" }, U.pct(r.wElo)) },
      ], rows, { sort: null })));
  };
  draw();
  mount(
    h("h1", {}, "UFC Results"),
    h("p", { class: "lede" }, "Recent events, fight by fight: who won, how, when, what the winner's closing line was, and what the Elo rating gave him going in."),
    h("div", { class: "toolbar" }, h("select", { class: "in", onchange: e => { ev = d.recent.find(x => x.id === e.target.value); draw(); } },
      d.recent.map(e => h("option", { value: e.id, selected: e === ev }, `${new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${e.name}`)))),
    body);
};

/* ---------- Official rankings ---------- */
UFC.rankings = async () => {
  const d = await UFC.data();
  let view = "men";
  const grid = h("div", { class: "grid g3" });
  const isW = n => /women/i.test(n);
  const divCard = div => {
    const p4p = /pound/i.test(div.name);
    return h("div", { class: "card tight" }, h("h2", { style: { padding: "0 4px" } }, div.name),
      div.ranks.map(r => {
        const fr = r.id ? U.f(d, r.id) : {};
        return h("div", { class: "ufc-rk" + (r.rk === 0 ? " champ" : "") },
          h("span", { class: "mono muted", style: { width: "26px" } }, r.rk === 0 ? "C" : r.rk),
          r.id ? U.photo(fr, 26) : h("span", { style: { width: "26px" } }),
          h("span", { style: { flex: 1, minWidth: 0 } }, r.id ? h("a", { href: `#/ufc/fighter/${r.id}` }, r.rk === 0 ? h("b", {}, r.name) : r.name) : r.name,
            r.rk === 0 && !p4p ? h("span", { class: "chip accent", style: { marginLeft: "6px" } }, "Champion") : null),
          r.chg ? h("span", { class: "small mono " + (r.chg[0] === "+" ? "pos" : r.chg[0] === "-" ? "neg" : "muted"), title: r.chg === "NR" ? "Newly ranked" : `Moved ${r.chg[0] === "+" ? "up" : "down"} ${r.chg.slice(1)}` },
            r.chg[0] === "+" ? `▲${r.chg.slice(1)}` : r.chg[0] === "-" ? `▼${r.chg.slice(1)}` : "NEW") : null,
          h("span", { class: "mono small muted", title: "Elo rating", style: { width: "40px", textAlign: "right" } }, fr.elo ?? ""));
      }));
  };
  const draw = () => grid.replaceChildren(...d.rankings.filter(div => view === "p4p" ? /pound/i.test(div.name) : !/pound/i.test(div.name) && (view === "women") === isW(div.name)).map(divCard));
  draw();
  mount(
    h("h1", {}, "UFC Rankings"),
    h("p", { class: "lede" }, "The official UFC rankings (champion plus top 15 per division, voted by media), with each fighter's Elo rating on the right for comparison. Arrows show movement since the last update."),
    h("div", { class: "toolbar" }, seg([["men", "Men's divisions"], ["women", "Women's divisions"], ["p4p", "Pound-for-pound"]], view, v => { view = v; draw(); })),
    grid,
    h("div", { class: "note" }, `Source: ufc.com/rankings, refreshed with each build. Updated ${fmt.ago(d.generated)}.`));
};

/* ---------- Elo leaderboard ---------- */
UFC.elo = async () => {
  const d = await UFC.data();
  const yrAgo = new Date(Date.now() - 548 * 864e5).toISOString().slice(0, 10);
  const all = Object.entries(d.fighters).map(([id, f]) => ({ id, ...f, div: (f.wcLast || "").replace(/^W /, "Women's "), wl: `${f.ufc[0]}-${f.ufc[1]}${f.ufc[2] ? "-" + f.ufc[2] : ""}` }))
    .filter(f => f.n >= 3);
  const divs = [...new Set(all.map(f => f.div).filter(Boolean))].sort();
  let div = "", active = true, q = "";
  const rows = () => all.filter(f => (!div || f.div === div) && (!active || (f.lastFight || "") >= yrAgo) && (!q || f.name.toLowerCase().includes(q)));
  const ranked = () => { const rs = rows().sort((a, b) => b.elo - a.elo); rs.forEach((r, i) => r.rk = i + 1); return rs; };
  const tbl = table([
    { k: "rk", label: "#", num: true, asc: true },
    { k: "name", label: "Fighter", asc: true, fmt: f => h("span", { class: "team-cell" }, U.photo(f, 24), U.link(d, f.id, f.name)) },
    { k: "div", label: "Division", asc: true, fmt: f => h("span", { class: "small" }, f.div) },
    { k: "elo", label: "Elo", num: true, fmt: f => h("b", { class: "mono" }, f.elo) },
    { k: "peak", label: "Peak", num: true },
    { k: "wl", label: "UFC W-L", sort: f => f.ufc[0] - f.ufc[1], num: true },
    { k: "pro", label: "Pro", num: true, fmt: f => f.pro || "–" },
    { k: "last5", label: "Last 5", nosort: true, fmt: f => h("span", { class: "mono small" }, f.last5.map(x => h("span", { class: x === "W" ? "pos" : x === "L" ? "neg" : "muted" }, x))) },
    { k: "official", label: "Official", sort: f => d._rank[f.id] === "C" ? 0 : d._rank[f.id] ? +d._rank[f.id].slice(1) : 99, asc: true, fmt: f => d._rank[f.id] ? h("span", { class: "chip" + (d._rank[f.id] === "C" ? " accent" : "") }, d._rank[f.id] === "C" ? "Champ" : d._rank[f.id]) : "–" },
    { k: "lastFight", label: "Last fight", asc: false, fmt: f => f.lastFight ? h("span", { class: "small muted" }, f.lastFight) : "–" },
  ], ranked(), { sort: "elo", maxH: "680px" });
  const redraw = () => tbl.redraw(ranked());
  mount(
    h("h1", {}, "Fighter Ratings (Elo)"),
    h("p", { class: "lede" }, `An Elo rating built from every UFC fight since 2010 (${d.model.fights.toLocaleString()} fights). Everyone starts at 1500; beat a higher-rated fighter and you take more of his points. New fighters move faster for their first few bouts, and long layoffs drift a rating back toward 1500. It only knows wins and losses, so treat it as a strength-of-schedule-aware résumé, not a betting model.`),
    h("div", { class: "toolbar" },
      h("input", { class: "in", placeholder: "Fighter…", oninput: e => { q = e.target.value.toLowerCase(); redraw(); } }),
      h("select", { class: "in", onchange: e => { div = e.target.value; redraw(); } }, h("option", { value: "" }, "All divisions"), divs.map(x => h("option", { value: x }, x))),
      seg([["on", "Active (18 mo)"], ["all", "Everyone"]], "on", v => { active = v === "on"; redraw(); })),
    h("div", { class: "card tight" }, tbl),
    h("div", { class: "note" }, "Minimum 3 UFC fights. Division is the weight class of the fighter's most recent bout."));
};

/* ---------- Model vs market ---------- */
UFC.market = async () => {
  const d = await UFC.data();
  const g = d.graded;
  const ll = k => -g.reduce((s, x) => s + Math.log(x.win === 1 ? x[k] : 1 - x[k]), 0) / g.length;
  const acc = k => g.filter(x => Math.abs(x[k] - 0.5) > 1e-6 && (x[k] > 0.5) === (x.win === 1)).length / g.filter(x => Math.abs(x[k] - 0.5) > 1e-6).length;
  const dis = g.filter(x => Math.abs(x.pA - 0.5) > 0.03 && (x.pA > 0.5) !== (x.book > 0.5));
  const units = (xs) => xs.reduce((s, x) => { const pickA = x.pA > 0.5, ml = pickA ? x.mlA : x.mlB, won = (x.win === 1) === pickA;
    return s + (won ? (ml > 0 ? ml / 100 : 100 / -ml) : -1); }, 0);
  const disW = dis.filter(x => (x.pA > 0.5) === (x.win === 1)).length;
  const m = d.model;
  const kpi = (l, v, cls) => h("div", { class: "kpi" }, h("span", {}, l), h("b", { class: cls || "" }, v));
  const rows = g.map(x => ({ ...x, pick: x.pA > 0.5 ? 0 : 1, hit: (x.pA > 0.5) === (x.win === 1), favHit: (x.book > 0.5) === (x.win === 1) }));
  mount(
    h("h1", {}, "UFC: Model vs Market"),
    h("p", { class: "lede" }, "How the Elo rating's pre-fight win probabilities stack up against DraftKings' closing moneylines (vig removed), on every fight where we have a line. Lower log loss is better; a coin flip scores 0.693."),
    h("div", { class: "card" }, h("h2", {}, `Graded fights: ${g.length}`),
      h("div", { class: "kpis", style: { marginTop: 0 } },
        kpi("Elo log loss", fmt.n(ll("pA"), 3), ll("pA") < ll("book") ? "pos" : "neg"), kpi("Book log loss", fmt.n(ll("book"), 3)),
        kpi("Elo picks winner", fmt.pct(acc("pA"))), kpi("Book favorite wins", fmt.pct(acc("book"))),
        kpi("Elo vs book disagreements", `${disW}-${dis.length - disW}`), kpi("1u on Elo's side there", fmt.sgn(units(dis), 1) + "u", units(dis) >= 0 ? "pos" : "neg")),
      h("p", { class: "muted small", style: { marginTop: "12px" } },
        `Honest read: the book is far sharper than a wins-and-losses Elo. Over ${m.testN.toLocaleString()} fights since ${m.testFrom.slice(0, 4)} (walk-forward, no peeking), Elo's log loss is ${m.testLogLoss} vs ${m.coinLogLoss} for a coin flip and it picks ${fmt.pct(m.testAcc)} of winners. `,
        "Use it to read résumés and spot who's being overrated, not as a betting edge.")),
    h("div", { class: "card tight", style: { marginTop: "16px" } }, h("h2", {}, "Every graded fight"),
      table([
        { k: "date", label: "Date", asc: false, fmt: x => h("span", { class: "small muted" }, x.date) },
        { k: "fight", label: "Fight", nosort: true, cls: "wrap", fmt: x => h("span", {}, h("span", { class: x.win === 1 ? "" : "muted" }, x.names[0]), " vs ", h("span", { class: x.win === 0 ? "" : "muted" }, x.names[1]), x.method ? h("span", { class: "small muted" }, ` · ${x.method}`) : null) },
        { k: "ml", label: "Close", nosort: true, fmt: x => h("span", { class: "mono small" }, `${fmtML(x.mlA)} / ${fmtML(x.mlB)}`) },
        { k: "book", label: "Book", num: true, title: "Book's no-vig probability for the first-listed fighter", fmt: x => U.pct(x.book) },
        { k: "pA", label: "Elo", num: true, title: "Elo probability for the first-listed fighter", fmt: x => U.pct(x.pA) },
        { k: "hit", label: "Elo pick", sort: x => x.hit ? 1 : 0, fmt: x => h("span", { class: x.hit ? "pos" : "neg" }, x.hit ? "✓" : "✗", " ", x.names[x.pick].split(" ").slice(-1)[0]) },
        { k: "favHit", label: "Fav", sort: x => x.favHit ? 1 : 0, fmt: x => h("span", { class: x.favHit ? "pos" : "neg" }, x.favHit ? "✓" : "✗") },
      ], rows, { sort: "date", maxH: "640px" })),
    h("div", { class: "note" }, `Lines are logged before each fight and kept after it (the feed drops many old lines), so this sample grows every event. Model: ${d.method}`));
};

/* ---------- Fighter page ---------- */
UFC.fighter = async (args = []) => {
  const [d, logs] = await Promise.all([UFC.data(), load("ufc_fights").catch(() => ({}))]);
  const id = args[0], f = d.fighters[id];
  if (!f) return mount(h("div", { class: "card empty" }, "Fighter not found (we track everyone who has fought in the UFC in the last 3 years, is booked, or is ranked)."));
  const up = d.upcoming.flatMap(e => e.fights.map(x => ({ ...x, ev: e }))).find(x => x.a === id || x.b === id);
  const kv = (l, v) => v == null || v === "" ? null : h("div", { class: "kpi" }, h("span", {}, l), h("b", {}, v));
  const spark = () => {
    const pts = f.hist; if (pts.length < 2) return null;
    const W = 520, H = 120, ys = pts.map(p => p[1]), lo = Math.min(...ys, 1500) - 15, hi = Math.max(...ys, 1500) + 15;
    const X = i => 8 + i * (W - 16) / (pts.length - 1), Y = v => H - 8 - (v - lo) * (H - 16) / (hi - lo);
    return h("div", { class: "card" }, h("h2", {}, "Elo history"),
      h("div", { html: `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Elo rating over the last ${pts.length} fights">
        <line x1="0" x2="${W}" y1="${Y(1500)}" y2="${Y(1500)}" stroke="var(--line)" stroke-dasharray="4 4"/>
        <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${pts.map((p, i) => `${X(i)},${Y(p[1])}`).join(" ")}"/>
        ${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p[1])}" r="3" fill="var(--accent)"><title>${p[0]}: ${p[1]}</title></circle>`).join("")}
      </svg>` }),
      h("div", { class: "muted small" }, `Last ${pts.length} fights · dashed line = 1500 (debut)`));
  };
  const lg = (logs[id] || []).map(([date, opp, oppName, res, method, rd, ev, wc]) => ({ date, opp, oppName, res, method, rd, ev, wc }));
  mount(
    h("div", { class: "ufc-hero card" },
      U.photo(f, 96),
      h("div", {},
        h("h1", { style: { margin: "0 0 2px" } }, f.name),
        f.nick ? h("div", { class: "muted" }, `"${f.nick}"`) : null,
        h("div", { class: "small", style: { marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" } },
          (f.ranks || []).map(([div, rk]) => h("span", { class: "chip" + (rk === 0 ? " accent" : "") }, rk === 0 ? `${div} champion` : `${div} #${rk}`)),
          f.wc || f.wcLast ? h("span", { class: "chip" }, f.wc || U.wcShort(f.wcLast)) : null,
          f.country ? h("span", { class: "chip" }, f.country) : null))),
    h("div", { class: "kpis" },
      kv("Elo", f.elo), kv("Peak Elo", f.peak), kv("Pro record", f.pro), kv("UFC record", `${f.ufc[0]}-${f.ufc[1]}${f.ufc[2] ? "-" + f.ufc[2] : ""}${f.ufc[3] ? ` (${f.ufc[3]} NC)` : ""}`),
      kv("Age", f.age), kv("Height", f.ht), kv("Reach", f.reach), kv("Stance", f.stance), kv("Team", f.camp)),
    up ? h("div", { class: "card", style: { marginTop: "16px" } }, h("h2", {}, "Next fight"),
      h("p", {}, h("b", {}, `vs `, U.link(d, up.a === id ? up.b : up.a, up.names[up.a === id ? 1 : 0])), ` · ${U.wcShort(up.wc)} · `, h("a", { href: `#/ufc/cards/${up.ev.id}` }, up.ev.name), ` · ${U.when(up.date)}`),
      h("div", { class: "kpis", style: { marginTop: 0 } },
        kv("DraftKings", up.odds ? fmtML(up.a === id ? up.odds.mlA : up.odds.mlB) : "no line yet"),
        kv("Book win %", up.odds ? U.pct(up.a === id ? U.book(up.odds) : 1 - U.book(up.odds)) : null),
        kv("Elo win %", U.pct(up.a === id ? up.pA : 1 - up.pA)))) : null,
    h("div", { class: "grid g2", style: { marginTop: "16px" } },
      spark(),
      h("div", { class: "card tight" }, h("h2", {}, "UFC fight log"),
        lg.length ? table([
          { k: "date", label: "Date", asc: false, fmt: x => h("span", { class: "small muted" }, x.date) },
          { k: "res", label: "", fmt: x => h("b", { class: x.res === "W" ? "pos" : x.res === "L" ? "neg" : "muted" }, x.res) },
          { k: "oppName", label: "Opponent", asc: true, fmt: x => d.fighters[x.opp] ? U.link(d, x.opp, x.oppName) : x.oppName },
          { k: "method", label: "Method", fmt: x => x.method ? `${x.method}${x.rd ? " R" + x.rd : ""}` : "–" },
          { k: "ev", label: "Event", cls: "wrap", fmt: x => h("span", { class: "small muted" }, x.ev) },
        ], lg, { sort: "date" }) : h("div", { class: "muted small" }, "No UFC fights yet."))),
    h("div", { class: "note" }, "Method and round are shown for fights in the last ~13 months. Bio from ESPN."));
};
