import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  ArrowDownToLine,
  Bell,
  Check,
  CheckCheck,
  CircleHelp,
  Clock3,
  Database,
  FileUp,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Alert, AppState, Mutation, Notify, Settings } from "../types";
import { download, formatDate, splitWords } from "../api";
import { Empty, IconButton, Modal } from "./Shared";

export function Sources({
  state,
  mutate,
  remove,
}: {
  state: AppState;
  mutate: Mutation;
  remove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const add = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    if (
      await mutate(
        "/sources",
        "POST",
        { name, url, enabled: true },
        "RSS 채널을 등록했습니다.",
      )
    ) {
      setAdding(false);
      setName("");
      setUrl("");
    }
    setSaving(false);
  };
  return (
    <>
      <div className="section-heading">
        <h2>연결된 채널</h2>
        <button onClick={() => setAdding(true)}>
          <Plus size={16} />
          RSS 추가
        </button>
      </div>
      <div className="source-list">
        <article className="source-row">
          <div className="source-icon google">
            <Search size={23} />
          </div>
          <div className="source-info">
            <h3>Google 뉴스</h3>
            <p>한국어 · 대한민국 · 활성 키워드별 RSS</p>
          </div>
          <span className="badge positive">
            <Check size={13} />
            기본 연결
          </span>
        </article>
        {state.sources.map((source) => (
          <article className="source-row" key={source.id}>
            <div className="source-icon">
              <Rss size={22} />
            </div>
            <div className="source-info">
              <h3>{source.name}</h3>
              <p>{source.url}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                aria-label={`${source.name} 활성화`}
                checked={source.enabled}
                onChange={() =>
                  void mutate(`/sources/${source.id}`, "PATCH", {
                    enabled: !source.enabled,
                  })
                }
              />
              <span />
            </label>
            <IconButton
              label={`${source.name} 삭제`}
              onClick={() => remove(source.id)}
            >
              <Trash2 size={17} />
            </IconButton>
          </article>
        ))}
      </div>
      <div className="inline-note">
        <ShieldCheck size={17} />
        <span>
          공개 HTTPS RSS·Atom만 연결됩니다. 로그인 필요 채널, SNS 전체 검색,
          검색엔진 결과 전체 수집은 지원하지 않습니다.
        </span>
      </div>
      <section className="runs-section">
        <div className="section-heading">
          <h2>
            수집 실행 이력{" "}
            <span className="small-count">{state.runs.length}</span>
          </h2>
        </div>
        {state.runs.length ? (
          <div className="runs-list">
            {state.runs.map((run) => (
              <div className="run-row" key={run.id}>
                <div className={run.errors.length ? "red-text" : "green-text"}>
                  {!run.finishedAt ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : run.errors.length ? (
                    <CircleHelp size={18} />
                  ) : (
                    <CheckCheck size={18} />
                  )}
                </div>
                <div>
                  <strong>{formatDate(run.startedAt)}</strong>
                  <span>
                    {" "}
                    ·{" "}
                    {run.finishedAt
                      ? `${run.feeds}개 채널 성공 · ${run.added}건 추가`
                      : "수집 진행 중"}
                  </span>
                  {run.errors.length > 0 && (
                    <details>
                      <summary>{run.errors.length}개 오류</summary>
                      {run.errors.map((error, index) => (
                        <p key={index}>{error}</p>
                      ))}
                    </details>
                  )}
                </div>
                <span
                  className={`badge ${run.errors.length ? "negative" : "neutral"}`}
                >
                  {run.finishedAt
                    ? run.errors.length
                      ? "일부 실패"
                      : "완료"
                    : "진행 중"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Clock3} title="아직 수집 이력이 없습니다" />
        )}
      </section>
      {adding && (
        <Modal title="RSS 채널 추가" close={() => setAdding(false)}>
          <form className="form" onSubmit={add}>
            <label>
              채널 이름
              <input
                required
                maxLength={100}
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              RSS 주소
              <input
                required
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/rss"
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setAdding(false)}>
                취소
              </button>
              <button className="primary" disabled={saving}>
                {saving ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Plus size={16} />
                )}
                추가
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Alerts({
  alerts,
  mutate,
  onDetail,
}: {
  alerts: Alert[];
  mutate: Mutation;
  onDetail: (id: string) => void;
}) {
  const [onlyUnread, setOnlyUnread] = useState(false);
  const unread = alerts.filter((alert) => !alert.read);
  const filtered = onlyUnread ? unread : alerts;
  return (
    <>
      <div className="section-toolbar">
        <label className="check-label">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(event) => setOnlyUnread(event.target.checked)}
          />
          읽지 않은 알림만 <span className="small-count">{unread.length}</span>
        </label>
        <button
          disabled={!unread.length}
          onClick={() =>
            void mutate(
              "/alerts/read",
              "POST",
              { ids: unread.map((alert) => alert.id) },
              "알림을 모두 읽음 처리했습니다.",
            )
          }
        >
          <CheckCheck size={16} />
          모두 읽음
        </button>
      </div>
      {filtered.length ? (
        <div className="alerts-list">
          {filtered.map((alert) => (
            <article
              className={`alert-row ${!alert.read ? "unread" : ""}`}
              key={alert.id}
            >
              <div className="alert-symbol">
                <Bell size={19} />
              </div>
              <div>
                <span className="alert-type">
                  부정 언급 감지 {!alert.read && <i className="dot" />}
                </span>
                <button
                  className="mention-title"
                  onClick={() => {
                    onDetail(alert.mentionId);
                    if (!alert.read)
                      void mutate("/alerts/read", "POST", { ids: [alert.id] });
                  }}
                >
                  {alert.title}
                </button>
                <small>{formatDate(alert.createdAt)}</small>
              </div>
              {!alert.read && (
                <IconButton
                  label="읽음 처리"
                  onClick={() =>
                    void mutate("/alerts/read", "POST", { ids: [alert.id] })
                  }
                >
                  <Check size={18} />
                </IconButton>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={Bell}
          title={
            onlyUnread ? "읽지 않은 알림이 없습니다" : "아직 알림이 없습니다"
          }
        />
      )}
    </>
  );
}
export function SettingsView({
  settings,
  mutate,
  notify,
  restore,
}: {
  settings: Settings;
  mutate: Mutation;
  notify: Notify;
  restore: (data: unknown) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [positive, setPositive] = useState(settings.positiveWords.join(", "));
  const [negative, setNegative] = useState(settings.negativeWords.join(", "));
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = <Key extends keyof Settings>(key: Key, value: Settings[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await mutate(
      "/settings",
      "PUT",
      {
        ...draft,
        positiveWords: splitWords(positive),
        negativeWords: splitWords(negative),
      },
      "설정을 저장했습니다.",
    );
    setSaving(false);
  };
  return (
    <div className="settings-layout">
      <form className="settings-form" onSubmit={submit}>
        <section className="settings-section">
          <div className="settings-title">
            <Settings2 size={19} />
            <h2>기본 설정</h2>
          </div>
          <label className="setting-field">
            <span>작업 공간 이름</span>
            <input
              required
              maxLength={100}
              value={draft.organization}
              onChange={(event) => set("organization", event.target.value)}
            />
          </label>
        </section>
        <section className="settings-section">
          <div className="settings-title">
            <RefreshCw size={19} />
            <h2>수집 및 보관</h2>
          </div>
          <div className="setting-row">
            <div>
              <strong>자동 수집</strong>
              <small>프로그램 실행 중 설정 주기로 수집</small>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                aria-label="자동 수집"
                checked={draft.autoCollect}
                onChange={(event) => set("autoCollect", event.target.checked)}
              />
              <span />
            </label>
          </div>
          <label className="setting-field">
            <span>수집 간격</span>
            <div className="unit-input">
              <input
                aria-label="수집 간격"
                type="number"
                required
                min={5}
                max={1440}
                value={draft.intervalMinutes}
                onChange={(event) =>
                  set("intervalMinutes", Number(event.target.value))
                }
              />
              <span>분</span>
            </div>
          </label>
          <label className="setting-field">
            <span>데이터 보관 기간</span>
            <div className="unit-input">
              <input
                aria-label="데이터 보관 기간"
                type="number"
                required
                min={1}
                max={365}
                value={draft.retentionDays}
                onChange={(event) =>
                  set("retentionDays", Number(event.target.value))
                }
              />
              <span>일</span>
            </div>
          </label>
          <p className="setting-note">
            오래된 게시물과 관련 알림은 저장·수집 시 삭제됩니다. 보관 기간 변경
            전 백업을 권장합니다.
          </p>
        </section>
        <section className="settings-section">
          <div className="settings-title">
            <Bell size={19} />
            <h2>알림 기준</h2>
          </div>
          <div className="setting-row">
            <div>
              <strong>부정 언급 알림</strong>
              <small>새 언급이 기준에 도달하면 앱 내 알림 생성</small>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                aria-label="부정 언급 알림"
                checked={draft.alertEnabled}
                onChange={(event) => set("alertEnabled", event.target.checked)}
              />
              <span />
            </label>
          </div>
          <label className="setting-field">
            <span>부정 점수 기준</span>
            <div className="unit-input">
              <span>−</span>
              <input
                aria-label="부정 점수 기준"
                type="number"
                min={1}
                max={10}
                required
                value={draft.alertThreshold}
                onChange={(event) =>
                  set("alertThreshold", Number(event.target.value))
                }
              />
              <span>이하</span>
            </div>
          </label>
        </section>
        <section className="settings-section">
          <div className="settings-title">
            <Activity size={19} />
            <h2>감정 분석 사전</h2>
          </div>
          <label className="dictionary-field">
            긍정 표현
            <textarea
              rows={3}
              value={positive}
              onChange={(event) => setPositive(event.target.value)}
            />
          </label>
          <label className="dictionary-field">
            부정 표현
            <textarea
              rows={3}
              value={negative}
              onChange={(event) => setNegative(event.target.value)}
            />
          </label>
          <p className="setting-note">
            쉼표로 구분합니다. 표현별 1점씩 계산합니다. 변경은 새 수집부터
            적용되며 기존 언급은 언급함에서 재분석할 수 있습니다.
          </p>
        </section>
        <div className="settings-save">
          <button
            type="button"
            onClick={() => {
              setDraft(settings);
              setPositive(settings.positiveWords.join(", "));
              setNegative(settings.negativeWords.join(", "));
            }}
          >
            변경 취소
          </button>
          <button className="primary" disabled={saving}>
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            설정 저장
          </button>
        </div>
      </form>
      <aside className="data-settings">
        <div className="settings-title">
          <Database size={19} />
          <h2>데이터 관리</h2>
        </div>
        <div className="data-action">
          <strong>작업 공간 백업</strong>
          <p>설정, 저장 필터, 언급, 메모와 알림을 JSON으로 내보냅니다.</p>
          <button
            onClick={async () => {
              try {
                await download(
                  "/backup",
                  `평판모니터-백업-${new Date().toISOString().slice(0, 10)}.json`,
                );
                notify("백업 파일을 내려받았습니다.");
              } catch (cause) {
                notify((cause as Error).message, true);
              }
            }}
          >
            <ArrowDownToLine size={16} />
            백업 내려받기
          </button>
        </div>
        <div className="data-action">
          <strong>백업 복원</strong>
          <p>현재 작업 공간을 교체합니다. 자동 수집은 해제됩니다.</p>
          <input
            type="file"
            accept=".json,application/json"
            ref={file}
            hidden
            onChange={async (event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (!selected) return;
              if (selected.size > 20 * 1024 * 1024) {
                notify("20MB 이하의 파일을 선택하세요.", true);
                return;
              }
              try {
                restore(JSON.parse(await selected.text()));
              } catch {
                notify("올바른 JSON 파일이 아닙니다.", true);
              }
            }}
          />
          <button onClick={() => file.current?.click()}>
            <FileUp size={16} />
            백업 파일 선택
          </button>
        </div>
        <div className="privacy-note">
          <ShieldCheck size={21} />
          <strong>로컬 저장</strong>
          <p>
            SQLite에 저장됩니다. 공개 채널 수집 시 키워드는 해당 제공 사이트로
            전달되며 감정 분석은 외부 AI에 전송하지 않습니다.
          </p>
        </div>
      </aside>
    </div>
  );
}
