import express from "express";
import { sendLineTestMessage } from "../services/line.service.js";
import { sendMail } from "../services/mail.service.js";

const router = express.Router();

router.post("/line", async (req, res) => {
  try {
    const to = req.body?.to || req.body?.group_id; // ✅ รองรับ 2 แบบ
    if (!to) {
      return res.status(400).json({
        success: false,
        message: "ต้องระบุ to หรือ group_id"
      });
    }

    await sendLineTestMessage(to);

    res.json({ success: true, message: "✅ ส่งข้อความทดสอบ LINE สำเร็จ" });
  } catch (err) {
    console.error("POST /api/test/line error:", err);
    res.status(500).json({ success: false, message: "ส่ง LINE ไม่สำเร็จ" });
  }
});

router.post("/email", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: "ต้องระบุ email" });
    await sendMail(email, "ทดสอบการเชื่อมต่อระบบแจ้งเตือน", "<b>✅ ทดสอบสำเร็จ</b>");
    res.json({ success: true, message: `✅ ส่งเมลทดสอบแล้ว → ${email}` });
  } catch (err) {
    console.error("POST /api/test/email error:", err);
    res.status(500).json({ success: false, message: "ทดสอบ Email ไม่สำเร็จ" });
  }
});

export default router;
