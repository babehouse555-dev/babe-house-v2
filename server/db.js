// Postgres data layer — async query helpers + schema init
// 🎮 โหมดสนามเด็กเล่น (LOCAL_DB=1): ใช้ Postgres ที่รันอยู่ในตัว Node เอง เก็บไฟล์ที่ .localdb/
//    → ไม่ต่อเน็ต ไม่แตะฐานข้อมูลลูกค้า พังยังไงก็ไม่กระทบใคร ลบโฟลเดอร์แล้วเริ่มใหม่ได้
//    เหตุผล (คิม 2 ส.ค.): "ลูกค้าใช้เว็บตอนกลางคืนมากๆ ตีสามยังมีคนซื้อ" — ไม่มีเวลาไหนปลอดภัยพอให้ลองของบนเว็บจริง
import pg from "pg";

const LOCAL = process.env.LOCAL_DB === "1";
let localDb = null;
async function getLocal() {
  if (!localDb) {
    const { PGlite } = await import("@electric-sql/pglite");
    localDb = await PGlite.create(process.env.LOCAL_DB_DIR || "./.localdb");
    console.log("🎮 โหมดสนามเด็กเล่น — ใช้ฐานข้อมูลในเครื่อง (.localdb) ไม่แตะของจริง");
  }
  return localDb;
}

const { Pool } = pg;
export const pool = LOCAL ? null : new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway Postgres ต้องการ SSL ในบางกรณี — ปิด verify เพื่อความง่าย
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
  // ทนโหลดช่วงเปิดขาย: เพิ่ม connection + ตั้ง timeout กันคิวค้าง/ควีรีหนีหาย
  max: Number(process.env.PG_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000
});
if (pool) pool.on("error", (err) => console.error("[pg pool error]", err.message));

// จุดเดียวที่แตะฐานข้อมูล — สลับระหว่างของจริงกับสนามเด็กเล่นตรงนี้ที่เดียว
async function query(sql, params = []) {
  if (LOCAL) {
    const db = await getLocal();
    // initDb ส่ง SQL หลายคำสั่งมาก้อนเดียว — PGlite ต้องใช้ exec() ไม่ใช่ query()
    if (!params.length) { const res = await db.exec(sql); return res[res.length - 1] || { rows: [], affectedRows: 0 }; }
    return db.query(sql, params);
  }
  return pool.query(sql, params);
}

