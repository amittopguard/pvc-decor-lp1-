import { ArrowRight } from "lucide-react";

const PRODUCTS = [
  {
    tag: "Flagship",
    title: "PVC Decor Film",
    subtitle: "For PVC Membrane Doors",
    process: "Vacuum Press Process",
    points: ["3D wrap ready", "Scratch & moisture resistant", "Wide design library", "Custom print runs"],
    image: "https://images.unsplash.com/photo-1759262151165-3330c14fd982",
    accent: "bg-orange-600",
  },
  {
    tag: "New Launch",
    title: "PVC Laminate 1 mm",
    subtitle: "For Acrylic Sheets & Panels",
    process: "Pressed & Polished",
    points: ["High-gloss finish", "UV stable", "Easy to fabricate", "Uniform thickness"],
    image: "https://images.pexels.com/photos/9467701/pexels-photo-9467701.jpeg",
    accent: "bg-slate-900",
  },
  {
    tag: "New Launch",
    title: "PVC Laminate 3 mm",
    subtitle: "Rigid Decorative Sheets",
    process: "Pressed & Polished",
    points: ["Structural thickness", "Textured & solid ranges", "Cut-to-size", "Contract pricing"],
    image: "https://images.pexels.com/photos/3847494/pexels-photo-3847494.jpeg",
    accent: "bg-slate-900",
  },
];

export default function Products() {
  return (
    <section id="products" data-testid="products-section" className="py-20 sm:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14">
          <div className="max-w-2xl">
            <div className="overline">01 &mdash; Product Line</div>
            <h2 className="mt-3 font-display font-bold text-slate-900 text-4xl sm:text-5xl tracking-tight">
              Three products.<br />One engineered standard.
            </h2>
          </div>
          <p className="text-slate-600 max-w-md text-base leading-relaxed">
            From flagship decor films to new-launch rigid laminates, KDIPL is built to replace imports with consistent, local supply.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCTS.map((p, i) => (
            <article
              key={i}
              data-testid={`product-card-${i}`}
              className="card-lift group relative border border-slate-200 bg-white flex flex-col overflow-hidden"
            >
              <div className="relative h-64 overflow-hidden bg-slate-100">
                <img
                  src={p.image}
                  alt={p.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <span className={`absolute top-4 left-4 ${p.accent} text-white text-[10px] uppercase tracking-[0.2em] font-bold px-3 py-1.5`}>
                  {p.tag}
                </span>
              </div>

              <div className="p-7 flex-1 flex flex-col">
                <div className="text-xs uppercase tracking-widest text-slate-500">{p.process}</div>
                <h3 className="mt-2 font-display text-2xl font-bold text-slate-900">{p.title}</h3>
                <p className="text-slate-600 text-sm mt-1">{p.subtitle}</p>

                <ul className="mt-5 space-y-2 flex-1">
                  {p.points.map((pt, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="w-1 h-1 bg-orange-600 mt-2 shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>

                <a
                  href="#contact"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 border-b border-slate-900 self-start pb-0.5 hover:text-orange-600 hover:border-orange-600 transition-colors"
                >
                  Request this product
                  <ArrowRight size={14} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
