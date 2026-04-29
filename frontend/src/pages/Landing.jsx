import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import Products from "@/components/landing/Products";
import Distributors from "@/components/landing/Distributors";
import Importers from "@/components/landing/Importers";
import Manufacturers from "@/components/landing/Manufacturers";
import Catalog from "@/components/landing/Catalog";
import Trust from "@/components/landing/Trust";
import Testimonials from "@/components/landing/Testimonials";
import LeadForms from "@/components/landing/LeadForms";
import Faq from "@/components/landing/Faq";
import Footer from "@/components/landing/Footer";
import WhatsAppFab from "@/components/landing/WhatsAppFab";

export default function Landing() {
  return (
    <div data-testid="landing-page" className="bg-white">
      <Header />
      <main>
        <Hero />
        <Products />
        <Distributors />
        <Importers />
        <Manufacturers />
        <Catalog />
        <Trust />
        <LeadForms />
        <Faq />
      </main>
      <Footer />
      <WhatsAppFab />
    </div>
  );
}
