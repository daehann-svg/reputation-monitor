import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bell,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type {
  AppState,
  Filters,
  Keyword,
  Mention,
  Page,
  Mutation,
  Notify,
} from "./types";
import { api, formatDate } from "./api";
import { IconButton, Modal } from "./components/Shared";
import { Dashboard } from "./components/Dashboard";
import { Keywords, KeywordEditor } from "./components/Keywords";
import { Detail } from "./components/Detail";
import { Mentions } from "./components/Mentions";
import { MediaSearch } from "./components/MediaSearch";
import { Reports } from "./components/Reports";
import { Alerts, SettingsView } from "./components/Management";
import "./App.css";
import "./components/workspace.css";

const nav = [
  { id: "overview", label: "현황", icon: LayoutDashboard },
  { id: "mentions", label: "수집 결과", icon: Inbox },
  { id: "keywords", label: "키워드 등록", icon: Search },
  { id: "search", label: "검색·수집", icon: Globe },
  { id: "reports", label: "신고원고", icon: FileText },
  { id: "alerts", label: "알림", icon: Bell },
  { id: "settings", label: "설정", icon: SlidersHorizontal },
] as const;
const navGroups = [
  { label: "현황", pages: ["overview"] },
  { label: "등록 관리", pages: ["keywords"] },
  { label: "수집 관리", pages: ["search", "mentions"] },
  { label: "신고 관리", pages: ["reports"] },
  { label: "운영", pages: ["alerts", "settings"] },
];

