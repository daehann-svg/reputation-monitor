import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Inbox, X } from "lucide-react";
import type { Mention, ReportStatus, Status } from "../types";

export const sentiments = {
  positive: "긍정",
  neutral: "중립",
  negative: "부정",
};
export const statuses: Record<Status, string> = {
  new: "신규",
  reviewing: "검토 중",
  resolved: "처리 완료",
  ignored: "제외",
};
export const reportStatuses: Record<ReportStatus, string> = {
  planned: "신고예정",
  reporting: "신고중",
  delete_pending: "삭제예정",
  deleted: "삭제완료",
};
export function IconButton({
  label,
  children,
  onClick,
  disabled,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`icon-button ${className}`}
    >
      {children}
    </button>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={close}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <IconButton label="닫기" onClick={close}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function Empty({
  icon = Inbox,
  title,
  children,
}: {
  icon?: typeof Inbox;
  title: string;
  children?: ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={28} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function SentimentBadge({ mention }: { mention: Mention }) {
  return (
    <span className={`badge ${mention.sentiment}`}>
      <span className="dot" />
      {sentiments[mention.sentiment]}
    </span>
  );
}
