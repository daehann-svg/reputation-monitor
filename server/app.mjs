import express from "express";
import { randomUUID } from "node:crypto";
import { ZodError, z } from "zod";
import {
  keywordSchema,
  settingsSchema,
  sourceSchema,
  mentionPatchSchema,
  backupSchema,
  viewSchema,
  reportDraftSchema,
  reportStatusEnum,
} from "./schemas.mjs";
import { analyze, csvCell, seedDemo, prune } from "./core.mjs";
import { exportCsv, exportReport } from "./reports.mjs";
import { validateFeedUrl } from "./collector.mjs";
import { searchMedia, saveSearchResults } from "./search.mjs";
import { connectionStatus } from "./providers.mjs";
import { checkLinks } from "./links.mjs";
import { aiStatus, generateReportDraft } from "./ai.mjs";

export function createApp(store, collector, searchOptions = {}) {
  const app = express();
  let searchController = null;
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    const host = request.headers.host || "";
    const origin = request.headers.origin;
    if (
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
      (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    )
      return response.status(403).json({ error: "로컬 접속만 허용됩니다." });
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use("/api", (request, response, next) => {
    if (
      ["POST", "PATCH", "PUT", "DELETE"].includes(request.method) &&
      !request.is("application/json")
    )
      return response.status(415).json({ error: "JSON 요청만 허용됩니다." });
    next();
  });
  app.use(express.json({ limit: "20mb" }));
  app.get("/api/health", (_request, response) =>
    response.json({
      app: "reputation-monitor",
      version: "1.0",
      ok: true,
      profile: process.env.DATA_FILE ? "custom" : "default",
    }),
  );
  app.get("/api/state", (_request, response) =>
    response.json({
      ...store.state,
      collecting: collector.running,
      searching: Boolean(searchController),
      progress: collector.progress || null,
    }),
  );
  app.get("/api/search/connections", (_request, response) =>
    response.json(connectionStatus()),
  );
  app.post("/api/search", async (request, response) => {
    if (searchController || collector.running)
      return response.status(409).json({ error: "다른 수집이 진행 중입니다." });
    let input = request.body;
    if (input.keywordId) {
      const keyword = store.state.keywords.find(
        (item) => item.id === input.keywordId && item.enabled,
      );
      if (!keyword)
        return response
          .status(400)
          .json({ error: "활성 등록 키워드를 선택하세요." });
      input = {
        ...input,
        query: keyword.name,
        aliases: keyword.aliases.slice(0, 3),
        excludes: keyword.excludes,
        negativeWords: keyword.negativeWords || [],
        negativeOnly: true,
        problemTerms: [],
      };
    }
    const controller = new AbortController();
    searchController = controller;
    collector.searching = true;
    const close = () => controller.abort();
    response.once("close", close);
    try {
      const result = await searchMedia(
        input,
        collector.feedReader,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        searchOptions,
      );
      controller.signal.throwIfAborted();
      if (result.saveResults) saveSearchResults(store, result);
      if (!response.destroyed) response.json(result);
    } finally {
      searchController = null;
      collector.searching = false;
      response.removeListener("close", close);
    }
  });
  app.post("/api/views", (request, response) => {
    const view = { ...viewSchema.parse(request.body), id: randomUUID() };
    if (store.state.savedViews.length >= 30)
      return response
        .status(400)
        .json({ error: "저장 필터는 최대 30개입니다." });
    store.update((state) => state.savedViews.push(view));
    response.status(201).json(view);
  });
  app.delete("/api/views/:id", (request, response) => {
    store.update((state) => {
      state.savedViews = state.savedViews.filter(
        (view) => view.id !== request.params.id,
      );
    });
    response.json({ ok: true });
  });
  app.post("/api/reports", (request, response) => {
    const draft = reportDraftSchema.parse(request.body);
    if ((store.state.reports || []).length >= 500)
      return response
        .status(400)
        .json({ error: "신고 원고는 최대 500개까지 저장할 수 있습니다." });
    const now = new Date().toISOString();
    const report = {
      ...draft,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    store.update((state) => {
      if (!state.reports) state.reports = [];
      state.reports.unshift(report);
      if (report.mentionId) {
        const mention = state.mentions.find(
          (item) => item.id === report.mentionId,
        );
        if (mention) mention.reportStatus = report.status;
      }
    });
    response.status(201).json(report);
  });
  app.put("/api/reports/:id", (request, response) => {
    const draft = reportDraftSchema.parse(request.body);
    if (
      !(store.state.reports || []).some((item) => item.id === request.params.id)
    )
      return response.sendStatus(404);
    const now = new Date().toISOString();
    store.update((state) => {
      const target = state.reports.find(
        (item) => item.id === request.params.id,
      );
      Object.assign(target, draft, { updatedAt: now });
      if (target.mentionId) {
        const mention = state.mentions.find(
          (item) => item.id === target.mentionId,
        );
        if (mention) mention.reportStatus = target.status;
      }
    });
    response.json({ ok: true });
  });
  app.patch("/api/reports/:id/status", (request, response) => {
    const { status } = z
      .object({ status: reportStatusEnum })
      .parse(request.body);
    if (
      !(store.state.reports || []).some((item) => item.id === request.params.id)
    )
      return response.sendStatus(404);
    const now = new Date().toISOString();
    store.update((state) => {
      const target = state.reports.find(
        (item) => item.id === request.params.id,
      );
      target.status = status;
      target.updatedAt = now;
      if (target.mentionId) {
        const mention = state.mentions.find(
          (item) => item.id === target.mentionId,
        );
        if (mention) mention.reportStatus = status;
      }
    });
    response.json({ ok: true });
  });
  app.delete("/api/reports/:id", (request, response) => {
    store.update((state) => {
      const target = (state.reports || []).find(
        (item) => item.id === request.params.id,
      );
      state.reports = (state.reports || []).filter(
        (item) => item.id !== request.params.id,
      );
      if (target?.mentionId) {
        const remaining = state.reports.find(
          (item) => item.mentionId === target.mentionId,
        );
        const mention = state.mentions.find(
          (item) => item.id === target.mentionId,
        );
        if (mention) mention.reportStatus = remaining ? remaining.status : null;
      }
    });
    response.json({ ok: true });
  });
  app.post("/api/mentions/check-links", async (request, response) => {
    const { ids } = z
      .object({ ids: z.array(z.string()).min(1).max(100) })
      .parse(request.body);
    const targets = store.state.mentions.filter(
      (mention) => ids.includes(mention.id) && !mention.demo,
    );
    const statuses = await checkLinks(
      targets.map((mention) => mention.url),
      searchOptions.linkReader,
    );
    const checkedAt = new Date().toISOString();
    const byId = new Map(
      targets.map((mention, index) => [mention.id, statuses[index]]),
    );
    store.update((state) =>
      state.mentions.forEach((mention) => {
        if (!byId.has(mention.id)) return;
        mention.linkStatus = byId.get(mention.id);
        mention.linkCheckedAt = checkedAt;
      }),
    );
    response.json({
      checked: targets.length,
      broken: statuses.filter((status) => status === "broken").length,
    });
  });
  app.get("/api/ai/status", (_request, response) => response.json(aiStatus()));
  app.post("/api/ai/report-draft", async (request, response) => {
    const { prompt } = z
      .object({ prompt: z.string().trim().min(10).max(20000) })
      .parse(request.body);
    response.json({
      content: await generateReportDraft(prompt, {
        client: searchOptions.aiClient,
      }),
    });
  });
  app.post("/api/mentions/reanalyze", (request, response) => {
    const { ids, overwriteManual } = z
      .object({
        ids: z.array(z.string()).max(20000),
        overwriteManual: z.boolean().default(false),
      })
      .parse(request.body);
    let count = 0;
    store.update((state) =>
      state.mentions
        .filter(
          (mention) =>
            ids.includes(mention.id) &&
            (!mention.manualSentiment || overwriteManual),
        )
        .forEach((mention) => {
          Object.assign(
            mention,
            analyze(`${mention.title} ${mention.summary}`, state.settings),
            { manualSentiment: false },
          );
          count++;
        }),
    );
    response.json({ count });
  });
  app.post("/api/keywords", (request, response) => {
    const keyword = { ...keywordSchema.parse(request.body), id: randomUUID() };
    if (store.state.keywords.length >= 30)
      return response
        .status(400)
        .json({ error: "키워드는 최대 30개까지 등록 가능합니다." });
    if (
      store.state.keywords.some(
        (item) =>
          item.name.toLocaleLowerCase() === keyword.name.toLocaleLowerCase(),
      )
    )
      return response.status(409).json({ error: "이미 등록된 키워드입니다." });
    store.update((state) => state.keywords.push(keyword));
    response.status(201).json(keyword);
  });
  app.put("/api/keywords/:id", (request, response) => {
    const keyword = keywordSchema.parse(request.body);
    if (!store.state.keywords.some((item) => item.id === request.params.id))
      return response.sendStatus(404);
    if (
      store.state.keywords.some(
        (item) =>
          item.id !== request.params.id &&
          item.name.toLocaleLowerCase() === keyword.name.toLocaleLowerCase(),
      )
    )
      return response.status(409).json({ error: "이미 등록된 키워드입니다." });
    store.update((state) =>
      Object.assign(
        state.keywords.find((item) => item.id === request.params.id),
        keyword,
      ),
    );
    response.json({ ok: true });
  });
  app.delete("/api/keywords/:id", (request, response) => {
    store.update((state) => {
      state.keywords = state.keywords.filter(
        (item) => item.id !== request.params.id,
      );
      state.mentions.forEach((mention) => {
        mention.keywordIds = mention.keywordIds.filter(
          (id) => id !== request.params.id,
        );
      });
    });
    response.json({ ok: true });
  });
  app.put("/api/settings", (request, response) => {
    const settings = settingsSchema.parse(request.body);
    store.update((state) => {
      state.settings = settings;
      prune(state);
    });
    response.json({ ok: true });
  });
  app.post("/api/sources", async (request, response) => {
    const source = { ...sourceSchema.parse(request.body), id: randomUUID() };
    if (store.state.sources.length >= 50)
      return response
        .status(400)
        .json({ error: "RSS는 최대 50개까지 등록 가능합니다." });
    await validateFeedUrl(source.url);
    store.update((state) => state.sources.push(source));
    response.status(201).json(source);
  });
  app.patch("/api/sources/:id", (request, response) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    if (!store.state.sources.some((item) => item.id === request.params.id))
      return response.sendStatus(404);
    store.update((state) => {
      state.sources.find((item) => item.id === request.params.id).enabled =
        enabled;
    });
    response.json({ ok: true });
  });
  app.delete("/api/sources/:id", (request, response) => {
    store.update((state) => {
      state.sources = state.sources.filter(
        (item) => item.id !== request.params.id,
      );
    });
    response.json({ ok: true });
  });
  app.patch("/api/mentions/:id", (request, response) => {
    const patch = mentionPatchSchema.parse(request.body);
    if (!store.state.mentions.some((item) => item.id === request.params.id))
      return response.sendStatus(404);
    store.update((state) => {
      const mention = state.mentions.find(
        (item) => item.id === request.params.id,
      );
      Object.assign(
        mention,
        patch,
        patch.sentiment ? { manualSentiment: true } : {},
      );
      if (patch.reportStatus !== undefined && state.reports) {
        state.reports
          .filter((report) => report.mentionId === mention.id)
          .forEach((report) => {
            if (patch.reportStatus) report.status = patch.reportStatus;
            report.updatedAt = new Date().toISOString();
          });
      }
    });
    response.json({ ok: true });
  });
  app.post("/api/mentions/bulk", (request, response) => {
    const { ids, status, reportStatus } = z
      .object({
        ids: z.array(z.string()).max(20000),
        status: z.enum(["new", "reviewing", "resolved", "ignored"]).optional(),
        reportStatus: reportStatusEnum.nullable().optional(),
      })
      .parse(request.body);
    const selected = new Set(ids);
    store.update((state) =>
      state.mentions
        .filter((mention) => selected.has(mention.id))
        .forEach((mention) => {
          if (status) mention.status = status;
          if (reportStatus !== undefined) mention.reportStatus = reportStatus;
        }),
    );
    response.json({ ok: true });
  });
  app.post("/api/alerts/read", (request, response) => {
    const { ids } = z
      .object({ ids: z.array(z.string()).max(1000) })
      .parse(request.body);
    store.update((state) =>
      state.alerts.forEach((alert) => {
        if (ids.includes(alert.id)) alert.read = true;
      }),
    );
    response.json({ ok: true });
  });
  app.post("/api/collect", async (_request, response) => {
    if (collector.running || searchController)
      return response.status(409).json({ error: "이미 수집 중입니다." });
    if (!store.state.keywords.some((keyword) => keyword.enabled))
      return response
        .status(400)
        .json({ error: "활성 검색 키워드를 먼저 등록하세요." });
    const run = await collector.run();
    response.json(run);
  });
  app.post("/api/collect/cancel", (_request, response) => {
    collector.cancel();
    searchController?.abort();
    response.json({ ok: true });
  });
  app.post("/api/demo", (_request, response) => {
    if (collector.running || searchController)
      return response
        .status(409)
        .json({ error: "수집 완료 후 다시 시도하세요." });
    if (
      store.state.mentions.some((mention) => mention.demo) ||
      store.state.keywords.some((keyword) => keyword.name === "모아커피")
    )
      return response.status(409).json({
        error: "체험 데이터 또는 같은 이름의 키워드가 이미 있습니다.",
      });
    store.update(seedDemo);
    response.json({ ok: true });
  });
  app.delete("/api/demo", (_request, response) => {
    store.update((state) => {
      state.mentions = state.mentions.filter((mention) => !mention.demo);
      prune(state);
    });
    response.json({ ok: true });
  });
  app.get("/api/backup", (_request, response) => {
    response.attachment("reputation-backup.json").json(store.state);
  });
  app.post("/api/export", (request, response) => {
    const { ids, format } = z
      .object({
        ids: z.array(z.string()).max(20000),
        format: z.enum(["csv", "html"]).default("csv"),
      })
      .parse(request.body);
    if (format === "html")
      response
        .attachment("reputation-report.html")
        .type("html")
        .send(exportReport(store.state, ids));
    else
      response
        .attachment("reputation-mentions.csv")
        .type("text/csv; charset=utf-8")
        .send(exportCsv(store.state, ids));
  });
  app.post("/api/restore", (request, response) => {
    if (collector.running || searchController)
      return response
        .status(409)
        .json({ error: "수집 완료 후 복원할 수 있습니다." });
    const state = backupSchema.parse(request.body);
    state.settings.autoCollect = false;
    store.replace(state);
    response.json({ ok: true });
  });
  app.get("/api/export", (request, response) => {
    const ids =
      typeof request.query.ids === "string"
        ? request.query.ids.split(",")
        : null;
    const labels = {
      positive: "긍정",
      neutral: "중립",
      negative: "부정",
      new: "신규",
      reviewing: "검토 중",
      resolved: "처리 완료",
      ignored: "제외",
    };
    const rows = [
      [
        "게시일",
        "제목",
        "출처",
        "감정",
        "상태",
        "키워드",
        "담당자",
        "태그",
        "메모",
        "URL",
        "체험 데이터",
      ],
      ...store.state.mentions
        .filter((mention) => !ids || ids.includes(mention.id))
        .map((mention) => [
          mention.publishedAt,
          mention.title,
          mention.source,
          labels[mention.sentiment],
          labels[mention.status],
          store.state.keywords
            .filter((keyword) => mention.keywordIds.includes(keyword.id))
            .map((keyword) => keyword.name)
            .join(", "),
          mention.assignee,
          mention.tags.join(", "),
          mention.note,
          mention.url,
          mention.demo ? "예" : "아니오",
        ]),
    ];
    response
      .attachment("reputation-mentions.csv")
      .type("text/csv; charset=utf-8")
      .send(
        "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      );
  });
  app.use("/api", (_request, response) =>
    response.status(404).json({ error: "존재하지 않는 API입니다." }),
  );
  app.use((error, _request, response, _next) => {
    const message =
      error instanceof ZodError
        ? error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(" / ")
        : error.message;
    response
      .status(error.status || 400)
      .json({ error: message || "요청을 처리할 수 없습니다." });
  });
  return app;
}