// helpers (ใช้ placeholder แบบ $1,$2 ของ Postgres)
export async function q(sql, params = []) { const r = await query(sql, params); return r.rows; }
export async function one(sql, params = []) { const r = await query(sql, params); return r.rows[0] || null; }
export async function run(sql, params = []) { const r = await query(sql, params); return { rowCount: r.rowCount ?? r.affectedRows ?? 0 }; }

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      instagram_account TEXT,
      business_type TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS customers (
      email TEXT PRIMARY KEY,
      instagram_account TEXT,
      referral_code TEXT,
      referral_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS blueprint_orders (
      order_id TEXT PRIMARY KEY,
      user_id TEXT,
      instagram_account TEXT,
      email TEXT,
      tier TEXT,
      billing_cycle TEXT,
      payment_status TEXT DEFAULT 'pending',
      order_payload_json TEXT,
      provider TEXT DEFAULT 'mock',
      provider_session_id TEXT,
      checkout_url TEXT,
      paid_at TIMESTAMPTZ,
      blueprint_id TEXT,
      generation_status TEXT DEFAULT 'pending',
      generation_error TEXT,
      discount_code TEXT,
      discount_percent INTEGER,
      final_amount_satang INTEGER,
      referred_by TEXT,
      referral_rewarded INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS blueprint_requests (
      request_id TEXT PRIMARY KEY,
      user_id TEXT,
      instagram_account TEXT,
      email TEXT,
      billing_cycle TEXT,
      business_type TEXT,
      starting_point TEXT,
      monthly_goal TEXT,
      competitor_1 TEXT,
      competitor_2 TEXT,
      insight_screenshot_base64 TEXT,
      insight_images_json TEXT,
      raw_payload_json TEXT,
      industry TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS blueprints (
      blueprint_id TEXT PRIMARY KEY,
      request_id TEXT,
      user_id TEXT,
      billing_cycle TEXT,
      blueprint_json TEXT NOT NULL,
      model TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS marathon_progress (
      progress_id TEXT PRIMARY KEY,
      user_id TEXT,
      instagram_account TEXT,
      billing_cycle TEXT,
      uploaded_days_json TEXT DEFAULT '[]',
      uploaded_count INTEGER DEFAULT 0,
      star_count INTEGER DEFAULT 0,
      tier TEXT DEFAULT 'Silver',
      last_action_day INTEGER,
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, billing_cycle)
    );
    -- ═══════ 💳 แพ็กราย 6/12 เดือน (คิมเคาะ 3 ส.ค. 2569) ═══════
    -- ข้อมูลจริงตอนตัดสินใจ: ลูกค้าจ่ายเงิน 232 คน — 231 คนซื้อเดือนเดียวแล้วหาย (เฉลี่ย 1.01 เดือน)
    -- จ่ายก้อนเดียวล่วงหน้า = ได้เงินจริงต่อลูกค้า 1 คน จาก 429 บาท → 8,557 บาท (รายปี)
    -- 1 แถว = 1 ช่อง ของลูกค้า 1 คน (คนหนึ่งมีหลายช่องได้ แต่ละช่องซื้อแพ็กแยกกัน)
    CREATE TABLE IF NOT EXISTS subscriptions (
      subscription_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      user_id TEXT,
      instagram_account TEXT,
      plan TEXT NOT NULL,              -- monthly | 6m | 12m
      months_total INTEGER NOT NULL,
      months_used INTEGER DEFAULT 0,   -- ใช้ไปแล้วกี่เดือน (นับตอนปลดล็อกเล่ม)
      amount_satang INTEGER,           -- ยอดที่จ่ายจริงทั้งก้อน
      order_id TEXT,                   -- ออเดอร์ที่ซื้อแพ็กนี้
      status TEXT DEFAULT 'active',    -- active | finished | refunded | canceled
      started_cycle TEXT,
      expires_at TIMESTAMPTZ,          -- กันดองสิทธิ์ข้ามปี
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_subs_email ON subscriptions(lower(email), status);
    -- เล่มไหนถูกปลดล็อกด้วยแพ็กไหน — กันปลดซ้ำเดือนเดียวกัน และไว้ตรวจย้อนหลัง
    CREATE TABLE IF NOT EXISTS subscription_uses (
      use_id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      order_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_uses_uniq ON subscription_uses(subscription_id, billing_cycle);


    -- ═══════ 📅 ตารางว่าง + มอบหมายงานอัตโนมัติ (คิมสั่ง 3 ส.ค. 2569) ═══════
    -- "ให้ลูกตาลเห็นตารางงานของทุกคนว่าโปรเซสไปถึงไหนแล้ว แต่ให้ระบบเป็นคนแอสไซน์งานให้แทน
    --  ก็จะลดขั้นตอนการทำงานของลูกตาลไป · แต่เราต้องมีระบบที่แท็กการทำงานของทุกคน
    --  จะได้รู้ว่าใครว่างอยู่ · ฟรีแลนซ์ที่เราไม่รู้ว่าเค้าว่างไหม ก็ให้เค้าลงเองในปฏิทินว่าว่างวันไหน"
    CREATE TABLE IF NOT EXISTS team_availability (
      avail_id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      day DATE NOT NULL,
      slots INTEGER DEFAULT 2,       -- วันนั้นรับได้กี่คลิป (0 = ไม่ว่าง)
      note TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_avail_uniq ON team_availability(member_id, day);
    -- 🌴 วันลา: เดิมกด "0 คลิป" แล้วระบบลบแถวทิ้ง = กลายเป็น "ไม่ได้ระบุ"
    -- พอเปลี่ยนเป็น "พนักงานประจำว่างอัตโนมัติ" การลบแถวจะแปลว่า "ว่าง" ซึ่งตรงข้ามกับที่ตั้งใจ
    -- → ต้องเก็บแถว slots=0 ไว้เป็นหลักฐานว่า "วันนี้ลา"
    ALTER TABLE team_availability ADD COLUMN IF NOT EXISTS is_leave BOOLEAN DEFAULT false;
    -- 📦 งานนอกเว็บ (คิมถาม 3 ส.ค.: "ทีม production เค้าก็จะมีงานที่อยู่ใน production ด้วย
    --    ไม่งั้นเราจะไม่รู้ว่าใครทำงานอยู่หรือว่าว่างจริง")
    -- ⚠️ ตั้งใจให้ "คนทำงานเพิ่มเอง" ไม่ใช่ให้ลูกตาลนั่งกรอกแทนทุกคน — กรอก 3 ช่องจบ
    CREATE TABLE IF NOT EXISTS external_jobs (
      ext_id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      title TEXT NOT NULL,
      clips INTEGER DEFAULT 1,        -- กินที่ว่างกี่คลิป (ใช้คำนวณโหลดเหมือนงานในเว็บ)
      client TEXT,
      source TEXT DEFAULT 'manual',   -- manual | trello | line
      due_at DATE,
      status TEXT DEFAULT 'active',   -- active | done
      note TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      done_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_ext_member ON external_jobs(member_id, status);
    -- 🎨 งานกราฟฟิก (คิมสั่ง 7 ส.ค.) — แฟรี่เป็นกราฟฟิกแต่ยังไม่มีระบบงานในเว็บเลย
    -- 2 ทางที่งานเข้าหาแฟรี่:
    --   1) ลูกตาลรับบรีฟลูกค้าแล้วเป็นงานกราฟฟิก → เข้าแฟรี่ตรงๆ (from_order_id ว่าง)
    --   2) คนตัดต่อในเฮ้าส์ (โบ/พี่ก้อง/กัน) กดขอให้แฟรี่ช่วยทำอาร์ตเวิร์คในคลิป → ผูกกับงานตัดต่อนั้น
    -- ⚠️ ฟรีแลนซ์ไม่มีปุ่มนี้ — คิมสั่งว่าฟรีแลนซ์ต้องทำอาร์ตเวิร์คเองได้ในคนเดียว
    CREATE TABLE IF NOT EXISTS graphic_jobs (
      gj_id TEXT PRIMARY KEY,
      from_order_id TEXT,             -- งานตัดต่อต้นทาง (ถ้าเป็นงานที่คนตัดขอความช่วยเหลือ)
      brief_id TEXT,                  -- บรีฟจากลูกตาล (ถ้ามาจากทางนั้น)
      title TEXT NOT NULL,
      brief TEXT,
      client TEXT,
      ref_links TEXT,
      assigned_to TEXT,               -- ปกติคือแฟรี่
      requested_by TEXT,              -- ใครเป็นคนขอ
      requested_by_name TEXT,
      status TEXT DEFAULT 'open',     -- open | doing | sent | done | canceled
      due_at TIMESTAMPTZ,
      work_url TEXT,                  -- ลิงก์ไฟล์งานที่แฟรี่ส่ง
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      done_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_gj_assignee ON graphic_jobs(assigned_to, status);
    CREATE INDEX IF NOT EXISTS idx_gj_order ON graphic_jobs(from_order_id);
    -- 📎 ไฟล์แนบในบรีฟ (คิมสั่ง 7 ส.ค. "ขอใส่ได้ทุกประเภทไฟล์ รูป PDF หรือไฟล์อื่นๆ")
    -- เก็บลงฐานข้อมูลเลย เพราะ Railway ลบไฟล์บนดิสก์ทุกครั้งที่ deploy — เก็บบนดิสก์ = ไฟล์หายแน่นอน
    -- จำกัด 10MB/ไฟล์ ไฟล์ใหญ่กว่านั้นให้แปะลิงก์ Drive แทน (ลิงก์กดได้แล้ว)
    CREATE TABLE IF NOT EXISTS brief_files (
      file_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime TEXT,
      size_bytes INTEGER,
      data_b64 TEXT NOT NULL,
      uploaded_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_brief_files_order ON brief_files(order_id, created_at);
    -- 🌴 ระบบวันลา (คิมสั่ง 7 ส.ค. "ยึดตามกฎหมาย กันความมั่วในการกดวันหยุด")
    CREATE TABLE IF NOT EXISTS leave_requests (
      leave_id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      kind TEXT NOT NULL,             -- sick=ลาป่วย · personal=ลากิจ · vacation=พักร้อน
      day DATE NOT NULL,              -- ลาหลายวัน = หลายแถว จะได้นับโควตาและเช็คชนวันหยุดได้ทีละวัน
      reason TEXT,
      proof_url TEXT,                 -- หลักฐาน (ใบรับรองแพทย์) — คิมสั่งว่าลาป่วยต้องมีหลักฐาน
      status TEXT DEFAULT 'pending',  -- pending | approved | rejected
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      decide_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_uniq ON leave_requests(member_id, day);
    CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status, day);
    -- 📅 วันหยุดบริษัท 13 วัน/ปี — ล็อกไว้ ทุกคนหยุดพร้อมกัน กดลาซ้ำไม่ได้
    -- คิมเคาะ: ปีใหม่ 5 · สงกรานต์ 4 · แรงงาน 1 · ที่เหลือ 3 เลือกจากปฏิทินวันหยุดไทย
    CREATE TABLE IF NOT EXISTS company_holidays (
      day DATE PRIMARY KEY,
      name TEXT NOT NULL,
      fixed BOOLEAN DEFAULT false     -- true = ชุดหลัก (ปีใหม่/สงกรานต์/แรงงาน) ลบไม่ได้
    );
    -- 💰 ยอดเงินของงานโปรดักชั่นนอกเว็บ (คิมสั่ง 7 ส.ค. "หน้ายอดขายต้องมียอด production ด้วย")
    -- งานโปรดักชั่นส่วนใหญ่รับตรง ไม่ได้ผ่านเว็บ ถ้าไม่เก็บยอดไว้ หน้ายอดขายจะเห็นแค่ครึ่งเดียวของธุรกิจ
    -- ใส่ 0 หรือเว้นว่างได้ = งานที่ยังไม่รู้ยอด/ไม่คิดเงิน จะไม่ถูกนับ
    ALTER TABLE external_jobs ADD COLUMN IF NOT EXISTS amount_satang INTEGER DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_avail_day ON team_availability(day);

    -- 📮 ระบบตามงานลูกค้าอัตโนมัติ — กันงานตกหล่นเพราะคนลืมตาม
    CREATE TABLE IF NOT EXISTS client_followups (
      followup_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      kind TEXT NOT NULL,              -- footage | feedback | approval
      round INTEGER DEFAULT 1,         -- ตามรอบที่เท่าไหร่
      sent_at TIMESTAMPTZ DEFAULT now(),
      channel TEXT DEFAULT 'email',
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_followup_order ON client_followups(order_id, kind, round);

    -- 🧠 รายงาน AI ประเมินทีมรายสัปดาห์ — คิมอ่านคนเดียว
    CREATE TABLE IF NOT EXISTS team_reviews (
      review_id TEXT PRIMARY KEY,
      week TEXT NOT NULL,              -- 2026-W32
      review_json TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_reviews_week ON team_reviews(week);

    -- ═══════ 🧾 ใบกำกับภาษี (คิมสั่ง 3 ส.ค. 2569) ═══════
    -- "ทุกการจ่ายเงินเราต้องออกใบกำกับภาษีอยู่แล้ว เอาไปส่งบัญชีรายเดือน"
    -- ลูกค้าทั่วไป: ออกอัตโนมัติด้วยชื่อที่มีอยู่ ไม่ต้องกรอกอะไรเพิ่ม
    -- ลูกค้าบริษัท: ติ๊กที่หน้าจ่ายเงินแล้วกรอกชื่อบริษัท/ที่อยู่/เลขผู้เสียภาษี
    -- ⚠️ ราคาทุกอย่างที่ขายผ่านเว็บ "รวม VAT แล้ว" → ต้องถอด VAT ออกมาแสดงในใบกำกับ
    CREATE TABLE IF NOT EXISTS tax_invoices (
      invoice_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_kind TEXT,                 -- blueprint | credits | video | edit | workshop | academy
      email TEXT,
      customer_name TEXT NOT NULL,     -- ชื่อที่จะขึ้นบนใบ (บุคคล = ชื่อลูกค้า · บริษัท = ชื่อบริษัท)
      is_company BOOLEAN DEFAULT false,
      tax_id TEXT,                     -- เลขประจำตัวผู้เสียภาษี 13 หลัก (เฉพาะบริษัท)
      branch TEXT,                     -- สำนักงานใหญ่ / สาขาที่ ...
      address TEXT,
      description TEXT,                -- รายการสินค้าที่ขึ้นบนใบ
      amount_satang INTEGER NOT NULL,  -- ยอดที่ลูกค้าจ่ายจริง (รวม VAT แล้ว)
      net_satang INTEGER NOT NULL,     -- ก่อน VAT
      vat_satang INTEGER NOT NULL,     -- VAT 7%
      status TEXT DEFAULT 'pending',   -- pending | issued | failed | manual
      provider TEXT,                   -- flowaccount | manual
      provider_doc_id TEXT,            -- id เอกสารฝั่ง FlowAccount
      doc_number TEXT,                 -- เลขที่เอกสาร เช่น INV2026080001
      receipt_number TEXT,             -- เลขที่ใบเสร็จ (RE...)
      error TEXT,
      issued_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_inv_order ON tax_invoices(order_id);
    -- ⚠️ ธงกันออกใบซ้ำ: ออเดอร์เก่าที่คิมออกใบมือไว้ใน FlowAccount แล้ว ห้ามระบบส่งขึ้นไปอีก
    -- ออกใบกำกับซ้ำ = เลขที่เอกสารซ้ำ = ยื่นภาษีผิด เรื่องใหญ่กว่าการไม่มีใบ
    ALTER TABLE tax_invoices ADD COLUMN IF NOT EXISTS issued_manually BOOLEAN DEFAULT false;
    ALTER TABLE tax_invoices ADD COLUMN IF NOT EXISTS backfilled BOOLEAN DEFAULT false;
    -- ⚠️ วันที่บนใบกำกับต้องเป็น "วันที่รับเงินจริง" ไม่ใช่วันที่กดออกใบ
    -- ไม่งั้น VAT ของเดือน มิ.ย./ก.ค. จะไปตกเดือนที่กดปุ่ม → ยอดยื่นภาษีผิดเดือน
    ALTER TABLE tax_invoices ADD COLUMN IF NOT EXISTS doc_date DATE;
    CREATE INDEX IF NOT EXISTS idx_tax_inv_status ON tax_invoices(status, created_at DESC);

    -- ═══════ 📈 ผลจริงรายคลิป — หัวใจของ "ยิ่งใช้ยิ่งแม่น" (คิมสั่ง 3 ส.ค. 2569) ═══════
    -- "ฉันไม่ได้อยากให้ลูกค้าเริ่มใหม่ทุกเดือน เค้าต้องได้ต่อยอดจากที่ถูกคิดมาแล้วแล้วเอาไปทำจริง
    --  จะได้รู้ว่าอันไหนเวิร์กหรือไม่เวิร์ก"
    -- เดิม: มาราธอนรู้แค่ว่า "ลงวันไหน" · ตอนนี้: รู้ด้วยว่า "วันนั้นได้เท่าไหร่"
    -- → เดือนถัดไป AI เขียนแผนโดยรู้ว่าคนดูของช่องนี้ชอบอะไรจริงๆ ไม่ใช่เดาใหม่ทุกเดือน
    CREATE TABLE IF NOT EXISTS clip_results (
      result_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      instagram_account TEXT,
      billing_cycle TEXT NOT NULL,
      day INTEGER NOT NULL,            -- วันที่ของแผน (1-30) ผูกกับ calendar ของเล่มนั้น
      views INTEGER,
      likes INTEGER,
      comments INTEGER,
      saves INTEGER,
      note TEXT,                       -- ลูกค้าจดเองได้ เช่น "อันนี้ลงตอนดึก"
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clip_results_uniq ON clip_results(user_id, billing_cycle, day);
    -- สรุปสิ้นเดือนจากแคป Insight รูปเดียว — คิมสั่ง "ไม่ต้องให้เค้ามากรอกรายคลิป มันเยอะมาก"
    -- AI อ่านแคปแล้วจับคู่กับปฏิทินเอง แถวไหนจับคู่ได้จะไปลงใน clip_results ให้อัตโนมัติ
    CREATE TABLE IF NOT EXISTS month_reviews (
      review_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT,
      instagram_account TEXT,
      billing_cycle TEXT NOT NULL,
      clips_done INTEGER,              -- ลูกค้าบอกเองว่าลงไปกี่คลิปจาก 30
      review_json TEXT,                -- ผลที่ AI อ่านได้ทั้งก้อน
      matched_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_month_reviews_uniq ON month_reviews(user_id, billing_cycle);
    CREATE INDEX IF NOT EXISTS idx_clip_results_user ON clip_results(user_id, billing_cycle);

    CREATE TABLE IF NOT EXISTS marathon_events (
      event_id TEXT PRIMARY KEY,
      user_id TEXT,
      billing_cycle TEXT,
      day INTEGER,
      action TEXT,
      uploaded_days_snapshot_json TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS payment_events (
      provider_event_id TEXT PRIMARY KEY,
      type TEXT,
      order_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS auth_otps (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS growth_analyses (
      email TEXT PRIMARY KEY,
      signature TEXT,
      analysis_json TEXT,
      model TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS promo_codes (
      code TEXT PRIMARY KEY,
      note TEXT,
      max_uses INTEGER,
      used_count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      discount_percent INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS month_reminders (
      email TEXT NOT NULL, cycle TEXT NOT NULL, sent_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (email, cycle)
    );
    CREATE TABLE IF NOT EXISTS homework_reminders (
      email TEXT NOT NULL, cycle TEXT NOT NULL, sent_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (email, cycle)
    );
    CREATE TABLE IF NOT EXISTS ai_usage (
      id TEXT PRIMARY KEY,
      kind TEXT,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS presence (
      session_id TEXT PRIMARY KEY,
      email TEXT,
      last_seen BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence(last_seen);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_req_email ON blueprint_requests(email);
    CREATE INDEX IF NOT EXISTS idx_req_cycle ON blueprint_requests(billing_cycle);
    CREATE INDEX IF NOT EXISTS idx_bp_user_cycle ON blueprints(user_id, billing_cycle);
    CREATE INDEX IF NOT EXISTS idx_orders_email ON blueprint_orders(email);
    -- เร่ง getStudents (หน้าแอดมิน): LATERAL หา request ล่าสุดต่อ user+cycle + DISTINCT ON orders — กันช้า/timeout ตอนโหลดสูง
    CREATE INDEX IF NOT EXISTS idx_req_user_cycle_created ON blueprint_requests(user_id, billing_cycle, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_email_cycle_created ON blueprint_orders(email, billing_cycle, created_at DESC);
    -- สร้างตารางทั้งหมดให้ครบก่อน ALTER/UPDATE (กัน DB เปล่า/staging พัง: ALTER อ้างตารางที่ยังไม่ถูกสร้าง)
    CREATE TABLE IF NOT EXISTS credit_scripts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      channel TEXT,
      sponsor TEXT,
      brief TEXT,
      script_json TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_credit_scripts_email ON credit_scripts(email);
    CREATE TABLE IF NOT EXISTS backup_log (
      id TEXT PRIMARY KEY,
      emailed_at TIMESTAMPTZ DEFAULT now(),
      rows INTEGER,
      bytes INTEGER
    );
    -- 🎬 ให้ทีมช่วยลงมือทำ — ลูกค้าสั่งตัดต่อจากสคริปต์ในแผนตัวเอง (คิมเคาะ 2026-08-02)
    -- ขอบเขต: ตัดต่ออย่างเดียว · ลูกค้าส่งฟุตเทจ+เสียงมาเอง · ไม่รับถ่าย (งานถ่ายต้องคุยกับทีมแยก)
    CREATE TABLE IF NOT EXISTS edit_orders (
      order_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      blueprint_id TEXT,
      billing_cycle TEXT,
      script_day INTEGER,
      brief_json TEXT,                 -- สคริปต์จากแผน = บรีฟ ลูกค้าไม่ต้องเขียนเอง
      clips INTEGER DEFAULT 1,
      price_per_clip INTEGER,
      amount_satang INTEGER,
      payment_status TEXT DEFAULT 'pending',
      provider TEXT,
      provider_session_id TEXT,
      footage_url TEXT,
      voice_url TEXT,
      note TEXT,
      status TEXT DEFAULT 'awaiting_files',
      draft_url TEXT,
      final_url TEXT,
      revisions_used INTEGER DEFAULT 0,
      due_at TIMESTAMPTZ,              -- วันที่คาดว่าจะส่งงาน (คิดจากวันทำการจริง)
      ref_links TEXT,                  -- ลิงก์ตัวอย่างที่ลูกค้าแปะมาเอง (คั่นบรรทัด)
      ref_picks TEXT,                  -- งานเก่าของเราที่ลูกค้ากดเลือก (JSON array)
      assignee TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    -- ⚠️ กันคอลัมน์หายในฐานข้อมูลที่สร้างไว้ก่อน (เจอจริงบน staging 5 ส.ค. 2569)
    -- CREATE TABLE IF NOT EXISTS ไม่ทำอะไรเลยถ้าตารางมีอยู่แล้ว → คอลัมน์ที่เพิ่มเข้า CREATE ทีหลัง
    -- จะไม่มีในฐานข้อมูลเก่า แล้วพังตอน INSERT ("column ref_links does not exist")
    -- ⛔ ต้องอยู่หลัง CREATE เสมอ · ADD COLUMN IF NOT EXISTS ปลอดภัย รันซ้ำได้ ไม่แตะข้อมูลเดิม
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS order_id TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS email TEXT NOT NULL;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS blueprint_id TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS billing_cycle TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS script_day INTEGER;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS brief_json TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS clips INTEGER DEFAULT 1;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS price_per_clip INTEGER;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS amount_satang INTEGER;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS provider TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS provider_session_id TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS footage_url TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS voice_url TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS note TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'awaiting_files';
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS draft_url TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS final_url TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS revisions_used INTEGER DEFAULT 0;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS ref_links TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS ref_picks TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS assignee TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
    CREATE INDEX IF NOT EXISTS idx_edit_orders_email ON edit_orders(email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_edit_orders_status ON edit_orders(status, created_at);
    -- 🎟️ ประวัติการซื้อเครดิตตัดต่อ (1 เครดิต = ตัด 1 คลิป · ซื้อเยอะราคาต่อคลิปถูกลง)
    CREATE TABLE IF NOT EXISTS edit_credit_purchases (
      purchase_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      credits INTEGER NOT NULL,
      price_per_clip INTEGER,
      amount_satang INTEGER,
      payment_status TEXT DEFAULT 'pending',
      provider TEXT,
      provider_session_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_edit_credit_email ON edit_credit_purchases(email, created_at DESC);
    CREATE TABLE IF NOT EXISTS edit_comments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      author TEXT NOT NULL,            -- 'customer' | 'team'
      author_name TEXT,
      text TEXT NOT NULL,
      at_time TEXT,                    -- เวลาในคลิปที่พูดถึง เช่น "0:12"
      is_auto INTEGER DEFAULT 0,       -- ข้อความตอบรับอัตโนมัติ (ไม่ใช่คนพิมพ์)
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_edit_comments_order ON edit_comments(order_id, created_at);

    -- 🗂️ ห้องทำงานของคิม — ทุกโปรเจคอยู่ที่เดียว ไอเดียมาตอนไหนก็ลงถูกที่
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '📁',
      color TEXT DEFAULT '#C7DEF0',
      goal TEXT,                       -- ทำไปเพื่ออะไร (เห็นแล้วนึกออกทันทีว่าทำไมถึงทำ)
      status TEXT DEFAULT 'active',    -- active | parked | done
      priority INTEGER DEFAULT 5,      -- 1 = สำคัญสุด
      sort INTEGER DEFAULT 100,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS project_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,              -- next (ทำต่อ) | idea (ไอเดีย) | done (เสร็จแล้ว) | blocked (ติดอยู่)
      text TEXT NOT NULL,
      note TEXT,
      owner TEXT,                      -- 'kim' | 'claude' | ชื่อทีม
      priority INTEGER DEFAULT 5,
      sort INTEGER DEFAULT 100,
      done_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_project_items_pid ON project_items(project_id, kind);
    -- คอมเมนต์ต่องาน — คุยกันในงานนั้นได้เรื่อยๆ ส่งต่อให้ทีมอ่านได้
    CREATE TABLE IF NOT EXISTS project_comments (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      text TEXT NOT NULL,
      author TEXT DEFAULT 'kim',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_project_comments_item ON project_comments(item_id, created_at);
    -- บันทึกว่าส่ง "รายงานสุขภาพระบบรายวัน" ให้คิมไปแล้ววันไหน (กันส่งซ้ำ และรอด deploy ที่รีเซ็ต timer)
    CREATE TABLE IF NOT EXISTS daily_report_log (
      day DATE PRIMARY KEY,
      sent_at TIMESTAMPTZ DEFAULT now(),
      summary_json TEXT
    );
    CREATE TABLE IF NOT EXISTS script_overrides (
      scope TEXT NOT NULL,            -- 'plan' (แผน 30 วัน) | 'credit' (สคริปต์สปอนเซอร์)
      ref_id TEXT NOT NULL,           -- blueprint_id | credit_scripts.id
      day INTEGER NOT NULL DEFAULT 0, -- วันที่ 1-30 สำหรับ plan · 0 สำหรับ credit
      ai_json TEXT,                   -- เวอร์ชัน AI ล่าสุด (เกิดจากเจนใหม่ · null = ใช้ต้นฉบับจาก blueprint/credit)
      edited_json TEXT,               -- เวอร์ชันที่ลูกค้าแก้เอง (null = ยังไม่แก้)
      regen_count INTEGER DEFAULT 0,  -- เจนใหม่ไปกี่ครั้ง (ฟรี 1 ครั้ง)
      updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (scope, ref_id, day)
    );
    CREATE TABLE IF NOT EXISTS video_audits (
      audit_id TEXT PRIMARY KEY,
      order_id TEXT,
      email TEXT,
      status TEXT DEFAULT 'pending',
      result_json TEXT,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_video_audits_order ON video_audits(order_id);
    CREATE TABLE IF NOT EXISTS trend_digest (
      id SERIAL PRIMARY KEY,
      content TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE trend_digest ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
    ALTER TABLE blueprint_orders ADD COLUMN IF NOT EXISTS live_mode BOOLEAN DEFAULT false;
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS improve_count INTEGER DEFAULT 0;
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS quality_flags_json TEXT;
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS content_status TEXT DEFAULT 'pending';
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'ready';
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS content_started_at TIMESTAMPTZ;
    ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS locked_email TEXT;
    ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS credit_grant INTEGER DEFAULT 0;
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS activation_reminded_at TIMESTAMPTZ;
    ALTER TABLE blueprint_requests ADD COLUMN IF NOT EXISTS phone TEXT;
    -- 📣 ที่มาของลูกค้า (มาจากแอด/ลิงก์ไหน) — ไม่มีตรงนี้ = ยิงแอดโดยไม่รู้ว่าคุ้มไหม
    -- Facebook ต่อ ?fbclid= ให้ทุกคลิกจากแอดอยู่แล้ว จับได้เลยโดยไม่ต้องแก้ลิงก์ในแอด
    ALTER TABLE blueprint_orders ADD COLUMN IF NOT EXISTS source TEXT;
    CREATE INDEX IF NOT EXISTS idx_orders_source ON blueprint_orders(source);
    -- ===== Academy (เว็บเก่า babehouseacademy.com) — ข้อมูลนำเข้าจาก DB dump · แยกขาดจากระบบหลัก ลูกค้าไม่เห็น =====
    -- ⚠️ ไม่นำเข้า password/salt เดิมโดยเจตนา (ระบบใหม่จะใช้ OTP อีเมลแทน = ปลอดภัยกว่า)
    CREATE TABLE IF NOT EXISTS academy_users (
      legacy_id TEXT PRIMARY KEY,
      username TEXT, name TEXT, email TEXT, phone TEXT,
      role TEXT, gender TEXT, age TEXT, province TEXT, education TEXT,
      is_active TEXT, legacy_created TEXT,
      imported_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS academy_orders (
      legacy_id TEXT PRIMARY KEY,
      legacy_user_id TEXT, user_name TEXT,
      course_id TEXT, course_name TEXT,
      sub_total TEXT, total TEXT, qty TEXT, status TEXT,
      legacy_created TEXT,
      imported_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS academy_order_lines (
      legacy_id TEXT PRIMARY KEY,
      order_id TEXT, course_id TEXT, course_name TEXT,
      price TEXT, flag_sale TEXT, price_sale TEXT,
      imported_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS academy_courses (
      legacy_id TEXT PRIMARY KEY,
      name TEXT, course_code TEXT, detail TEXT,
      price TEXT, price_sale TEXT, flag_sale TEXT,
      category TEXT, instructor TEXT, featured_image_url TEXT,
      duration TEXT, tag TEXT, material TEXT, is_active TEXT, legacy_created TEXT,
      imported_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS academy_course_lines (
      legacy_id TEXT PRIMARY KEY,
      course_id TEXT, name TEXT, time TEXT, url TEXT,
      parent_line_id TEXT, seq TEXT,
      imported_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS academy_tutors (
      legacy_id TEXT PRIMARY KEY, data_json TEXT, imported_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS academy_categories (
      legacy_id TEXT PRIMARY KEY, data_json TEXT, imported_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS academy_assignments (
      assignment_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      brief TEXT,
      submit_type TEXT DEFAULT 'any',
      criteria TEXT,
      required BOOLEAN DEFAULT true,
      seq INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS academy_submissions (
      submission_id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      email TEXT NOT NULL,
      file_kind TEXT,
      status TEXT DEFAULT 'reviewing',
      score INTEGER,
      ai_json TEXT,
      teacher_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      reviewed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_academy_asg_course ON academy_assignments(course_id);
    CREATE INDEX IF NOT EXISTS idx_academy_sub_email ON academy_submissions(lower(email), course_id);
    -- ไฟล์งานที่นักเรียนส่ง (รูปเท่านั้น — คลิปไม่เก็บ ใหญ่เกินและเคยทำหลังบ้านช้ามาแล้ว)
    -- ⚠️ ห้าม SELECT คอลัมน์นี้ในหน้ารายการ ให้ดึงเฉพาะตอนเปิดดูงานทีละชิ้น
    ALTER TABLE academy_submissions ADD COLUMN IF NOT EXISTS file_data TEXT;
    -- นักเรียนยอมให้เอาผลงานไปโปรโมตได้ไหม (ต้องถามก่อนเสมอ ห้ามเอาไปใช้เงียบๆ)
    ALTER TABLE academy_submissions ADD COLUMN IF NOT EXISTS allow_marketing BOOLEAN DEFAULT false;

    -- รีวิว/ผลงานนักเรียนรายคอร์ส (คิมใส่ลิงก์เอง ช่วยลูกค้าตัดสินใจซื้อ)
    CREATE TABLE IF NOT EXISTS academy_showcase (
      showcase_id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      kind TEXT DEFAULT 'clip',
      url TEXT,
      caption TEXT,
      student_name TEXT,
      seq INTEGER DEFAULT 1,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_academy_showcase_course ON academy_showcase(course_id, active);

    -- บันทึกการเปิดดูวิดีโอ (ไว้จับพฤติกรรมดูดคลิป — บัญชีเดียวเปิดรัวจากหลาย IP)
    CREATE TABLE IF NOT EXISTS academy_video_access (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      course_id TEXT,
      lesson_id TEXT,
      ip TEXT,
      ua TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_academy_vaccess ON academy_video_access(lower(email), created_at DESC);

    -- ===== WORKSHOP (คลาสสด) — คิมลงวันเอง ลูกค้าจองและจ่ายเองในเว็บ =====
    CREATE TABLE IF NOT EXISTS workshops (
      workshop_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT,
      detail TEXT,
      who_for TEXT,
      what_you_get TEXT,
      instructor TEXT,
      price INTEGER DEFAULT 0,
      duration TEXT,
      image_url TEXT,
      active BOOLEAN DEFAULT true,
      seq INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS workshop_sessions (
      session_id TEXT PRIMARY KEY,
      workshop_id TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ,
      location TEXT,
      seats INTEGER DEFAULT 10,
      price_override INTEGER,
      status TEXT DEFAULT 'open',
      note TEXT,
      summary_url TEXT,
      summary_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_ws_sessions ON workshop_sessions(workshop_id, starts_at);
    CREATE TABLE IF NOT EXISTS workshop_bookings (
      booking_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workshop_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      qty INTEGER DEFAULT 1,
      amount_satang INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      provider_session_id TEXT,
      promo_code TEXT,
      attended BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      paid_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_ws_book_session ON workshop_bookings(session_id, status);
    CREATE INDEX IF NOT EXISTS idx_ws_book_email ON workshop_bookings(lower(email));
    -- ช่องที่คิมใช้จริงในชีตหน้างาน (อาหาร/ที่จอด/ยืนยัน) — เก็บตั้งแต่ตอนจอง จะได้ไม่ต้องไล่ถามทีหลัง
    ALTER TABLE workshop_bookings ADD COLUMN IF NOT EXISTS food_note TEXT;
    ALTER TABLE workshop_bookings ADD COLUMN IF NOT EXISTS needs_parking BOOLEAN DEFAULT false;
    ALTER TABLE workshop_bookings ADD COLUMN IF NOT EXISTS customer_note TEXT;
    ALTER TABLE workshop_bookings ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT false;
    ALTER TABLE workshop_bookings ADD COLUMN IF NOT EXISTS parking_notified BOOLEAN DEFAULT false;
    CREATE TABLE IF NOT EXISTS workshop_showcase (
      showcase_id TEXT PRIMARY KEY,
      workshop_id TEXT NOT NULL,
      url TEXT,
      caption TEXT,
      seq INTEGER DEFAULT 1,
      active BOOLEAN DEFAULT true
    );
    CREATE INDEX IF NOT EXISTS idx_ws_showcase ON workshop_showcase(workshop_id, active);
    CREATE TABLE IF NOT EXISTS academy_purchases (
      purchase_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      course_id TEXT NOT NULL,
      course_name TEXT,
      amount_satang INTEGER,
      status TEXT DEFAULT 'pending',
      provider_session_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      paid_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS academy_certificates (
      cert_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      course_id TEXT NOT NULL,
      course_name TEXT,
      student_name TEXT,
      issued_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_academy_purch_email ON academy_purchases(lower(email));
    CREATE INDEX IF NOT EXISTS idx_academy_cert_email ON academy_certificates(lower(email), course_id);
    CREATE TABLE IF NOT EXISTS academy_progress (
      email TEXT NOT NULL,
      course_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      done_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (email, course_id, lesson_id)
    );
    CREATE INDEX IF NOT EXISTS idx_academy_progress_email ON academy_progress(email, course_id);
    -- 🙋 ลูกค้าเก่าแจ้งว่า "ไม่เจอคอร์สที่เคยซื้อ" (คิมเคาะ 3 ส.ค.)
    -- ที่มา: ระบบเก่ามีออเดอร์ค้างสถานะ Open 806 รายการ (2.37 ล้านบาท) เพราะลูกค้าจ่ายผ่านแอดมิน/LINE
    -- แล้วแอดมินไม่ได้กลับมาปิดออเดอร์ · เทียบสลิปย้อนหลังไม่ไหว (เยอะ + ชื่อไม่ตรง) → ให้ลูกค้าแจ้งเองแทน
    CREATE TABLE IF NOT EXISTS academy_claims (
      claim_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      note TEXT,                       -- ลูกค้าเล่าว่าซื้อคอร์สอะไร จ่ายยังไง เมื่อไหร่
      status TEXT DEFAULT 'open',      -- open | granted | rejected
      handled_by TEXT,
      handled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_academy_claims_status ON academy_claims(status, created_at DESC);
    -- 🎁 สิทธิ์เรียนที่ทีมเปิดให้เพิ่ม (ไม่แตะออเดอร์เก่า — เก็บแยกเพื่อให้ย้อนดูได้ว่าใครเปิดให้ใคร)
    CREATE TABLE IF NOT EXISTS academy_grants (
      grant_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      course_id TEXT NOT NULL,
      granted_by TEXT,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_grants_uniq ON academy_grants(lower(email), course_id);

    -- ═══════════ 👥 Babe House Team — ระบบทำงานภายใน (คิมออกแบบ 3 ส.ค. 2569) ═══════════
    -- ทุกคนมีรหัสของตัวเอง ล็อกอินแล้วเห็นเฉพาะสิ่งที่เกี่ยวกับตัวเอง
    -- สายงาน: ลูกค้าสั่ง → AE มอบหมาย → คนตัด → หัวหน้าตรวจ → AE ตรวจอีกชั้น → ส่งลูกค้า
    CREATE TABLE IF NOT EXISTS team_members (
      member_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,              -- ชื่อเล่นที่ทีมเรียกกัน
      code TEXT NOT NULL,              -- รหัสส่วนตัวไว้ล็อกอิน
      role TEXT NOT NULL,              -- owner | ae | senior | editor | teacher
      email TEXT,                      -- ไว้ส่งแจ้งเตือนงานใหม่
      position TEXT,                   -- ตำแหน่งจริง เช่น "ตัดต่อ" "กราฟฟิก" "AE"
      side TEXT DEFAULT 'production',  -- production | academy | both
      teach_share INTEGER DEFAULT 10,  -- ส่วนแบ่งจากคลาสที่สอน (%)
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_code ON team_members(code);
    -- 📅 กำลังรับงานต่อวันของแต่ละคน (คิมเคาะ 4 ส.ค.)
    -- "โบกับพี่ก้องฟิกไปเลยว่าวันละ 4 คลิป · ฟรีแลนซ์เราไม่รู้ว่าเค้าว่างวันไหน ให้เค้าติ๊กเอง"
    -- พนักงานประจำ = ใส่ค่าไว้ แล้วกดเติมทั้งสัปดาห์ทีเดียว · ฟรีแลนซ์ = 0 ต้องติ๊กเอง
    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS default_slots INTEGER DEFAULT 0;
    -- 🎯 ลำดับการจ่ายงาน (คิมเคาะ 7 ส.ค.) — เลขน้อย = ได้งานก่อน
    -- 1 = พนักงานประจำสายตัด (โบ, พี่ก้อง) ต้องเต็มก่อน
    -- 2 = กัน (Content + ตัดต่อ) รับต่อเมื่อขั้น 1 เต็ม
    -- 3 = ฟรีแลนซ์ + AE รับเป็นด่านสุดท้าย
    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS assign_tier INTEGER DEFAULT 3;
    ALTER TABLE team_members ADD COLUMN IF NOT EXISTS started_at DATE;   -- วันเริ่มงาน — ใช้ตัดสินว่าครบ 1 ปีหรือยัง (พักร้อน 2 vs 3 วัน)
    -- บันทึกทุกครั้งที่งานเปลี่ยนมือ/เปลี่ยนสถานะ — ไว้ย้อนดูว่าใครทำอะไรเมื่อไหร่ (กันงานหาย/เถียงกัน)
    CREATE TABLE IF NOT EXISTS edit_events (
      event_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      actor TEXT,                      -- ชื่อคนที่ทำ
      action TEXT,                     -- assign | submit | approve | reject | deliver
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_edit_events_order ON edit_events(order_id, created_at);
    -- ตารางสอนคลาสสด + ค่าคอม 10% ของคนสอน (ผูกกับรอบเรียนจริงในระบบ)
    CREATE TABLE IF NOT EXISTS teach_assignments (
      teach_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,        -- รอบเรียนใน workshop_sessions
      member_id TEXT NOT NULL,
      share_percent INTEGER DEFAULT 10,
      paid BOOLEAN DEFAULT false,      -- จ่ายค่าคอมแล้วหรือยัง
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_teach_uniq ON teach_assignments(session_id, member_id);
    CREATE INDEX IF NOT EXISTS idx_academy_users_email ON academy_users(lower(email));
    CREATE INDEX IF NOT EXISTS idx_academy_orders_user ON academy_orders(legacy_user_id);
    CREATE INDEX IF NOT EXISTS idx_academy_order_lines_order ON academy_order_lines(order_id);
    CREATE INDEX IF NOT EXISTS idx_academy_course_lines_course ON academy_course_lines(course_id);
    -- seed ครั้งเดียว: @bibbidiibo ได้รับเมลเตือน activation แบบส่งมือไปแล้ว (31 ก.ค.) → กัน cron ส่งซ้ำ (idempotent ด้วย IS NULL)
    UPDATE blueprints SET activation_reminded_at=now() WHERE blueprint_id='bp_0132d190-6cf9-42c2-ba4a-a825a75c8d31' AND activation_reminded_at IS NULL;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;
    ALTER TABLE blueprint_orders ADD COLUMN IF NOT EXISTS credits_granted BOOLEAN DEFAULT false;
    -- 🎬 เครดิตตัดต่อ — คนละถังกับ credits (ซึ่งใช้กับ "เพิ่มสคริปต์")
    -- คิมเคาะ 2 ส.ค.: ซื้อเครดิตไว้ก่อน แล้วค่อยเดินดูตาราง 30 วันว่าจะให้ทีมตัดวันไหน
    -- (เดิมบังคับเลือกจำนวนคลิปตอนซื้อ ทั้งที่บรีฟมีวันเดียว → ลูกค้างงว่าอีก 29 คลิปคืออะไร)
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS edit_credits INTEGER DEFAULT 0;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS paid_by TEXT;   -- 'credit' = หักจากเครดิตที่ซื้อไว้
    -- 👥 สายงานภายในทีม (เพิ่ม 3 ส.ค.) — ใครทำ ใครตรวจ ผ่านด่านไหนแล้ว
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS assigned_to TEXT;        -- member_id ของคนตัด
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS senior_by TEXT;          -- หัวหน้าที่ตรวจผ่าน (โบ/พี่ก้อง)
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS senior_at TIMESTAMPTZ;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS ae_by TEXT;              -- AE ที่ตรวจด่านสุดท้าย (ลูกตาล)
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS ae_at TIMESTAMPTZ;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS internal_note TEXT;      -- โน้ตภายในทีม ⛔ ลูกค้าไม่เห็น
    -- ระบบมอบหมายให้ใคร เพราะอะไร — ไว้ตรวจย้อนหลังเวลาลูกตาลสงสัยว่าทำไมงานไปที่คนนี้
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS assigned_by TEXT;        -- 'system' | ชื่อคนที่มอบหมาย
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS assign_reason TEXT;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ; -- ส่งถึงลูกค้าเมื่อไหร่ (ไว้วัดตรงเวลา)
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS reject_count INTEGER DEFAULT 0; -- โดนตีกลับกี่รอบ

    -- ═══════ 🏢 งานลูกค้านอกเว็บ + ระบบตามงาน (คิมสั่ง 4 ส.ค. 2569) ═══════
    -- "ลูกตาลเป็นด่านแรกในการรับหน้า รับบรีฟ เอาบรีฟมาลงในบอร์ดตัวเอง จากนั้นระบบเป็นคน assign งาน
    --  หน้าที่ของลูกตาลก็จะเหลือแค่รับหน้าลูกค้าและตรวจงานแค่นั้น ไม่ต้องประสาน"
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web';  -- web | ae (ลูกตาลกรอกเอง)
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS client_name TEXT;           -- ชื่อลูกค้านอกเว็บ
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS client_contact TEXT;        -- ไลน์/เบอร์ ไว้ให้ระบบตามงาน
    -- ⏱️ นาฬิกาเริ่มนับเมื่อ "ได้ฟุตเทจครบ" ไม่ใช่วันรับงาน — กันโดนบีบเวลาเพราะลูกค้าส่งของช้า
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS files_ready_at TIMESTAMPTZ;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS client_due_at TIMESTAMPTZ;  -- เดดไลน์ที่ลูกค้าขอมา
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS deadline_risk TEXT;         -- ok | at_risk | slipped
    -- 🔁 รอบแก้: แยกว่าใครผิด — ของเราแก้ฟรีเสมอ ของลูกค้าเปลี่ยนใจนับโควตา
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS client_revisions INTEGER DEFAULT 0;
    ALTER TABLE edit_orders ADD COLUMN IF NOT EXISTS our_fix_count INTEGER DEFAULT 0;
    -- คอมเมนต์คุยกันในทีม (ตรวจงาน/สั่งแก้) ใช้ตารางเดียวกับที่คุยกับลูกค้า แต่ติดธง internal=1
    -- ⛔ ทุกที่ที่ส่งคอมเมนต์ให้ลูกค้าต้องกรอง internal=0 เสมอ
    ALTER TABLE edit_comments ADD COLUMN IF NOT EXISTS internal INTEGER DEFAULT 0;
    ALTER TABLE video_audits ADD COLUMN IF NOT EXISTS video_data TEXT;
    ALTER TABLE video_audits ADD COLUMN IF NOT EXISTS video_mime TEXT;
    ALTER TABLE video_audits ADD COLUMN IF NOT EXISTS context TEXT;
    ALTER TABLE credit_scripts ADD COLUMN IF NOT EXISTS cycle TEXT;
    UPDATE credit_scripts SET cycle = to_char(created_at, 'FMMonth_YYYY') WHERE cycle IS NULL;
    UPDATE blueprints SET content_status='ready' WHERE COALESCE(content_status,'pending') <> 'ready' AND blueprint_json LIKE '%"scripts":[{%';
    CREATE TABLE IF NOT EXISTS reviews (
      review_id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      blueprint_id TEXT,
      billing_cycle TEXT,
      rating INTEGER,
      text TEXT,
      display_name TEXT,
      role TEXT,
      allow_public INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (email, blueprint_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
    CREATE TABLE IF NOT EXISTS funnel_events (
      id TEXT PRIMARY KEY,
      step TEXT,
      session_id TEXT,
      email TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_funnel_step ON funnel_events(step, created_at);
    ALTER TABLE funnel_events ADD COLUMN IF NOT EXISTS source TEXT;   -- ต้องอยู่หลัง CREATE เสมอ (สนามเด็กเล่นจับได้ 2 ส.ค.)
    CREATE TABLE IF NOT EXISTS feedback (
      feedback_id TEXT PRIMARY KEY,
      email TEXT,
      blueprint_id TEXT,
      clarity INTEGER,
      message TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS abandoned_reminders (
      email TEXT PRIMARY KEY,
      order_id TEXT,
      sent_at TIMESTAMPTZ DEFAULT now()
    );
    -- 📮 ตามคนจ่ายไม่สำเร็จหลายรอบ (คิมสั่ง 7 ส.ค. "หลุดมือไปเยอะมาก")
    -- เดิมส่งได้ครั้งเดียวต่ออีเมลตลอดกาล — 77 คนได้เมลแล้วไม่กลับมา = ฿37,730
    -- เปลี่ยนเป็นตาม 3 รอบ (2 ชม. → 1 วัน → 3 วัน) แล้วหยุด ไม่ตื๊อจนน่ารำคาญ
    ALTER TABLE abandoned_reminders ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 1;
    ALTER TABLE abandoned_reminders ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ DEFAULT now();
    -- 🔁 รอบแก้งานตัดต่อ — ลูกค้ารวบจุดที่อยากแก้ทั้งหมดไว้ในรอบเดียว แล้วค่อยกดส่งทีเดียว
    -- คิมสั่ง 5 ส.ค.: "ลูกค้าพิมพ์มาเป็นนาที มันจะขึ้นเยอะมาก ต้องแยกช่องเป็นรอบๆ"
    -- เดิมลูกค้าพิมพ์ทีละบรรทัด ทีมได้งานแบบหยดทีละหยด วางแผนตัดไม่ได้
    CREATE TABLE IF NOT EXISTS edit_rounds (
      round_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      round_no INTEGER NOT NULL,        -- รอบที่ 1, 2, 3, ...
      notes_json TEXT,                  -- [{ at: "0:12", text: "ตรงนี้ตัดเร็วไป" }]
      status TEXT DEFAULT 'draft',      -- draft = กำลังเขียน · submitted = ส่งให้ทีมแล้ว
      charge_satang INTEGER DEFAULT 0,  -- รอบเกินโควตาคิดเงิน (รอบ 3 ขึ้นไป)
      paid BOOLEAN DEFAULT false,       -- จ่ายแล้วหรือยัง (รอบฟรีเป็น true ตั้งแต่แรก)
      pay_order_id TEXT,                -- ออเดอร์ที่ใช้จ่ายรอบนี้ (โยงกับ blueprint_orders)
      submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_edit_rounds_order ON edit_rounds(order_id, round_no);

    -- 🧾 ข้อมูลใบกำกับภาษีที่ลูกค้ากรอกตอนซื้อ (ชื่อบริษัท/เลขผู้เสียภาษี/ที่อยู่)
    -- เก็บไว้กับออเดอร์ของแต่ละสินค้า เพราะใบกำกับต้องออกทันทีที่เงินเข้า แก้ทีหลังไม่ได้
    -- ⚠️ ALTER ต้องอยู่หลัง CREATE ของตารางนั้นเสมอ (ฐานข้อมูลใหม่จะบูตไม่ขึ้นถ้าสลับ)
    ALTER TABLE academy_purchases ADD COLUMN IF NOT EXISTS tax_json TEXT;
    -- 🎓 ชื่อ-นามสกุลที่จะขึ้นบนเกียรติบัตร (คิมสั่ง 7 ส.ค. — workshop ถามอยู่แล้ว แต่คอร์สออนไลน์ยังไม่ถาม)
    -- เดิมเกียรติบัตรใช้ชื่อจาก academy_users (ลูกค้าเก่าที่อิมพอร์ตมา) ไม่มีก็ตัดอีเมลมาใช้
    -- → ลูกค้าใหม่ได้ใบที่เขียนว่า "babehouse555" ซึ่งเอาไปอวดไม่ได้
    ALTER TABLE academy_purchases ADD COLUMN IF NOT EXISTS student_name TEXT;
    ALTER TABLE workshop_bookings ADD COLUMN IF NOT EXISTS tax_json TEXT;
  `);
  console.log("[db] schema ready");
}
