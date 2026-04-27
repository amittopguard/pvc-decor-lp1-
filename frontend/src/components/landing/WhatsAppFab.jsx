import { MessageCircle } from "lucide-react";

export default function WhatsAppFab() {
  const msg = encodeURIComponent("Hi KDIPL, I came from your website and would like to know more about your PVC products.");
  return (
    <a
      href={`https://wa.me/919311342988?text=${msg}`}
      target="_blank"
      rel="noreferrer"
      data-testid="whatsapp-fab"
      className="fixed bottom-6 right-6 z-50 group flex items-center gap-3"
      aria-label="Chat on WhatsApp"
    >
      <span className="hidden group-hover:inline-block bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider px-3 py-2 whitespace-nowrap">
        Chat on WhatsApp
      </span>
      <span className="w-14 h-14 bg-[#25D366] hover:bg-[#1ebe5a] flex items-center justify-center shadow-lg shadow-green-900/30 transition-transform hover:scale-105">
        <MessageCircle size={26} className="text-white" fill="currentColor" />
      </span>
    </a>
  );
}
