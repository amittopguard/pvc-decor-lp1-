import { useEffect, useState } from "react";
import { ArrowUpRight, Sparkles, Truck, Globe, Factory } from "lucide-react";
import { fetchCMSSingle } from "@/lib/cms";

const ICON_MAP = { Truck, Globe, Factory };

const AUDIENCES_FALLBACK = [
  { id: "distributors", label: "Distributor", icon: Truck, target: "#distributors" },
  { id: "importers", label: "Importer", icon: Globe, target: "#importers" },
  { id: "manufacturers", label: "Manufacturer", icon: Factory, target: "#manufacturers" },
];

const MARQUEE = [
  "PVC Decor Film", "Vacuum Press Ready", "Acrylic Sheets",
  "Pan-India Dispatch", "Custom Prints", "Low MOQ", "Export Documentation",
  "Walnut · Marble · Solid", "23 Years In The Press",
];

function useCountUp(end, durationMs = 1400, start = 0) {
  const [v, setV] = useState(start);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, durationMs, start]);
  return v;
}

export default function Hero() {
  const days = useCountUp(5, 1600);
  const importDays = useCountUp(47, 1600);
  const [hero, setHero] = useState(null);
  const [audiences, setAudiences] = useState(AUDIENCES_FALLBACK);

  useEffect(() => {
    fetchCMSSingle("hero").then((d) => { if (d) setHero(d); });
    import("@/lib/cms").then(({ fetchCMS }) => {
      fetchCMS("audience").then((items) => {
        if (items && items.length > 0) {
          setAudiences(items.map((a) => ({
            id: a.audience_id || a.id,
            label: a.label,
            icon: ICON_MAP[a.icon] || Truck,
            target: a.target || "#contact",
          })));
        }
      });
    });
  }, []);

  // Fallback values
  const headline = hero?.headline || "Imports are slow.";
  const subHeadline = hero?.sub_headline || "And expensive. And, honestly —";
  const twistLine = hero?.twist_line || "OPTIONAL.";
  const description = hero?.description || "We manufacture PVC Decor Film for Membrane Door and Acrylic Sheets. From our floor to yours.";
  const ctaText = hero?.cta_text || "Get a Free Sample Box";
  const ctaLink = hero?.cta_link || "#contact";
  const cta2Text = hero?.cta2_text || "Beat My Import Price";

  return (
    <section
      id="top"
      data-testid="hero-section"
      className="relative bg-slate-950 text-white overflow-hidden noise-layer pt-28 pb-0"
    >
      {/* SEO: single h1 for the page */}
      <h1 className="sr-only">TopDecor — PVC Decor Film for Membrane Doors</h1>

      {/* Backdrop layers */}
      <div className="absolute inset-0 kdipl-grid-bg opacity-[0.06]" aria-hidden />
      <div
        className="absolute -right-32 top-20 w-[640px] h-[640px] rounded-full opacity-[0.06] blur-3xl bg-orange-500"
        aria-hidden
      />

      {/* Stamp badge — top right */}
      <div
        data-testid="hero-stamp"
        className="hidden lg:flex absolute top-24 right-8 items-center gap-3 border border-orange-500/40 px-3 py-1.5 rotate-[3deg]"
      >
        <span className="w-1.5 h-1.5 bg-orange-500 pulse-dot" />
        <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-orange-400">
          Origin India &middot; Seal 23/02
        </span>
      </div>

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 pt-12 lg:pt-20">
        {/* LEFT — declarative stack */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="flex items-center gap-3 fade-up">
            <span className="w-8 h-px bg-orange-500" />
            <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-orange-400">
              TopDecor &middot; Manufacturer &middot; Since 2002
            </span>
          </div>

          {/* The stab — declarative stacked lines */}
          <div className="mt-8 font-display font-extrabold tracking-tight leading-[0.92] fade-up">
            <div className="text-white text-5xl sm:text-7xl lg:text-[6rem]">
              {headline}
            </div>
            <div className="text-slate-400 text-3xl sm:text-5xl lg:text-7xl mt-3 sm:mt-4 pl-4 sm:pl-12 lg:pl-24">
              {subHeadline.split("—")[0]}
            </div>
            {subHeadline.includes("—") && (
              <div className="text-slate-500 text-xl sm:text-3xl lg:text-4xl mt-3 sm:mt-4 pl-8 sm:pl-24 lg:pl-48">
                And, honestly &mdash;
              </div>
            )}

            {/* The twist — full bleed orange line with a flicker */}
            <div className="mt-5 sm:mt-7 relative">
              <div className="text-orange-500 text-6xl sm:text-7xl lg:text-[7.5rem] leading-none tracking-tight">
                {twistLine}
              </div>
              <span className="absolute -top-2 -right-2 sm:top-0 sm:right-2 lg:top-2 lg:right-6 text-[10px] uppercase tracking-[0.28em] font-bold text-orange-300 hidden sm:block">
                ____ TopDecor replaces them.
              </span>
            </div>
          </div>

          {/* Twist sub-line */}
          <p className="mt-8 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl fade-up"
            dangerouslySetInnerHTML={{ __html: description.replace(/PVC Decor Film/g, '<strong class="text-white font-semibold">PVC Decor Film</strong>').replace(/PVC Laminates/g, '<strong class="text-white font-semibold">PVC Laminates</strong>') }}
          />

          {/* Audience pills */}
          <div className="mt-8 flex flex-wrap gap-2.5 fade-up" data-testid="hero-audience-pills">
            {audiences.map((a) => (
              <a
                key={a.id}
                href={a.target}
                data-testid={`hero-pill-${a.id}`}
                className="group inline-flex items-center gap-2 border border-white/15 bg-white/5 backdrop-blur px-4 py-2.5 text-xs uppercase tracking-[0.16em] font-semibold text-white hover:bg-orange-600 hover:border-orange-600 transition-all"
              >
                <a.icon size={14} className="text-orange-400 group-hover:text-white transition-colors" />
                I&rsquo;m a {a.label}
                <ArrowUpRight size={12} className="opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </a>
            ))}
          </div>

          {/* Primary CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 fade-up">
            <a
              href={ctaLink}
              data-testid="hero-cta-sample"
              className="group bg-orange-600 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-500 transition-all duration-200 inline-flex items-center justify-center gap-2"
            >
              <Sparkles size={16} /> {ctaText}
            </a>
            <button
              onClick={() => window.kdiplOpenComparison && window.kdiplOpenComparison()}
              data-testid="hero-cta-savings"
              className="border border-white/25 text-white bg-transparent px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-white hover:text-slate-900 transition-all duration-200 inline-flex items-center justify-center gap-2"
            >
              {cta2Text}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>

        {/* RIGHT — proof tile column */}
        <div className="lg:col-span-4 flex flex-col gap-5 fade-up" data-testid="hero-proof-column">
          {/* The 47 → 5 days proof */}
          <div className="border border-orange-500/30 bg-slate-900/60 backdrop-blur p-7 relative overflow-hidden">
            <div className="absolute top-0 left-0 h-full w-1 bg-orange-500" />
            <div className="text-[10px] uppercase tracking-[0.28em] font-bold text-orange-400">
              Days from PO &rarr; factory floor
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 items-end">
              <div className="relative">
                <div className="font-display font-extrabold text-6xl text-slate-500 leading-none">
                  {importDays}
                </div>
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-orange-500 -rotate-6" />
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-semibold mt-3">
                  Imported &mdash; sea
                </div>
              </div>
              <div>
                <div className="font-display font-extrabold text-6xl text-orange-500 leading-none">
                  {days}
                </div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-orange-300 font-bold mt-3">
                  Factory Direct
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 text-xs text-slate-400 leading-relaxed">
              Average for a 5,000 sqm order. <span className="text-white font-semibold">42 days back into your working capital.</span>
            </div>
          </div>

          {/* Stat micro-tiles */}
          <div className="grid grid-cols-2 gap-px bg-white/10 border border-white/10">
            {[
              { v: "23+", l: "Years pressing" },
              { v: "800+", l: "Designs" },
              { v: "1350", l: "mm max width" },
              { v: "Low", l: "MOQ" },
            ].map((s, i) => (
              <div key={i} className="bg-slate-950/80 p-5">
                <div className="font-display font-extrabold text-2xl text-white leading-none">{s.v}</div>
                <div className="text-[9px] uppercase tracking-[0.22em] text-slate-400 mt-2.5 font-bold">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Live ticker */}
          <div className="border border-white/10 bg-slate-900/60 px-5 py-3.5 flex items-center gap-3">
            <span className="w-2 h-2 bg-green-500 rounded-full pulse-dot" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-slate-300 font-semibold">
              Sample dispatch &middot; today &middot; Delhi
            </span>
          </div>
        </div>
      </div>

      {/* Bottom marquee */}
      <div className="relative mt-14 lg:mt-20 border-t border-white/10 bg-slate-900/80">
        <div className="flex overflow-hidden no-scrollbar py-4">
          <div className="flex shrink-0 gap-12 animate-marquee whitespace-nowrap pr-12">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span
                key={i}
                className="text-xs uppercase tracking-[0.28em] text-slate-400 font-semibold flex items-center gap-3"
              >
                <span className="w-1.5 h-1.5 bg-orange-500 rotate-45" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
