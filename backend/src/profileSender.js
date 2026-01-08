
// import axios from "axios";
// import { db } from "./db.js";
// import { sendMail } from "./graphMailer.js";

// /* ===== helpers ===== */
// const normKey = (k) => String(k || "").trim().toLowerCase();

// function formatDate(dt) {
//   const d = new Date(dt || new Date());
//   if (Number.isNaN(d.getTime())) return "-";
//   return new Intl.DateTimeFormat("th-TH", {
//     dateStyle: "medium",
//     timeStyle: "short",
//   }).format(d);
// }

// // ✅ normal=เขียว, risk=ส้ม, danger=แดง
// function iconByLevel(level) {
//   const lv = normKey(level);
//   if (lv === "danger") return "🟥";
//   if (lv === "risk") return "🟧";
//   if (lv === "normal") return "🟩";
//   return "⬜";
// }

// // ✅ แปลงระดับเป็นภาษาไทย
// function levelLabelTH(level) {
//   const lv = normKey(level);
//   if (lv === "danger") return "อันตราย";
//   if (lv === "risk") return "เสี่ยง";
//   if (lv === "normal") return "ปกติ";
//   return "ไม่ทราบสถานะ";
// }

// // ✅ รองรับ operator/value จาก DB และจาก payload อื่น ๆ
// function matchRule(value, rule) {
//   const op = String(rule.operator ?? rule.op ?? ">").trim().toLowerCase();
//   const v1 = rule.value1 ?? rule.value ?? null;
//   const v2 = rule.value2 ?? null;

//   if (value === null || value === undefined || Number.isNaN(Number(value))) return false;
//   const x = Number(value);

//   const a = v1 === null || v1 === undefined ? null : Number(v1);
//   const b = v2 === null || v2 === undefined ? null : Number(v2);

//   switch (op) {
//     case ">": return a !== null && x > a;
//     case ">=": return a !== null && x >= a;
//     case "<": return a !== null && x < a;
//     case "<=": return a !== null && x <= a;
//     case "==":
//     case "=": return a !== null && x === a;
//     case "!=":
//     case "<>": return a !== null && x !== a;
//     case "between":
//     case "range":
//       return a !== null && b !== null && x >= Math.min(a, b) && x <= Math.max(a, b);
//     default:
//       return a !== null && x > a;
//   }
// }

// function pickLevelByRules(value, rules = []) {
//   for (const r of rules) {
//     if (matchRule(value, r)) return normKey(r.level) || "danger";
//   }
//   return "normal";
// }

// function escTable(name) {
//   return `\`${String(name).replace(/`/g, "``")}\``;
// }

// function escCol(name) {
//   const s = String(name || "").trim();
//   if (!/^[A-Za-z0-9_]+$/.test(s)) {
//     throw new Error("Invalid column name: " + s);
//   }
//   return `\`${s.replace(/`/g, "``")}\``;
// }

// /* ===== DB loaders ===== */
// async function getLineToken() {
//   const [rows] = await db.query(
//     "SELECT channel_token FROM line_config WHERE is_active=1 LIMIT 1"
//   );
//   return rows[0]?.channel_token || null;
// }

// async function getProfile(profileId) {
//   const [[p]] = await db.query(
//     "SELECT id, profile_name, is_active, avg_window_min FROM alert_profile WHERE id=?",
//     [profileId]
//   );
//   return p || null;
// }

// /**
//  * ✅ ดึง “code ของสถานี” สำหรับใช้เป็นชื่อตาราง/ดึง config
//  * - รองรับกรณี DB เก็บชื่อไทยไว้ (a.station_code = sd.name)
//  * - และรองรับกรณี DB เก็บ code ไว้แล้ว (a.station_code = sd.code)
//  * - ถ้า JOIN ไม่เจอ จะ fallback ใช้ค่าที่เก็บใน alert_profile_station ไปเลย (กันว่าง)
//  */
// async function getProfileStations(profileId) {
//   const [rows] = await db.query(
//     `
//     SELECT COALESCE(sd.code, a.station_code) AS station_code
//     FROM alert_profile_station a
//     LEFT JOIN station_details sd
//       ON TRIM(a.station_code) COLLATE utf8mb4_general_ci = TRIM(sd.code) COLLATE utf8mb4_general_ci
//       OR TRIM(a.station_code) COLLATE utf8mb4_general_ci = TRIM(sd.name) COLLATE utf8mb4_general_ci
//     WHERE a.profile_id=?
//     ORDER BY station_code
//     `,
//     [profileId]
//   );
//   return rows.map((r) => String(r.station_code));
// }

