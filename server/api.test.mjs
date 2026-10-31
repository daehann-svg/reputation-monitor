import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "./store.mjs";
import { Collector, publicAddress, validateFeedUrl } from "./collector.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedDemo } from "./core.mjs";
import { exportReport } from "./reports.mjs";
import { createApp } from "./app.mjs";

test("public feed networking rejects private and special IP ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.2",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "0.0.0.0",
  ])
    assert.equal(publicAddress(address), false);
  assert.equal(publicAddress("8.8.8.8"), true);
});
test("SQLite data survives close and reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "reputation-test-"));
  try {
    const filename = join(directory, "state.sqlite");
    const first = new Store(filename);
    first.update(seedDemo);
    first.close();
    const second = new Store(filename);
    assert.equal(second.state.mentions.length, 9);
    assert.equal(second.state.mentions[0].priority, "normal");
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("collector cancellation releases lock and preserves a completed feed", async () => {
  const store = new Store(":memory:");
  store.update(seedDemo);
  store.update((state) => {
    state.keywords.push({ ...state.keywords[0], id: "second", name: "두번째" });
  });
  let calls = 0;
  let started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const collector = new Collector(store, async (_url, signal) => {
    if (++calls === 1)
      return {
        items: [
          { title: "모아커피 환불 뉴스", link: "https://example.org/new" },
        ],
      };
    started();
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      }),
    );
  });
  try {
    const pending = collector.run();
    await entered;
    assert.equal(collector.progress.completed, 1);
    await assert.rejects(collector.run(), /이미 수집/);
    collector.cancel();
    const result = await pending;
    assert.equal(result.added, 1);
    assert.match(result.errors[0], /취소/);
    assert.equal(collector.running, false);
    assert.equal(collector.progress, null);
  } finally {
    store.close();
  }
});
test("feed validation supports cancellation and blocks credential URLs", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    validateFeedUrl("https://news.google.com/rss", controller.signal),
  );
  await assert.rejects(validateFeedUrl("https://user:pass@example.org/rss"));
});
test("HTML report escapes hostile text and respects selection", () => {
  const store = new Store(":memory:");
  try {
    store.update(seedDemo);
    const selected = store.state.mentions[0];
    selected.title = "<script>alert(1)</script>";
    const report = exportReport(store.state, [selected.id]);
    assert.equal(report.includes("<script>"), false);
    assert.match(report, /&lt;script&gt;/);
    assert.equal(report.includes(store.state.mentions[1].title), false);
  } finally {
    store.close();
  }
});
test("search API persists all media, deduplicates and survives backup restoration", async () => {
  const store = new Store(":memory:");
  const collector = new Collector(store, async () => ({
    items: [
      {
        title: "임의검색 불만 환불",
        link: "https://example.org/search-news",
        isoDate: new Date().toISOString(),
      },
    ],
  }));
  const urls = {
    naver: "https://blog.naver.com/test/1",
    youtube: "https://www.youtube.com/watch?v=abcdefghijk",
    tiktok: "https://www.tiktok.com/@test/video/1234",
    instagram: "https://www.instagram.com/p/test/",
  };
  const server = createApp(store, collector, {
    platformCollector: async (medium) => ({
      mode: "index",
      items: [{ title: "임의검색 공개 게시물", link: urls[medium] }],
      warnings: [],
    }),
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  try {
    const input = {
      query: "임의검색",
      media: ["naver", "google", "youtube", "tiktok", "instagram"],
    };
    const first = await (await post("/api/search", input)).json();
    assert.equal(first.saved, 5);
    assert.equal(store.state.keywords.length, 0);
    assert.equal(store.state.mentions.length, 5);
    store.update((state) => {
      state.mentions[0].note = "유지해야 할 메모";
    });
    const again = await (await post("/api/search", input)).json();
    assert.equal(again.saved, 0);
    assert.equal(
      again.platforms.reduce(
        (count, platform) => count + platform.duplicates,
        0,
      ),
      5,
    );
    assert.equal(store.state.mentions[0].note, "유지해야 할 메모");
    const backup = await (await fetch(base + "/api/backup")).json();
    assert.equal((await post("/api/restore", backup)).status, 200);
    assert.equal(
      store.state.mentions.filter(
        (mention) => mention.dateBasis === "collected",
      ).length,
      4,
    );
    const strict = await (
      await post("/api/search", {
        ...input,
        strictDates: true,
        saveResults: false,
      })
    ).json();
    assert.equal(
      strict.platforms.reduce(
        (count, platform) => count + platform.results.length,
        0,
      ),
      1,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test("search cancellation blocks restoration and releases the collection lock", async () => {
  const store = new Store(":memory:");
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const collector = new Collector(
    store,
    async (_url, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
        entered();
      }),
  );
  const server = createApp(store, collector).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  try {
    const pending = post("/api/search", { query: "검색", media: ["google"] });
    await ready;
    assert.equal((await post("/api/restore", store.state)).status, 409);
    assert.equal((await post("/api/collect")).status, 409);
    assert.equal((await post("/api/collect/cancel")).status, 200);
    assert.equal((await pending).status, 400);
    assert.equal(
      (await (await fetch(base + "/api/state")).json()).searching,
      false,
    );
    assert.equal(store.state.mentions.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test("registered collection uses persisted negative keywords and rejects disabled targets", async () => {
  const store = new Store(":memory:");
  const collector = new Collector(store);
  const queries = [];
  const server = createApp(store, collector, {
    platformCollector: async (_medium, input) => {
      queries.push(input.query);
      return {
        mode: "index",
        warnings: [],
        items: [
          {
            title: "대상 환불 의견",
            contentSnippet: "고객 의견",
            link: "https://blog.naver.com/person/1",
          },
          { title: "대상 추천", link: "https://blog.naver.com/person/2" },
          { title: "대상 환불 채용", link: "https://blog.naver.com/person/3" },
        ],
      };
    },
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, body, method = "POST") =>
    fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const keyword = await (
      await request("/api/keywords", {
        name: "대상",
        aliases: ["별칭"],
        excludes: ["채용"],
        negativeWords: ["환불"],
      })
    ).json();
    const input = {
      keywordId: keyword.id,
      query: "무시될 이름",
      media: ["naver_blog"],
      negativeWords: ["추천"],
      negativeOnly: false,
    };
    const result = await (await request("/api/search", input)).json();
    assert.equal(result.query, "대상");
    assert.deepEqual(result.negativeWords, ["환불"]);
    assert.equal(result.saved, 1);
    assert.deepEqual(queries.sort(), ["대상 환불", "별칭 환불"].sort());
    const backup = await (await fetch(base + "/api/backup")).json();
    assert.equal((await request("/api/restore", backup)).status, 200);
    assert.deepEqual(store.state.keywords[0].negativeWords, ["환불"]);
    await request(
      `/api/keywords/${keyword.id}`,
      { ...keyword, enabled: false },
      "PUT",
    );
    assert.equal((await request("/api/search", input)).status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test("API supports edits, collection, persistence, workflow and safe exports", async () => {
  const store = new Store(":memory:");
  const collector = new Collector(store, async () => ({
    items: [
      { title: "새브랜드 불만 환불", link: "https://example.org/article" },
    ],
  }));
  const server = createApp(store, collector, {
    platformCollector: async () => ({ mode: "index", items: [], warnings: [] }),
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = "GET", body) => {
    const response = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const searched = await request("/api/search", "POST", {
      query: "새브랜드",
      saveResults: false,
      media: ["naver", "google", "youtube", "tiktok", "instagram"],
    });
    assert.equal(searched.status, 200);
    assert.equal(searched.body.platforms.length, 5);
    assert.equal(
      searched.body.platforms.find((platform) => platform.id === "google")
        .results.length,
      1,
    );
    assert.equal(store.state.mentions.length, 0);
    assert.equal(store.state.runs.length, 0);
    assert.equal(
      (
        await request("/api/search", "POST", {
          query: "새브랜드",
          media: ["google"],
          startDate: "2026-02-30",
          endDate: "2026-03-01",
        })
      ).status,
      400,
    );
    assert.equal((await request("/api/collect", "POST", {})).status, 400);
    const result = await request("/api/keywords", "POST", {
      name: "초기브랜드",
    });
    assert.equal(result.status, 201);
    await request(`/api/keywords/${result.body.id}`, "PUT", {
      name: "새브랜드",
      aliases: [],
      excludes: [],
      enabled: true,
      color: "#087f73",
    });
    const collected = await request("/api/collect", "POST", {});
    assert.equal(collected.body.added, 1);
    assert.equal(store.state.alerts.length, 1);
    const mention = store.state.mentions[0];
    assert.equal(
      (
        await request(`/api/mentions/${mention.id}`, "PATCH", {
          note: "확인 중",
          status: "reviewing",
          assignee: "담당자",
        })
      ).status,
      200,
    );
    assert.equal(store.state.mentions[0].note, "확인 중");
    await request(`/api/mentions/${mention.id}`, "PATCH", {
      sentiment: "positive",
      priority: "urgent",
      dueAt: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(
      (await request("/api/mentions/reanalyze", "POST", { ids: [mention.id] }))
        .body.count,
      0,
    );
    assert.equal(
      (
        await request("/api/mentions/reanalyze", "POST", {
          ids: [mention.id],
          overwriteManual: true,
        })
      ).body.count,
      1,
    );
    const view = await request("/api/views", "POST", {
      name: "부정 언급",
      filters: { sentiment: "negative" },
    });
    assert.equal(view.status, 201);
    assert.equal(store.state.savedViews.length, 1);
    const report = await fetch(base + "/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [mention.id], format: "html" }),
    });
    assert.match(await report.text(), /평판 보고서/);
    assert.equal((await request("/api/collect", "POST", {})).body.added, 0);
    assert.equal(
      (
        await request("/api/settings", "PUT", {
          ...store.state.settings,
          intervalMinutes: 1,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/mentions/bulk", "POST", {
          ids: [
            ...Array.from({ length: 2000 }, (_, index) => `missing-${index}`),
            mention.id,
          ],
          status: "resolved",
        })
      ).status,
      200,
    );
    assert.equal(
      store.state.mentions.find((item) => item.id === mention.id).status,
      "resolved",
    );
    const backup = (await request("/api/backup")).body;
    assert.equal((await request("/api/restore", "POST", backup)).status, 200);
    assert.equal(
      (await request("/api/restore", "POST", { version: 4 })).status,
      400,
    );
    const csv = await fetch(base + "/api/export");
    assert.match(await csv.text(), /새브랜드/);
    const foreign = await fetch(base + "/api/state", {
      headers: { origin: "https://evil.example" },
    });
    assert.equal(foreign.status, 403);
    assert.equal(
      (
        await request("/api/sources", "POST", {
          name: "local",
          url: "https://127.0.0.1/rss",
        })
      ).status,
      400,
    );
    const createdReport = await request("/api/reports", "POST", {
      title: "명예훼손 신고 원고",
      content: "원고 본문입니다.",
      status: "planned",
      category: "권리침해·명예훼손 신고",
      targetUrl: mention.url,
      reportUrl: "https://help.naver.com/post/main.help",
      platform: "네이버",
      mentionId: mention.id,
      images: [
        {
          id: "img-1",
          name: "evidence.png",
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        },
      ],
    });
    assert.equal(createdReport.status, 201);
    assert.equal(
      store.state.mentions.find((item) => item.id === mention.id).reportStatus,
      "planned",
    );
    assert.equal(
      (
        await request(
          `/api/reports/${createdReport.body.id}/status`,
          "PATCH",
          { status: "reporting" },
        )
      ).status,
      200,
    );
    assert.equal(
      store.state.mentions.find((item) => item.id === mention.id).reportStatus,
      "reporting",
    );
    assert.equal(
      (await request(`/api/reports/${createdReport.body.id}`, "DELETE", {}))
        .status,
      200,
    );
    assert.equal(
      store.state.mentions.find((item) => item.id === mention.id).reportStatus,
      null,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});
