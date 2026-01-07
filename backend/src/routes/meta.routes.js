import express from "express";
import { db } from "../db.js";

const router = express.Router();

// ✅ กัน cache / กัน 304 สำหรับทุก endpoint ใน meta
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

// รายชื่อสถานี
router.get("/stations", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT sd.name  as station_code
      FROM smartdatastation.station_details sd
    `);

    const data = rows.map(r => {
      const id = r.station_code;
      // ถ้า station_code เป็น "station1" -> "Station 1"
      const name = id
        ? id.replace(/^station(\d+)$/i, "Station $1")
        : id;

      return { id, name };
    });

    res.json({ success: true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "โหลด stations ไม่สำเร็จ" });
  }
});


// รายชื่อ sensors ของสถานี (7 ตัว)
router.get("/sensors", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT tag_name, tag_unit
      FROM wsv_tags
      ORDER BY tag_name
    `);

    const data = rows.map(r => {
      const label = String(r.tag_name || '').trim();
      const unit = String(r.tag_unit || '').trim();

      // ทำ key ให้เป็นรูปแบบเดียวกับที่อยากได้ (lowercase + underscore)
      const key = label
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^\w]/g, ''); // ตัดอักขระแปลกๆ ออก

      return { key, label, unit };
    });

    res.json({ success: true, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "โหลด sensors ไม่สำเร็จ" });
  }
});

router.get("/sensors-edit", async (req, res) => {
  try {
    const profileId = Number(req.query.profile_id);
    if (!profileId) return res.status(400).json({ success:false, message:"ต้องส่ง profile_id" });

    const [rows] = await db.query(`
      SELECT sensor_key, operator, value1, level
      FROM alert_profile_rule
      WHERE profile_id = ?
      ORDER BY sensor_key DESC
    `, [profileId]);

    const map = new Map();

    for (const r of rows) {
      const key = String(r.sensor_key || "").trim(); // ✅ ใช้ sensor_key จาก DB ตรงๆ กันหลุด
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, { key, label: key, unit: "", rules: [] });
      }

      map.get(key).rules.push({
        op: r.operator,
        value: r.value1 == null ? null : Number(r.value1),
        value2: r.value2 == null ? null : Number(r.value2),
        level: r.level,
        priority: r.priority ?? null,
      });
    }

    res.json({ success: true, data: Array.from(map.values()) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success:false, message:"โหลด sensors-edit ไม่สำเร็จ" });
  }
});


export default router;
