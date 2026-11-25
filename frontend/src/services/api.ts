/**
 * Centralized REST API Service for Finance IQ
 * Communicates with the Django REST Framework backend.
 */

const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  "http://127.0.0.1:8000/api";

const ACCESS_TOKEN_KEY = "financeiq_jwt_access";
const REFRESH_TOKEN_KEY = "financeiq_jwt_refresh";
const USER_KEY = "financeiq_user_data";

export interface UserData {
  id: number | string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  profile?: {
    id: string;
    role: string;
    department: string;
    status: string;
    last_login: string | null;
  };
}

export interface AuthResponse {
  access: string;
  refresh: string;
  user: UserData;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(access: string, refresh?: string, user?: UserData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
  if (refresh) window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): UserData | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserData;
  } catch {
    return null;
  }
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) {
      clearAuthTokens();
      return null;
    }
    const data = await res.json();
    if (data.access) {
      setAuthTokens(data.access, data.refresh);
      return data.access;
    }
  } catch {
    clearAuthTokens();
  }
  return null;
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  let url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  if (options.params) {
    const searchParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        searchParams.append(key, String(val));
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      url += (url.includes("?") ? "&" : "?") + qs;
    }
  }

  const token = getAccessToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response = await fetch(url, { ...options, headers });

  // Handle Token Refresh on 401
  if (response.status === 401 && getRefreshToken() && !endpoint.includes("/auth/")) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      if (newToken) {
        onRefreshed(newToken);
        headers.set("Authorization", `Bearer ${newToken}`);
        response = await fetch(url, { ...options, headers });
      }
    } else {
      const retryToken = await new Promise<string>((resolve) => {
        refreshSubscribers.push(resolve);
      });
      headers.set("Authorization", `Bearer ${retryToken}`);
      response = await fetch(url, { ...options, headers });
    }
  }

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      // not JSON
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "GET" }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "POST",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: "DELETE" }),

  // High-Level Domain Services
  auth: {
    login: (credentials: { username?: string; email?: string; password?: string }) =>
      api.post<AuthResponse>("/auth/login/", credentials),
    register: (data: { email: string; password: string; name?: string; org?: string }) =>
      api.post<AuthResponse>("/auth/register/", data),
    google: (data: {
      access_token?: string;
      id_token?: string;
      credential?: string;
      code?: string;
      redirect_uri?: string;
    }) => api.post<AuthResponse>("/auth/google/", data),
    profile: () => api.get<UserData>("/auth/profile/"),
    updateProfile: (data: Partial<UserData> & { department?: string }) =>
      api.patch<UserData>("/auth/profile/", data),
    users: () => api.get<UserData[]>("/auth/users/"),
    activityLogs: () => api.get("/auth/activity-logs/"),
    logActivity: (action: string, module: string, device?: string) =>
      api.post("/auth/activity-logs/", { action, module, device }),
  },

  datasets: {
    list: () => api.get<Array<{ id: string; source_file: string; file_type: string; row_count: number }>>("/datasets/"),
    data: (source_file?: string | null) =>
      api.get<{
        t: Record<string, unknown>[];
        p: Record<string, unknown>[];
        b: Record<string, unknown>[];
        a: Record<string, unknown>[];
      }>("/datasets/data/", { params: { source_file: source_file || undefined } }),
    uploadBatch: (payload: {
      source_file: string;
      transactions?: unknown[];
      payroll?: unknown[];
      budgets?: unknown[];
      arap?: unknown[];
    }) => api.post("/datasets/upload/batch/", payload),
    purge: (source_file: string) => api.delete(`/datasets/purge/${encodeURIComponent(source_file)}/`),
  },

  transactions: {
    list: (params?: Record<string, string | number | undefined>) =>
      api.get<Record<string, unknown>[]>("/transactions/", { params }),
    create: (data: Record<string, unknown>) => api.post("/transactions/", data),
    delete: (id: string) => api.delete(`/transactions/${id}/`),
  },

  budgets: {
    list: (params?: Record<string, string | undefined>) =>
      api.get<Record<string, unknown>[]>("/budgets/", { params }),
    create: (data: Record<string, unknown>) => api.post("/budgets/", data),
    delete: (id: string) => api.delete(`/budgets/${id}/`),
  },

  categories: {
    list: () => api.get<Array<{ id: string; name: string; kind: string; budget_limit?: number }>>("/categories/"),
    create: (data: Record<string, unknown>) => api.post("/categories/", data),
    delete: (id: string) => api.delete(`/categories/${id}/`),
  },

  payroll: {
    list: (params?: Record<string, string | undefined>) =>
      api.get<Record<string, unknown>[]>("/payroll/", { params }),
    create: (data: Record<string, unknown>) => api.post("/payroll/", data),
  },

  organizations: {
    list: () => api.get<Array<{ id: string; name: string; currency: string }>>("/organizations/"),
    create: (name: string) => api.post("/organizations/", { name }),
  },

  compliance: {
    filings: () => api.get<Record<string, unknown>[]>("/compliance/filings/"),
    createFiling: (data: Record<string, unknown>) => api.post("/compliance/filings/", data),
    findings: () => api.get<Record<string, unknown>[]>("/compliance/findings/"),
    createFinding: (data: Record<string, unknown>) => api.post("/compliance/findings/", data),
  },

  analytics: {
    dashboard: (source_file?: string | null) =>
      api.get<{
        total_revenue: number;
        total_expenses: number;
        direct_expenses: number;
        payroll_expenses: number;
        net_profit: number;
        cash_balance: number;
        runway_months: number;
        transaction_count: number;
      }>("/analytics/dashboard/", { params: { source_file: source_file || undefined } }),
    monthly: () => api.get<Array<{ month: string; income: number; expense: number; net: number }>>("/analytics/monthly/"),
    categories: () => api.get<Array<{ category: string; total: number; count: number }>>("/analytics/categories/"),
    fx: () => api.get<Array<{ currency: string; rate_to_inr: number; symbol: string }>>("/analytics/fx/"),
  },
};
