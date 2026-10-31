import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
// @ts-expect-error The server model is shared as executable JavaScript.
import { initialState, seedDemo } from "../server/core.mjs";

test.beforeEach(async ({ request, page }) => {
  const state = initialState();
  seedDemo(state);
  const restored = await request.post("/api/restore", { data: state });
  expect(restored.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "평판 현황" })).toBeVisible();
});

test("desktop dashboard renders real chart paths without runtime errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.reload();
  await expect(page.locator(".metrics")).toBeVisible();
  await expect(page.locator(".recharts-area path").first()).toBeVisible();
  await expect(page.locator(".recent-row")).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("keyword edits persist after reload including aliases and exclusions", async ({
  page,
  request,
}) => {
  await page.locator(".nav-item").filter({ hasText: "키워드 등록" }).click();
  await page.getByRole("button", { name: "모아커피 수정" }).click();
  await page.getByLabel("키워드 이름").fill("테스트 브랜드");
  await page
    .getByRole("textbox", { name: "별칭", exact: true })
    .fill("Test Brand, TB");
  await page
    .getByRole("textbox", { name: "제외어", exact: true })
    .fill("채용, 중고");
  await page.getByRole("textbox", { name: /부정 키워드/ }).fill("환불, 비방");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const state = await (await request.get("/api/state")).json();
  expect(state.keywords[0].name).toBe("테스트 브랜드");
  expect(state.keywords[0].aliases).toEqual(["Test Brand", "TB"]);
  expect(state.keywords[0].excludes).toEqual(["채용", "중고"]);
  expect(state.keywords[0].negativeWords).toEqual(["환불", "비방"]);
  await page.reload();
  await page.locator(".nav-item").filter({ hasText: "키워드 등록" }).click();
  await expect(
    page.getByRole("heading", { name: "테스트 브랜드" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/keyword-registration-desktop.png",
    fullPage: true,
  });
});

test("filters and bulk status changes work", async ({ page }) => {
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page.getByLabel("감정 필터").selectOption("negative");
  await expect(page.locator(".mention-row")).toHaveCount(2);
  await page.getByLabel("현재 페이지 전체 선택").check();
  await page.getByLabel("일괄 처리 상태").selectOption("resolved");
  await page.getByRole("button", { name: "일괄 변경" }).click();
  await expect(page.locator(".bulk-bar")).toHaveCount(0);
  await expect(page.locator(".mention-row .status-text.resolved")).toHaveCount(
    2,
  );
  await page.getByLabel("상태 필터").selectOption("pending");
  await expect(page.locator(".mention-row")).toHaveCount(0);
});

test("notes, assignment, priority and deadline persist without overriding automatic sentiment", async ({
  page,
  request,
}) => {
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page
    .getByRole("button", {
      name: "모아커피 배송 지연에 불만, 환불 문의 증가",
      exact: true,
    })
    .click();
  await page.getByLabel("담당자", { exact: true }).fill("김담당");
  await page.getByLabel("대응 메모").fill("고객센터 확인 후 재발 방지");
  await page.getByLabel("태그", { exact: true }).fill("배송, 긴급대응");
  await page
    .getByRole("combobox", { name: "우선순위", exact: true })
    .selectOption("urgent");
  await page.getByLabel("대응 기한").fill("2026-10-10T15:00");
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const state = await (await request.get("/api/state")).json();
  const mention = state.mentions.find(
    (item: { assignee: string }) => item.assignee === "김담당",
  );
  expect(mention.note).toContain("고객센터");
  expect(mention.priority).toBe("urgent");
  expect(mention.dueAt).toBeTruthy();
  expect(mention.manualSentiment).toBe(false);
  await page.getByLabel("언급 검색").fill("김담당");
  await expect(page.locator(".mention-row")).toHaveCount(1);
});

test("saved filters and filtered report downloads work", async ({ page }) => {
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page.getByLabel("감정 필터").selectOption("negative");
  await page.getByRole("button", { name: "필터 저장" }).click();
  await page.getByLabel("필터 이름").fill("부정 모니터링");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await expect(page.getByLabel("감정 필터")).toHaveValue("negative");
  await page.getByLabel("감정 필터").selectOption("all");
  await expect(page.locator(".mention-row")).toHaveCount(9);
  await page
    .getByLabel("저장 필터", { exact: true })
    .selectOption({ label: "부정 모니터링" });
  await expect(page.locator(".mention-row")).toHaveCount(2);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "보고서", exact: true }).click();
  const downloaded = await pending;
  const path = await downloaded.path();
  expect(path).toBeTruthy();
  const html = await readFile(path!, "utf8");
  expect(html).toContain("선택된 언급 2건");
  expect(html).not.toContain("멤버십 만족 후기");
});

