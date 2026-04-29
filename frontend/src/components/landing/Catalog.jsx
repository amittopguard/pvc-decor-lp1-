import { Download, ArrowRight } from "lucide-react";
import { track } from "@/lib/analytics";

const CATALOG = [
  { name: "Walnut Grove", category: "Wood", code: "KD-W-102", img: "https://images.pexels.com/photos/9467701/pexels-photo-9467701.jpeg" },
  { name: "Carrara White", category: "Marble", code: "KD-M-204", img: "https://images.pexels.com/photos/3847494/pexels-photo-3847494.jpeg" },
  { name: "Midnight Solid", category: "Solid", code: "KD-S-011", img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe" },
  { name: "Teak Linear", category: "Wood", code: "KD-W-118", img: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3" },
  { name: "Statuario Gold", category: "Marble", code: "KD-M-221", img: "https://images.unsplash.com/photo-1615529182904-14819c35db37" },
  { name: "Oyster Grey", category: "Solid", code: "KD-S-034", img: "https://images.unsplash.com/photo-1618221118493-9cfa1a1c00da" },
  { name: "Oak Rustic", category: "Wood", code: "KD-W-145", img: "https://images.unsplash.com/photo-1541123603104-512919d6a96c" },
  { name: "Nero Marquina", category: "Marble", code: "KD-M-260", img: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace" },
];

export default function Catalog() {
  const handleDownload = () => {
    track("catalog_download", { source: "catalog_section" });
    // Placeholder catalog download — opens WhatsApp to request catalog
    const msg = encodeURIComponent("Hi KDIPL, please send me the full PVC Decor Film & Laminate catalog.");
    window.open(`https://wa.me/919311342988?text=${msg}`, "_blank");
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
            onClick={handleDownload}
            data-testid="download-catalog-btn"
            className="group inline-flex items-center gap-3 bg-slate-900 text-white px-7 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-600 transition-colors self-start"
          >
            <Download size={16} />
            Download Full Catalog
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
            Request Sample Box
            <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}
