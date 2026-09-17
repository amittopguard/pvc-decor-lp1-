import React, { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Panel, ToolButton, IconButton } from "@/components/cutlist/fields";
import { errorText, fromMinor, toMinor, formatMoney } from "@/lib/vault/api";

const inputClass =
  "w-full border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none " +
  "focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30";

const PAID_BY = [
  { id: "us", label: "Us" },
  { id: "customer", label: "Customer" },
  { id: "moulder", label: "Moulder" },
  { id: "vendor", label: "Vendor" },
  { id: "other", label: "Other" },
];

const CHARGE_POLICIES = [
  { id: "full", label: "Charge in full", hint: "The whole plate cost goes on the customer's bill." },
  { id: "none", label: "Do not charge", hint: "We absorb the plate — it stays a cost to the company." },
  { id: "percent", label: "Charge a share", hint: "Only part of the plate is billed on." },
  {
    id: "refundable",
    label: "Charge, refund after a quantity",
    hint: "Billed up front and credited back once the customer has taken the agreed quantity.",
  },
];

const emptyPlate = () => ({
  plate_number: "",
  vendor_id: "",
  die_id: "",
  mould_id: "",
  made_on: "",
  repeat_mm: "",
  web_width: "",
  colours: "",
  plate_sets: "",
  artwork_label: "",
  kld_label: "",
  actual_cost: "",
  paid_by: "",
  paid_by_note: "",
  charge_policy: "full",
  charge_percent: "50",
  charge_customer_id: "",
  charged: "",
  refund_after_qty: "",
  refunded: "",
  status: "",
  notes: "",
  lines: [],
});

/**
 * A plate and the artworks on it. The lines are the point of this screen —
 * one plate carries many artworks, and each line holds that artwork's share
 * of the plate cost.
 */