test("settings persist and notifications can be marked read", async ({
  page,
  request,
}) => {
  await page.locator(".nav-item").filter({ hasText: "설정" }).click();
  await page.getByLabel("작업 공간 이름").fill("운영팀");
  await page.getByLabel("수집 간격", { exact: true }).fill("15");
  await page.getByLabel("부정 점수 기준").fill("3");
  await page.getByRole("button", { name: "설정 저장" }).click();
  await expect(page.getByRole("status")).toContainText("설정을 저장");
  const state = await (await request.get("/api/state")).json();
  expect(state.settings.intervalMinutes).toBe(15);
  expect(state.settings.alertThreshold).toBe(3);
  await page.locator(".nav-item").filter({ hasText: "알림" }).click();
  await page.getByRole("button", { name: "모두 읽음", exact: true }).click();
  await expect(page.locator(".alert-row.unread")).toHaveCount(0);
});

test("mobile views and dialogs fit narrow viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".metrics")).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const label of [
    "수집 결과",
    "키워드 등록",
    "신고원고",
    "알림",
    "설정",
  ]) {
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await page.locator(".nav-item").filter({ hasText: label }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("registered collection supports five media, custom dates, external links and mobile", async ({
  page,
  request,
}) => {
  const query = "모아커피";
  const dates = { startDate: "2026-09-01", endDate: "2026-09-30" };
  let submitted:
    | { query: string; media: string[]; startDate: string; endDate: string }
    | undefined;
  page.on("request", (sent) => {
    if (sent.url().endsWith("/api/search")) submitted = sent.postDataJSON();
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator(".nav-item").filter({ hasText: "검색·수집" }).click();
  await expect(
    page.getByRole("heading", { name: "검색·수집", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.locator(".collection-condition")).toContainText("불만");
  await page.getByRole("checkbox", { name: "전체 매체", exact: true }).check();
  for (const name of ["네이버 블로그", "네이버 카페", "다음 카페"])
    await page.getByRole("checkbox", { name, exact: true }).uncheck();
  await page
    .getByRole("combobox", { name: "검색 기간" })
    .selectOption("custom");
  await page.getByLabel("검색 시작일").fill(dates.startDate);
  await page.getByLabel("검색 종료일").fill(dates.endDate);
  await page.getByRole("button", { name: "검색 후 수집", exact: true }).click();
  await expect(page.locator(".media-result-section")).toHaveCount(5);
  expect(submitted?.media).toEqual([
    "naver",
    "google",
    "youtube",
    "tiktok",
    "instagram",
  ]);
  expect(submitted?.startDate).toBe(dates.startDate);
  expect(submitted?.endDate).toBe(dates.endDate);
  await expect(page.locator(".media-news-item")).toHaveCount(5);
  await expect(page.locator(".media-result-heading")).toContainText(
    "신규 5건 저장",
  );
  const stored = await (await request.get("/api/state")).json();
  expect(
    stored.mentions.filter(
      (item: { searchQuery?: string }) => item.searchQuery === query,
    ),
  ).toHaveLength(5);
  await page.getByRole("button", { name: "검색 후 수집", exact: true }).click();
  await expect(page.locator(".media-result-heading")).toContainText(
    "신규 0건 저장",
  );
  const naver = new URL(
    (await page
      .getByRole("link", { name: "네이버 뉴스 검색", exact: true })
      .getAttribute("href"))!,
  );
  expect(naver.searchParams.get("query")).toBe(query);
  expect(naver.searchParams.get("ds")).toBe("2026.09.01");
  expect(naver.searchParams.get("de")).toBe("2026.09.30");
  const instagram = page.getByRole("region", { name: "인스타그램 검색 결과" });
  const indexed = new URL(
    (await instagram
      .getByRole("link", { name: "기간 적용 색인 검색" })
      .getAttribute("href"))!,
  );
  expect(indexed.searchParams.get("q")).toContain("site:instagram.com");
  expect(indexed.searchParams.get("q")).toContain("before:2026-10-01");
  await page.screenshot({
    path: "test-results/media-search-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/media-search-mobile.png",
    fullPage: true,
  });
  await page.getByRole("checkbox", { name: "구글", exact: true }).uncheck();
  await page.getByRole("combobox", { name: "검색 기간" }).selectOption("all");
  await expect(page.getByLabel("검색 시작일")).toBeDisabled();
  await page.getByRole("button", { name: "검색 후 수집", exact: true }).click();
  await expect(page.locator(".media-result-section")).toHaveCount(4);
  await expect(page.locator(".media-news-item")).toHaveCount(4);
  const allTime = new URL(
    (await page
      .getByRole("link", { name: "네이버 검색", exact: true })
      .getAttribute("href"))!,
  );
  expect(allTime.searchParams.has("ds")).toBe(false);
  expect(allTime.searchParams.get("where")).toBe("nexearch");
  await page.getByRole("checkbox", { name: "게시일 확인 결과만" }).check();
  await page.getByRole("button", { name: "검색 후 수집", exact: true }).click();
  await expect(page.locator(".media-news-item")).toHaveCount(2);
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page.getByLabel("언급 검색").fill(query);
  await page.getByLabel("데이터 유형").selectOption("real");
  await expect(page.locator(".mention-row")).toHaveCount(5);
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.locator(".nav-item").filter({ hasText: "현황" }).click();
  await expect(
    page.locator(".metrics .metric").first().locator("strong"),
  ).toHaveText("9건");
  await page.locator(".metrics .metric").first().click();
  await expect(page.locator(".mention-row")).toHaveCount(9);
});

test("dedicated cafes and blog search supports human evidence review and filtered exports", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator(".nav-item").filter({ hasText: "키워드 등록" }).click();
  await page.getByRole("button", { name: "모아커피 수정" }).click();
  await page.getByLabel("키워드 이름").fill("검토대상");
  await page
    .getByRole("textbox", { name: "별칭", exact: true })
    .fill("대상별칭");
  await page
    .getByRole("textbox", { name: /부정 키워드/ })
    .fill("개인정보 유출");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "검토대상 검색 수집", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "검토 후보만 저장·표시" }).check();
  await page.getByRole("button", { name: "검색 후 수집", exact: true }).click();
  await expect(page.locator(".media-result-section")).toHaveCount(3);
  await expect(page.locator(".media-news-item")).toHaveCount(3);
  await expect(page.locator(".media-result-heading")).toContainText(
    "신규 3건 저장",
  );
  await expect(
    page.getByRole("region", { name: "네이버 카페 검색 결과" }),
  ).toContainText("게시일 미확인");
  await page.screenshot({
    path: "test-results/review-search-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/review-search-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page.getByLabel("감정 필터").selectOption("all");
  await page.getByLabel("원문 검토 필터").selectOption("candidates");
  await expect(page.locator(".mention-row")).toHaveCount(3);
  await page.locator(".mention-title").first().click();
  await expect(
    page.locator(".review-evidence").filter({ hasText: "검토 후보" }),
  ).toContainText("위법 판정 아님");
  await page
    .getByRole("combobox", { name: "원문 검토", exact: true })
    .selectOption("source_checked");
  await page
    .getByRole("textbox", { name: "원문 확인자", exact: true })
    .fill("검토담당");
  await page
    .getByRole("textbox", { name: "원문 인용문", exact: true })
    .fill("개인정보 유출 예방에 관한 검토 자료");
  await page
    .getByRole("textbox", { name: "원문 맥락·검토 사유", exact: true })
    .fill("예방 안내 글이므로 비방이나 침해로 단정하지 않음");
  await page.getByRole("button", { name: "확인 시각 기록" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/review-detail-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("원문 검토 필터").selectOption("source_checked");
  await expect(page.locator(".mention-row")).toHaveCount(1);
  await page.setViewportSize({ width: 1440, height: 960 });
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "보고서", exact: true }).click();
  const download = await pending;
  const html = await readFile((await download.path())!, "utf8");
  expect(html).toContain("검토담당");
  expect(html).toContain("예방 안내 글이므로");
  expect(html).toContain("위법 판정이 아닙니다");
  expect(html).toContain("선택된 언급 1건");
  const state = await (await request.get("/api/state")).json();
  const checked = state.mentions.find(
    (mention: { review?: { decision: string } }) =>
      mention.review?.decision === "source_checked",
  );
  expect(checked.review.checkedAt).toBeTruthy();
  expect(checked.manualSentiment).toBe(false);
  await page.reload();
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page.getByLabel("감정 필터").selectOption("all");
  await page.getByLabel("원문 검토 필터").selectOption("source_checked");
  await expect(page.locator(".mention-row")).toHaveCount(1);
  await page.locator(".mention-title").click();
  await page
    .getByRole("combobox", { name: "원문 검토", exact: true })
    .selectOption("excluded");
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("원문 검토 필터").selectOption("excluded");
  await expect(page.locator(".mention-row")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("negative duplicate collection preserves distinct originals and tracks repeated sightings", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator(".nav-item").filter({ hasText: "검색·수집" }).click();
  await page
    .getByRole("checkbox", { name: "중복 콘텐츠만 수집", exact: true })
    .check();
  await page.getByRole("button", { name: "검색 후 수집", exact: true }).click();
  await expect(page.locator(".media-news-item")).toHaveCount(3);
  await expect(page.locator(".media-result-heading")).toContainText(
    "중복 1그룹",
  );
  await expect(page.locator(".media-result-heading")).toContainText(
    "신규 3건 저장",
  );
  await page.getByRole("button", { name: "검색 후 수집", exact: true }).click();
  await expect(page.locator(".media-result-heading")).toContainText(
    "신규 0건 저장",
  );
  const state = await (await request.get("/api/state")).json();
  const collected = state.mentions.filter(
    (mention: { demo: boolean }) => !mention.demo,
  );
  expect(collected).toHaveLength(3);
  expect(
    collected.every(
      (mention: { seenCount: number }) => mention.seenCount === 2,
    ),
  ).toBeTruthy();
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page.getByLabel("중복 필터").selectOption("content");
  await expect(page.locator(".mention-row")).toHaveCount(3);
  await page.locator(".duplicate-group-button").first().click();
  await expect(
    page.getByRole("button", { name: "중복 그룹 해제" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/duplicate-collection-desktop.png",
    fullPage: true,
  });
  await page.locator(".mention-title").first().click();
  await expect(
    page.getByRole("region", { name: "동일 콘텐츠 원문" }),
  ).toHaveCount(1);
  await expect(page.locator('[aria-label="동일 콘텐츠 원문"] a')).toHaveCount(
    3,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await pending;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("URL 조회 횟수");
  expect(csv).toContain("감지 부정 키워드");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/duplicate-collection-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("중복 필터").selectOption("repeated_url");
  await expect(page.locator(".mention-row")).toHaveCount(3);
});

test("report drafts support editor, image evidence, status tracking and online report links", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  const row = page.locator(".mention-row").filter({
    hasText: "모아커피 배송 지연에 불만, 환불 문의 증가",
  });
  await expect(
    row.getByRole("link", { name: /온라인 신고하기/ }),
  ).toHaveAttribute("href", /^https:\/\//);
  await row.getByRole("button", { name: "신고원고 작성" }).click();
  await expect(
    page.getByRole("heading", { name: "신고원고", exact: true }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("신고 원고 에디터")).toContainText(
    "https://example.com/demo/1",
  );
  await dialog.getByRole("button", { name: "+ 정통망법 조항" }).click();
  await expect(dialog.getByLabel("신고 원고 에디터")).toHaveValue(/제44조의2/);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "evidence.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(dialog.locator(".report-image-card")).toHaveCount(1);
  await dialog.getByRole("button", { name: "원고 저장" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".mention-row")).toHaveCount(1);
  await expect(page.locator(".report-image-strip img")).toHaveCount(1);
  let state = await (await request.get("/api/state")).json();
  expect(state.reports).toHaveLength(1);
  expect(state.reports[0].status).toBe("planned");
  expect(
    state.mentions.find(
      (m: { id: string }) => m.id === state.reports[0].mentionId,
    ).reportStatus,
  ).toBe("planned");
  await page.locator(".mention-side select").first().selectOption("deleted");
  await expect(page.locator(".badge.report-deleted")).toHaveCount(1);
  state = await (await request.get("/api/state")).json();
  expect(state.reports[0].status).toBe("deleted");
  await page.screenshot({
    path: "test-results/reports-desktop.png",
    fullPage: true,
  });
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page.getByLabel("신고 결과 필터").selectOption("deleted");
  await expect(page.locator(".mention-row")).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.locator(".nav-item").filter({ hasText: "신고원고" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/reports-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("new news, SNS and community media appear as separate categories", async ({
  page,
}) => {
  await page.locator(".nav-item").filter({ hasText: "검색·수집" }).click();
  for (const name of ["네이버뉴스", "X", "쓰레드"])
    await expect(
      page.getByRole("checkbox", { name, exact: true }),
    ).toBeVisible();
  const community = page.getByRole("group", { name: "커뮤니티 분류" });
  for (const name of [
    "에펨코리아(FMKorea)",
    "디시인사이드",
    "뽐뿌",
    "루리웹",
    "클리앙",
    "보배드림",
    "더쿠",
    "인스티즈",
    "네이트판",
    "여성시대",
    "아카라이브",
  ])
    await expect(
      community.getByRole("checkbox", { name, exact: true }),
    ).toBeVisible();
  await community.getByRole("checkbox", { name: "커뮤니티 전체" }).check();
  await expect(community.getByRole("checkbox", { checked: true })).toHaveCount(
    12,
  );
});

test("results default to negative, highlight negative words, flag broken links and draft AI prompts", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await expect(page.getByLabel("감정 필터")).toHaveValue("negative");
  await expect(page.getByLabel("상태 필터")).toHaveValue("all");
  await expect(page.locator(".mention-row")).toHaveCount(2);
  const hit = page.locator(".negative-hit").first();
  await expect(hit).toBeVisible();
  expect(await hit.evaluate((node) => getComputedStyle(node).color)).toBe(
    "rgb(209, 52, 42)",
  );
  await expect(page.getByRole("button", { name: "수집 채널" })).toHaveCount(0);
  await page.locator(".nav-item").filter({ hasText: "검색·수집" }).click();
  await page.getByRole("button", { name: "검색 후 수집", exact: true }).click();
  await expect(page.locator(".media-news-item").first()).toBeVisible();
  const state = await (await request.get("/api/state")).json();
  const real = state.mentions.filter((m: { demo: boolean }) => !m.demo);
  expect(real.length).toBeGreaterThan(0);
  await page.locator(".nav-item").filter({ hasText: "수집 결과" }).click();
  await page.getByLabel("데이터 유형").selectOption("real");
  await page.getByRole("button", { name: "링크 점검", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("링크");
  await expect(page.locator(".link-status").first()).toHaveAttribute(
    "class",
    /link-(ok|broken|unknown)/,
  );
  await page.getByRole("button", { name: "신고원고 작성" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("AI 프롬프트")).toHaveValue(
    /정보통신망법 제44조의2/,
  );
  const chatgpt = await dialog
    .getByRole("link", { name: /ChatGPT에서 작성/ })
    .getAttribute("href");
  expect(new URL(chatgpt!).searchParams.get("q")).toContain("[신고 정보]");
  await expect(
    dialog.getByRole("button", { name: "AI로 바로 작성" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("AI 결과 붙여넣기")
    .fill("AI가 작성한 신고 원고 본문");
  await dialog.getByRole("button", { name: "에디터에 적용" }).click();
  await expect(dialog.getByLabel("신고 원고 에디터")).toHaveValue(
    "AI가 작성한 신고 원고 본문",
  );
  await page.screenshot({
    path: "test-results/ai-prompt-desktop.png",
    fullPage: true,
  });
});
