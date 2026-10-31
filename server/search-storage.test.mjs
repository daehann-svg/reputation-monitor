import test from "node:test";
import assert from "node:assert/strict";
import { initialState, addItems, reviewCandidates } from "./core.mjs";
import { backupSchema, mentionPatchSchema } from "./schemas.mjs";
import { exportCsv, exportReport } from "./reports.mjs";
import { searchMedia, saveSearchResults } from "./search.mjs";

test("identical title and summary group different URLs while repeated URLs preserve human records", async () => {
  const state = initialState();
  const store = { update: (change) => change(state) };
  const search = () =>
    searchMedia(
      {
        query: "브랜드",
        negativeWords: ["불만"],
        negativeOnly: true,
        duplicatesOnly: true,
        media: ["naver_blog", "naver_cafe"],
      },
      undefined,
      undefined,
      {
        platformCollector: async (medium) => ({
          mode: "index",
          warnings: [],
          items: [
            {
              title: "브랜드 불만 글",
              contentSnippet: "동일한 요약 내용입니다.",
              link:
                medium === "naver_blog"
                  ? "https://blog.naver.com/person/1"
                  : "https://cafe.naver.com/group/1",
            },
            {
              title: "브랜드 불만 개별 글",
              contentSnippet: `다른 ${medium} 내용`,
              link:
                medium === "naver_blog"
                  ? "https://blog.naver.com/person/2"
                  : "https://cafe.naver.com/group/2",
            },
          ],
        }),
      },
    );
  const result = await search();
  assert.equal(result.duplicateGroups, 1);
  assert.equal(
    result.platforms.flatMap((platform) => platform.results).length,
    2,
  );
  assert.equal(result.platforms[0].results[0].contentCopies, 2);
  saveSearchResults(store, result);
  assert.equal(result.saved, 2);
  assert.equal(
    new Set(state.mentions.map((mention) => mention.contentKey)).size,
    1,
  );
  state.mentions[0].note = "담당자 기록";
  saveSearchResults(store, await search());
  assert.equal(state.mentions[0].seenCount, 2);
  assert.equal(state.mentions[0].note, "담당자 기록");
  assert.deepEqual(state.mentions[0].matchedNegativeWords, ["불만"]);
  assert.equal(backupSchema.parse(state).mentions[0].seenCount, 2);
  assert.match(exportCsv(state), /감지 부정 키워드/);
  assert.match(exportReport(state), /제목·요약 동일 2개 URL · URL 조회 2회/);
});

test("review candidates are expression matches, not sentiment or legal decisions", () => {
  assert.deepEqual(reviewCandidates("배송이 불량이라 환불 요청"), []);
  assert.equal(reviewCandidates("협박 예방 교육")[0].category, "위협 표현");
  const candidates = reviewCandidates(
    "브랜드 개인정보 유출 및 전화번호 공개 010-1234-5678",
  );
  assert.ok(candidates.length);
  assert.equal(JSON.stringify(candidates).includes("010-1234-5678"), false);
});

test("dedicated search expands aliases and expressions, excludes and preserves review evidence", async () => {
  const queries = new Set();
  const state = initialState();
  const store = { update: (change) => change(state) };
  const search = () =>
    searchMedia(
      {
        query: "대상",
        aliases: ["별칭"],
        excludes: ["채용"],
        problemTerms: ["협박"],
        candidateOnly: true,
        media: ["naver_blog", "naver_cafe", "daum_cafe"],
      },
      undefined,
      undefined,
      {
        platformCollector: async (medium, input) => {
          queries.add(input.query);
          const links = {
            naver_blog: "https://blog.naver.com/person/123",
            naver_cafe: "https://cafe.naver.com/group/123",
            daum_cafe: "https://cafe.daum.net/group/board/123",
          };
          return {
            mode: "index",
            warnings: [],
            items: [
              { title: "별칭 개인정보 유출 검토", link: links[medium] },
              { title: "대상 채용 협박 예방", link: `${links[medium]}4` },
              { title: "대상 환불 불만", link: `${links[medium]}5` },
            ],
          };
        },
      },
    );
  const result = await search();
  assert.deepEqual([...queries].sort(), ["대상", "대상 협박", "별칭"].sort());
  assert.equal(result.platforms.flatMap((item) => item.results).length, 3);
  saveSearchResults(store, result);
  assert.equal(result.saved, 3);
  const mention = state.mentions[0];
  mention.review = {
    decision: "source_checked",
    quote: '=HYPERLINK("bad") <script>alert(1)</script>',
    context: "원문 문맥을 확인함",
    reviewer: "확인자",
    checkedAt: new Date().toISOString(),
  };
  assert.ok(mentionPatchSchema.safeParse({ review: mention.review }).success);
  assert.equal(
    mentionPatchSchema.safeParse({ review: { ...mention.review, quote: "" } })
      .success,
    false,
  );
  assert.equal(
    mentionPatchSchema.safeParse({
      review: {
        ...mention.review,
        checkedAt: new Date(Date.now() + 86400000).toISOString(),
      },
    }).success,
    false,
  );
  const again = await search();
  saveSearchResults(store, again);
  assert.equal(again.saved, 0);
  assert.equal(
    state.mentions.find((item) => item.id === mention.id).review.context,
    "원문 문맥을 확인함",
  );
  const restored = backupSchema.parse(state);
  assert.equal(restored.mentions[0].review.reviewer, "확인자");
  const html = exportReport(state, [mention.id]);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(html.includes("<script>"), false);
  assert.ok(html.includes("위법 판정이 아닙니다"));
  assert.ok(exportCsv(state, [mention.id]).includes("'="));
  delete mention.review;
  delete mention.reviewCandidates;
  const migrated = backupSchema.parse(state).mentions[0];
  assert.equal(migrated.review.decision, "unreviewed");
  assert.ok(migrated.reviewCandidates.length);
});

test("keyword search saves without registering a monitoring keyword and preserves workflow on duplicates", () => {
  const state = initialState();
  const now = new Date();
  const items = [
    {
      title: "검색 결과 불만 환불",
      link: "https://example.org/result",
      isoDate: now.toISOString(),
    },
  ];
  const metadata = {
    searchQuery: "임의 검색",
    medium: "naver",
    dateBasis: "published",
  };
  assert.equal(addItems(state, items, "네이버", now, metadata), 1);
  state.mentions[0].note = "대응 중";
  state.mentions[0].status = "reviewing";
  assert.equal(addItems(state, items, "네이버", now, metadata), 0);
  assert.equal(state.keywords.length, 0);
  assert.equal(state.mentions[0].note, "대응 중");
  assert.equal(state.mentions[0].searchQuery, "임의 검색");
  assert.equal(state.mentions[0].medium, "naver");
  assert.equal(state.alerts.length, 1);
  assert.equal(backupSchema.parse(state).mentions[0].medium, "naver");
});

test("unknown publication dates are labeled as collection dates", () => {
  const state = initialState();
  addItems(
    state,
    [{ title: "공개 색인", link: "https://www.instagram.com/p/example/" }],
    "인스타그램 색인",
    new Date(),
    { searchQuery: "브랜드", medium: "instagram", dateBasis: "collected" },
  );
  assert.equal(state.mentions[0].dateBasis, "collected");
});
