/** Vault API client — rides on the same admin token as the rest of the admin. */

import { adminApi, API } from "@/lib/api";

export const TOKEN_KEY = "kdipl_admin_token";

export const hasToken = () => !!localStorage.getItem(TOKEN_KEY);

const unwrap = (promise) => promise.then((r) => r.data);

export const listRecords = (entity) => unwrap(adminApi.get(`/vault/${entity}`)).then((d) => d.items || []);
export const createRecord = (entity, body) => unwrap(adminApi.post(`/vault/${entity}`, body));
export const updateRecord = (entity, id, body) => unwrap(adminApi.put(`/vault/${entity}/${id}`, body));
export const deleteRecord = (entity, id) => unwrap(adminApi.delete(`/vault/${entity}/${id}`));

export const listPlates = () => unwrap(adminApi.get("/vault/plates")).then((d) => d.items || []);
export const getPlate = (id) => unwrap(adminApi.get(`/vault/plates/${id}`));
export const createPlate = (body) => unwrap(adminApi.post("/vault/plates", body));
export const updatePlate = (id, body) => unwrap(adminApi.put(`/vault/plates/${id}`, body));
export const deletePlate = (id) => unwrap(adminApi.delete(`/vault/plates/${id}`));

export const listOrders = (params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return unwrap(adminApi.get(`/vault/orders${query ? `?${query}` : ""}`)).then((d) => d.items || []);
};
export const getOrder = (id) => unwrap(adminApi.get(`/vault/orders/${id}`));
export const createOrder = (body) => unwrap(adminApi.post("/vault/orders", body));
export const updateOrder = (id, body) => unwrap(adminApi.put(`/vault/orders/${id}`, body));
export const setOrderStatus = (id, body) => unwrap(adminApi.patch(`/vault/orders/${id}/status`, body));
export const deleteOrder = (id) => unwrap(adminApi.delete(`/vault/orders/${id}`));

export const getShopRates = () => unwrap(adminApi.get("/vault/settings/rates"));
export const putShopRates = (body) => unwrap(adminApi.put("/vault/settings/rates", body));

export const listLayouts = (params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return unwrap(adminApi.get(`/vault/layouts${query ? `?${query}` : ""}`)).then((d) => d.items || []);
};
export const getLayout = (id) => unwrap(adminApi.get(`/vault/layouts/${id}`));
export const createLayout = (body) => unwrap(adminApi.post("/vault/layouts", body));
export const deleteLayout = (id) => unwrap(adminApi.delete(`/vault/layouts/${id}`));
export const plateFromLayout = (id, body = {}) => unwrap(adminApi.post(`/vault/layouts/${id}/plate`, body));
export const platesFromLayout = (id) => unwrap(adminApi.post(`/vault/layouts/${id}/plates`));

export const reportOrders = () => unwrap(adminApi.get("/vault/reports/orders"));
export const reportPlateCharges = () => unwrap(adminApi.get("/vault/reports/plate-charges"));

export const reportArtworks = (customerId) =>
  unwrap(adminApi.get(`/vault/reports/artworks${customerId ? `?customer_id=${customerId}` : ""}`)).then(
    (d) => d.items || []
  );
export const reportKld = () => unwrap(adminApi.get("/vault/reports/kld")).then((d) => d.items || []);
export const reportReconciliation = () => unwrap(adminApi.get("/vault/reports/reconciliation"));
export const reportCost = () => unwrap(adminApi.get("/vault/reports/cost"));
export const reportGeometry = (tolerance = 0.5) =>
  unwrap(adminApi.get(`/vault/reports/geometry?tolerance=${tolerance}`));

export const listArtworkFiles = (artworkId) =>
  unwrap(adminApi.get(`/vault/artworks/${artworkId}/files`)).then((d) => d.items || []);

export const uploadArtworkFile = (artworkId, file, version) => {
  const form = new FormData();
  form.append("file", file);
  if (version) form.append("version", version);
  return unwrap(
    adminApi.post(`/vault/artworks/${artworkId}/files`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  );
};

export const deleteArtworkFile = (fileId) => unwrap(adminApi.delete(`/vault/files/${fileId}`));

/** Files and CSV need the token on a plain fetch, since they are downloads. */
export async function downloadWithToken(path, filename) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * One line of text from whatever the API said went wrong.
 *
 * FastAPI answers our own errors with a string, but a validation failure comes
 * back as a list of objects — putting that straight on screen is what React
 * refuses to render, so it is flattened here rather than at each call site.
 */
export function errorText(e, fallback = "Something went wrong.") {
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => d?.msg || JSON.stringify(d)).join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return e?.message || fallback;
}

/** Money is held as an integer in paise so it never drifts through floats. */
export const toMinor = (value) => {
  const n = parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export const fromMinor = (minor) =>
  minor === null || minor === undefined ? "" : (Number(minor) / 100).toFixed(2);

export const formatMoney = (minor, currency = "₹") =>
  minor === null || minor === undefined
    ? "—"
    : `${currency}${(Number(minor) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
