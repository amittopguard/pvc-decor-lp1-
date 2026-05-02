import { useEffect, useState } from "react";
import { Quote, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { fetchCMS } from "@/lib/cms";

const TESTIMONIALS_FALLBACK = [
  { quote: "We switched from a Chinese supplier to TopDecor last year. Lead time dropped from 45 days to under a week.", name: "R. Sundaresan", role: "Production Head", company: "Door Manufacturer · Tamil Nadu", audience: "Manufacturer", rating: 5 },
  { quote: "Started as a regional distributor three years ago. Today my territory does 4× the volume I planned.", name: "Vikas Mehta", role: "Founder", company: "Plywood & Laminate Distributor · Pune", audience: "Distributor", rating: 5 },
];

const LOGOS = [
  "Sundaram Doors", "Maruti Ply", "Royal Interiors", "Apex Furniture",
  "Veneer Hub", "Decor Mart", "PressMax", "ModuleHaus",
];

export default function Testimonials() {
  const [testimonials, setTestimonials] = useState(TESTIMONIALS_FALLBACK);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    fetchCMS("testimonials").then((items) => {
      if (items && items.length > 0) setTestimonials(items);
    });
  }, []);

  const total = testimonials.length;
  const t = testimonials[idx] || testimonials[0];

  const go = (delta) => setIdx((i) => (i + delta + total) % total);

  return (
    <section
      id="testimonials"
      data-testid="testimonials-section"
      className="relative py-20 sm:py-32 bg-slate-50 border-y border-slate-200 overflow-hidden"
    >
      <div className="absolute inset-0 kdipl-grid-bg opacity-[0.5]" aria-hidden />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14">
          <div className="max-w-2xl">
            <div className="overline">07 &mdash; Said by buyers</div>
            <h2 className="mt-3 font-display font-bold text-slate-900 text-4xl sm:text-5xl tracking-tight leading-[1.05]">
              23 years &mdash; said in <span className="text-orange-600">their words.</span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => go(-1)}
              data-testid="testimonial-prev"
              className="w-12 h-12 border border-slate-300 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors flex items-center justify-center"
              aria-label="Previous testimonial"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => go(1)}
              data-testid="testimonial-next"
              className="w-12 h-12 border border-slate-300 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-colors flex items-center justify-center"
              aria-label="Next testimonial"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Featured quote */}
        <article
          key={idx}
          data-testid={`testimonial-card-${idx}`}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 border border-slate-200 bg-white p-8 sm:p-12 fade-up"
        >
          <div className="lg:col-span-1">
            <Quote size={48} className="text-orange-600" strokeWidth={1.2} />
          </div>

          <div className="lg:col-span-8">
            <div className="flex items-center gap-1 mb-5">
              {Array.from({ length: t.rating || 5 }).map((_, i) => (
                <Star key={i} size={14} className="text-orange-500" fill="currentColor" />
              ))}
            </div>
            <blockquote className="font-display text-2xl sm:text-3xl text-slate-900 leading-snug tracking-tight">
              &ldquo;{t.quote}&rdquo;
            </blockquote>
            <div className="mt-7 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 text-orange-500 font-display font-bold flex items-center justify-center text-lg">
                {t.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              <div>
                <div className="font-display font-semibold text-slate-900">{t.name}</div>
                <div className="text-sm text-slate-500">{t.role} &middot; {t.company}</div>
              </div>
              <span className="ml-auto text-[10px] uppercase tracking-[0.22em] bg-orange-50 border border-orange-200 text-orange-700 font-bold px-3 py-1.5">
                {t.audience}
              </span>
            </div>
          </div>

          <div className="lg:col-span-3 lg:pl-8 lg:border-l border-slate-200">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-slate-500">Index</div>
            <div className="mt-3 font-display font-bold text-5xl text-slate-900">
              {String(idx + 1).padStart(2, "0")}
              <span className="text-slate-300"> / {String(total).padStart(2, "0")}</span>
            </div>
            <div className="mt-6 space-y-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  data-testid={`testimonial-dot-${i}`}
                  className={`block w-full text-left text-xs uppercase tracking-[0.18em] font-semibold py-2 px-3 transition-colors ${
                    i === idx ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  &mdash; {testimonials[i].audience}
                </button>
              ))}
            </div>
          </div>
        </article>

        {/* Trusted-by logo strip */}
        <div className="mt-14 border-t border-slate-200 pt-10">
          <div className="text-[10px] uppercase tracking-[0.28em] font-bold text-slate-500 text-center mb-6">
            Trusted by 200+ door &amp; furniture makers across India
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {LOGOS.map((name, i) => (
              <span
                key={i}
                data-testid={`logo-${i}`}
                className="font-display font-bold text-slate-400 text-base sm:text-lg tracking-tight hover:text-slate-700 transition-colors"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
