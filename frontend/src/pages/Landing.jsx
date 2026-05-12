import { useEffect } from "react";
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
import { fetchCMSSingle } from "@/lib/cms";
import { API } from "@/lib/api";

// Resolve CMS image URLs
function resolveImg(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/api/media/")) return `${API.replace("/api", "")}${url}`;
  return url;
}

export default function Landing() {
  // Dynamically update favicon and page title from CMS branding
  useEffect(() => {
    fetchCMSSingle("branding").then((brand) => {
      if (!brand) return;

      // Update favicon
      const faviconUrl = resolveImg(brand.favicon_url);
      if (faviconUrl) {
        // Update existing favicon link
        let link = document.querySelector("link[rel='icon']");
        if (link) {
          link.href = faviconUrl;
        } else {
          link = document.createElement("link");
          link.rel = "icon";
          link.href = faviconUrl;
          document.head.appendChild(link);
        }

        // Also update apple-touch-icon
        let appleLink = document.querySelector("link[rel='apple-touch-icon']");
        if (appleLink) {
          appleLink.href = faviconUrl;
        }
      }
    });

    // Update page title and OG meta from SEO settings
    fetchCMSSingle("seo_settings").then((seo) => {
      if (!seo) return;
      if (seo.title) document.title = seo.title;
      const updateMeta = (selector, content) => {
        const el = document.querySelector(selector);
        if (el && content) el.setAttribute("content", content);
      };
      updateMeta('meta[name="description"]', seo.description);
      updateMeta('meta[property="og:title"]', seo.og_title);
      updateMeta('meta[property="og:description"]', seo.og_description);
      if (seo.og_image) {
        const ogImg = resolveImg(seo.og_image);
        updateMeta('meta[property="og:image"]', ogImg);
        updateMeta('meta[name="twitter:image"]', ogImg);
      }
    });
  }, []);

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
