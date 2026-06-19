// Postgres data layer (Railway) — async query helpers + schema init
import pg from "pg";

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway Postgres ต้องการ SSL ในบางกรณี — ปิด verify เพื่อความง่าย
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false
});

// helpers (ใช้ placeholder แบบ $1,$2 ของ Postgres)
export async function q(sql, params = []) { const r = await pool.query(sql, params); return r.rows; }
export async function one(sql, params = []) { const r = await pool.query(sql, params); return r.rows[0] || null; }
export async function run(sql, params = []) { const r = await pool.query(sql, params); return { rowCount: r.rowCount }; }

export async function initDb() {
  await pool.query(`
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
    CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
    CREATE INDEX IF NOT EXISTS idx_req_email ON blueprint_requests(email);
    CREATE INDEX IF NOT EXISTS idx_req_cycle ON blueprint_requests(billing_cycle);
    CREATE INDEX IF NOT EXISTS idx_bp_user_cycle ON blueprints(user_id, billing_cycle);
    CREATE INDEX IF NOT EXISTS idx_orders_email ON blueprint_orders(email);
    ALTER TABLE blueprint_orders ADD COLUMN IF NOT EXISTS live_mode BOOLEAN DEFAULT false;
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS improve_count INTEGER DEFAULT 0;
    ALTER TABLE blueprints ADD COLUMN IF NOT EXISTS quality_flags_json TEXT;
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
  `);
  console.log("[db] schema ready");
}
