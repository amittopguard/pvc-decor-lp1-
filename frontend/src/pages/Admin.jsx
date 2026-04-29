import { useEffect, useState, useCallback } from "react";
import { adminApi, api, API } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LogOut, Download, Loader2, Search, RefreshCcw, Trash2, MoreVertical, Eye,
} from "lucide-react";

const STATUSES = ["new", "contacted", "qualified", "closed", "spam"];
const STATUS_COLOR = {
  new: "bg-orange-100 text-orange-700 border-orange-200",
  contacted: "bg-blue-100 text-blue-700 border-blue-200",
  qualified: "bg-green-100 text-green-700 border-green-200",
  closed: "bg-slate-200 text-slate-700 border-slate-300",
  spam: "bg-red-100 text-red-700 border-red-200",
};

function Login({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/admin/login", { password });
      localStorage.setItem("kdipl_admin_token", data.token);
      toast.success("Welcome back");
      onSuccess();
    } catch {
      toast.error("Invalid password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6" data-testid="admin-login-page">
      <form onSubmit={submit} className="w-full max-w-md bg-white border border-slate-200 p-10">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-10 h-10 bg-slate-900 flex items-center justify-center">
            <span className="text-orange-500 font-display font-bold text-lg">K</span>
          </div>
          <div>
            <div className="font-display font-bold text-slate-900 text-lg">KDIPL Admin</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Lead Management</div>
          </div>
        </div>

        <Label className="text-xs uppercase tracking-[0.14em] font-semibold text-slate-700">Password</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 rounded-none border-slate-300 focus-visible:ring-orange-600 focus-visible:ring-offset-0"
          placeholder="Enter admin password"
          data-testid="admin-password-input"
          required
        />
        <button
          type="submit"
          disabled={loading}
          data-testid="admin-login-btn"
          className="mt-6 w-full bg-slate-900 text-white py-3.5 font-semibold text-sm uppercase tracking-wider hover:bg-orange-600 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-70"
        >
          {loading && <Loader2 size={16} className="animate-spin" />} Sign In
        </button>
        <a href="/" className="mt-6 block text-center text-xs text-slate-500 hover:text-slate-900">&larr; Back to website</a>
      </form>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (type !== "all") params.type = type;
      if (status !== "all") params.status = status;
      if (q.trim()) params.q = q.trim();
      const [leadsRes, statsRes] = await Promise.all([
        adminApi.get("/admin/leads", { params }),
        adminApi.get("/admin/stats"),
      ]);
      setLeads(leadsRes.data.items || []);
      setStats(statsRes.data);
    } catch (e) {
      if (e?.response?.status === 401) {
        toast.error("Session expired");
        onLogout();
      } else {
        toast.error("Could not load leads");
      }
    } finally {
      setLoading(false);
    }
  }, [type, status, q, onLogout]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, next) => {
    try {
      await adminApi.patch(`/admin/leads/${id}`, { status: next });
      toast.success(`Status updated to ${next}`);
      setSelected((s) => (s && s.id === id ? { ...s, status: next } : s));
      load();
    } catch {
      toast.error("Update failed");
    }
  };

  const removeLead = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    try {
      await adminApi.delete(`/admin/leads/${id}`);
      toast.success("Lead deleted");
      setSelected(null);
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const downloadCsv = async () => {
    try {
      const token = localStorage.getItem("kdipl_admin_token");
      const res = await fetch(`${API}/admin/leads/export.csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kdipl-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="admin-dashboard">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 flex items-center justify-center">
              <span className="text-orange-500 font-display font-bold text-lg">K</span>
            </div>
            <div>
              <div className="font-display font-bold text-slate-900">KDIPL Admin</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Lead Management</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadCsv}
              data-testid="export-csv-btn"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold border border-slate-300 px-4 py-2.5 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={onLogout}
              data-testid="admin-logout-btn"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wider font-semibold border border-slate-300 px-4 py-2.5 hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10" data-testid="stats-grid">
            <StatCard label="Total Leads" value={stats.total} accent />
            <StatCard label="Sample" value={stats.by_type?.sample ?? 0} />
            <StatCard label="Quote" value={stats.by_type?.quote ?? 0} />
            <StatCard label="Distributor" value={stats.by_type?.distributor ?? 0} />
            <StatCard label="Price Match" value={stats.by_type?.comparison ?? 0} />
          </div>
        )}

        <div className="bg-white border border-slate-200">
          <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center gap-4">
            <Tabs value={type} onValueChange={setType} className="w-full lg:w-auto">
              <TabsList className="rounded-none bg-slate-100 p-0 h-auto border border-slate-200 flex-wrap">
                {[
                  { v: "all", l: "All" },
                  { v: "sample", l: "Sample" },
                  { v: "quote", l: "Quote" },
                  { v: "distributor", l: "Distributor" },
                  { v: "comparison", l: "Price Match" },
                ].map((t) => (
                  <TabsTrigger
                    key={t.v}
                    value={t.v}
                    data-testid={`filter-type-${t.v}`}
                    className="rounded-none px-4 py-2.5 text-xs uppercase tracking-wider font-semibold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                  >
                    {t.l}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex-1 flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search name, email, company..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="rounded-none border-slate-300 pl-9 focus-visible:ring-orange-600 focus-visible:ring-offset-0"
                  data-testid="search-input"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[160px] rounded-none border-slate-300" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={load}
                data-testid="refresh-btn"
                className="p-2.5 border border-slate-300 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors"
                title="Refresh"
              >
                <RefreshCcw size={14} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table data-testid="leads-table">
              <TableHeader>
                <TableRow className="bg-slate-900 hover:bg-slate-900">
                  <TableHead className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Date</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Name</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Company</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Email</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Phone</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-widest text-slate-300 font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-500">
                    <Loader2 size={18} className="inline animate-spin mr-2" /> Loading...
                  </TableCell></TableRow>
                ) : leads.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-14 text-slate-500" data-testid="no-leads">
                    No leads yet. Shared leads will appear here.
                  </TableCell></TableRow>
                ) : leads.map((l) => (
                  <TableRow key={l.id} data-testid={`lead-row-${l.id}`} className="hover:bg-slate-50">
                    <TableCell className="text-xs text-slate-500">{new Date(l.created_at).toLocaleDateString()}</TableCell>
                    <TableCell><span className="text-[10px] uppercase tracking-wider font-bold bg-slate-100 border border-slate-200 px-2 py-1">{l.type}</span></TableCell>
                    <TableCell className="font-medium text-slate-900">{l.name}</TableCell>
                    <TableCell className="text-slate-700">{l.company || "—"}</TableCell>
                    <TableCell className="text-slate-700 text-sm">{l.email}</TableCell>
                    <TableCell className="text-slate-700 text-sm">{l.phone}</TableCell>
                    <TableCell>
                      <Select value={l.status} onValueChange={(v) => updateStatus(l.id, v)}>
                        <SelectTrigger className={`h-auto py-1 px-2 text-[10px] uppercase tracking-wider font-bold rounded-none border ${STATUS_COLOR[l.status] || ""}`} data-testid={`status-select-${l.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 hover:bg-slate-100" data-testid={`actions-${l.id}`}>
                            <MoreVertical size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelected(l)}>
                            <Eye size={14} className="mr-2" /> View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => removeLead(l.id)} className="text-red-600">
                            <Trash2 size={14} className="mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl rounded-none" data-testid="lead-detail-dialog">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">{selected.name}</DialogTitle>
                <DialogDescription>
                  {selected.type.toUpperCase()} lead &middot; {new Date(selected.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm mt-2">
                {[
                  ["Company", selected.company], ["Email", selected.email],
                  ["Phone", selected.phone], ["Country", selected.country],
                  ["City", selected.city], ["Product Interest", selected.product_interest],
                  ["Quantity", selected.quantity], ["Territory", selected.territory],
                  ["Experience", selected.experience_years], ["Expected Volume", selected.expected_volume],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{k}</div>
                    <div className="mt-1 text-slate-900">{v}</div>
                  </div>
                ))}
                {selected.message && (
                  <div className="sm:col-span-2">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Message</div>
                    <div className="mt-1 text-slate-900 bg-slate-50 border border-slate-200 p-3 whitespace-pre-wrap">{selected.message}</div>
                  </div>
                )}
                {selected.file_meta && (
                  <div className="sm:col-span-2" data-testid="lead-file-meta">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Uploaded File</div>
                    <button
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem("kdipl_admin_token");
                          const res = await fetch(`${API}/admin/leads/${selected.id}/file`, {
                            headers: { Authorization: `Bearer ${token}` },
                          });
                          if (!res.ok) throw new Error();
                          const blob = await res.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = selected.file_meta.filename;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.URL.revokeObjectURL(url);
                        } catch {
                          toast.error("Download failed");
                        }
                      }}
                      data-testid="lead-file-download-btn"
                      className="mt-2 w-full flex items-center gap-3 border border-slate-300 hover:border-orange-600 hover:bg-orange-50 transition-colors p-3 text-left"
                    >
                      <Download size={18} className="text-orange-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{selected.file_meta.filename}</div>
                        <div className="text-xs text-slate-500">{(selected.file_meta.size / 1024).toFixed(1)} KB &middot; click to download</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`border p-6 ${accent ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200"}`}>
      <div className={`text-[10px] uppercase tracking-[0.22em] font-bold ${accent ? "text-orange-400" : "text-slate-500"}`}>{label}</div>
      <div className={`mt-3 font-display font-bold text-4xl ${accent ? "text-white" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("kdipl_admin_token");
    if (!t) { setChecking(false); return; }
    adminApi.get("/admin/verify")
      .then(() => setAuthed(true))
      .catch(() => localStorage.removeItem("kdipl_admin_token"))
      .finally(() => setChecking(false));
  }, []);

  const logout = () => {
    localStorage.removeItem("kdipl_admin_token");
    setAuthed(false);
  };

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="animate-spin" /></div>;
  }
  return authed ? <Dashboard onLogout={logout} /> : <Login onSuccess={() => setAuthed(true)} />;
}
