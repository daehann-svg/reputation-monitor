import test from "node:test";
import assert from "node:assert/strict";
import { searchSchema, searchLinks, searchMedia } from "./search.mjs";

test("negative collection queries target and negative combinations and rejects unrelated results", async () => {
  const queries = new Set();
  const result = await searchMedia(
    {
      query: "브랜드",
      aliases: ["별칭"],
      negativeWords: ["불만", "환불"],
      negativeOnly: true,
      media: ["naver_blog"],
    },
    undefined,
    undefined,
    {
      platformCollector: async (_medium, input) => {
        queries.add(input.query);
        return {
          mode: "index",
          warnings: [],
          items: [
            {
              title: "별칭 환불 요청",
              contentSnippet: "실제 고객 의견",
              link: "https://blog.naver.com/person/1",
            },
            {
              title: "브랜드 추천 후기",
              link: "https://blog.naver.com/person/2",
            },
            {
              title: "다른 업체 불만",
              link: "https://blog.naver.com/person/3",
            },
          ],
        };
      },
    },
  );
  assert.deepEqual(
    [...queries].sort(),
    ["브랜드 불만", "브랜드 환불", "별칭 불만", "별칭 환불"].sort(),
  );
  assert.equal(result.platforms[0].results.length, 1);
  assert.deepEqual(result.platforms[0].results[0].matchedNegativeWords, [
    "환불",
  ]);
  assert.equal(
    searchSchema.safeParse({
      query: "브랜드",
      media: ["google"],
      negativeOnly: true,
    }).success,
    false,
  );
});

test("negative collection retains matching results from later expanded queries", async () => {
  const negativeWords = Array.from({ length: 8 }, (_, index) => `term${index}`);
  const result = await searchMedia(
    {
      query: "브랜드",
      negativeWords,
      negativeOnly: true,
      media: ["naver_blog"],
      limit: 10,
    },
    undefined,
    undefined,
    {
      platformCollector: async (_medium, input) => ({
        mode: "index",
        warnings: [],
        items: input.query.endsWith("term7")
          ? [
              {
                title: "브랜드 term7 의견",
                link: "https://blog.naver.com/person/99999",
              },
            ]
          : Array.from({ length: 300 }, (_, index) => ({
              title: "업계 안내",
              link: `https://blog.naver.com/person/${index}`,
            })),
      }),
    },
  );
  assert.equal(result.platforms[0].results.length, 1);
  assert.equal(
    result.platforms[0].results[0].url,
    "https://blog.naver.com/person/99999",
  );
  assert.deepEqual(result.platforms[0].results[0].matchedNegativeWords, [
    "term7",
  ]);
});

test("Google negative collection searches independent target and negative phrases", async () => {
  let query;
  const result = await searchMedia(
    {
      query: "브랜드",
      negativeWords: ["환불 문제"],
      negativeOnly: true,
      media: ["google"],
    },
    async (url) => {
      query = new URL(url).searchParams.get("q");
      return {
        items: [
          {
            title: "브랜드 고객이 환불 문제를 제기",
            link: "https://example.com/review",
          },
        ],
      };
    },
  );
  assert.ok(query.includes('"브랜드"'));
  assert.ok(query.includes('"환불 문제"'));
  assert.ok(!query.includes('"브랜드 환불 문제"'));
  assert.equal(result.platforms[0].results.length, 1);
});

test("media search validates calendar dates and date order", () => {
  const input = {
    query: "브랜드",
    media: ["google"],
    startDate: "2026-02-28",
    endDate: "2026-03-01",
  };
  assert.equal(searchSchema.parse(input).query, "브랜드");
  for (const dates of [
    { startDate: "2026-02-30" },
    { startDate: "2026-03-02" },
    { endDate: "" },
  ])
    assert.throws(() => searchSchema.parse({ ...input, ...dates }));
  assert.throws(() => searchSchema.parse({ ...input, media: ["unknown"] }));
});

