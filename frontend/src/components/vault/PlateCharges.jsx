import React from "react";
import { Panel } from "@/components/cutlist/fields";
import { formatMoney } from "@/lib/vault/api";

const POLICY_LABEL = {
  none: "Absorbed",
  full: "Charged in full",
  percent: "Part charged",
  refundable: "Refundable",
};

const qty = (n) => (n ? Number(n).toLocaleString("en-IN") : "—");

/**
 * Both sides of every plate's money: what the vendor charged us against what
 * the customer was charged for it, and what is still owed back on the plates
 * that are refundable.
 */
export default function PlateCharges({ data, rates }) {
  if (!data) return null;
  const { items = [], totals = {}, refunds_due: refunds = [], absorbed = [] } = data;
  const r = rates?.rates;

  const cards = [
    { label: "Cost to company", value: totals.cost_to_company_minor },
    { label: "Charged to customers", value: totals.cost_to_customer_minor },
    { label: "Refunds outstanding", value: totals.refund_outstanding_minor },
    { label: "Net cost to company", value: totals.net_to_company_minor },
  ];

  return (
    <Panel title="Plate charges" subtitle="Cost to company against cost to customer, plate by plate">
      {r && (
        <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          The shop quotes at <strong>₹{r.plateRatePerCm2}/cm²</strong> for plates and{" "}
          <strong>
            {r.film.mode === "per_kg" ? `₹${r.film.ratePerKg}/kg` : `₹${r.film.ratePerSqm}/m²`}
          </strong>{" "}
          for {r.film.material || "film"} at {r.film.micron} micron.
          {rates.updated_by ? ` Set by ${rates.updated_by}.` : ""}
          {!rates.set && " Nobody has set these yet — the optimiser is using its defaults."}{" "}
          <a href="/flexo" className="text-orange-700 underline-offset-2 hover:underline">
            Change them in the optimiser
          </a>
          .
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 border-b border-slate-100 p-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{c.label}</dt>
            <dd className="truncate text-base font-semibold tabular-nums">{formatMoney(c.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 text-left font-medium">Plate</th>
              <th className="px-2 py-1.5 text-left font-medium">Artwork</th>
              <th className="px-2 py-1.5 text-left font-medium">KLD</th>
              <th className="px-2 py-1.5 text-left font-medium">Policy</th>
              <th className="px-2 py-1.5 text-right font-medium">To company</th>
              <th className="px-2 py-1.5 text-right font-medium">To customer</th>
              <th className="px-2 py-1.5 text-right font-medium">Run</th>
              <th className="px-2 py-1.5 text-right font-medium">Refund due</th>
              <th className="px-2 py-1.5 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5 font-medium">{p.plate_number}</td>
                <td className="px-2 py-1.5">{p.artwork_label || "—"}</td>
                <td className="px-2 py-1.5">{p.kld_label || p.kld_number || p.mould_code || "—"}</td>
                <td className="px-2 py-1.5 text-xs">
                  {POLICY_LABEL[p.charge_policy] || p.charge_policy}
                  {p.charge_policy === "percent" && p.charge_percent ? ` (${p.charge_percent}%)` : ""}
                  {p.charge_customer_name && (
                    <span className="block text-[11px] text-slate-500">{p.charge_customer_name}</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(p.cost_to_company_minor)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(p.cost_to_customer_minor)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {qty(p.delivered_qty)}
                  {p.refund_after_qty ? (
                    <span className="block text-[11px] text-slate-500">of {qty(p.refund_after_qty)}</span>
                  ) : null}
                </td>
                <td
                  className={`px-2 py-1.5 text-right tabular-nums ${
                    p.refund_outstanding_minor > 0 ? "font-semibold text-orange-700" : "text-slate-400"
                  }`}
                >
                  {p.refund_outstanding_minor > 0 ? formatMoney(p.refund_outstanding_minor) : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(p.net_to_company_minor)}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-xs text-slate-500">
                  No plates recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(refunds.length > 0 || absorbed.length > 0) && (
        <footer className="space-y-1 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {refunds.length > 0 && (
            <p className="text-orange-700">
              {refunds.length} plate{refunds.length === 1 ? " has" : "s have"} passed the refund quantity and
              still owe a credit: {refunds.map((p) => p.plate_number).join(", ")}
            </p>
          )}
          {absorbed.length > 0 && (
            <p>
              Absorbed, never billed on: {absorbed.map((p) => p.plate_number).join(", ")} —{" "}
              {formatMoney(absorbed.reduce((s, p) => s + (p.cost_to_company_minor || 0), 0))} in all.
            </p>
          )}
        </footer>
      )}
    </Panel>
  );
}
