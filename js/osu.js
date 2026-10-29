/* osu.js — Oregon State page (#/beavers): every sport's news (official site, OregonLive, BeaverBlitz,
   Google News) plus recent results and what's coming up, from data/osu.json (build/osu.py). */
const OSU_ORDER = ["Football", "Men's Basketball", "Women's Basketball", "Baseball", "Softball", "Women's Volleyball",
                   "Women's Soccer", "Men's Soccer", "Wrestling", "Women's Gymnastics", "Golf", "Rowing", "Track & Cross Country"];
// calendar sports -> the same buckets the news uses
const osuBucket = s => /golf/i.test(s) ? "Golf" : /rowing/i.test(s) ? "Rowing" : /track|cross country/i.test(s) ? "Track & Cross Country" : s;

function osuEventRow(e) {
  const day = new Date(e.date.slice(0, 10) + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const res = e.res ? h("b", { class: e.res === "W" ? "pos" : e.res === "L" ? "neg" : "" }, `${e.res} ${e.us}-${e.them}`)
    : e.info ? h("span", { class: "small" }, e.info)
    : h("span", { class: "muted small" }, [e.time && !/^(TBA|All Day)$/i.test(e.time) ? `${e.time} PT` : e.time || "", e.tv ? ` · ${e.tv.split(/ on |,/)[0]}` : ""].join(""));
  return h(e.link ? "a" : "div", { class: "osu-ev", href: e.link || null, target: e.link ? "_blank" : null, rel: e.link ? "noopener" : null },
    h("span", { class: "muted small osu-day" }, day, h("span", { class: "osu-sp" }, e.short)),
    h("span", { class: "chip" }, e.short),
    h("span", { class: "osu-opp" }, e.logo ? h("img", { class: "logo", src: e.logo, alt: "", loading: "lazy" }) : h("span", { class: "logo" }),
      h("span", {}, e.opp ? `${e.atVs || "vs"} ${e.opp}` : e.sport)),
    res);
}

function osuStory(s, lead) {
  const meta = h("div", { class: "muted small" }, h("span", { class: "chip" + (s.official ? " osu-off" : "") }, s.sport === "General" ? "Oregon State" : s.sport), " ",
    `${s.source} · ${fmt.ago(s.published)}`);
  if (lead) return h("a", { class: "story-lead", href: s.link, target: "_blank", rel: "noopener" },
    s.img ? h("img", { src: s.img, alt: "", loading: "lazy" }) : null,
    h("div", {}, meta, h("h3", {}, s.title), s.desc ? h("p", { class: "muted" }, s.desc) : null));
  return h("a", { class: "story", href: s.link, target: "_blank", rel: "noopener" },
    s.img ? h("img", { src: s.img, alt: "", loading: "lazy" }) : h("span", { class: "story-ph osu-ph" }, "🦫"),
    h("div", {}, h("div", { class: "story-h" }, s.title), meta));
}

/* team pages (#/beavers/<code>): full roster + every season's schedule, from data/osu_teams.json */
const osuDay = (iso, opts) => new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", ...opts });
const osuRec = r => r && r !== "0-0" ? r : null;

function osuGameRow(g, next) {
  const past = (g.end || g.date).slice(0, 10) < new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const multi = g.end && g.end.slice(0, 10) !== g.date.slice(0, 10);
  const when = osuDay(g.date, { weekday: "short", month: "short", day: "numeric" }) + (multi ? ` – ${osuDay(g.end, { month: "short", day: "numeric" })}` : "");
  const res = g.res ? h("b", { class: g.res === "W" ? "pos" : g.res === "L" ? "neg" : "" }, `${g.res} ${g.us ?? ""}${g.them != null ? `-${g.them}` : ""}`)
    : g.info ? h("span", { class: "small" }, g.info)
    : past ? h("span", { class: "muted small" }, "—")
    : h("span", { class: "muted small" }, next ? h("span", { class: "chip accent", style: { marginRight: "6px" } }, "Next") : null,
        g.time && !/^(TBA|All Day)$/i.test(g.time) ? `${g.time} PT` : g.time || "TBA");
  const links = [g.link && h("a", { class: "link small", href: g.link, target: "_blank", rel: "noopener" }, g.res || g.info ? "Recap" : "Preview"),
                 g.box && g.box !== g.link && h("a", { class: "link small", href: g.box, target: "_blank", rel: "noopener" }, "Box")].filter(Boolean);
  return h("tr", { class: next ? "osu-next" : "" },
    h("td", { class: "muted small nowrap" }, when),
    h("td", {}, h("div", { class: "osu-opp" }, g.logo ? h("img", { class: "logo", src: g.logo, alt: "", loading: "lazy" }) : h("span", { class: "logo" }),
      h("span", {}, `${g.atVs ? g.atVs + " " : ""}${g.opp}`, g.conf ? h("span", { class: "muted", title: "Conference game" }, " *") : null,
        g.exh ? h("span", { class: "chip", style: { marginLeft: "6px" } }, "Exh") : null)),
      h("div", { class: "muted small osu-loc" }, [g.loc, g.tv].filter(Boolean).join(" · "))),
    h("td", { class: "right nowrap" }, res, links.length ? h("div", { class: "osu-links" }, links) : null));
}

function osuPlayer(p) {
  const bits = [p.posLong || p.pos, p.yr, p.ht, p.wt ? `${p.wt} lbs` : null].filter(Boolean).join(" · ");
  return h("a", { class: "osu-pl", href: p.link, target: "_blank", rel: "noopener" },
    p.img ? h("img", { src: p.img, alt: "", loading: "lazy" }) : h("span", { class: "osu-pl-ph" }, "🦫"),
    h("div", { class: "osu-pl-body" },
      h("div", { class: "osu-pl-name" }, p.num ? h("span", { class: "osu-num" }, `#${p.num}`) : null, `${p.first || ""} ${p.last || ""}`,
        p.capt ? h("span", { class: "chip osu-off", title: "Captain" }, "C") : null),
      h("div", { class: "muted small" }, bits),
      h("div", { class: "muted small" }, [p.town, p.prev ? `from ${p.prev}` : p.hs].filter(Boolean).join(" · "))));
}

async function osuTeamView(code) {
  const d = await load("osu_teams");
  const t = d.teams.find(x => x.code === code);
  if (!t) return mount(h("div", { class: "card empty" }, "No team by that name. ", h("a", { class: "link", href: "#/beavers" }, "Back to Beavers →")));
  const seasons = t.seasons || [];
  let si = 0, tab = "schedule", q = "";
  const body = h("div");
  const draw = () => {
    if (tab === "schedule") {
      const s = seasons[si];
      if (!s) return body.replaceChildren(h("div", { class: "card empty" }, "No schedule posted."));
      const r = s.record || {}, played = s.games.filter(g => g.res);
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const nextG = s.games.find(g => !g.res && !g.info && (g.end || g.date).slice(0, 10) >= today);
      const w = played.filter(g => g.res === "W").length, l = played.filter(g => g.res === "L").length, tt = played.filter(g => g.res === "T").length;
      const recTxt = osuRec(r.overall) || (played.length ? `${w}-${l}${tt ? `-${tt}` : ""}` : null);
      body.replaceChildren(h("div", { class: "card" },
        h("div", { class: "card-head" },
          h("select", { class: "osu-season", onchange: e => { si = +e.target.value; draw(); } },
            seasons.map((x, i) => h("option", { value: i, selected: i === si ? "" : null }, x.title))),
          h("span", { class: "muted small" }, [recTxt && `Record ${recTxt}`, osuRec(r.conference) && `Conf ${r.conference}`,
            osuRec(r.home) && `Home ${r.home}`, osuRec(r.away) && `Away ${r.away}`, r.streak && r.streak !== "-" && recTxt ? `Streak ${r.streak}` : null,
            `${s.games.length} events`].filter(Boolean).join(" · "))),
        h("div", { class: "table-wrap" }, h("table", { class: "osu-sched-t" }, h("tbody", {}, s.games.map(g => osuGameRow(g, g === nextG))))),
        h("div", { class: "muted small", style: { marginTop: "8px" } }, "* conference game", s.note ? ` · ${s.note}` : "")));
    } else {
      const R = t.roster;
      if (!R) return body.replaceChildren(h("div", { class: "card empty" }, "No roster posted."));
      const needle = q.toLowerCase();
      const ps = R.players.filter(p => !needle || [p.first, p.last, p.num, p.pos, p.posLong, p.town, p.prev, p.hs].join(" ").toLowerCase().includes(needle))
        .sort((a, b) => (parseInt(a.num) || 999) - (parseInt(b.num) || 999) || (a.last || "").localeCompare(b.last || ""));
      const grid = h("div", { class: "osu-pl-grid" }, ps.length ? ps.map(osuPlayer) : h("div", { class: "empty" }, "No players match."));
      body.replaceChildren(
        h("div", { class: "card" },
          h("div", { class: "card-head" }, h("h2", {}, R.title || "Roster"),
            h("span", { class: "muted small" }, `${R.players.length} players`)),
          grid),
        R.coaches?.length ? h("div", { class: "card", style: { marginTop: "16px" } },
          h("div", { class: "card-head" }, h("h2", {}, "Coaching staff")),
          h("div", { class: "osu-pl-grid" }, R.coaches.map(c => h("div", { class: "osu-pl" },
            c.img ? h("img", { src: c.img, alt: "", loading: "lazy" }) : h("span", { class: "osu-pl-ph" }, "🦫"),
            h("div", { class: "osu-pl-body" }, h("div", { class: "osu-pl-name" }, c.name), h("div", { class: "muted small" }, c.title)))))) : null);
    }
  };
  const search = h("input", { class: "osu-search", type: "search", placeholder: "Search name, number, position, hometown…",
    oninput: e => { q = e.target.value; draw(); } });
  const tabs = h("div", { class: "osu-chips" });
  const drawTabs = () => tabs.replaceChildren(
    ...[["schedule", "Schedule & results"], ["roster", "Roster"]].map(([k, label]) =>
      h("button", { class: "chip" + (k === tab ? " on" : ""), onclick: () => { tab = k; search.hidden = k !== "roster"; drawTabs(); draw(); } }, label)),
    search);
  search.hidden = true;
  drawTabs();
  draw();
  const cur = seasons[0]?.record?.overall, last = seasons.find((s, i) => i > 0 && osuRec(s.record?.overall));
  mount(
    h("div", { class: "home-head" }, h("img", { class: "home-logo", src: "img/beaver-full.jpg", alt: "" }),
      h("div", {}, h("div", { class: "muted small" }, h("a", { class: "link", href: "#/beavers" }, "🦫 Beavers"), " / Teams"),
        h("h1", {}, `Oregon State ${t.title}`),
        h("div", { class: "muted" }, [osuRec(cur) ? `${seasons[0].title.replace(/ Schedule$/, "")}: ${cur}` : null,
          last ? `${last.title.replace(/ Schedule$/, "")}: ${last.record.overall}` : null,
          t.roster ? `${t.roster.players.length} on the roster` : null].filter(Boolean).join(" · ")))),
    osuTeamLinks(code), tabs, body,
    h("div", { class: "note" }, "Rosters, schedules and results from the official athletics site (osubeavers.com). Player cards link to official bios."));
}

function osuTeamLinks(active) {
  const box = h("div", { class: "osu-teams" }, h("span", { class: "muted small" }, "Teams:"));
  load("osu_teams").then(d => box.append(...d.teams.map(t =>
    h("a", { class: "chip" + (t.code === active ? " on" : ""), href: `#/beavers/${t.code}` }, t.short.replace(/^W /, "W. ").replace(/^M /, "M. "))))).catch(() => box.remove());
  return box;
}

const OSU = {
  team: osuTeamView,
  async view() {
    const d = await load("osu");
    const sched = d.schedule || { recent: [], upcoming: [] };
    const counts = {};
    for (const s of d.news) counts[s.sport] = (counts[s.sport] || 0) + 1;
    for (const e of [...sched.recent, ...sched.upcoming]) counts[osuBucket(e.sport)] = counts[osuBucket(e.sport)] || 0;
    const sports = OSU_ORDER.filter(s => s in counts);
    let pick = "", officialOnly = false;
    const body = h("div");
    const draw = () => {
      const keep = s => !pick || s === pick;
      const news = d.news.filter(s => keep(s.sport) && (!officialOnly || s.official));
      const recent = sched.recent.filter(e => keep(osuBucket(e.sport))).slice(0, 10);
      const up = sched.upcoming.filter(e => keep(osuBucket(e.sport))).slice(0, 10);
      body.replaceChildren(
        h("div", { class: "grid g2 osu-sched" },
          h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Coming up")),
            up.length ? up.map(osuEventRow) : h("div", { class: "empty" }, "Nothing on the calendar in the next two weeks.")),
          h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "Recent results")),
            recent.length ? recent.map(osuEventRow) : h("div", { class: "empty" }, "No results in the last two weeks."))),
        h("div", { class: "card", style: { marginTop: "16px" } },
          h("div", { class: "card-head" }, h("h2", {}, pick ? `${pick} news` : "Latest news"), h("span", { class: "muted small" }, `${news.length} stories`)),
          news.length ? [osuStory(news[0], true), news.slice(1, 60).map(s => osuStory(s))] : h("div", { class: "empty" }, "No recent stories for this sport.")));
    };
    const chips = h("div", { class: "osu-chips" });
    const drawChips = () => chips.replaceChildren(
      ...["", ...sports].map(s => h("button", { class: "chip" + (s === pick ? " on" : ""), onclick: () => { pick = s; drawChips(); draw(); } },
        s || "All sports", s && counts[s] ? h("span", { class: "muted" }, ` ${counts[s]}`) : null)),
      h("label", { class: "small osu-toggle" }, h("input", { type: "checkbox", onchange: e => { officialOnly = e.target.checked; draw(); } }), " Official site only"));
    drawChips();
    draw();
    mount(
      h("div", { class: "home-head" }, h("img", { class: "home-logo", src: "img/beaver-full.jpg", alt: "" }),
        h("div", {}, h("h1", {}, "Oregon State Beavers"),
          h("div", { class: "muted" }, `News and scores from every sport · updated ${fmt.ago(d.generated)}`))),
      osuTeamLinks(null), chips, body,
      h("div", { class: "note" }, "Stories link to their original source: osubeavers.com, OregonLive, BeaverBlitz (On3) and outlets found through Google News. Schedule and results from the official athletics calendar."));
  },
  /* home page card: latest headlines + the next few games */
  async homeCard() {
    const d = await load("osu").catch(() => null);
    if (!d?.news?.length) return null;
    const up = (d.schedule?.upcoming || []).slice(0, 3);
    return h("div", { class: "card osu-home" },
      h("div", { class: "card-head" }, h("h2", {}, "🦫 Beavers news"), h("a", { class: "link small", href: "#/beavers" }, "All sports →")),
      d.news.slice(0, 5).map(s => osuStory(s)),
      up.length ? h("div", { class: "osu-home-up" }, h("div", { class: "kicker" }, "Coming up"), up.map(osuEventRow)) : null);
  },
};
