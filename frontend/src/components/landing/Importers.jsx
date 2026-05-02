import { Check, X } from "lucide-react";

const ROWS = [
  { k: "Lead Time", imp: "30–60 days + shipping", kd: "5–15 days (pan-India)" },
  { k: "Minimum Order", imp: "Full container loads", kd: "Low MOQ, flexible runs" },
  { k: "Customization", imp: "Rigid, long setup", kd: "Custom prints & textures" },
  { k: "Freight & Duty", imp: "High & volatile", kd: "Direct, predictable" },
  { k: "Quality Recourse", imp: "Cross-border disputes", kd: "Local QC & replacement" },
  { k: "After-Sales Support", imp: "Limited, time-zone gap", kd: "Dedicated KAM in India" },
  { k: "Working Capital", imp: "Blocked in transit", kd: "Faster inventory turns" },
];

export default function Importers() {
  return (
    <section
      id="importers"
      data-testid="importers-section"
      className="relative py-20 sm:py-32 bg-slate-950 text-white overflow-hidden noise-layer"
    >
      <img
        src="/images/shipping-containers.jpg"
        alt="Shipping containers logistics"
        width={1200}
        height={800}
        loading="lazy"
        decoding="async"
        className="absolute right-0 top-0 w-1/2 h-full object-cover opacity-15 hidden lg:block"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/95 to-transparent hidden lg:block" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="overline" style={{ color: "#fb923c" }}>03 &mdash; For Importers</div>
          <h2 className="mt-3 font-display font-bold text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
            Stop paying for <span className="text-orange-500">freight, duty and delays.</span>
          </h2>
          <p className="mt-6 text-slate-300 text-lg leading-relaxed">
            If you currently import PVC decor films from china— there is a simpler, faster and cheaper path. Manufactured in India, shipped locally or to your port.
          </p>
        </div>

        <div className="mt-14 border border-slate-700 bg-slate-900/60 backdrop-blur overflow-x-auto">
          <table className="w-full" data-testid="comparison-table">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="p-5 text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold">Parameter</th>
                <th className="p-5 text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold">Imported Supply</th>
                <th className="p-5 text-[11px] uppercase tracking-[0.2em] text-orange-400 font-bold border-l border-slate-700 bg-slate-900">
                  Factory Direct
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => (
                <tr key={i} className="border-b border-slate-800 last:border-0">
                  <td className="p-5 font-semibold text-white text-sm">{r.k}</td>
                  <td className="p-5 text-slate-400 text-sm">
                    <div className="flex items-start gap-2">
                      <X size={14} className="text-red-400 mt-1 shrink-0" />
                      {r.imp}
                    </div>
                  </td>
                  <td className="p-5 text-slate-100 text-sm border-l border-slate-800 bg-slate-900/50">
                    <div className="flex items-start gap-2">
                      <Check size={14} className="text-orange-400 mt-1 shrink-0" />
                      {r.kd}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => window.kdiplOpenComparison && window.kdiplOpenComparison()}
            data-testid="importers-cta-pricematch"
            className="bg-orange-600 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-500 transition-colors text-center inline-flex items-center justify-center gap-2"
          >
            Upload Your Invoice &mdash; We Beat It
          </button>
          <a
            href="#contact"
            data-testid="importers-cta-quote"
            className="border border-white/30 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-white hover:text-slate-900 transition-colors text-center"
          >
            Request Samples
          </a>
        </div>

        {/* Price-match teaser card */}
        <div
          data-testid="price-match-banner"
          className="mt-8 border border-orange-500/30 bg-orange-500/[0.06] p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center"
        >
          <div className="lg:col-span-8">
            <div className="text-[10px] uppercase tracking-[0.28em] font-bold text-orange-400">
              24-Hour Price Match Promise
            </div>
            <h3 className="mt-3 font-display font-bold text-2xl lg:text-3xl text-white leading-tight">
              Send us your latest import invoice. We&rsquo;ll send a counter-quote in 24 hours &mdash; or tell you honestly that you&rsquo;re already getting a great deal.
            </h3>
          </div>
          <div className="lg:col-span-4 flex lg:justify-end">
            <button
              onClick={() => window.kdiplOpenComparison && window.kdiplOpenComparison()}
              data-testid="price-match-banner-cta"
              className="bg-white text-slate-900 px-7 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-600 hover:text-white transition-colors w-full lg:w-auto"
            >
              Upload Invoice &rarr;
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
