// import { api } from "../services/api";


// export async function listProfiles(){
//   const r = await api.get("/api/alert-profiles");
//   return r.data || [];
// }

// export async function getProfile(id){
//   const r = await api.get(`/api/alert-profiles/${id}`);
//   return r.data;
// }

// export async function createProfile(payload){
//   return api.post("/api/alert-profiles", payload);
// }

// export async function updateProfile(id, payload){
//   return api.put(`/api/alert-profiles/${id}`, payload);
// }

// export async function toggleActive(id, is_active){
//   return api.patch(`/api/alert-profiles/${id}/active`, { is_active });
// }

// export async function deleteProfile(id){
//   return api.del(`/api/alert-profiles/${id}`);
// }

// export async function testLine(to){
//   return api.post("/api/test/line", { to });
// }

// export async function testEmail(email){
//   return api.post("/api/test/email", { email });
// }

// export async function getSchedulerStatus(){
//   return api.get("/api/scheduler/status");
// }
// export async function fireProfileNow(profileId) {
//   const res = await api.post(`/api/scheduler/fire/${profileId}`);
//   return res.data;
// }
// // META
// // ✅ META
// export async function listStations() {
//   const r = await api.get("/api/meta/stations");
//   return r.data || [];
// }

// export async function listSensors(station_code) {
//   const r = await api.get("/api/meta/sensors", { params: { station_code } });
//   return r.data || [];
// }
// frontend/src/store/storage.js
import { api } from "../services/api";

// ✅ helper: รองรับทั้งแบบคืนตรงๆ และแบบ {success,data,message}
function unwrapAxios(res) {
  const d = res?.data;

  // ถ้าเป็นรูปแบบ { success, data, message }
  if (d && typeof d === "object" && "success" in d) {
    if (!d.success) throw new Error(d.message || "API error");
    return d.data;
  }

  // ถ้าคืน data ตรงๆ
  return d;
}

/* ================= PROFILES ================= */
export async function listProfiles() {
  const r = await api.get("/api/alert-profiles");
  return unwrapAxios(r) || [];
}

export async function getProfile(id) {
  const r = await api.get(`/api/alert-profiles/${id}`);
  return unwrapAxios(r);
}

export async function createProfile(payload) {
  const r = await api.post("/api/alert-profiles", payload);
  return unwrapAxios(r);
}

export async function updateProfile(id, payload) {
  const r = await api.put(`/api/alert-profiles/${id}`, payload);
  return unwrapAxios(r);
}

export async function toggleActive(id, is_active) {
  const r = await api.patch(`/api/alert-profiles/${id}/active`, { is_active });
  return unwrapAxios(r);
}

export async function deleteProfile(id) {
  // ถ้า api ของคุณใช้ del() อยู่แล้วก็โอเค
  const r = await api.del(`/api/alert-profiles/${id}`);
  return unwrapAxios(r);
}

/* ================= TEST ================= */
export async function testLine(to) {
  const r = await api.post("/api/test/line", { to });
  return unwrapAxios(r);
}

export async function testEmail(email) {
  const r = await api.post("/api/test/email", { email });
  return unwrapAxios(r);
}

/* ================= SCHEDULER ================= */
export async function getSchedulerStatus() {
  const r = await api.get("/api/scheduler/status");
  return unwrapAxios(r);
}

export async function fireProfileNow(profileId) {
  const r = await api.post(`/api/scheduler/fire/${profileId}`);
  return unwrapAxios(r);
}

/* ================= META ================= */
export async function listStations() {
  const r = await api.get("/api/meta/stations");
  return unwrapAxios(r) || [];
}

export async function listSensors(station_code) {
  const r = await api.get("/api/meta/sensors", { params: { station_code } });
  return unwrapAxios(r) || [];
}
