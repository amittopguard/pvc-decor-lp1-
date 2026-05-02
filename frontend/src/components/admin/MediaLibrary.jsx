import { useEffect, useState, useCallback } from "react";
import { adminApi, API } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Copy, Image as ImageIcon } from "lucide-react";

export default function MediaLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get("/admin/media");
      setItems(data.items || []);
    } catch { toast.error("Failed to load media"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (files) => {
    setUploading(true);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} exceeds 10MB`); continue; }
      const fd = new FormData();
      fd.append("file", file);
      try {
        await adminApi.post("/admin/media/upload", fd);
        toast.success(`Uploaded ${file.name}`);
      } catch { toast.error(`Failed: ${file.name}`); }
    }
    setUploading(false);
    load();
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); };
  const onFileInput = (e) => { if (e.target.files.length) upload(e.target.files); };

  const deleteMedia = async (id) => {
    if (!window.confirm("Delete this file?")) return;
    try { await adminApi.delete(`/admin/media/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  const copyUrl = (url) => {
    const full = `${API.replace("/api", "")}${url}`;
    navigator.clipboard.writeText(full);
    toast.success("URL copied");
  };

  return (
    <div>
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed p-8 text-center mb-6 transition-colors ${dragOver ? "border-orange-500 bg-orange-50" : "border-slate-300 bg-white"}`}
      >
        {uploading ? (
          <Loader2 className="mx-auto animate-spin text-orange-600" size={24} />
        ) : (
          <>
            <Upload className="mx-auto text-slate-400 mb-2" size={24} />
            <p className="text-sm text-slate-600">Drag & drop images here, or{" "}
              <label className="text-orange-600 font-semibold cursor-pointer hover:underline">
                browse
                <input type="file" accept="image/*" multiple onChange={onFileInput} className="hidden" />
              </label>
            </p>
            <p className="text-xs text-slate-400 mt-1">JPG, PNG, WebP, GIF, SVG · Max 10MB</p>
          </>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-500"><Loader2 className="inline animate-spin mr-2" size={18} /> Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-slate-500 text-sm">No media uploaded yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {items.map((m) => (
            <div key={m.id} className="border border-slate-200 bg-white group overflow-hidden">
              <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                {m.content_type?.startsWith("image/") ? (
                  <img src={`${API.replace("/api", "")}${m.url}`} alt={m.filename} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <ImageIcon size={32} className="text-slate-300" />
                )}
              </div>
              <div className="p-3">
                <div className="text-xs font-medium text-slate-900 truncate">{m.filename}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{(m.size / 1024).toFixed(1)} KB</div>
                <div className="flex gap-1 mt-2">
                  <button onClick={() => copyUrl(m.url)} className="flex-1 text-[10px] uppercase tracking-wider font-bold text-center py-1.5 border border-slate-200 hover:bg-slate-900 hover:text-white transition-colors flex items-center justify-center gap-1" aria-label="Copy URL">
                    <Copy size={10} /> URL
                  </button>
                  <button onClick={() => deleteMedia(m.id)} className="py-1.5 px-2 border border-slate-200 text-red-500 hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors" aria-label="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
