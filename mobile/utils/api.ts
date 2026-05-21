import axios, { AxiosInstance } from "axios";
import { useAuth } from "@clerk/expo";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://nedos.vercel.app";
const API_BASE_URL = API_URL;

export const createApiClient = (
  getToken: () => Promise<string | null>
): AxiosInstance => {

  const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
  });

  api.interceptors.request.use(async (config) => {
    const token = await getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  });

  return api;
};

export const useApiClient = (): AxiosInstance => {
  const { getToken } = useAuth();
  return createApiClient(getToken);
};

export const userApi = {
  syncUser: (api: AxiosInstance) => api.post("/users/sync"),

  getCurrentUser: (api: AxiosInstance) =>
    api.get("/users/me"),

  updateProfile: (api: AxiosInstance, data: any) =>
    api.put("/users/profile", data),
};