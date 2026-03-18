import axios, { AxiosError, type AxiosInstance } from "axios";

export type ApiError = {
  message: string;
  status?: number;
  data?: unknown;
};

export function createHttpClient(): AxiosInstance {
  const http = axios.create({
    // Keep empty baseURL because current code already uses `/api/*`.
    baseURL: "",
    timeout: 30000,
    headers: {
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  http.interceptors.response.use(
    (res) => {
      // Common dev misconfig: `/api/*` is not proxied and returns index.html.
      const ct = String(res.headers?.["content-type"] || "");
      if (ct.includes("text/html") && typeof res.data === "string") {
        throw {
          message:
            "API returned HTML. Check Vite proxy (/api -> backend) or backend base path.",
          status: res.status,
          data: res.data,
        } satisfies ApiError;
      }
      return res;
    },
    (err: AxiosError) => {
      const status = err.response?.status;
      const data = err.response?.data;
      const message = err.message || "Request failed";
      return Promise.reject({ message, status, data } satisfies ApiError);
    },
  );

  return http;
}

export const http = createHttpClient();
