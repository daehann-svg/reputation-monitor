import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "./store.mjs";
import { Collector } from "./collector.mjs";
import { createApp } from "./app.mjs";
import { checkLink } from "./links.mjs";
import { generateReportDraft } from "./ai.mjs";

test("link check classifies missing, unreachable, blocked and oversized pages", async () => {
  const failing = (error) => async () => {
    throw error;
  };
  assert.equal(await checkLink("https://a.example/1", async () => ({})), "ok");
  assert.equal(
    await checkLink("https://a.example/1", failing(new Error("HTTP 404"))),
    "broken",
  );
  assert.equal(
    await checkLink(
      "https://a.example/1",
      failing(
        Object.assign(new Error("fetch failed"), {
          cause: { code: "ENOTFOUND" },
        }),
      ),
    ),
    "broken",
  );
  assert.equal(
    await checkLink("https://a.example/1", failing(new Error("HTTP 403"))),
    "unknown",
  );
  assert.equal(
    await checkLink(
      "https://a.example/1",
      failing(new Error("응답이 허용 크기를 초과했습니다.")),
    ),
    "ok",
  );
});

test("link check API stores status and AI draft requires a server key", async () => {
  const store = new Store(":memory:");
  store.update((state) => {
    for (const [id, url] of [
      ["live", "https://ok.example/post"],
      ["gone", "https://gone.example/post"],
    ])
      state.mentions.push({
        id,
        title: id,
        summary: "",
        url,
        source: "test",
        keywordIds: [],
        publishedAt: new Date().toISOString(),
        collectedAt: new Date().toISOString(),
        sentiment: "negative",
        score: -1,
        evidence: [],
        status: "new",
        starred: false,
        note: "",
        assignee: "",
        tags: [],
        demo: false,
      });
  });
  let aiBody;
  const server = createApp(store, new Collector(store), {
    linkReader: async (url) => {
      if (url.includes("gone")) throw new Error("HTTP 404");
      return {};
    },
    aiClient: async (_url, init) => {
      aiBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "AI 원고" } }] }),
      };
    },
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  const previousKey = process.env.OPENAI_API_KEY;
  try {
    const result = await (
      await post("/api/mentions/check-links", { ids: ["live", "gone"] })
    ).json();
    assert.deepEqual(result, { checked: 2, broken: 1 });
    assert.equal(
      store.state.mentions.find((m) => m.id === "gone").linkStatus,
      "broken",
    );
    assert.equal(
      store.state.mentions.find((m) => m.id === "live").linkStatus,
      "ok",
    );
    delete process.env.OPENAI_API_KEY;
    assert.equal(
      (await (await fetch(base + "/api/ai/status")).json()).configured,
      false,
    );
    assert.equal(
      (
        await post("/api/ai/report-draft", {
          prompt: "신고 원고를 작성해 주세요.",
        })
      ).status,
      400,
    );
    process.env.OPENAI_API_KEY = "test-key";
    const draft = await (
      await post("/api/ai/report-draft", {
        prompt: "신고 원고를 작성해 주세요.",
      })
    ).json();
    assert.equal(draft.content, "AI 원고");
    assert.equal(aiBody.messages[1].content, "신고 원고를 작성해 주세요.");
    const backup = await (await fetch(base + "/api/backup")).json();
    assert.ok(!JSON.stringify(backup).includes("test-key"));
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});

test("AI draft surfaces upstream errors without exposing the key", async () => {
  await assert.rejects(
    generateReportDraft("프롬프트 내용입니다.", {
      environment: { OPENAI_API_KEY: "secret" },
      client: async () => ({ ok: false, status: 401 }),
    }),
    (error) =>
      /HTTP 401/.test(error.message) && !error.message.includes("secret"),
  );
});
