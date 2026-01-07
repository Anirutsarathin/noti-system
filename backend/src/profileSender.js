// // backend/src/profileSender.js
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
//   // rules เรียง priority DESC มาแล้ว
//   for (const r of rules) {
//     if (matchRule(value, r)) return normKey(r.level) || "danger";
//   }
//   // ถ้าไม่มี rule หรือไม่ match -> normal
//   return "normal";
// }

// function escTable(name) {
//   return `\`${String(name).replace(/`/g, "``")}\``;
// }

// /* ===== DB loaders ===== */
// async function getLineToken() {
//   const [rows] = await db.query(
//     "SELECT channel_token FROM line_config WHERE is_active=1 LIMIT 1"
//   );
//   return rows[0]?.channel_token || null;
// }

// // async function getProfile(profileId) {
// //   const [[p]] = await db.query(
// //     "SELECT id, profile_name, is_active FROM alert_profile WHERE id=?",
// //     [profileId]
// //   );
// //   return p || null;
// // }

// async function getProfile(profileId) {
//   const [[p]] = await db.query(
//     "SELECT id, profile_name, is_active, avg_window_min FROM alert_profile WHERE id=?",
//     [profileId]
//   );
//   return p || null;
// }

// async function getProfileStations(profileId) {
//   const [rows] = await db.query(
//     "SELECT station_code FROM alert_profile_station WHERE profile_id=? ORDER BY station_code",
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

//   // ✅ เก็บ rules ตาม key แบบ lower-case
//   const map = {};
//   for (const r of rows) {
//     const key = normKey(r.sensor_key);
//     if (!key) continue;
//     if (!map[key]) map[key] = [];
//     map[key].push({
//       ...r,
//       level: normKey(r.level), // ✅ normalize level ให้ชัวร์
//       operator: String(r.operator || ">").trim(),
//     });
//   }
//   return map;
// }

// async function getRawConfig(stationCode) {
//   const [rows] = await db.query(
//     `
//     SELECT field_key, field_label, field_unit
//     FROM config_rawdata
//     WHERE station_code=? AND is_enable=1
//     ORDER BY id
//     `,
//     [stationCode]
//   );
//   return rows;
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
// function escCol(name) {
//   const s = String(name || "").trim();
//   // อนุญาตแค่ A-Z a-z 0-9 _ (รองรับ pH, DO, TDS ได้)
//   if (!/^[A-Za-z0-9_]+$/.test(s)) {
//     throw new Error("Invalid column name: " + s);
//   }
//   return `\`${s.replace(/`/g, "``")}\``;
// }

// async function getAvgData(tableName, fieldKeys, minutes) {
//   const mins = Math.max(1, Number(minutes) || 1);

//   // AVG ทุก field_key แล้ว alias กลับเป็นชื่อเดิม
//   const avgCols = (fieldKeys || [])
//     .map((k) => `AVG(${escCol(k)}) AS ${escCol(k)}`)
//     .join(", ");

//   // เอาเวลาสุดท้ายในช่วงนั้นมาโชว์เป็น DateTime
//   const q = `
//     SELECT MAX(DateTime) AS DateTime, ${avgCols}
//     FROM ${escTable(tableName)}
//     WHERE DateTime >= (NOW() - INTERVAL ? MINUTE)
//   `;

//   const [[row]] = await db.query(q, [mins]);
//   return row || null;
// }


// /* ===== message ===== */
// function buildMessage(profileName, stationCode, rawCfg, data, rulesMap, avgMin = 0) {
//   // ✅ ทำ map ให้ lookup คอลัมน์แบบไม่สนตัวใหญ่/เล็ก
//   const dataKeyMap = {};
//   for (const k of Object.keys(data || {})) dataKeyMap[normKey(k)] = k;

//  let msg = `แจ้งเตือนคุณภาพน้ำ
// กลุ่ม: ${profileName}
// สถานี : ${stationCode}
// เวลา : ${formatDate(data?.DateTime || new Date())}${avgMin > 0 ? ` (เฉลี่ย ${avgMin} นาทีล่าสุด)` : ""}
// `;

//   for (const f of rawCfg) {
//     const fieldKey = String(f.field_key || "").trim();
//     const fieldKeyNorm = normKey(fieldKey);

//     // ✅ ดึงค่าจาก data โดยพยายามหลายแบบ (กัน case mismatch)
//     const realCol = data?.[fieldKey] !== undefined
//       ? fieldKey
//       : dataKeyMap[fieldKeyNorm]; // match แบบ lower-case

//     const rawVal = realCol ? data?.[realCol] : undefined;
//     const num = rawVal !== null && rawVal !== undefined && rawVal !== "" ? Number(rawVal) : null;

