import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, FileUp, Loader2, LogOut, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Panel, ToolButton, IconButton } from "@/components/cutlist/fields";
import RecordTable from "@/components/vault/RecordTable";
import PlateEditor from "@/components/vault/PlateEditor";
import VaultReports from "@/components/vault/VaultReports";
import GeometryScan from "@/components/vault/GeometryScan";
import {
  TOKEN_KEY,
  createPlate,
  createRecord,
  deleteArtworkFile,
  deletePlate,
  deleteRecord,
  downloadWithToken,
  formatMoney,
  getPlate,
  hasToken,
  listArtworkFiles,
  listPlates,
  listRecords,
  reportArtworks,
  reportCost,
  reportKld,
  reportReconciliation,
  updatePlate,
  updateRecord,
  uploadArtworkFile,
} from "@/lib/vault/api";

const TABS = [
  { id: "artworks", label: "Artwork" },
  { id: "plates", label: "Plates" },
  { id: "dies", label: "KLD & moulds" },
  { id: "parties", label: "Customers & vendors" },
  { id: "scan", label: "Geometry scan" },
  { id: "reports", label: "Reports" },
];

/** Numbers arrive as strings from the inputs; the API wants real types. */
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const int = (v) => (v === "" || v === null || v === undefined ? null : parseInt(v, 10));

function Login({ onDone }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/admin/login", { password });
      localStorage.setItem(TOKEN_KEY, data.token);
      onDone();
    } catch {
      toast.error("Wrong password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Archive className="h-5 w-5 text-orange-600" />
          <h1 className="font-display text-lg font-bold">Artwork &amp; plate vault</h1>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Admin password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30"
          />
        </label>
        <ToolButton variant="primary" type="submit" disabled={busy || !password} className="w-full justify-center">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Open the vault
        </ToolButton>
      </form>
    </div>
  );
}

