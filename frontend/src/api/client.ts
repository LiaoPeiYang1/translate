import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || ''
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  resp => resp,
  async error => {
    if (error.response?.status === 401) {
      // attempt refresh
      const refresh = localStorage.getItem('refreshToken');
      if (!refresh) throw error;
      try {
        const r = await axios.post('/api/auth/refresh', { refreshToken: refresh });
        const { accessToken, refreshToken } = r.data.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        error.config.headers.Authorization = `Bearer ${accessToken}`;
        return api.request(error.config);
      } catch (e) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        throw error;
      }
    }
    throw error;
  }
);
