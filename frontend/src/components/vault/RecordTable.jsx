import React, { useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Panel, ToolButton, IconButton } from "@/components/cutlist/fields";

const inputClass =
  "w-full border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none " +
  "focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30";

/**
 * One editable table for any of the simple record types. The field spec drives
 * the columns, the new-record row and the edit row, so every entity behaves
 * the same way.
 */
export default function RecordTable({
  title,
  subtitle,
  fields,
  rows,
  lookups = {},
  busy,
  onCreate,
  onUpdate,
  onDelete,
  extraActions,
}) {
  const [draft, setDraft] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [error, setError] = useState(null);

  const required = useMemo(() => fields.filter((f) => f.required).map((f) => f.key), [fields]);
  const canSave = (values) => required.every((k) => String(values[k] ?? "").trim());

  const submit = async () => {
    setError(null);
    try {
      await onCreate(draft);
      setDraft({});
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Could not save");
    }
  };

  const saveEdit = async () => {
    setError(null);
    try {
      await onUpdate(editingId, editDraft);
      setEditingId(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Could not save");
    }
  };

  const remove = async (id) => {
    setError(null);
    try {
      await onDelete(id);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Could not delete");
    }
  };

  const cell = (field, values, setValues, keyPrefix) => {
    const value = values[field.key] ?? "";
    const set = (v) => setValues({ ...values, [field.key]: v });
    if (field.type === "select") {
      const options = lookups[field.lookup] || [];
      return (
        <select
          className={inputClass}
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-label={`${keyPrefix} ${field.label}`}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        className={inputClass}
        type="text"
        inputMode={field.type === "number" ? "decimal" : undefined}
        value={value}
        placeholder={field.placeholder || (field.required ? "required" : "")}
        onChange={(e) => set(e.target.value)}
        aria-label={`${keyPrefix} ${field.label}`}
      />
    );
  };

  const display = (field, row) => {
    if (field.type === "select") {
      const options = lookups[field.lookup] || [];
      const hit = options.find((o) => o.id === row[field.key]);
      return hit ? hit.label : "—";
    }
    const v = row[field.key];
    return v === null || v === undefined || v === "" ? "—" : String(v);
  };

  return (
    <Panel title={title} subtitle={subtitle} actions={extraActions}>
      {error && <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              {fields.map((f) => (
                <th key={f.key} className="px-2 py-1.5 text-left font-medium">
                  {f.label}
                  {f.required && <span className="text-orange-600"> *</span>}
                </th>
              ))}
              <th className="w-[72px] px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const editing = editingId === row.id;
              return (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  {fields.map((f) => (
                    <td key={f.key} className={editing ? "p-1" : "px-2 py-1.5 text-slate-800"}>
                      {editing ? cell(f, editDraft, setEditDraft, "edit") : display(f, row)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-1 text-right">
                    {editing ? (
                      <>
                        <IconButton onClick={saveEdit} title="Save" disabled={!canSave(editDraft)}>
                          <Check className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton onClick={() => setEditingId(null)} title="Cancel">
                          <X className="h-3.5 w-3.5" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton
                          onClick={() => {
                            setEditingId(row.id);
                            setEditDraft(Object.fromEntries(fields.map((f) => [f.key, row[f.key] ?? ""])));
                          }}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton onClick={() => remove(row.id)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}

            <tr className="bg-slate-50">
              {fields.map((f) => (
                <td key={f.key} className="p-1">
                  {cell(f, draft, setDraft, "new")}
                </td>
              ))}
              <td className="px-1 text-right">
                <IconButton onClick={submit} title="Add record" disabled={busy || !canSave(draft)}>
                  <Plus className="h-4 w-4" />
                </IconButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <footer className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
        <strong className="tabular-nums text-slate-900">{rows.length}</strong> record{rows.length === 1 ? "" : "s"}
      </footer>
    </Panel>
  );
}

export { ToolButton };
