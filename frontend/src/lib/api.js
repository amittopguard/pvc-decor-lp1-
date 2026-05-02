import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const adminApi = axios.create({ baseURL: API });
adminApi.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("kdipl_admin_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export const KDIPL = {
  whatsapp: "919311342988",
  whatsappDisplay: "+91 93113 42988",
  email: "sales@kdipl.in",
  emailCc: "nm@kdipl.in",
  company: "TopDecor",
  tagline: "TopDecor — Sajao Bharat, Badhao Bharat",
  years: "23+",
};
