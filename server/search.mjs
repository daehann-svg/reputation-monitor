import {
  matchesKeyword,
  plainText,
  safeLink,
  addItems,
  reviewCandidates,
  contentFingerprint,
} from "./core.mjs";
import { z } from "zod";
import { newsUrl, readFeed } from "./collector.mjs";
import { collectPlatform, belongsToMedium } from "./providers.mjs";
import { randomUUID } from "node:crypto";

export const mediaNames = {
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

function validDate(value) {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export const searchSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    media: z
      .array(
        z.enum([
          "naver",
          "naver_news",
          "google",
          "youtube",
          "tiktok",
          "instagram",
          "x",
          "threads",
          "naver_blog",
          "naver_cafe",
          "daum_cafe",
          "fmkorea",
          "dcinside",
          "ppomppu",
          "ruliweb",
          "clien",
          "bobaedream",
          "theqoo",
          "instiz",
          "natepann",
          "yeosingsidae",
          "arcalive",
        ]),
      )
      .min(1)
      .max(25)
      .transform((items) => [...new Set(items)]),
    limit: z.number().int().min(10).max(100).default(50),
    strictDates: z.boolean().default(false),
    saveResults: z.boolean().default(true),
    aliases: z.array(z.string().trim().min(1).max(100)).max(3).default([]),
    excludes: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    problemTerms: z.array(z.string().trim().min(1).max(100)).max(3).default([]),
    candidateOnly: z.boolean().default(false),
    negativeWords: z
      .array(z.string().trim().min(1).max(100))
      .max(10)
      .default([]),
    negativeOnly: z.boolean().default(false),
    duplicatesOnly: z.boolean().default(false),
    keywordId: z.string().max(100).default(""),
    startDate: z
      .string()
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
      .refine(validDate, "시작일이 올바르지 않습니다.")
      .default(""),
    endDate: z
      .string()
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
      .refine(validDate, "종료일이 올바르지 않습니다.")
      .default(""),
  })
  .strict()
  .refine(
    (input) => !input.negativeOnly || input.negativeWords.length > 0,
    "부정 키워드를 하나 이상 등록하세요.",
  )
  .refine(
    (input) =>
      (!input.startDate && !input.endDate) ||
      (input.startDate && input.endDate && input.startDate <= input.endDate),
    "시작일과 종료일을 함께 지정하고 시작일을 종료일 이전으로 설정하세요.",
  );

function nextDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function settledQueries(queries, collect, signal) {
  const outcomes = new Array(queries.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, queries.length) }, async () => {
      while (next < queries.length) {
        const position = next++;
        try {
          signal.throwIfAborted();
          outcomes[position] = {
            status: "fulfilled",
            value: await collect(queries[position]),
          };
        } catch (reason) {
          outcomes[position] = { status: "rejected", reason };
        }
      }
    }),
  );
  return outcomes;
}

function urlWithParams(base, params) {
  const url = new URL(base);
  url.search = new URLSearchParams(params).toString();
  return url.href;
}

