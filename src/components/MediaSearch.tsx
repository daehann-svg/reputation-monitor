import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  CalendarDays,
  ExternalLink,
  Globe,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import type { Keyword, MediaSearchResult, SearchMedium } from "../types";
import { api, formatDate } from "../api";

const media: {
  id: SearchMedium;
  name: string;
  group: "portal" | "sns" | "blog_cafe" | "community";
}[] = [
  { id: "naver", name: "네이버", group: "portal" },
  { id: "naver_news", name: "네이버뉴스", group: "portal" },
  { id: "google", name: "구글", group: "portal" },
  { id: "youtube", name: "유튜브", group: "sns" },
  { id: "tiktok", name: "틱톡", group: "sns" },
  { id: "instagram", name: "인스타그램", group: "sns" },
  { id: "x", name: "X", group: "sns" },
  { id: "threads", name: "쓰레드", group: "sns" },
  { id: "naver_blog", name: "네이버 블로그", group: "blog_cafe" },
  { id: "naver_cafe", name: "네이버 카페", group: "blog_cafe" },
  { id: "daum_cafe", name: "다음 카페", group: "blog_cafe" },
  { id: "fmkorea", name: "에펨코리아(FMKorea)", group: "community" },
  { id: "dcinside", name: "디시인사이드", group: "community" },
  { id: "ppomppu", name: "뽐뿌", group: "community" },
  { id: "ruliweb", name: "루리웹", group: "community" },
  { id: "clien", name: "클리앙", group: "community" },
  { id: "bobaedream", name: "보배드림", group: "community" },
  { id: "theqoo", name: "더쿠", group: "community" },
  { id: "instiz", name: "인스티즈", group: "community" },
  { id: "natepann", name: "네이트판", group: "community" },
  { id: "yeosingsidae", name: "여성시대", group: "community" },
  { id: "arcalive", name: "아카라이브", group: "community" },
];
const standardMediaIds: SearchMedium[] = [
  "naver",
  "google",
  "youtube",
  "tiktok",
  "instagram",
  "naver_blog",
  "naver_cafe",
  "daum_cafe",
];
const communityMediaIds: SearchMedium[] = media
  .filter((item) => item.group === "community")
  .map((item) => item.id);

function dateRange(days: number, now: number) {
  const endDate = new Date(now).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Seoul",
  });
  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

