// 🗂️ ใส่โปรเจคทั้งหมดที่คุยกันไว้ลงห้องทำงาน — รันซ้ำได้ ไม่ทับของที่คิมแก้เอง
// (แตะเฉพาะโปรเจค/รายการที่ยังไม่มีในระบบ)
import { q, run } from "./db.js";

const P = [
  {
    id: "prj_unify", name: "รวมเว็บ Academy เข้า babehouse.net", emoji: "🏠", color: "#C7DEF0", priority: 2,
    goal: "ให้ลูกค้า login ครั้งเดียวเห็นของทุกอย่างที่ซื้อ — เลิกมี 2 เว็บที่แก้เองไม่ได้",
    items: [
      ["next", "ขอ dump ข้อมูลลูกค้าเก่าจาก ZeroDesign — เร่งด่วน กลัวเข้าไม่ถึงข้อมูลตัวเอง", "kim", 1],
      ["next", "เช็กคลิปบทเรียน 226 คลิปว่าตั้ง Unlisted ครบไหม", "kim", 2],
      ["next", "แก้โจทย์การบ้าน 21 ข้อให้เป็นคำพูดครูพี่คิมเอง", "kim", 3],
      ["next", "ลองซื้อคอร์ส + ส่งการบ้านจริงด้วยโค้ด TESTFREE ให้ครบวงจร", "kim", 3],
      ["next", "เปิดตัวเฟส 4 — ประกาศลูกค้าเก่า 1,785 คนว่า login ด้วยอีเมลเดิมได้", "kim", 4],
      ["done", "ระบบตรวจการบ้านด้วย AI + ใบประกาศอัตโนมัติ", "claude", 5],
      ["done", "ระบบกันอัดจอ/แชร์บัญชี (ลายน้ำ + จับ IP)", "claude", 5],
      ["done", "ย้ายรูปคอร์ส 25 รูปมาโฮสต์เอง เลิกพึ่ง ZeroDesign", "claude", 5],
      ["idea", "หน้าบัญชีแบบโฟลเดอร์พาสเทล — ดูตัวอย่างที่ /preview/account แล้วบอกว่าเอาไหม", "kim", 2],
    ],
  },
  {
    id: "prj_club", name: "Babe Club 199/เดือน", emoji: "🩵", color: "#DDCCEE", priority: 3,
    goal: "ทำให้ลูกค้าอยู่กับเราต่อเนื่อง ด้วยของสดรายเดือนที่หมดอายุ ไม่ใช่สัญญาผูกมัด",
    items: [
      ["blocked", "ราคาหลายช่อง — เสนอ 199 ช่องแรก + 149 ช่องถัดไป รอคิมเคาะ", "kim", 1],
      ["blocked", "คลาสสดสมาชิกเดือนละครั้ง เอาไหม (ต้นทุน = เวลาคิม)", "kim", 1],
      ["blocked", "ส่งการบ้านให้ AI ตรวจฟรีกี่ชิ้น/เดือน (เสนอ 4 ชิ้น = สัปดาห์ละชิ้น)", "kim", 1],
      ["next", "รื้อหน้า /club ให้เสียบเข้า Dashboard เดิม (แท็บ + ตาราง 30 วัน)", "claude", 2],
      ["next", "ทำให้เล่ม Club โผล่เป็น 'เดือนใหม่' ในหน้าบัญชีของฉัน", "claude", 2],
      ["next", "ผูก Stripe Subscription (ตัดเงินอัตโนมัติ ยกเลิกได้ทุกเมื่อ)", "claude", 3],
      ["done", "หน้า /plans เทียบ Blueprint 490 vs Club 199", "claude", 5],
      ["done", "เชื่อม Club กับคอร์ส — ทุกสคริปต์มีชิป 'เรียนวิธีทำ'", "claude", 5],
      ["idea", "มิเตอร์ความสด: 'แผนอายุ 30 วัน เทรนด์เปลี่ยน 3 เรื่อง' → เหตุผลให้ต่อเดือน", null, 4],
      ["idea", "ปุ่มเติมเครดิตในแท็บคอนเทนต์ (อยากได้เกิน 15 สคริปต์ ไม่ต้องจ่าย 490 ใหม่)", null, 4],
    ],
  },
  {
    id: "prj_corp", name: "Tier องค์กร (หลักแสน)", emoji: "🏢", color: "#C6DBCB", priority: 4,
    goal: "ชิ้นส่วนที่ขาดของแผน 100 ล้าน — ลูกค้า 1 รายเท่ากับลูกค้า 490 สองร้อยคน",
    items: [
      ["blocked", "เคาะฟีเจอร์ + ราคาแต่ละขั้น (เสนอ 49k / 100k / 250k)", "kim", 1],
      ["next", "ทำหน้าขาย tier องค์กร", "claude", 2],
      ["next", "คิดราคารวม VAT ตั้งแต่ต้น (คิมสั่ง: ทุกราคาใหม่ต้องคำนวณ VAT)", "claude", 2],
      ["idea", "ขายเป็นแพ็กเทรนทีมการตลาด + วางแผนคอนเทนต์ทั้งปีให้แบรนด์", null, 4],
      ["idea", "ห้ามขึ้นเว็บก่อนคิมสรุป — เคยตกลงไว้", "kim", 5],
    ],
  },
  {
    id: "prj_workshop", name: "ระบบจอง Workshop", emoji: "🎟️", color: "#F3D6B6", priority: 3,
    goal: "ให้ลูกค้าจองและจ่ายเองได้ ไม่ต้องทักแอดมิน — คิมแค่ใส่วันที่",
    items: [
      ["next", "ใส่วันที่รอบเรียนจริงในหลังบ้าน", "kim", 1],
      ["next", "ตัดสินใจว่าจะเปิดจองพร้อมเปิดตัว Academy หรือแยกรอบ", "kim", 2],
      ["done", "จอง + จ่ายเงิน + นับที่นั่งเรียลไทม์ + โค้ดส่วนลด", "claude", 5],
      ["done", "ไฟล์สรุปหลังเรียนโหลดได้ในบัญชีลูกค้า", "claude", 5],
      ["idea", "ซิงก์ Google Calendar อัตโนมัติ (ตอนนี้ใส่วันที่มือ)", "claude", 4],
    ],
  },
  {
    id: "prj_ads", name: "ยิงแอด + การตลาด Blueprint", emoji: "📣", color: "#F0C9D4", priority: 1,
    goal: "หาลูกค้าใหม่ให้ Blueprint 490 — ตอนนี้พึ่งช่องตัวเองอย่างเดียว",
    items: [
      ["next", "ดูผลแอดวันแรกจาก Pixel แล้วตัดสินใจว่าจะไปต่อหรือปรับ", "claude", 1],
      ["next", "ตัดสินใจงบ/กลุ่มเป้าหมายรอบถัดไป", "kim", 2],
      ["done", "ติดตั้ง Meta Pixel + 4 อีเวนต์ (ViewContent / InitiateCheckout / Purchase)", "claude", 5],
      ["done", "ระบบดูว่าลูกค้ามาจากช่องทางไหน (attribution)", "claude", 5],
      ["idea", "ทำคลิปสอนดีไซน์แนว collage ฟ้า-ชมพู ลง IG Academy (EP.1 จิตวิทยาสีทำรูปเสร็จแล้ว)", "kim", 3],
      ["idea", "รีวิวจากลูกค้าจริง → เอามาทำครีเอทีฟแอด", null, 4],
    ],
  },
  {
    id: "prj_quality", name: "คุณภาพเล่ม + ระบบเฝ้าระวัง", emoji: "🛡️", color: "#D6D2EC", priority: 2,
    goal: "คิมต้องไม่ต้องมานั่งสุ่มตรวจเอง — ระบบต้องบอกก่อนลูกค้าบ่น",
    items: [
      ["done", "รายงานสุขภาพระบบรายวันเข้าเมล 9 โมงเช้า", "claude", 5],
      ["done", "อุดรูรั่วตัวตรวจที่มองไม่เห็นเล่ม 0 สคริปต์", "claude", 5],
      ["done", "แก้บั๊กอัปโหลดรูปได้ใบเดียว", "claude", 5],
      ["done", "กันข้อความตัวอย่างของเราหลุดเข้าเล่มลูกค้า 3 ชั้น", "claude", 5],
      ["done", "แก้ธีมเล่มที่เขียนเป็น 'บทวิเคราะห์ช่อง:' 23 เล่ม", "claude", 5],
      ["next", "เปลี่ยนตัวอย่างในฟอร์มเป็นแบรนด์สมมติไหม (เช่น Bloom Cafe)", "kim", 2],
      ["idea", "ปุ่มแปลสคริปต์รายอันสำหรับคนมีคนดูต่างชาติ (จอดไว้หลังเปิดขาย)", null, 5],
    ],
  },
  {
    id: "prj_bloom", name: "Babe House Bloom", emoji: "🌿", color: "#CFE3D6", priority: 6,
    goal: "เสา Recharge — สตูดิโอโยคะ + เสียงบำบัดสำหรับครีเอทีฟ",
    items: [
      ["idea", "Yoga for Creative Anatomy — คลาสสำหรับคนทำคอนเทนต์ที่ปวดคอบ่าไหล่", "kim", 3],
      ["idea", "แอปเสียง activate/deactivate (โหมดดิจิทัลของ Bloom) — moat คือตัวครูพี่คิม", null, 5],
      ["next", "ตัดสินใจว่าจะเริ่มปีนี้หรือปีหน้า", "kim", 4],
    ],
  },
  {
    id: "prj_100m", name: "แผน 100 ล้าน (ภาพใหญ่)", emoji: "🎯", color: "#EED9C4", priority: 5,
    goal: "ฐานจริงตอนนี้ ~11-13 ล้าน/ปี → โต 8 เท่าใน 4-5 ปี ที่ +53-70%/ปี",
    items: [
      ["next", "ทบทวนทุกไตรมาสว่ายังอยู่บนเส้นไหม", "kim", 3],
      ["idea", "7 ขาของธุรกิจ — ตอนนี้ Academy + Production ทำเงินจริง อีก 5 ขายังไม่เต็มที่", null, 4],
      ["done", "คิดเลขฐานรายได้จริง (เดิมนับ 6.2M ตกไป production + สอนนอกสถานที่)", "claude", 5],
      ["idea", "ดีลเทมเพลตเพื่อน ASAIDEMY — ตัดสินใจไม่ร่วมแล้ว ปิดจบ", null, 5],
    ],
  },
];

export async function seedProjects() {
  const have = new Set((await q(`SELECT id FROM projects`)).map(r => r.id));
  const haveItems = new Set((await q(`SELECT project_id, text FROM project_items`)).map(r => `${r.project_id}|${r.text}`));
  let np = 0, ni = 0;
  for (const [i, p] of P.entries()) {
    if (!have.has(p.id)) {
      await run(`INSERT INTO projects (id,name,emoji,color,goal,priority,sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, p.name, p.emoji, p.color, p.goal, p.priority, (i + 1) * 10]);
      np++;
    }
    for (const [j, [kind, text, owner, pr]] of (p.items || []).entries()) {
      if (haveItems.has(`${p.id}|${text}`)) continue;     // คิมอาจลบทิ้งไปแล้ว → ใส่กลับเฉพาะที่ยังไม่เคยมี
      await run(`INSERT INTO project_items (id,project_id,kind,text,owner,priority,sort,done_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [`pit_${p.id}_${j}`, p.id, kind, text, owner, pr || 5, (j + 1) * 10, kind === "done" ? new Date().toISOString() : null]);
      ni++;
    }
  }
  if (np || ni) console.log(`[projects] เพิ่มโปรเจค ${np} · รายการ ${ni}`);
}
