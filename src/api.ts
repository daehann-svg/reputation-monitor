import type {
  AppState,
  Keyword,
  MediaSearchResult,
  Mention,
  ReportDraft,
  ReportStatus,
  SearchMedium,
} from "./types";

const STORAGE_KEY = "reputation_monitor_browser_state_v1";

export const reportCenterUrls: Record<string, string> = {
  naver: "https://help.naver.com/post/main.help",
  naver_news: "https://help.naver.com/post/main.help",
  naver_blog: "https://help.naver.com/post/main.help",
  naver_cafe: "https://help.naver.com/post/main.help",
  daum_cafe: "https://cs.kakao.com/helps?service=52",
  google: "https://support.google.com/legal/troubleshooter/1114905",
  youtube:
    "https://www.youtube.com/howyoutubeworks/policies/community-guidelines/",
  tiktok: "https://www.tiktok.com/legal/report/feedback",
  instagram: "https://help.instagram.com/contact/383679321740945",
  x: "https://help.x.com/ko/forms",
  threads: "https://help.instagram.com/contact/383679321740945",
  fmkorea: "https://www.fmkorea.com/",
  dcinside: "https://clean.dcinside.com/",
  ppomppu: "https://www.ppomppu.co.kr/",
  ruliweb: "https://bbs.ruliweb.com/",
  clien: "https://www.clien.net/service/cs/singo",
  bobaedream: "https://www.bobaedream.co.kr/",
  theqoo: "https://theqoo.net/",
  instiz: "https://www.instiz.net/",
  natepann: "https://pann.nate.com/",
  yeosingsidae: "https://cs.kakao.com/helps?service=52",
  arcalive: "https://arca.live/",
  default: "https://www.kocsc.or.kr/mainPage.do",
};

export function getReportCenterUrl(medium?: string | null, url = ""): string {
  if (medium && reportCenterUrls[medium]) return reportCenterUrls[medium];
  const lower = url.toLowerCase();
  if (lower.includes("naver.com")) return reportCenterUrls.naver;
  if (lower.includes("daum.net") || lower.includes("kakao.com"))
    return reportCenterUrls.daum_cafe;
  if (lower.includes("youtube.com")) return reportCenterUrls.youtube;
  if (lower.includes("instagram.com")) return reportCenterUrls.instagram;
  if (lower.includes("tiktok.com")) return reportCenterUrls.tiktok;
  if (lower.includes("x.com") || lower.includes("twitter.com"))
    return reportCenterUrls.x;
  if (lower.includes("threads.net")) return reportCenterUrls.threads;
  if (lower.includes("dcinside.com")) return reportCenterUrls.dcinside;
  if (lower.includes("fmkorea.com")) return reportCenterUrls.fmkorea;
  if (lower.includes("clien.net")) return reportCenterUrls.clien;
  return reportCenterUrls.default;
}

export const mediaNamesMap: Record<SearchMedium, string> = {
  naver: "네이버",
  naver_news: "네이버뉴스",
  google: "구글",
  youtube: "유튜브",
  tiktok: "틱톡",
  instagram: "인스타그램",
  x: "X",
  threads: "쓰레드",
  naver_blog: "네이버 블로그",
  naver_cafe: "네이버 카페",
  daum_cafe: "다음 카페",
  fmkorea: "에펨코리아(FMKorea)",
  dcinside: "디시인사이드",
  ppomppu: "뽐뿌",
  ruliweb: "루리웹",
  clien: "클리앙",
  bobaedream: "보배드림",
  theqoo: "더쿠",
  instiz: "인스티즈",
  natepann: "네이트판",
  yeosingsidae: "여성시대",
  arcalive: "아카라이브",
};

const defaultSettings = {
  organization: "내 브랜드",
  autoCollect: false,
  intervalMinutes: 30,
  retentionDays: 90,
  alertThreshold: 2,
  alertEnabled: true,
  positiveWords: [
    "추천",
    "만족",
    "훌륭",
    "성장",
    "호평",
    "좋아요",
    "감사",
    "혁신",
    "최고",
  ],
  negativeWords: [
    "불만",
    "환불",
    "불친절",
    "논란",
    "피해",
    "실망",
    "불량",
    "사기",
    "위험",
    "최악",
  ],
};

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function analyzeBrowser(text: string, settings = defaultSettings) {
  const normalized = text.toLocaleLowerCase();
  const positive = settings.positiveWords.filter((word) =>
    normalized.includes(word.toLocaleLowerCase()),
  );
  const negative = settings.negativeWords.filter((word) =>
    normalized.includes(word.toLocaleLowerCase()),
  );
  const score = positive.length - negative.length;
  return {
    sentiment: (score < 0
      ? "negative"
      : score > 0
        ? "positive"
        : "neutral") as Mention["sentiment"],
    score,
    evidence: [...negative, ...positive],
  };
}

