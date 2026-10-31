import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FilePlus2,
  FileText,
  ImagePlus,
  LoaderCircle,
  Pencil,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppState,
  Mention,
  Mutation,
  Notify,
  ReportDraft,
  ReportImage,
  ReportStatus,
} from "../types";
import { api, formatDate, getReportCenterUrl, reportCenterUrls } from "../api";
import { Empty, IconButton, Modal, reportStatuses } from "./Shared";

const categories = [
  "권리침해·명예훼손 신고",
  "허위사실 유포·업무방해 신고",
  "개인정보 노출·사생활 침해 신고",
  "모욕·비방·악성 게시물 삭제 요청",
];

function buildTemplate(
  category: string,
  organization: string,
  mention?: Mention | null,
  targetUrl = "",
) {
  const url = mention?.url || targetUrl || "(대상 게시물 URL 입력)";
  const title = mention?.title || "(대상 게시물 제목)";
  const quote =
    mention?.review?.quote ||
    mention?.summary ||
    "(침해 표현 및 문제 문구 기재)";
  const negative = (mention?.matchedNegativeWords || []).join(", ");
  return `[${category} 요청서]

1. 신청인(피해 주체): ${organization}
2. 신고 대상 URL: ${url}
3. 게시물 제목: ${title}
${negative ? `4. 감지된 주요 키워드: ${negative}\n` : ""}
[신고 및 삭제 요청 사유]
상기 게시물은 사실과 다른 일방적 주장 또는 과도한 비방·권리침해 표현을 포함하여 ${organization}의 명예와 정상적인 업무에 심각한 피해를 발생시키고 있습니다.

[구체적 침해 문구 및 내용]
"${quote}"

[요청 사항]
정보통신망 이용촉진 및 정보보호 등에 관한 법률 제44조의2(정보의 삭제요청 등) 및 귀 플랫폼의 운영정책에 의거하여 해당 게시물의 신속한 삭제 또는 임시조치(블라인드)를 요청드립니다.

첨부: 관련 캡처 이미지 및 증빙 자료`;
}

