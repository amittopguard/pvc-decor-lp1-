import { useEffect, useState, useCallback, useRef } from "react";
import { adminApi, API } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, GripVertical, Save, X, Upload, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Field configs per collection
const FIELD_CONFIGS = {
  branding: [
    { key: "brand_name", label: "Brand Name" },
    { key: "legal_name", label: "Legal Name" },
    { key: "tagline", label: "Tagline" },
    { key: "logo_url", label: "Logo", type: "image_upload" },
    { key: "favicon_url", label: "Favicon", type: "image_upload" },
    { key: "og_image_url", label: "OG Image", type: "image_upload" },
  ],
  hero: [
    { key: "headline", label: "Headline" },
    { key: "sub_headline", label: "Sub Headline" },
    { key: "twist_line", label: "Twist Line" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "cta_text", label: "CTA Button Text" },
    { key: "cta_link", label: "CTA Link" },
    { key: "cta2_text", label: "Secondary CTA Text" },
    { key: "image_url", label: "Hero Image", type: "image_upload" },
  ],
  products: [
    { key: "name", label: "Product Name" },
    { key: "category", label: "Category" },
    { key: "tag", label: "Tag (Flagship/New)" },
    { key: "subtitle", label: "Subtitle" },
    { key: "process", label: "Process" },
    { key: "points", label: "Features (pipe-separated)", type: "textarea" },
    { key: "image", label: "Image", type: "image_upload" },
    { key: "active", label: "Active", type: "toggle" },
  ],
  categories: [
    { key: "name", label: "Category Name" },
  ],
  audience: [
    { key: "audience_id", label: "ID (slug)" },
    { key: "label", label: "Label" },
    { key: "icon", label: "Icon (Truck/Globe/Factory)" },
    { key: "target", label: "Target Anchor" },
  ],
  trust: [
    { key: "step", label: "Step Number" },
    { key: "title", label: "Title" },
    { key: "body", label: "Description", type: "textarea" },
  ],
  faq: [
    { key: "q", label: "Question" },
    { key: "a", label: "Answer", type: "textarea" },
  ],
  testimonials: [
    { key: "name", label: "Name" },
    { key: "role", label: "Role" },
    { key: "company", label: "Company" },
    { key: "audience", label: "Audience Type" },
    { key: "quote", label: "Quote", type: "textarea" },
    { key: "rating", label: "Rating (1-5)", type: "number" },
  ],
  seo_settings: [
    { key: "title", label: "Page Title" },
    { key: "description", label: "Meta Description", type: "textarea" },
    { key: "og_title", label: "OG Title" },
    { key: "og_description", label: "OG Description", type: "textarea" },
    { key: "og_image", label: "OG Image", type: "image_upload" },
    { key: "canonical", label: "Canonical URL" },
  ],
  contact: [
    { key: "phone", label: "Phone" },
    { key: "whatsapp", label: "WhatsApp Number" },
    { key: "email", label: "Email" },
    { key: "email_cc", label: "CC Email" },
    { key: "address", label: "Address" },
    { key: "form_destination", label: "Form Destination Email" },
  ],
};

// Resolve image URL — handles both absolute /api/media/... and relative /logo.png paths
function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/api/media/")) return `${API.replace("/api", "")}${url}`;
  return url;
}

