import { useState } from "react";
import {
  LogOut, Menu, X, LayoutDashboard, Palette, Sparkles, Package, Tags,
  Users, ShieldCheck, HelpCircle, Quote, Settings, Phone, Mail, Image,
} from "lucide-react";

const MODULES = [
  { id: "leads", label: "Leads / Forms", icon: Mail },
  { id: "branding", label: "Logo & Branding", icon: Palette },
  { id: "hero", label: "Hero Section", icon: Sparkles },
  { id: "products", label: "Products", icon: Package },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "audience", label: "Audience Tiles", icon: Users },
  { id: "trust", label: "Process & Trust", icon: ShieldCheck },
  { id: "faq", label: "FAQ", icon: HelpCircle },
  { id: "testimonials", label: "Testimonials", icon: Quote },
  { id: "seo_settings", label: "SEO Settings", icon: Settings },
  { id: "contact", label: "Contact / CTA", icon: Phone },
  { id: "media", label: "Media Library", icon: Image },
];

export default function AdminLayout({ active, onNavigate, onLogout, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex" data-testid="admin-layout">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white transform transition-transform lg:relative lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-orange-600 flex items-center justify-center">
              <span className="font-bold text-sm">T</span>
            </div>
            <div>
              <div className="font-bold text-sm">TopDecor</div>
              <div className="text-[9px] uppercase tracking-widest text-slate-400">Admin Panel</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden p-1" aria-label="Close menu"><X size={18} /></button>
        </div>

        <nav className="p-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-130px)]">
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => { onNavigate(m.id); setOpen(false); }}
              data-testid={`nav-${m.id}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded transition-colors ${active === m.id ? "bg-orange-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
            >
              <m.icon size={16} />
              {m.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-700">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-600/20 rounded transition-colors">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button onClick={() => setOpen(true)} className="lg:hidden p-2" aria-label="Open menu"><Menu size={20} /></button>
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} className="text-slate-400" />
            <span className="font-semibold text-slate-900 capitalize">{MODULES.find(m => m.id === active)?.label || "Dashboard"}</span>
          </div>
          <a href="/" className="ml-auto text-xs text-slate-500 hover:text-orange-600" target="_blank" rel="noreferrer">View Site →</a>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
