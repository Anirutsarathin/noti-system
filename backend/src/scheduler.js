import { db } from "./db.js";
import { sendProfileNow } from "./profileSender.js";

// interval timers
const timers = {};        // profileId -> setInterval
const intervals = {};     // profileId -> interval_sec
const nextFireAt = {};    // profileId -> timestamp(ms)

// times profiles cache
let timeProfiles = {};    // profileId -> { times: ["17:00","21:00"], is_active:1 }
const sentToday = new Set(); // key = profileId|HH:mm|YYYY-MM-DD

// ===== allow API to force reload immediately =====
let _reloadNow = null;

export async function forceReloadNow() {
  if (typeof _reloadNow === "function") {
    await _reloadNow();
  }
}

// ===== COUNTDOWN LOG CONTROL =====
let logEnabled =  "1";
let logEverySec =  1;
let logTimer = null;

export function setLogConfig({ enabled, everySec }) {
  if (typeof enabled === "boolean") logEnabled = enabled;
  if (everySec !== undefined) logEverySec = Math.max(1, Number(everySec) || 1);
  restartLogLoop();
  return getLogConfig();
}
export function getLogConfig() {
  return { enabled: logEnabled, everySec: logEverySec };
}

function restartLogLoop() {
  if (logTimer) {
    clearInterval(logTimer);
    logTimer = null;
  }
  if (!logEnabled) return;

  logTimer = setInterval(() => {
    printCountdownLog();
  }, logEverySec * 1000);

  console.log("🧾 countdown log: ON", `every ${logEverySec}s`);
}

