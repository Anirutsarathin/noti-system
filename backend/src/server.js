import express from "express";
import cors from "cors";
import dotenv from "dotenv";
// app.disable("etag");
dotenv.config();

import alertProfilesRouter from "./routes/alertProfiles.routes.js";
import testRouter from "./routes/test.routes.js";
import schedulerRouter from "./routes/scheduler.routes.js";
import metaRoutes from "./routes/meta.routes.js";
import { startProfileScheduler } from "./scheduler.js";

const app = express();
const PORT = 4500;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ CORS: เปิดให้ทุกคนเรียกได้ (Any origin)
app.use(
  cors({
    origin: "*", // อนุญาตทุก origin
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false, // สำคัญ: ถ้าใช้ "*" ต้องเป็น false
    maxAge: 86400, // cache preflight 1 วัน (ลด OPTIONS ถี่ๆ)
  })
);

// ✅ กัน preflight (OPTIONS) ทุก path
app.options("*", cors());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/alert-profiles", alertProfilesRouter);
app.use("/api/test", testRouter);
app.use("/api/scheduler", schedulerRouter);
app.use("/api/meta", metaRoutes);

// (แนะนำ) error handler กัน backend ล้มแบบเงียบ
app.use((err, req, res, next) => {
  console.error("API Error:", err);
  res.status(500).json({ success: false, message: "Internal Server Error" });
});


app.listen(PORT, '0.0.0.0', async () => {
  await startProfileScheduler();
  console.log(`✅ API running on port ${PORT}`);
});