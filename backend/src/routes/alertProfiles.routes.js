import express from "express";
import { db } from "../db.js";

// ❗ ถ้าไฟล์นี้มี send-now แล้วเรียก fireProfile ต้อง import ให้ถูก (แล้วแต่โปรเจกต์คุณ)
// import { fireProfile } from "../scheduler.js"  // <-- ตัวอย่าง

const router = express.Router();

function toIntOr0(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalize(payload) {
  const p = payload || {};
  return {
    profile_name: String(p.profile_name || "").trim(),
    is_active: p.is_active === 0 ? 0 : 1,
    send_mode: p.send_mode === "times" ? "times" : "interval",
    interval_min: p.interval_min ? Number(p.interval_min) : null,

    // ✅ เพิ่ม: 0=latest, >0=avg window minutes
    avg_window_min: toIntOr0(p.avg_window_min),

    stations: Array.isArray(p.stations) ? p.stations.map(String) : [],
    times: Array.isArray(p.times) ? p.times.map(String) : [],
    sensors: Array.isArray(p.sensors) ? p.sensors : [],
    recipients: p.recipients || { lineTargets: [], emails: [] },
  };
}

async function loadProfile(profileId) {
  const [[ap]] = await db.query(
    `SELECT id, profile_name, send_mode, interval_min, avg_window_min, is_active, created_at, updated_at
     FROM alert_profile
     WHERE id=?`,
    [profileId]
  );
  if (!ap) return null;

  const [st] = await db.query(
    `SELECT station_code
     FROM alert_profile_station
     WHERE profile_id=?
     ORDER BY station_code`,
    [profileId]
  );

  const [tm] = await db.query(
    `SELECT DATE_FORMAT(send_time, '%H:%i') AS send_time
     FROM alert_profile_time
     WHERE profile_id=?
     ORDER BY send_time`,
    [profileId]
  );

  const [rc] = await db.query(
    `SELECT channel_type, destination
     FROM alert_profile_recipient
     WHERE profile_id=? AND is_enable=1
     ORDER BY channel_type, id`,
    [profileId]
  );

  const [rr] = await db.query(
    `SELECT sensor_key, operator, value1, value2, level, priority
     FROM alert_profile_rule
     WHERE profile_id=? AND is_enable=1
     ORDER BY sensor_key, priority DESC, id DESC`,
    [profileId]
  );

  const mapRules = {};
  for (const r of rr) {
    if (!mapRules[r.sensor_key]) mapRules[r.sensor_key] = [];
    mapRules[r.sensor_key].push({
      op: r.operator,
      value: r.value1,
      value2: r.value2,
      level: r.level,
      priority: r.priority,
    });
  }

  const lineTargets = rc
    .filter((x) => x.channel_type === "LINE")
    .map((x) => x.destination);

  const emails = rc
    .filter((x) => x.channel_type === "EMAIL")
    .map((x) => x.destination);

  return {
    id: ap.id,
    profile_name: ap.profile_name,
    send_mode: ap.send_mode,
    interval_min: ap.interval_min,

    // ✅ ส่งกลับให้ frontend hydrate
    avg_window_min: ap.avg_window_min,

    is_active: ap.is_active,
    created_at: ap.created_at,
    updated_at: ap.updated_at,
    stations: st.map((x) => x.station_code),
    times: tm.map((x) => x.send_time),
    sensors: Object.entries(mapRules).map(([key, rules]) => ({ key, rules })),
    recipients: { lineTargets, emails },
  };
}

/* LIST */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        p.id,
        p.profile_name,
        p.send_mode,
        p.interval_min,
        p.avg_window_min,   -- ✅ เพิ่ม
        t.times,
        p.is_active,
        p.created_at,
        p.updated_at
      FROM alert_profile p
      LEFT JOIN (
        SELECT
          profile_id,
          GROUP_CONCAT(send_time ORDER BY send_time SEPARATOR ',') AS times
        FROM alert_profile_time
        GROUP BY profile_id
      ) t ON t.profile_id = p.id
      ORDER BY p.updated_at DESC, p.id DESC;
      `
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("GET /api/alert-profiles error:", err);
    res.status(500).json({ success: false, message: "โหลดรายการไม่สำเร็จ" });
  }
});

/* READ */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = await loadProfile(id);
    if (!data) return res.status(404).json({ success: false, message: "ไม่พบโปรไฟล์" });
    res.json({ success: true, data });
  } catch (err) {
    console.error("GET /api/alert-profiles/:id error:", err);
    res.status(500).json({ success: false, message: "โหลดไม่สำเร็จ" });
  }
});

/* CREATE */
router.post("/", async (req, res) => {
  const p = normalize(req.body);

  if (!p.profile_name) return res.status(400).json({ success: false, message: "ต้องระบุชื่อกลุ่ม" });
  if (p.stations.length === 0) return res.status(400).json({ success: false, message: "ต้องเลือกอย่างน้อย 1 สถานี" });
  if (p.send_mode === "interval" && (!p.interval_min || p.interval_min <= 0))
    return res.status(400).json({ success: false, message: "interval_min ไม่ถูกต้อง" });
  if (p.send_mode === "times" && p.times.length === 0)
    return res.status(400).json({ success: false, message: "ต้องเพิ่มเวลาอย่างน้อย 1 เวลา" });

  // ✅ validate avg_window_min
  if (p.avg_window_min < 0) return res.status(400).json({ success: false, message: "avg_window_min ไม่ถูกต้อง" });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [r] = await conn.query(
      `INSERT INTO alert_profile (profile_name, send_mode, interval_min, avg_window_min, is_active)
       VALUES (?,?,?,?,?)`,
      [
        p.profile_name,
        p.send_mode,
        p.send_mode === "interval" ? p.interval_min : null,
        p.avg_window_min, // ✅ เพิ่ม
        p.is_active,
      ]
    );
    const profileId = r.insertId;

    for (const s of p.stations) {
      await conn.query(
        `INSERT INTO alert_profile_station (profile_id, station_code)
         VALUES (?,?)`,
        [profileId, s]
      );
    }

    if (p.send_mode === "times") {
      for (const t of p.times) {
        await conn.query(
          `INSERT INTO alert_profile_time (profile_id, send_time)
           VALUES (?, STR_TO_DATE(?, '%H:%i'))`,
          [profileId, t]
        );
      }
    }

    const lineTargets = Array.isArray(p.recipients.lineTargets) ? p.recipients.lineTargets : [];
    const emails = Array.isArray(p.recipients.emails) ? p.recipients.emails : [];

    for (const dest of lineTargets) {
      await conn.query(
        `INSERT INTO alert_profile_recipient (profile_id, channel_type, destination, is_enable)
         VALUES (?, 'LINE', ?, 1)`,
        [profileId, String(dest)]
      );
    }

    for (const dest of emails) {
      await conn.query(
        `INSERT INTO alert_profile_recipient (profile_id, channel_type, destination, is_enable)
         VALUES (?, 'EMAIL', ?, 1)`,
        [profileId, String(dest)]
      );
    }

    for (const s of p.sensors) {
      const sensorKey = String(s.key || "").trim();
      if (!sensorKey) continue;
      const rules = Array.isArray(s.rules) ? s.rules : [];
      for (const rule of rules) {
        await conn.query(
          `INSERT INTO alert_profile_rule
           (profile_id, sensor_key, operator, value1, value2, level, priority, is_enable)
           VALUES (?,?,?,?,?,?,?,1)`,
          [
            profileId,
            sensorKey,
            String(rule.op || ">"),
            rule.value === "" || rule.value === null || rule.value === undefined ? null : Number(rule.value),
            rule.value2 === "" || rule.value2 === null || rule.value2 === undefined ? null : Number(rule.value2),
            String(rule.level || "danger"),
            rule.priority !== undefined ? Number(rule.priority) : 10,
          ]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, id: profileId });
  } catch (err) {
    await conn.rollback();
    console.error("POST /api/alert-profiles error:", err);
    res.status(500).json({ success: false, message: "บันทึกไม่สำเร็จ" });
  } finally {
    conn.release();
  }
});

/* UPDATE */
router.put("/:id", async (req, res) => {
  const profileId = Number(req.params.id);
  const p = normalize(req.body);

  if (!p.profile_name) return res.status(400).json({ success: false, message: "ต้องระบุชื่อกลุ่ม" });
  if (p.stations.length === 0) return res.status(400).json({ success: false, message: "ต้องเลือกอย่างน้อย 1 สถานี" });
  if (p.avg_window_min < 0) return res.status(400).json({ success: false, message: "avg_window_min ไม่ถูกต้อง" });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE alert_profile
       SET profile_name=?,
           send_mode=?,
           interval_min=?,
           avg_window_min=?,   -- ✅ เพิ่ม
           is_active=?
       WHERE id=?`,
      [
        p.profile_name,
        p.send_mode,
        p.send_mode === "interval" ? p.interval_min : null,
        p.avg_window_min, // ✅ เพิ่ม
        p.is_active,
        profileId,
      ]
    );

    await conn.query(`DELETE FROM alert_profile_station WHERE profile_id=?`, [profileId]);
    await conn.query(`DELETE FROM alert_profile_time WHERE profile_id=?`, [profileId]);
    await conn.query(`DELETE FROM alert_profile_recipient WHERE profile_id=?`, [profileId]);
    await conn.query(`DELETE FROM alert_profile_rule WHERE profile_id=?`, [profileId]);

    for (const s of p.stations) {
      await conn.query(
        `INSERT INTO alert_profile_station (profile_id, station_code) VALUES (?,?)`,
        [profileId, s]
      );
    }

    if (p.send_mode === "times") {
      for (const t of p.times) {
        await conn.query(
          `INSERT INTO alert_profile_time (profile_id, send_time)
           VALUES (?, STR_TO_DATE(?, '%H:%i'))`,
          [profileId, t]
        );
      }
    }

    const lineTargets = Array.isArray(p.recipients.lineTargets) ? p.recipients.lineTargets : [];
    const emails = Array.isArray(p.recipients.emails) ? p.recipients.emails : [];

    for (const dest of lineTargets) {
      await conn.query(
        `INSERT INTO alert_profile_recipient (profile_id, channel_type, destination, is_enable)
         VALUES (?, 'LINE', ?, 1)`,
        [profileId, String(dest)]
      );
    }
    for (const dest of emails) {
      await conn.query(
        `INSERT INTO alert_profile_recipient (profile_id, channel_type, destination, is_enable)
         VALUES (?, 'EMAIL', ?, 1)`,
        [profileId, String(dest)]
      );
    }

    for (const s of p.sensors) {
      const sensorKey = String(s.key || "").trim();
      if (!sensorKey) continue;
      const rules = Array.isArray(s.rules) ? s.rules : [];
      for (const rule of rules) {
        await conn.query(
          `INSERT INTO alert_profile_rule
           (profile_id, sensor_key, operator, value1, value2, level, priority, is_enable)
           VALUES (?,?,?,?,?,?,?,1)`,
          [
            profileId,
            sensorKey,
            String(rule.op || ">"),
            rule.value === "" || rule.value === null || rule.value === undefined ? null : Number(rule.value),
            rule.value2 === "" || rule.value2 === null || rule.value2 === undefined ? null : Number(rule.value2),
            String(rule.level || "danger"),
            rule.priority !== undefined ? Number(rule.priority) : 10,
          ]
        );
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("PUT /api/alert-profiles/:id error:", err);
    res.status(500).json({ success: false, message: "อัปเดตไม่สำเร็จ" });
  } finally {
    conn.release();
  }
});

