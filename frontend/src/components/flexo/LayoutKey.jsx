import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Annotated key for the layout terms, shown next to the fields that set them.
 *
 * The drawing is to scale with itself: two lanes across, three rows around,
 * with every labelled distance drawn where it is actually measured.
 */
export default function LayoutKey() {
  const [open, setOpen] = useState(false);

  return (
    <section className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        What these measurements mean
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-3">
          <svg
            viewBox="0 0 900 690"
            className="h-auto w-full"
            role="img"
            aria-label="Annotated web layout: web width, edge margin, gutter across, gap around, label width and height, and the repeat"
          >
            <defs>
              <marker id="lk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>

            <rect x="180" y="80" width="480" height="540" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
            <rect x="180" y="80" width="20" height="540" fill="#fecaca" />
            <rect x="640" y="80" width="20" height="540" fill="#fecaca" />

            <g opacity="0.22">
              <rect x="200" y="510" width="200" height="100" fill="#bfdbfe" stroke="#0f172a" strokeWidth="2" />
              <rect x="440" y="510" width="200" height="100" fill="#bfdbfe" stroke="#0f172a" strokeWidth="2" />
            </g>
            <text x="420" y="588" textAnchor="middle" fontSize="13" fill="#94a3b8">
              next repeat, and the next…
            </text>

            <g fill="#bfdbfe" stroke="#0f172a" strokeWidth="2">
              <rect x="200" y="150" width="200" height="100" />
              <rect x="440" y="150" width="200" height="100" />
              <rect x="200" y="270" width="200" height="100" />
              <rect x="440" y="270" width="200" height="100" />
              <rect x="200" y="390" width="200" height="100" />
              <rect x="440" y="390" width="200" height="100" />
            </g>

            <g stroke="#0f172a" strokeWidth="1.5" color="#0f172a">
              <line x1="212" y1="232" x2="388" y2="232" markerStart="url(#lk-arrow)" markerEnd="url(#lk-arrow)" />
              <line x1="224" y1="162" x2="224" y2="220" markerStart="url(#lk-arrow)" markerEnd="url(#lk-arrow)" />
            </g>
            <text x="300" y="224" textAnchor="middle" fontSize="13" fill="#0f172a">label width</text>
            <text x="238" y="195" fontSize="13" fill="#0f172a">height</text>

            <g stroke="#dc2626" strokeWidth="2.5" strokeDasharray="9 6">
              <line x1="180" y1="140" x2="660" y2="140" />
              <line x1="180" y1="500" x2="660" y2="500" />
            </g>

            <g stroke="#dc2626" strokeWidth="1.5" color="#dc2626">
              <line x1="690" y1="140" x2="690" y2="500" markerStart="url(#lk-arrow)" markerEnd="url(#lk-arrow)" />
              <line x1="678" y1="140" x2="702" y2="140" />
              <line x1="678" y1="500" x2="702" y2="500" />
            </g>
            <text
              x="716"
              y="320"
              textAnchor="middle"
              fontSize="14"
              fontWeight="600"
              fill="#dc2626"
              transform="rotate(-90 716 320)"
            >
              one repeat
            </text>

            <g stroke="#0f172a" strokeWidth="1.5" color="#0f172a">
              <line x1="180" y1="52" x2="660" y2="52" markerStart="url(#lk-arrow)" markerEnd="url(#lk-arrow)" />
              <line x1="180" y1="42" x2="180" y2="80" strokeDasharray="3 3" opacity="0.5" />
              <line x1="660" y1="42" x2="660" y2="80" strokeDasharray="3 3" opacity="0.5" />
            </g>
            <text x="420" y="38" textAnchor="middle" fontSize="15" fontWeight="600" fill="#0f172a">
              web width — what you slit to
            </text>

            <g stroke="#ea580c" strokeWidth="1.5" color="#ea580c">
              <line x1="400" y1="330" x2="440" y2="330" markerStart="url(#lk-arrow)" markerEnd="url(#lk-arrow)" />
              <polyline points="420,120 420,110 760,110" fill="none" />
              <line x1="420" y1="120" x2="420" y2="330" strokeDasharray="3 4" opacity="0.55" />
            </g>
            <text x="768" y="114" fontSize="14" fill="#ea580c">gutter across</text>

            <g stroke="#ea580c" strokeWidth="1.5" color="#ea580c">
              <line x1="300" y1="250" x2="300" y2="270" markerStart="url(#lk-arrow)" markerEnd="url(#lk-arrow)" />
              <polyline points="300,260 150,260" fill="none" />
            </g>
            <text x="142" y="264" textAnchor="end" fontSize="14" fill="#ea580c">
              gap around
            </text>

            <g stroke="#dc2626" strokeWidth="1.5" color="#dc2626">
              <polyline points="190,440 100,440" fill="none" />
            </g>
            <text x="92" y="436" textAnchor="end" fontSize="14" fill="#dc2626">
              edge margin
            </text>
            <text x="92" y="453" textAnchor="end" fontSize="12" fill="#64748b">
              (both sides)
            </text>

            <text x="300" y="672" textAnchor="middle" fontSize="13" fill="#64748b">
              lane 1
            </text>
            <text x="540" y="672" textAnchor="middle" fontSize="13" fill="#64748b">
              lane 2
            </text>
            <g stroke="#64748b" strokeWidth="1.2" opacity="0.7" color="#64748b">
              <line x1="200" y1="640" x2="400" y2="640" markerStart="url(#lk-arrow)" markerEnd="url(#lk-arrow)" />
              <line x1="440" y1="640" x2="640" y2="640" markerStart="url(#lk-arrow)" markerEnd="url(#lk-arrow)" />
            </g>
          </svg>

          <dl className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
            <div>
              <dt className="inline font-semibold text-slate-800 dark:text-slate-200">Gap around costs almost nothing.</dt>{" "}
              <dd className="inline">
                You set the minimum; the real gap grows so the rows fill the repeat exactly, because the cylinder must
                come back to the same place.
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-800 dark:text-slate-200">Gutter and edge margin cost width.</dt>{" "}
              <dd className="inline">
                Both are paid for on every metre of the run. More lanes spread the fixed edge margin over more labels.
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
