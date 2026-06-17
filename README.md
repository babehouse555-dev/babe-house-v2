# Babe House v2 — Railway + Postgres + Gemini + React

โครงสร้างใหม่:
```
babe-house-v2/
  server/        Express + Postgres (pg) + Gemini (@google/genai)
    index.js     API ทั้งหมด + เสิร์ฟ React build + cron เตือนอีเมล
    db.js        Postgres pool + schema (สร้างตารางอัตโนมัติตอนสตาร์ท)
    ai.js        Gemini provider (blueprint / growth / insight / classify) + fallback
  web/           React + Vite (SPA, react-router)
    src/pages/   Landing, Form, Checkout, Processing, Dashboard, Account, Compare, Admin, Privacy, NotFound
  railway.json   Railway build/start
```

## รันบนเครื่อง (dev)
ต้องมี Postgres (ใช้ฟรีจาก Railway หรือ local ก็ได้) แล้วตั้ง `DATABASE_URL`
```bash
cp .env.example .env      # ใส่ DATABASE_URL (+ GEMINI/STRIPE/RESEND ถ้ามี)
npm install
# เทอร์มินัล 1 — backend
npm run dev:server        # :3000  (สร้างตารางอัตโนมัติ)
# เทอร์มินัล 2 — frontend (proxy /api ไป :3000)
npm run dev:web           # :5173
```
เปิด http://localhost:5173 — ไม่ใส่ GEMINI_API_KEY = โหมด fallback (เทมเพลต), ไม่ใส่ STRIPE = mock, ไม่ใส่ RESEND = OTP โชว์บนจอ

## Deploy บน Railway (production)
1. push โค้ดขึ้น GitHub
2. Railway → **New Project → Deploy from GitHub repo**
3. กด **+ New → Database → PostgreSQL** (Railway จะตั้ง `DATABASE_URL` ให้ service อัตโนมัติ)
4. ที่ service → **Variables** ใส่:
   ```
   NODE_ENV=production
   GEMINI_API_KEY=...        GEMINI_MODEL=gemini-2.5-flash
   PAYMENT_PROVIDER=stripe   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...   STRIPE_PAYMENT_METHODS=card,promptpay
   RESEND_API_KEY=...        APP_FROM_EMAIL=Babe House <noreply@domain>
   APP_BASE_URL=https://<your>.up.railway.app
   ADMIN_KEY=<รหัสยาวเดายาก>
   ```
5. Railway รัน `npm install && npm run build` (build React) แล้ว `npm start` (Express เสิร์ฟ API + React) — ตาม `railway.json`
6. **Stripe Webhook:** เพิ่ม endpoint `https://<your>.up.railway.app/api/stripe/webhook` events: `checkout.session.completed`, `async_payment_succeeded`, `async_payment_failed`, `expired` → คัด `whsec_` ใส่ `STRIPE_WEBHOOK_SECRET`
7. **Resend:** ยืนยันโดเมนเพื่อส่งจาก `@domain` ของคุณ

## เช็คหลัง deploy
- `GET /api/health` → เห็น `ai: gemini-2.5-flash`, `payment_provider: stripe`, `email: resend`
- เปิดเว็บ → ตัวอย่างฟรี (`/dashboard?demo=1`) ทำงาน
- ทดลองซื้อ (Stripe test) → AI เจน blueprint จริง → อีเมลเข้า
- `/admin` เข้าด้วย ADMIN_KEY

## หมายเหตุการ migrate จาก v1
- AI: Claude → **Gemini** (responseSchema / JSON) ผ่าน `server/ai.js` — สลับ provider ที่ไฟล์เดียว
- DB: node:sqlite → **Postgres** (pg, async, $1 placeholders) — ตารางเหมือนเดิม สร้างอัตโนมัติ
- Frontend: HTML หลายไฟล์ → **React SPA** (เส้นทางเดียวกัน /form /checkout /dashboard /account /compare /admin)
- Backup: Railway Postgres มี backup ในตัว (ตั้งใน Railway dashboard) — ไม่ต้องใช้ backup.sh แล้ว
