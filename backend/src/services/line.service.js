import axios from "axios";
import { db } from "../db.js";

async function getLineToken() {
  const [r] = await db.query(
    "SELECT channel_token FROM line_config WHERE is_active = 1 LIMIT 1"
  );
  return r[0]?.channel_token;
}

// ✅ ใช้ยิงทดสอบ (ตามที่ UI เรียก /api/test/line)
export async function sendLineTestMessage(toId) {
  const token = await getLineToken();

  if (!token || !toId) {
    throw new Error("NO TOKEN OR TO ID");
  }

  const text = `✅ ทดสอบการเชื่อมต่อสำเร็จ`;

  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    {
      to: toId,
      messages: [{ type: "text", text }]
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return true;
}
