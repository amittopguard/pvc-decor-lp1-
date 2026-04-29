// Lightweight client-side analytics: GA4 (gtag.js) + Meta Pixel (fbq).
// Env-driven — both initialize only when their ID is present.
// Set in /app/frontend/.env:
//   REACT_APP_GA_MEASUREMENT_ID=G-XXXXXXXXXX
//   REACT_APP_META_PIXEL_ID=1234567890

const GA_ID = process.env.REACT_APP_GA_MEASUREMENT_ID || "";
const META_ID = process.env.REACT_APP_META_PIXEL_ID || "";

let initialised = false;

function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function initGA() {
  if (!GA_ID) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: true });
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`).catch(() => {});
}

function initMeta() {
  if (!META_ID) return;
  // Standard Meta Pixel bootstrap — keep as-is for compatibility.
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq("init", META_ID);
  window.fbq("track", "PageView");
}

export function initAnalytics() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  try { initGA(); } catch (e) { /* ignore */ }
  try { initMeta(); } catch (e) { /* ignore */ }
}

// Map of our event names → { ga: gaEventName, meta: metaEventName }
const EVENT_MAP = {
  lead_submit: { ga: "generate_lead", meta: "Lead" },
  sample_submit: { ga: "generate_lead", meta: "Lead" },
  quote_submit: { ga: "generate_lead", meta: "Lead" },
  distributor_submit: { ga: "generate_lead", meta: "CompleteRegistration" },
  comparison_submit: { ga: "generate_lead", meta: "Lead" },
  whatsapp_click: { ga: "contact", meta: "Contact" },
  catalog_download: { ga: "file_download", meta: "ViewContent" },
  admin_login: { ga: "login", meta: null },
};

export function track(eventName, params = {}) {
  if (typeof window === "undefined") return;
  const map = EVENT_MAP[eventName] || { ga: eventName, meta: eventName };
  const payload = { event_label: eventName, ...params };

  if (window.gtag && map.ga) {
    try { window.gtag("event", map.ga, payload); } catch (e) { /* ignore */ }
  }
  if (window.fbq && map.meta) {
    try { window.fbq("track", map.meta, payload); } catch (e) { /* ignore */ }
  }
}