function ArtworkFiles({ artwork, onChanged }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listArtworkFiles(artwork.id).then(setFiles).catch(() => setFiles([]));
  }, [artwork.id]);

  useEffect(load, [load]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await uploadArtworkFile(artwork.id, file, artwork.version || null);
      toast.success(`${file.name} uploaded.`);
      load();
      onChanged?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  };

  return (
    <div className="border-t border-slate-100 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Files for {artwork.code} ({files.length})
        </h4>
        <label className="inline-flex cursor-pointer items-center gap-1.5 border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-orange-500">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          Upload artwork
          <input type="file" className="hidden" onChange={upload} disabled={busy} />
        </label>
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => downloadWithToken(`/vault/files/${f.id}`, f.filename)}
                className="truncate text-left text-orange-700 underline-offset-2 hover:underline"
              >
                {f.filename}
              </button>
              <span className="shrink-0 text-slate-400">
                {(f.size / 1024).toFixed(0)} kB{f.version ? ` · ${f.version}` : ""}
              </span>
              <IconButton
                onClick={async () => {
                  await deleteArtworkFile(f.id);
                  load();
                  onChanged?.();
                }}
                title="Delete file"
              >
                <Trash2 className="h-3 w-3" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Vault() {
  const [authed, setAuthed] = useState(hasToken());
  const [tab, setTab] = useState("artworks");
  const [loading, setLoading] = useState(false);

  const [moulders, setMoulders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [dies, setDies] = useState([]);
  const [moulds, setMoulds] = useState([]);
  const [artworks, setArtworks] = useState([]);
  const [plates, setPlates] = useState([]);
  const [editingPlate, setEditingPlate] = useState(null);
  const [openArtwork, setOpenArtwork] = useState(null);

  const [repArtworks, setRepArtworks] = useState([]);
  const [repKld, setRepKld] = useState([]);
  const [repRecon, setRepRecon] = useState(null);
  const [repCost, setRepCost] = useState(null);

  useEffect(() => {
    document.title = "Artwork & plate vault";
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c, v, d, mo, a, p] = await Promise.all([
        listRecords("moulders"),
        listRecords("customers"),
        listRecords("vendors"),
        listRecords("dies"),
        listRecords("moulds"),
        listRecords("artworks"),
        listPlates(),
      ]);
      setMoulders(m);
      setCustomers(c);
      setVendors(v);
      setDies(d);
      setMoulds(mo);
      setArtworks(a);
      setPlates(p);
      const [ra, rk, rr, rc] = await Promise.all([
        reportArtworks(),
        reportKld(),
        reportReconciliation(),
        reportCost(),
      ]);
      setRepArtworks(ra);
      setRepKld(rk);
      setRepRecon(rr);
      setRepCost(rc);
    } catch (e) {
      if (e?.response?.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        setAuthed(false);
      } else {
        toast.error("Could not load the vault. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed, loadAll]);

  const options = useMemo(
    () => ({
      moulders: moulders.map((m) => ({ id: m.id, label: m.name })),
      customers: customers.map((c) => ({ id: c.id, label: c.code ? `${c.name} (${c.code})` : c.name })),
      dies: dies.map((d) => ({ id: d.id, label: d.kld_number })),
      moulds: moulds.map((m) => ({ id: m.id, label: m.mould_code })),
      vendors: vendors.map((v) => ({ id: v.id, label: v.name })),
    }),
    [moulders, customers, dies, moulds, vendors]
  );

  const crud = (entity, setter, coerce = (x) => x) => ({
    onCreate: async (draft) => {
      await createRecord(entity, coerce(draft));
      await loadAll();
      toast.success("Saved.");
    },
    onUpdate: async (id, draft) => {
      await updateRecord(entity, id, coerce(draft));
      await loadAll();
      toast.success("Updated.");
    },
    onDelete: async (id) => {
      await deleteRecord(entity, id);
      await loadAll();
      toast.success("Deleted.");
    },
  });

  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  return (
    <div className="cutlist-page min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-orange-600" />
            <div>
              <h1 className="font-display text-base font-bold leading-tight">Artwork &amp; plate vault</h1>
              <p className="text-[11px] leading-tight text-slate-500">
                Customers, KLD dies, moulds, artwork and the plates that carry them
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ToolButton onClick={loadAll} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
            </ToolButton>
            <ToolButton
              onClick={() => {
                localStorage.removeItem(TOKEN_KEY);
                setAuthed(false);
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </ToolButton>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === t.id
                  ? "border-orange-600 font-semibold text-orange-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 p-4">
        {tab === "artworks" && (
          <>
            <RecordTable
              title="Artwork"
              subtitle="Each artwork belongs to a customer and is patched to a KLD die and a mould"
              fields={[
                { key: "code", label: "Code", required: true },
                { key: "name", label: "Name" },
                { key: "customer_id", label: "Customer", type: "select", lookup: "customers" },
                { key: "die_id", label: "KLD", type: "select", lookup: "dies" },
                { key: "mould_id", label: "Mould", type: "select", lookup: "moulds" },
                { key: "width", label: "Width", type: "number" },
                { key: "height", label: "Height", type: "number" },
                { key: "colours", label: "Colours", type: "number" },
                { key: "version", label: "Version" },
              ]}
              rows={artworks}
              lookups={options}
              busy={loading}
              {...crud("artworks", setArtworks, (d) => ({
                ...d,
                width: num(d.width),
                height: num(d.height),
                colours: int(d.colours),
              }))}
            />
            <Panel title="Artwork files" subtitle="Pick an artwork to upload or download its files">
              <div className="flex flex-wrap gap-1.5 p-3">
                {artworks.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setOpenArtwork(openArtwork?.id === a.id ? null : a)}
                    className={`border px-2 py-1 text-xs ${
                      openArtwork?.id === a.id
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-slate-300 text-slate-700 hover:border-orange-400"
                    }`}
                  >
                    {a.code}
                  </button>
                ))}
                {!artworks.length && <span className="text-xs text-slate-500">Add an artwork first.</span>}
              </div>
              {openArtwork && <ArtworkFiles artwork={openArtwork} onChanged={loadAll} />}
            </Panel>
          </>
        )}

        {tab === "plates" && (
          <>
            {editingPlate !== null ? (
              <PlateEditor
                plate={editingPlate === "new" ? null : editingPlate}
                artworks={artworks}
                vendors={vendors}
                dies={dies}
                onCancel={() => setEditingPlate(null)}
                onSave={async (body) => {
                  if (editingPlate === "new") await createPlate(body);
                  else await updatePlate(editingPlate.id, body);
                  setEditingPlate(null);
                  await loadAll();
                  toast.success("Plate saved.");
                }}
                onDelete={async (id) => {
                  await deletePlate(id);
                  setEditingPlate(null);
                  await loadAll();
                  toast.success("Plate deleted.");
                }}
              />
            ) : (
              <Panel
                title="Plates"
                subtitle="One plate can carry many artworks"
                actions={
                  <ToolButton variant="primary" onClick={() => setEditingPlate("new")}>
                    <Plus className="h-4 w-4" /> New plate
                  </ToolButton>
                }
              >
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-1.5 text-left font-medium">Plate</th>
                        <th className="px-2 py-1.5 text-left font-medium">Vendor</th>
                        <th className="px-2 py-1.5 text-left font-medium">KLD</th>
                        <th className="px-2 py-1.5 text-left font-medium">Made on</th>
                        <th className="px-2 py-1.5 text-right font-medium">Artworks</th>
                        <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                        <th className="px-2 py-1.5 text-left font-medium">Paid by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plates.map((p) => (
                        <tr
                          key={p.id}
                          onClick={async () => setEditingPlate(await getPlate(p.id))}
                          className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-orange-50"
                        >
                          <td className="px-2 py-1.5 font-medium">{p.plate_number}</td>
                          <td className="px-2 py-1.5">{p.vendor_name || "—"}</td>
                          <td className="px-2 py-1.5">{p.kld_number || "—"}</td>
                          <td className="px-2 py-1.5">{p.made_on || "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{p.artwork_count}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(p.actual_cost_minor)}</td>
                          <td className="px-2 py-1.5 capitalize">{p.paid_by || "—"}</td>
                        </tr>
                      ))}
                      {!plates.length && (
                        <tr>
                          <td colSpan={7} className="px-3 py-4 text-center text-xs text-slate-500">
                            No plates yet. Create one and add artworks to it.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </>
        )}

        {tab === "dies" && (
          <>
            <RecordTable
              title="KLD dies"
              subtitle="The cutting die — many artworks can be patched to one KLD"
              fields={[
                { key: "kld_number", label: "KLD number", required: true },
                { key: "name", label: "Name" },
                { key: "label_width", label: "Label width", type: "number" },
                { key: "label_height", label: "Label height", type: "number" },
                { key: "ups_across", label: "Ups across", type: "number" },
                { key: "ups_around", label: "Ups around", type: "number" },
                { key: "notes", label: "Notes" },
              ]}
              rows={dies}
              lookups={options}
              busy={loading}
              {...crud("dies", setDies, (d) => ({
                ...d,
                label_width: num(d.label_width),
                label_height: num(d.label_height),
                ups_across: int(d.ups_across),
                ups_around: int(d.ups_around),
              }))}
            />
            <RecordTable
              title="Moulds"
              subtitle="The IML mould, kept separate from the die and tied to a moulder"
              fields={[
                { key: "mould_code", label: "Mould code", required: true },
                { key: "name", label: "Name" },
                { key: "moulder_id", label: "Moulder", type: "select", lookup: "moulders" },
                { key: "cavities", label: "Cavities", type: "number" },
                { key: "label_width", label: "Label width", type: "number" },
                { key: "label_height", label: "Label height", type: "number" },
                { key: "notes", label: "Notes" },
              ]}
              rows={moulds}
              lookups={options}
              busy={loading}
              {...crud("moulds", setMoulds, (d) => ({
                ...d,
                cavities: int(d.cavities),
                label_width: num(d.label_width),
                label_height: num(d.label_height),
              }))}
            />
          </>
        )}

        {tab === "parties" && (
          <>
            <RecordTable
              title="Customers"
              subtitle="Each customer is related to its moulder"
              fields={[
                { key: "name", label: "Name", required: true },
                { key: "code", label: "Code" },
                { key: "moulder_id", label: "Moulder", type: "select", lookup: "moulders" },
                { key: "contact", label: "Contact" },
                { key: "gst", label: "GST" },
              ]}
              rows={customers}
              lookups={options}
              busy={loading}
              {...crud("customers", setCustomers)}
            />
            <RecordTable
              title="Moulders"
              fields={[
                { key: "name", label: "Name", required: true },
                { key: "city", label: "City" },
                { key: "contact", label: "Contact" },
                { key: "notes", label: "Notes" },
              ]}
              rows={moulders}
              lookups={options}
              busy={loading}
              {...crud("moulders", setMoulders)}
            />
            <RecordTable
              title="Plate vendors"
              subtitle="Who makes the plates"
              fields={[
                { key: "name", label: "Name", required: true },
                { key: "city", label: "City" },
                { key: "contact", label: "Contact" },
                { key: "rate_note", label: "Rate" },
              ]}
              rows={vendors}
              lookups={options}
              busy={loading}
              {...crud("vendors", setVendors)}
            />
          </>
        )}

        {tab === "scan" && <GeometryScan />}

        {tab === "reports" && (
          <VaultReports artworks={repArtworks} kld={repKld} reconciliation={repRecon} cost={repCost} />
        )}
      </main>
    </div>
  );
}
