const API_ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed with HTTP ${response.status}`);
  return payload;
}

export const studioApi = {
  health: () => request('/api/health'),
  configuration: () => request('/api/config'),
  jobs: () => request('/api/jobs'),
  job: (id) => request(`/api/jobs/${encodeURIComponent(id)}`),
  createJob: (topic) => request('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ topic }),
  }),
  publishJob: (id, platforms, approved) => request(`/api/jobs/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ platforms, approved }),
  }),
};

export function mediaUrl(path) {
  return path ? `${API_ROOT}${path}` : undefined;
}