/* TOGGLE ACTIVE */
router.patch("/:id/active", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { is_active } = req.body || {};
    await db.query(`UPDATE alert_profile SET is_active=? WHERE id=?`, [is_active ? 1 : 0, id]);
    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/alert-profiles/:id/active error:", err);
    res.status(500).json({ success: false, message: "สลับสถานะไม่สำเร็จ" });
  }
});

/* SEND NOW */
router.post("/:id/send-now", async (req, res) => {
  try {
    const id = Number(req.params.id);

    // ❗ ต้องแน่ใจว่าไฟล์นี้ import fireProfile หรือ sendProfileNow ถูกตัว
    await fireProfile(id);

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: e.message });
  }
});

/* DELETE */
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM alert_profile_station WHERE profile_id=?`, [id]);
    await conn.query(`DELETE FROM alert_profile_time WHERE profile_id=?`, [id]);
    await conn.query(`DELETE FROM alert_profile_recipient WHERE profile_id=?`, [id]);
    await conn.query(`DELETE FROM alert_profile_rule WHERE profile_id=?`, [id]);
    await conn.query(`DELETE FROM alert_profile WHERE id=?`, [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("DELETE /api/alert-profiles/:id error:", err);
    res.status(500).json({ success: false, message: "ลบไม่สำเร็จ" });
  } finally {
    conn.release();
  }
});

export default router;
