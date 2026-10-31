import { useDeferredValue, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  CheckCheck,
  Copy,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilePlus2,
  FileText,
  Filter,
  Link2,
  Save,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppState,
  Filters,
  Mention,
  Mutation,
  Notify,
  Status,
} from "../types";
import { api, download, formatDate, getReportCenterUrl } from "../api";
import { Highlight } from "../Highlight";
import {
  Empty,
  IconButton,
  Modal,
  SentimentBadge,
  reportStatuses,
  sentiments,
  statuses,
} from "./Shared";

const defaultFilters: Filters = {
  query: "",
  sentiment: "negative",
  status: "all",
  keyword: "all",
  source: "all",
  days: "all",
  starred: false,
  dataType: "all",
  priority: "all",
  review: "all",
  duplicates: "all",
  reportStatus: "all",
};
const priorities = {
  low: "낮음",
  normal: "보통",
  high: "높음",
  urgent: "긴급",
};
export function Mentions({
  state,
  now,
  initial,
  mutate,
  onDetail,
  onReport,
  onReload,
  notify,
}: {
  state: AppState;
  now: number;
  initial: Partial<Filters>;
  mutate: Mutation;
  onDetail: (id: string) => void;
  onReport: (mention: Mention) => void;
  onReload: () => Promise<void>;
  notify: Notify;
}) {
  const [filters, setFilters] = useState<Filters>({
    ...defaultFilters,
    ...initial,
  });
  const deferredQuery = useDeferredValue(filters.query);
  const [sort, setSort] = useState("latest");
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [bulkStatus, setBulkStatus] = useState<Status>("resolved");
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewId, setViewId] = useState("");
  const [contentGroup, setContentGroup] = useState("");
  const contentUrls = new Map<string, Set<string>>();
  for (const mention of state.mentions) {
    const key = mention.contentKey || mention.url;
    if (!contentUrls.has(key)) contentUrls.set(key, new Set());
    contentUrls.get(key)!.add(mention.url);
  }
  const setFilter = (key: keyof Filters, value: string | boolean) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
    setSelected([]);
    setViewId("");
    setContentGroup("");
  };
  const apply = (next: Filters) => {
    setFilters({ ...defaultFilters, ...next });
    setPage(1);
    setSelected([]);
    setContentGroup("");
  };
  const filtered = state.mentions
    .filter((mention) => {
      const text =
        `${mention.title} ${mention.summary} ${mention.note} ${mention.assignee} ${mention.searchQuery || ""} ${mention.medium || ""} ${mention.tags.join(" ")} ${mention.review?.quote || ""} ${mention.review?.context || ""} ${mention.review?.reviewer || ""} ${(mention.reviewCandidates || []).map((candidate) => candidate.category).join(" ")}`.toLocaleLowerCase();
      const statusMatch =
        filters.status === "all" ||
        (filters.status === "pending"
          ? mention.sentiment === "negative" &&
            ["new", "reviewing"].includes(mention.status)
          : mention.status === filters.status);
      const priorityMatch =
        filters.priority === "all" ||
        (filters.priority === "overdue"
          ? mention.dueAt &&
            new Date(mention.dueAt).getTime() < now &&
            !["resolved", "ignored"].includes(mention.status)
          : (mention.priority || "normal") === filters.priority);
      return (
        text.includes(deferredQuery.toLocaleLowerCase()) &&
        (filters.sentiment === "all" ||
          mention.sentiment === filters.sentiment) &&
        statusMatch &&
        priorityMatch &&
        (!contentGroup || mention.contentKey === contentGroup) &&
        (filters.duplicates === "all" ||
          (filters.duplicates === "content"
            ? (contentUrls.get(mention.contentKey || mention.url)?.size || 1) >
              1
            : (mention.seenCount || 1) > 1)) &&
        (filters.review === "all" ||
          (filters.review === "candidates"
            ? !!mention.reviewCandidates?.length
            : (mention.review?.decision || "unreviewed") === filters.review)) &&
        (!filters.reportStatus ||
          filters.reportStatus === "all" ||
          (filters.reportStatus === "none"
            ? !mention.reportStatus
            : mention.reportStatus === filters.reportStatus)) &&
        (filters.keyword === "all" ||
          mention.keywordIds.includes(filters.keyword)) &&
        (filters.source === "all" || mention.source === filters.source) &&
        (filters.days === "all" ||
          (mention.dateBasis !== "collected" &&
            now - new Date(mention.publishedAt).getTime() <=
              Number(filters.days) * 86400000)) &&
        (!filters.starred || mention.starred) &&
        (filters.dataType === "all" ||
          (filters.dataType === "real" ? !mention.demo : mention.demo))
      );
    })
    .sort((first, second) =>
      sort === "oldest"
        ? first.publishedAt.localeCompare(second.publishedAt)
        : sort === "risk"
          ? first.score - second.score
          : second.publishedAt.localeCompare(first.publishedAt),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  const chosen = selected.filter((id) =>
    filtered.some((mention) => mention.id === id),
  );
  const ids = chosen.length ? chosen : filtered.map((mention) => mention.id);
  const exportFile = async (format: "csv" | "html") => {
    setBusy(true);
    try {
      await download(
        "/export",
        `평판모니터-${format === "csv" ? "언급.csv" : "보고서.html"}`,
        { ids, format },
      );
      notify(`${ids.length}건을 내보냈습니다.`);
    } catch (cause) {
      notify((cause as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const reanalyze = async () => {
    setBusy(true);
    await mutate(
      "/mentions/reanalyze",
      "POST",
      { ids: chosen },
      "재분석 완료. 수동 감정 분류는 유지됩니다.",
    );
    setBusy(false);
  };
  const linkTargets = (chosen.length ? chosen : visible.map((m) => m.id))
    .filter((id) => !state.mentions.find((m) => m.id === id)?.demo)
    .slice(0, 100);
  const checkLinks = async () => {
    setBusy(true);
    try {
      const result = await api<{ checked: number; broken: number }>(
        "/mentions/check-links",
        "POST",
        { ids: linkTargets },
      );
      await onReload();
      notify(
        `링크 ${result.checked}건 점검 · 오류 ${result.broken}건`,
        result.broken > 0,
      );
    } catch (cause) {
      notify((cause as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const negativeWordsFor = (mention: Mention) => [
    ...(mention.matchedNegativeWords || []),
    ...state.settings.negativeWords,
    ...state.keywords
      .filter((keyword) => mention.keywordIds.includes(keyword.id))
      .flatMap((keyword) => keyword.negativeWords || []),
  ];
  const selector = (
    key: keyof Filters,
    label: string,
    options: Record<string, string>,
  ) => (
    <select
      aria-label={label}
      value={String(filters[key])}
      onChange={(event) => setFilter(key, event.target.value)}
    >
      {Object.entries(options).map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <div className="inbox-toolbar">
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="언급 검색"
            maxLength={500}
            placeholder="제목, 본문, 메모, 담당자 검색"
            value={filters.query}
            onChange={(event) => setFilter("query", event.target.value)}
          />
          {filters.query && (
            <IconButton
              label="검색 지우기"
              onClick={() => setFilter("query", "")}
            >
              <X size={15} />
            </IconButton>
          )}
        </div>
        <button
          disabled={busy || !ids.length}
          onClick={() => void exportFile("csv")}
        >
          <ArrowDownToLine size={16} />
          CSV
        </button>
        <button
          disabled={busy || !ids.length}
          onClick={() => void exportFile("html")}
        >
          <FileText size={16} />
          보고서
        </button>
        <button
          disabled={busy || !linkTargets.length}
          onClick={() => void checkLinks()}
          title="선택 또는 현재 화면의 원문 링크를 최대 100건 점검합니다"
        >
          <Link2 size={16} />
          링크 점검
        </button>
      </div>
      <div className="filter-bar">
        <Filter size={16} />
        {selector("duplicates", "중복 필터", {
          all: "전체 콘텐츠",
          content: "제목·요약 중복",
          repeated_url: "URL 재조회",
        })}
        {selector("sentiment", "감정 필터", {
          all: "모든 감정",
          ...sentiments,
        })}
        {selector("status", "상태 필터", {
          all: "모든 상태",
          pending: "부정 대응 대기",
          ...statuses,
        })}
        {selector("keyword", "키워드 필터", {
          all: "모든 키워드",
          ...Object.fromEntries(
            state.keywords.map((item) => [item.id, item.name]),
          ),
        })}
        {selector("source", "출처 필터", {
          all: "모든 출처",
          ...Object.fromEntries(
            [...new Set(state.mentions.map((mention) => mention.source))].map(
              (source) => [source, source],
            ),
          ),
        })}
        {selector("days", "기간 필터", {
          all: "전체 기간",
          "1": "최근 24시간",
          "7": "최근 7일",
          "14": "최근 14일",
          "30": "최근 30일",
        })}
        {selector("dataType", "데이터 유형", {
          all: "모든 데이터",
          real: "실제 수집",
          demo: "체험 데이터",
        })}
        {selector("priority", "우선순위 필터", {
          all: "모든 우선순위",
          ...priorities,
          overdue: "기한 초과",
        })}
        {selector("review", "원문 검토 필터", {
          all: "모든 원문 검토",
          candidates: "검토 후보",
          unreviewed: "미검토",
          checking: "원문 검토 중",
          source_checked: "원문 확인",
          excluded: "대상 아님",
        })}
        {selector("reportStatus", "신고 결과 필터", {
          all: "모든 신고 상태",
          none: "미신고",
          ...reportStatuses,
        })}
        <IconButton
          label="관심 언급만"
          className={filters.starred ? "starred" : ""}
          onClick={() => setFilter("starred", !filters.starred)}
        >
          <Star size={16} fill={filters.starred ? "currentColor" : "none"} />
        </IconButton>
        <button
          className="text-button"
          onClick={() => {
            apply(defaultFilters);
            setViewId("");
          }}
        >
          초기화
        </button>
      </div>
      <div className="saved-views">
        <select
          aria-label="저장 필터"
          value={viewId}
          onChange={(event) => {
            const view = state.savedViews.find(
              (item) => item.id === event.target.value,
            );
            if (view) apply(view.filters);
            setViewId(event.target.value);
          }}
        >
          <option value="">저장 필터 선택</option>
          {state.savedViews.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
        </select>
        <button onClick={() => setSaveOpen(true)}>
          <Save size={14} />
          필터 저장
        </button>
        {viewId && (
          <IconButton
            label="저장 필터 삭제"
            onClick={async () => {
              if (
                await mutate(
                  `/views/${viewId}`,
                  "DELETE",
                  {},
                  "저장 필터를 삭제했습니다.",
                )
              )
                setViewId("");
            }}
          >
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>
      <div className="list-toolbar">
        {contentGroup && (
          <button onClick={() => setContentGroup("")}>
            <X size={14} />
            중복 그룹 해제
          </button>
        )}
        <span>
          검색 결과 <strong>{filtered.length.toLocaleString()}</strong>건
        </span>
        <select
          aria-label="정렬"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value);
            setPage(1);
          }}
        >
          <option value="latest">최신순</option>
          <option value="oldest">오래된순</option>
          <option value="risk">부정 점수순</option>
        </select>
      </div>
      {chosen.length > 0 && (
        <div className="bulk-bar">
          <strong>{chosen.length}건 선택</strong>
          <select
            aria-label="일괄 처리 상태"
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as Status)}
          >
            {Object.entries(statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (
                await mutate(
                  "/mentions/bulk",
                  "POST",
                  { ids: chosen, status: bulkStatus },
                  "선택한 언급의 상태를 변경했습니다.",
                )
              )
                setSelected([]);
              setBusy(false);
            }}
          >
            <CheckCheck size={16} />
            일괄 변경
          </button>
          <button disabled={busy} onClick={() => void reanalyze()}>
            <Activity size={15} />
            감정 재분석
          </button>
          <button className="text-button" onClick={() => setSelected([])}>
            선택 해제
          </button>
        </div>
      )}
      {filtered.length ? (
        <div className="mention-list">
          <div className="list-header">
            <input
              type="checkbox"
              aria-label="현재 페이지 전체 선택"
              checked={
                visible.length > 0 &&
                visible.every((mention) => chosen.includes(mention.id))
              }
              onChange={(event) =>
                setSelected(
                  event.target.checked
                    ? [
                        ...new Set([
                          ...chosen,
                          ...visible.map((mention) => mention.id),
                        ]),
                      ]
                    : chosen.filter(
                        (id) => !visible.some((mention) => mention.id === id),
                      ),
                )
              }
            />
            <span>언급</span>
            <span>상태</span>
          </div>
          {visible.map((mention) => (
            <article
              key={mention.id}
              className={`mention-row ${chosen.includes(mention.id) ? "checked" : ""}`}
            >
              <input
                type="checkbox"
                aria-label={`${mention.title} 선택`}
                checked={chosen.includes(mention.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...chosen, mention.id]
                      : chosen.filter((id) => id !== mention.id),
                  )
                }
              />
              <div className="mention-body">
                <div className="mention-meta">
                  <SentimentBadge mention={mention} />
                  <span>{mention.source}</span>
                  <time>
                    {mention.dateBasis === "collected"
                      ? `게시일 미확인 · 수집 ${formatDate(mention.collectedAt)}`
                      : formatDate(mention.publishedAt)}
                  </time>
                  {mention.demo && <span className="demo-tag">체험</span>}
                  {mention.priority &&
                    ["high", "urgent"].includes(mention.priority) && (
                      <span className="red-text">
                        {priorities[mention.priority]}
                      </span>
                    )}
                </div>
                <button
                  className="mention-title"
                  onClick={() => onDetail(mention.id)}
                >
                  <Highlight
                    text={mention.title}
                    words={negativeWordsFor(mention)}
                  />
                </button>
                <p>
                  <Highlight
                    text={mention.summary}
                    words={negativeWordsFor(mention)}
                  />
                </p>
                <div className="mention-tags">
                  {!mention.demo && (
                    <a
                      className={`link-status link-${mention.linkStatus || "unchecked"}`}
                      href={mention.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={
                        mention.linkStatus === "broken"
                          ? "게시글 링크 오류"
                          : "게시글 원문 링크"
                      }
                      title={
                        mention.linkStatus === "broken"
                          ? `링크 오류 · ${formatDate(mention.linkCheckedAt || null)} 점검`
                          : mention.linkStatus === "ok"
                            ? `정상 · ${formatDate(mention.linkCheckedAt || null)} 점검`
                            : mention.linkStatus === "unknown"
                              ? "사이트가 자동 점검을 차단해 확인 불가"
                              : "링크 미점검"
                      }
                    >
                      <Link2 size={14} />
                      {mention.linkStatus === "broken" && "링크 오류"}
                    </a>
                  )}
                  {(mention.matchedNegativeWords || []).map((word) => (
                    <span className="mini-tag negative-word" key={word}>
                      {word}
                    </span>
                  ))}
                  {mention.reportStatus && (
                    <span className={`badge report-${mention.reportStatus}`}>
                      {reportStatuses[mention.reportStatus]}
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-button report-action-button"
                    onClick={() => onReport(mention)}
                  >
                    <FilePlus2 size={13} />
                    신고원고 작성
                  </button>
                  <a
                    className="text-button report-center-link"
                    href={getReportCenterUrl(mention.medium, mention.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ShieldAlert size={13} />
                    온라인 신고하기
                    <ExternalLink size={12} />
                  </a>
                  {(contentUrls.get(mention.contentKey || mention.url)?.size ||
                    1) > 1 && (
                    <button
                      className="text-button duplicate-group-button"
                      onClick={() => {
                        setContentGroup(mention.contentKey || "");
                        setPage(1);
                        setSelected([]);
                      }}
                    >
                      <Copy size={13} />
                      제목·요약 동일{" "}
                      {contentUrls.get(mention.contentKey || mention.url)?.size}
                      개 URL
                    </button>
                  )}
                  {(mention.seenCount || 1) > 1 && (
                    <span>URL 조회 {mention.seenCount}회</span>
                  )}
                  {!!mention.reviewCandidates?.length && (
                    <span className="review-candidate-tag">
                      검토 후보 ·{" "}
                      {[
                        ...new Set(
                          mention.reviewCandidates.map(
                            (candidate) => candidate.category,
                          ),
                        ),
                      ].join(", ")}
                    </span>
                  )}
                  {mention.review?.decision === "source_checked" && (
                    <span>원문 확인 · {mention.review.reviewer}</span>
                  )}
                  {mention.searchQuery && (
                    <span>검색: {mention.searchQuery}</span>
                  )}
                  {state.keywords
                    .filter((item) => mention.keywordIds.includes(item.id))
                    .map((item) => (
                      <span key={item.id}>
                        <i style={{ background: item.color }} />
                        {item.name}
                      </span>
                    ))}
                  {mention.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                  {mention.assignee && <span>담당 {mention.assignee}</span>}
                  {mention.dueAt && (
                    <span>기한 {formatDate(mention.dueAt)}</span>
                  )}
                </div>
              </div>
              <div className="mention-side">
                <span className={`status-text ${mention.status}`}>
                  {statuses[mention.status]}
                </span>
                <IconButton
                  label={mention.starred ? "관심 해제" : "관심 등록"}
                  className={mention.starred ? "starred" : ""}
                  onClick={() =>
                    void mutate(`/mentions/${mention.id}`, "PATCH", {
                      starred: !mention.starred,
                    })
                  }
                >
                  <Star
                    size={18}
                    fill={mention.starred ? "currentColor" : "none"}
                  />
                </IconButton>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="일치하는 언급이 없습니다" />
      )}
      <div className="pagination">
        <span>
          {filtered.length
            ? `${(currentPage - 1) * 12 + 1}-${Math.min(currentPage * 12, filtered.length)} / ${filtered.length}건`
            : "0건"}
        </span>
        <div>
          <IconButton
            label="이전 페이지"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={18} />
          </IconButton>
          <span>
            {currentPage} / {pageCount}
          </span>
          <IconButton
            label="다음 페이지"
            disabled={currentPage >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      {saveOpen && (
        <Modal title="검색 필터 저장" close={() => setSaveOpen(false)}>
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              if (
                await mutate(
                  "/views",
                  "POST",
                  { name: viewName, filters },
                  "검색 필터를 저장했습니다.",
                )
              ) {
                setSaveOpen(false);
                setViewName("");
              }
              setBusy(false);
            }}
          >
            <label>
              필터 이름
              <input
                required
                maxLength={100}
                autoFocus
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              <Save size={16} />
              저장
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
