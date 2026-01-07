const BASE = import.meta.env.VITE_API_BASE_URL || "http://171.102.131.91:4500";

async function request(path, { method="GET", body } = {}){
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if(!res.ok || data?.success === false){
    const msg = data?.message || `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method:"POST", body }),
  put: (path, body) => request(path, { method:"PUT", body }),
  patch: (path, body) => request(path, { method:"PATCH", body }),
  del: (path) => request(path, { method:"DELETE" }),
  base: BASE
};
