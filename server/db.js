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
    CREATE INDEX IF NOT EXISTS idx_edit_orders_email ON edit_orders(email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_edit_orders_status ON edit_orders(status, created_at);
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
    CREATE INDEX IF NOT EXISTS idx_academy_users_email ON academy_users(lower(email));
    CREATE INDEX IF NOT EXISTS idx_academy_orders_user ON academy_orders(legacy_user_id);
    CREATE INDEX IF NOT EXISTS idx_academy_order_lines_order ON academy_order_lines(order_id);
    CREATE INDEX IF NOT EXISTS idx_academy_course_lines_course ON academy_course_lines(course_id);
    -- seed ครั้งเดียว: @bibbidiibo ได้รับเมลเตือน activation แบบส่งมือไปแล้ว (31 ก.ค.) → กัน cron ส่งซ้ำ (idempotent ด้วย IS NULL)
    UPDATE blueprints SET activation_reminded_at=now() WHERE blueprint_id='bp_0132d190-6cf9-42c2-ba4a-a825a75c8d31' AND activation_reminded_at IS NULL;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;
    ALTER TABLE blueprint_orders ADD COLUMN IF NOT EXISTS credits_granted BOOLEAN DEFAULT false;
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
  `);
  console.log("[db] schema ready");
}