export default function PlateEditor({
  plate,
  artworks,
  vendors,
  dies,
  moulds = [],
  customers = [],
  onSave,
  onCancel,
  onDelete,
}) {
  const [form, setForm] = useState(() => {
    if (!plate) return emptyPlate();
    return {
      plate_number: plate.plate_number ?? "",
      vendor_id: plate.vendor_id ?? "",
      die_id: plate.die_id ?? "",
      mould_id: plate.mould_id ?? "",
      made_on: plate.made_on ?? "",
      repeat_mm: plate.repeat_mm ?? "",
      web_width: plate.web_width ?? "",
      colours: plate.colours ?? "",
      plate_sets: plate.plate_sets ?? "",
      artwork_label: plate.artwork_label ?? "",
      kld_label: plate.kld_label ?? "",
      actual_cost: fromMinor(plate.actual_cost_minor),
      paid_by: plate.paid_by ?? "",
      paid_by_note: plate.paid_by_note ?? "",
      charge_policy: plate.charge_policy ?? "full",
      charge_percent: plate.charge_percent ?? 50,
      charge_customer_id: plate.charge_customer_id ?? "",
      charged: fromMinor(plate.charged_minor),
      refund_after_qty: plate.refund_after_qty ?? "",
      refunded: fromMinor(plate.refunded_minor),
      status: plate.status ?? "",
      notes: plate.notes ?? "",
      lines: (plate.lines || []).map((l) => ({
        artwork_id: l.artwork_id,
        ups: l.ups ?? "",
        position: l.position ?? "",
        cost_share: fromMinor(l.cost_share_minor),
      })),
    };
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLine = (i, patch) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  const used = new Set(form.lines.map((l) => l.artwork_id));
  const available = artworks.filter((a) => !used.has(a.id));

  const costMinor = toMinor(form.actual_cost);
  const sharedMinor = form.lines.reduce((s, l) => s + (toMinor(l.cost_share) || 0), 0);
  const balanced = costMinor === null || costMinor === sharedMinor;

  // The customer side of the same plate, worked out the same way the backend
  // does it so the screen and the report never disagree.
  const policy = form.charge_policy || "full";
  const negotiated = toMinor(form.charged);
  const chargedMinor =
    negotiated !== null
      ? negotiated
      : policy === "none"
      ? 0
      : policy === "percent"
      ? Math.round(((costMinor || 0) * (parseFloat(form.charge_percent) || 0)) / 100)
      : costMinor || 0;
  const refundedMinor = toMinor(form.refunded) || 0;
  const netMinor = (costMinor || 0) - chargedMinor + refundedMinor;
  const delivered = plate?.charge?.delivered_qty ?? 0;
  const threshold = parseInt(form.refund_after_qty, 10) || 0;
  const refundReady = policy === "refundable" && threshold > 0 && delivered >= threshold;

  const splitEvenly = () => {
    if (costMinor === null || !form.lines.length) return;
    const each = Math.floor(costMinor / form.lines.length);
    const remainder = costMinor - each * form.lines.length;
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => ({ ...l, cost_share: fromMinor(each + (i === 0 ? remainder : 0)) })),
    }));
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave({
        plate_number: form.plate_number.trim(),
        vendor_id: form.vendor_id || null,
        die_id: form.die_id || null,
        mould_id: form.mould_id || null,
        made_on: form.made_on || null,
        repeat_mm: form.repeat_mm === "" ? null : parseFloat(form.repeat_mm),
        web_width: form.web_width === "" ? null : parseFloat(form.web_width),
        colours: form.colours === "" ? null : parseInt(form.colours, 10),
        plate_sets: form.plate_sets === "" ? null : parseInt(form.plate_sets, 10),
        artwork_label: form.artwork_label.trim() || null,
        kld_label: form.kld_label.trim() || null,
        actual_cost_minor: costMinor,
        currency: "INR",
        paid_by: form.paid_by || null,
        paid_by_note: form.paid_by_note || null,
        charge_policy: policy,
        charge_percent: policy === "percent" ? parseFloat(form.charge_percent) || 0 : null,
        charge_customer_id: form.charge_customer_id || null,
        charged_minor: negotiated,
        refund_after_qty: policy === "refundable" ? threshold || null : null,
        refunded_minor: toMinor(form.refunded),
        status: form.status || null,
        notes: form.notes || null,
        lines: form.lines.map((l) => ({
          artwork_id: l.artwork_id,
          ups: l.ups === "" ? null : parseInt(l.ups, 10),
          position: l.position || null,
          cost_share_minor: toMinor(l.cost_share),
        })),
      });
    } catch (e) {
      setError(errorText(e, "Could not save the plate"));
    } finally {
      setSaving(false);
    }
  };

  const artworkLabel = (id) => {
    const a = artworks.find((x) => x.id === id);
    return a ? `${a.code}${a.name ? ` — ${a.name}` : ""}` : id;
  };

  return (
    <Panel
      title={plate ? `Plate ${plate.plate_number}` : "New plate"}
      subtitle="One plate can carry many artworks"
      actions={
        <IconButton onClick={onCancel} title="Close">
          <X className="h-4 w-4" />
        </IconButton>
      }
    >
      {error && <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Plate number *</span>
          <input
            className={inputClass}
            aria-label="Plate number"
            value={form.plate_number}
            onChange={(e) => set({ plate_number: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Vendor</span>
          <select
            className={inputClass}
            aria-label="Plate vendor"
            value={form.vendor_id}
            onChange={(e) => set({ vendor_id: e.target.value })}
          >
            <option value="">—</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">KLD / die</span>
          <select
            className={inputClass}
            aria-label="Plate KLD die"
            value={form.die_id}
            onChange={(e) => set({ die_id: e.target.value })}
          >
            <option value="">—</option>
            {dies.map((d) => (
              <option key={d.id} value={d.id}>
                {d.kld_number}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Mould</span>
          <select
            className={inputClass}
            aria-label="Plate mould"
            value={form.mould_id}
            onChange={(e) => set({ mould_id: e.target.value })}
          >
            <option value="">—</option>
            {moulds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.mould_code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Made on</span>
          <input
            className={inputClass}
            type="date"
            aria-label="Plate made on"
            value={form.made_on}
            onChange={(e) => set({ made_on: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Colours</span>
          <input
            className={inputClass}
            inputMode="numeric"
            aria-label="Plate colours"
            value={form.colours}
            onChange={(e) => set({ colours: e.target.value })}
            placeholder="4"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Plate sets</span>
          <input
            className={inputClass}
            inputMode="numeric"
            aria-label="Plate sets"
            value={form.plate_sets}
            onChange={(e) => set({ plate_sets: e.target.value })}
            placeholder="1"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-slate-700">Artwork name on the plate</span>
          <input
            className={inputClass}
            aria-label="Artwork name on the plate"
            value={form.artwork_label}
            onChange={(e) => set({ artwork_label: e.target.value })}
            placeholder="Left blank, taken from the artworks below"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Reference KLD on the plate</span>
          <input
            className={inputClass}
            aria-label="Reference KLD on the plate"
            value={form.kld_label}
            onChange={(e) => set({ kld_label: e.target.value })}
            placeholder="Taken from the KLD above"
          />
        </label>
      </div>

      <div className="border-t border-slate-100">
        <h3 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          What the plate costs, and who carries it
        </h3>
        <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Actual cost — to company (₹)</span>
            <input
              className={inputClass}
              inputMode="decimal"
              aria-label="Plate actual cost"
              value={form.actual_cost}
              onChange={(e) => set({ actual_cost: e.target.value })}
              placeholder="0.00"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Invoice paid by</span>
            <select
              className={inputClass}
              aria-label="Plate cost paid by"
              value={form.paid_by}
              onChange={(e) => set({ paid_by: e.target.value })}
            >
              <option value="">—</option>
              {PAID_BY.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {form.paid_by === "other" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Who paid</span>
              <input
                className={inputClass}
                aria-label="Who paid for the plate"
                value={form.paid_by_note}
                onChange={(e) => set({ paid_by_note: e.target.value })}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Charged to</span>
            <select
              className={inputClass}
              aria-label="Plate charged to customer"
              value={form.charge_customer_id}
              onChange={(e) => set({ charge_customer_id: e.target.value })}
            >
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Charging policy</span>
            <select
              className={inputClass}
              aria-label="Plate charging policy"
              value={policy}
              onChange={(e) => set({ charge_policy: e.target.value })}
            >
              {CHARGE_POLICIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500">
              {CHARGE_POLICIES.find((p) => p.id === policy)?.hint}
            </span>
          </label>
          {policy === "percent" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-700">Share charged (%)</span>
              <input
                className={inputClass}
                inputMode="decimal"
                aria-label="Share of the plate charged"
                value={form.charge_percent}
                onChange={(e) => set({ charge_percent: e.target.value })}
              />
            </label>
          )}
          {policy === "refundable" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">Refund after quantity</span>
                <input
                  className={inputClass}
                  inputMode="numeric"
                  aria-label="Refund the plate after this quantity"
                  value={form.refund_after_qty}
                  onChange={(e) => set({ refund_after_qty: e.target.value })}
                  placeholder="100000"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-700">Refunded so far (₹)</span>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  aria-label="Plate amount already refunded"
                  value={form.refunded}
                  onChange={(e) => set({ refunded: e.target.value })}
                  placeholder="0.00"
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">Charged (₹, overrides the policy)</span>
            <input
              className={inputClass}
              inputMode="decimal"
              aria-label="Plate amount charged to the customer"
              value={form.charged}
              onChange={(e) => set({ charged: e.target.value })}
              placeholder={fromMinor(chargedMinor)}
            />
          </label>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50 px-3 py-2 text-xs md:grid-cols-4">
          <div>
            <dt className="text-slate-500">Cost to company</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(costMinor)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Cost to customer</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(chargedMinor)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Net to company</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(netMinor)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Run off this plate</dt>
            <dd className="tabular-nums">
              {delivered.toLocaleString("en-IN")}
              {policy === "refundable" && threshold > 0 ? ` of ${threshold.toLocaleString("en-IN")}` : ""}
            </dd>
          </div>
          {refundReady && refundedMinor < chargedMinor && (
            <div className="col-span-2 md:col-span-4">
              <span className="text-orange-700">
                The refund quantity has been reached — {formatMoney(chargedMinor - refundedMinor)} is due back.
              </span>
            </div>
          )}
        </dl>
      </div>

      <div className="border-t border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Artworks on this plate ({form.lines.length})
          </h3>
          <div className="flex items-center gap-2">
            <ToolButton onClick={splitEvenly} disabled={costMinor === null || !form.lines.length}>
              Split cost evenly
            </ToolButton>
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 text-left font-medium">Artwork</th>
                <th className="w-20 px-2 py-1.5 text-left font-medium">Ups</th>
                <th className="w-24 px-2 py-1.5 text-left font-medium">Position</th>
                <th className="w-32 px-2 py-1.5 text-left font-medium">Cost share (₹)</th>
                <th className="w-10 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, i) => (
                <tr key={`${line.artwork_id}-${i}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1 text-slate-800">{artworkLabel(line.artwork_id)}</td>
                  <td className="p-1">
                    <input className={inputClass} inputMode="numeric" value={line.ups} onChange={(e) => setLine(i, { ups: e.target.value })} />
                  </td>
                  <td className="p-1">
                    <input className={inputClass} value={line.position} onChange={(e) => setLine(i, { position: e.target.value })} />
                  </td>
                  <td className="p-1">
                    <input className={inputClass} inputMode="decimal" value={line.cost_share} onChange={(e) => setLine(i, { cost_share: e.target.value })} />
                  </td>
                  <td className="px-1 text-right">
                    <IconButton
                      onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))}
                      title="Remove from plate"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </td>
                </tr>
              ))}
              {!form.lines.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-center text-xs text-slate-500">
                    No artworks on this plate yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
          <select
            className={`${inputClass} max-w-xs`}
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setForm((f) => ({
                ...f,
                lines: [...f.lines, { artwork_id: e.target.value, ups: "", position: "", cost_share: "" }],
              }));
            }}
            aria-label="Add artwork to plate"
          >
            <option value="">Add an artwork…</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code}
                {a.name ? ` — ${a.name}` : ""}
              </option>
            ))}
          </select>
          <Plus className="h-4 w-4 text-slate-400" />
          {!available.length && <span className="text-xs text-slate-500">Every artwork is already on this plate.</span>}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
        <span className={`text-xs ${balanced ? "text-slate-600" : "text-orange-700"}`}>
          Shares {formatMoney(sharedMinor)} of {costMinor === null ? "—" : formatMoney(costMinor)}
          {!balanced && costMinor !== null && " — these do not add up"}
        </span>
        <div className="flex items-center gap-2">
          {plate && (
            <ToolButton onClick={() => onDelete(plate.id)} title="Delete this plate">
              <Trash2 className="h-4 w-4" /> Delete
            </ToolButton>
          )}
          <ToolButton onClick={onCancel}>Cancel</ToolButton>
          <ToolButton variant="primary" onClick={save} disabled={saving || !form.plate_number.trim()}>
            {saving ? "Saving…" : "Save plate"}
          </ToolButton>
        </div>
      </footer>
    </Panel>
  );
}