// async function getProfileRecipients(profileId) {
//   const [rows] = await db.query(
//     `
//     SELECT channel_type, destination
//     FROM alert_profile_recipient
//     WHERE profile_id=? AND is_enable=1
//     ORDER BY channel_type, id
//     `,
//     [profileId]
//   );

//   const lineTargets = rows
//     .filter((x) => x.channel_type === "LINE")
//     .map((x) => String(x.destination));

//   const emails = rows
//     .filter((x) => x.channel_type === "EMAIL")
//     .map((x) => String(x.destination));

//   return { lineTargets, emails };
// }

// async function getProfileRules(profileId) {
//   const [rows] = await db.query(
//     `
//     SELECT sensor_key, operator, value1, value2, level, priority
//     FROM alert_profile_rule
//     WHERE profile_id=? AND is_enable=1
//     ORDER BY sensor_key, priority DESC, id DESC
//     `,
//     [profileId]
//   );

//   const map = {};
//   for (const r of rows) {
//     const key = normKey(r.sensor_key);
//     if (!key) continue;
//     if (!map[key]) map[key] = [];
//     map[key].push({
//       ...r,
//       level: normKey(r.level),
//       operator: String(r.operator || ">").trim(),
//     });
//   }
//   return map;
// }

// /**
//  * ✅ ดึง config field ที่จะแสดง/คำนวณ
//  * ตอนนี้คุณเปลี่ยนไปใช้ wsv_tags แล้ว
//  * - แก้ alias ผิด (ield_key -> field_key)
//  * - ใส่ WHERE station_code=? แบบปลอดภัย (ถ้าตารางไม่มีคอลัมน์นี้ จะ fallback ยิงแบบไม่กรอง)
//  */
// async function getRawConfig(stationCode) {
//   const code = String(stationCode || "").trim();

//   // 1) พยายามกรองตาม station_code ก่อน
//   try {
//     const [rows] = await db.query(
//       `
//       SELECT 
//         tag_name AS field_key,
//         tag_name AS field_label,
//         tag_unit AS field_unit
//       FROM wsv_tags
//       WHERE station_code=? 
//       ORDER BY id
//       `,
//       [code]
//     );
//     return rows;
//   } catch (e) {
//     // 2) ถ้า schema จริงไม่มี station_code ให้ fallback ไม่กรอง
//     const [rows] = await db.query(
//       `
//       SELECT 
//         tag_name AS field_key,
//         tag_name AS field_label,
//         tag_unit AS field_unit
//       FROM wsv_tags
//       `
//     );
//     return rows;
//   }
// }

// async function ensureTableExists(tableName) {
//   const [rows] = await db.query("SHOW TABLES LIKE ?", [tableName]);
//   return rows.length > 0;
// }

// async function getLatestData(tableName) {
//   const q = `SELECT * FROM ${escTable(tableName)} ORDER BY DateTime DESC LIMIT 1`;
//   const [[row]] = await db.query(q);
//   return row || null;
// }

// async function getAvgData(tableName, fieldKeys, minutes) {
//   const mins = Math.max(1, Number(minutes) || 1);

//   const keys = (fieldKeys || []).filter(Boolean);
//   if (!keys.length) return null;

//   const avgCols = keys.map((k) => `AVG(${escCol(k)}) AS ${escCol(k)}`).join(", ");

//   const q = `
//     SELECT MAX(DateTime) AS DateTime, ${avgCols}
//     FROM ${escTable(tableName)}
//     WHERE DateTime >= (NOW() - INTERVAL ? MINUTE)
//   `;

//   const [[row]] = await db.query(q, [mins]);
//   return row || null;
// }

// /* ===== station name resolver (for display) ===== */
// const stationNameCache = new Map();

