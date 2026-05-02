import { useEffect, useState } from "react";
import { Mail, Phone, MapPin } from "lucide-react";
import { fetchCMS } from "@/lib/cms";

export default function Footer() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetchCMS("products").then((items) => {
      if (items && items.length > 0) {
        setProducts(items.filter(p => p.active !== false).map(p => p.name || p.title || "Product"));
      }
    });
  }, []);

  return (
    <footer data-testid="site-footer" className="bg-slate-950 text-slate-300">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-orange-600 flex items-center justify-center">
              <span className="text-white font-display font-bold text-lg">T</span>
            </div>
            <div>
              <div className="font-display font-bold text-white text-xl">TopDecor</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Decor Films &amp; Laminates</div>
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-slate-400 max-w-md">
            Premium PVC Decor Film for membrane doors and Acrylic Sheets. Made in India, shipped worldwide. Backed by 23+ years of industry experience.
          </p>
        </div>

        <div className="md:col-span-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-orange-400 font-bold">Products</div>
          <ul className="mt-4 space-y-2 text-sm">
            {products.map((p, i) => (
              <li key={i}><a href="#products" className="hover:text-white">{p}</a></li>
            ))}
            <li><a href="#catalog" className="hover:text-white">Catalogue</a></li>
          </ul>
        </div>

        <div className="md:col-span-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-orange-400 font-bold">Contact</div>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <Phone size={14} className="mt-1 text-slate-500" />
              <a href="https://wa.me/919311342988" target="_blank" rel="noreferrer" className="hover:text-white">+91 93113 42988</a>
            </li>
            <li className="flex items-start gap-3">
              <Mail size={14} className="mt-1 text-slate-500" />
              <div>
                <a href="mailto:sales@kdipl.in" className="block hover:text-white">sales@kdipl.in</a>
                <a href="mailto:nm@kdipl.in" className="block text-slate-400 hover:text-white">nm@kdipl.in</a>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MapPin size={14} className="mt-1 text-slate-500" />
              <span>India &middot; Manufacturing &amp; Export</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>&copy; {new Date().getFullYear()} TopDecor. All rights reserved.</div>
          <div className="flex items-center gap-5">
            <a href="/admin" data-testid="footer-admin-link" className="hover:text-white">Admin</a>
            <a href="#top" className="hover:text-white">Back to top</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
