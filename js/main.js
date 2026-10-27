/* main.js — router + nav. Routes: #/  #/{sport}/{tab}[/args...] */
const ROUTES = {
  ratings: s => Views.ratings(s), predictions: s => Views.predictions(s), standings: s => Views.standings(s),
  rumors: s => Views.rumors(s), record: s => Views.record(s), player: (s, a) => Players.page(s, a), compare: (s, a) => Players.compare(s, a), hotstove: s => Players.hotStove(s), projections: s => Views.projections(s), board: s => Views.board(s), teams: s => Views.teams(s), team: (s, a) => Views.team(s, a[0]),
  sim: (s, a) => Sim.view(s, a), trade: (s, a) => Trade.view(s, a),
  disappoint: () => CFB.disappoint(), playoff: () => CFB.playoff(), heisman: () => CFB.heisman(), recruiting: () => CFB.recruiting(), portal: () => CFB.portal(),
};

function drawNav(sport, tab) {
  $("#sportNav").replaceChildren(...Object.entries(SPORTS).map(([k, s]) =>
    h("a", { href: `#/${k}/${k === "cfb" ? "ratings" : "predictions"}`, class: k === sport ? "on" : "" }, s.name, s.featured ? h("span", { class: "star" }, "★") : null)),
    h("a", { href: "#/pickem", class: "pk-nav" + (tab === "pickem" ? " on" : "") }, "Pick'em"));
  $("#subNav").replaceChildren(...(sport ? SPORTS[sport].tabs.map(([k, label]) =>
    h("a", { href: `#/${sport}/${k}`, class: k === tab || (["team", "player", "compare"].includes(tab) && k === "teams") ? "on" : "" }, label)) : []));
}

async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const sport = SPORTS[parts[0]] ? parts[0] : null;
  const tab = sport ? parts[1] || (sport === "cfb" ? "ratings" : "predictions") : parts[0] === "pickem" ? "pickem" : null;
  drawNav(sport, tab);
  const meta = await load("meta").catch(() => ({}));
  const m = sport && meta[sport];
  // stale-data banner: the cloud build runs daily; >36h old or a failed build means something broke
  const bad = Object.entries(meta).filter(([k, v]) => (!sport || k === sport) && (v.status !== "ok" || Date.now() - new Date(v.built) > 36 * 3600e3));
  const banner = $("#staleBanner");
  if (banner) {
    banner.hidden = !bad.length;
    banner.textContent = bad.length ? `Heads up: ${bad.map(([k]) => SPORTS[k]?.name || k).join(", ")} data hasn't refreshed since ${fmt.ago(bad[0][1].built)}. Numbers may be out of date.` : "";
  }
  $("#foot").textContent = (m ? `${SPORTS[sport].full} data built ${fmt.ago(m.built)}${m.status !== "ok" ? ` - LAST BUILD ${m.status.toUpperCase()}, showing older data` : ""}. ` : "") +
    "Beavs Knees Sports Lab - independent fan project, not affiliated with Oregon State University or any league. Sources: ESPN, NHL & MLB stats APIs, CollegeFootballData, Trade Rumors network. Ratings are our own models. For fun and analysis, not betting advice.";
  $("#app").replaceChildren(h("div", { class: "loading" }, "Loading…"));
  try {
    if (tab === "pickem") await Pickem.view();
    else if (!sport) await Views.home();
    else if (ROUTES[tab]) await ROUTES[tab](sport, parts.slice(2));
    else mount(h("div", { class: "card empty" }, "Unknown page."));
  } catch (e) { console.error(e); mount(errorBox(e)); }
}

(function theme() {
  const saved = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  document.documentElement.dataset.theme = saved || "dark";   // black + orange is the house look
  $("#themeBtn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark";
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch {}
  });
})();
window.addEventListener("hashchange", route);
window.addEventListener("hashchange", () => {        // GoatCounter: count each tab as a page view
  try { window.goatcounter?.count?.({ path: location.pathname + location.hash.replace(/^#/, "") || "/" }); } catch {}
});
route();
