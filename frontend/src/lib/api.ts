import axios from "axios";
import { noteVendorForbidden } from "./vendorAccess";
import { noteFleetForbidden } from "./fleetAccess";

const api = axios.create({
  baseURL: "",
  withCredentials: true,
});

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/**
 * The fleet partner a grouped FLEET login is currently acting as (client
 * revision #15/#27). Commonly-owned companies share one account and switch
 * between companies instead of logging out; the server validates every value
 * against the user's owner group, so this header can only ever narrow to a
 * company the same owner already controls.
 */
const ACTIVE_FLEET_KEY = "darb.activeFleetPartnerId";

export function getActiveFleetPartnerId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_FLEET_KEY);
}

export function setActiveFleetPartnerId(fleetPartnerId: string | null) {
  if (typeof window === "undefined") return;
  if (fleetPartnerId) window.localStorage.setItem(ACTIVE_FLEET_KEY, fleetPartnerId);
  else window.localStorage.removeItem(ACTIVE_FLEET_KEY);
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (typeof config.url === "string" && config.url.startsWith("/api/fleet")) {
    const active = getActiveFleetPartnerId();
    if (active) config.headers["X-Fleet-Partner"] = active;
  }
  return config;
});

function isRefreshRequest(config: { url?: string }) {
  return typeof config.url === "string" && config.url.endsWith("/api/auth/refresh");
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // Revision 11 (#7). When the merchant-portal tab gate refuses, it says so
    // in the body. Recording it here means the rail locks that entry and the
    // screen explains itself, wherever the request came from, instead of each
    // screen showing its own "something went wrong".
    if (error.response?.status === 403) {
      noteVendorForbidden(error.response?.data);
      // Revision 13 (#6). The fleet portal's gate answers with the same code
      // and its own tab names, so each store ignores the other's refusals.
      noteFleetForbidden(error.response?.data);
    }
    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRequest(originalRequest)) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(
          "/api/auth/refresh",
          {},
          { withCredentials: true }
        );
        accessToken = data.accessToken;
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        accessToken = null;
        if (typeof window !== "undefined") {
          const path = window.location.pathname;
          const publicRoutes = ["/", "/login", "/track"];
          const isPublic = publicRoutes.some((r) => path === r || (r !== "/" && path.startsWith(`${r}/`)));
          if (!isPublic) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