export function MediaSearch({
  keywords,
  now,
  onSaved,
  initialKeywordId,
  onRegister,
  blocked,
}: {
  keywords: Keyword[];
  now: number;
  onSaved: () => Promise<void>;
  initialKeywordId: string;
  onRegister: () => void;
  blocked: boolean;
}) {
  const [keywordId, setKeywordId] = useState(
    keywords.some(
      (keyword) => keyword.id === initialKeywordId && keyword.enabled,
    )
      ? initialKeywordId
      : keywords.find((keyword) => keyword.enabled)?.id || "",
  );
  const keyword = keywords.find(
    (item) => item.id === keywordId && item.enabled,
  );
  const query = keyword?.name || "";
  const [selectedMedia, setSelectedMedia] = useState<SearchMedium[]>([
    "naver_blog",
    "naver_cafe",
    "daum_cafe",
  ]);
  const [period, setPeriod] = useState("7");
  const [dates, setDates] = useState(() => dateRange(7, now));
  const [result, setResult] = useState<MediaSearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limit, setLimit] = useState(50);
  const [saveResults, setSaveResults] = useState(true);
  const [strictDates, setStrictDates] = useState(false);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [candidateOnly, setCandidateOnly] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const changePeriod = (value: string) => {
    setPeriod(value);
    if (value === "all") setDates({ startDate: "", endDate: "" });
    else if (value !== "custom") setDates(dateRange(Number(value), now));
    else if (!dates.startDate || !dates.endDate) setDates(dateRange(7, now));
  };
  const invalidRange =
    period !== "all" &&
    (!dates.startDate || !dates.endDate || dates.startDate > dates.endDate);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      busy ||
      blocked ||
      !keyword?.negativeWords?.length ||
      !query.trim() ||
      !selectedMedia.length ||
      invalidRange
    )
      return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    try {
      const collected = await api<MediaSearchResult>(
        "/search",
        "POST",
        {
          query: query.trim(),
          keywordId,
          media: selectedMedia,
          ...dates,
          limit,
          saveResults,
          strictDates,
          candidateOnly,
          duplicatesOnly,
        },
        active.signal,
      );
      setResult(collected);
      if (collected.saveResults)
        void onSaved().catch(() =>
          setError(
            "수집 결과는 저장됐지만 화면 갱신에 실패했습니다. 새로고침해 주세요.",
          ),
        );
    } catch (cause) {
      setError(
        active.signal.aborted
          ? "검색을 취소했습니다."
          : (cause as Error).message,
      );
    } finally {
      if (controller.current === active) {
        controller.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <section className="media-search">
      <form className="media-search-form" onSubmit={submit}>
        <div className="media-query-fields">
          <label>
            수집 대상
            <select
              value={keywordId}
              onChange={(event) => {
                setKeywordId(event.target.value);
                setResult(null);
                setError("");
              }}
              disabled={busy || blocked}
              required
            >
              <option value="">등록 대상 선택</option>
              {keywords
                .filter((keyword) => keyword.enabled)
                .map((keyword) => (
                  <option key={keyword.id} value={keyword.id}>
                    {keyword.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" onClick={onRegister} disabled={busy}>
            <Search size={16} />
            키워드 등록 관리
          </button>
        </div>
        <dl className="collection-condition">
          <div>
            <dt>대상 키워드</dt>
            <dd>{query || "미선택"}</dd>
          </div>
          <div>
            <dt>부정 키워드</dt>
            <dd>
              {keyword?.negativeWords?.length
                ? keyword.negativeWords.map((word) => (
                    <span className="mini-tag negative-word" key={word}>
                      {word}
                    </span>
                  ))
                : "미등록"}
            </dd>
          </div>
          <div>
            <dt>수집 별칭 (최대 3개)</dt>
            <dd>{keyword?.aliases.slice(0, 3).join(", ") || "없음"}</dd>
          </div>
          <div>
            <dt>제외어</dt>
            <dd>{keyword?.excludes.join(", ") || "없음"}</dd>
          </div>
        </dl>
        <fieldset className="media-choices" disabled={busy || blocked}>
          <legend>검색 매체 (포털·뉴스·SNS·카페·블로그)</legend>
          <label className="check-label">
            <input
              type="checkbox"
              checked={standardMediaIds.every((id) =>
                selectedMedia.includes(id),
              )}
              onChange={(event) =>
                setSelectedMedia(
                  event.target.checked ? [...standardMediaIds] : [],
                )
              }
            />
            전체 매체
          </label>
          {media
            .filter((item) => item.group !== "community")
            .map((item) => (
              <label
                className={`check-label media-choice media-${item.id}`}
                key={item.id}
              >
                <input
                  type="checkbox"
                  checked={selectedMedia.includes(item.id)}
                  onChange={(event) =>
                    setSelectedMedia((current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.name}
              </label>
            ))}
        </fieldset>
        <fieldset className="media-choices" disabled={busy || blocked}>
          <legend>커뮤니티 분류</legend>
          <label className="check-label">
            <input
              type="checkbox"
              checked={communityMediaIds.every((id) =>
                selectedMedia.includes(id),
              )}
              onChange={(event) =>
                setSelectedMedia((current) =>
                  event.target.checked
                    ? [...new Set([...current, ...communityMediaIds])]
                    : current.filter((id) => !communityMediaIds.includes(id)),
                )
              }
            />
            커뮤니티 전체
          </label>
          {media
            .filter((item) => item.group === "community")
            .map((item) => (
              <label
                className={`check-label media-choice media-${item.id}`}
                key={item.id}
              >
                <input
                  type="checkbox"
                  checked={selectedMedia.includes(item.id)}
                  onChange={(event) =>
                    setSelectedMedia((current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                {item.name}
              </label>
            ))}
        </fieldset>
        <fieldset className="media-choices" disabled={busy || blocked}>
          <legend>수집 옵션</legend>
          <label className="check-label">
            <input
              type="checkbox"
              checked={duplicatesOnly}
              onChange={(event) => setDuplicatesOnly(event.target.checked)}
            />
            중복 콘텐츠만 수집
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={candidateOnly}
              onChange={(event) => setCandidateOnly(event.target.checked)}
            />
            검토 후보만 저장·표시
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={saveResults}
              onChange={(event) => setSaveResults(event.target.checked)}
            />
            수집 결과에 자동 저장
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={strictDates}
              onChange={(event) => setStrictDates(event.target.checked)}
            />
            게시일 확인 결과만
          </label>
          <label className="check-label">
            매체당 최대{" "}
            <select
              aria-label="매체당 수집 한도"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            >
              <option value="10">10건</option>
              <option value="20">20건</option>
              <option value="50">50건</option>
              <option value="100">100건</option>
            </select>
          </label>
        </fieldset>
        <div className="media-date-fields">
          <label>
            검색 기간
            <select
              value={period}
              onChange={(event) => changePeriod(event.target.value)}
              disabled={busy}
            >
              <option value="all">전체 기간</option>
              <option value="7">최근 7일</option>
              <option value="30">최근 30일</option>
              <option value="90">최근 90일</option>
              <option value="custom">직접 지정</option>
            </select>
          </label>
          <label>
            검색 시작일
            <input
              type="date"
              value={dates.startDate}
              max={dates.endDate || undefined}
              onChange={(event) => {
                setPeriod("custom");
                setDates({ ...dates, startDate: event.target.value });
              }}
              disabled={busy || period === "all"}
              required={period !== "all"}
            />
          </label>
          <label>
            검색 종료일
            <input
              type="date"
              value={dates.endDate}
              min={dates.startDate || undefined}
              onChange={(event) => {
                setPeriod("custom");
                setDates({ ...dates, endDate: event.target.value });
              }}
              disabled={busy || period === "all"}
              required={period !== "all"}
            />
          </label>
          <div className="media-submit">
            <button
              className="primary"
              disabled={
                busy ||
                blocked ||
                !keyword?.negativeWords?.length ||
                !selectedMedia.length ||
                !query.trim() ||
                invalidRange
              }
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Search size={16} />
              )}
              {busy ? "수집 중" : "검색 후 수집"}
            </button>
            {busy && (
              <button type="button" onClick={() => controller.current?.abort()}>
                <X size={16} />
                취소
              </button>
            )}
          </div>
        </div>
        {invalidRange && (
          <p className="error-text" role="alert">
            올바른 시작일과 종료일을 지정하세요.
          </p>
        )}
      </form>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {result ? (
        <div className="media-search-results" aria-live="polite">
          <div className="media-result-heading">
            <h2>“{result.query}” 수집</h2>
            <span className="subtle">
              부정어 {result.negativeWords.join(", ")} · 제목·요약 중복{" "}
              {result.duplicateGroups}그룹
            </span>
            <span className="subtle">
              <CalendarDays size={14} />
              {result.startDate
                ? `${result.startDate} ~ ${result.endDate}`
                : "전체 기간"}{" "}
              · 한국시간
            </span>
            <span className="subtle">조회 {formatDate(result.searchedAt)}</span>
            <strong className="green-text">
              {result.saveResults
                ? `수집 결과에 신규 ${result.saved || 0}건 저장`
                : "조회만 · 저장 안 함"}
            </strong>
          </div>
          {result.platforms.map((platform) => (
            <section
              className="media-result-section"
              key={platform.id}
              aria-label={`${platform.name} 검색 결과`}
            >
              <div className="media-result-toolbar">
                <div className={`media-result-name media-${platform.id}`}>
                  <Globe size={18} />
                  <h3>{platform.name}</h3>
                  <span className="mini-tag">
                    {
                      {
                        rss: "뉴스 RSS 수집",
                        api: "공식 API 수집",
                        html: "공개 HTML 수집",
                        index: "공개 색인 수집",
                      }[platform.mode]
                    }
                  </span>
                </div>
                <div className="media-search-links">
                  <a
                    href={platform.nativeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {platform.name}
                    {platform.id === "naver" && result.startDate
                      ? " 뉴스"
                      : ""}{" "}
                    검색
                    <ExternalLink size={14} />
                  </a>
                  {!platform.nativePeriod && (
                    <a
                      href={platform.periodUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {result.startDate
                        ? "기간 적용 색인 검색"
                        : "구글 색인 검색"}
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
              {
                <>
                  {platform.error ? (
                    <p className="error-text" role="alert">
                      {platform.error}
                    </p>
                  ) : (
                    <p className="subtle">
                      수집 {platform.results.length}건 · 신규{" "}
                      {platform.saved || 0}건 · 기존 URL{" "}
                      {platform.duplicates || 0}건 · 보관기간 제외{" "}
                      {platform.skipped || 0}건
                    </p>
                  )}
                  {!platform.error && !platform.results.length && (
                    <p className="media-result-empty">
                      현재 수집 범위에서 해당하는 결과를 가져오지 못했습니다.
                    </p>
                  )}
                  {platform.results.map((item) => (
                    <article className="media-news-item" key={item.url}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.title}
                        <ExternalLink size={14} />
                      </a>
                      {item.summary && <p>{item.summary}</p>}
                      <div className="collection-result-tags">
                        {item.matchedNegativeWords.map((word) => (
                          <span className="mini-tag negative-word" key={word}>
                            {word}
                          </span>
                        ))}
                        {item.contentCopies > 1 && (
                          <span className="mini-tag duplicate-content-tag">
                            제목·요약 동일 {item.contentCopies}개 URL
                          </span>
                        )}
                      </div>
                      {!!item.reviewCandidates?.length && (
                        <div className="detail-keywords">
                          {[
                            ...new Set(
                              item.reviewCandidates.map(
                                (candidate) => candidate.category,
                              ),
                            ),
                          ].map((category) => (
                            <span className="mini-tag" key={category}>
                              검토 후보 · {category}
                            </span>
                          ))}
                        </div>
                      )}
                      <time dateTime={item.publishedAt || undefined}>
                        {item.publishedAt
                          ? formatDate(item.publishedAt)
                          : "게시일 미확인 · 기간 검증 안 됨"}
                      </time>
                    </article>
                  ))}
                </>
              }
              {(platform.warnings || []).map((warning, index) => (
                <p className="subtle" key={index}>
                  {warning}
                </p>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="media-search-empty">
          <Search size={28} />
          <span>네이버 블로그 · 네이버 카페 · 다음 카페 · 뉴스 · SNS</span>
        </div>
      )}
    </section>
  );
}
