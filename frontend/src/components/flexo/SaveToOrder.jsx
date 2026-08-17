import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel, ToolButton, IconButton } from "@/components/cutlist/fields";
import {
  createLayout,
  deleteLayout,
  errorText,
  hasToken,
  listLayouts,
  listOrders,
  formatMoney,
} from "@/lib/vault/api";

const inputClass =
  "w-full border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none " +
  "focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30";

/**
 * Saving a layout to the vault.
 *
 * Without this the optimiser only remembers a calculation in the browser it was
 * worked out in. Saved against an order it becomes a record the whole shop can
 * see, and the plate that follows can be made straight from it.
 */
export default function SaveToOrder({ draft, onOpen }) {
  const [signedIn, setSignedIn] = useState(hasToken());
  const [orders, setOrders] = useState([]);
  const [saved, setSaved] = useState([]);
  const [orderId, setOrderId] = useState("");
  const [name, setName] = useState("");
  const [savedBy, setSavedBy] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!hasToken()) {
      setSignedIn(false);
      return;
    }
    try {
      const [o, l] = await Promise.all([listOrders(), listLayouts()]);
      setOrders(o);
      setSaved(l);
      setSignedIn(true);
    } catch (e) {
      // A stale token is the ordinary case here, not a failure worth shouting about.
      if (e?.response?.status === 401) setSignedIn(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      // The two display-only fields belong to this screen, not to the record.
      const { suggestedName, describe, ...record } = draft;
      const row = await createLayout({
        ...record,
        order_id: orderId || null,
        name: name.trim() || null,
        saved_by: savedBy.trim() || null,
      });
      toast.success(`Saved as ${row.name}.`);
      setName("");
      await load();
    } catch (e) {
      toast.error(errorText(e, "Could not save the layout."));
    } finally {
      setBusy(false);
    }
  };

  if (!signedIn) {
    return (
      <Panel title="Save this layout" subtitle="Keep a calculation beyond this browser">
        <p className="p-3 text-xs text-slate-600">
          Layouts are saved into the artwork &amp; plate vault against an order, so anyone can see them and the
          plate can be made from them.{" "}
          <a href="/vault" className="text-orange-700 underline-offset-2 hover:underline">
            Sign in to the vault
          </a>{" "}
          and come back — until then this page only remembers your work in this browser.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Save this layout"
      subtitle="Against an order, so the shop can see it and the plate can follow from it"
    >
      <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs font-medium text-slate-700">Order</span>
          <select
            className={inputClass}
            aria-label="Save the layout to this order"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          >
            <option value="">— not tied to an order —</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.order_number}
                {o.customer_name ? ` — ${o.customer_name}` : ""}
                {o.quantity ? ` (${Number(o.quantity).toLocaleString("en-IN")})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Name</span>
          <input
            className={inputClass}
            aria-label="Layout name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={draft?.suggestedName || "Calculate first"}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-700">Saved by</span>
          <input
            className={inputClass}
            aria-label="Saved by"
            value={savedBy}
            onChange={(e) => setSavedBy(e.target.value)}
            placeholder="Your name"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <span className="text-xs text-slate-500">{draft?.describe || "Calculate a layout first."}</span>
        <ToolButton variant="primary" onClick={save} disabled={busy || !draft}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save to vault
        </ToolButton>
      </div>

      {saved.length > 0 && (
        <div className="relative overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[620px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1.5 text-left font-medium">Layout</th>
                <th className="px-2 py-1.5 text-left font-medium">Order</th>
                <th className="px-2 py-1.5 text-right font-medium">Web</th>
                <th className="px-2 py-1.5 text-right font-medium">Per 1000</th>
                <th className="px-2 py-1.5 text-left font-medium">Plate</th>
                <th className="px-2 py-1.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {saved.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      className="font-medium text-orange-700 underline-offset-2 hover:underline"
                      onClick={() => onOpen(l)}
                      title="Load this layout back into the optimiser"
                    >
                      {l.name}
                    </button>
                    {l.saved_by && <span className="block text-[11px] text-slate-500">{l.saved_by}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {l.order_number || "—"}
                    {l.customer_name && <span className="block text-[11px] text-slate-500">{l.customer_name}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.web_width ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {l.per_thousand_minor ? formatMoney(l.per_thousand_minor) : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    {l.plate_number || <span className="text-slate-400">not made yet</span>}
                  </td>
                  <td className="px-1 py-1 text-right">
                    <IconButton
                      title="Delete this saved layout"
                      onClick={async () => {
                        await deleteLayout(l.id);
                        await load();
                        toast.success("Layout deleted.");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
