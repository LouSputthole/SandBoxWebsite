"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bell, MessageCircle, CheckCheck } from "lucide-react";

interface NotificationPayload {
  listingId?: string;
  listingTitle?: string;
  commentId?: string;
  body?: string;
  fromUsername?: string | null;
  fromAvatarUrl?: string | null;
}

interface Notification {
  id: string;
  kind: string;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 60_000;

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * In-app notification bell. Polls /api/notifications every 60s while
 * mounted; opens a dropdown listing the most recent 20 notifications
 * with click-through links and a "Mark all read" button.
 *
 * Lives in the navbar on the signed-in side; renders nothing if there's
 * no user (the navbar already gates this).
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.unreadCount ?? 0);
      setNotifications(data.notifications ?? []);
    } catch {
      /* keep stale state */
    }
  }, []);

  // Initial fetch + polling. Polling pauses while the tab is hidden so
  // we don't burn fetches in background tabs.
  useEffect(() => {
    fetchNotifications();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    start();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchNotifications]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setUnread(0);
      setNotifications((prev) =>
        prev.map((n) =>
          n.readAt ? n : { ...n, readAt: new Date().toISOString() },
        ),
      );
    } catch {
      /* swallow */
    }
  }

  async function markOneRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id && !n.readAt
            ? { ...n, readAt: new Date().toISOString() }
            : n,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* swallow */
    }
  }

  const badge = unread > 9 ? "9+" : unread > 0 ? String(unread) : null;

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center h-8 w-8 rounded-full border border-neutral-700/50 bg-neutral-900/50 hover:border-neutral-600 transition-colors"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <Bell className="h-4 w-4 text-neutral-300" />
        {badge && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-purple-500 text-white text-[9px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
            <span className="text-sm font-semibold text-white">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] text-purple-300 hover:text-purple-200 inline-flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-neutral-500">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-800/60">
                {notifications.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onClick={() => {
                      if (!n.readAt) void markOneRead(n.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const unread = !notification.readAt;
  const p = notification.payload ?? {};
  const href =
    notification.kind === "trade_comment" && p.listingId
      ? `/trade/${p.listingId}`
      : "/";
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className={`block px-3 py-2.5 hover:bg-neutral-800/50 transition-colors ${
          unread ? "bg-purple-500/5" : ""
        }`}
      >
        <div className="flex items-start gap-2.5">
          <div className="shrink-0 mt-0.5">
            {p.fromAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.fromAvatarUrl}
                alt=""
                className="h-7 w-7 rounded-full border border-neutral-700"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-purple-500/15 flex items-center justify-center">
                <MessageCircle className="h-3.5 w-3.5 text-purple-300" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white">
              <span className="font-semibold">
                {p.fromUsername ?? "Someone"}
              </span>{" "}
              {notification.kind === "trade_comment"
                ? "commented on your listing"
                : "sent a notification"}
            </p>
            {p.body && (
              <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2 leading-snug">
                {p.body}
              </p>
            )}
            <p className="text-[10px] text-neutral-600 mt-1">
              {formatRelative(notification.createdAt)}
            </p>
          </div>
          {unread && (
            <span className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-purple-400" />
          )}
        </div>
      </Link>
    </li>
  );
}
