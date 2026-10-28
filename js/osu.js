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

const OSU = {
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
      chips, body,
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