export function Reports({
  state,
  mutate,
  notify,
  initialMention,
  clearInitialMention,
}: {
  state: AppState;
  mutate: Mutation;
  notify: Notify;
  initialMention: Mention | null;
  clearInitialMention: () => void;
}) {
  const reports = state.reports || [];
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<ReportDraft | "new" | null>(
    initialMention ? "new" : null,
  );

  const filtered = reports.filter(
    (item) => statusFilter === "all" || item.status === statusFilter,
  );

  const counts = {
    planned: reports.filter((r) => r.status === "planned").length,
    reporting: reports.filter((r) => r.status === "reporting").length,
    delete_pending: reports.filter((r) => r.status === "delete_pending").length,
    deleted: reports.filter((r) => r.status === "deleted").length,
  };

  const copyReport = async (report: ReportDraft) => {
    try {
      await navigator.clipboard.writeText(
        `${report.title}\n\n대상 URL: ${report.targetUrl}\n\n${report.content}`,
      );
      notify("신고 원고 내용을 클립보드에 복사했습니다.");
    } catch {
      notify("클립보드 복사에 실패했습니다.", true);
    }
  };

  return (
    <>
      <section className="metrics" aria-label="신고 결과 현황">
        {(
          [
            ["planned", "신고예정", counts.planned],
            ["reporting", "신고중", counts.reporting],
            ["delete_pending", "삭제예정", counts.delete_pending],
            ["deleted", "삭제완료", counts.deleted],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            className="metric"
            onClick={() =>
              setStatusFilter((current) => (current === key ? "all" : key))
            }
          >
            <span>
              {label}
              <ShieldAlert size={18} />
            </span>
            <strong
              className={
                key === "deleted"
                  ? "green-text"
                  : key === "reporting" || key === "delete_pending"
                    ? "amber-text"
                    : "red-text"
              }
            >
              {count}
              <small>건</small>
            </strong>
            <div>{statusFilter === key ? "필터 적용 중" : "클릭하여 필터"}</div>
          </button>
        ))}
      </section>

      <div className="section-heading">
        <div className="segmented" aria-label="신고 결과 필터">
          <button
            className={statusFilter === "all" ? "selected" : ""}
            onClick={() => setStatusFilter("all")}
          >
            전체 ({reports.length})
          </button>
          {(Object.entries(reportStatuses) as [ReportStatus, string][]).map(
            ([value, label]) => (
              <button
                key={value}
                className={statusFilter === value ? "selected" : ""}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <button
          className="primary"
          onClick={() => {
            clearInitialMention();
            setEditing("new");
          }}
        >
          <FilePlus2 size={16} />
          신고 원고 작성
        </button>
      </div>

      {filtered.length ? (
        <div className="mention-list">
          {filtered.map((report) => (
            <article className="mention-row" key={report.id}>
              <div className="mention-body">
                <div className="mention-meta">
                  <span className={`badge report-${report.status}`}>
                    {reportStatuses[report.status]}
                  </span>
                  <span>{report.category}</span>
                  {report.platform && <span>{report.platform}</span>}
                  <time>수정 {formatDate(report.updatedAt)}</time>
                </div>
                <button
                  className="mention-title"
                  onClick={() => setEditing(report)}
                >
                  {report.title}
                </button>
                <p>{report.content}</p>
                <div className="mention-tags">
                  {report.targetUrl && (
                    <a
                      className="external-link"
                      href={report.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      대상 원문 열기
                      <ExternalLink size={13} />
                    </a>
                  )}
                  {report.reportUrl && (
                    <a
                      className="external-link report-center-link"
                      href={report.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      온라인 신고센터 이동
                      <ExternalLink size={13} />
                    </a>
                  )}
                  {report.images.length > 0 && (
                    <span className="mini-tag">
                      첨부 이미지 {report.images.length}장
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void copyReport(report)}
                  >
                    <Copy size={13} />
                    원고 복사
                  </button>
                </div>
                {report.images.length > 0 && (
                  <div className="report-image-strip">
                    {report.images.map((image) => (
                      <img
                        key={image.id}
                        src={image.dataUrl}
                        alt={image.name}
                        title={image.name}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="mention-side">
                <select
                  aria-label={`${report.title} 신고 결과 상태`}
                  value={report.status}
                  onChange={(event) =>
                    void mutate(
                      `/reports/${report.id}/status`,
                      "PATCH",
                      { status: event.target.value },
                      "신고 결과 상태를 변경했습니다.",
                    )
                  }
                >
                  {(
                    Object.entries(reportStatuses) as [ReportStatus, string][]
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 4 }}>
                  <IconButton
                    label={`${report.title} 수정`}
                    onClick={() => setEditing(report)}
                  >
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton
                    label={`${report.title} 삭제`}
                    onClick={() =>
                      void mutate(
                        `/reports/${report.id}`,
                        "DELETE",
                        {},
                        "신고 원고를 삭제했습니다.",
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={FileText} title="작성된 신고 원고가 없습니다">
          <p className="subtle">
            수집 결과에서 신고원고 작성을 누르거나 상단 신고 원고 작성 버튼으로
            새 원고를 작성하세요.
          </p>
        </Empty>
      )}

      {(editing || initialMention) && (
        <ReportEditorModal
          draft={editing === "new" || !editing ? null : editing}
          mention={editing === "new" || !editing ? initialMention : null}
          organization={state.settings.organization}
          close={() => {
            setEditing(null);
            clearInitialMention();
          }}
          mutate={mutate}
          notify={notify}
        />
      )}
    </>
  );
}

function ReportEditorModal({
  draft,
  mention,
  organization,
  close,
  mutate,
  notify,
}: {
  draft: ReportDraft | null;
  mention: Mention | null;
  organization: string;
  close: () => void;
  mutate: Mutation;
  notify: Notify;
}) {
  const [category, setCategory] = useState(draft?.category || categories[0]);
  const [title, setTitle] = useState(
    draft?.title ||
      (mention
        ? `[신고원고] ${mention.title.slice(0, 60)}`
        : `${organization} 권리침해 게시물 삭제 요청`),
  );
  const [status, setStatus] = useState<ReportStatus>(
    draft?.status || "planned",
  );
  const [platform, setPlatform] = useState(
    draft?.platform || mention?.source || "네이버",
  );
  const [targetUrl, setTargetUrl] = useState(
    draft?.targetUrl || mention?.url || "",
  );
  const [reportUrl, setReportUrl] = useState(
    draft?.reportUrl ||
      getReportCenterUrl(
        mention?.medium,
        draft?.targetUrl || mention?.url || "",
      ),
  );
  const [content, setContent] = useState(
    draft?.content ||
      buildTemplate(categories[0], organization, mention, mention?.url || ""),
  );
  const [images, setImages] = useState<ReportImage[]>(draft?.images || []);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const buildAiPrompt = () =>
    [
      `다음 정보를 바탕으로 온라인 게시물 "${category}" 원고를 한국어로 작성해 주세요.`,
      "",
      "[작성 조건]",
      "- 정중하고 객관적인 공문체, 800~1500자",
      "- 제공된 사실만 사용하고 추측·허위 사실·확정적 법률 판단은 쓰지 말 것",
      "- 구성: 1) 신청인 2) 대상 게시물(URL·제목) 3) 문제 표현 인용 4) 침해 사유 5) 요청 사항(삭제·임시조치) 6) 첨부 목록",
      "- 근거로 정보통신망법 제44조의2(정보의 삭제요청 등)와 해당 플랫폼 운영정책을 언급",
      "- 전화번호·실명 등 개인정보는 마스킹(예: 010-****-****)",
      "- 원고 본문만 출력",
      "",
      "[신고 정보]",
      `- 신청인: ${organization}`,
      `- 신고 유형: ${category}`,
      `- 매체: ${platform || "미기재"}`,
      `- 대상 URL: ${targetUrl || "미기재"}`,
      mention ? `- 게시물 제목: ${mention.title}` : null,
      mention?.matchedNegativeWords?.length
        ? `- 감지 부정 키워드: ${mention.matchedNegativeWords.join(", ")}`
        : null,
      mention?.review?.quote || mention?.summary
        ? `- 문제 표현·요약: ${mention.review?.quote || mention.summary}`
        : null,
      `- 첨부 이미지: ${images.length}장`,
      "",
      "[현재 초안]",
      content.slice(0, 3000),
    ]
      .filter((line) => line !== null)
      .join("\n");
  const [aiPrompt, setAiPrompt] = useState(buildAiPrompt);
  useEffect(() => {
    let active = true;
    api<{ configured: boolean }>("/ai/status")
      .then((status) => active && setAiConfigured(Boolean(status.configured)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const copyText = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify("클립보드 복사에 실패했습니다.", true);
    }
  };
  const draftWithAi = async () => {
    setAiBusy(true);
    try {
      const result = await api<{ content: string }>(
        "/ai/report-draft",
        "POST",
        { prompt: aiPrompt },
      );
      setContent(result.content);
      notify("AI 작성 결과를 에디터에 적용했습니다. 내용을 검토하세요.");
    } catch (cause) {
      notify((cause as Error).message, true);
    } finally {
      setAiBusy(false);
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (images.length + files.length > 5) {
      notify("이미지는 최대 5장까지 첨부할 수 있습니다.", true);
      return;
    }
    files.forEach((file) => {
      if (file.size > 1024 * 1024) {
        notify(`${file.name}: 1MB 이하 이미지만 첨부 가능합니다.`, true);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImages((current) => [
            ...current,
            {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              dataUrl: reader.result as string,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  };

  const applyTemplate = (nextCategory: string) => {
    setCategory(nextCategory);
    setContent(buildTemplate(nextCategory, organization, mention, targetUrl));
  };

  const insertSnippet = (snippet: string) => {
    setContent((current) => `${current}\n${snippet}`);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      title: title.trim(),
      content,
      status,
      category,
      targetUrl: targetUrl.trim(),
      reportUrl: reportUrl.trim(),
      platform: platform.trim(),
      mentionId: draft ? draft.mentionId : mention?.id || null,
      images,
    };
    const ok = await mutate(
      draft ? `/reports/${draft.id}` : "/reports",
      draft ? "PUT" : "POST",
      payload,
      draft ? "신고 원고를 수정했습니다." : "신고 원고를 저장했습니다.",
    );
    setSaving(false);
    if (ok) close();
  };

  return (
    <Modal
      title={draft ? "신고 원고 편집" : "신고 원고 작성"}
      close={close}
      wide
    >
      <form className="form" onSubmit={submit}>
        <div className="form-columns">
          <label>
            신고 유형 (템플릿 자동 작성)
            <select
              value={category}
              onChange={(event) => applyTemplate(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            신고 결과 상태
            <select
              aria-label="신고 결과 상태"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ReportStatus)
              }
            >
              {(Object.entries(reportStatuses) as [ReportStatus, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        <label>
          원고 제목
          <input
            required
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="신고 원고 제목"
          />
        </label>

        <div className="form-columns">
          <label>
            대상 매체·출처
            <input
              maxLength={100}
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              placeholder="네이버 카페, 디시인사이드 등"
            />
          </label>
          <label>
            온라인 신고센터 주소
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={reportUrl}
                onChange={(event) => setReportUrl(event.target.value)}
                placeholder="https://help.naver.com/..."
              />
              {reportUrl && (
                <a
                  className="button-link"
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="신고센터 열기"
                >
                  신고센터 열기
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </label>
        </div>

        <label>
          신고 대상 게시물 URL
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={targetUrl}
              onChange={(event) => {
                setTargetUrl(event.target.value);
                if (!reportUrl || reportUrl === reportCenterUrls.default) {
                  setReportUrl(getReportCenterUrl(null, event.target.value));
                }
              }}
              placeholder="https://..."
            />
            {targetUrl && (
              <a
                className="button-link"
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                원문 확인
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </label>

        <div className="editor-toolbar">
          <span className="subtle">문구 빠른 삽입:</span>
          <button
            type="button"
            onClick={() =>
              insertSnippet(
                "- 정보통신망법 제44조의2에 따른 권리침해 정보 삭제 및 임시조치 요청",
              )
            }
          >
            + 정통망법 조항
          </button>
          <button
            type="button"
            onClick={() =>
              insertSnippet(
                "- 객관적 사실 확인 없는 허위사실 적시로 인한 브랜드 신용 훼손",
              )
            }
          >
            + 허위사실 사유
          </button>
          <button
            type="button"
            onClick={() =>
              insertSnippet(
                "- 담당자 및 제3자 개인정보(연락처·실명 등) 무단 노출 피해",
              )
            }
          >
            + 개인정보 노출
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(content);
                notify("에디터 본문을 복사했습니다.");
              } catch {}
            }}
          >
            <Copy size={13} />
            본문 복사
          </button>
        </div>

        <label>
          신고 원고 에디터
          <textarea
            rows={12}
            value={content}
            maxLength={50000}
            onChange={(event) => setContent(event.target.value)}
            placeholder="신고 사유 및 삭제 요청 원고를 작성하세요."
          />
        </label>

        <details className="ai-prompt-section" open>
          <summary>
            <Sparkles size={15} />
            AI 작성 프롬프트
          </summary>
          <label>
            AI 프롬프트
            <textarea
              rows={8}
              maxLength={20000}
              value={aiPrompt}
              onChange={(event) => setAiPrompt(event.target.value)}
            />
          </label>
          <div className="editor-toolbar">
            <button type="button" onClick={() => setAiPrompt(buildAiPrompt())}>
              프롬프트 다시 생성
            </button>
            <button
              type="button"
              onClick={() =>
                void copyText(aiPrompt, "AI 프롬프트를 복사했습니다.")
              }
            >
              <Copy size={13} />
              프롬프트 복사
            </button>
            <a
              className="button-link"
              href={`https://chatgpt.com/?q=${encodeURIComponent(aiPrompt.slice(0, 6000))}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              ChatGPT에서 작성
              <ExternalLink size={13} />
            </a>
            <a
              className="button-link"
              href={`https://claude.ai/new?q=${encodeURIComponent(aiPrompt.slice(0, 6000))}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Claude에서 작성
              <ExternalLink size={13} />
            </a>
            <button
              type="button"
              className="primary"
              disabled={!aiConfigured || aiBusy}
              title={
                aiConfigured
                  ? "서버에 설정된 AI 키로 원고를 바로 작성합니다"
                  : "로컬 서버 .env에 OPENAI_API_KEY를 설정하면 사용할 수 있습니다"
              }
              onClick={() => void draftWithAi()}
            >
              {aiBusy ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              AI로 바로 작성
            </button>
          </div>
          <label>
            AI 결과 붙여넣기
            <textarea
              rows={4}
              maxLength={50000}
              value={aiResult}
              placeholder="ChatGPT·Claude에서 받은 원고를 붙여넣고 에디터에 적용하세요."
              onChange={(event) => setAiResult(event.target.value)}
            />
          </label>
          <div className="editor-toolbar">
            <button
              type="button"
              disabled={!aiResult.trim()}
              onClick={() => {
                setContent(aiResult.trim());
                setAiResult("");
                notify("AI 결과를 에디터에 적용했습니다.");
              }}
            >
              <Check size={13} />
              에디터에 적용
            </button>
            <span className="subtle">
              AI 결과는 사실관계를 확인한 뒤 제출하세요.
            </span>
          </div>
        </details>

        <div className="image-attachment-section">
          <div className="section-heading" style={{ marginBottom: 10 }}>
            <span>증빙 이미지 첨부 ({images.length} / 5 · 장당 1MB)</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={handleImageUpload}
            />
            <button type="button" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={15} />
              이미지 첨부
            </button>
          </div>
          {images.length > 0 && (
            <div className="report-image-grid">
              {images.map((img) => (
                <div className="report-image-card" key={img.id}>
                  <img src={img.dataUrl} alt={img.name} />
                  <div>
                    <small>{img.name}</small>
                    <IconButton
                      label={`${img.name} 첨부 삭제`}
                      onClick={() =>
                        setImages((current) =>
                          current.filter((item) => item.id !== img.id),
                        )
                      }
                    >
                      <X size={14} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={close}>
            취소
          </button>
          <button className="primary" disabled={saving}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            원고 저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
