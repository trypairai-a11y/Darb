import axios from "axios";

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

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
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
          const publicRoutes = ["/", "/login"];
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
