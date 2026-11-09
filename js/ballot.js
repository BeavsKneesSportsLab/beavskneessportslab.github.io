/* ballot.js — "Parker's Top 25" home card. Hand-written each week: add the new week to BALLOTS below.
   Teams are ESPN CFB team ids (records, logos and the model's rank come from data/cfb.json).
   Each week: { top: [25 ids, #1 first], out: [first 4 out] }. */
const BALLOTS = {
  4: { top: ["251", "61", "57", "194", "87", "2390", "2294", "344", "333", "84", "2641", "254", "2483", "26", "252",
             "145", "99", "150", "2633", "197", "68", "30", "96", "154", "259"], out: [] },
  5: { top: ["251", "333", "194", "61", "87", "2390", "2641", "84", "254", "252", "142", "145", "2483", "26", "150",
             "57", "2294", "221", "99", "197", "2633", "68", "30", "344", "77"], out: [] },
  6: { top: ["61", "87", "2390", "84", "194", "2641", "252", "26", "251", "333", "254", "145", "142", "2633", "197",
             "248", "77", "239", "344", "68", "30", "154", "2294", "99", "96"], out: ["275", "2439", "12", "221"] },
  7: { top: ["252", "2390", "194", "26", "2641", "254", "145", "61", "87", "84", "2633", "96", "248", "2294", "154",
             "77", "333", "57", "30", "344", "68", "99", "12", "197", "256"], out: ["2567", "251", "142", "2483"] },
  8: { top: ["2390", "194", "26", "254", "96", "84", "252", "61", "87", "333", "77", "99", "2641", "248", "154",
             "251", "12", "145", "68", "57", "2633", "2567", "275", "135", "259"], out: ["197", "2294", "167", "30"] },
  9: { top: ["2390", "61", "26", "254", "96", "84", "252", "87", "333", "251", "154", "2641", "194", "145", "99",
             "30", "68", "2633", "2294", "77", "158", "142", "167", "12", "2579"], out: ["235", "150", "259", "135"] },
  10: { top: ["254", "61", "26", "87", "2390", "84", "154", "251", "333", "2633", "2641", "252", "30", "96", "2483",
              "68", "2294", "2579", "248", "12", "2567", "97", "150", "167", "194"], out: ["145", "275", "197", "239"] },
};

const Ballot = {
  async homeCard() {
    const d = await sportData("cfb").catch(() => null);
    if (!d) return null;
    const weeks = Object.keys(BALLOTS).map(Number).sort((a, b) => a - b);
    const box = h("div", {});
    const sel = h("select", { class: "ballot-week", "aria-label": "Ballot week" },
      weeks.slice().reverse().map(w => h("option", { value: w }, `Week ${w}`)));
    const draw = w => {
      const B = BALLOTS[w], prev = BALLOTS[w - 1];
      const was = prev ? Object.fromEntries(prev.top.map((id, i) => [id, i + 1])) : null;
      const row = (id, i) => {
        const T = team(d, id);
        let mv = h("span", { class: "bmv muted" }, "—");
        if (was) {
          const p = was[id];
          mv = p == null ? h("span", { class: "bmv new" }, "NEW")
            : p > i + 1 ? h("span", { class: "bmv up", title: `Was #${p}` }, `▲${p - i - 1}`)
            : p < i + 1 ? h("span", { class: "bmv down", title: `Was #${p}` }, `▼${i + 1 - p}`)
            : mv;
        }
        return h("a", { class: "brow", href: `#/cfb/team/${id}` },
          h("span", { class: "brk" }, i + 1), mv, logo(T),
          h("span", { class: "bnm" }, T.short),
          h("span", { class: "muted small" }, T.record || ""),
          h("span", { class: "bmod muted small", title: "This team's rank in our model's power ratings" }, T.rank ? `Model #${T.rank}` : ""));
      };
      const names = ids => ids.map(id => team(d, id).short).join(", ");
      const dropped = was ? prev.top.filter(id => !B.top.includes(id) && !B.out.includes(id)) : [];
      box.replaceChildren(
        h("div", { class: "ballot-grid" }, B.top.map(row)),
        h("div", { class: "ballot-notes small" },
          B.out.length ? h("div", {}, h("b", {}, "First 4 out: "), names(B.out)) : null,
          dropped.length ? h("div", { class: "muted" }, h("b", {}, "Dropped out: "), names(dropped)) : null));
    };
    sel.addEventListener("change", () => draw(+sel.value));
    draw(weeks[weeks.length - 1]);
    return h("section", { class: "card ballot" },
      h("div", { class: "card-head" },
        h("h2", {}, "🏆 Parker's Top 25"), sel),
      h("p", { class: "muted small" }, "Parker's weekly college football ballot. Arrows show the move from his previous week; \"Model\" is where our power ratings have the team. Records are current."),
      box);
  },
};
