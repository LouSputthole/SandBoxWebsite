"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Eye,
  Users,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  ArrowRight,
  BarChart3,
  Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DashboardData {
  period: string;
  totalViews: number;
  uniqueVisitors: number;
  topPages: { path: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  topCountries: { country: string; count: number }[];
  devices: { device: string; count: number }[];
  browsers: { browser: string; count: number }[];
  operatingSystems: { os: string; count: number }[];
  viewsByDay: { date: string; views: number; visitors: number }[];
  /** (referrer, path) combos with counts — populated from the
   * referrerPath column added 2026-04-24. Older pageviews don't have
   * path data; this table accumulates from the deployment forward. */
  referrerDetails?: { referrer: string; path: string; count: number }[];
}

const PERIOD_OPTIONS = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/** Map our normalized referrer buckets back to an openable hostname so
 * the "Referring URLs" section can render real clickable links. Multiple
 * sites collapse to one bucket (e.g. google → google.com) — we pick the
 * canonical variant as the link target. Buckets that aggregate multiple
 * sources where a captured path won't resolve universally (ai-chat is
 * ChatGPT + Perplexity + Claude, twitter's t.co only takes shortcodes,
 * etc.) are deliberately omitted — they fall through to the regex
 * check below and render as non-clickable text. */
const CANONICAL_HOST: Record<string, string> = {
  google: "google.com",
  bing: "bing.com",
  duckduckgo: "duckduckgo.com",
  yahoo: "search.yahoo.com",
  yandex: "yandex.com",
  // x.com — paths captured were normalized from twitter.com hostnames, so
  // paths like /<user>/status/<id> resolve correctly there. Earlier
  // mapping to t.co was wrong: t.co only accepts its own shortcodes,
  // anything else redirects to twitter home (which often bounced
  // through to whatever the user's last twitter.com page was — read
  // by the operator as "the link took me back to my own site").
  twitter: "x.com",
  facebook: "facebook.com",
  reddit: "reddit.com",
  youtube: "youtube.com",
  discord: "discord.com",
  // NOT mapping "ai-chat" — bucket conflates multiple LLM hosts and a
  // path from one won't work on another. Better to render as text-only.
};

/** Hostnames that point back at our own site. Click-throughs to these
 * just send the operator to their own admin → indistinguishable from a
 * broken link. Render as non-clickable text instead. */
const INTERNAL_HOSTS = new Set([
  "sboxskins.gg",
  "www.sboxskins.gg",
  "localhost",
]);

function buildFullUrl(referrer: string, path: string): string | null {
  const host = CANONICAL_HOST[referrer] ?? referrer;
  // Defensive: reject anything that doesn't look like a hostname.
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) return null;
  // Don't link back to ourselves — old rows captured before the
  // www/subdomain internal-referrer fix may still have sboxskins.gg as
  // the referrer host.
  if (
    INTERNAL_HOSTS.has(host.toLowerCase()) ||
    host.toLowerCase().endsWith(".sboxskins.gg")
  ) {
    return null;
  }
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `https://${host}${safePath}`;
}

const deviceIcons: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

