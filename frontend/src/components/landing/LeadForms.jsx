import { useState, useRef } from "react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, API } from "@/lib/api";
import { track } from "@/lib/analytics";
import { Loader2, Send, Upload, FileCheck2, X } from "lucide-react";

const initial = {
  name: "", company: "", email: "", phone: "", country: "India", city: "",
  product_interest: "", quantity: "", territory: "", experience_years: "",
  expected_volume: "", current_supplier: "", monthly_volume_sqm: "", message: "",
};

function Field({ label, required, children, testid }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testid}>
      <Label className="text-xs uppercase tracking-[0.14em] font-semibold text-slate-700">
        {label} {required && <span className="text-orange-600">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function LeadForms() {
  const [tab, setTab] = useState("sample");
  const [state, setState] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);

  // listen for hash to switch tabs (e.g., #contact?tab=comparison)
  if (typeof window !== "undefined" && window.__kdiplSetLeadTab !== "set") {
    window.__kdiplSetLeadTab = "set";
    window.kdiplOpenComparison = () => {
      setTab("comparison");
      const el = document.getElementById("contact");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    };
  }

  const up = (k) => (e) => setState((s) => ({ ...s, [k]: e?.target?.value ?? e }));

  const submit = async (e) => {
    e.preventDefault();
    if (!state.name || !state.email || !state.phone) {
      toast.error("Please fill Name, Email and Phone");
      return;
    }
    setLoading(true);
    try {
      let data;
      if (tab === "comparison") {
        const fd = new FormData();
        const fields = [
          "name", "email", "phone", "company", "country", "city",
          "current_supplier", "monthly_volume_sqm", "product_interest", "message",
        ];
        fields.forEach((k) => { if (state[k]) fd.append(k, state[k]); });
        if (file) fd.append("file", file);
        const res = await fetch(`${API}/leads/comparison`, { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Submission failed");
        }
        data = await res.json();
      } else {
        const payload = { type: tab, ...state };
        const r = await api.post("/leads", payload);
        data = r.data;
      }
      toast.success(
        tab === "distributor" ? "Application received. Our team will reach out within 24 hours."
        : tab === "quote" ? "Quote request received. We will email you shortly."
        : tab === "comparison" ? "Got it. We'll send a price comparison within 24 hours."
        : "Sample request received. You'll hear from us soon."
      );
      // Fire analytics conversion event
      track(`${tab}_submit`, { lead_type: tab, has_file: tab === "comparison" && !!file });
      track("lead_submit", { lead_type: tab });
      setState(initial);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return data;
    } catch (err) {
      const msg = err?.message || err?.response?.data?.detail || "Could not submit. Please try again.";
      toast.error(typeof msg === "string" ? msg : "Please check your entries");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "rounded-none border-slate-300 focus-visible:ring-orange-600 focus-visible:ring-offset-0 focus-visible:border-orange-600";

  return (
    <section id="contact" data-testid="contact-section" className="py-20 sm:py-32 bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-4">
            <div className="overline" style={{ color: "#fb923c" }}>07 &mdash; Get in touch</div>
            <h2 className="mt-3 font-display font-bold text-4xl sm:text-5xl tracking-tight leading-[1.05]">
              One form.<br />Three ways to start.
            </h2>
            <p className="mt-6 text-slate-300 leading-relaxed">
              Whether you want a sample, a quote, or a full distributorship — reply to us here. We respond within one business day.
            </p>

            <div className="mt-10 border-t border-slate-800 pt-8 space-y-5 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Email</div>
                <a href="mailto:sales@kdipl.in" className="mt-1 block text-white hover:text-orange-400">sales@kdipl.in</a>
                <a href="mailto:nm@kdipl.in" className="block text-slate-400 hover:text-orange-400">nm@kdipl.in</a>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">WhatsApp / Phone</div>
                <a
                  href="https://wa.me/919311342988"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block text-white hover:text-orange-400"
                >
                  +91 93113 42988
                </a>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-bold">Origin</div>
                <div className="mt-1 text-white">Made in India &middot; Worldwide shipping</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="bg-white text-slate-900 p-6 sm:p-10 border border-slate-200">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList
                  className="w-full rounded-none bg-slate-100 p-0 h-auto flex flex-wrap border border-slate-200"
                  data-testid="lead-form-tabs"
                >
                  <TabsTrigger
                    value="sample"
                    data-testid="tab-sample"
                    className="flex-1 min-w-[110px] rounded-none py-3.5 text-xs uppercase tracking-[0.14em] font-semibold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                  >
                    Sample
                  </TabsTrigger>
                  <TabsTrigger
                    value="quote"
                    data-testid="tab-quote"
                    className="flex-1 min-w-[110px] rounded-none py-3.5 text-xs uppercase tracking-[0.14em] font-semibold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                  >
                    Quote
                  </TabsTrigger>
                  <TabsTrigger
                    value="distributor"
                    data-testid="tab-distributor"
                    className="flex-1 min-w-[110px] rounded-none py-3.5 text-xs uppercase tracking-[0.14em] font-semibold data-[state=active]:bg-slate-900 data-[state=active]:text-white"
                  >
                    Distributor
                  </TabsTrigger>
                  <TabsTrigger
                    value="comparison"
                    data-testid="tab-comparison"
                    className="flex-1 min-w-[140px] rounded-none py-3.5 text-xs uppercase tracking-[0.14em] font-semibold data-[state=active]:bg-orange-600 data-[state=active]:text-white"
                  >
                    Price Match
                  </TabsTrigger>
                </TabsList>

                <form onSubmit={submit} className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5" data-testid="lead-form">
                  <Field label="Full Name" required testid="field-name">
                    <Input className={inputCls} value={state.name} onChange={up("name")} data-testid="input-name" />
                  </Field>
                  <Field label="Company" testid="field-company">
                    <Input className={inputCls} value={state.company} onChange={up("company")} data-testid="input-company" />
                  </Field>
                  <Field label="Email" required testid="field-email">
                    <Input type="email" className={inputCls} value={state.email} onChange={up("email")} data-testid="input-email" />
                  </Field>
                  <Field label="Phone / WhatsApp" required testid="field-phone">
                    <Input className={inputCls} value={state.phone} onChange={up("phone")} data-testid="input-phone" />
                  </Field>
                  <Field label="Country" testid="field-country">
                    <Input className={inputCls} value={state.country} onChange={up("country")} data-testid="input-country" />
                  </Field>
                  <Field label="City" testid="field-city">
                    <Input className={inputCls} value={state.city} onChange={up("city")} data-testid="input-city" />
                  </Field>

                  <Field label="Product Interest" testid="field-product">
                    <Select value={state.product_interest} onValueChange={up("product_interest")}>
                      <SelectTrigger className={`${inputCls} w-full`} data-testid="input-product">
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PVC Decor Film">PVC Decor Film (Membrane Doors)</SelectItem>
                        <SelectItem value="Acrylic Sheets">Acrylic Sheets</SelectItem>
                        <SelectItem value="Laminates Wall Panels">Laminates Wall Panels</SelectItem>
                        <SelectItem value="All Products">All Products</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {tab === "quote" && (
                    <Field label="Approx. Quantity" testid="field-qty">
                      <Input className={inputCls} value={state.quantity} onChange={up("quantity")} placeholder="e.g., 5000 sqm / 20 rolls" data-testid="input-quantity" />
                    </Field>
                  )}

                  {tab === "distributor" && (
                    <>
                      <Field label="Territory Interested" testid="field-territory">
                        <Input className={inputCls} value={state.territory} onChange={up("territory")} placeholder="State / City / Region" data-testid="input-territory" />
                      </Field>
                      <Field label="Years in Trade" testid="field-experience">
                        <Input className={inputCls} value={state.experience_years} onChange={up("experience_years")} placeholder="e.g., 5 years" data-testid="input-experience" />
                      </Field>
                      <Field label="Expected Monthly Volume" testid="field-volume">
                        <Input className={inputCls} value={state.expected_volume} onChange={up("expected_volume")} placeholder="e.g., 10,000 sqm / month" data-testid="input-volume" />
                      </Field>
                    </>
                  )}

                  {tab === "comparison" && (
                    <>
                      <Field label="Current Supplier" testid="field-supplier">
                        <Input className={inputCls} value={state.current_supplier} onChange={up("current_supplier")} placeholder="e.g., Brand / Country" data-testid="input-supplier" />
                      </Field>
                      <Field label="Monthly Volume (sqm)" testid="field-monthly-volume">
                        <Input className={inputCls} value={state.monthly_volume_sqm} onChange={up("monthly_volume_sqm")} placeholder="e.g., 5000 sqm" data-testid="input-monthly-volume" />
                      </Field>
                      <div className="sm:col-span-2" data-testid="field-file">
                        <Label className="text-xs uppercase tracking-[0.14em] font-semibold text-slate-700">
                          Upload Current PO / Invoice / Quote <span className="text-slate-400 normal-case tracking-normal">(optional · max 10MB)</span>
                        </Label>
                        <div className="mt-2">
                          <input
                            ref={fileRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv,.doc,.docx"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            className="hidden"
                            id="kdipl-file-input"
                            data-testid="input-file"
                          />
                          {!file ? (
                            <label
                              htmlFor="kdipl-file-input"
                              className="cursor-pointer flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 hover:border-orange-600 hover:bg-orange-50/50 transition-colors py-8 text-slate-500"
                              data-testid="file-dropzone"
                            >
                              <Upload size={18} />
                              <span className="text-sm font-medium">Click to upload file</span>
                              <span className="text-xs text-slate-400 hidden sm:inline">PDF · Image · XLSX · CSV</span>
                            </label>
                          ) : (
                            <div className="flex items-center gap-3 border border-slate-300 bg-slate-50 px-4 py-3" data-testid="file-selected">
                              <FileCheck2 size={18} className="text-green-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                                <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                                className="p-1 hover:bg-slate-200"
                                data-testid="file-remove-btn"
                                aria-label="Remove file"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-2">
                    <Field label="Message" testid="field-message">
                      <Textarea
                        rows={4}
                        className={inputCls}
                        value={state.message}
                        onChange={up("message")}
                        placeholder="Tell us about your application, current supplier, or specific questions."
                        data-testid="input-message"
                      />
                    </Field>
                  </div>

                  <div className="sm:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      data-testid="submit-lead-btn"
                      className="bg-orange-600 text-white px-8 py-4 font-semibold text-sm uppercase tracking-wider hover:bg-orange-700 disabled:opacity-70 transition-colors inline-flex items-center gap-2"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      {tab === "sample" && "Request a Physical Sample — Free of Cost"}
                      {tab === "quote" && "Request Quote"}
                      {tab === "distributor" && "Submit Application"}
                      {tab === "comparison" && "Beat my current price"}
                    </button>
                    <p className="text-xs text-slate-500">
                      By submitting you agree to be contacted by TopDecor about this enquiry.
                    </p>
                  </div>
                </form>

                {/* Keep shadcn tabs semantics happy */}
                <TabsContent value="sample" />
                <TabsContent value="quote" />
                <TabsContent value="distributor" />
                <TabsContent value="comparison" />
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
