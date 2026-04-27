import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQS = [
  {
    q: "What is the MOQ for importers and distributors?",
    a: "We work with flexible MOQs — much lower than container-load imports. Exact MOQ depends on product (decor film vs 1mm/3mm laminate) and customization. Share your requirement via the form and we'll propose a slab.",
  },
  {
    q: "Do you ship internationally?",
    a: "Yes. We ship to ports worldwide. We can handle export documentation and coordinate with your forwarder. Typical lead time from PO to dispatch is 5–15 days.",
  },
  {
    q: "Can I get custom designs or private-label prints?",
    a: "Absolutely. Private label and custom prints are available above a minimum order. Our design team will mock up and share press proofs before bulk production.",
  },
  {
    q: "How do I become a KDIPL distributor?",
    a: "Fill the Distributor Application tab in the contact form with your territory, years in trade and expected volume. Our team reviews within 24 hours and schedules a call.",
  },
  {
    q: "Are samples free?",
    a: "Yes, a physical sample box is free for serious enquiries in India. For international prospects we cover samples but request that freight be arranged by the buyer.",
  },
  {
    q: "What applications are 1mm and 3mm PVC laminates used for?",
    a: "1mm is typically bonded with acrylic sheets for cabinet shutters and wardrobe fronts; 3mm is used as rigid decorative panelling for wall cladding, furniture and modular interiors.",
  },
];

export default function Faq() {
  return (
    <section data-testid="faq-section" className="py-20 sm:py-32 bg-white border-t border-slate-200">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        <div className="text-center">
          <div className="overline">08 &mdash; FAQs</div>
          <h2 className="mt-3 font-display font-bold text-slate-900 text-4xl sm:text-5xl tracking-tight">
            Questions, answered.
          </h2>
        </div>

        <Accordion type="single" collapsible className="mt-12 w-full">
          {FAQS.map((f, i) => (
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
