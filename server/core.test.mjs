import test from "node:test";
import assert from "node:assert/strict";
import { newsUrl } from "./collector.mjs";

test("RSS collection requires a registered target and negative expression and combines both in search", () => {
  const state = initialState();
  const keyword = {
    id: "target",
    name: "브랜드",
    aliases: ["별칭"],
    excludes: ["채용"],
    negativeWords: ["불만", "환불"],
    enabled: true,
  };
  state.keywords.push(keyword);
  const query = new URL(newsUrl(keyword)).searchParams.get("q");
  assert.equal(query, '("브랜드" OR "별칭") ("불만" OR "환불")');
  addItems(
    state,
    [
      { title: "브랜드 추천", link: "https://example.org/positive" },
      { title: "별칭 환불", link: "https://example.org/negative" },
      { title: "브랜드 불만 채용", link: "https://example.org/excluded" },
    ],
    "RSS",
    new Date(),
    { negativeOnly: true },
  );
  assert.equal(state.mentions.length, 1);
  assert.deepEqual(state.mentions[0].matchedNegativeWords, ["환불"]);
});
import {
  initialState,
  matchesKeyword,
  analyze,
  addItems,
  safeLink,
  csvCell,
  seedDemo,
  prune,
} from "./core.mjs";

const keyword = {
  id: "brand",
  name: "모아커피",
  aliases: ["MOA"],
  excludes: ["채용"],
  enabled: true,
};
test("keyword names and aliases match; exclusions and disabled keywords do not", () => {
  assert.equal(matchesKeyword("moa review", keyword), true);
  assert.equal(matchesKeyword("모아커피 채용", keyword), false);
  assert.equal(
    matchesKeyword("모아커피", { ...keyword, enabled: false }),
    false,
  );
  assert.equal(matchesKeyword("다른 브랜드", keyword), false);
  assert.equal(
    matchesKeyword("새브랜드", { ...keyword, name: "새브랜드" }),
    true,
  );
});
test("sentiment has evidence and balances positive and negative signals", () => {
  const { settings } = initialState();
  assert.equal(analyze("불만 환불", settings).score, -2);
  assert.equal(analyze("만족 추천", settings).sentiment, "positive");
  assert.equal(analyze("만족 불만", settings).sentiment, "neutral");
});
test("collection deduplicates and triggers threshold alerts", () => {
  const state = initialState();
  state.keywords = [keyword];
  const item = {
    title: "모아커피 불만 환불",
    link: "https://example.org/article",
  };
  assert.equal(addItems(state, [item, item], "뉴스"), 1);
  assert.equal(state.alerts.length, 1);
  assert.equal(addItems(state, [item], "뉴스"), 0);
  assert.equal(state.mentions.length, 1);
});
test("duplicate mentions retain matching keyword links", () => {
  const state = initialState();
  state.keywords = [keyword];
  const item = {
    title: "모아커피 새브랜드",
    link: "https://example.org/article",
  };
  addItems(state, [item], "뉴스");
  state.keywords.push({ ...keyword, id: "second", name: "새브랜드" });
  addItems(state, [item], "뉴스");
  assert.deepEqual(state.mentions[0].keywordIds, ["brand", "second"]);
});
test("unsafe links and irrelevant mentions are rejected", () => {
  assert.equal(safeLink("javascript:alert(1)"), "");
  assert.equal(safeLink("https://user:pass@example.com"), "");
  const state = initialState();
  state.keywords = [keyword];
  assert.equal(
    addItems(
      state,
      [{ title: "다른 브랜드", link: "https://example.org" }],
      "뉴스",
    ),
    0,
  );
});
test("CSV escapes quotes and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell('a"b'), '"a""b"');
});
test("retention removes expired mentions and their alerts", () => {
  const state = initialState();
  seedDemo(state);
  assert.equal(state.mentions.length, 9);
  prune(state, new Date(Date.now() + 100 * 86400000));
  assert.equal(state.mentions.length, 0);
  assert.equal(state.alerts.length, 0);
});
