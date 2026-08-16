import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, Radio, RefreshCw } from "lucide-react";
import { Panel, ToolButton } from "@/components/cutlist/fields";
import { reportGeometry } from "@/lib/vault/api";

const SEVERITY = {
  error: { rank: 0, className: "border-red-300 bg-red-50 text-red-800", label: "Error", Icon: AlertTriangle },
  warning: { rank: 1, className: "border-orange-300 bg-orange-50 text-orange-800", label: "Warning", Icon: AlertTriangle },
  info: { rank: 2, className: "border-slate-200 bg-slate-50 text-slate-700", label: "Note", Icon: Info },
};

const KIND_LABEL = {
  size_mismatch: "Artwork does not match its die or mould",
  turned_against_reference: "Artwork turned 90° against its reference",
  die_sizes_disagree: "One die, artworks of different sizes",
  wider_than_press: "Die wider than the press",
  narrower_than_minimum: "Die under the minimum print width",
  repeat_too_short: "Repeat too short for the die's rows",
  artwork_size_missing: "No size recorded",
};

const REFRESH_SECONDS = 20;

/**
 * A live geometric scan: it re-runs on a timer so the board reflects the
 * records as they are edited, rather than a snapshot from whenever the page
 * was opened.
 */
export default function GeometryScan({ tolerance = 0.5 }) {
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(true);
  const [countdown, setCountdown] = useState(REFRESH_SECONDS);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setScan(await reportGeometry(tolerance));
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not run the scan.");
    } finally {
      setBusy(false);
      setCountdown(REFRESH_SECONDS);
    }
  }, [tolerance]);

  useEffect(() => {
    run();
  }, [run]);

  useEffect(() => {
    if (!live) return undefined;
    timer.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          run();
          return REFRESH_SECONDS;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer.current);
  }, [live, run]);

  const issues = [...(scan?.issues || [])].sort(
    (a, b) => (SEVERITY[a.severity]?.rank ?? 3) - (SEVERITY[b.severity]?.rank ?? 3)
  );
  const grouped = issues.reduce((acc, issue) => {
    (acc[issue.kind] = acc[issue.kind] || []).push(issue);
    return acc;
  }, {});

  const counts = scan?.counts || { error: 0, warning: 0, info: 0 };
  const scannedAt = scan?.scanned_at ? new Date(scan.scanned_at) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <Radio className={`h-4 w-4 ${live ? "animate-pulse text-emerald-600" : "text-slate-400"}`} />
          <span className="text-sm font-medium text-slate-800">{live ? "Live" : "Paused"}</span>
          <span className="text-xs text-slate-500">
            {busy
              ? "scanning…"
              : live
                ? `next scan in ${countdown}s`
                : "auto refresh is off"}
            {scannedAt && !busy ? ` · last ${scannedAt.toLocaleTimeString()}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-orange-600"
            />
            Keep scanning
          </label>
          <ToolButton onClick={run} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Scan now
          </ToolButton>
        </div>
      </div>

      {error && <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Artwork scanned</div>
          <div className="font-display text-xl font-semibold tabular-nums text-slate-900">
            {scan?.artworks_checked ?? "—"}
            {scan && scan.artworks_total !== scan.artworks_checked && (
              <span className="ml-1 text-sm font-normal text-slate-400">of {scan.artworks_total}</span>
            )}
          </div>
          <div className="text-xs text-slate-500">± {scan?.tolerance ?? tolerance} mm tolerance</div>
        </div>
        <div className="border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">KLD dies</div>
          <div className="font-display text-xl font-semibold tabular-nums text-slate-900">{scan?.dies_total ?? "—"}</div>
          <div className="text-xs text-slate-500">checked against the press</div>
        </div>
        <div className="border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Errors</div>
          <div className={`font-display text-xl font-semibold tabular-nums ${counts.error ? "text-red-600" : "text-emerald-600"}`}>
            {counts.error}
          </div>
          <div className="text-xs text-slate-500">will not run as recorded</div>
        </div>
        <div className="border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Warnings</div>
          <div className={`font-display text-xl font-semibold tabular-nums ${counts.warning ? "text-orange-600" : "text-emerald-600"}`}>
            {counts.warning}
          </div>
          <div className="text-xs text-slate-500">worth a look</div>
        </div>
      </div>

      {scan && issues.length === 0 && (
        <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          Every artwork matches the die and mould it is patched to, and every die fits the press.
        </div>
      )}

      {Object.entries(grouped).map(([kind, list]) => {
        const severity = SEVERITY[list[0].severity] || SEVERITY.info;
        const { Icon } = severity;
        return (
          <Panel key={kind} title={KIND_LABEL[kind] || kind} subtitle={`${list.length} found`}>
            <ul className="divide-y divide-slate-100">
              {list.map((issue, i) => (
                <li key={i} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-[11px] ${severity.className}`}>
                    <Icon className="h-3 w-3" />
                    {severity.label}
                  </span>
                  <span className="font-medium text-slate-900">{issue.subject}</span>
                  {issue.customer && <span className="text-xs text-slate-500">{issue.customer}</span>}
                  <span className="w-full text-xs text-slate-600 sm:w-auto sm:flex-1">{issue.message}</span>
                  {issue.expected && (
                    <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">
                      expected <strong className="text-slate-700">{issue.expected}</strong> · got{" "}
                      <strong className="text-slate-700">{issue.actual}</strong>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}

      {!scan && !error && (
        <div className="flex items-center gap-2 border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Running the first scan…
        </div>
      )}
    </div>
  );
}