function secLeftFromTs(ts) {
  const now = Date.now();
  return Math.max(0, Math.ceil((ts - now) / 1000));
}
function fmtLeft(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h${m}m${ss}s`;
  if (m > 0) return `${m}m${ss}s`;
  return `${ss}s`;
}

function printCountdownLog() {
  const nowStr = new Date().toLocaleTimeString("th-TH", { hour12: false });

  const intervalLines = Object.entries(nextFireAt).map(([pid, ts]) => {
    const left = secLeftFromTs(ts);
    return `⏳ [interval] profile=${pid} left=${fmtLeft(left)}`;
  });

  const timesLines = Object.entries(timeProfiles).map(([pid, info]) => {
    if (!info || info.is_active !== 1) return `⏳ [times] profile=${pid} (inactive)`;
    const next = computeNextFromTimes(info.times || [], new Date());
    if (!next) return `⏳ [times] profile=${pid} next=-`;
    const left = secLeftFromTs(next);
    const nextStr = new Date(next).toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `⏳ [times] profile=${pid} next=${nextStr} left=${fmtLeft(left)}`;
  });

  if (intervalLines.length === 0 && timesLines.length === 0) return;

  console.log(`\n🕒 COUNTDOWN @ ${nowStr}`);
  intervalLines.forEach((l) => console.log(l));
  timesLines.forEach((l) => console.log(l));
}

function hhmmNow(d = new Date()) {
  return d.toTimeString().slice(0, 5);
}
function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function computeNextFromTimes(times = [], now = new Date()) {
  const [h, m] = [now.getHours(), now.getMinutes()];
  const nowMin = h * 60 + m;

  const mins = times
    .map((t) => {
      const [hh, mm] = t.split(":").map(Number);
      return hh * 60 + mm;
    })
    .filter((x) => !Number.isNaN(x))
    .sort((a, b) => a - b);

  if (!mins.length) return null;

  for (const tMin of mins) {
    if (tMin > nowMin) {
      const next = new Date(now);
      next.setHours(Math.floor(tMin / 60), tMin % 60, 0, 0);
      return next.getTime();
    }
  }

  const tMin = mins[0];
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(Math.floor(tMin / 60), tMin % 60, 0, 0);
  return next.getTime();
}

// ✅ ส่งจริงตามโปรไฟล์
async function fireProfile(profileId) {
  console.log("⏰ FIRE PROFILE:", profileId);
  await sendProfileNow(profileId);
}

// debug ยิงทันที
export async function fireProfileNow(profileId) {
  return fireProfile(profileId);
}

async function loadTimeProfiles() {
  const [profiles] = await db.query(`
    SELECT id, is_active
    FROM alert_profile
    WHERE send_mode='times'
  `);

  const result = {};
  for (const p of profiles) {
    const [rows] = await db.query(
      `
      SELECT DATE_FORMAT(send_time,'%H:%i') AS t
      FROM alert_profile_time
      WHERE profile_id=?
      ORDER BY send_time
      `,
      [p.id]
    );

    result[p.id] = {
      is_active: Number(p.is_active),
      times: rows.map((x) => x.t),
    };
  }
  timeProfiles = result;
}

function startIntervalTimer(profileId, intervalSec) {
  const intervalMs = intervalSec * 1000;
  intervals[profileId] = intervalSec;

  // ✅ เปิดแล้วเริ่มนับทันที: set nextFireAt ตอน start
  nextFireAt[profileId] = Date.now() + intervalMs;

  timers[profileId] = setInterval(async () => {
    try {
      await fireProfile(profileId);
    } catch (e) {
      console.error("❌ interval fire error:", profileId, e?.message || e);
    } finally {
      // ✅ ส่งเสร็จแล้วเริ่มนับรอบใหม่
      nextFireAt[profileId] = Date.now() + intervalMs;
    }
  }, intervalMs);

  console.log("▶ start interval profile:", profileId, intervalSec);
}

function stopIntervalTimer(profileId) {
  if (timers[profileId]) {
    clearInterval(timers[profileId]);
    delete timers[profileId];
  }
  delete intervals[profileId];
  delete nextFireAt[profileId];
  console.log("🛑 stop interval profile:", profileId);
}

export async function startProfileScheduler() {
  async function reload() {
    // interval profiles
    const [rows] = await db.query(`
      SELECT id, is_active, interval_min
      FROM alert_profile
      WHERE send_mode='interval'
    `);

    // stop ที่ไม่ควรรันแล้ว
    for (const pidStr of Object.keys(timers)) {
      const pid = Number(pidStr);
      const st = rows.find((r) => r.id === pid);
      const ok = st && Number(st.is_active) === 1 && Number(st.interval_min) > 0;
      if (!ok) stopIntervalTimer(pid);
    }

    // start / update
    for (const r of rows) {
      const pid = r.id;
      if (Number(r.is_active) !== 1) continue;

      const intervalSec = Number(r.interval_min) * 60;
      if (!intervalSec || intervalSec <= 0) continue;

      if (!timers[pid]) {
        startIntervalTimer(pid, intervalSec);
      } else if (intervals[pid] !== intervalSec) {
        stopIntervalTimer(pid);
        startIntervalTimer(pid, intervalSec);
      }
    }

    // refresh times cache
    await loadTimeProfiles();
  }

  _reloadNow = reload; // ✅ ให้ route เรียก reload ทันทีได้

  // tick สำหรับ send_mode=times (เมื่อถึงเวลา: ส่ง 1 ครั้ง แล้วรอรอบถัดไป)
  async function tickTimes() {
    const now = new Date();
    const hhmm = hhmmNow(now);
    const today = todayKey(now);

    for (const [pidStr, info] of Object.entries(timeProfiles)) {
      const pid = Number(pidStr);
      if (!info || Number(info.is_active) !== 1) continue;
      if (!info.times?.includes(hhmm)) continue;

      const key = `${pid}|${hhmm}|${today}`;
      if (sentToday.has(key)) continue;

      try {
        console.log(`⏰ TIMES FIRE profile=${pid} @ ${hhmm}`);
        await fireProfile(pid);
        sentToday.add(key);
      } catch (e) {
        console.error("❌ times fire error:", pid, e?.message || e);
      }
    }
  }

  // reset daily flags
  setInterval(() => {
    sentToday.clear();
    console.log("🔁 reset daily flags");
  }, 24 * 60 * 60 * 1000);

  await reload();
  setInterval(reload, 10 * 1000);
  setInterval(tickTimes, 30 * 1000);

  console.log("✅ Profile Scheduler started");
  restartLogLoop(); // เปิด log ถ้า ENV เปิด
}

export async function getSchedulerStatus() {
  const now = Date.now();

  const intervalStatus = Object.entries(nextFireAt).map(([pid, ts]) => ({
    profile_id: Number(pid),
    mode: "interval",
    next_run_at: new Date(ts).toISOString(),
    seconds_left: Math.max(0, Math.ceil((ts - now) / 1000)),
  }));

  const timesStatus = Object.entries(timeProfiles).map(([pidStr, info]) => {
    const pid = Number(pidStr);
    const next = computeNextFromTimes(info.times || [], new Date());
    return {
      profile_id: pid,
      mode: "times",
      next_run_at: next ? new Date(next).toISOString() : null,
      seconds_left: next ? Math.max(0, Math.ceil((next - now) / 1000)) : null,
    };
  });

  return [...intervalStatus, ...timesStatus];
}