// /**
//  * ✅ เอา "ชื่อสถานี" มาแสดงแทน code
//  * - ถ้าเจอใน station_details(code=?) -> ใช้ name
//  * - ถ้าไม่เจอ -> ลองหา (name=?)
//  * - ถ้าไม่เจออีก -> fallback ใช้ stationCode เดิม
//  */
// async function getStationNameByCode(stationCode) {
//   const code = String(stationCode || "").trim();
//   if (!code) return "-";

//   if (stationNameCache.has(code)) return stationNameCache.get(code);

//   // find by code
//   const [[r1]] = await db.query(
//     `SELECT name FROM station_details WHERE code=? LIMIT 1`,
//     [code]
//   );
//   if (r1?.name) {
//     const name = String(r1.name);
//     stationNameCache.set(code, name);
//     return name;
//   }

//   // fallback: sometimes "stationCode" stored as Thai name
//   const [[r2]] = await db.query(
//     `SELECT name FROM station_details WHERE name=? LIMIT 1`,
//     [code]
//   );
//   if (r2?.name) {
//     const name = String(r2.name);
//     stationNameCache.set(code, name);
//     return name;
//   }

//   stationNameCache.set(code, code);
//   return code;
// }

// /* ===== message ===== */
// function buildMessage(profileName, stationLabel, rawCfg, data, rulesMap, avgMin = 0) {
//   const dataKeyMap = {};
//   for (const k of Object.keys(data || {})) dataKeyMap[normKey(k)] = k;

//   let msg = `แจ้งเตือนคุณภาพน้ำ
// กลุ่ม: ${profileName}
// สถานี : ${stationLabel}
// เวลา : ${formatDate(data?.DateTime || new Date())}${avgMin > 0 ? ` (เฉลี่ย ${avgMin} นาทีล่าสุด)` : ""}
// `;

//   for (const f of rawCfg) {
//     const fieldKey = String(f.field_key || "").trim();
//     const fieldKeyNorm = normKey(fieldKey);

//     const realCol =
//       data?.[fieldKey] !== undefined ? fieldKey : dataKeyMap[fieldKeyNorm];

//     const rawVal = realCol ? data?.[realCol] : undefined;
//     const num =
//       rawVal !== null && rawVal !== undefined && rawVal !== ""
//         ? Number(rawVal)
//         : null;

//     let rules =
//       rulesMap?.[fieldKeyNorm] ||
//       (fieldKeyNorm === "do" ? rulesMap?.["do2"] : null) ||
//       [];

//     const level = pickLevelByRules(num, rules);
//     const icon = iconByLevel(level);
//     const th = levelLabelTH(level);

//     msg += `${icon} ${f.field_label} = ${num !== null && !Number.isNaN(num) ? num.toFixed(2) : "-"
//       } ${f.field_unit || ""} (${th})\n`;
//   }

//   return msg;
// }

// /* ===== MAIN: send by profile ===== */
// export async function sendProfileNow(profileId) {
//   const profile = await getProfile(profileId);
//   if (!profile) throw new Error("ไม่พบ profile");
//   if (Number(profile.is_active) !== 1) throw new Error("profile ยังปิดอยู่");

//   const stationCodes = await getProfileStations(profileId);
//   if (!stationCodes.length) throw new Error("profile ไม่มี station");

//   const { lineTargets, emails } = await getProfileRecipients(profileId);
//   const rulesMap = await getProfileRules(profileId);

//   console.log("📌 sendProfileNow:", {
//     profileId,
//     name: profile.profile_name,
//     stations: stationCodes,
//     lineTargetsCount: lineTargets.length,
//     emailsCount: emails.length,
//     ruleKeys: Object.keys(rulesMap || {}),
//   });

//   if (!lineTargets.length && !emails.length) {
//     throw new Error("ไม่มีผู้รับ (LINE/EMAIL) ในโปรไฟล์นี้");
//   }

//   const lineToken = await getLineToken();
//   if (lineTargets.length && !lineToken) {
//     throw new Error("ไม่พบ LINE token (line_config is_active=1?)");
//   }

//   for (const stationCode of stationCodes) {
//     // ✅ แสดงชื่อสถานีในข้อความ
//     const stationName = await getStationNameByCode(stationCode);
//     const stationLabel = stationName || stationCode;

//     // ✅ ยังใช้ stationCode เป็นชื่อตารางตามเดิม
//     const tableName = stationCode;