//     // ✅ หา rules ตาม key แบบ normalize + special-case DO/do2
//     let rules =
//       rulesMap?.[fieldKeyNorm] ||
//       (fieldKeyNorm === "do" ? rulesMap?.["do2"] : null) ||
//       [];

//     const level = pickLevelByRules(num, rules);
//     const icon = iconByLevel(level);

//     msg += `${icon} ${f.field_label} = ${
//       num !== null && !Number.isNaN(num) ? num.toFixed(2) : "-"
//     } ${f.field_unit || ""} (${level})\n`;
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
//     const tableName = stationCode;

//     const okTable = await ensureTableExists(tableName);
//     if (!okTable) {
//       console.log("⚠️ ไม่พบตารางข้อมูลของสถานี:", tableName);
//       continue;
//     }

//     const rawCfg = await getRawConfig(stationCode);
//     if (!rawCfg.length) {
//       console.log("⚠️ ไม่มี config_rawdata ของสถานี:", stationCode);
//       continue;
//     }

//     // const data = await getLatestData(tableName);
//     const avgMin = Number(profile.avg_window_min || 0);

// const fieldKeys = rawCfg.map(x => String(x.field_key || "").trim());

// const data = avgMin > 0
//   ? await getAvgData(tableName, fieldKeys, avgMin)
//   : await getLatestData(tableName);

//     if (!data) {
//       console.log("⚠️ ไม่มีข้อมูลล่าสุดในตาราง:", tableName);
//       continue;
//     }

//     // ✅ debug: ดูว่า field_key ตรงกับ rule ไหม
//     console.log("🔎 keys:", {
//       stationCode,
//       rawCfgKeys: rawCfg.map(x => x.field_key),
//       dataKeysSample: Object.keys(data).slice(0, 20),
//     });

//     // const text = buildMessage(profile.profile_name, stationCode, rawCfg, data, rulesMap);
//     const text = buildMessage(profile.profile_name, stationCode, rawCfg, data, rulesMap, avgMin);

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
//           await sendMail(to, `แจ้งเตือน Water - ${stationCode}`, html);
//           console.log("✅ EMAIL sent:", { stationCode, to });
//         } catch (e) {
//           console.error("❌ EMAIL send error:", { stationCode, to, msg: e?.message });
//         }
//       }
//     }
//   }

//   return true;
// }
// backend/src/profileSender.js
import axios from "axios";
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

// ✅ แปลงระดับเป็นภาษาไทยตามที่ต้องการ
function levelLabelTH(level) {
  const lv = normKey(level);
  if (lv === "danger") return "อันตราย";
  if (lv === "risk") return "เสี่ยง";
  if (lv === "normal") return "ปกติ";
  return "ไม่ทราบสถานะ";
}

// ✅ รองรับ operator/value จาก DB และจาก payload อื่น ๆ
function matchRule(value, rule) {
  const op = String(rule.operator ?? rule.op ?? ">").trim().toLowerCase();
  const v1 = rule.value1 ?? rule.value ?? null;
  const v2 = rule.value2 ?? null;

  if (value === null || value === undefined || Number.isNaN(Number(value))) return false;
  const x = Number(value);

  const a = v1 === null || v1 === undefined ? null : Number(v1);
  const b = v2 === null || v2 === undefined ? null : Number(v2);

  switch (op) {
    case ">":
      return a !== null && x > a;
    case ">=":
      return a !== null && x >= a;
    case "<":
      return a !== null && x < a;
    case "<=":
      return a !== null && x <= a;
    case "==":
    case "=":
      return a !== null && x === a;
    case "!=":
    case "<>":
      return a !== null && x !== a;
    case "between":
    case "range":
      return a !== null && b !== null && x >= Math.min(a, b) && x <= Math.max(a, b);
    default:
      return a !== null && x > a;
  }
}

function pickLevelByRules(value, rules = []) {
  // rules เรียง priority DESC มาแล้ว
  for (const r of rules) {
    if (matchRule(value, r)) return normKey(r.level) || "danger";
  }
  // ถ้าไม่มี rule หรือไม่ match -> normal
  return "normal";
}

function escTable(name) {
  return `\`${String(name).replace(/`/g, "``")}\``;
}

