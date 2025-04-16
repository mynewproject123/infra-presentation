import { create } from "zustand";
import axios from "../lib/axios";
import { toast } from "react-hot-toast";

export const useUserStore = create((set, get) => ({
  user: null,
  loading: false,
  checkingAuth: true,

  signup: async (
    { name, email, address, password, confirmPassword, role },
    isCreateUser
  ) => {
    set({ loading: true });

    if (password !== confirmPassword) {
      set({ loading: false });
      return toast.error("Passwords do not match");
    }

    try {
      const res = await axios.post("/auth/signup", {
        name,
        email,
        address,
        password,
        role,
        isCreateUser,
      });

      if (isCreateUser) {
        toast.success("User created successfully!");
        set({ loading: false });
        window.location.href = "/secret-dashboard";
      } else {
        toast.success("Signup successfully!");
        localStorage.setItem("authToken", res.data.token);
        set({ loading: false });
        window.location.href = "/";
      }
    } catch (error) {
      set({ loading: false });
      toast.error(error.response.data.message || "An error occurred");
    }
  },

  login: async (email, password) => {
    set({ loading: true });

    try {
      const res = await axios.post("/auth/login", { email, password });

      // Store the token in localStorage
      if (res?.data?.token) {
        localStorage.setItem("authToken", res.data.token);
      }

      set({ user: res?.data || null, loading: false });
      if (res?.data?.role === "admin") {
        window.location.href = "/secret-dashboard";
      } else {
        window.location.href = "/";
      }
    } catch (error) {
      console.error("Login error:", error);
      set({ loading: false });
      toast.error(error.response?.data?.message || "Connection error. Please try again later.");
    }
  },

  logout: async () => {
    try {
      await axios.post("/auth/logout");
      // Clear the token from localStorage
      localStorage.removeItem("authToken");
      set({ user: null });
      window.location.href = "/";
    } catch (error) {
      toast.error(
        error.response?.data?.message || "An error occurred during logout"
      );
    }
  },

  checkAuth: async () => {
    set({ checkingAuth: true });

    try {
      const response = await axios.get("/auth/profile");
      set({ user: response.data, checkingAuth: false });
    } catch (error) {
      // If we get a 401 error, try to refresh the token
      if (error.response?.status === 401) {
        try {
          await get().refreshToken();
          // Retry the profile request after refreshing the token
          const response = await axios.get("/auth/profile");
          set({ user: response.data, checkingAuth: false });
          return;
        } catch (refreshError) {
          // If refresh fails, clear the token and set user to null
          localStorage.removeItem("authToken");
          set({ checkingAuth: false, user: null });
          return;
        }
      }
      set({ checkingAuth: false, user: null });
    }
  },

  refreshToken: async () => {
    if (get().checkingAuth) return;

    set({ checkingAuth: true });
    try {
      const response = await axios.post("/auth/refresh-token");
      set({ checkingAuth: false });
      return response.data;
    } catch (error) {
      set({ user: null, checkingAuth: false });
      throw error;
    }
  },
}));

// TODO: Implement the axios interceptors for refreshing access token

// Axios interceptor for token refresh
let refreshPromise = null;

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // If a refresh is already in progress, wait for it to complete
        if (refreshPromise) {
          await refreshPromise;
          return axios(originalRequest);
        }

        // Start a new refresh process
        refreshPromise = useUserStore.getState().refreshToken();
        await refreshPromise;
        refreshPromise = null;

        return axios(originalRequest);
      } catch (refreshError) {
        // If refresh fails, redirect to login or handle as needed
        useUserStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);
