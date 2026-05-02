import { useEffect, useState } from "react";
import { fetchCMS } from "@/lib/cms";

const STEPS_FALLBACK = [
  { n: "01", title: "Raw Material QC", body: "Sourced PVC and additives tested for tensile, gloss and colour stability." },
  { n: "02", title: "Printing & Coating", body: "High-definition texture printing with protective top coats for durability." },
  { n: "03", title: "In-house Lab Testing", body: "In-house lab for batch-to-batch thickness consistency." },
  { n: "04", title: "Inspection & Dispatch", body: "Batch-wise QC, roll/sheet labelling, and secure freight-ready packaging." },
];

export default function Trust() {
  const [steps, setSteps] = useState(STEPS_FALLBACK);

  useEffect(() => {
    fetchCMS("trust").then((items) => {
      if (items && items.length > 0) {
        setSteps(items.map((s, i) => ({
          n: s.step || String(i + 1).padStart(2, "0"),
          title: s.title,
          body: s.body,
        })));
      }
    });
  }, []);

  return (
    <section data-testid="trust-section" className="py-20 sm:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-4">
            <div className="overline">06 &mdash; Process &amp; Trust</div>
            <h2 className="mt-3 font-display font-bold text-slate-900 text-4xl sm:text-5xl tracking-tight leading-[1.05]">
              Engineered,<br />not assembled.
            </h2>
            <p className="mt-5 text-slate-600 text-lg leading-relaxed">
              Four disciplined stages, 23 years refined. Every roll and sheet that leaves our floor is accounted for.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-5 border-t border-slate-200 pt-8">
              {[
                { v: "23+", l: "Years Industry" },
                { v: "1350mm", l: "Max Film Width" },
                { v: "100%", l: "Batch QC" },
                { v: "Pan-India", l: "Distribution" },
              ].map((s, i) => (
                <div key={i} data-testid={`trust-stat-${i}`}>
                  <div className="font-display text-3xl font-bold text-slate-900">{s.v}</div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8">
            <ol className="space-y-5">
              {steps.map((s, i) => (
                <li
                  key={i}
                  className="group border border-slate-200 p-7 lg:p-9 flex flex-col sm:flex-row sm:items-center gap-5 hover:border-slate-900 transition-colors"
                >
                  <div className="font-display text-5xl font-extrabold text-slate-200 group-hover:text-orange-500 transition-colors w-20 shrink-0">
                    {s.n}
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-slate-900">{s.title}</h3>
                    <p className="mt-1.5 text-slate-600 text-sm leading-relaxed max-w-xl">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
