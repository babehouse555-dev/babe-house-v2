// 🎮 ข้อมูลปลอมสำหรับสนามเด็กเล่นเท่านั้น — รันเมื่อ LOCAL_DB=1 เท่านั้น
// คิมขอ 2 ส.ค.: "อยากเห็นว่ามันต้องอยู่ตรงไหน ใส่ปลอมๆ มาก่อนก็ได้ เดี๋ยวของจริงฉันค่อยไปใส่วัน"
// ⛔ ไฟล์นี้ไม่มีทางรันบนเว็บจริง เพราะเช็ค LOCAL_DB ก่อนเสมอ
import { q, run } from "./db.js";

const DEMO_EMAIL = "demo@babehouse.test";
const day = (n, h = 10) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };

export async function seedPlayground() {
  if (process.env.LOCAL_DB !== "1") return;          // ⛔ กันหลุดขึ้นเว็บจริงเด็ดขาด


  // ⓪ คอร์สตัวอย่าง — ของจริงอยู่บนเว็บจริง (นำเข้าจากเว็บเก่า) สนามเด็กเล่นเลยต้องใส่ปลอมไว้ให้เห็นหน้าจอ
  const DEMO_COURSES = [
    ["1", "All in Your Phone — ตัดต่อในมือถือ", "3745", "ตัดต่อคลิปสวยด้วยมือถือเครื่องเดียว ตั้งแต่จัดเฟรมยันลงเสียง", "ตัดต่อวิดีโอ", 8],
    ["2", "All In Ipad — ครบทุกงานบน iPad", "3745", "ใช้ iPad ทำงานคอนเทนต์ได้ครบ ตัดต่อ วาด ออกแบบ", "ตัดต่อวิดีโอ", 17],
    ["3", "Canva Craft — ออกแบบให้ดูแพง", "2490", "ทำกราฟิกให้ดูมีราคาด้วย Canva ตั้งแต่จัดหน้าจนเลือกสี", "ออกแบบกราฟิก", 11],
    ["4", "PROCREATE DRAWING — วาดรูปบน iPad", "2990", "วาดภาพประกอบด้วย Procreate ตั้งแต่เส้นแรกจนงานเสร็จ", "วาดภาพ", 6],
    ["5", "ตัดต่อ Advance สายเล่าเรื่อง", "5990", "ยกระดับงานตัดต่อให้เล่าเรื่องเป็น คนดูอยู่จนจบ", "ตัดต่อวิดีโอ", 14],
    ["6", "ถ่ายรูปด้วยมือถือให้เหมือนมืออาชีพ", "1990", "จัดองค์ประกอบ แสง มุมกล้อง ด้วยมือถือเครื่องเดียว", "ถ่ายภาพ", 9],
  ];
  let nC = 0;
  for (const [id, name, price, detail, cat, lessons] of DEMO_COURSES) {
    const r = await run(`INSERT INTO academy_courses (legacy_id, name, detail, price, category, instructor, duration, is_active)
      VALUES ($1,$2,$3,$4,$5,'ครูพี่คิม',$6,'0') ON CONFLICT (legacy_id) DO NOTHING`,
      [id, name, detail, price, cat, `${lessons} บท`]);
    nC += r.rowCount || 0;
    for (let i = 1; i <= lessons; i++) {
      await run(`INSERT INTO academy_course_lines (legacy_id, course_id, name, seq, url, time)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (legacy_id) DO NOTHING`,
        [`pgl_${id}_${i}`, id, `บทที่ ${i} — ตัวอย่างบทเรียนในสนามเด็กเล่น`, String(i),
         "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "05:00"]);
    }
  }

  // ① รอบวันเรียนเวิร์กช็อป — ของจริงคิมค่อยใส่เอง อันนี้ปลอมไว้ให้เห็นหน้าจอง
  const ws = await q(`SELECT workshop_id, name FROM workshops ORDER BY seq, name LIMIT 6`);
  const places = ["Babe House Studio ทองหล่อ", "Babe House Studio ทองหล่อ", "ออนไลน์ผ่าน Zoom"];
  let nSess = 0;
  for (const [i, w] of ws.entries()) {
    for (const [j, plus] of [7 + i * 2, 21 + i * 2].entries()) {
      const id = `pgws_${w.workshop_id}_${j}`;
      const r = await run(`INSERT INTO workshop_sessions (session_id, workshop_id, starts_at, ends_at, location, seats, status, note)
        VALUES ($1,$2,$3,$4,$5,$6,'open',$7) ON CONFLICT (session_id) DO NOTHING`,
        [id, w.workshop_id, day(plus, 10), day(plus, 16), places[(i + j) % places.length], j === 0 ? 8 : 12,
         "🎮 รอบตัวอย่างในสนามเด็กเล่น (ไม่ใช่วันจริง)"]);
      nSess += r.rowCount || 0;
    }
  }

  // ② ลูกค้าตัวอย่าง — มีของครบทุกประเภท จะได้เห็นหน้าบัญชีเต็มรูปแบบ
  await run(`INSERT INTO customers (email, instagram_account) VALUES ($1,'@demo_creator')
    ON CONFLICT (email) DO NOTHING`, [DEMO_EMAIL]);

  // คอร์สที่ "ซื้อแล้ว" 3 ตัว
  const courses = await q(`SELECT legacy_id id, name FROM academy_courses WHERE COALESCE(is_active,'0')='0' ORDER BY legacy_id::int LIMIT 3`);
  for (const [i, c] of courses.entries()) {
    await run(`INSERT INTO academy_purchases (purchase_id, email, course_id, course_name, amount_satang, status, created_at, paid_at)
      VALUES ($1,$2,$3,$4,$5,'paid', now() - ($6 || ' days')::interval, now() - ($6 || ' days')::interval)
      ON CONFLICT (purchase_id) DO NOTHING`,
      [`pgap_${c.id}`, DEMO_EMAIL, c.id, c.name, 374500, String(20 - i * 6)]);
  }

  // จองเวิร์กช็อปไว้ 1 รอบ
  const s1 = await q(`SELECT s.session_id, s.workshop_id FROM workshop_sessions s WHERE s.session_id LIKE 'pgws_%' ORDER BY s.starts_at LIMIT 1`);
  if (s1[0]) {
    await run(`INSERT INTO workshop_bookings (booking_id, session_id, workshop_id, email, name, phone, qty, amount_satang, status)
      VALUES ($1,$2,$3,$4,'คุณเดโม่','0800000000',1,299000,'paid') ON CONFLICT (booking_id) DO NOTHING`,
      [`pgwb_1`, s1[0].session_id, s1[0].workshop_id, DEMO_EMAIL]);
  }

  if (nSess || nC) console.log(`🎮 [สนามเด็กเล่น] คอร์สตัวอย่าง ${nC} · รอบวันเรียนปลอม ${nSess} · ลูกค้าตัวอย่าง ${DEMO_EMAIL}`);
}
