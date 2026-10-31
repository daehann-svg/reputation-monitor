import { load } from "cheerio";
import { safeLink } from "./core.mjs";
import { readPublic } from "./collector.mjs";

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
  yeosingsidae: "cafe.daum.net",
  arcalive: "arca.live",
};
export function belongsToMedium(value, medium) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const domain = domains[medium];
    if (medium === "x") {
      if (!(
        host === "x.com" ||
        host.endsWith(".x.com") ||
        host === "twitter.com" ||
        host.endsWith(".twitter.com")
      ))
        return false;
      return url.pathname !== "/" && !url.pathname.startsWith("/search");
    }
    if (medium === "naver_news") {
      if (!(host === "naver.com" || host.endsWith(".naver.com"))) return false;
      return (
        host === "news.naver.com" ||
        host === "n.news.naver.com" ||
        host === "m.news.naver.com" ||
        url.pathname.includes("/article/")
      );
    }
    if (!domain || !(host === domain || host.endsWith(`.${domain}`)))
      return false;
    if (medium === "naver_blog")
      return (
        /^\/[^/]+\/\d+\/?$/.test(url.pathname) ||
        (/^\/PostView\.(naver|nhn)$/i.test(url.pathname) &&
          /^\d+$/.test(url.searchParams.get("logNo") || ""))
      );
    if (medium === "naver_cafe")
      return (
        /^\/[^/]+\/\d+\/?$/.test(url.pathname) ||
        /^\/ca-fe\/cafes\/\d+\/articles\/\d+/.test(url.pathname) ||
        (/^\/ArticleRead\.(naver|nhn)$/i.test(url.pathname) &&
          /^\d+$/.test(url.searchParams.get("articleid") || ""))
      );
    if (medium === "daum_cafe")
      return /^\/[^/]+\/[^/]+\/\d+\/?$/.test(url.pathname);
    if (medium === "yeosingsidae")
      return (
        url.pathname.toLowerCase().includes("subdued20club") ||
        /^\/[^/]+\/[^/]+\/\d+\/?$/.test(url.pathname)
      );
    if (medium === "youtube")
      return (
        (url.pathname === "/watch" &&
          /^[\w-]{11}$/.test(url.searchParams.get("v") || "")) ||
        /^\/shorts\/[\w-]{11}(?:\/|$)/.test(url.pathname)
      );
    if (medium === "tiktok") return /^\/@[^/]+\/video\/\d+/.test(url.pathname);
    if (medium === "instagram")
      return /^\/(p|reel|tv)\/[^/]+/.test(url.pathname);
    if (medium === "threads")
      return (
        /^\/@[^/]+\/post\/[^/]+/.test(url.pathname) ||
        (url.pathname !== "/" && !url.pathname.startsWith("/search"))
      );
    return (
      host !== "search.naver.com" &&
      host !== "search.daum.net" &&
      host !== "search.dcinside.com" &&
      url.pathname !== "/"
    );
  } catch {
    return false;
  }
}

function text(value) {
  const document = load(String(value || ""));
  document("script,style").remove();
  return document.root().text().replace(/\s+/g, " ").trim().slice(0, 8000);
}

function blogDate(value) {
  if (!/^\d{8}$/.test(value || "")) return undefined;
  const day = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === day
    ? `${day}T00:00:00+09:00`
    : undefined;
}

function link(value, base) {
  try {
    const url = new URL(value, base);
    if (url.hostname === "www.google.com" && url.pathname === "/url")
      return safeLink(url.searchParams.get("q") || url.searchParams.get("url"));
    if (url.hostname.endsWith("bing.com") && url.pathname === "/ck/a") {
      const encoded = url.searchParams.get("u") || "";
      return encoded.startsWith("a1")
        ? safeLink(Buffer.from(encoded.slice(2), "base64url").toString("utf8"))
        : "";
    }
    return safeLink(url.href);
  } catch {
    return "";
  }
}

