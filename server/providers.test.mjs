import test from "node:test";
import assert from "node:assert/strict";
import {
  belongsToMedium,
  parseSearchHtml,
  parseYouTubeHtml,
  collectPlatform,
  connectionStatus,
} from "./providers.mjs";

test("dedicated blog and cafe providers exclude other media and navigation", async () => {
  assert.equal(
    belongsToMedium("https://blog.naver.com/person/123", "naver_blog"),
    true,
  );
  assert.equal(
    belongsToMedium("https://blog.naver.com/person", "naver_blog"),
    false,
  );
  assert.equal(
    belongsToMedium("https://cafe.naver.com/group/123", "naver_blog"),
    false,
  );
  assert.equal(
    belongsToMedium(
      "https://cafe.naver.com/ArticleRead.nhn?clubid=1&articleid=2",
      "naver_cafe",
    ),
    true,
  );
  assert.equal(
    belongsToMedium("https://cafe.naver.com.evil.org/group/123", "naver_cafe"),
    false,
  );
  assert.equal(
    belongsToMedium("https://cafe.daum.net/group/board/123", "daum_cafe"),
    true,
  );
  assert.equal(
    belongsToMedium("https://cafe.daum.net/group", "daum_cafe"),
    false,
  );
  for (const medium of ["naver_blog", "naver_cafe", "daum_cafe"]) {
    const result = await collectPlatform(
      medium,
      { query: "브랜드", limit: 10 },
      {
        environment: {
          NAVER_CLIENT_ID: "id",
          NAVER_CLIENT_SECRET: "secret",
          KAKAO_REST_API_KEY: "key",
        },
        webReader: async (value, _signal, options) => {
          const url = new URL(value);
          const expected = {
            naver_blog: "/v1/search/blog.json",
            naver_cafe: "/v1/search/cafearticle.json",
            daum_cafe: "/v2/search/cafe",
          }[medium];
          assert.equal(url.pathname, expected);
          assert.equal(url.searchParams.get("query"), "브랜드");
          if (medium === "daum_cafe") {
            assert.equal(options.headers.Authorization, "KakaoAK key");
            return {
              text: JSON.stringify({
                meta: { is_end: true },
                documents: [
                  {
                    title: "브랜드",
                    contents: "요약",
                    url: "https://cafe.daum.net/group/board/123",
                    datetime: "2026-01-02T10:00:00+09:00",
                  },
                ],
              }),
            };
          }
          assert.equal(options.headers["X-Naver-Client-Secret"], "secret");
          return {
            text: JSON.stringify({
              items: [
                {
                  title: "<b>브랜드</b>",
                  description: "요약",
                  link:
                    medium === "naver_blog"
                      ? "https://blog.naver.com/person/123"
                      : "https://cafe.naver.com/group/123",
                  postdate: "20260102",
                },
              ],
            }),
          };
        },
      },
    );
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].title, "브랜드");
    assert.equal(Boolean(result.items[0].isoDate), medium !== "naver_cafe");
  }
});

test("public index rejects unrelated and spoofed domains", () => {
  assert.equal(
    belongsToMedium("https://instagram.com.evil.org/p/id/", "instagram"),
    false,
  );
  assert.equal(
    belongsToMedium("https://www.instagram.com/p/id/", "instagram"),
    true,
  );
  assert.equal(
    belongsToMedium("https://www.tiktok.com/@user/video/1234", "tiktok"),
    true,
  );
  assert.equal(
    belongsToMedium("https://www.youtube.com/watch?v=abcdefghijk", "youtube"),
    true,
  );
  const items = parseSearchHtml(
    '<li class="b_algo"><h2><a href="https://www.instagram.com/p/id/">브랜드 &amp; 후기</a></h2><div class="b_caption"><p>공개 요약</p></div></li><li class="b_algo"><h2><a href="https://other.org/">다른 매체 결과</a></h2></li>',
    "instagram",
    "https://www.bing.com/search",
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "브랜드 & 후기");
  assert.throws(() =>
    parseSearchHtml(
      "<title>Access denied CAPTCHA</title>",
      "instagram",
      "https://www.bing.com/search",
    ),
  );
});