function seedBrowserDemo(state: AppState) {
  const keyword: Keyword = {
    id: makeId(),
    name: "모아커피",
    aliases: ["MOA Coffee"],
    excludes: ["채용"],
    negativeWords: defaultSettings.negativeWords.slice(0, 3),
    enabled: true,
    color: "#087f73",
  };
  state.keywords.push(keyword);
  const titles = [
    [
      "모아커피 신메뉴 출시, 고객들의 호평 이어져",
      "시즌 메뉴에 대한 만족과 추천 후기가 늘고 있습니다.",
    ],
    [
      "모아커피 배송 지연에 불만, 환불 문의 증가",
      "일부 고객이 배송 지연으로 실망과 피해를 호소했습니다.",
    ],
    [
      "모아커피, 지역 행사에 참여",
      "이번 주 지역 문화 행사에 커피 부스를 운영합니다.",
    ],
    [
      "MOA Coffee 매장 방문 후기",
      "친절한 응대와 훌륭한 커피, 다시 방문하고 싶어요.",
    ],
    [
      "모아커피 포장 품질 논란",
      "불량 포장으로 불만이 접수됐으며 교환이 진행 중입니다.",
    ],
    [
      "모아커피 신규 매장 오픈 일정 공개",
      "다음 달 신규 매장 운영 일정이 공개됐습니다.",
    ],
    ["모아커피 멤버십 만족 후기", "멤버십 혜택이 좋아요. 주변에도 추천합니다."],
    ["모아커피 가격 변경 소식", "일부 메뉴 가격이 다음 주부터 변경됩니다."],
    [
      "모아커피 지역 상생 활동에 감사",
      "지역 농가와 협업한 제품에 호평을 보냈습니다.",
    ],
  ];
  titles.forEach(([title, summary], index) => {
    const date = new Date(Date.now() - index * 5 * 3600000).toISOString();
    const analysis = analyzeBrowser(`${title} ${summary}`, state.settings);
    state.mentions.push({
      id: makeId(),
      title,
      summary,
      url: `https://example.com/demo/${index}`,
      source: ["뉴스", "블로그", "커뮤니티"][index % 3],
      keywordIds: [keyword.id],
      publishedAt: date,
      collectedAt: date,
      ...analysis,
      status: index === 4 ? "reviewing" : "new",
      starred: index === 1,
      note: "",
      assignee: "",
      tags: index === 1 ? ["배송"] : [],
      demo: true,
      priority: "normal",
      dueAt: null,
      contentKey: `demo-${index}`,
      seenCount: 1,
      lastSeenAt: date,
      matchedNegativeWords: keyword.negativeWords.filter((word) =>
        `${title} ${summary}`.includes(word),
      ),
      reviewCandidates: [],
      review: {
        decision: "unreviewed",
        quote: "",
        context: "",
        reviewer: "",
        checkedAt: null,
      },
      reportStatus: null,
    });
  });
  const negative = state.mentions.find(
    (mention) => mention.sentiment === "negative",
  );
  if (negative) {
    state.alerts.push({
      id: makeId(),
      mentionId: negative.id,
      title: negative.title,
      createdAt: negative.publishedAt,
      read: false,
    });
  }
}

function getBrowserState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed.reports) parsed.reports = [];
      return parsed;
    }
  } catch {}
  const initial: AppState = {
    version: 1,
    settings: structuredClone(defaultSettings),
    keywords: [],
    sources: [],
    mentions: [],
    alerts: [],
    runs: [],
    savedViews: [],
    reports: [],
    lastCollectedAt: null,
    collecting: false,
    searching: false,
    progress: null,
  };
  seedBrowserDemo(initial);
  saveBrowserState(initial);
  return initial;
}

