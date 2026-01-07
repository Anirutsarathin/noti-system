import express from "express";
import {
  getSchedulerStatus,
  setLogConfig,
  getLogConfig,
  fireProfileNow,
} from "../scheduler.js";

const router = express.Router();

router.get("/status", async (req, res) => {
  try {
    const data = await getSchedulerStatus();
    res.json({ success: true, data });
  } catch (e) {
    console.error("GET /api/scheduler/status error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get("/log", (req, res) => {
  res.json({ success: true, data: getLogConfig() });
});

router.post("/log", (req, res) => {
  const { enabled, everySec } = req.body || {};
  const cfg = setLogConfig({ enabled, everySec });
  res.json({ success: true, data: cfg });
});

// debug: ยิงส่งทันที (ไม่ต้องรอ countdown)
router.post("/fire/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await fireProfileNow(id);
    res.json({ success: true });
  } catch (e) {
    console.error("POST /api/scheduler/fire error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
