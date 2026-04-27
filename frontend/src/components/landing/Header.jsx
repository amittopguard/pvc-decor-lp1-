import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { KDIPL } from "@/lib/api";

const NAV = [
  { href: "#products", label: "Products" },
  { href: "#distributors", label: "Distributors" },
  { href: "#importers", label: "Importers" },
  { href: "#catalog", label: "Catalog" },
  { href: "#contact", label: "Contact" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-testid="site-header"
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/95 backdrop-blur border-b border-slate-200" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
        <a href="#top" data-testid="logo-link" className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-slate-900 flex items-center justify-center">
            <span className="text-orange-500 font-display font-bold text-lg tracking-tight">K</span>
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-slate-900 text-lg">{KDIPL.company}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 -mt-0.5">Decor Films &amp; Laminates</div>
          </div>
        </a>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className="text-sm font-medium text-slate-700 hover:text-orange-600 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <a
            href="#contact"
            data-testid="header-cta-sample"
            className="bg-orange-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-orange-700 transition-colors"
          >
            Request Sample
          </a>
        </div>

        <button
          data-testid="mobile-menu-toggle"
          className="lg:hidden p-2"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden bg-white border-t border-slate-200" data-testid="mobile-menu">
          <div className="px-6 py-4 flex flex-col gap-4">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-base font-medium text-slate-800"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#contact"
              onClick={() => setOpen(false)}
              className="bg-orange-600 text-white px-5 py-3 text-sm font-semibold text-center"
            >
              Request Sample
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
