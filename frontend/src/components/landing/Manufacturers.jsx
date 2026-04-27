import { Hammer, ShieldCheck, Repeat2, Ruler } from "lucide-react";

const POINTS = [
  { icon: Ruler, title: "Consistent Specs", body: "Every roll and sheet to specification — thickness, gloss, colour." },
  { icon: ShieldCheck, title: "QC on Every Batch", body: "In-house lab testing before dispatch. No surprises on your line." },
  { icon: Repeat2, title: "Repeat Production", body: "We keep patterns alive — reorder the exact same design, reliably." },
  { icon: Hammer, title: "Built for Press Shops", body: "Tuned for vacuum-press membrane doors and rigid laminate applications." },
];

export default function Manufacturers() {
  return (
    <section
      id="manufacturers"
      data-testid="manufacturers-section"
      className="py-20 sm:py-32 bg-white"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <div className="overline">04 &mdash; For Manufacturers</div>
            <h2 className="mt-3 font-display font-bold text-slate-900 text-4xl sm:text-5xl tracking-tight leading-[1.05]">
              Door &amp; furniture makers — your consistent supply partner.
            </h2>
            <p className="mt-6 text-slate-600 text-lg leading-relaxed">
              If your line consumes PVC decor film or laminate daily, you already know the pain of inconsistent imports. KDIPL replaces that with predictable, local, spec-matched supply.
            </p>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-5">
              {POINTS.map((p, i) => (
                <div key={i} className="border border-slate-200 p-6 card-lift">
                  <p.icon size={22} className="text-orange-600" strokeWidth={1.6} />
                  <h3 className="mt-4 font-display font-semibold text-slate-900">{p.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{p.body}</p>
                </div>
              ))}
            </div>

            <a
              href="#contact"
              data-testid="manufacturers-cta"
              className="mt-10 inline-flex items-center gap-2 bg-slate-900 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-600 transition-colors"
            >
              Start Your Trial Order
            </a>
          </div>

          <div className="relative">
            <div className="aspect-[4/5] overflow-hidden border border-slate-200">
              <img
                src="https://images.unsplash.com/photo-1759262151165-3330c14fd982"
                alt="PVC membrane door finished premium"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 bg-slate-900 text-white p-6 w-56 hidden md:block">
              <div className="text-[10px] uppercase tracking-[0.22em] text-orange-400 font-bold">Process</div>
              <div className="mt-2 font-display text-xl font-semibold leading-tight">Vacuum Press tested</div>
              <div className="mt-1 text-xs text-slate-400">1500mm+ film widths</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
