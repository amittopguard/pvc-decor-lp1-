import { useState } from "react";
import { Download, ArrowRight, X, Loader2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api";

const CATALOG = [
  { name: "Walnut Grove", category: "Wood", code: "KD-W-102", img: "/images/walnut-texture.jpg" },
  { name: "Carrara White", category: "Marble", code: "KD-M-204", img: "/images/marble-texture.jpg" },
  { name: "Midnight Solid", category: "Solid", code: "KD-S-011", img: "/images/abstract-gradient.jpg" },
  { name: "Teak Linear", category: "Wood", code: "KD-W-118", img: "/images/teak-wood.jpg" },
  { name: "Statuario Gold", category: "Marble", code: "KD-M-221", img: "/images/statuario-marble.jpg" },
  { name: "Oyster Grey", category: "Solid", code: "KD-S-034", img: "/images/oyster-grey.jpg" },
  { name: "Oak Rustic", category: "Wood", code: "KD-W-145", img: "/images/oak-rustic.jpg" },
  { name: "Nero Marquina", category: "Marble", code: "KD-M-260", img: "/images/nero-marquina.jpg" },
];

export default function Catalog() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const up = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone) {
      setError("Please fill all fields.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.post("/leads", {
        type: "catalogue",
        name: form.name,
        email: form.email,
        phone: form.phone,
        product_interest: "Full Catalogue",
        message: "Requested full catalogue download.",
      });
      track("catalog_download", { source: "catalog_form" });
      setSuccess(true);
    } catch (err) {
      setError("Could not submit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowForm(false);
    setForm({ name: "", email: "", phone: "" });
    setError("");
    setSuccess(false);
  };

  return (
    <section id="catalog" data-testid="catalog-section" className="py-20 sm:py-32 bg-slate-50 border-y border-slate-200">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-14">
          <div className="max-w-2xl">
            <div className="overline">05 &mdash; Design Library</div>
            <h2 className="mt-3 font-display font-bold text-slate-900 text-4xl sm:text-5xl tracking-tight leading-[1.05]">
              Eight hundred finishes.<br />Here are a few.
            </h2>
          </div>
          <button
            onClick={() => setShowForm(true)}
            data-testid="download-catalog-btn"
            className="group inline-flex items-center gap-3 bg-slate-900 text-white px-7 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-600 transition-colors self-start"
          >
            <Download size={16} />
            Download Full Catalogue
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
          {CATALOG.map((item, i) => (
            <div
              key={i}
              data-testid={`catalog-item-${i}`}
              className="group border border-slate-200 bg-white overflow-hidden card-lift"
            >
              <div className="aspect-square overflow-hidden bg-slate-100">
                <img
                  src={item.img}
                  alt={item.name}
                  width={400}
                  height={400}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="p-4 border-t border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold text-slate-900 text-sm truncate">{item.name}</h3>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-orange-600 font-bold shrink-0">
                    {item.category}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono">{item.code}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-14 border border-slate-900 bg-slate-900 text-white p-8 lg:p-12 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-orange-400 font-bold">Physical Sample Box</div>
            <h3 className="mt-3 font-display font-bold text-2xl lg:text-3xl leading-tight">
              Feel the material. Request a physical sample book free of cost.
            </h3>
          </div>
          <a
            href="#contact"
            data-testid="catalog-sample-cta"
            className="inline-flex items-center gap-2 bg-orange-600 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-500 transition-colors shrink-0"
          >
            Request a Physical Sample — Free of Cost
            <ArrowRight size={16} />
          </a>
        </div>
      </div>

      {/* Catalogue Download Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" data-testid="catalog-modal">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={handleClose} />

          {/* Modal */}
          <div className="relative bg-white w-full max-w-md p-8 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-900 transition-colors"
              aria-label="Close"
              data-testid="catalog-modal-close"
            >
              <X size={20} />
            </button>

            {!success ? (
              <>
                <div className="text-[10px] uppercase tracking-[0.22em] text-orange-600 font-bold">
                  Download Catalogue
                </div>
                <h3 className="mt-2 font-display font-bold text-slate-900 text-xl leading-tight">
                  Fill your details to receive the full catalogue.
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  We&rsquo;ll send the catalogue to your email and WhatsApp.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4" data-testid="catalog-form">
                  <div>
                    <label className="block text-xs uppercase tracking-[0.14em] font-semibold text-slate-700 mb-1.5">
                      Full Name <span className="text-orange-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={up("name")}
                      data-testid="catalog-input-name"
                      className="w-full border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-orange-600 transition-all"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.14em] font-semibold text-slate-700 mb-1.5">
                      Email <span className="text-orange-600">*</span>
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={up("email")}
                      data-testid="catalog-input-email"
                      className="w-full border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-orange-600 transition-all"
                      placeholder="you@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.14em] font-semibold text-slate-700 mb-1.5">
                      Phone / WhatsApp <span className="text-orange-600">*</span>
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={up("phone")}
                      data-testid="catalog-input-phone"
                      className="w-full border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-orange-600 transition-all"
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 font-medium">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    data-testid="catalog-submit-btn"
                    className="w-full bg-orange-600 text-white px-6 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-700 disabled:opacity-70 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Send Me The Catalogue
                  </button>

                  <p className="text-[11px] text-slate-400 text-center">
                    By submitting you agree to be contacted by TopDecor.
                  </p>
                </form>
              </>
            ) : (
              <div className="text-center py-6" data-testid="catalog-success">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="font-display font-bold text-slate-900 text-xl">
                  Thank you, {form.name.split(" ")[0]}!
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Our team will share the full catalogue on your email and WhatsApp shortly.
                </p>
                <button
                  onClick={handleClose}
                  className="mt-6 bg-slate-900 text-white px-6 py-3 text-sm font-semibold uppercase tracking-wider hover:bg-orange-600 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
