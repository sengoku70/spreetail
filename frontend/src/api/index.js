import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const groupsApi = {
  list: () => api.get('/groups'),
  create: (data) => api.post('/groups', data),
  getDetails: (groupId) => api.get(`/groups/${groupId}`),
  delete: (groupId) => api.delete(`/groups/${groupId}`),
  addMember: (groupId, data) => 
    api.post(`/groups/${groupId}/members`, data),
  updateMembershipTimeline: (groupId, userId, data) => 
    api.put(`/groups/${groupId}/members/${userId}/leave`, data),
};

export const expensesApi = {
  list: (groupId) => api.get(`/groups/${groupId}/expenses`),
  create: (groupId, data) => api.post(`/groups/${groupId}/expenses`, data),
  update: (groupId, expenseId, data) => 
    api.put(`/groups/${groupId}/expenses/${expenseId}`, data),
  delete: (groupId, expenseId) => 
    api.delete(`/groups/${groupId}/expenses/${expenseId}`),
};

export const balancesApi = {
  getReport: (groupId) => api.get(`/groups/${groupId}/balances`),
};

export const settlementsApi = {
  list: (groupId) => api.get(`/groups/${groupId}/settlements`),
  create: (groupId, data) => 
    api.post(`/groups/${groupId}/settlements`, data),
};

export const importApi = {
  uploadCSV: (data) => 
    api.post(`/import/upload`, data),
  getAnomalies: (batchId) => 
    api.get(`/import/batches/${batchId}/anomalies`),
  approveAnomaly: (anomalyId) => 
    api.post(`/import/anomalies/${anomalyId}/approve`),
  discardAnomaly: (anomalyId) => 
    api.post(`/import/anomalies/${anomalyId}/discard`),
};