test("dedicated providers reject impossible blog dates and include the last indexed search day", async () => {
  const result = await collectPlatform(
    "naver_blog",
    { query: "브랜드", limit: 10 },
    {
      environment: { NAVER_CLIENT_ID: "id", NAVER_CLIENT_SECRET: "secret" },
      webReader: async () => ({
        text: JSON.stringify({
          items: [
            {
              title: "브랜드",
              link: "https://blog.naver.com/person/123",
              postdate: "20260230",
            },
          ],
        }),
      }),
    },
  );
  assert.equal(result.items[0].isoDate, undefined);
  await collectPlatform(
    "daum_cafe",
    {
      query: "브랜드",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      limit: 10,
    },
    {
      environment: {},
      webReader: async (value) => {
        assert.match(new URL(value).searchParams.get("q"), /before:2026-10-01/);
        return { text: "<title>검색 결과</title>", url: value };
      },
    },
  );
});

test("YouTube public structured search extracts videos without inventing dates", () => {
  const data = {
    contents: [
      {
        videoRenderer: {
          videoId: "abcdefghijk",
          title: { runs: [{ text: "브랜드 영상" }] },
          ownerText: { runs: [{ text: "채널" }] },
        },
      },
    ],
  };
  const items = parseYouTubeHtml(
    `<script>var ytInitialData = ${JSON.stringify(data)};</script>`,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].creator, "채널");
  assert.equal(items[0].isoDate, undefined);
});

test("Naver official API uses headers, extracts dates and never exposes secrets", async () => {
  const environment = {
    NAVER_CLIENT_ID: "test-id",
    NAVER_CLIENT_SECRET: "test-secret",
  };
  const result = await collectPlatform(
    "naver",
    { query: "브랜드", limit: 20 },
    {
      environment,
      webReader: async (url, _signal, options) => {
        assert.equal(new URL(url).hostname, "openapi.naver.com");
        assert.equal(options.headers["X-Naver-Client-Secret"], "test-secret");
        return {
          text: JSON.stringify({
            items: [
              {
                title: "<b>브랜드</b>",
                link: "https://n.news.naver.com/article/001/123",
                pubDate: "Wed, 30 Sep 2026 10:00:00 +0900",
              },
            ],
          }),
        };
      },
    },
  );
  assert.equal(result.mode, "api");
  assert.equal(result.items[0].title, "브랜드");
  assert.ok(result.items[0].pubDate);
  assert.equal(
    JSON.stringify(connectionStatus(environment)).includes("test-secret"),
    false,
  );
});

test("YouTube official API applies date filters and pagination", async () => {
  let calls = 0;
  const result = await collectPlatform(
    "youtube",
    {
      query: "브랜드",
      limit: 100,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    },
    {
      environment: { YOUTUBE_API_KEY: "test-key" },
      webReader: async (value) => {
        const url = new URL(value);
        calls++;
        assert.equal(
          url.searchParams.get("publishedAfter"),
          "2026-09-01T00:00:00+09:00",
        );
        return {
          text: JSON.stringify({
            nextPageToken: calls === 1 ? "next" : null,
            items: [
              {
                id: { videoId: "abcdefghijk" },
                snippet: {
                  title: "브랜드 영상",
                  publishedAt: "2026-09-10T00:00:00Z",
                },
              },
            ],
          }),
        };
      },
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.mode, "api");
});

test("native Naver search permits publisher result URLs but index search still rejects them", () => {
  const html =
    '<a target="_blank" href="https://www.publisher.org/article/1">브랜드 기사새 창 열림</a>';
  const native = parseSearchHtml(
    html,
    "naver",
    "https://search.naver.com/search.naver",
  );
  assert.equal(native.length, 1);
  assert.equal(native[0].title, "브랜드 기사");
  assert.equal(
    parseSearchHtml(html, "naver", "https://www.bing.com/search").length,
    0,
  );
});