export default function AnalyticsDashboard() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (p: string) => {
      if (!key) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/analytics/dashboard?period=${p}`, { headers: { Authorization: `Bearer ${key}` } },
        );
        if (res.status === 401) {
          setError("Invalid key");
          setAuthed(false);
          return;
        }
        const json = await res.json();
        setData(json);
        setAuthed(true);
      } catch {
        setError("Failed to fetch analytics");
      } finally {
        setLoading(false);
      }
    },
    [key],
  );

  useEffect(() => {
    if (authed) {
      fetchData(period);
    }
  }, [period, authed, fetchData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(period);
  };

  if (!authed) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <Lock className="h-12 w-12 text-neutral-700 mx-auto mb-6" />
        <h1 className="text-xl font-bold text-white mb-2">Analytics Dashboard</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Enter your analytics key to view site traffic.
        </p>
        <form onSubmit={handleLogin} className="space-y-3">
          <Input
            type="password"
            placeholder="Analytics key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="bg-neutral-900/50 border-neutral-700/50"
          />
          <Button type="submit" className="w-full" disabled={!key}>
            View Analytics
          </Button>
        </form>
        {error && (
          <p className="text-sm text-red-400 mt-3">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">Site traffic overview</p>
        </div>
        <div className="flex gap-2">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-neutral-500">Loading analytics...</p>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Page Views</span>
                </div>
                <span className="text-2xl font-bold text-white">
                  {data.totalViews.toLocaleString()}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">
                    Unique Visitors
                  </span>
                </div>
                <span className="text-2xl font-bold text-white">
                  {data.uniqueVisitors.toLocaleString()}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">
                    Views/Visitor
                  </span>
                </div>
                <span className="text-2xl font-bold text-white">
                  {data.uniqueVisitors > 0
                    ? (data.totalViews / data.uniqueVisitors).toFixed(1)
                    : "0"}
                </span>
              </CardContent>
            </Card>
            <Card className="bg-neutral-900/80">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs text-neutral-500">Countries</span>
                </div>
                <span className="text-2xl font-bold text-white">
                  {data.topCountries.length}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Views by Day Chart (simple bar chart) */}
          {data.viewsByDay.length > 0 && (
            <Card className="bg-neutral-900/80 mb-8">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-neutral-300 mb-4">
                  Views Over Time
                </h3>
                <div className="flex items-end gap-1 h-40">
                  {data.viewsByDay.map((day) => {
                    const maxViews = Math.max(
                      ...data.viewsByDay.map((d) => d.views),
                    );
                    const height =
                      maxViews > 0 ? (day.views / maxViews) * 100 : 0;
                    return (
                      <div
                        key={day.date}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <span className="text-[9px] text-neutral-500">
                          {day.views}
                        </span>
                        <div
                          className="w-full bg-purple-500/60 rounded-t hover:bg-purple-500/80 transition-colors"
                          style={{ height: `${Math.max(height, 2)}%` }}
                          title={`${day.date}: ${day.views} views, ${day.visitors} visitors`}
                        />
                        <span className="text-[8px] text-neutral-600">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Pages */}
            <Card className="bg-neutral-900/80">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-neutral-300 mb-4">
                  Top Pages
                </h3>
                <div className="space-y-2">
                  {data.topPages.slice(0, 10).map((page) => (
                    <div
                      key={page.path}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-neutral-300 truncate mr-4 font-mono text-xs">
                        {page.path}
                      </span>
                      <span className="text-neutral-500 shrink-0">
                        {page.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {data.topPages.length === 0 && (
                    <p className="text-xs text-neutral-600">No data yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Referrers */}
            <Card className="bg-neutral-900/80">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-neutral-300 mb-4">
                  Top Referrers
                </h3>
                <div className="space-y-2">
                  {data.topReferrers.slice(0, 10).map((ref) => (
                    <div
                      key={ref.referrer}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-neutral-300 truncate mr-4 flex items-center gap-1.5">
                        <ArrowRight className="h-3 w-3 text-neutral-600" />
                        {ref.referrer}
                      </span>
                      <span className="text-neutral-500 shrink-0">
                        {ref.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {data.topReferrers.length === 0 && (
                    <p className="text-xs text-neutral-600">
                      No external referrers yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Countries */}
            <Card className="bg-neutral-900/80">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-neutral-300 mb-4">
                  Countries
                </h3>
                <div className="space-y-2">
                  {data.topCountries.slice(0, 10).map((c) => (
                    <div
                      key={c.country}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-neutral-300">{c.country}</span>
                      <span className="text-neutral-500">
                        {c.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {data.topCountries.length === 0 && (
                    <p className="text-xs text-neutral-600">No data yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Devices / Browsers / OS */}
            <Card className="bg-neutral-900/80">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-neutral-300 mb-4">
                  Devices & Browsers
                </h3>

                {/* Devices */}
                <div className="mb-4">
                  <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">
                    Devices
                  </p>
                  <div className="flex gap-4">
                    {data.devices.map((d) => {
                      const Icon = deviceIcons[d.device] ?? Monitor;
                      const pct =
                        data.totalViews > 0
                          ? ((d.count / data.totalViews) * 100).toFixed(0)
                          : "0";
                      return (
                        <div key={d.device} className="text-center">
                          <Icon className="h-5 w-5 text-neutral-400 mx-auto mb-1" />
                          <p className="text-xs text-white font-medium">
                            {pct}%
                          </p>
                          <p className="text-[10px] text-neutral-500 capitalize">
                            {d.device}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Browsers */}
                <div className="mb-4">
                  <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">
                    Browsers
                  </p>
                  <div className="space-y-1">
                    {data.browsers.slice(0, 5).map((b) => (
                      <div
                        key={b.browser}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-neutral-400">{b.browser}</span>
                        <span className="text-neutral-500">
                          {b.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* OS */}
                <div>
                  <p className="text-[10px] text-neutral-600 uppercase tracking-wider mb-2">
                    Operating Systems
                  </p>
                  <div className="space-y-1">
                    {data.operatingSystems.slice(0, 5).map((o) => (
                      <div
                        key={o.os}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-neutral-400">{o.os}</span>
                        <span className="text-neutral-500">
                          {o.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Referring URLs — full-width card. Shows the specific
              external pages that link to us, grouped by (source,
              pathname). Useful for finding "who's recommending us" —
              e.g. which Steam Community group, profile, or forum
              thread is sending traffic. Only populated from the
              2026-04-24 deploy forward since referrerPath is a new
              column. */}
          {data.referrerDetails && data.referrerDetails.length > 0 && (
            <Card className="bg-neutral-900/80 mt-6">
              <CardContent className="p-6">
                <h3 className="text-sm font-medium text-neutral-300 mb-1">
                  Referring URLs
                </h3>
                <p className="text-[11px] text-neutral-500 mb-4">
                  Specific external pages sending traffic. Click a link to open
                  in a new tab — good for finding which Steam group, profile,
                  or forum thread is recommending the site.
                </p>
                <div className="space-y-1.5">
                  {data.referrerDetails.map((row, i) => {
                    const fullUrl = buildFullUrl(row.referrer, row.path);
                    return (
                      <div
                        key={`${row.referrer}-${row.path}-${i}`}
                        className="flex items-center justify-between text-sm gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          {fullUrl ? (
                            <a
                              href={fullUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-neutral-300 hover:text-purple-300 transition-colors flex items-center gap-1.5 font-mono text-xs truncate"
                              title={`${row.referrer}${row.path}`}
                            >
                              <ArrowRight className="h-3 w-3 text-neutral-600 shrink-0" />
                              <span className="text-neutral-500">
                                {row.referrer}
                              </span>
                              <span className="truncate">{row.path}</span>
                            </a>
                          ) : (
                            <span className="text-neutral-300 font-mono text-xs">
                              <span className="text-neutral-500">
                                {row.referrer}
                              </span>
                              {row.path}
                            </span>
                          )}
                        </div>
                        <span className="text-neutral-500 shrink-0 tabular-nums">
                          {row.count.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