function saveBrowserState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function buildClientSearchLinks(
  media: SearchMedium,
  query: string,
  startDate = "",
  endDate = "",
) {
  const domains: Record<SearchMedium, string> = {
    naver: "naver.com",
    naver_news: "news.naver.com",
    google: "",
    naver_blog: "blog.naver.com",
    naver_cafe: "cafe.naver.com",
    daum_cafe: "cafe.daum.net",
    youtube: "youtube.com",
    tiktok: "tiktok.com",
    instagram: "instagram.com",
    x: "x.com",
    threads: "threads.net",
    fmkorea: "fmkorea.com",
    dcinside: "dcinside.com",
    ppomppu: "ppomppu.co.kr",
    ruliweb: "ruliweb.com",
    clien: "clien.net",
    bobaedream: "bobaedream.co.kr",
    theqoo: "theqoo.net",
    instiz: "instiz.net",
    natepann: "pann.nate.com",
    yeosingsidae: "cafe.daum.net/subdued20club",
    arcalive: "arca.live",
  };
  const indexedQuery = [
    query,
    domains[media] ? `site:${domains[media]}` : "",
    startDate ? `after:${startDate} before:${endDate}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const periodUrl = `https://www.google.com/search?${new URLSearchParams({ q: indexedQuery }).toString()}`;
  let nativeUrl = periodUrl;
  if (["naver", "naver_news", "naver_blog", "naver_cafe"].includes(media)) {
    nativeUrl = `https://search.naver.com/search.naver?${new URLSearchParams({
      query,
      where:
        media === "naver_blog"
          ? "blog"
          : media === "naver_cafe"
            ? "article"
            : media === "naver_news" || startDate
              ? "news"
              : "nexearch",
    }).toString()}`;
  } else if (media === "daum_cafe" || media === "yeosingsidae") {
    nativeUrl = `https://search.daum.net/search?${new URLSearchParams({
      w: "cafe",
      q: media === "yeosingsidae" ? `여성시대 ${query}` : query,
    }).toString()}`;
  } else if (media === "youtube") {
    nativeUrl = `https://www.youtube.com/results?${new URLSearchParams({ search_query: query }).toString()}`;
  } else if (media === "tiktok") {
    nativeUrl = `https://www.tiktok.com/search?${new URLSearchParams({ q: query }).toString()}`;
  } else if (media === "instagram") {
    nativeUrl = `https://www.instagram.com/explore/search/keyword/?${new URLSearchParams({ q: query }).toString()}`;
  } else if (media === "x") {
    nativeUrl = `https://x.com/search?${new URLSearchParams({ q: query, f: "live" }).toString()}`;
  } else if (media === "threads") {
    nativeUrl = `https://www.threads.net/search?${new URLSearchParams({ q: query, serp_type: "default" }).toString()}`;
  } else if (media === "fmkorea") {
    nativeUrl = `https://www.fmkorea.com/search.php?${new URLSearchParams({ act: "IS", is_keyword: query }).toString()}`;
  } else if (media === "dcinside") {
    nativeUrl = `https://search.dcinside.com/combine?${new URLSearchParams({ q: query }).toString()}`;
  } else if (media === "ppomppu") {
    nativeUrl = `https://www.ppomppu.co.kr/search_bbs.php?${new URLSearchParams({ keyword: query }).toString()}`;
  } else if (media === "ruliweb") {
    nativeUrl = `https://bbs.ruliweb.com/search?${new URLSearchParams({ q: query }).toString()}`;
  } else if (media === "clien") {
    nativeUrl = `https://www.clien.net/service/search?${new URLSearchParams({ q: query }).toString()}`;
  } else if (media === "bobaedream") {
    nativeUrl = `https://www.google.com/search?${new URLSearchParams({ q: `${query} site:bobaedream.co.kr` }).toString()}`;
  } else if (media === "theqoo") {
    nativeUrl = `https://theqoo.net/total?${new URLSearchParams({ search_target: "title_content", search_keyword: query }).toString()}`;
  } else if (media === "instiz") {
    nativeUrl = `https://www.instiz.net/popup_search.htm?${new URLSearchParams({ k: query }).toString()}`;
  } else if (media === "natepann") {
    nativeUrl = `https://pann.nate.com/search/talk?${new URLSearchParams({ q: query }).toString()}`;
  } else if (media === "arcalive") {
    nativeUrl = `https://arca.live/b/breaking?${new URLSearchParams({ target: "all", keyword: query }).toString()}`;
  }
  return {
    nativeUrl,
    periodUrl,
    nativePeriod: ["naver", "naver_news", "google"].includes(media),
  };
}

async function handleBrowserApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const state = getBrowserState();
  const payload = (body || {}) as Record<string, unknown>;
  if (path === "/state" && method === "GET") return state as unknown as T;
  if (path === "/ai/status") return { configured: false } as unknown as T;
  if (path === "/ai/report-draft")
    throw new Error(
      "AI 바로 작성은 로컬 서버(OPENAI_API_KEY 설정)에서만 동작합니다. 프롬프트 복사 또는 ChatGPT·Claude 버튼을 이용하세요.",
    );
  if (path === "/mentions/check-links" && method === "POST") {
    const ids = new Set((payload.ids as string[]) || []);
    const targets = state.mentions.filter((m) => ids.has(m.id) && !m.demo);
    // Opaque no-cors requests only reveal unreachable hosts, not HTTP 404s.
    const statuses = await Promise.all(
      targets.map((m) =>
        fetch(m.url, {
          mode: "no-cors",
          signal: AbortSignal.timeout(10000),
        }).then(
          () => "ok" as const,
          (error: Error) =>
            error.name === "TimeoutError"
              ? ("unknown" as const)
              : ("broken" as const),
        ),
      ),
    );
    const checkedAt = new Date().toISOString();
    targets.forEach((m, index) => {
      m.linkStatus = statuses[index];
      m.linkCheckedAt = checkedAt;
    });
    saveBrowserState(state);
    return {
      checked: targets.length,
      broken: statuses.filter((s) => s === "broken").length,
    } as unknown as T;
  }
  if (path === "/demo" && method === "POST") {
    seedBrowserDemo(state);
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/demo" && method === "DELETE") {
    state.mentions = state.mentions.filter((mention) => !mention.demo);
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/keywords" && method === "POST") {
    const created: Keyword = {
      id: makeId(),
      name: String(payload.name || ""),
      aliases: (payload.aliases as string[]) || [],
      excludes: (payload.excludes as string[]) || [],
      negativeWords:
        (payload.negativeWords as string[]) ||
        defaultSettings.negativeWords.slice(0, 3),
      color: String(payload.color || "#087f73"),
      enabled: payload.enabled !== false,
    };
    state.keywords.push(created);
    saveBrowserState(state);
    return created as unknown as T;
  }
  if (path.startsWith("/keywords/") && method === "PUT") {
    const id = path.split("/")[2];
    const target = state.keywords.find((item) => item.id === id);
    if (target) Object.assign(target, payload);
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path.startsWith("/keywords/") && method === "DELETE") {
    const id = path.split("/")[2];
    state.keywords = state.keywords.filter((item) => item.id !== id);
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/settings" && method === "PUT") {
    state.settings = payload as unknown as AppState["settings"];
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/sources" && method === "POST") {
    const created = {
      id: makeId(),
      name: String(payload.name || ""),
      url: String(payload.url || ""),
      enabled: true,
    };
    state.sources.push(created);
    saveBrowserState(state);
    return created as unknown as T;
  }
  if (path.startsWith("/sources/") && method === "PATCH") {
    const id = path.split("/")[2];
    const target = state.sources.find((item) => item.id === id);
    if (target) target.enabled = Boolean(payload.enabled);
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path.startsWith("/sources/") && method === "DELETE") {
    const id = path.split("/")[2];
    state.sources = state.sources.filter((item) => item.id !== id);
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path.startsWith("/mentions/") && method === "PATCH") {
    const id = path.split("/")[2];
    const target = state.mentions.find((item) => item.id === id);
    if (target) {
      Object.assign(target, payload);
      if (payload.reportStatus !== undefined && state.reports) {
        state.reports
          .filter((report) => report.mentionId === id)
          .forEach((report) => {
            if (payload.reportStatus)
              report.status = payload.reportStatus as ReportStatus;
            report.updatedAt = new Date().toISOString();
          });
      }
    }
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/mentions/bulk" && method === "POST") {
    const ids = new Set((payload.ids as string[]) || []);
    state.mentions
      .filter((item) => ids.has(item.id))
      .forEach((item) => {
        if (payload.status) item.status = payload.status as Mention["status"];
        if (payload.reportStatus !== undefined)
          item.reportStatus = payload.reportStatus as ReportStatus | null;
      });
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/mentions/reanalyze" && method === "POST") {
    const ids = new Set((payload.ids as string[]) || []);
    let count = 0;
    state.mentions
      .filter((item) => ids.has(item.id))
      .forEach((item) => {
        Object.assign(
          item,
          analyzeBrowser(`${item.title} ${item.summary}`, state.settings),
        );
        count++;
      });
    saveBrowserState(state);
    return { count } as unknown as T;
  }
  if (path === "/views" && method === "POST") {
    const created = {
      id: makeId(),
      name: String(payload.name || ""),
      filters: payload.filters as AppState["savedViews"][0]["filters"],
    };
    state.savedViews.push(created);
    saveBrowserState(state);
    return created as unknown as T;
  }
  if (path.startsWith("/views/") && method === "DELETE") {
    const id = path.split("/")[2];
    state.savedViews = state.savedViews.filter((item) => item.id !== id);
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/alerts/read" && method === "POST") {
    const ids = new Set((payload.ids as string[]) || []);
    state.alerts.forEach((alert) => {
      if (ids.has(alert.id)) alert.read = true;
    });
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/reports" && method === "POST") {
    const now = new Date().toISOString();
    const report: ReportDraft = {
      id: makeId(),
      title: String(payload.title || "신고 원고"),
      content: String(payload.content || ""),
      status: (payload.status as ReportStatus) || "planned",
      category: String(payload.category || "권리침해·명예훼손 신고"),
      targetUrl: String(payload.targetUrl || ""),
      reportUrl: String(payload.reportUrl || ""),
      platform: String(payload.platform || ""),
      mentionId: (payload.mentionId as string) || null,
      images: (payload.images as ReportDraft["images"]) || [],
      createdAt: now,
      updatedAt: now,
    };
    if (!state.reports) state.reports = [];
    state.reports.unshift(report);
    if (report.mentionId) {
      const mention = state.mentions.find(
        (item) => item.id === report.mentionId,
      );
      if (mention) mention.reportStatus = report.status;
    }
    saveBrowserState(state);
    return report as unknown as T;
  }
  if (
    path.startsWith("/reports/") &&
    path.endsWith("/status") &&
    method === "PATCH"
  ) {
    const id = path.split("/")[2];
    const target = (state.reports || []).find((item) => item.id === id);
    if (target) {
      target.status = payload.status as ReportStatus;
      target.updatedAt = new Date().toISOString();
      if (target.mentionId) {
        const mention = state.mentions.find(
          (item) => item.id === target.mentionId,
        );
        if (mention) mention.reportStatus = target.status;
      }
    }
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path.startsWith("/reports/") && method === "PUT") {
    const id = path.split("/")[2];
    const target = (state.reports || []).find((item) => item.id === id);
    if (target) {
      Object.assign(target, payload, { updatedAt: new Date().toISOString() });
      if (target.mentionId) {
        const mention = state.mentions.find(
          (item) => item.id === target.mentionId,
        );
        if (mention) mention.reportStatus = target.status;
      }
    }
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path.startsWith("/reports/") && method === "DELETE") {
    const id = path.split("/")[2];
    const target = (state.reports || []).find((item) => item.id === id);
    state.reports = (state.reports || []).filter((item) => item.id !== id);
    if (target?.mentionId) {
      const remaining = state.reports.find(
        (item) => item.mentionId === target.mentionId,
      );
      const mention = state.mentions.find(
        (item) => item.id === target.mentionId,
      );
      if (mention) mention.reportStatus = remaining ? remaining.status : null;
    }
    saveBrowserState(state);
    return { ok: true } as unknown as T;
  }
  if (path === "/search" && method === "POST") {
    const keyword = state.keywords.find(
      (item) => item.id === payload.keywordId && item.enabled,
    );
    const query = keyword?.name || String(payload.query || "브랜드");
    const negativeWords =
      keyword?.negativeWords || defaultSettings.negativeWords.slice(0, 3);
    const mediaList = (payload.media as SearchMedium[]) || ["naver_blog"];
    const startDate = String(payload.startDate || "");
    const endDate = String(payload.endDate || "");
    const now = new Date().toISOString();
    // Static hosting cannot crawl other sites (CORS), so only real search links are returned.
    const platforms = mediaList.map((id) => ({
      id,
      name: mediaNamesMap[id] || id,
      ...buildClientSearchLinks(id, query, startDate, endDate),
      mode: "index" as const,
      error: null,
      warnings: [
        "웹·모바일 단독 모드: 자동 수집은 로컬 서버에서만 동작합니다. 매체 검색 링크로 원문을 확인하세요.",
      ],
      saved: 0,
      duplicates: 0,
      skipped: 0,
      results: [],
    }));
    const result: MediaSearchResult = {
      query,
      media: mediaList,
      startDate,
      endDate,
      searchedAt: now,
      saved: 0,
      saveResults: false,
      negativeWords,
      duplicateGroups: 0,
      platforms,
    };
    return result as unknown as T;
  }
  if (path === "/collect" && method === "POST") {
    const now = new Date().toISOString();
    state.lastCollectedAt = now;
    saveBrowserState(state);
    return {
      id: makeId(),
      startedAt: now,
      finishedAt: now,
      added: 0,
      errors: [],
      feeds: 1,
    } as unknown as T;
  }
  if (path === "/restore" && method === "POST") {
    const restored = payload as unknown as AppState;
    saveBrowserState(restored);
    return { ok: true } as unknown as T;
  }
  return { ok: true } as unknown as T;
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return handleBrowserApi<T>(path, method, body);
    }
    if (!response.ok) {
      const data = await response
        .json()
        .catch(() => ({ error: `요청 실패 (${response.status})` }));
      throw new Error(data.error || `요청 실패 (${response.status})`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    if (
      typeof window !== "undefined" &&
      !["127.0.0.1", "localhost"].includes(window.location.hostname)
    ) {
      return handleBrowserApi<T>(path, method, body);
    }
    throw error;
  }
}
export const splitWords = (text: string) => [
  ...new Set(
    text
      .split(/[,\n]/)
      .map((word) => word.trim())
      .filter(Boolean),
  ),
];
export const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "아직 없음";
function saveBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] as string,
  );
