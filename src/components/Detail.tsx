import { useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  Check,
  Clock,
  ExternalLink,
  FilePlus2,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";
import type {
  Keyword,
  Mention,
  Mutation,
  ReportStatus,
  SourceReview,
  Status,
} from "../types";
import { formatDate, getReportCenterUrl, splitWords } from "../api";
import { Highlight } from "../Highlight";
import {
  Modal,
  SentimentBadge,
  reportStatuses,
  sentiments,
  statuses,
} from "./Shared";

export function Detail({
  mention,
  keywords,
  close,
  mutate,
  related,
  onReport,
  negativeWords = [],
}: {
  mention: Mention;
  keywords: Keyword[];
  close: () => void;
  mutate: Mutation;
  related: Mention[];
  onReport?: (mention: Mention) => void;
  negativeWords?: string[];
}) {
  const highlightWords = [
    ...negativeWords,
    ...(mention.matchedNegativeWords || []),
    ...keywords
      .filter((keyword) => mention.keywordIds.includes(keyword.id))
      .flatMap((keyword) => keyword.negativeWords || []),
  ];
  const [status, setStatus] = useState(mention.status);
  const [sentiment, setSentiment] = useState(mention.sentiment);
  const [note, setNote] = useState(mention.note);
  const [assignee, setAssignee] = useState(mention.assignee);
  const [tags, setTags] = useState(mention.tags.join(", "));
  const [reportStatus, setReportStatus] = useState<string>(
    mention.reportStatus || "",
  );
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<SourceReview>(
    mention.review || {
      decision: "unreviewed",
      quote: "",
      context: "",
      reviewer: "",
      checkedAt: null,
    },
  );
  const [priority, setPriority] = useState(mention.priority || "normal");
  const [dueAt, setDueAt] = useState(
    mention.dueAt
      ? new Date(
          new Date(mention.dueAt).getTime() -
            new Date(mention.dueAt).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "",
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    if (
      await mutate(
        `/mentions/${mention.id}`,
        "PATCH",
        {
          status,
          ...(sentiment !== mention.sentiment ? { sentiment } : {}),
          note,
          assignee,
          tags: splitWords(tags),
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          reportStatus: (reportStatus as ReportStatus) || null,
          review: {
            ...review,
            checkedAt:
              review.decision === "source_checked" && !review.checkedAt
                ? new Date().toISOString()
                : review.checkedAt,
          },
        },
        "언급을 저장했습니다.",
      )
    )
      close();
    setSaving(false);
  };
  return (
    <Modal title="언급 상세" close={close} wide>
      <div className="detail-content">
        <div className="mention-meta">
          <SentimentBadge mention={mention} />
          <span>{mention.source}</span>
          {mention.demo && <span className="demo-tag">체험 데이터</span>}
        </div>
        <h3 className="detail-title">
          <Highlight text={mention.title} words={highlightWords} />
        </h3>
        <div className="detail-date">
          URL 조회 {mention.seenCount || 1}회 · 최근 확인{" "}
          {formatDate(mention.lastSeenAt || mention.collectedAt)}
          <br />
          {mention.dateBasis === "collected"
            ? "게시일 미확인"
            : `게시 ${formatDate(mention.publishedAt)}`}{" "}
          · 수집 {formatDate(mention.collectedAt)}
        </div>
        <p className="detail-summary">
          {mention.summary ? (
            <Highlight text={mention.summary} words={highlightWords} />
          ) : (
            "본문 요약이 제공되지 않았습니다."
          )}
        </p>
        {mention.demo ? (
          <span className="subtle">체험 데이터에는 실제 원문이 없습니다.</span>
        ) : (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <a
              className={`external-link ${mention.linkStatus === "broken" ? "link-broken" : ""}`}
              href={mention.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {mention.linkStatus === "broken" ? "원문 링크 오류" : "원문 열기"}
              <ExternalLink size={15} />
            </a>
            <a
              className="external-link report-center-link"
              href={getReportCenterUrl(mention.medium, mention.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ShieldAlert size={15} />
              온라인 신고하기
              <ExternalLink size={14} />
            </a>
            {onReport && (
              <button
                type="button"
                className="text-button report-action-button"
                onClick={() => {
                  close();
                  onReport(mention);
                }}
              >
                <FilePlus2 size={15} />
                신고원고 작성
              </button>
            )}
          </div>
        )}
        <div className="detail-keywords">
          {(mention.matchedNegativeWords || []).map((word) => (
            <span className="mini-tag negative-word" key={word}>
              {word}
            </span>
          ))}
          {keywords
            .filter((keyword) => mention.keywordIds.includes(keyword.id))
            .map((keyword) => (
              <span key={keyword.id} className="mini-tag">
                <i
                  className="color-dot"
                  style={{ background: keyword.color }}
                />
                {keyword.name}
              </span>
            ))}
        </div>
        <div className="analysis-note">
          <Activity size={16} />
          <span>
            사전 분석 {mention.score > 0 ? "+" : ""}
            {mention.score}점 · 감지 표현:{" "}
            {mention.evidence.join(", ") || "없음"}
          </span>
        </div>
        <form className="form" onSubmit={save}>
          {related.length > 1 && (
            <section className="review-evidence" aria-label="동일 콘텐츠 원문">
              <h4>제목·요약 동일 · {related.length}개 URL</h4>
              {related.map((item, index) => (
                <p key={item.id}>
                  <a
                    className="external-link"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.source} 원문 {index + 1}
                    <ExternalLink size={14} />
                  </a>
                </p>
              ))}
            </section>
          )}
          {!!mention.reviewCandidates?.length && (
            <section className="review-evidence">
              <h4>검토 후보 · 제목·요약에서 탐지</h4>
              {mention.reviewCandidates.map((candidate) => (
                <p key={`${candidate.category}-${candidate.term}`}>
                  <strong>
                    {candidate.category}: {candidate.term}
                  </strong>
                  <br />
                  {candidate.excerpt}
                </p>
              ))}
              <span className="subtle">표현 일치 결과 · 위법 판정 아님</span>
            </section>
          )}
          <div className="form-columns">
            <label>
              원문 검토
              <select
                value={review.decision}
                onChange={(event) =>
                  setReview({
                    ...review,
                    decision: event.target.value as SourceReview["decision"],
                  })
                }
              >
                <option value="unreviewed">미검토</option>
                <option value="checking">원문 검토 중</option>
                <option value="source_checked">원문 확인</option>
                <option value="excluded">대상 아님</option>
              </select>
            </label>
            <label>
              원문 확인자
              <input
                value={review.reviewer}
                maxLength={100}
                required={review.decision === "source_checked"}
                onChange={(event) =>
                  setReview({ ...review, reviewer: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            원문 인용문
            <textarea
              rows={3}
              value={review.quote}
              maxLength={5000}
              required={review.decision === "source_checked"}
              onChange={(event) =>
                setReview({ ...review, quote: event.target.value })
              }
            />
          </label>
          <label>
            원문 맥락·검토 사유
            <textarea
              rows={3}
              value={review.context}
              maxLength={5000}
              onChange={(event) =>
                setReview({ ...review, context: event.target.value })
              }
            />
          </label>
          <div className="review-timestamp">
            <span className="subtle">
              원문 확인 시각:{" "}
              {review.checkedAt ? formatDate(review.checkedAt) : "미기록"}
            </span>
            <button
              type="button"
              onClick={() =>
                setReview({ ...review, checkedAt: new Date().toISOString() })
              }
            >
              <Clock size={15} />
              확인 시각 기록
            </button>
          </div>
          <div className="form-columns">
            <label>
              처리 상태
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as Status)}
              >
                {Object.entries(statuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              감정 분류
              <select
                value={sentiment}
                onChange={(event) =>
                  setSentiment(event.target.value as Mention["sentiment"])
                }
              >
                {Object.entries(sentiments).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-columns">
            <label>
              담당자
              <input
                value={assignee}
                maxLength={100}
                onChange={(event) => setAssignee(event.target.value)}
              />
            </label>
            <label>
              태그
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="배송, 고객 응대"
              />
            </label>
          </div>
          <div className="form-columns">
            <label>
              신고 결과 상태
              <select
                aria-label="신고 결과 상태"
                value={reportStatus}
                onChange={(event) => setReportStatus(event.target.value)}
              >
                <option value="">미신고</option>
                {(
                  Object.entries(reportStatuses) as [ReportStatus, string][]
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              우선순위
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(
                    event.target.value as NonNullable<Mention["priority"]>,
                  )
                }
              >
                <option value="low">낮음</option>
                <option value="normal">보통</option>
                <option value="high">높음</option>
                <option value="urgent">긴급</option>
              </select>
            </label>
            <label>
              대응 기한
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
          </div>
          <label>
            대응 메모
            <textarea
              rows={4}
              maxLength={5000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" onClick={close}>
              닫기
            </button>
            <button className="primary" disabled={saving}>
              {saving ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              변경 저장
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
