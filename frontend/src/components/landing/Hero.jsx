import { ArrowUpRight, Factory, Globe, Layers } from "lucide-react";

export default function Hero() {
  return (
    <section
      id="top"
      data-testid="hero-section"
      className="relative min-h-[92vh] flex items-end overflow-hidden bg-slate-950"
    >
      <img
        src="https://images.pexels.com/photos/34221993/pexels-photo-34221993.jpeg"
        alt="Industrial manufacturing facility"
        className="absolute inset-0 w-full h-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/30" />
      <div className="absolute inset-0 kdipl-grid-bg opacity-20" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-32 pb-20 lg:pb-28 w-full">
        <div className="inline-flex items-center gap-2 border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-orange-300 font-bold fade-up">
          <span className="w-1.5 h-1.5 bg-orange-500 pulse-dot" />
          Made in India &middot; 23+ Years in the Industry
        </div>

        <h1 className="mt-6 font-display font-bold text-white text-5xl sm:text-6xl lg:text-7xl tracking-tight leading-[1.02] max-w-4xl fade-up">
          Stop Importing.<br />
          <span className="text-orange-500">Buy Direct</span> From India.
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl leading-relaxed fade-up">
          Premium <strong className="text-white font-semibold">PVC Decor Film</strong> for membrane doors via vacuum press, plus upcoming <strong className="text-white font-semibold">PVC Laminates 1&nbsp;mm &amp; 3&nbsp;mm</strong> for acrylic sheets. Engineered with 23 years of industry expertise.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-3 fade-up">
          <a
            href="#catalog"
            data-testid="hero-cta-catalog"
            className="group bg-orange-600 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-700 transition-all duration-200 flex items-center justify-center gap-2"
          >
            View Catalog
            <ArrowUpRight size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
          <a
            href="#contact"
            data-testid="hero-cta-distributor"
            className="border border-white/30 text-white bg-white/5 backdrop-blur px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-white hover:text-slate-900 transition-all duration-200 flex items-center justify-center gap-2"
          >
            Become a Distributor
          </a>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 border-t border-white/10 pt-10">
          {[
            { icon: Factory, label: "Vacuum Press", value: "In-house" },
            { icon: Layers, label: "PVC Laminates", value: "1mm · 3mm" },
            { icon: Globe, label: "Export Ready", value: "Pan-India" },
            { icon: null, label: "Experience", value: "23+ Years" },
          ].map((stat, i) => (
            <div key={i} className="flex items-start gap-3">
              {stat.icon ? (
                <stat.icon size={20} className="text-orange-500 mt-1 shrink-0" />
              ) : (
                <div className="w-5 h-5 border-2 border-orange-500 mt-1 shrink-0" />
              )}
              <div>
                <div className="text-xs uppercase tracking-widest text-slate-400">{stat.label}</div>
                <div className="text-white font-display font-semibold text-lg mt-0.5">{stat.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
