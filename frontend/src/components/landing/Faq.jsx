import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { fetchCMS } from "@/lib/cms";

const FAQS_FALLBACK = [
  { q: "What is the MOQ for importers and distributors?", a: "We work with flexible MOQs — much lower than container-load imports. Exact MOQ depends on product and customization." },
  { q: "Do you ship internationally?", a: "Yes. We ship to ports worldwide. Typical lead time from PO to dispatch is 5–15 days." },
  { q: "Can I get custom designs or private-label prints?", a: "Absolutely. Private label and custom prints are available above a minimum order." },
  { q: "How do I become a TopDecor distributor?", a: "Fill the Distributor Application tab in the contact form. Our team reviews within 24 hours." },
  { q: "Are samples free?", a: "Yes, a physical sample box is free for serious enquiries in India." },
  { q: "What applications are 1mm and 3mm PVC laminates used for?", a: "1mm is bonded with acrylic sheets for cabinet shutters; 3mm is used as rigid decorative panelling." },
];

export default function Faq() {
  const [faqs, setFaqs] = useState(FAQS_FALLBACK);

  useEffect(() => {
    fetchCMS("faq").then((items) => {
      if (items && items.length > 0) setFaqs(items);
    });
  }, []);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((f) => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.a,
      },
    })),
  };

  return (
    <section data-testid="faq-section" className="py-20 sm:py-32 bg-white border-t border-slate-200">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        <div className="text-center">
          <div className="overline">08 &mdash; FAQs</div>
          <h2 className="mt-3 font-display font-bold text-slate-900 text-4xl sm:text-5xl tracking-tight">
            Questions, answered.
          </h2>
        </div>

        <Accordion type="single" collapsible className="mt-12 w-full">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-slate-200" data-testid={`faq-item-${i}`}>
              <AccordionTrigger className="text-left font-display font-semibold text-slate-900 text-base sm:text-lg hover:no-underline py-5">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-slate-600 text-sm sm:text-base leading-relaxed pb-5">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
