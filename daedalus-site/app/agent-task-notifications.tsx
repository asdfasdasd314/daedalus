"use client";

import { useEffect, useRef } from "react";

export type AgentTaskNotificationStatus =
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export type AgentTaskNotification = {
  id: string;
  taskId: string;
  status: AgentTaskNotificationStatus;
  prompt: string;
  repository: string;
  error?: string;
  createdAt: number;
  read: boolean;
};

type AgentTaskNotificationsProps = {
  notifications: AgentTaskNotification[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onSelect: (taskId: string) => void;
};

const STATUS_LABELS: Record<AgentTaskNotificationStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

export default function AgentTaskNotifications({
  notifications,
  isOpen,
  onOpenChange,
  onMarkAllRead,
  onClearAll,
  onSelect,
}: AgentTaskNotificationsProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (panelRef.current?.contains(target)) {
        return;
      }

      onOpenChange(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  function togglePanel() {
    const nextOpen = !isOpen;

    if (nextOpen) {
      onMarkAllRead();
    }

    onOpenChange(nextOpen);
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={togglePanel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Task notifications"
        title="Task notifications"
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-[0_20px_60px_rgba(2,6,23,0.32)] transition sm:h-12 sm:w-12 ${
          isOpen
            ? "border-cyan-300/30 bg-cyan-200 text-slate-950 hover:bg-cyan-100"
            : "border-white/10 bg-white text-slate-950 hover:bg-slate-200"
        }`}
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Task notifications"
          className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/96 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-slate-100">Notifications</p>
            {notifications.length > 0 ? (
              <button
                type="button"
                onClick={onClearAll}
                className="text-[11px] uppercase tracking-[0.2em] text-slate-400 transition hover:text-slate-200"
              >
                Clear all
              </button>
            ) : null}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">No notifications yet.</p>
          ) : (
            <ul className="max-h-[min(24rem,60vh)] overflow-y-auto">
              {notifications.map((item) => (
                <li
                  key={item.id}
                  className="border-b border-white/6 px-4 py-3 last:border-b-0"
                >
                  <button type="button" onClick={() => onSelect(item.taskId)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        item.status === "completed"
                          ? "text-emerald-300"
                          : item.status === "failed"
                            ? "text-rose-300"
                            : item.status === "cancelled"
                              ? "text-slate-300"
                              : "text-amber-300"
                      }`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-100">
                    {item.prompt}
                  </p>
                  {(item.status === "failed" || item.status === "blocked") &&
                  item.error ? (
                    <p className="mt-1 line-clamp-2 text-xs text-rose-200/90">
                      {item.error}
                    </p>
                  ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}