function escCol(name) {
  const s = String(name || "").trim();
  // อนุญาตแค่ A-Z a-z 0-9 _ (รองรับ pH, DO, TDS ได้)
  // NOTE: pH/DO หากมีตัวพิเศษให้แก้ config ให้เป็นชื่อคอลัมน์จริงใน DB
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

async function getProfileStations(profileId) {
  const [rows] = await db.query(
    "SELECT station_code FROM alert_profile_station WHERE profile_id=? ORDER BY station_code",
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

async function getProfileRules(profileId) {
  const [rows] = await db.query(
    `
    SELECT sensor_key, operator, value1, value2, level, priority
    FROM alert_profile_rule
    WHERE profile_id=? AND is_enable=1
    ORDER BY sensor_key, priority DESC, id DESC
    `,
    [profileId]
  );

  // ✅ เก็บ rules ตาม key แบบ lower-case
  const map = {};
  for (const r of rows) {
    const key = normKey(r.sensor_key);
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push({
      ...r,
      level: normKey(r.level), // ✅ normalize level ให้ชัวร์
      operator: String(r.operator || ">").trim(),
    });
  }
  return map;
}

async function getRawConfig(stationCode) {
  const [rows] = await db.query(
    `
    SELECT field_key, field_label, field_unit
    FROM config_rawdata
    WHERE station_code=? AND is_enable=1
    ORDER BY id
    `,
    [stationCode]
  );
  return rows;
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

  // AVG ทุก field_key แล้ว alias กลับเป็นชื่อเดิม
  const avgCols = (fieldKeys || [])
    .map((k) => `AVG(${escCol(k)}) AS ${escCol(k)}`)
    .join(", ");

  const q = `
    SELECT MAX(DateTime) AS DateTime, ${avgCols}
    FROM ${escTable(tableName)}
    WHERE DateTime >= (NOW() - INTERVAL ? MINUTE)
  `;

  const [[row]] = await db.query(q, [mins]);
  return row || null;
}

/* ===== message ===== */
function buildMessage(profileName, stationCode, rawCfg, data, rulesMap, avgMin = 0) {
  // ✅ ทำ map ให้ lookup คอลัมน์แบบไม่สนตัวใหญ่/เล็ก
  const dataKeyMap = {};
  for (const k of Object.keys(data || {})) dataKeyMap[normKey(k)] = k;

  let msg = `แจ้งเตือนคุณภาพน้ำ
กลุ่ม: ${profileName}
สถานี : ${stationCode}
เวลา : ${formatDate(data?.DateTime || new Date())}${
    avgMin > 0 ? ` (เฉลี่ย ${avgMin} นาทีล่าสุด)` : ""
  }
`;

  for (const f of rawCfg) {
    const fieldKey = String(f.field_key || "").trim();
    const fieldKeyNorm = normKey(fieldKey);

    // ✅ ดึงค่าจาก data โดยพยายามหลายแบบ (กัน case mismatch)
    const realCol =
      data?.[fieldKey] !== undefined ? fieldKey : dataKeyMap[fieldKeyNorm];

    const rawVal = realCol ? data?.[realCol] : undefined;
    const num =
      rawVal !== null && rawVal !== undefined && rawVal !== ""
        ? Number(rawVal)
        : null;

    // ✅ หา rules ตาม key แบบ normalize + special-case DO/do2
    let rules =
      rulesMap?.[fieldKeyNorm] ||
      (fieldKeyNorm === "do" ? rulesMap?.["do2"] : null) ||
      [];

    const level = pickLevelByRules(num, rules); // danger/risk/normal
    const icon = iconByLevel(level);
    const th = levelLabelTH(level); // อันตราย/เสี่ยง/ปกติ

    msg += `${icon} ${f.field_label} = ${
      num !== null && !Number.isNaN(num) ? num.toFixed(2) : "-"
    } ${f.field_unit || ""} (${th})\n`;
  }

  return msg;
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
    const tableName = stationCode;

    const okTable = await ensureTableExists(tableName);
    if (!okTable) {
      console.log("⚠️ ไม่พบตารางข้อมูลของสถานี:", tableName);
      continue;
    }

    const rawCfg = await getRawConfig(stationCode);
    if (!rawCfg.length) {
      console.log("⚠️ ไม่มี config_rawdata ของสถานี:", stationCode);
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

    // ✅ debug: ดูว่า field_key ตรงกับ rule ไหม
    console.log("🔎 keys:", {
      stationCode,
      rawCfgKeys: rawCfg.map((x) => x.field_key),
      dataKeysSample: Object.keys(data).slice(0, 20),
    });

    const text = buildMessage(
      profile.profile_name,
      stationCode,
      rawCfg,
      data,
      rulesMap,
      avgMin
    );

    const html = text.replace(/\n/g, "<br>");

    // LINE
    if (lineTargets.length) {
      for (const to of lineTargets) {
        try {
          await axios.post(
            "https://api.line.me/v2/bot/message/push",
            { to, messages: [{ type: "text", text }] },
            { headers: { Authorization: `Bearer ${lineToken}` } }
          );
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
          await sendMail(to, `แจ้งเตือน Water - ${stationCode}`, html);
          console.log("✅ EMAIL sent:", { stationCode, to });
        } catch (e) {
          console.error("❌ EMAIL send error:", { stationCode, to, msg: e?.message });
        }
      }
    }
  }

  return true;
}