const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export async function download(path: string, filename: string, body?: unknown) {
  try {
    const response = await fetch(
      `/api${path}`,
      body === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    if (response.ok && response.headers.get("content-disposition")) {
      saveBlob(await response.blob(), filename);
      return;
    }
    if (["127.0.0.1", "localhost"].includes(window.location.hostname))
      throw new Error("파일을 내려받을 수 없습니다.");
  } catch (error) {
    if (["127.0.0.1", "localhost"].includes(window.location.hostname))
      throw error;
  }
  const state = getBrowserState();
  if (path === "/backup") {
    saveBlob(
      new Blob([JSON.stringify(state, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
      filename,
    );
    return;
  }
  const payload = (body || {}) as { ids?: string[]; format?: string };
  const mentions = state.mentions.filter(
    (m) => !payload.ids || payload.ids.includes(m.id),
  );
  const reportLabel = (m: Mention) =>
    m.reportStatus
      ? {
          planned: "신고예정",
          reporting: "신고중",
          delete_pending: "삭제예정",
          deleted: "삭제완료",
        }[m.reportStatus]
      : "미신고";
  if (payload.format === "html") {
    const rows = mentions
      .map(
        (m) =>
          `<tr><td><a href="${escapeHtml(m.url)}" rel="noreferrer">${escapeHtml(m.title)}</a><p>${escapeHtml(m.summary)}</p></td><td>${escapeHtml(m.source)}</td><td>${escapeHtml(m.sentiment)}</td><td>${escapeHtml(m.status)}</td><td>${escapeHtml(reportLabel(m))}</td></tr>`,
      )
      .join("");
    saveBlob(
      new Blob(
        [
          `<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escapeHtml(state.settings.organization)} 평판 보고서</title><body style="font-family:sans-serif"><h1>${escapeHtml(state.settings.organization)} 평판 보고서</h1><p>선택된 언급 ${mentions.length}건</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><tr><th>제목</th><th>출처</th><th>감정</th><th>상태</th><th>신고상태</th></tr>${rows}</table></body></html>`,
        ],
        { type: "text/html;charset=utf-8" },
      ),
      filename,
    );
    return;
  }
  const csv =
    "\uFEFF" +
    [
      ["제목", "출처", "감정", "상태", "신고상태", "URL"],
      ...mentions.map((m) => [
        m.title,
        m.source,
        m.sentiment,
        m.status,
        reportLabel(m),
        m.url,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
  saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}