//     const okTable = await ensureTableExists(tableName);
//     if (!okTable) {
//       console.log("⚠️ ไม่พบตารางข้อมูลของสถานี:", tableName);
//       continue;
//     }

//     const rawCfg = await getRawConfig(stationCode);
//     if (!rawCfg.length) {
//       console.log("⚠️ ไม่มี tag/config ของสถานี:", stationCode);
//       continue;
//     }

//     const avgMin = Number(profile.avg_window_min || 0);
//     const fieldKeys = rawCfg.map((x) => String(x.field_key || "").trim());

//     const data =
//       avgMin > 0
//         ? await getAvgData(tableName, fieldKeys, avgMin)
//         : await getLatestData(tableName);

//     if (!data) {
//       console.log("⚠️ ไม่มีข้อมูลล่าสุดในตาราง:", tableName);
//       continue;
//     }

//     console.log("🔎 keys:", {
//       stationCode,
//       stationLabel,
//       rawCfgKeys: rawCfg.map((x) => x.field_key),
//       dataKeysSample: Object.keys(data).slice(0, 20),
//     });

//     const text = buildMessage(
//       profile.profile_name,
//       stationLabel, // ✅ ใช้ชื่อสถานีแสดงผล
//       rawCfg,
//       data,
//       rulesMap,
//       avgMin
//     );

//     const html = text.replace(/\n/g, "<br>");

//     // LINE
//     if (lineTargets.length) {
//       for (const to of lineTargets) {
//         try {
//           await axios.post(
//             "https://api.line.me/v2/bot/message/push",
//             { to, messages: [{ type: "text", text }] },
//             { headers: { Authorization: `Bearer ${lineToken}` } }
//           );
//           console.log("✅ LINE sent:", { stationCode, to });
//         } catch (e) {
//           console.error("❌ LINE send error:", { stationCode, to, msg: e?.message });
//         }
//       }
//     }

//     // EMAIL
//     if (emails.length) {
//       for (const to of emails) {
//         try {
//           await sendMail(to, `แจ้งเตือน Water - ${stationLabel}`, html);
//           console.log("✅ EMAIL sent:", { stationCode, to });
//         } catch (e) {
//           console.error("❌ EMAIL send error:", { stationCode, to, msg: e?.message });
//         }
//       }
//     }
//   }

//   return true;
// }
import axios from "axios";
import crypto from "crypto";
import { db } from "./db.js";
import { sendMail } from "./graphMailer.js";

/* ===== helpers ===== */
const normKey = (k) => String(k || "").trim().toLowerCase();

function formatDate(dt) {
  const d = new Date(dt || new Date());
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

// ✅ normal=เขียว, risk=ส้ม, danger=แดง
function iconByLevel(level) {
  const lv = normKey(level);
  if (lv === "danger") return "🟥";
  if (lv === "risk") return "🟧";
  if (lv === "normal") return "🟩";
  return "⬜";
}

// ✅ แปลงระดับเป็นภาษาไทย
function levelLabelTH(level) {
  const lv = normKey(level);
  if (lv === "danger") return "อันตราย";
  if (lv === "risk") return "เสี่ยง";
  if (lv === "normal") return "ปกติ";
  return "ไม่ทราบสถานะ";
}

function roundFixed(num, digits = 2) {
  const n = Number(num);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(digits));
}

function sha1(text) {
  return crypto.createHash("sha1").update(String(text)).digest("hex");
}

/**
 * ✅ รองรับ operator/value จาก DB และจาก payload อื่น ๆ
 */
function matchRule(value, rule) {
  const op = String(rule.operator ?? rule.op ?? ">").trim().toLowerCase();
  const v1 = rule.value1 ?? rule.value ?? null;
  const v2 = rule.value2 ?? null;

  if (value === null || value === undefined || Number.isNaN(Number(value))) return false;
  const x = Number(value);

  const a = v1 === null || v1 === undefined ? null : Number(v1);
  const b = v2 === null || v2 === undefined ? null : Number(v2);

  switch (op) {
    case ">": return a !== null && x > a;
    case ">=": return a !== null && x >= a;
    case "<": return a !== null && x < a;
    case "<=": return a !== null && x <= a;
    case "==":
    case "=": return a !== null && x === a;
    case "!=":
    case "<>": return a !== null && x !== a;
    case "between":
    case "range":
      return a !== null && b !== null && x >= Math.min(a, b) && x <= Math.max(a, b);
    default:
      return a !== null && x > a;
  }
}

