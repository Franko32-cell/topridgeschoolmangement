/**
 * services/api.jsx
 * Axios instance with:
 *  - Automatic JWT attach on every protected request
 *  - Token refresh with concurrent-request queuing
 *  - Refresh token rotation support
 *  - Server wake-up with status callback (Render free tier)
 */

import axios from "axios";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  "https://topridgeschoolmangement.onrender.com";

const PUBLIC_ENDPOINTS = [
  "/auth/login/",
  "/auth/register/",
  "/auth/refresh/",
  "/auth/token/refresh/",
];

const isPublic = (url = "") => PUBLIC_ENDPOINTS.some((p) => url.includes(p));

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const API = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------------
// Request interceptor — attach access token
// ---------------------------------------------------------------------------

API.interceptors.request.use(
  (config) => {
    if (!isPublic(config.url)) {
      const token = localStorage.getItem("access");
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor — refresh on 401
// ---------------------------------------------------------------------------

let _isRefreshing = false;
let _queue        = []; // { resolve, reject }[]

const flushQueue = (error, token = null) => {
  _queue.forEach(({ resolve, reject }) =>
    error ? reject(error) : resolve(token)
  );
  _queue = [];
};

const clearSession = () => {
  ["access", "refresh", "user"].forEach((k) => localStorage.removeItem(k));
};

const redirectToLogin = () => {
  clearSession();
  window.location.href = "/login";
};

API.interceptors.response.use(
  (response) => response,

  async (error) => {
    const original = error.config;

    // Only handle 401 on protected, non-retried requests
    if (
      error.response?.status !== 401 ||
      original._retry ||
      isPublic(original.url)
    ) {
      return Promise.reject(error);
    }

    // Queue concurrent requests while a refresh is already in flight
    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _queue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return API(original);
      });
    }

    original._retry = true;
    _isRefreshing   = true;

    const refresh = localStorage.getItem("refresh");
    if (!refresh) {
      redirectToLogin();
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(
        `${BASE_URL}/auth/token/refresh/`,
        { refresh },
        { timeout: 15_000 }
      );

      const newAccess = data.access;
      localStorage.setItem("access", newAccess);

      // Support refresh token rotation — store new refresh if backend sends one
      if (data.refresh) localStorage.setItem("refresh", data.refresh);

      // Update default header for all subsequent requests
      API.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
      original.headers.Authorization            = `Bearer ${newAccess}`;

      flushQueue(null, newAccess);
      return API(original);
    } catch (refreshError) {
      flushQueue(refreshError);
      redirectToLogin();
      return Promise.reject(refreshError);
    } finally {
      _isRefreshing = false;
    }
  }
);

// ---------------------------------------------------------------------------
// Server wake-up  (Render free tier spins down after inactivity)
// ---------------------------------------------------------------------------

/**
 * Ping the health endpoint to wake the server.
 *
 * @example
 * // Basic usage — fire and forget
 * wakeUpServer();
 *
 * @example
 * // With status callbacks — show a "Server waking up…" banner
 * wakeUpServer({
 *   onWaking:  () => setServerStatus("waking"),
 *   onReady:   () => setServerStatus("ready"),
 *   onTimeout: () => setServerStatus("timeout"),
 * });
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onWaking]   called immediately before the ping
 * @param {Function} [opts.onReady]    called when the server responds
 * @param {Function} [opts.onTimeout]  called if no response within timeoutMs
 * @param {number}   [opts.timeoutMs]  default 60 000 ms
 */
export const wakeUpServer = ({
  onWaking  = () => {},
  onReady   = () => {},
  onTimeout = () => {},
  timeoutMs = 60_000,
} = {}) => {
  onWaking();
  axios
    .get(`${BASE_URL}/health/`, { timeout: timeoutMs })
    .then(onReady)
    .catch(onTimeout);
};

export default API;
