import axios from "axios";

const API = axios.create({ baseURL: "https://docchain-ax60.onrender.com/api" });

// Add token to requests if available
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// Authentication API calls
export const register = async (email, password, role = 'user') => {
  const res = await API.post("/auth/register", { email, password, role });
  return res.data;
};

export const login = async (email, password) => {
  const res = await API.post("/auth/login", { email, password });
  return res.data;
};

export const getCurrentUser = async () => {
  const res = await API.get("/auth/me");
  return res.data;
};

export const logout = async () => {
  const res = await API.post("/auth/logout");
  return res.data;
};

// File operations
export const adminUpload = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await API.post("/admin/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const userVerify = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await API.post("/user/verify", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};
