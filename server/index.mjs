import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "./store.mjs";
import { Collector } from "./collector.mjs";
import { createApp } from "./app.mjs";

if (existsSync(".env")) process.loadEnvFile();

const store = new Store(
  resolve(process.env.DATA_FILE || "data/reputation.sqlite"),
);
const collector = new Collector(store);
store.update((state) => {
  state.runs
    .filter((run) => !run.finishedAt)
    .forEach((run) => {
      run.finishedAt = new Date().toISOString();
      run.errors.push("이전 서버 실행 중 수집이 중단되었습니다.");
    });
});
const app = createApp(store, collector);
if (existsSync(resolve("dist/index.html"))) {
  app.use(express.static(resolve("dist")));
  app.get("/", (_request, response) =>
    response.sendFile(resolve("dist/index.html")),
  );
}
const port = Number(process.env.PORT || 4310);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Reputation Monitor: http://127.0.0.1:${port}`),
);
const timer = setInterval(() => {
  const { settings, runs, keywords } = store.state;
  const last = runs[0]?.startedAt;
  if (
    settings.autoCollect &&
    keywords.some((keyword) => keyword.enabled) &&
    !collector.running &&
    !collector.searching &&
    (!last ||
      Date.now() - new Date(last).getTime() >= settings.intervalMinutes * 60000)
  )
    collector
      .run()
      .catch((error) => console.error("Scheduled collection:", error.message));
}, 15000);
function shutdown() {
  clearInterval(timer);
  collector.cancel();
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