function pickLevelByRules(value, rules = []) {
  for (const r of rules) {
    if (matchRule(value, r)) return normKey(r.level) || "danger";
  }
  return "normal";
}

function escTable(name) {
  return `\`${String(name).replace(/`/g, "``")}\``;
}

function escCol(name) {
  const s = String(name || "").trim();
  if (!/^[A-Za-z0-9_]+$/.test(s)) {
    throw new Error("Invalid column name: " + s);
  }
  return `\`${s.replace(/`/g, "``")}\``;
}

/* ===== DB loaders ===== */
async function getLineToken() {
  const [rows] = await db.query(
    "SELECT channel_token FROM line_config WHERE is_active=1 LIMIT 1"
  );
  return rows[0]?.channel_token || null;
}

async function getProfile(profileId) {
  const [[p]] = await db.query(
    "SELECT id, profile_name, is_active, avg_window_min FROM alert_profile WHERE id=?",
    [profileId]
  );
  return p || null;
}

/**
 * ✅ ดึง “code ของสถานี” สำหรับใช้เป็นชื่อตาราง/ดึง config
 * - รองรับกรณี DB เก็บชื่อไทยไว้ (a.station_code = sd.name)
 * - และรองรับกรณี DB เก็บ code ไว้แล้ว (a.station_code = sd.code)
 * - ถ้า JOIN ไม่เจอ จะ fallback ใช้ค่าที่เก็บใน alert_profile_station ไปเลย (กันว่าง)
 */
async function getProfileStations(profileId) {
  const [rows] = await db.query(
    `
    SELECT COALESCE(sd.code, a.station_code) AS station_code
    FROM alert_profile_station a
    LEFT JOIN station_details sd
      ON TRIM(a.station_code) COLLATE utf8mb4_general_ci = TRIM(sd.code) COLLATE utf8mb4_general_ci
      OR TRIM(a.station_code) COLLATE utf8mb4_general_ci = TRIM(sd.name) COLLATE utf8mb4_general_ci
    WHERE a.profile_id=?
    ORDER BY station_code
    `,
    [profileId]
  );
  return rows.map((r) => String(r.station_code));
}

async function getProfileRecipients(profileId) {
  const [rows] = await db.query(
    `
    SELECT channel_type, destination
    FROM alert_profile_recipient
    WHERE profile_id=? AND is_enable=1
    ORDER BY channel_type, id
    `,
    [profileId]
  );

  const lineTargets = rows
    .filter((x) => x.channel_type === "LINE")
    .map((x) => String(x.destination));

  const emails = rows
    .filter((x) => x.channel_type === "EMAIL")
    .map((x) => String(x.destination));

  return { lineTargets, emails };
}

/**
 * ✅ ดึง rules แล้วจัดเรียงใน JS ให้ "รุนแรงก่อน" เสมอ
 * รองรับกรณี:
 * - level มีค่า (normal/risk/danger)
 * - หรือคุณเก็บระดับไว้ใน priority (priority='normal') ก็ยังทำงาน
 */
async function getProfileRules(profileId) {
  const [rows] = await db.query(
    `
    SELECT sensor_key, operator, value1, value2, level, priority
    FROM alert_profile_rule
    WHERE profile_id=? AND is_enable=1
    `,
    [profileId]
  );

  const sev = (lv) => {
    const x = normKey(lv);
    if (x === "danger") return 3;
    if (x === "risk") return 2;
    if (x === "normal") return 1;
    return 0;
  };

  const map = {};
  for (const r of rows) {
    const key = normKey(r.sensor_key);
    if (!key) continue;

    // ✅ ถ้า level ว่าง แต่ priority เป็น "normal/risk/danger" → ใช้เป็น level แทน
    const lv = normKey(r.level ?? r.priority);

    const prNum = Number.isFinite(Number(r.priority)) ? Number(r.priority) : 0;

    if (!map[key]) map[key] = [];
    map[key].push({
      ...r,
      level: lv || "danger",
      operator: String(r.operator || ">").trim(),
      priority_num: prNum,
      severity_num: sev(lv),
    });
  }

  // ✅ sort: severity สูงก่อน แล้วค่อย priority_num
  for (const k of Object.keys(map)) {
    map[k].sort((a, b) => {
      if (b.severity_num !== a.severity_num) return b.severity_num - a.severity_num;
      if (b.priority_num !== a.priority_num) return b.priority_num - a.priority_num;
      return 0;
    });
  }

  return map;
}