export function parseSearchHtml(html, medium, base) {
  const document = load(html);
  const nativeNaver =
    (medium === "naver" || medium === "naver_news") &&
    new URL(base).hostname === "search.naver.com";
  const pageTitle = document("title").text();
  if (
    /captcha|access denied|unusual traffic|접근.*제한|자동.*입력/i.test(
      pageTitle,
    ) ||
    document('form[action*="/sorry/"],#captcha').length
  )
    throw new Error("사이트가 자동 조회를 차단했습니다. 우회하지 않습니다.");
  const items = [];
  const append = (anchor, container) => {
    const url = link(document(anchor).attr("href"), base);
    if (!url || (!nativeNaver && !belongsToMedium(url, medium))) return;
    const title = text(document(anchor).text())
      .replace(/새 창 열림$/, "")
      .trim();
    if (title.length < 3) return;
    const node = document(container);
    const date = node.find("time[datetime]").first().attr("datetime");
    items.push({
      title,
      link: url,
      contentSnippet: text(
        node
          .find(
            ".b_caption p,.b_snippet,.news_dsc,.api_txt_lines,.sds-comps-text-type-body1",
          )
          .first()
          .text(),
      ),
      isoDate: date || undefined,
    });
  };
  document("li.b_algo").each((_index, node) =>
    append(document(node).find("h2 a").first(), node),
  );
  document("h3").each((_index, node) => {
    const anchor = document(node).closest("a");
    if (anchor.length) append(anchor, anchor.parent().parent());
  });
  if (
    medium === "naver" ||
    medium === "naver_news" ||
    medium === "naver_blog" ||
    medium === "naver_cafe"
  )
    document('a[href*="naver.com/"]').each((_index, node) =>
      append(
        node,
        document(node).closest("li,article,.news_area,.total_wrap").first(),
      ),
    );
  if (nativeNaver)
    document('a[target="_blank"],a.news_tit').each((_index, node) =>
      append(node, document(node).parent()),
    );
  return items;
}

export function parseYouTubeHtml(html) {
  const document = load(html);
  let data;
  document("script").each((_index, script) => {
    if (data) return;
    const source = document(script).html() || "";
    const marker = "var ytInitialData = ";
    const start = source.indexOf(marker);
    if (start < 0) return;
    try {
      data = JSON.parse(
        source
          .slice(start + marker.length)
          .trim()
          .replace(/;$/, ""),
      );
    } catch {}
  });
  if (!data) throw new Error("유튜브 공개 검색 데이터를 읽을 수 없습니다.");
  const stack = [data];
  const items = [];
  const runs = (value) =>
    (value?.runs || []).map((part) => part.text || "").join("") ||
    value?.simpleText ||
    "";
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.videoRenderer && /^[\w-]{11}$/.test(node.videoRenderer.videoId)) {
      const video = node.videoRenderer;
      items.push({
        title: runs(video.title),
        link: `https://www.youtube.com/watch?v=${video.videoId}`,
        contentSnippet: runs(video.detailedMetadataSnippets?.[0]?.snippetText),
        creator: runs(video.ownerText),
      });
    }
    for (const value of Object.values(node))
      if (value && typeof value === "object") stack.push(value);
  }
  return items;
}

export function connectionStatus(environment = process.env) {
  const naverConfigured = Boolean(
    environment.NAVER_CLIENT_ID && environment.NAVER_CLIENT_SECRET,
  );
  const kakaoConfigured = Boolean(environment.KAKAO_REST_API_KEY);
  const communityScope = "공개 검색 색인 수집";
  return {
    naver_blog: {
      configured: naverConfigured,
      scope: "블로그 공식 API / 미설정 시 공개 HTML·색인",
    },
    naver_cafe: {
      configured: naverConfigured,
      scope: "공개 카페글 공식 API · 게시일 미제공 / 미설정 시 공개 HTML·색인",
    },
    daum_cafe: {
      configured: kakaoConfigured,
      scope: "다음 카페 공식 API / 미설정 시 공개 색인",
    },
    naver: {
      configured: naverConfigured,
      scope: "뉴스 공식 API / 미설정 시 공개 HTML·색인",
    },
    naver_news: {
      configured: naverConfigured,
      scope: "네이버뉴스 공식 API / 미설정 시 공개 HTML·색인",
    },
    google: { configured: true, scope: "공개 뉴스 RSS" },
    youtube: {
      configured: Boolean(environment.YOUTUBE_API_KEY),
      scope: "동영상 공식 API / 미설정 시 공개 HTML·색인",
    },
    tiktok: {
      configured: false,
      scope: "공개 색인만 수집 · 전체 키워드 API는 연구 승인 필요",
    },
    instagram: {
      configured: false,
      scope: "공개 색인만 수집 · 공식 공개 콘텐츠 API는 계정·앱 승인 필요",
    },
    x: {
      configured: false,
      scope: "공개 색인 수집 (x.com / twitter.com)",
    },
    threads: {
      configured: false,
      scope: "공개 색인 수집 (threads.net)",
    },
    fmkorea: { configured: false, scope: communityScope },
    dcinside: { configured: false, scope: communityScope },
    ppomppu: { configured: false, scope: communityScope },
    ruliweb: { configured: false, scope: communityScope },
    clien: { configured: false, scope: communityScope },
    bobaedream: { configured: false, scope: communityScope },
    theqoo: { configured: false, scope: communityScope },
    instiz: { configured: false, scope: communityScope },
    natepann: { configured: false, scope: communityScope },
    yeosingsidae: {
      configured: kakaoConfigured,
      scope: "다음 카페 API / 공개 색인 수집",
    },
    arcalive: { configured: false, scope: communityScope },
  };
}