function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState<Page>("overview");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [menu, setMenu] = useState(false);
  const [collecting] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [collectionTarget, setCollectionTarget] = useState("");
  const [reportTarget, setReportTarget] = useState<Mention | null>(null);
  const [keywordModal, setKeywordModal] = useState<Keyword | "new" | null>(
    null,
  );
  const [mentionInitial, setMentionInitial] = useState<Partial<Filters>>({});
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    action: () => Promise<boolean>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify: Notify = (message, isError = false) => {
    setToast({ message, error: isError });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };
  const load = async () => {
    const data = await api<AppState>("/state");
    setState(data);
    setNow(Date.now());
    setError("");
  };
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await api<AppState>("/state");
        if (active) {
          setState(data);
          setNow(Date.now());
          setError("");
        }
      } catch (cause) {
        if (active) setError((cause as Error).message);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(toastTimer.current);
    };
  }, []);
  const mutate: Mutation = async (path, method, body = {}, message) => {
    try {
      await api(path, method, body);
      await load();
      if (message) notify(message);
      return true;
    } catch (cause) {
      notify((cause as Error).message, true);
      return false;
    }
  };
  const changePage = (next: Page) => {
    setPage(next);
    setMenu(false);
  };
  const showMentions = (preset = "all", days?: number) => {
    setMentionInitial({
      sentiment: ["positive", "negative"].includes(preset) ? preset : "all",
      status: preset === "pending" ? "pending" : "all",
      days: days ? String(days) : "all",
    });
    changePage("mentions");
  };
  if (!state)
    return (
      <div className="boot">
        <Activity size={36} />
        <h1>평판 모니터</h1>
        {error ? (
          <>
            <p className="error-text">서버 연결 실패: {error}</p>
            <button
              onClick={() =>
                void load().catch((cause) => setError(cause.message))
              }
            >
              <RefreshCw size={16} />
              다시 연결
            </button>
          </>
        ) : (
          <p>
            <LoaderCircle className="spin" size={18} />
            작업 공간을 불러오는 중
          </p>
        )}
      </div>
    );
  const unread = state.alerts.filter((alert) => !alert.read).length;
  const busy = collecting || state.collecting || state.searching;
  const selected = state.mentions.find((mention) => mention.id === detail);
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="메뉴 닫기"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            changePage("overview");
          }}
        >
          <span className="brand-mark">
            <Activity size={22} />
          </span>
          <span>
            평판 모니터<small>REPUTATION WORKSPACE</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">
            {state.settings.organization.slice(0, 1)}
          </span>
          <span>
            {state.settings.organization}
            <small>로컬 작업 공간</small>
          </span>
          <ShieldCheck size={16} />
        </div>
        <nav aria-label="주 메뉴">
          {navGroups.map((group) => (
            <div
              className="nav-group"
              role="group"
              aria-label={group.label}
              key={group.label}
            >
              <span className="nav-group-label">{group.label}</span>
              {nav
                .filter((item) => group.pages.includes(item.id))
                .map((item) => (
                  <button
                    key={item.id}
                    className={`nav-item ${page === item.id ? "active" : ""}`}
                    onClick={() => changePage(item.id)}
                  >
                    <item.icon size={19} />
                    <span>
                      {item.id === "mentions" ? "수집 결과" : item.label}
                    </span>
                    {item.id === "alerts" && unread > 0 && (
                      <span className="nav-count">{unread}</span>
                    )}
                    {item.id === "mentions" && (
                      <small>{state.mentions.length}</small>
                    )}
                    {item.id === "reports" && !!state.reports?.length && (
                      <small>{state.reports.length}</small>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="live-status">
            <span className={`dot ${busy ? "pulse" : ""}`} />
            {busy
              ? "채널 수집 중"
              : state.settings.autoCollect
                ? "자동 모니터링 활성"
                : "수동 모니터링"}
          </div>
          <small>최근 수집 {formatDate(state.lastCollectedAt)}</small>
          <button
            className="text-button"
            onClick={() => changePage("settings")}
          >
            <SlidersHorizontal size={14} />
            모니터링 설정
          </button>
          <div className="version">
            LOCAL EDITION <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <IconButton
              label="메뉴 열기"
              className="mobile-menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </IconButton>
            <span>{state.settings.organization}</span>
            <ChevronRight size={14} />
            <strong>{nav.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="local-label">
              <ShieldCheck size={14} />이 PC에 저장됨
            </span>
            <IconButton
              label={`알림 ${unread}개`}
              onClick={() => changePage("alerts")}
            >
              <Bell size={19} />
              {unread > 0 && <span className="notification-dot" />}
            </IconButton>
            <span className="user-avatar">나</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="banner error-banner" role="alert">
              <Radio size={17} />
              서버 연결이 끊겼습니다. {error}
            </div>
          )}
          {state.mentions.some((mention) => mention.demo) && (
            <div className="demo-banner">
              <CircleHelp size={16} />
              <span>체험 데이터가 포함된 작업 공간</span>
              <button
                onClick={() =>
                  void mutate(
                    "/demo",
                    "DELETE",
                    {},
                    "체험 데이터를 삭제했습니다.",
                  )
                }
              >
                체험 데이터 삭제
                <X size={13} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">REPUTATION WORKSPACE</div>
              <h1>
                {page === "overview"
                  ? "평판 현황"
                  : page === "mentions"
                    ? "수집 결과"
                    : page === "search"
                      ? "검색·수집"
                      : page === "keywords"
                        ? "키워드 등록"
                        : page === "reports"
                          ? "신고원고"
                          : page === "alerts"
                            ? "알림 센터"
                            : "작업 공간 설정"}
              </h1>
            </div>
            {page !== "search" && page !== "keywords" && page !== "reports" && (
              <div className="heading-actions">
                <span className="last-sync">
                  최근 {formatDate(state.lastCollectedAt)}
                </span>
                <button
                  className="primary"
                  onClick={() => changePage("search")}
                  disabled={
                    busy || !state.keywords.some((keyword) => keyword.enabled)
                  }
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {busy ? "수집 중" : "수집 화면"}
                </button>
              </div>
            )}
          </div>
          {busy && (
            <div className="collection-progress">
              <LoaderCircle size={16} className="spin" />
              <span>
                {state.progress
                  ? `${state.progress.completed}/${state.progress.total} 채널 · ${state.progress.current} · ${state.progress.added}건 추가`
                  : "수집 준비 중"}
              </span>
              <button
                className="text-button"
                onClick={() =>
                  void mutate(
                    "/collect/cancel",
                    "POST",
                    {},
                    "수집 취소를 요청했습니다.",
                  )
                }
              >
                수집 취소
              </button>
            </div>
          )}
          {page === "overview" && (
            <Dashboard
              state={state}
              now={now}
              onMentions={showMentions}
              onDetail={setDetail}
              onKeyword={() => changePage("keywords")}
              demo={() =>
                void mutate("/demo", "POST", {}, "체험 데이터를 추가했습니다.")
              }
            />
          )}
          {page === "mentions" && (
            <Mentions
              state={state}
              now={now}
              initial={mentionInitial}
              mutate={mutate}
              onDetail={setDetail}
              onReport={(mention) => {
                setReportTarget(mention);
                changePage("reports");
              }}
              onReload={load}
              notify={notify}
            />
          )}
          {page === "reports" && (
            <Reports
              state={state}
              mutate={mutate}
              notify={notify}
              initialMention={reportTarget}
              clearInitialMention={() => setReportTarget(null)}
            />
          )}
          {page === "search" && (
            <MediaSearch
              keywords={state.keywords}
              now={now}
              onSaved={load}
              initialKeywordId={collectionTarget}
              blocked={Boolean(busy)}
              onRegister={() => changePage("keywords")}
            />
          )}
          {page === "keywords" && (
            <>
              <div className="section-heading">
                <span className="subtle">
                  대상 · 부정 키워드 · 별칭 · 제외어
                </span>
                <button
                  className="primary"
                  onClick={() => setKeywordModal("new")}
                >
                  <Plus size={16} />
                  키워드 추가
                </button>
              </div>
              <Keywords
                state={state}
                mutate={mutate}
                edit={setKeywordModal}
                collect={(keyword) => {
                  setCollectionTarget(keyword.id);
                  changePage("search");
                }}
                remove={(keyword) =>
                  setConfirm({
                    title: "키워드 삭제",
                    message: `${keyword.name} 검색을 중단합니다. 기존 언급은 유지됩니다.`,
                    action: () =>
                      mutate(
                        `/keywords/${keyword.id}`,
                        "DELETE",
                        {},
                        "키워드를 삭제했습니다.",
                      ),
                  })
                }
              />
            </>
          )}
          {page === "alerts" && (
            <Alerts
              alerts={state.alerts}
              mutate={mutate}
              onDetail={setDetail}
            />
          )}
          {page === "settings" && (
            <SettingsView
              settings={state.settings}
              mutate={mutate}
              notify={notify}
              restore={(data) =>
                setConfirm({
                  title: "백업 복원",
                  message:
                    "현재 작업 공간을 백업 파일로 교체합니다. 자동 수집은 꺼진 상태로 복원됩니다.",
                  action: async () => {
                    const success = await mutate(
                      "/restore",
                      "POST",
                      data,
                      "백업을 복원했습니다.",
                    );
                    if (success) changePage("overview");
                    return success;
                  },
                })
              }
            />
          )}
          <footer className="page-footer">
            <span>
              <Activity size={13} />
              평판 모니터
            </span>
            <span>공개 검색 · 부정 키워드 수집 · 신고 관리 · 로컬 저장</span>
          </footer>
        </main>
      </div>
      {keywordModal && (
        <KeywordEditor
          keyword={keywordModal}
          close={() => setKeywordModal(null)}
          mutate={mutate}
          initialNegativeWords={state.settings.negativeWords.slice(0, 3)}
        />
      )}
      {selected && (
        <Detail
          key={selected.id}
          mention={selected}
          keywords={state.keywords}
          close={() => setDetail(null)}
          mutate={mutate}
          negativeWords={state.settings.negativeWords}
          onReport={(mention) => {
            setReportTarget(mention);
            changePage("reports");
          }}
          related={
            selected.contentKey
              ? state.mentions.filter(
                  (mention) => mention.contentKey === selected.contentKey,
                )
              : [selected]
          }
        />
      )}
      {confirm && (
        <Modal
          title={confirm.title}
          close={() => {
            if (!confirmBusy) setConfirm(null);
          }}
        >
          <p className="modal-copy">{confirm.message}</p>
          <div className="modal-actions">
            <button disabled={confirmBusy} onClick={() => setConfirm(null)}>
              취소
            </button>
            <button
              className="danger"
              disabled={confirmBusy}
              onClick={async () => {
                setConfirmBusy(true);
                try {
                  if (await confirm.action()) setConfirm(null);
                } finally {
                  setConfirmBusy(false);
                }
              }}
            >
              {confirmBusy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <CheckCheck size={16} />
              )}
              확인
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className={`toast ${toast.error ? "error" : ""}`} role="status">
          {toast.error ? <CircleHelp size={18} /> : <CheckCheck size={18} />}
          <span>{toast.message}</span>
          <IconButton label="알림 닫기" onClick={() => setToast(null)}>
            <X size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
export default App;