/**
 * ✅ ดึง config field ที่จะแสดง/คำนวณ
 * ตอนนี้คุณเปลี่ยนไปใช้ wsv_tags แล้ว
 * - ใส่ WHERE station_code=? แบบปลอดภัย (ถ้าตารางไม่มีคอลัมน์นี้ จะ fallback ยิงแบบไม่กรอง)
 */
async function getRawConfig(stationCode) {
  const code = String(stationCode || "").trim();

  // 1) พยายามกรองตาม station_code ก่อน
  try {
    const [rows] = await db.query(
      `
      SELECT 
        tag_name AS field_key,
        tag_name AS field_label,
        tag_unit AS field_unit
      FROM wsv_tags
      WHERE station_code=? 
      ORDER BY id
      `,
      [code]
    );
    return rows;
  } catch (e) {
    // 2) ถ้า schema จริงไม่มี station_code ให้ fallback ไม่กรอง
    const [rows] = await db.query(
      `
      SELECT 
        tag_name AS field_key,
        tag_name AS field_label,
        tag_unit AS field_unit
      FROM wsv_tags
      `
    );
    return rows;
  }
}

async function ensureTableExists(tableName) {
  const [rows] = await db.query("SHOW TABLES LIKE ?", [tableName]);
  return rows.length > 0;
}

async function getLatestData(tableName) {
  const q = `SELECT * FROM ${escTable(tableName)} ORDER BY DateTime DESC LIMIT 1`;
  const [[row]] = await db.query(q);
  return row || null;
}

async function getAvgData(tableName, fieldKeys, minutes) {
  const mins = Math.max(1, Number(minutes) || 1);

  const keys = (fieldKeys || []).filter(Boolean);
  if (!keys.length) return null;

  const avgCols = keys.map((k) => `AVG(${escCol(k)}) AS ${escCol(k)}`).join(", ");

  const q = `
    SELECT MAX(DateTime) AS DateTime, ${avgCols}
    FROM ${escTable(tableName)}
    WHERE DateTime >= (NOW() - INTERVAL ? MINUTE)
  `;

  const [[row]] = await db.query(q, [mins]);
  return row || null;
}

/* ===== station name resolver (for display) ===== */
const stationNameCache = new Map();

/**
 * ✅ เอา "ชื่อสถานี" มาแสดงแทน code
 * - ถ้าเจอใน station_details(code=?) -> ใช้ name
 * - ถ้าไม่เจอ -> ลองหา (name=?)
 * - ถ้าไม่เจออีก -> fallback ใช้ stationCode เดิม
 */
async function getStationNameByCode(stationCode) {
  const code = String(stationCode || "").trim();
  if (!code) return "-";

  if (stationNameCache.has(code)) return stationNameCache.get(code);

  const [[r1]] = await db.query(
    `SELECT name FROM station_details WHERE code=? LIMIT 1`,
    [code]
  );
  if (r1?.name) {
    const name = String(r1.name);
    stationNameCache.set(code, name);
    return name;
  }

  const [[r2]] = await db.query(
    `SELECT name FROM station_details WHERE name=? LIMIT 1`,
    [code]
  );
  if (r2?.name) {
    const name = String(r2.name);
    stationNameCache.set(code, name);
    return name;
  }

  stationNameCache.set(code, code);
  return code;
}

/* ===== dedup (กันส่งซ้ำ) ===== */
let _dedupReady = false;

