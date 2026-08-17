import React, { useMemo, useState } from "react";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { Panel, ToolButton, IconButton } from "@/components/cutlist/fields";

const inputClass =
  "w-full border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none " +
  "focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30";

/**
 * The order's journey. CRM raises it, design takes it up and signs it off, and
 * only then is a plate ordered against it.
 */
export const STAGES = [
  { id: "crm_raised", label: "CRM raised", owner: "CRM" },
  { id: "design_wip", label: "With design", owner: "Design" },
  { id: "design_done", label: "Design done", owner: "Design" },
  { id: "plate_ordered", label: "Plate ordered", owner: "Design" },
  { id: "running", label: "Running", owner: "Production" },
  { id: "closed", label: "Closed", owner: "—" },
];

const stageOf = (id) => STAGES.find((s) => s.id === id) || STAGES[0];

const STAGE_TONE = {
  crm_raised: "bg-slate-100 text-slate-700",
  design_wip: "bg-amber-100 text-amber-800",
  design_done: "bg-sky-100 text-sky-800",
  plate_ordered: "bg-indigo-100 text-indigo-800",
  running: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-600",
};

const emptyOrder = () => ({
  order_number: "",
  customer_id: "",
  artwork_id: "",
  die_id: "",
  plate_id: "",
  parent_order_id: "",
  quantity: "",
  colours: "",
  ordered_on: "",
  due_on: "",
  status: "crm_raised",
  raised_by: "",
  assigned_to: "",
  design_notes: "",
  notes: "",
});

const fromOrder = (o) => ({
  ...emptyOrder(),
  ...Object.fromEntries(Object.keys(emptyOrder()).map((k) => [k, o[k] ?? ""])),
  status: o.status || "crm_raised",
});

function OrderForm({ draft, setDraft, customers, artworks, dies, plates, orders, onSave, onCancel, saving }) {
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const field = (key, label, extra = {}) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        className={inputClass}
        aria-label={label}
        value={draft[key]}
        onChange={(e) => set({ [key]: e.target.value })}
        {...extra}
      />
    </label>
  );
  const select = (key, label, items, render) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <select className={inputClass} aria-label={label} value={draft[key]} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">—</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {render(i)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
        {field("order_number", "Order number *")}
        {select("customer_id", "Customer", customers, (c) => c.name)}
        {field("quantity", "Quantity", { inputMode: "numeric" })}
        {field("colours", "Colours", { inputMode: "numeric" })}
        {select("artwork_id", "Artwork", artworks, (a) => `${a.code}${a.name ? ` — ${a.name}` : ""}`)}
        {select("die_id", "KLD", dies, (d) => d.kld_number)}
        {select("plate_id", "Plate", plates, (p) => p.plate_number)}
        {select("parent_order_id", "Repeat of", orders, (o) => o.order_number)}
        {field("ordered_on", "Ordered on", { type: "date" })}
        {field("due_on", "Due on", { type: "date" })}
        {field("raised_by", "Raised by (CRM)")}
        {field("assigned_to", "With (design)")}
        <label className="col-span-2 flex flex-col gap-1 md:col-span-4">
          <span className="text-xs font-medium text-slate-700">Notes for design</span>
          <input
            className={inputClass}
            aria-label="Notes for design"
            value={draft.design_notes}
            onChange={(e) => set({ design_notes: e.target.value })}
          />
        </label>
      </div>
      {draft.parent_order_id && (
        <p className="px-3 pb-2 text-[11px] text-slate-500">
          A repeat takes the original's customer, artwork, KLD and plate unless you set them here.
        </p>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-3 py-2">
        <ToolButton onClick={onCancel}>Cancel</ToolButton>
        <ToolButton variant="primary" onClick={onSave} disabled={saving || !draft.order_number.trim()}>
          {saving ? "Saving…" : "Save order"}
        </ToolButton>
      </div>
    </div>
  );
}

/**
 * The CRM-to-design board. CRM raises the order here, design picks it up in the
 * same screen, and repeats hang off the order they repeat rather than starting
 * a fresh record with no history.
 */
