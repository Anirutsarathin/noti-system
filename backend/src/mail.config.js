import { db } from "./db.js";

export async function getMailHost() {
  const [rows] = await db.query(`
    SELECT tenant_id, client_id, client_secret, from_user
    FROM mail_host
    WHERE is_active = 1
    ORDER BY id DESC
    LIMIT 1
  `);

  if (!rows.length) {
    throw new Error("ไม่พบ mail_host ที่ is_active=1");
  }

  return rows[0];
}
