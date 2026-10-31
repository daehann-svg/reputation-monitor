import { randomUUID, createHash } from "node:crypto";

export const defaults = {
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

export function initialState() {
  return {
    version: 1,
    settings: structuredClone(defaults),
    keywords: [],
    sources: [],
    mentions: [],
    alerts: [],
    runs: [],
    savedViews: [],
    reports: [],
    lastCollectedAt: null,
  };
}

export function matchesKeyword(text, keyword) {
  const normalized = text.toLocaleLowerCase();
  const includes = [keyword.name, ...keyword.aliases].some((word) =>
    normalized.includes(word.toLocaleLowerCase()),
  );
  return (
    keyword.enabled &&
    includes &&
    !keyword.excludes.some((word) =>
      normalized.includes(word.toLocaleLowerCase()),
    )
  );
}

export function analyze(text, settings) {
  const normalized = text.toLocaleLowerCase();
  const positive = settings.positiveWords.filter((word) =>
    normalized.includes(word.toLocaleLowerCase()),
  );
  const negative = settings.negativeWords.filter((word) =>
    normalized.includes(word.toLocaleLowerCase()),
  );
  const score = positive.length - negative.length;
  return {
    sentiment: score < 0 ? "negative" : score > 0 ? "positive" : "neutral",
    score,
    evidence: [...negative, ...positive],
  };
}

export function reviewCandidates(value) {
  const rules = [
    [
      "공격·비방 표현",
      ["인신공격", "사기꾼", "거짓말쟁이", "비방", "명예훼손"],
    ],
    ["위협 표현", ["협박", "위협", "보복"]],
    [
      "개인정보 노출 표현",
      ["신상털", "신상 공개", "주소 공개", "전화번호 공개", "개인정보 유출"],
    ],
    ["차별 표현", ["혐오", "인종차별", "성차별", "장애인 비하"]],
  ];
  const normalized = plainText(value);
  return rules.flatMap(([category, terms]) =>
    terms.flatMap((term) => {
      const position = normalized.indexOf(term);
      if (position < 0) return [];
      const excerpt = normalized
        .slice(Math.max(0, position - 60), position + term.length + 80)
        .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[전화번호 가림]")
        .replace(/\b\d{6}[-\s]?[1-8]\d{6}\b/g, "[식별번호 가림]");
      return [{ category, term, excerpt }];
    }),
  );
}

export function safeLink(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function plainText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

export function addItems(
  state,
  items,
  source,
  now = new Date(),
  metadata = {},
) {
  let added = 0;
  const existing = new Map(
    state.mentions.map((mention) => [mention.url, mention]),
  );
  for (const item of items) {
    const url = safeLink(item.link);
    if (!url) continue;
    const title = plainText(item.title);
    const summary = plainText(
      item.contentSnippet || item.content || item.description,
    );
    const keywords = state.keywords.filter(
      (keyword) =>
        matchesKeyword(`${title} ${summary}`, keyword) &&
        (!metadata.negativeOnly ||
          (keyword.negativeWords || defaults.negativeWords.slice(0, 3)).some(
            (word) =>
              `${title} ${summary}`
                .toLocaleLowerCase()
                .includes(word.toLocaleLowerCase()),
          )),
    );
    const matchedNegativeWords = [
      ...new Set([
        ...keywords.flatMap((keyword) => keyword.negativeWords || []),
        ...(metadata.negativeWords || []),
      ]),
    ]
      .filter((word) =>
        `${title} ${summary}`
          .toLocaleLowerCase()
          .includes(word.toLocaleLowerCase()),
      )
      .slice(0, 100);
    if (!keywords.length && !metadata.searchQuery) continue;
    if (existing.has(url)) {
      const mention = existing.get(url);
      mention.keywordIds = [
        ...new Set([
          ...mention.keywordIds,
          ...keywords.map((keyword) => keyword.id),
        ]),
      ];
      if (metadata.searchQuery) mention.searchQuery = metadata.searchQuery;
      if (metadata.medium) mention.medium = metadata.medium;
      mention.seenCount = Math.min(1000000000, (mention.seenCount || 1) + 1);
      mention.lastSeenAt = now.toISOString();
      mention.matchedNegativeWords = [
        ...new Set([
          ...(mention.matchedNegativeWords || []),
          ...matchedNegativeWords,
        ]),
      ].slice(0, 100);
      continue;
    }
    const parsedDate = new Date(item.isoDate || item.pubDate || now);
    const publishedAt =
      Number.isNaN(parsedDate.getTime()) || parsedDate > now
        ? now.toISOString()
        : parsedDate.toISOString();
    if (
      new Date(publishedAt) <
      new Date(now.getTime() - state.settings.retentionDays * 86400000)
    )
      continue;
    const analysis = analyze(`${title} ${summary}`, state.settings);
    const mention = {
      id: randomUUID(),
      title: title || "제목 없음",
      summary,
      url,
      source: plainText(item.creator || source).slice(0, 1000),
      keywordIds: keywords.map((keyword) => keyword.id),
      publishedAt,
      collectedAt: now.toISOString(),
      ...analysis,
      status: "new",
      starred: false,
      note: "",
      assignee: "",
      tags: [],
      demo: false,
      manualSentiment: false,
      priority: "normal",
      dueAt: null,
      searchQuery: metadata.searchQuery || "",
      medium: metadata.medium || null,
      dateBasis: metadata.dateBasis || "published",
      contentKey: contentFingerprint(title, summary, url),
      seenCount: 1,
      lastSeenAt: now.toISOString(),
      matchedNegativeWords,
      reviewCandidates: reviewCandidates(`${title} ${summary}`),
      review: {
        decision: "unreviewed",
        quote: "",
        context: "",
        reviewer: "",
        checkedAt: null,
      },
      reportStatus: null,
    };
    state.mentions.unshift(mention);
    existing.set(url, mention);
    added++;
    if (
      state.settings.alertEnabled &&
      analysis.sentiment === "negative" &&
      analysis.score <= -state.settings.alertThreshold
    ) {
      state.alerts.unshift({
        id: randomUUID(),
        mentionId: mention.id,
        title,
        createdAt: now.toISOString(),
        read: false,
      });
    }
  }
  prune(state, now);
  return added;
}

export function prune(state, now = new Date()) {
  const cutoff = now.getTime() - state.settings.retentionDays * 86400000;
  state.mentions = state.mentions
    .filter((mention) => new Date(mention.publishedAt).getTime() >= cutoff)
    .slice(0, 20000);
  const ids = new Set(state.mentions.map((mention) => mention.id));
  state.alerts = state.alerts
    .filter((alert) => ids.has(alert.mentionId))
    .slice(0, 1000);
  state.runs = state.runs.slice(0, 100);
}

export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function contentFingerprint(title, summary, url) {
  const normalize = (value) =>
    plainText(value).normalize("NFKC").toLocaleLowerCase();
  const body = summary.trim()
    ? `${normalize(title)}\n${normalize(summary)}`
    : `url:${safeLink(url)}`;
  return createHash("sha256").update(body).digest("hex");
}

export const reportCenterUrls = {
  naver: "https://help.naver.com/post/main.help",
  naver_news: "https://help.naver.com/post/main.help",
  naver_blog: "https://help.naver.com/post/main.help",
  naver_cafe: "https://help.naver.com/post/main.help",
  daum_cafe: "https://cs.kakao.com/helps?service=52",
  google: "https://support.google.com/legal/troubleshooter/1114905",
  youtube: "https://www.youtube.com/howyoutubeworks/policies/community-guidelines/",
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

export function getReportCenterUrl(medium, url = "") {
  if (medium && reportCenterUrls[medium]) return reportCenterUrls[medium];
  const lower = String(url || "").toLowerCase();
  if (lower.includes("naver.com")) return reportCenterUrls.naver;
  if (lower.includes("daum.net") || lower.includes("kakao.com")) return reportCenterUrls.daum_cafe;
  if (lower.includes("youtube.com")) return reportCenterUrls.youtube;
  if (lower.includes("instagram.com")) return reportCenterUrls.instagram;
  if (lower.includes("tiktok.com")) return reportCenterUrls.tiktok;
  if (lower.includes("x.com") || lower.includes("twitter.com")) return reportCenterUrls.x;
  if (lower.includes("threads.net")) return reportCenterUrls.threads;
  if (lower.includes("dcinside.com")) return reportCenterUrls.dcinside;
  if (lower.includes("fmkorea.com")) return reportCenterUrls.fmkorea;
  if (lower.includes("clien.net")) return reportCenterUrls.clien;
  return reportCenterUrls.default;
}

export function seedDemo(state) {
  const keyword = {
    id: randomUUID(),
    name: "모아커피",
    aliases: ["MOA Coffee"],
    excludes: ["채용"],
    negativeWords: defaults.negativeWords.slice(0, 3),
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
    state.mentions.push({
      id: randomUUID(),
      title,
      summary,
      url: `https://example.com/demo/${index}`,
      source: ["뉴스", "블로그", "커뮤니티"][index % 3],
      keywordIds: [keyword.id],
      publishedAt: date,
      collectedAt: date,
      ...analyze(`${title} ${summary}`, state.settings),
      status: index === 4 ? "reviewing" : "new",
      starred: index === 1,
      note: "",
      assignee: "",
      tags: index === 1 ? ["배송"] : [],
      demo: true,
    });
  });
  const negative = state.mentions.find(
    (mention) => mention.sentiment === "negative",
  );
  state.alerts.push({
    id: randomUUID(),
    mentionId: negative.id,
    title: negative.title,
    createdAt: negative.publishedAt,
    read: false,
  });
}
