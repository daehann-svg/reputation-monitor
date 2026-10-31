import express from "express";
import { resolve } from "node:path";
import { Store } from "../server/store.mjs";
import { Collector } from "../server/collector.mjs";
import { createApp } from "../server/app.mjs";

if (process.env.NODE_ENV !== "test") throw new Error("Test server only");
const store = new Store(resolve(".test-data/reputation.sqlite"));
const collector = new Collector(store, async (value) => {
  const query = new URL(value).searchParams.get("q") || "";
  const keyword = store.state.keywords.find((item) =>
    [item.name, ...item.aliases].some((target) => query.includes(`"${target}`)),
  );
  const name = keyword?.name || query.match(/"([^"]+)"/)?.[1] || "브랜드";
  const date = query.match(/after:(\d{4}-\d{2}-\d{2})/)?.[1];
  return {
    items: [
      {
        title: `${name} ${(keyword?.negativeWords || []).join(" ")} 공개 기사`,
        contentSnippet: `${name} 뉴스 요약`,
        link: `https://example.org/news/${encodeURIComponent(name)}`,
        isoDate: date ? `${date}T12:00:00Z` : new Date().toISOString(),
      },
    ],
  };
});
const urls = {
  naver: "https://blog.naver.com/test/1",
  naver_blog: "https://blog.naver.com/test/2",
  naver_cafe: "https://cafe.naver.com/test/123",
  daum_cafe: "https://cafe.daum.net/test/board/123",
  youtube: "https://www.youtube.com/watch?v=abcdefghijk",
  tiktok: "https://www.tiktok.com/@test/video/1234",
  instagram: "https://www.instagram.com/p/test/",
};
const app = createApp(store, collector, {
  linkReader: async (url) => {
    if (url.includes("daum.net")) throw new Error("HTTP 404");
    return {};
  },
  platformCollector: async (medium, input) => {
    const keyword = store.state.keywords.find((item) =>
      [item.name, ...item.aliases].some((target) =>
        input.query.startsWith(target),
      ),
    );
    const name = keyword?.name || input.query;
    return {
      mode: medium === "youtube" ? "html" : "index",
      items: [
        {
          title: `${name} ${(keyword?.negativeWords || []).join(" ")} 공개 게시물`,
          contentSnippet: ["naver_blog", "naver_cafe", "daum_cafe"].includes(
            medium,
          )
            ? `${name} 개인정보 유출 예방에 관한 검토 자료`
            : `${name} 수집 요약`,
          link: urls[medium],
          ...(["naver", "youtube", "naver_blog", "daum_cafe"].includes(medium)
            ? {
                isoDate: input.startDate
                  ? `${input.startDate}T12:00:00Z`
                  : new Date().toISOString(),
              }
            : {}),
        },
      ],
      warnings: ["검증용 네트워크 응답"],
    };
  },
});
app.use(express.static(resolve("dist")));
app.get("/", (_request, response) =>
  response.sendFile(resolve("dist/index.html")),
);
const server = app.listen(4325, "127.0.0.1");
process.on("SIGTERM", () =>
  server.close(() => {
    store.close();
    process.exit(0);
  }),
);