test("five media links preserve Unicode queries and explicit date ranges", () => {
  const input = {
    query: "브랜드 & 제품",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  };
  for (const media of ["naver", "google", "youtube", "tiktok", "instagram"]) {
    const links = searchLinks(media, input);
    assert.equal(new URL(links.nativeUrl).protocol, "https:");
    const indexed = new URL(links.periodUrl);
    assert.ok(indexed.searchParams.get("q").includes(input.query));
    assert.match(indexed.searchParams.get("q"), /before:2026-10-01/);
    if (!["naver", "google"].includes(media))
      assert.equal(links.nativePeriod, false);
  }
  const naver = new URL(searchLinks("naver", input).nativeUrl);
  assert.equal(naver.searchParams.get("ds"), "2026.09.01");
  assert.equal(naver.searchParams.get("de"), "2026.09.30");
  assert.equal(
    new URL(searchLinks("instagram", input).nativeUrl).searchParams.get("q"),
    input.query,
  );
});

test("live news search filters inclusive Korean dates, sanitizes and deduplicates", async () => {
  let fetched;
  const result = await searchMedia(
    {
      query: "브랜드",
      media: ["google"],
      startDate: "2026-09-01",
      endDate: "2026-09-01",
    },
    async (url) => {
      fetched = new URL(url);
      return {
        items: [
          {
            title: "<b>브랜드 첫 기사</b>",
            link: "https://example.com/first",
            isoDate: "2026-08-31T15:00:00Z",
          },
          {
            title: "브랜드 마지막 기사",
            link: "https://example.com/last",
            isoDate: "2026-09-01T14:59:59Z",
          },
          {
            title: "브랜드 중복",
            link: "https://example.com/first",
            isoDate: "2026-09-01T00:00:00Z",
          },
          {
            title: "브랜드 다음 날",
            link: "https://example.com/next",
            isoDate: "2026-09-01T15:00:00Z",
          },
          { title: "브랜드 날짜 없음", link: "https://example.com/no-date" },
          {
            title: "다른 기사",
            link: "https://example.com/other",
            isoDate: "2026-09-01T00:00:00Z",
          },
          {
            title: "브랜드 위험 링크",
            link: "javascript:alert(1)",
            isoDate: "2026-09-01T00:00:00Z",
          },
        ],
      };
    },
  );
  assert.match(
    fetched.searchParams.get("q"),
    /after:2026-09-01 before:2026-09-02/,
  );
  assert.equal(result.platforms[0].results.length, 2);
  assert.equal(result.platforms[0].results[1].title, "브랜드 첫 기사");
});

test("non-Google media collect real data and individual failures preserve other media", async () => {
  const external = await searchMedia(
    { query: "브랜드", media: ["naver", "youtube", "tiktok", "instagram"] },
    async () => {
      throw new Error("must not fetch");
    },
    undefined,
    {
      platformCollector: async () => ({
        mode: "index",
        items: [],
        warnings: [],
      }),
    },
  );
  assert.ok(external.platforms.every((platform) => !platform.error));
  const failed = await searchMedia(
    { query: "브랜드", media: ["google"] },
    async () => {
      throw new Error("offline");
    },
  );
  assert.match(failed.platforms[0].error, /offline/);
  assert.ok(failed.platforms[0].nativeUrl);
});

test("failed alias searches retain successful primary results and warn", async () => {
  const result = await searchMedia(
    { query: "브랜드", aliases: ["별칭"], media: ["naver_blog"] },
    undefined,
    undefined,
    {
      platformCollector: async (_medium, input) => {
        if (input.query === "별칭") throw new Error("offline");
        return {
          mode: "index",
          items: [
            {
              title: "브랜드 공개 결과",
              link: "https://blog.naver.com/person/123",
            },
          ],
          warnings: [],
        };
      },
    },
  );
  assert.equal(result.platforms[0].error, null);
  assert.equal(result.platforms[0].results.length, 1);
  assert.ok(
    result.platforms[0].warnings.some((warning) =>
      warning.includes("일부 검색어 조회 실패"),
    ),
  );
});