export function searchLinks(media, input) {
  const { query, startDate, endDate } = input;
  const domains = {
    naver: "naver.com",
    naver_news: "news.naver.com",
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
    startDate ? `after:${startDate} before:${nextDate(endDate)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const periodUrl = urlWithParams("https://www.google.com/search", {
    q: indexedQuery,
    ...(startDate
      ? {
          tbs: `cdr:1,cd_min:${startDate.slice(5, 7)}/${startDate.slice(8)}/${startDate.slice(0, 4)},cd_max:${endDate.slice(5, 7)}/${endDate.slice(8)}/${endDate.slice(0, 4)}`,
        }
      : {}),
  });
  let nativeUrl;
  if (["naver", "naver_news", "naver_blog", "naver_cafe"].includes(media)) {
    nativeUrl = urlWithParams("https://search.naver.com/search.naver", {
      query,
      where:
        media === "naver_blog"
          ? "blog"
          : media === "naver_cafe"
            ? "article"
            : media === "naver_news" || startDate
              ? "news"
              : "nexearch",
      ...(startDate
        ? {
            pd: "3",
            ds: startDate.replaceAll("-", "."),
            de: endDate.replaceAll("-", "."),
            nso: `so:dd,p:from${startDate.replaceAll("-", "")}to${endDate.replaceAll("-", "")},a:all`,
          }
        : {}),
    });
  } else if (media === "daum_cafe" || media === "yeosingsidae")
    nativeUrl = urlWithParams("https://search.daum.net/search", {
      w: "cafe",
      q: media === "yeosingsidae" ? `여성시대 ${query}` : query,
    });
  else if (media === "google") nativeUrl = periodUrl;
  else if (media === "youtube")
    nativeUrl = urlWithParams("https://www.youtube.com/results", {
      search_query: query,
    });
  else if (media === "tiktok")
    nativeUrl = urlWithParams("https://www.tiktok.com/search", { q: query });
  else if (media === "instagram")
    nativeUrl = urlWithParams(
      "https://www.instagram.com/explore/search/keyword/",
      { q: query },
    );
  else if (media === "x")
    nativeUrl = urlWithParams("https://x.com/search", {
      q: query,
      f: "live",
    });
  else if (media === "threads")
    nativeUrl = urlWithParams("https://www.threads.net/search", {
      q: query,
      serp_type: "default",
    });
  else if (media === "fmkorea")
    nativeUrl = urlWithParams("https://www.fmkorea.com/search.php", {
      act: "IS",
      is_keyword: query,
    });
  else if (media === "dcinside")
    nativeUrl = urlWithParams("https://search.dcinside.com/combine", {
      q: query,
    });
  else if (media === "ppomppu")
    nativeUrl = urlWithParams("https://www.ppomppu.co.kr/search_bbs.php", {
      keyword: query,
    });
  else if (media === "ruliweb")
    nativeUrl = urlWithParams("https://bbs.ruliweb.com/search", {
      q: query,
    });
  else if (media === "clien")
    nativeUrl = urlWithParams("https://www.clien.net/service/search", {
      q: query,
    });
  else if (media === "bobaedream")
    nativeUrl = urlWithParams("https://www.google.com/search", {
      q: `${query} site:bobaedream.co.kr`,
    });
  else if (media === "theqoo")
    nativeUrl = urlWithParams("https://theqoo.net/total", {
      search_target: "title_content",
      search_keyword: query,
    });
  else if (media === "instiz")
    nativeUrl = urlWithParams("https://www.instiz.net/popup_search.htm", {
      k: query,
    });
  else if (media === "natepann")
    nativeUrl = urlWithParams("https://pann.nate.com/search/talk", {
      q: query,
    });
  else if (media === "arcalive")
    nativeUrl = urlWithParams("https://arca.live/b/breaking", {
      target: "all",
      keyword: query,
    });
  else nativeUrl = periodUrl;
  return {
    nativeUrl,
    periodUrl,
    nativePeriod: ["naver", "naver_news", "google"].includes(media),
  };
}

export async function searchMedia(
  input,
  feedReader = readFeed,
  signal,
  options = {},
) {
  const request = searchSchema.parse(input);
  const startedAt = new Date().toISOString();
  const platforms = request.media.map((id) => ({
    id,
    name: mediaNames[id],
    ...searchLinks(id, request),
    mode: id === "google" ? "rss" : "index",
    results: [],
    error: null,
    warnings: [],
    saved: 0,
    duplicates: 0,
    skipped: 0,
  }));
  await Promise.all(
    platforms.map(async (platform) => {
      const platformSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(22000)])
        : AbortSignal.timeout(22000);
      try {
        let items;
        const negativeConditions = new Map(
          request.negativeOnly
            ? [request.query, ...request.aliases].flatMap((target) =>
                request.negativeWords.map((word) => [
                  `${target} ${word}`,
                  { name: target, aliases: [], negativeWords: [word] },
                ]),
              )
            : [],
        );
        const queries = request.negativeOnly
          ? [...negativeConditions.keys()]
          : [
              ...new Set([
                request.query,
                ...request.aliases,
                ...request.problemTerms.map(
                  (term) => `${request.query} ${term}`,
                ),
              ]),
            ];
        const outcomes = await settledQueries(
          queries,
          async (query) => {
            if (platform.id === "google") {
              const url = new URL(
                newsUrl(
                  negativeConditions.get(query) || { name: query, aliases: [] },
                ),
              );
              if (request.startDate)
                url.searchParams.set(
                  "q",
                  `${url.searchParams.get("q")} after:${request.startDate} before:${nextDate(request.endDate)}`,
                );
              return {
                items: (await feedReader(url.href, platformSignal)).items,
                mode: "rss",
                warnings: [],
              };
            } else {
              const collected = await (
                options.platformCollector || collectPlatform
              )(
                platform.id,
                {
                  ...request,
                  query,
                  ...searchLinks(platform.id, { ...request, query }),
                },
                { ...options, signal: platformSignal },
              );
              return collected;
            }
          },
          platformSignal,
        );
        const collections = outcomes
          .filter((outcome) => outcome.status === "fulfilled")
          .map((outcome) => outcome.value);
        if (!collections.length) throw outcomes[0].reason;
        items = collections.flatMap((collection) =>
          collection.items.slice(0, 300),
        );
        platform.mode = collections[0].mode;
        platform.warnings = [
          ...new Set(
            collections.flatMap((collection) => collection.warnings || []),
          ),
        ];
        outcomes.forEach((outcome, position) => {
          if (outcome.status === "rejected")
            platform.warnings.push(
              `일부 검색어 조회 실패: ${queries[position]}`,
            );
        });
        signal?.throwIfAborted();
        if (platformSignal.aborted)
          platform.warnings.push(
            "매체 조회 제한시간에 도달했습니다. 완료된 검색 결과만 포함합니다.",
          );
        const start = request.startDate
          ? Date.parse(`${request.startDate}T00:00:00+09:00`)
          : -Infinity;
        const end = request.endDate
          ? Date.parse(`${nextDate(request.endDate)}T00:00:00+09:00`)
          : Infinity;
        const seen = new Set();
        platform.results = items
          .flatMap((item) => {
            const link = safeLink(item.link);
            const title = plainText(item.title || "");
            const summary = plainText(
              item.contentSnippet || item.content || "",
            );
            const time = Date.parse(item.isoDate || item.pubDate || "");
            const verified = Number.isFinite(time) && time <= Date.now();
            if (
              !link ||
              (platform.id !== "google" &&
                platform.mode !== "api" &&
                !((platform.id === "naver" || platform.id === "naver_news") && platform.mode === "html") &&
                !belongsToMedium(link, platform.id)) ||
              seen.has(link) ||
              !matchesKeyword(`${title} ${summary}`, {
                name: request.query,
                aliases: request.aliases,
                excludes: request.excludes,
                enabled: true,
              }) ||
              (request.startDate &&
                (verified
                  ? time < start || time >= end
                  : request.strictDates || platform.id === "google")) ||
              (request.strictDates && !verified) ||
              (request.negativeOnly &&
                !request.negativeWords.some((word) =>
                  `${title} ${summary}`
                    .toLocaleLowerCase()
                    .includes(word.toLocaleLowerCase()),
                )) ||
              (request.candidateOnly &&
                !reviewCandidates(`${title} ${summary}`).length)
            )
              return [];
            seen.add(link);
            return [
              {
                title,
                summary,
                url: link,
                publishedAt: verified ? new Date(time).toISOString() : null,
                dateVerified: verified,
                reviewCandidates: reviewCandidates(`${title} ${summary}`),
                matchedNegativeWords: request.negativeWords.filter((word) =>
                  `${title} ${summary}`
                    .toLocaleLowerCase()
                    .includes(word.toLocaleLowerCase()),
                ),
                contentKey: contentFingerprint(title, summary, link),
              },
            ];
          })
          .sort((first, second) =>
            (second.publishedAt || "").localeCompare(first.publishedAt || ""),
          )
          .slice(0, request.limit);
        if (platform.results.some((item) => !item.dateVerified))
          platform.warnings.push(
            "게시일 미확인 결과가 포함돼 있습니다. 이 결과의 기간은 검증되지 않았습니다.",
          );
      } catch (error) {
        signal?.throwIfAborted();
        platform.error = `${platform.name} 수집 실패: ${error.message}`;
      }
    }),
  );
  signal?.throwIfAborted();
  const contentUrls = new Map();
  for (const platform of platforms)
    for (const item of platform.results) {
      if (!contentUrls.has(item.contentKey))
        contentUrls.set(item.contentKey, new Set());
      contentUrls.get(item.contentKey).add(item.url);
    }
  for (const platform of platforms)
    platform.results = platform.results
      .map((item) => ({
        ...item,
        contentCopies: contentUrls.get(item.contentKey).size,
      }))
      .filter((item) => !request.duplicatesOnly || item.contentCopies > 1);
  return {
    ...request,
    platforms,
    startedAt,
    searchedAt: new Date().toISOString(),
    saved: 0,
    duplicateGroups: [...contentUrls.values()].filter((urls) => urls.size > 1)
      .length,
  };
}

export function saveSearchResults(store, result) {
  store.update((state) => {
    for (const platform of result.platforms) {
      const existing = new Set(state.mentions.map((mention) => mention.url));
      platform.duplicates = platform.results.filter((item) =>
        existing.has(item.url),
      ).length;
      platform.saved = 0;
      for (const verified of [true, false])
        platform.saved += addItems(
          state,
          platform.results
            .filter((item) => Boolean(item.dateVerified) === verified)
            .map((item) => ({
              title: item.title,
              contentSnippet: item.summary,
              link: item.url,
              isoDate: item.publishedAt || undefined,
            })),
          `${platform.name} · ${platform.mode}`,
          new Date(),
          {
            searchQuery: result.query,
            medium: platform.id,
            dateBasis: verified ? "published" : "collected",
            negativeWords: result.negativeWords,
          },
        );
      platform.skipped =
        platform.results.length - platform.saved - platform.duplicates;
      result.saved += platform.saved;
    }
    state.runs.unshift({
      id: randomUUID(),
      startedAt: result.startedAt,
      finishedAt: result.searchedAt,
      added: result.saved,
      feeds: result.platforms.filter((platform) => !platform.error).length,
      errors: result.platforms
        .filter((platform) => platform.error)
        .map((platform) => platform.error),
      kind: "search",
      query: result.query,
    });
    state.runs = state.runs.slice(0, 100);
    state.lastCollectedAt = result.searchedAt;
  });
}
