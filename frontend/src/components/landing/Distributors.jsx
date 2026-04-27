import { CheckCircle2, TrendingUp, MapPin, Truck } from "lucide-react";

const BENEFITS = [
  { icon: MapPin, title: "Territory Exclusivity", body: "Lock your region and grow with dedicated support." },
  { icon: TrendingUp, title: "Distributor Margins", body: "Competitive slabs that reward volume and loyalty." },
  { icon: Truck, title: "Consistent Supply", body: "23 years of production discipline — on time, every month." },
  { icon: CheckCircle2, title: "Co-Marketing Kit", body: "Catalog, digital assets, sample books and POS support." },
];

export default function Distributors() {
  return (
    <section
      id="distributors"
      data-testid="distributors-section"
      className="relative py-20 sm:py-32 bg-slate-50 border-y border-slate-200"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-5">
            <div className="overline">02 &mdash; Priority Partner</div>
            <h2 className="mt-3 font-display font-bold text-slate-900 text-4xl sm:text-5xl tracking-tight leading-[1.05]">
              Build a territory.<br />Own the market.
            </h2>
            <p className="mt-6 text-slate-600 text-lg leading-relaxed max-w-md">
              We are actively onboarding <strong className="text-slate-900">prospect distributors</strong> across India and neighbouring markets. If you already move decor films, laminates, plywood or hardware — let&rsquo;s talk.
            </p>
            <a
              href="#contact"
              data-testid="distributors-cta"
              className="mt-8 inline-flex items-center gap-2 bg-slate-900 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-600 transition-colors"
            >
              Apply for Distributorship
            </a>

            <div className="mt-10 border-t border-slate-200 pt-6 grid grid-cols-3 gap-4">
              {[
                { v: "23+", l: "Years" },
                { v: "Pan-India", l: "Network" },
                { v: "Low MOQ", l: "Start-up" },
              ].map((s, i) => (
                <div key={i}>
                  <div className="font-display text-2xl font-bold text-slate-900">{s.v}</div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-200 border border-slate-200">
              {BENEFITS.map((b, i) => (
                <div
                  key={i}
                  data-testid={`distributor-benefit-${i}`}
                  className="bg-white p-7 lg:p-9 hover:bg-slate-50 transition-colors"
                >
                  <b.icon size={26} className="text-orange-600" strokeWidth={1.5} />
                  <h3 className="mt-5 font-display font-semibold text-slate-900 text-lg">{b.title}</h3>
                  <p className="mt-2 text-slate-600 text-sm leading-relaxed">{b.body}</p>
                  <div className="mt-5 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold">
                    <span className="w-4 h-px bg-slate-300" />
                    0{i + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
