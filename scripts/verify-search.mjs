import { mkdir, writeFile } from "node:fs/promises";
import { searchMedia } from "../server/search.mjs";

const review = process.argv.includes("--review");
const endDate = new Date().toLocaleDateString("sv-SE", {
  timeZone: "Asia/Seoul",
});
const start = new Date(`${endDate}T00:00:00Z`);
start.setUTCDate(start.getUTCDate() - 6);
const result = await searchMedia({
  query: "삼성전자",
  media: review ? ["naver_blog", "naver_cafe", "daum_cafe"] : ["naver", "google", "youtube", "tiktok", "instagram"],
  startDate: start.toISOString().slice(0, 10),
  endDate,
  saveResults: false,
  limit: 20,
});
const report = {
  startDate: result.startDate,
  endDate,
  platforms: result.platforms.map((platform) => ({
    id: platform.id,
    mode: platform.mode,
    count: platform.results.length,
    error: platform.error,
    warnings: platform.warnings,
  })),
};
await mkdir(".test-data", { recursive: true });
await writeFile(
  review ? ".test-data/live-review-collection.json" : ".test-data/live-collection.json",
  JSON.stringify(report, null, 2),
  "utf8",
);
console.log(
  JSON.stringify(
    report.platforms.map(({ id, mode, count, error }) => ({
      id,
      mode,
      count,
      failed: Boolean(error),
    })),
  ),
);