export default function OrderBoard({
  orders,
  board,
  customers,
  artworks,
  dies,
  plates,
  busy,
  onCreate,
  onUpdate,
  onStatus,
  onDelete,
}) {
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");

  const counts = board?.counts || {};
  const shown = useMemo(
    () => (filter ? orders.filter((o) => (o.status || "crm_raised") === filter) : orders),
    [orders, filter]
  );

  const toPayload = (d) => ({
    order_number: d.order_number.trim(),
    customer_id: d.customer_id || null,
    artwork_id: d.artwork_id || null,
    die_id: d.die_id || null,
    plate_id: d.plate_id || null,
    parent_order_id: d.parent_order_id || null,
    quantity: d.quantity === "" ? null : parseInt(d.quantity, 10),
    colours: d.colours === "" ? null : parseInt(d.colours, 10),
    ordered_on: d.ordered_on || null,
    due_on: d.due_on || null,
    status: d.status || "crm_raised",
    raised_by: d.raised_by || null,
    assigned_to: d.assigned_to || null,
    design_notes: d.design_notes || null,
    notes: d.notes || null,
  });

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      if (editing) await onUpdate(editing, toPayload(draft));
      else await onCreate(toPayload(draft));
      setDraft(null);
      setEditing(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Could not save the order");
    } finally {
      setSaving(false);
    }
  };

  const advance = async (order, status) => {
    setError(null);
    try {
      await onStatus(order.id, { status });
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not move the order");
    }
  };

  const nextStage = (order) => {
    const i = STAGES.findIndex((s) => s.id === (order.status || "crm_raised"));
    return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
  };

  return (
    <Panel
      title="Orders"
      subtitle="CRM raises the order, design works it, repeats stay tied to the original"
      actions={
        <ToolButton
          variant="primary"
          onClick={() => {
            setEditing(null);
            setDraft(emptyOrder());
          }}
        >
          <Plus className="h-4 w-4" /> New order
        </ToolButton>
      }
    >
      {error && <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {draft && (
        <OrderForm
          draft={draft}
          setDraft={setDraft}
          customers={customers}
          artworks={artworks}
          dies={dies}
          plates={plates}
          orders={orders.filter((o) => o.id !== editing)}
          onSave={save}
          onCancel={() => {
            setDraft(null);
            setEditing(null);
          }}
          saving={saving}
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={() => setFilter("")}
          className={`border px-2 py-1 text-xs ${
            filter === "" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-300 text-slate-600"
          }`}
        >
          All ({orders.length})
        </button>
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setFilter(filter === s.id ? "" : s.id)}
            className={`border px-2 py-1 text-xs ${
              filter === s.id ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-300 text-slate-600"
            }`}
          >
            {s.label} ({counts[s.id] ?? 0})
          </button>
        ))}
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-1.5 text-left font-medium">Order</th>
              <th className="px-2 py-1.5 text-left font-medium">Customer</th>
              <th className="px-2 py-1.5 text-left font-medium">Artwork</th>
              <th className="px-2 py-1.5 text-left font-medium">Plate</th>
              <th className="px-2 py-1.5 text-right font-medium">Qty</th>
              <th className="px-2 py-1.5 text-left font-medium">Stage</th>
              <th className="px-2 py-1.5 text-left font-medium">With</th>
              <th className="px-2 py-1.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => {
              const stage = stageOf(o.status);
              const next = nextStage(o);
              return (
                <tr key={o.id} className="border-b border-slate-100 last:border-0 align-top hover:bg-orange-50/40">
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      className="font-medium text-orange-700 underline-offset-2 hover:underline"
                      onClick={() => {
                        setEditing(o.id);
                        setDraft(fromOrder(o));
                      }}
                    >
                      {o.order_number}
                    </button>
                    {o.parent_order_number && (
                      <span className="block text-[11px] text-slate-500">repeat of {o.parent_order_number}</span>
                    )}
                    {o.repeat_count > 0 && (
                      <span className="block text-[11px] text-slate-500">{o.repeat_count} repeats</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{o.customer_name || "—"}</td>
                  <td className="px-2 py-1.5">
                    {o.artwork_code || <span className="text-orange-700">not attached</span>}
                    {o.kld_number && <span className="block text-[11px] text-slate-500">{o.kld_number}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {o.plate_number || "—"}
                    {o.artwork_label && <span className="block text-[11px] text-slate-500">{o.artwork_label}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {o.quantity ? Number(o.quantity).toLocaleString("en-IN") : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`inline-block px-1.5 py-0.5 text-[11px] ${STAGE_TONE[stage.id]}`}>
                      {stage.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-600">
                    {o.assigned_to || o.raised_by || stage.owner}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      {next && (
                        <ToolButton onClick={() => advance(o, next.id)} disabled={busy}>
                          {next.label}
                        </ToolButton>
                      )}
                      <IconButton
                        title="Raise a repeat of this order"
                        onClick={() => {
                          setEditing(null);
                          setDraft({
                            ...emptyOrder(),
                            order_number: `${o.order_number}-R${(o.repeat_count || 0) + 1}`,
                            parent_order_id: o.id,
                            quantity: o.quantity ?? "",
                          });
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        title="Delete this order"
                        onClick={async () => {
                          setError(null);
                          try {
                            await onDelete(o.id);
                          } catch (e) {
                            setError(e?.response?.data?.detail || "Could not delete the order");
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-xs text-slate-500">
                  {orders.length ? "Nothing at this stage." : "No orders yet. CRM raises the first one here."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {board?.waiting_on_design?.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <X className="h-3.5 w-3.5 text-orange-600" />
          {board.waiting_on_design.length} order
          {board.waiting_on_design.length === 1 ? "" : "s"} still waiting on design:{" "}
          {board.waiting_on_design.map((o) => o.order_number).join(", ")}
        </footer>
      )}
    </Panel>
  );
}
