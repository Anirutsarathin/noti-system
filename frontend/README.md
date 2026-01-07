# WaterMonitor Alert UI (React)

## Run
```bash
cd frontend
npm install
npm run dev
```

## ENV
สร้างไฟล์ `frontend/.env`:
```
VITE_API_BASE_URL=http://localhost:4500
```

## API ที่ใช้
- GET /api/alert-profiles
- GET /api/alert-profiles/:id
- POST /api/alert-profiles
- PUT /api/alert-profiles/:id
- PATCH /api/alert-profiles/:id/active
- DELETE /api/alert-profiles/:id

ทดสอบ:
- POST /api/test/line { to }
- POST /api/test/email { email }