async function ensureDedupTable() {
  if (_dedupReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_sent_dedup (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      profile_id BIGINT NOT NULL,
      station_code VARCHAR(64) NOT NULL,
      signature VARCHAR(128) NOT NULL,
      sent_at DATETIME NOT NULL,
      UNIQUE KEY uq_profile_station_sig (profile_id, station_code, signature),
      KEY idx_sent_at (sent_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  _dedupReady = true;
}

function getDedupWindowMin(profile, avgMin = 0) {
  // ปรับได้ด้วย ENV: ALERT_DEDUP_MINUTES
  const env = Number(process.env.ALERT_DEDUP_MINUTES);
  if (Number.isFinite(env) && env > 0) return Math.floor(env);

  // ถ้าใช้ avg window → กันซ้ำอย่างน้อยเท่าช่วง avg (หรือขั้นต่ำ 10 นาที)
  if (avgMin > 0) return Math.max(10, Math.floor(avgMin));

  // ค่าเริ่มต้นกัน spam
  return 30;
}

async function isDuplicate(profileId, stationCode, signature, dedupMin) {
  await ensureDedupTable();

  const [[row]] = await db.query(
    `
    SELECT 1 AS ok
    FROM alert_sent_dedup
    WHERE profile_id=? AND station_code=? AND signature=?
      AND sent_at >= (NOW() - INTERVAL ? MINUTE)
    LIMIT 1
    `,
    [profileId, stationCode, signature, dedupMin]
  );
  return !!row?.ok;
}

async function markSent(profileId, stationCode, signature) {
  await ensureDedupTable();

  await db.query(
    `
    INSERT INTO alert_sent_dedup (profile_id, station_code, signature, sent_at)
    VALUES (?,?,?,NOW())
    ON DUPLICATE KEY UPDATE sent_at=NOW()
    `,
    [profileId, stationCode, signature]
  );
}

/* ===== message build + evaluate ===== */
function buildMessageAndEval(profileName, stationLabel, rawCfg, data, rulesMap, avgMin = 0) {
  const dataKeyMap = {};
  for (const k of Object.keys(data || {})) dataKeyMap[normKey(k)] = k;

  const lines = [];
  const abnormal = []; // เอาไว้ทำ signature กันซ้ำ
  let hasAbnormal = false;

  for (const f of rawCfg) {
    const fieldKey = String(f.field_key || "").trim();
    const fieldKeyNorm = normKey(fieldKey);

    const realCol =
      data?.[fieldKey] !== undefined ? fieldKey : dataKeyMap[fieldKeyNorm];

    const rawVal = realCol ? data?.[realCol] : undefined;
    const num =
      rawVal !== null && rawVal !== undefined && rawVal !== ""
        ? Number(rawVal)
        : null;

    let rules =
      rulesMap?.[fieldKeyNorm] ||
      (fieldKeyNorm === "do" ? rulesMap?.["do2"] : null) ||
      [];

    const level = pickLevelByRules(num, rules);
    const icon = iconByLevel(level);
    const th = levelLabelTH(level);

    const valRounded =
      num !== null && Number.isFinite(num) ? roundFixed(num, 2) : null;

    if (normKey(level) !== "normal") {
      hasAbnormal = true;
      abnormal.push({
        k: fieldKeyNorm,
        v: valRounded,
        lv: normKey(level),
      });
    }

    lines.push(
      `${icon} ${f.field_label} = ${valRounded !== null ? valRounded.toFixed(2) : "-"
      } ${f.field_unit || ""} (${th})`
    );
  }

  // ✅ signature: “เฉพาะตัวที่ผิดปกติ” (ถ้ากลับมาผิดปกติแบบเดิม จะกันซ้ำได้ดี)
  const signature = sha1(
    JSON.stringify({
      profile: String(profileName || ""),
      station: String(stationLabel || ""),
      abnormal: abnormal.sort((a, b) => (a.k > b.k ? 1 : -1)),
    })
  );

  const header = `แจ้งเตือนคุณภาพน้ำ
กลุ่ม: ${profileName}
สถานี : ${stationLabel}
เวลา : ${formatDate(data?.DateTime || new Date())}${avgMin > 0 ? ` (เฉลี่ย ${avgMin} นาทีล่าสุด)` : ""}
`;

  const text = header + lines.join("\n") + "\n";

  return { text, hasAbnormal, signature };
}

/* ===== MAIN: send by profile ===== */
export async function sendProfileNow(profileId) {
  const profile = await getProfile(profileId);
  if (!profile) throw new Error("ไม่พบ profile");
  if (Number(profile.is_active) !== 1) throw new Error("profile ยังปิดอยู่");

  const stationCodes = await getProfileStations(profileId);
  if (!stationCodes.length) throw new Error("profile ไม่มี station");

  const { lineTargets, emails } = await getProfileRecipients(profileId);
  const rulesMap = await getProfileRules(profileId);

  console.log("📌 sendProfileNow:", {
    profileId,
    name: profile.profile_name,
    stations: stationCodes,
    lineTargetsCount: lineTargets.length,
    emailsCount: emails.length,
    ruleKeys: Object.keys(rulesMap || {}),
  });

  if (!lineTargets.length && !emails.length) {
    throw new Error("ไม่มีผู้รับ (LINE/EMAIL) ในโปรไฟล์นี้");
  }

  const lineToken = await getLineToken();
  if (lineTargets.length && !lineToken) {
    throw new Error("ไม่พบ LINE token (line_config is_active=1?)");
  }

  for (const stationCode of stationCodes) {
    const stationName = await getStationNameByCode(stationCode);
    const stationLabel = stationName || stationCode;

    // ✅ ใช้ stationCode เป็นชื่อตารางตามเดิม
    const tableName = stationCode;

    const okTable = await ensureTableExists(tableName);
    if (!okTable) {
      console.log("⚠️ ไม่พบตารางข้อมูลของสถานี:", tableName);
      continue;
    }

    const rawCfg = await getRawConfig(stationCode);
    if (!rawCfg.length) {
      console.log("⚠️ ไม่มี tag/config ของสถานี:", stationCode);
      continue;
    }

    const avgMin = Number(profile.avg_window_min || 0);
    const fieldKeys = rawCfg.map((x) => String(x.field_key || "").trim());

    const data =
      avgMin > 0
        ? await getAvgData(tableName, fieldKeys, avgMin)
        : await getLatestData(tableName);

    if (!data) {
      console.log("⚠️ ไม่มีข้อมูลล่าสุดในตาราง:", tableName);
      continue;
    }

    const { text, hasAbnormal, signature } = buildMessageAndEval(
      profile.profile_name,
      stationLabel,
      rawCfg,
      data,
      rulesMap,
      avgMin
    );

    // ✅ กติกาใหม่: ถ้าทุก sensor เป็น normal → ไม่ส่ง
    if (!hasAbnormal) {
      console.log("🟩 All NORMAL -> skip sending:", { profileId, stationCode, stationLabel });
      continue;
    }

    // ✅ กันส่งซ้ำ (ถ้าผิดปกติแบบเดิมภายในช่วงเวลา dedupWindowMin)
    const dedupMin = getDedupWindowMin(profile, avgMin);
    const dup = await isDuplicate(profileId, stationCode, signature, dedupMin);
    if (dup) {
      console.log("⏭️ Duplicate blocked:", { profileId, stationCode, dedupMin });
      continue;
    }

    const html = text.replace(/\n/g, "<br>");

    let anySent = false;

    // LINE
    if (lineTargets.length) {
      for (const to of lineTargets) {
        try {
          await axios.post(
            "https://api.line.me/v2/bot/message/push",
            { to, messages: [{ type: "text", text }] },
            { headers: { Authorization: `Bearer ${lineToken}` } }
          );
          anySent = true;
          console.log("✅ LINE sent:", { stationCode, to });
        } catch (e) {
          console.error("❌ LINE send error:", { stationCode, to, msg: e?.message });
        }
      }
    }

    // EMAIL
    if (emails.length) {
      for (const to of emails) {
        try {
          await sendMail(to, `แจ้งเตือน Water - ${stationLabel}`, html);
          anySent = true;
          console.log("✅ EMAIL sent:", { stationCode, to });
        } catch (e) {
          console.error("❌ EMAIL send error:", { stationCode, to, msg: e?.message });
        }
      }
    }

    // ✅ mark sent (กันส่งซ้ำ) เฉพาะกรณี “ส่งสำเร็จอย่างน้อย 1 ช่องทาง”
    if (anySent) {
      await markSent(profileId, stationCode, signature);
    } else {
      console.log("⚠️ No channel success -> not mark dedup:", { profileId, stationCode });
    }
  }

  return true;
}