// ---------- Image Upload Field ----------
function ImageUploadField({ value, onChange, label }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const previewUrl = resolveImageUrl(value);

  const handleUpload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File exceeds 10MB");
      return;
    }
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".ico"];
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!allowed.includes(ext)) {
      toast.error(`Unsupported file type: ${ext}`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await adminApi.post("/admin/media/upload", fd);
      // Use the media URL returned by backend
      onChange(data.url || data.webp_url || "");
      toast.success(`Uploaded ${file.name}`);
    } catch (e) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]);
  };

  const onFileSelect = (e) => {
    if (e.target.files?.[0]) handleUpload(e.target.files[0]);
  };

  const removeImage = () => {
    onChange("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      {previewUrl ? (
        <div className="mt-1 border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start gap-3">
            <div className="w-20 h-20 border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={previewUrl}
                alt={label}
                className="max-w-full max-h-full object-contain"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-600 truncate break-all">{value}</div>
              <div className="flex gap-2 mt-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-orange-600 hover:text-orange-700 border border-orange-200 px-3 py-1.5 hover:bg-orange-50 transition-colors">
                  <Upload size={12} /> Replace
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={onFileSelect}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={removeImage}
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 hover:bg-red-50 transition-colors"
                >
                  <X size={12} /> Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mt-1 border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
            dragOver ? "border-orange-500 bg-orange-50" : "border-slate-300 bg-slate-50 hover:border-orange-400 hover:bg-orange-50/50"
          }`}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mx-auto animate-spin text-orange-600" size={22} />
          ) : (
            <>
              <ImageIcon className="mx-auto text-slate-400 mb-2" size={24} />
              <p className="text-sm text-slate-600">
                Click to upload or drag & drop
              </p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">
                JPG · PNG · WebP · SVG · ICO
              </p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.ico"
            onChange={onFileSelect}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}

function getDisplayLabel(item, fields) {
  if (item.name) return item.name;
  if (item.brand_name) return item.brand_name;
  if (item.headline) return item.headline;
  if (item.q) return item.q.substring(0, 60) + (item.q.length > 60 ? "…" : "");
  if (item.title) return item.title;
  if (item.label) return item.label;
  if (item.phone) return item.phone;
  return item.id?.substring(0, 8) || "Item";
}

export default function ContentEditor({ collection }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | item object
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fields = FIELD_CONFIGS[collection] || [{ key: "name", label: "Name" }];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get(`/admin/content/${collection}`);
      setItems(data.items || []);
    } catch {
      toast.error("Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => { load(); setEditing(null); setSearch(""); }, [load]);

  const openNew = () => {
    const blank = {};
    fields.forEach(f => { blank[f.key] = f.type === "toggle" ? true : f.type === "number" ? 0 : ""; });
    setEditing(blank);
    setIsNew(true);
  };

  const openEdit = (item) => {
    setEditing({ ...item });
    setIsNew(false);
  };

  const saveItem = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (isNew) {
        await adminApi.post(`/admin/content/${collection}/item`, editing);
        toast.success("Created");
      } else {
        await adminApi.put(`/admin/content/${collection}/item/${editing.id}`, editing);
        toast.success("Saved");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      await adminApi.delete(`/admin/content/${collection}/item/${id}`);
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const filtered = items.filter(item => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return Object.values(item).some(v => String(v).toLowerCase().includes(s));
  });

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="animate-spin mr-2" size={18} /> Loading…</div>;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs rounded-none border-slate-300"
        />
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 text-xs uppercase tracking-wider font-semibold hover:bg-orange-700 transition-colors"
        >
          <Plus size={14} /> Add New
        </button>
        <span className="text-xs text-slate-500 ml-auto">{items.length} item{items.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Items list */}
      <div className="bg-white border border-slate-200 divide-y divide-slate-200">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-sm">No items yet. Click "Add New" to create one.</div>
        ) : filtered.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group">
            <GripVertical size={14} className="text-slate-300 shrink-0" />
            {/* Show logo thumbnail in branding list */}
            {collection === "branding" && item.logo_url && (
              <div className="w-8 h-8 border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                <img src={resolveImageUrl(item.logo_url)} alt="" className="max-w-full max-h-full object-contain" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900 text-sm truncate">{getDisplayLabel(item, fields)}</div>
              <div className="text-xs text-slate-500 truncate">
                {fields.slice(1, 3).map(f => item[f.key]).filter(Boolean).join(" · ")}
              </div>
            </div>
            {item.active === false && (
              <span className="text-[10px] uppercase tracking-wider font-bold bg-red-100 text-red-600 px-2 py-0.5 border border-red-200">Inactive</span>
            )}
            <button onClick={() => openEdit(item)} className="p-2 text-slate-400 hover:text-orange-600 transition-colors" aria-label="Edit">
              <Pencil size={14} />
            </button>
            <button onClick={() => deleteItem(item.id)} className="p-2 text-slate-400 hover:text-red-600 transition-colors" aria-label="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg rounded-none max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-bold">{isNew ? "Add New" : "Edit"} Item</DialogTitle>
            <DialogDescription>Fill in the fields below and save.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 mt-2">
              {fields.map((f) => (
                <div key={f.key}>
                  <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">{f.label}</Label>
                  {f.type === "image_upload" ? (
                    <ImageUploadField
                      value={editing[f.key] || ""}
                      onChange={(url) => setEditing({ ...editing, [f.key]: url })}
                      label={f.label}
                    />
                  ) : f.type === "textarea" ? (
                    <textarea
                      value={editing[f.key] || ""}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                      rows={3}
                      className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-600"
                    />
                  ) : f.type === "toggle" ? (
                    <div className="mt-1">
                      <button
                        onClick={() => setEditing({ ...editing, [f.key]: !editing[f.key] })}
                        className={`px-4 py-2 text-xs uppercase font-bold tracking-wider border ${editing[f.key] ? "bg-green-600 text-white border-green-600" : "bg-slate-200 text-slate-600 border-slate-300"}`}
                      >
                        {editing[f.key] ? "Active" : "Inactive"}
                      </button>
                    </div>
                  ) : (
                    <Input
                      type={f.type === "number" ? "number" : "text"}
                      value={editing[f.key] || ""}
                      onChange={(e) => setEditing({ ...editing, [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value })}
                      className="mt-1 rounded-none border-slate-300"
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveItem}
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 text-xs uppercase tracking-wider font-semibold hover:bg-orange-600 transition-colors disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="inline-flex items-center gap-2 border border-slate-300 px-6 py-2.5 text-xs uppercase tracking-wider font-semibold hover:bg-slate-100 transition-colors"
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