export async function collectPlatform(medium, input, options = {}) {
  const read = options.webReader || readPublic;
  const environment = options.environment || process.env;
  const signal = options.signal;
  const json = async (url, headers) =>
    JSON.parse(
      (await read(url, signal, { accept: "application/json", headers })).text,
    );
  if (
    ["naver", "naver_news", "naver_blog", "naver_cafe"].includes(medium) &&
    environment.NAVER_CLIENT_ID &&
    environment.NAVER_CLIENT_SECRET
  ) {
    const items = [];
    const headers = {
      "X-Naver-Client-Id": environment.NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": environment.NAVER_CLIENT_SECRET,
    };
    for (let start = 1; start <= Math.min(300, input.limit * 3); start += 100) {
      signal?.throwIfAborted();
      const endpoint = {
        naver: "news",
        naver_news: "news",
        naver_blog: "blog",
        naver_cafe: "cafearticle",
      }[medium];
      const url = new URL(
        `https://openapi.naver.com/v1/search/${endpoint}.json`,
      );
      url.search = new URLSearchParams({
        query: input.query,
        display: "100",
        start: String(start),
        sort: "date",
      }).toString();
      const response = await json(url.href, headers);
      if (response.errorCode)
        throw new Error("네이버 공식 API가 조회를 거절했습니다.");
      items.push(
        ...(response.items || [])
          .filter(
            (item) =>
              medium === "naver" ||
              medium === "naver_news" ||
              belongsToMedium(item.link, medium),
          )
          .map((item) => ({
            title: text(item.title),
            contentSnippet: text(item.description),
            link: item.link || item.originallink,
            pubDate:
              medium === "naver" || medium === "naver_news"
                ? item.pubDate
                : undefined,
            isoDate:
              medium === "naver_blog" ? blogDate(item.postdate) : undefined,
          })),
      );
      if ((response.items || []).length < 100) break;
    }
    return {
      mode: "api",
      items,
      warnings: [
        "네이버 검색 API 제공 범위 내 최신 최대 300건을 검사합니다.",
        ...(medium === "naver_cafe"
          ? [
              "네이버 카페 API는 게시일을 제공하지 않습니다. 게시일 확인 결과만 포함하면 제외됩니다.",
            ]
          : []),
      ],
    };
  }
  if (
    (medium === "daum_cafe" || medium === "yeosingsidae") &&
    environment.KAKAO_REST_API_KEY
  ) {
    const items = [];
    for (
      let page = 1;
      page <= Math.ceil(Math.min(300, input.limit * 3) / 50);
      page++
    ) {
      signal?.throwIfAborted();
      const url = new URL("https://dapi.kakao.com/v2/search/cafe");
      url.search = new URLSearchParams({
        query:
          medium === "yeosingsidae" ? `여성시대 ${input.query}` : input.query,
        sort: "recency",
        page: String(page),
        size: "50",
      }).toString();
      const response = await json(url.href, {
        Authorization: `KakaoAK ${environment.KAKAO_REST_API_KEY}`,
      });
      if (response.errorType)
        throw new Error("다음 카페 공식 API가 조회를 거절했습니다.");
      items.push(
        ...(response.documents || [])
          .filter((item) => belongsToMedium(item.url, medium))
          .map((item) => ({
            title: text(item.title),
            contentSnippet: text(item.contents),
            link: item.url,
            isoDate: item.datetime,
          })),
      );
      if (response.meta?.is_end || !(response.documents || []).length) break;
    }
    return {
      mode: "api",
      items,
      warnings: [
        "다음 검색 API 제공 범위 내 최신 최대 300건을 검사합니다. 공개 게시글의 요약만 제공됩니다.",
      ],
    };
  }
  if (medium === "youtube" && environment.YOUTUBE_API_KEY) {
    const items = [];
    let pageToken = "";
    for (let page = 0; page < Math.ceil(input.limit / 50); page++) {
      signal?.throwIfAborted();
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.search = new URLSearchParams({
        key: environment.YOUTUBE_API_KEY,
        part: "snippet",
        type: "video",
        q: input.query,
        maxResults: "50",
        order: "date",
        ...(pageToken ? { pageToken } : {}),
        ...(input.startDate
          ? {
              publishedAfter: `${input.startDate}T00:00:00+09:00`,
              publishedBefore: `${input.endDate}T23:59:59.999+09:00`,
            }
          : {}),
      }).toString();
      const response = await json(url.href);
      if (response.error)
        throw new Error("유튜브 공식 API가 조회를 거절했습니다.");
      items.push(
        ...(response.items || [])
          .filter((item) => /^[\w-]{11}$/.test(item.id?.videoId || ""))
          .map((item) => ({
            title: text(item.snippet?.title),
            contentSnippet: text(item.snippet?.description),
            link: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            isoDate: item.snippet?.publishedAt,
            creator: item.snippet?.channelTitle,
          })),
      );
      pageToken = response.nextPageToken;
      if (!pageToken) break;
    }
    return { mode: "api", items, warnings: [] };
  }
  const warnings = [];
  if (
    ["naver", "naver_news", "naver_blog", "naver_cafe", "youtube"].includes(
      medium,
    )
  ) {
    try {
      const response = await read(input.nativeUrl, signal, {
        maxBytes: 5 * 1024 * 1024,
      });
      const items =
        medium === "youtube"
          ? parseYouTubeHtml(response.text)
          : parseSearchHtml(
              response.text,
              medium,
              response.url || input.nativeUrl,
            );
      if (items.length)
        return {
          mode: "html",
          items,
          warnings: [
            "공개 검색 페이지의 결과·요약을 수집합니다. 원문 전체나 게시일을 보장하지 않습니다.",
          ],
        };
      warnings.push(
        "공개 검색 HTML에서 결과를 읽지 못해 공개 색인을 조회했습니다.",
      );
    } catch (error) {
      signal?.throwIfAborted();
      warnings.push(`공개 검색 조회 불가: ${error.message}`);
    }
  }
  const exclusiveEnd = input.endDate
    ? new Date(`${input.endDate}T00:00:00Z`)
    : null;
  exclusiveEnd?.setUTCDate(exclusiveEnd.getUTCDate() + 1);
  const siteConstraint =
    medium === "x"
      ? "(site:x.com OR site:twitter.com)"
      : medium === "yeosingsidae"
        ? "site:cafe.daum.net/subdued20club"
        : `site:${domains[medium]}`;
  const query = [
    input.query,
    siteConstraint,
    input.startDate
      ? `after:${input.startDate} before:${exclusiveEnd.toISOString().slice(0, 10)}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const url = new URL("https://www.bing.com/search");
  url.search = new URLSearchParams({
    q: query,
    count: String(input.limit),
  }).toString();
  const response = await read(url.href, signal);
  const items = parseSearchHtml(
    response.text,
    medium,
    response.url || url.href,
  );
  warnings.push(
    "공개 검색 색인의 제목·URL·요약만 수집합니다. 미색인·비공개 게시물과 정확한 게시일은 보장하지 않습니다.",
  );
  return { mode: "index", items, warnings };
}
