import React from "react";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { Panel, ToolButton } from "@/components/cutlist/fields";
import { downloadWithToken, formatMoney } from "@/lib/vault/api";

function Stat({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-orange-600",
    bad: "text-red-600",
  };
  return (
    <div className="border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`font-display text-xl font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function SimpleTable({ head, rows, empty, minWidth = 520 }) {
  if (!rows.length) {
    return <p className="px-3 py-3 text-xs text-slate-500">{empty}</p>;
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-xs" style={{ minWidth: minWidth ? `${minWidth}px` : undefined }}>
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            {head.map((h) => (
              <th key={h.key} className={`px-2 py-1.5 font-medium ${h.align === "right" ? "text-right" : "text-left"}`}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {head.map((h) => (
                <td
                  key={h.key}
                  className={`px-2 py-1 ${h.align === "right" ? "text-right tabular-nums" : ""} ${row._tone || ""}`}
                >
                  {row[h.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VaultReports({ artworks, kld, reconciliation, cost }) {
  const unplated = reconciliation?.unplated_artworks || [];
  const emptyPlates = reconciliation?.empty_plates || [];
  const mismatches = reconciliation?.kld_mismatches || [];
  const clean = !unplated.length && !emptyPlates.length && !mismatches.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Artworks" value={artworks.length} sub={`${artworks.filter((a) => a.plate_count > 0).length} on a plate`} />
        <Stat label="KLD dies" value={kld.length} sub={`${kld.reduce((s, d) => s + (d.artwork_count || 0), 0)} artworks patched`} />
        <Stat
          label="Plate spend"
          value={formatMoney(cost?.total?.total_minor ?? 0)}
          sub={`${cost?.total?.plates ?? 0} plates`}
        />
        <Stat
          label="Unplated"
          value={unplated.length}
          tone={unplated.length ? "warn" : "good"}
          sub="artwork with no plate"
        />
        <Stat
          label="KLD mismatch"
          value={mismatches.length}
          tone={mismatches.length ? "bad" : "good"}
          sub="artwork vs plate KLD"
        />
      </div>

      <Panel
        title="Artwork, customer-wise"
        subtitle="Every artwork with its KLD, mould, plates and files"
        actions={
          <ToolButton onClick={() => downloadWithToken("/vault/reports/artworks.csv", "artworks.csv")}>
            <Download className="h-4 w-4" /> CSV
          </ToolButton>
        }
      >
        <SimpleTable
          head={[
            { key: "customer_name", label: "Customer" },
            { key: "code", label: "Artwork" },
            { key: "name", label: "Name" },
            { key: "kld_number", label: "KLD" },
            { key: "mould_code", label: "Mould" },
            { key: "moulder_name", label: "Moulder" },
            { key: "plate_count", label: "Plates", align: "right" },
            { key: "file_count", label: "Files", align: "right" },
          ]}
          rows={artworks}
          empty="No artworks yet."
        />
      </Panel>

      <Panel title="KLD-wise" subtitle="Which artworks are patched to each die">
        {kld.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-500">No KLD dies yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {kld.map((die) => (
              <div key={die.id} className="px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-900">
                    {die.kld_number}
                    {die.name ? <span className="ml-2 text-xs font-normal text-slate-500">{die.name}</span> : null}
                  </span>
                  <span className="text-xs text-slate-500">
                    <strong className="tabular-nums text-slate-800">{die.artwork_count}</strong> artworks ·{" "}
                    <strong className="tabular-nums text-slate-800">{die.plate_count}</strong> plates
                  </span>
                </div>
                {die.artworks?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {die.artworks.map((a) => (
                      <span key={a.id} className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-700">
                        {a.code}
                        {a.customer_name ? <span className="text-slate-400"> · {a.customer_name}</span> : null}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Artwork vs artwork of plate" subtitle="What is on record against what is actually on a plate">
        {clean ? (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Everything reconciles — every artwork is on a plate, every plate carries artwork, and no KLD disagrees.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {unplated.length > 0 && (
              <div className="px-3 py-2">
                <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> Artwork with no plate ({unplated.length})
                </h4>
                <SimpleTable
                  head={[
                    { key: "customer_name", label: "Customer" },
                    { key: "code", label: "Artwork" },
                    { key: "name", label: "Name" },
                    { key: "kld_number", label: "KLD" },
                  ]}
                  rows={unplated}
                  empty=""
                />
              </div>
            )}
            {emptyPlates.length > 0 && (
              <div className="px-3 py-2">
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Plates carrying nothing ({emptyPlates.length})
                </h4>
                <SimpleTable
                  head={[
                    { key: "plate_number", label: "Plate" },
                    { key: "vendor_name", label: "Vendor" },
                  ]}
                  rows={emptyPlates}
                  empty=""
                />
              </div>
            )}
            {mismatches.length > 0 && (
              <div className="px-3 py-2">
                <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> Artwork whose KLD differs from the plate's ({mismatches.length})
                </h4>
                <SimpleTable
                  head={[
                    { key: "plate_number", label: "Plate" },
                    { key: "artwork_code", label: "Artwork" },
                    { key: "plate_kld", label: "Plate KLD" },
                    { key: "artwork_kld", label: "Artwork KLD" },
                  ]}
                  rows={mismatches.map((m) => ({ ...m, _tone: "text-red-700" }))}
                  empty=""
                />
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Plate cost" subtitle="Actual cost by who paid, by vendor, and per customer">
        <div className="grid gap-3 p-3 md:grid-cols-3">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Paid by</h4>
            <SimpleTable
              head={[
                { key: "paid_by", label: "Party" },
                { key: "plates", label: "Plates", align: "right" },
                { key: "total", label: "Cost", align: "right" },
              ]}
              rows={(cost?.by_payer || []).map((r) => ({ ...r, total: formatMoney(r.total_minor) }))}
              empty="No plates yet."
              minWidth={0}
            />
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">By vendor</h4>
            <SimpleTable
              head={[
                { key: "vendor", label: "Vendor" },
                { key: "plates", label: "Plates", align: "right" },
                { key: "total", label: "Cost", align: "right" },
              ]}
              rows={(cost?.by_vendor || []).map((r) => ({ ...r, total: formatMoney(r.total_minor) }))}
              empty="No plates yet."
              minWidth={0}
            />
          </div>
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Per customer</h4>
            <SimpleTable
              head={[
                { key: "customer", label: "Customer" },
                { key: "plates", label: "Plates", align: "right" },
                { key: "share", label: "Share", align: "right" },
              ]}
              rows={(cost?.by_customer || []).map((r) => ({ ...r, share: formatMoney(r.share_minor) }))}
              empty="No plate lines yet."
              minWidth={0}
            />
          </div>
        </div>
        {(cost?.unbalanced_plates || []).length > 0 && (
          <div className="border-t border-slate-100 px-3 py-2">
            <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Plates whose shares do not add up ({cost.unbalanced_plates.length})
            </h4>
            <SimpleTable
              head={[
                { key: "plate_number", label: "Plate" },
                { key: "cost", label: "Plate cost", align: "right" },
                { key: "shared", label: "Shares total", align: "right" },
              ]}
              rows={cost.unbalanced_plates.map((p) => ({
                ...p,
                cost: formatMoney(p.actual_cost_minor),
                shared: formatMoney(p.shared_minor),
              }))}
              empty=""
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
