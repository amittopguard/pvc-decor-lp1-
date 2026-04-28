import { useEffect, useState } from "react";
import { ArrowUpRight, Globe, Truck, Factory, Sparkles } from "lucide-react";

const ROTATE = ["Imports", "Middlemen", "Long Lead Times", "Container MOQs"];

const AUDIENCES = [
  { id: "distributors", label: "I'm a Distributor", icon: Truck, target: "#distributors" },
  { id: "importers", label: "I'm an Importer", icon: Globe, target: "#importers" },
  { id: "manufacturers", label: "I'm a Manufacturer", icon: Factory, target: "#manufacturers" },
];

const TEXTURES = [
  { src: "https://images.pexels.com/photos/9467701/pexels-photo-9467701.jpeg", code: "KD-W-102", label: "Walnut Grove" },
  { src: "https://images.pexels.com/photos/3847494/pexels-photo-3847494.jpeg", code: "KD-M-204", label: "Carrara White" },
  { src: "https://images.unsplash.com/photo-1759262151165-3330c14fd982", code: "KD-D-001", label: "Press Finish" },
  { src: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe", code: "KD-S-011", label: "Midnight Solid" },
];

const MARQUEE = [
  "KD-W-102 Walnut", "KD-M-204 Carrara", "KD-S-011 Midnight", "KD-W-118 Teak Linear",
  "KD-M-221 Statuario Gold", "KD-S-034 Oyster Grey", "KD-W-145 Oak Rustic", "KD-M-260 Nero Marquina",
  "Vacuum Press Ready", "1mm · 3mm Laminate", "Pan-India Dispatch",
];

export default function Hero() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % ROTATE.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      id="top"
      data-testid="hero-section"
      className="relative bg-slate-950 text-white overflow-hidden noise-layer pt-28 pb-0"
    >
      {/* Grid texture overlay */}
      <div className="absolute inset-0 kdipl-grid-bg opacity-[0.07]" aria-hidden />
      {/* Vertical orange accent bar */}
      <div className="absolute left-6 lg:left-8 top-0 bottom-32 w-px bg-orange-500/40 hidden lg:block" aria-hidden />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 pt-10 lg:pt-16">
        {/* LEFT — copy column */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="flex items-center gap-3 fade-up">
            <span className="w-2 h-2 bg-orange-500 pulse-dot" />
            <span className="text-[10px] uppercase tracking-[0.28em] font-bold text-orange-400">
              Live since 2002 &middot; Made in India
            </span>
          </div>

          <h1 className="mt-7 font-display font-extrabold tracking-tight leading-[0.95] text-5xl sm:text-6xl lg:text-[5.25rem] fade-up">
            <span className="block text-slate-500 line-through decoration-orange-500 decoration-[6px] sm:decoration-[8px] underline-offset-[6px]">
              {ROTATE[idx]}.
            </span>
            <span className="block text-white mt-2">Source it&nbsp;direct.</span>
            <span className="block mt-2">
              <span className="text-orange-500">From the press,</span>{" "}
              <span className="text-white">to your line.</span>
            </span>
          </h1>

          <p className="mt-7 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl fade-up">
            KDIPL manufactures premium <strong className="text-white font-semibold">PVC Decor Film</strong> for vacuum-press membrane doors and now <strong className="text-white font-semibold">PVC Laminates 1&nbsp;mm &amp; 3&nbsp;mm</strong> for acrylic sheets &mdash; with 23 years of factory discipline behind every roll.
          </p>

          {/* Audience pills */}
          <div className="mt-8 flex flex-wrap gap-2.5 fade-up" data-testid="hero-audience-pills">
            {AUDIENCES.map((a) => (
              <a
                key={a.id}
                href={a.target}
                data-testid={`hero-pill-${a.id}`}
                className="group inline-flex items-center gap-2 border border-white/15 bg-white/5 backdrop-blur px-4 py-2.5 text-xs uppercase tracking-[0.14em] font-semibold text-white hover:bg-orange-600 hover:border-orange-600 transition-all"
              >
                <a.icon size={14} className="text-orange-400 group-hover:text-white transition-colors" />
                {a.label}
                <ArrowUpRight size={12} className="opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </a>
            ))}
          </div>

          {/* Primary CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 fade-up">
            <a
              href="#contact"
              data-testid="hero-cta-sample"
              className="group bg-orange-600 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-500 transition-all duration-200 inline-flex items-center justify-center gap-2"
            >
              <Sparkles size={16} /> Get a Free Sample Box
            </a>
            <a
              href="#catalog"
              data-testid="hero-cta-catalog"
              className="border border-white/25 text-white bg-transparent px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-white hover:text-slate-900 transition-all duration-200 inline-flex items-center justify-center gap-2"
            >
              Browse Catalog
              <ArrowUpRight size={16} />
            </a>
          </div>

          {/* Stat ticker */}
          <div className="mt-12 lg:mt-14 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 border-t border-white/10 pt-7 fade-up" data-testid="hero-stats">
            {[
              { v: "23+", l: "Years" },
              { v: "800+", l: "Designs" },
              { v: "1500mm", l: "Max Width" },
              { v: "5–15d", l: "Lead Time" },
            ].map((s, i) => (
              <div key={i} className="border-l border-white/10 pl-4 first:border-l-0 first:pl-0">
                <div className="font-display text-2xl sm:text-3xl font-bold text-white">{s.v}</div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — texture mosaic */}
        <div className="lg:col-span-5 relative">
          <div className="grid grid-cols-2 grid-rows-2 gap-2 sm:gap-3 aspect-[4/5] lg:aspect-auto lg:h-[640px]">
            {TEXTURES.map((t, i) => (
              <div
                key={i}
                data-testid={`hero-texture-${i}`}
                className={`relative overflow-hidden border border-white/10 group ${
                  i === 0 ? "row-span-2" : ""
                }`}
              >
                <img
                  src={t.src}
                  alt={t.label}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/10 to-transparent" />
                <div className="absolute bottom-0 left-0 p-3 sm:p-4">
                  <div className="text-[9px] uppercase tracking-[0.22em] text-orange-400 font-bold">{t.code}</div>
                  <div className="text-white text-xs sm:text-sm font-display font-semibold mt-0.5">{t.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Floating badge */}
          <div className="absolute -top-4 -left-4 sm:-top-6 sm:-left-6 bg-orange-600 text-white px-4 py-3 shadow-xl shadow-orange-900/40 hidden md:block">
            <div className="text-[9px] uppercase tracking-[0.22em] font-bold opacity-80">New Launch</div>
            <div className="font-display font-bold text-sm leading-tight">PVC Laminate 1mm &amp; 3mm</div>
          </div>

          <div className="absolute -bottom-4 -right-4 sm:-bottom-6 sm:-right-6 bg-white text-slate-900 px-4 py-3 shadow-xl hidden md:block">
            <div className="text-[9px] uppercase tracking-[0.22em] font-bold text-slate-500">Live</div>
            <div className="font-display font-bold text-sm leading-tight flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 pulse-dot rounded-full" />
              Sample dispatch &middot; today
            </div>
          </div>
        </div>
      </div>

      {/* Bottom marquee */}
      <div className="relative mt-14 lg:mt-20 border-t border-white/10 bg-slate-900/60">
        <div className="flex overflow-hidden no-scrollbar py-5">
          <div className="flex shrink-0 gap-12 animate-marquee whitespace-nowrap pr-12">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span
                key={i}
                className="text-xs uppercase tracking-[0.22em] text-slate-400 font-semibold flex items-center gap-3"
              >
                <span className="w-1 h-1 bg-orange-500" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
