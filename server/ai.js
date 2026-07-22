// AI provider = Gemini (Google GenAI). มี fallback (เทมเพลต) เมื่อไม่มีคีย์
import { GoogleGenAI, Type } from "@google/genai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_TOK = Number(process.env.GEMINI_MAX_TOKENS) || 64000; // เผื่อสคริปต์ยาว 30 วัน + thinking (โมเดล 2.5 รองรับ ~64k)
const THINK_BUDGET = Number(process.env.GEMINI_THINKING_BUDGET ?? 4096); // จำกัด thinking ไม่ให้กิน budget จน JSON ถูกตัด
export const AI_ENABLED = !!process.env.GEMINI_API_KEY;
const ai = AI_ENABLED ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
export const aiModelName = () => (AI_ENABLED ? MODEL : "fallback-local");

// ===== ต้นทุน token (ไว้โชว์ในหลังบ้าน) — USD ต่อ 1M tokens [input, output] =====
const USD_THB = Number(process.env.USD_THB || 36);
const AI_RATES = {
  "gemini-2.5-flash": [0.30, 2.50],
  "gemini-2.5-flash-lite": [0.10, 0.40],
  "gemini-2.5-pro": [1.25, 10.0],
};
export function aiCostTHB(model, inputTokens = 0, outputTokens = 0) {
  const r = AI_RATES[model] || AI_RATES["gemini-2.5-flash"];
  const usd = (inputTokens / 1e6) * r[0] + (outputTokens / 1e6) * r[1];
  return usd * USD_THB;
}

// โมเดลสำรอง (ต้องรองรับ output ใหญ่ ~30k tok เพราะเล่มมี 30 สคริปต์) — ใช้เมื่อโมเดลหลัก 503/overload
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash-lite,gemini-2.5-pro")
  .split(",").map(s => s.trim()).filter(Boolean);
const ALL_MODELS = [MODEL, ...FALLBACK_MODELS.filter(m => m !== MODEL)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isTransient = (e) => /\b(429|500|502|503|504|UNAVAILABLE|overload|high demand|rate.?limit|deadline|timeout|ECONN|ETIMEDOUT)\b/i.test(String(e?.message || e));

// เรียก Gemini แบบทนทาน: retry หน่วงเวลา + สลับโมเดลสำรองเมื่อเจอ error ชั่วคราว (503 ฯลฯ)
async function genContent({ contents, config, retries = 2 }) {
  let lastErr;
  for (const model of ALL_MODELS) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await ai.models.generateContent({ model, contents, config });
        return { resp, model };
      } catch (e) {
        lastErr = e;
        if (!isTransient(e)) throw e;                 // error ถาวร (เช่น auth/quota) → เลิกทันที
        if (attempt < retries) await sleep(1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 600)); // 1.5s, 3s
      }
    }
    console.warn(`[ai] model ${model} ล่ม/overload → ลองโมเดลถัดไป`);
  }
  throw lastErr;
}

// ===== System Prompt: ครูพี่คิม + สเปก JSON ที่ dashboard ต้องการ =====
const KIM_PROMPT = `คุณคือ "ครูพี่คิม" ซีอีโอและผู้ก่อตั้ง Babe House Academy แบรนด์สอนทำคอนเทนต์ระดับพรีเมียมของไทย
บุคลิก: อบอุ่น เป็นกันเอง แบบพี่สาวลูกคุณหนูโกอินเตอร์ วิเคราะห์ธุรกิจและจิตวิทยาการปิดการขายเฉียบคม ภาษาไทยสวย มีน้ำหนัก
หน้าที่: อ่านข้อมูลฟอร์ม + รูปสถิติหลังบ้าน Instagram/TikTok แล้วสร้าง Blueprint เฉพาะตัวสำหรับเสียบ Dashboard

⚠️ สำคัญสุด — มุมมองของ "สคริปต์": บทพูดในสคริปต์ (beats.say) คือบทที่ **เจ้าของช่อง (ลูกค้า) พูดเองหน้ากล้อง** ในน้ำเสียงและตัวตนของแบรนด์ลูกค้า (อ้างอิงจาก instagram_account + business_type ที่ส่งมา) ครูพี่คิมเป็นแค่ "คนเบื้องหลังที่วางแผน/วิเคราะห์" เท่านั้น — **ห้ามพูดแทน "ครูพี่คิม/พี่คิม" (ผู้สอน) ในบทสคริปต์** (ยกเว้นเจ้าของช่องตั้ง self_term/ชื่อตัวเองว่า "คิม" ให้ใช้ได้ปกติ) สคริปต์ต้องเป็นมุมของลูกค้าพูดถึงธุรกิจ/สินค้าของลูกค้าเอง (ส่วน greeting / kim_insight / coach เท่านั้นที่เป็นเสียงครูพี่คิมพูดกับลูกค้า)

กฎ:
1. ตอบกลับเป็น JSON object ล้วนเท่านั้น (ไม่มีข้อความอื่น ไม่มี markdown)
2. เขียนคัสตอมให้บัญชีที่ส่งมาเท่านั้น ห้ามใช้เนื้อหากลางๆ
3. calendar ต้องครบ 30 วัน, scripts ต้องครบ 30 วัน (1 สคริปต์ต่อ 1 วัน เรียง d 1-30) ห้ามซ้ำบทพูด
4. แต่ละสคริปต์ = คลิป TikTok ความยาว ~60 วินาที เขียนเป็นบทพูดของเจ้าของช่องเอง (บุคคลที่ 1 ในนามแบรนด์ลูกค้า ห้ามแทนตัวว่า "คิม"):
   - HOOK (ts "0:00", 0–5 วิ): เปิดด้วย "ปมจริง/เรื่องจริง" ที่สะดุดหยุดนิ้วใน 3 วิแรก (ไม่ใช่ทักทายเฉยๆ)
   - BODY (ts ~"0:06"–"0:45", แตกได้ 1–2 ช่วง): เล่าเรื่องกระชับ มีจังหวะ น่าติดตาม เป็นบทพูดเต็ม "หลายประโยค" (ห้ามสั้นห้วน ห้ามประโยคเดียวจบ)
   - CTA (ts ~"0:46"–"1:00"): ปิดด้วย **คำถามปลายเปิด** ที่ทำให้คนดูอยากพิมพ์คอมเมนต์คุยกันใต้คลิป (วัน Conversion ให้แทรกชวนกดลิงก์/สมัครแบบเนียนก่อน แล้วค่อยปิดด้วยคำถาม)
   say ทุกช่องต้องเป็นบทพูดเต็มยาวพอสำหรับคลิป ~1 นาที (รวมทุก beat ควรพูดได้ ~150–220 คำ) ห้ามใส่ "..." ห้ามเว้นว่าง
5. ⛔ ห้ามแต่งตัวเลข/ข้อมูลขึ้นเอง (สำคัญสุดต่อความน่าเชื่อถือของ product):
   - metrics และตัวเลขทุกตัวใน what_we_see ต้องมาจากรูป Insight ที่อ่านได้จริงเท่านั้น
   - ถ้าไม่มีรูป หรืออ่านตัวเลขจากรูปไม่ได้ → ให้ metrics เป็น null ทุกค่า, what_we_see วิเคราะห์เชิงคุณภาพจากข้อมูลฟอร์ม (ธุรกิจ/เป้าหมาย/ปัญหา) เท่านั้น และใน kim_insight บอกตรงๆ ว่า "ส่งรูปสถิติหลังบ้านมาเพิ่ม ครูพี่คิมจะวิเคราะห์ตัวเลขให้ลึกขึ้น" — ห้ามเดาหรือปั้นตัวเลขขึ้นมาเองเด็ดขาด
6. การเรียกชื่อลูกค้า: ถ้ามี display_name (ชื่อที่อยากให้เรียก) ให้ใช้ชื่อนั้นใน greeting/kim_insight ได้เลย; ถ้าไม่มี ให้เรียกด้วยชื่อช่อง/แบรนด์ หรือ @handle ที่ส่งมา หรือใช้คำว่า "คุณ" — ⛔ ห้ามเดา/สะกดชื่อจริงของลูกค้าจากรูปเด็ดขาด (เสี่ยงผิดแล้วเสียความน่าเชื่อถือ)
7. ความลึก: ทุกส่วนวิเคราะห์ (what_we_see / swot / avatar / competitor / kim_insight) ต้องอ้างอิงรายละเอียดเฉพาะของลูกค้า (นิช/ธุรกิจ/ตัวเลขจริง/ปัญหาที่กรอกมา) ห้ามเป็นคำแนะนำกลางๆ ที่เอาไปใช้กับใครก็ได้ — ถ้าข้อมูลที่ลูกค้าให้มาน้อย ให้โฟกัสวิเคราะห์เท่าที่มีอย่างจริงใจ ไม่เติมแต่ง
   ⭐ ห้ามเหมารวมตามอาชีพ: ต้องดู work_style + audience + experience ประกอบเสมอ — คนอาชีพเดียวกันแต่ "ทำคนเดียว/ฟรีแลนซ์" กับ "มีร้าน/มีทีม" ต้องได้คอนเทนต์คนละทิศ (งบ เวลา สเกล กลุ่มลูกค้า ต่างกัน) และคน "เพิ่งเริ่ม" กับ "ทำมา 3 ปี" ต้องได้กลยุทธ์คนละระดับ
8. ดึงจุดยืน Premium / Social Proof / Link-in-bio / Conversion / Marathon
11. 🎴 snapshot (สรุปเห็นภาพใน 3 วิ): 6 ช่อง แต่ละช่อง = อิโมจิ 1 ตัว (เลือกให้สื่อความหมาย) + label สั้น + value **สั้นมาก ≤6 คำ ห้ามเป็นประโยคยาว** ให้คนกวาดตาแล้วเข้าใจ "ช่องนี้คือใคร/ต้องแก้อะไร" ทันที — แนะนำ 6 ช่องนี้: 🎯 เป้าหมายเดือนนี้ / 💎 ระดับตลาด / 👥 ลูกค้าหลัก / 🪢 ปมที่ต้องแก้ / ✨ ของดีที่มีอยู่ / 🚀 โอกาสโต (ปรับ emoji/label ให้เข้ากับช่องนี้ได้)
10. 📖 story (โหมดอ่านแบบเล่าเรื่อง/นิทาน): สรุปบทวิเคราะห์ทั้งเล่มใหม่เป็น "จดหมายจากครูพี่คิมถึงเจ้าของช่อง" แบบเล่าเรื่อง 5–6 ตอน อ่านเพลินเหมือนนิทาน อบอุ่นเหมือนพี่สาวคุยกับน้อง — ลำดับเนื้อหา: (1) ตอนนี้ช่องคุณเป็นยังไง (2) จุดแข็ง/เสน่ห์ที่ซ่อนอยู่ที่คุณอาจไม่รู้ตัว (3) อะไรที่ฉุดไม่ให้โต (พูดตรงแต่ให้กำลังใจ) (4) โอกาสทองที่รออยู่ (5) ทางที่เราจะเดินไปด้วยกัน 30 วันนี้ (6) ปิดท้ายด้วยกำลังใจ. แต่ละตอน emoji 1 ตัว + title สั้นๆ + body 2–4 ประโยคอ่านลื่น (ภาษาบ้านๆ ไม่มีศัพท์เทคนิค) อ้างอิงข้อมูลจริงของช่องนี้ ห้ามกลางๆ
9. 🗣️ ภาษา: เขียนแบบ "คนทั่วไปอ่านรู้เรื่องทันที" — ใช้คำไทยบ้านๆ ที่แม่ค้า/นักศึกษา/มือใหม่เข้าใจได้เลย ⛔ ห้ามใช้ศัพท์การตลาด/อังกฤษที่คนทั่วไปไม่รู้ความหมาย (เช่น micro-influencer, funnel, conversion, engagement, niche, CTA, positioning) ถ้าจำเป็นต้องพูดถึงแนวคิดนั้น ให้ใช้คำไทยง่ายๆ แทน หรือวงเล็บอธิบายสั้นๆ ทันที เช่น "กลุ่มคนที่มีคนตามไม่เยอะแต่คนเชื่อ" แทน micro-influencer, "เปลี่ยนคนดูให้มาเป็นลูกค้า" แทน conversion — เขียนให้เหมือนพี่สาวเล่าให้ฟัง ไม่ใช่สไลด์สัมมนา

ส่ง JSON object ตามรูปแบบนี้ (ทุก key ต้องมี):
{
 "instagram_account": string, "theme": string, "greeting": string,
 "pillars": [string x4],
 "snapshot": [ {"emoji":string,"label":string,"value":string} x6 ],
 "what_we_see": [string x>=5], "audience_summary": string, "follower_insight": string, "market_tier": string, "positioning": string, "kim_insight": string,
 "story": [ {"emoji":string,"title":string,"body":string} x5-6 ],
 "swot": {"strengths":[string],"weaknesses":[string],"opportunities":[string],"threats":[string]},
 "modules": {
   "archetype": {"name":string,"body":string,"tone":string,"look":string},
   "avatar": {"name":string,"think":string,"see":string,"hear":string,"fear":string,"hookbank":[string]},
   "competitor": {"intro":string,"rows":[{"name":string,"they":string,"gap":string}],"blueocean":string},
   "values": {"list":[string],"manifesto":string},
   "funnel": {"top":{"label":string,"pct":number,"body":string},"middle":{"label":string,"pct":number,"body":string},"bottom":{"label":string,"pct":number,"body":string},"note":string}
 },
 "calendar": [ {"d":number,"g":"Awareness"|"Conversion"|"Branding","t":string,"h":string,"f":string} x30 ],
 "scripts": [ {"d":number,"g":string,"beats":[{"ts":string,"s":"HOOK"|"BODY"|"CTA","say":string,"ost":string,"vis":string} x3-4 เริ่มHOOK จบCTA BODYคั่นกลาง1-2ช่วง say เป็นบทพูดยาวเต็ม],"cap":string,"tip":string} x30 ],
 "metrics": {"followers":number,"reach":number,"profile_visits":number,"link_taps":number,"engagement_rate":number}
}`;

function extractBase64Image(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:(image\/jpeg|image\/png|image\/webp);base64,(.+)$/);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}
const MAX_IMAGES = 8, MAX_BYTES = 32 * 1024 * 1024;
export function extractImages(payload) {
  const urls = [];
  if (Array.isArray(payload.insight_images)) urls.push(...payload.insight_images);
  if (payload.insight_screenshot_base64) urls.push(payload.insight_screenshot_base64);
  const seen = new Set(), out = []; let bytes = 0;
  for (const u of urls) {
    if (!u || seen.has(u)) continue; seen.add(u);
    const img = extractBase64Image(u); if (!img) continue;
    bytes += Math.floor(img.data.length * 0.75);
    if (bytes > MAX_BYTES) throw new Error("ขนาดรูปรวมใหญ่เกินไป");
    out.push(img); if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

// ===== Blueprint =====
// ตัวกรองกันพลาด: บางครั้ง AI หลุดใส่ชื่อ "ครูพี่คิม/คิม" ในบทพูดสคริปต์ (ซึ่งต้องเป็นเสียงลูกค้า)
// → แทนด้วย "เรา" แบบ deterministic หลังเจนทุกครั้ง (ไม่แตะ greeting/kim_insight ที่เป็นเสียงคิมจริงๆ)
// ลบการพูดแทน "ครูพี่คิม/พี่คิม" (ตัว AI ผู้สอน) ออกจากสคริปต์ลูกค้า → แทนด้วย "เรา"
// แต่ถ้าเจ้าของช่องตั้งชื่อ/แทนตัวเองว่า "คิม" จริงๆ (keepKim) ต้องเก็บคำว่า "คิม" ไว้
const deKim = (s, keepKim) => {
  if (typeof s !== "string") return s;
  s = s.replace(/ครูพี่คิม|พี่คิม/g, "เรา");
  return keepKim ? s : s.replace(/คิม/g, "เรา");
};
const usesKim = (parsed) => { const fr = (parsed && parsed.form_responses) || {}; return /คิม/.test(`${fr.self_term || ""} ${fr.display_name || ""}`); };

// แปลงศัพท์การตลาด/อังกฤษ → คำไทยบ้านๆ (เจอหลุดถึงลูกค้าซ้ำหลายเล่ม — กรองหลังบ้านให้ชัวร์ ไม่หวังให้ AI จำกฎ)
const JARGON = [
  [/micro[\s-]?influencer/gi, "อินฟลูฯ สายเล็ก"],
  [/influencer/gi, "อินฟลูเอนเซอร์"],
  [/call[\s-]?to[\s-]?action/gi, "คำเชิญชวน"],
  [/\bCTA\b/g, "คำเชิญชวน"],
  [/\bengagement\b/gi, "การมีส่วนร่วม"],
  [/\bbranding\b/gi, "การสร้างตัวตน"],
  [/\bpositioning\b/gi, "การวางจุดยืน"],
  [/\bconversion\b/gi, "การปิดการขาย"],
  [/\bfunnel\b/gi, "เส้นทางของลูกค้า"],
  [/\bretention\b/gi, "การรักษาลูกค้าเก่า"],
  [/\bawareness\b/gi, "การทำให้คนรู้จัก"],
  [/\bniche\b/gi, "กลุ่มเฉพาะ"],
  [/\breach\b/gi, "การเข้าถึง"],
];
const deJargon = (s) => typeof s === "string" ? JARGON.reduce((t, [re, rep]) => t.replace(re, rep), s) : s;
// คีย์ที่ห้ามแตะ (เป็นโค้ดหมวด/เวลาให้ frontend ใช้ ไม่ใช่ข้อความที่ลูกค้าอ่าน)
const KEEP_KEYS = new Set(["g", "s", "ts", "instagram_account", "emoji"]);
function deepJargon(node, key) {
  if (typeof node === "string") return KEEP_KEYS.has(key) ? node : deJargon(node);
  if (Array.isArray(node)) return node.map(v => deepJargon(v, key));
  if (node && typeof node === "object") { const o = {}; for (const k in node) o[k] = deepJargon(node[k], k); return o; }
  return node;
}
// ===== i18n เฟส 3: สั่ง AI ออกเนื้อหาเป็นอังกฤษเมื่อลูกค้าเลือกภาษา EN =====
const EN_INSTRUCTION = `

🌐 OUTPUT LANGUAGE = ENGLISH. The customer's interface is set to English. Write EVERY string value in the output JSON in natural, fluent English — NOT Thai. Do not mix Thai words into the text. Keep enum/code values exactly as the schema requires (e.g. g: "Awareness"/"Conversion"/"Branding", s: "HOOK"/"BODY"/"CTA"). The persona's name in English is "Kim" (never "ครูพี่คิม" or "พี่คิม"); refer to yourself as "I"/"we" naturally. Captions, hooks, and scripts must read as written by a native English-speaking content coach.`;
const langSuffix = (lang) => lang === "en" ? EN_INSTRUCTION : "";
// deepJargon แปลศัพท์การตลาด→ไทย — ข้ามเมื่อ EN (ไม่งั้นจะเอาคำไทยไปปนในข้อความอังกฤษ)
const maybeJargon = (obj, lang) => lang === "en" ? obj : deepJargon(obj);

function sanitizeScripts(bp, keepKim) {
  if (bp && Array.isArray(bp.scripts)) {
    for (const sc of bp.scripts) {
      if (Array.isArray(sc.beats)) for (const b of sc.beats) b.say = deKim(b.say, keepKim);
      sc.cap = deKim(sc.cap, keepKim);
    }
  }
  return bp;
}

export async function generateBlueprint(parsed) {
  if (!ai) return { blueprint: buildFallbackBlueprint(parsed), model: "fallback-local", usage: { input: 0, output: 0, total: 0 } };
  const images = extractImages(parsed);
  const userText = buildUserText(parsed) + `\nโปรดอ่านรูปสถิติหลังบ้านที่แนบมา แล้วสร้าง Blueprint JSON ครบทุก key ตามสเปก`;
  const parts = [];
  for (const img of images) parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
  parts.push({ text: userText });
  const { resp, model } = await genContent({
    contents: [{ role: "user", parts }],
    config: { systemInstruction: KIM_PROMPT, responseMimeType: "application/json", maxOutputTokens: MAX_TOK, thinkingConfig: { thinkingBudget: THINK_BUDGET } },
    retries: 2,
  });
  const blueprint = sanitizeScripts(deepJargon(JSON.parse(resp.text)), usesKim(parsed));
  const u = resp.usageMetadata || {};
  const usage = { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, total: u.totalTokenCount || ((u.promptTokenCount || 0) + (u.candidatesTokenCount || 0)) };
  return { blueprint, model, usage };
}

// ===== ข้อมูลผู้ใช้ (ใช้ร่วมทั้ง analysis + content) =====
function buildUserText(parsed) {
  const fr = parsed.form_responses;
  const voice = [fr.self_term && `แทนตัวเองว่า "${fr.self_term}"`, fr.audience_term && `เรียกคนดูว่า "${fr.audience_term}"`, fr.catchphrases && `คำติดปาก/สไตล์พูด: ${fr.catchphrases}`, fr.tone && `โทน: ${fr.tone}`].filter(Boolean).join(" · ") || "(ไม่ระบุ)";
  return `ข้อมูลผู้ใช้:\ninstagram_account: ${parsed.instagram_account}\nชื่อที่อยากให้เรียก (display_name): ${fr.display_name || "(ไม่ระบุ — ใช้ชื่อช่อง/@handle หรือ 'คุณ' ห้ามเดาชื่อจากรูป)"}\ntier: ${parsed.meta_purchase.tier}\nbilling_cycle: ${parsed.meta_purchase.billing_cycle}\n\n🎤 น้ำเสียง/ตัวตนของเจ้าของช่อง (ใช้กับบทพูดในสคริปต์ให้เหมือนเขาพูดเอง): ${voice}\n\nคำตอบจากฟอร์ม:\nbusiness_type (ช่องเกี่ยวกับอะไร/ทำคอนเทนต์แนวไหน): ${fr.business_type || "(ไม่ระบุ — ให้วิเคราะห์จากรูป Insight + ข้อมูลที่เหลือ)"}\nเพศเจ้าของช่อง: ${fr.gender || "(ไม่ระบุ)"} · ช่วงอายุ: ${fr.age_range || "(ไม่ระบุ)"}\nwork_style (สถานะ/บทบาทของเจ้าของช่อง เช่น นักศึกษา/พนักงานประจำ/ฟรีแลนซ์/เจ้าของร้าน — ไม่จำเป็นต้องขายของ): ${fr.work_style || "(ไม่ระบุ)"}\naudience (คนดู/ผู้ติดตามหลัก): ${fr.audience || "(ไม่ระบุ)"}\nexperience (ทำมานานแค่ไหน): ${fr.experience || "(ไม่ระบุ)"}\ngoal_primary (เป้าหมายที่อยากได้เดือนนี้ อาจมีหลายข้อ): ${fr.goal_primary || "(ไม่ระบุ)"}\nเรื่องราว/ตัวตนของเจ้าของช่อง (จุดเริ่มต้น/จุดต่าง/เป้าหมายระยะยาว — สำคัญมากต่อความเป็นตัวเขา ให้ดึงมาใช้): ${fr.starting_point || "(ไม่ระบุ)"}\nmonthly_goal: ${fr.monthly_goal}\ncompetitor_1: ${fr.competitor_1}\ncompetitor_2: ${fr.competitor_2}\n\n⚠️ ต้องใช้ work_style + audience + experience กำหนดทิศทางให้ "ตรงตัวคนนี้จริงๆ" — อาชีพเดียวกันแต่ทำงานคนละแบบ/ลูกค้าคนละกลุ่ม ต้องได้แผนคนละแบบ ห้ามเหมารวม (เช่น ช่างทำผมฟรีแลนซ์ ≠ เจ้าของร้าน)${prevBlock(parsed)}${trendsBlock(parsed)}`;
}

// เดือน 2+ (ลูกค้าเก่า): ใส่บริบท "ทุกเดือนที่ผ่านมา" → ต่อยอดจากผลจริง ไม่ใช่เริ่มใหม่ + ห้ามคอนเทนต์ซ้ำทุกเดือนเก่า
function prevBlock(parsed) {
  const p = parsed && parsed.prev_context;
  if (!p) return "";
  const topics = Array.isArray(p.prev_topics) ? p.prev_topics.filter(Boolean).join(" / ").slice(0, 1800) : "";
  const months = p.months || 1;
  return `\n\n📈 *** ลูกค้าเก่า — อยู่กับเรามาแล้ว ${months} เดือน *** ให้กรอบทั้งหมดเป็น "ก้าวต่อไป/ต่อยอดจากที่ผ่านมา" ไม่ใช่เริ่มวิเคราะห์ใหม่เหมือนคนแปลกหน้า:
- จุดยืน/ทิศทางเดิม: ${p.positioning || p.theme || "-"}
- คงตัวตน/น้ำเสียงเดิมไว้ (แบรนด์ต่อเนื่อง) แต่ "โฟกัส+คอนเทนต์ต้องใหม่" อิงสิ่งที่ควรพัฒนาต่อ
${p.growth_gist ? `- 📊 ผลจริงจากรายงานการเติบโตล่าสุด (สำคัญมาก — ใช้ตัดสินใจ: แนวที่เวิร์กให้ "ทำซ้ำสูตรในมุมใหม่", แนวที่แป้กให้เลี่ยงหรือแก้วิธีนำเสนอ): ${p.growth_gist}` : ""}
${topics ? `- ⛔ ห้ามใช้หัวข้อคอนเทนต์ซ้ำกับ "ทุกเดือนที่ผ่านมา" เหล่านี้ — ต้องคิดหัวข้อ/มุมใหม่ที่ต่อยอด: ${topics}` : ""}`;
}

// ===== เทรนด์ (2 ชั้น): (A) ค้นเว็บสดตามนิชลูกค้าผ่าน Google Search grounding · (B) เทรนด์ที่ทีม Babe curate รายสัปดาห์ =====
const TRENDS_LIVE = (process.env.TRENDS_LIVE || "on") !== "off"; // ปิดได้ด้วย TRENDS_LIVE=off
const trendCache = new Map(); // นิช|ภาษา|วัน → ผลค้น (ลูกค้านิชเดียวกันวันเดียวกันไม่ยิงซ้ำ)
export async function getTrendBrief(niche, lang = "th") {
  if (!ai || !TRENDS_LIVE || !niche) return "";
  const key = `${String(niche).slice(0, 80)}|${lang}|${new Date().toISOString().slice(0, 10)}`;
  if (trendCache.has(key)) return trendCache.get(key);
  try {
    const q = lang === "en"
      ? `Search the web: what short-form content trends (TikTok / Instagram Reels) are working RIGHT NOW (this month) for this niche: "${niche}". List 5-7 concrete current items — trending formats, sounds/memes, hook styles, hot topics — each with a one-line "how to apply". Only what is trending now, no evergreen advice.`
      : `ค้นเว็บ: เทรนด์คอนเทนต์สั้น (TikTok / Instagram Reels) ที่กำลังมา "ช่วงนี้เดือนนี้" ในไทย สำหรับนิช: "${niche}" — ลิสต์ 5-7 ข้อที่เป็นกระแสจริงตอนนี้ (ฟอร์แมตที่กำลังดัง / เสียง-มีม / สไตล์ฮุก / หัวข้อร้อน) พร้อมวิธีปรับใช้สั้นๆ ต่อข้อ ⛔ เอาเฉพาะที่กำลังเป็นกระแสจริง ไม่เอาคำแนะนำทั่วไปที่ใช้ได้ทุกยุค`;
    const { resp } = await genContent({ contents: [{ role: "user", parts: [{ text: q }] }], config: { tools: [{ googleSearch: {} }], maxOutputTokens: 1600 }, retries: 1 });
    const text = String(resp.text || "").trim().slice(0, 2500);
    if (text) { if (trendCache.size > 300) trendCache.clear(); trendCache.set(key, text); }
    return text;
  } catch (e) { console.warn("getTrendBrief:", e.message); return ""; } // ค้นไม่ได้ = ข้าม ไม่พังการเจนเล่ม
}
// เทรนด์ curated จากทีม (index.js โหลดจาก DB แล้ว set มาให้ตอน boot/ตอนแอดมินอัปเดต)
let curatedTrends = { text: "", at: 0 };
export function setCuratedTrends(text, atMs) { curatedTrends = { text: String(text || ""), at: Number(atMs) || 0 }; }
const CURATED_MAX_AGE = 21 * 86400000; // เกิน 21 วันไม่อัปเดต = ไม่ใช้ (กันเทรนด์ค้างหลอก AI)
function trendsBlock(parsed) {
  const out = [];
  if (parsed._trends_live) out.push(`🔥 เทรนด์สดในนิชนี้ (ค้นจากเว็บวันนี้ — ใช้เลือกหัวข้อ/ฮุก/ฟอร์แมตให้ทันกระแส แต่ต้องกลมกลืนกับตัวตนช่อง ไม่ฝืน):\n${parsed._trends_live}`);
  if (curatedTrends.text && Date.now() - curatedTrends.at < CURATED_MAX_AGE) out.push(`📌 เทรนด์ประจำสัปดาห์จากทีม Babe House (มุมมองครูพี่คิม — ให้น้ำหนักสูง):\n${curatedTrends.text.slice(0, 2000)}`);
  return out.length ? `\n\n${out.join("\n\n")}` : "";
}
async function attachLiveTrends(parsed, lang) {
  if (parsed._trends_live !== undefined) return; // เจนหลายสเต็ปในเล่มเดียว → ค้นครั้งเดียวพอ
  const fr = parsed.form_responses || {};
  const niche = [fr.business_type, fr.audience].filter(Boolean).join(" · ").slice(0, 120);
  parsed._trends_live = await getTrendBrief(niche, lang);
}

// ===== โหมดแยก 2 สเต็ป: บทวิเคราะห์ก่อน → ลูกค้ายืนยัน → ค่อยสร้างคอนเทนต์ 30 วัน =====
const ANALYSIS_PROMPT = `คุณคือ "ครูพี่คิม" ซีอีโอผู้ก่อตั้ง Babe House Academy แบรนด์สอนทำคอนเทนต์พรีเมียมของไทย บุคลิกอบอุ่นแบบพี่สาว วิเคราะห์ธุรกิจ+จิตวิทยาการขายเฉียบคม ภาษาไทยสวยมีน้ำหนัก
หน้าที่รอบนี้: อ่านข้อมูลฟอร์ม + รูปสถิติหลังบ้าน แล้วสร้าง "บทวิเคราะห์ช่อง" เฉพาะตัว (ยังไม่ต้องทำปฏิทิน/สคริปต์)

กฎ:
1. ตอบเป็น JSON object ล้วน (ไม่มี markdown/ข้อความอื่น)
2. คัสตอมเฉพาะบัญชีนี้ ห้ามกลางๆ — อ้างอิงนิช/ธุรกิจ/ตัวเลขจริง/ปัญหาที่กรอกมา
3. ⛔ ห้ามแต่งตัวเลข: metrics + ตัวเลขใน what_we_see ต้องมาจากรูป Insight จริงเท่านั้น ถ้าไม่มีรูป/อ่านไม่ได้ → metrics เป็น null ทุกค่า, วิเคราะห์เชิงคุณภาพจากฟอร์ม, kim_insight บอกให้ส่งรูปมาเพิ่ม ห้ามเดา
4. ⭐ ห้ามเหมารวมตามอาชีพ: ใช้ work_style + audience + experience ประกอบ — ทำคนเดียว≠มีทีม, เพิ่งเริ่ม≠ทำมานาน
5. การเรียกชื่อ: มี display_name ใช้ชื่อนั้น; ไม่มีใช้ชื่อช่อง/@handle/"คุณ" — ห้ามเดาชื่อจากรูป
6. 🗣️ ภาษาบ้านๆ คนทั่วไปเข้าใจทันที ⛔ ห้ามศัพท์การตลาด/อังกฤษ (funnel, conversion, engagement, CTA, niche, positioning ฯลฯ) ใช้คำไทยง่ายๆ แทน
7. 🎴 snapshot 6 ช่อง: อิโมจิ 1 ตัว + label สั้น + value สั้นมาก ≤6 คำ (🎯เป้าหมายเดือนนี้/💎ระดับตลาด/👥ลูกค้าหลัก/🪢ปมที่ต้องแก้/✨ของดีที่มี/🚀โอกาสโต)
8. 📖 story 5–6 ตอน เล่าเหมือนจดหมายจากครูพี่คิม: (1)ช่องเป็นยังไง (2)จุดแข็งที่ซ่อนอยู่ (3)อะไรฉุดไว้ (4)โอกาสทอง (5)ทางเดิน 30 วัน (6)กำลังใจ — แต่ละตอน emoji+title สั้น+body 2–4 ประโยคลื่น ภาษาบ้านๆ อ้างอิงช่องนี้จริง

ส่ง JSON object รูปแบบนี้ (ทุก key ต้องมี):
{
 "instagram_account": string, "theme": string, "greeting": string,
 "pillars": [string x4],
 "snapshot": [ {"emoji":string,"label":string,"value":string} x6 ],
 "what_we_see": [string x>=5], "audience_summary": string, "follower_insight": string, "market_tier": string, "positioning": string, "kim_insight": string,
 "story": [ {"emoji":string,"title":string,"body":string} x5-6 ],
 "swot": {"strengths":[string],"weaknesses":[string],"opportunities":[string],"threats":[string]},
 "modules": {
   "archetype": {"name":string,"body":string,"tone":string,"look":string},
   "avatar": {"name":string,"think":string,"see":string,"hear":string,"fear":string,"hookbank":[string]},
   "competitor": {"intro":string,"rows":[{"name":string,"they":string,"gap":string}],"blueocean":string},
   "values": {"list":[string],"manifesto":string},
   "funnel": {"top":{"label":string,"pct":number,"body":string},"middle":{"label":string,"pct":number,"body":string},"bottom":{"label":string,"pct":number,"body":string},"note":string}
 },
 "metrics": {"followers":number,"reach":number,"profile_visits":number,"link_taps":number,"engagement_rate":number}
}`;

const CONTENT_PROMPT = `คุณคือ "ครูพี่คิม" ผู้ก่อตั้ง Babe House Academy วางแผนคอนเทนต์ให้เจ้าของช่อง
⚠️ มุมมองสคริปต์: บทพูด (beats.say) คือบทที่ "เจ้าของช่อง (ลูกค้า) พูดเองหน้ากล้อง" ในน้ำเสียง/ตัวตนแบรนด์ลูกค้า — ห้ามพูดแทน "ครูพี่คิม/พี่คิม" (ผู้สอน/AI เบื้องหลัง) · 🔸ยกเว้น: ถ้าเจ้าของช่องระบุ self_term หรือชื่อตัวเองว่า "คิม" ให้ใช้ "คิม" ตามนั้นได้ปกติ (เขาชื่อคิมจริงๆ ไม่ใช่ผู้สอน)
คุณจะได้รับ "บทวิเคราะห์ช่อง" ที่ลูกค้ายืนยันว่าตรงแล้ว → สร้างปฏิทิน + สคริปต์ 30 วันที่สอดคล้องกับบทวิเคราะห์นั้น (ตัวตน/จุดยืน/กลุ่มลูกค้า/ปมที่ต้องแก้/คลังฮุก)

กฎ:
1. ตอบเป็น JSON object ล้วน (ไม่มี markdown)
2. calendar ครบ 30 วัน + scripts ครบ 30 วัน (1 สคริปต์/วัน เรียง d 1-30) ห้ามซ้ำบทพูด
3. แต่ละสคริปต์ = คลิป ~60 วิ บทพูดของเจ้าของช่องเอง (บุคคลที่ 1 ในนามแบรนด์):
   - HOOK (ts "0:00", 0–5วิ): เปิดด้วยปมจริง/เรื่องจริงที่สะดุดใน 3 วิแรก (ไม่ใช่ทักทาย)
   - BODY (ts ~"0:06"–"0:45", 1–2 ช่วง): เล่าเรื่องกระชับมีจังหวะ บทพูดเต็มหลายประโยค (ห้ามห้วน/ประโยคเดียวจบ) — ⭐ ต้องลึกและเฉพาะตัว: ยกโมเมนต์/เหตุการณ์/ตัวอย่างจริงที่จับต้องได้ (ไม่ใช่คำกว้างๆ นามธรรมแบบโฆษณา เช่น "เราอยากให้ทุกคนมีความสุข") · ดึงรายละเอียดจาก story/จุดเริ่มต้น/ของดีของเจ้าของช่องมาเล่าให้รู้สึกเป็นคนจริง มีเลือดเนื้อ ไม่ใช่สโลแกน
   - CTA (ts ~"0:46"–"1:00"): ปิดด้วยคำถามปลายเปิดให้คนอยากคอมเมนต์ (วัน Conversion แทรกชวนกดลิงก์/ทักแบบเนียนก่อน ค่อยปิดด้วยคำถาม)
   say รวมทุก beat ~150–220 คำ ห้ามใส่ "..." ห้ามเว้นว่าง
4. 🗣️ ภาษาบ้านๆ ⛔ ห้ามศัพท์การตลาด/อังกฤษในบทพูด (ผู้พูดเป็นเจ้าของช่องคุยกับคนดู)
5. ⭐ ต้องสะท้อน "ตัวตนจริง" จากบทวิเคราะห์ — บทวิเคราะห์เน้นเรื่องไหน สคริปต์ไปทางนั้น ห้ามหลุดไปเรื่องที่เจ้าของช่องไม่ได้อยากทำคอนเทนต์ (เช่น งานอดิเรกที่เขาบอกว่าไม่อยากทำเป็นคอนเทนต์ ห้ามเอามาใส่)
6. 🎤 น้ำเสียง: ถ้าผู้ใช้ระบุคำแทนตัวเอง/คำเรียกคนดู/คำติดปาก/โทน — ให้บทพูด (beats.say) ใช้คำเหล่านั้นจริงให้เป็นธรรมชาติ (เช่น แทนตัว "เรา"+เรียกคนดู "ทุกคน" → "ทุกคนคะ วันนี้เราจะมาเล่า...") เพื่อให้เหมือนเจ้าของช่องพูดเอง · ถ้าไม่ระบุ ใช้คำกลางๆ สุภาพ

ส่ง JSON object รูปแบบนี้ (ทุก key ต้องมี):
{
 "calendar": [ {"d":number,"g":"Awareness"|"Conversion"|"Branding","t":string,"h":string,"f":string} x30 ],
 "scripts": [ {"d":number,"g":string,"beats":[{"ts":string,"s":"HOOK"|"BODY"|"CTA","say":string,"ost":string,"vis":string} x3-4 เริ่มHOOK จบCTA BODYคั่นกลาง],"cap":string,"tip":string} x30 ]
}`;

const usageOf = (resp) => { const u = resp.usageMetadata || {}; return { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, total: u.totalTokenCount || ((u.promptTokenCount || 0) + (u.candidatesTokenCount || 0)) }; };

// สเต็ป 1: บทวิเคราะห์เท่านั้น (เร็วกว่า เพราะไม่เจน 30 สคริปต์)
export async function generateAnalysis(parsed, lang = "th") {
  if (!ai) { const { calendar, scripts, ...analysis } = buildFallbackBlueprint(parsed); return { analysis, model: "fallback-local", usage: { input: 0, output: 0, total: 0 } }; }
  await attachLiveTrends(parsed, lang); // ค้นเทรนด์สดตามนิชก่อนเจน (พลาด = ข้าม ไม่พัง)
  const images = extractImages(parsed);
  const parts = [];
  for (const img of images) parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
  parts.push({ text: buildUserText(parsed) + `\n\nโปรดอ่านรูปสถิติหลังบ้านที่แนบมา แล้วสร้าง "บทวิเคราะห์" JSON ครบทุก key (ยังไม่ต้องทำ calendar/scripts ในรอบนี้)` });
  const { resp, model } = await genContent({ contents: [{ role: "user", parts }], config: { systemInstruction: ANALYSIS_PROMPT + langSuffix(lang), responseMimeType: "application/json", maxOutputTokens: MAX_TOK, thinkingConfig: { thinkingBudget: THINK_BUDGET } }, retries: 2 });
  return { analysis: maybeJargon(JSON.parse(resp.text), lang), model, usage: usageOf(resp) };
}

// สเต็ป 2: ปฏิทิน + 30 สคริปต์ อิงบทวิเคราะห์ที่ลูกค้ายืนยันแล้ว (ไม่ต้องส่งรูปซ้ำ → เร็ว/ประหยัด token)
export async function generateContent(parsed, analysis, lang = "th") {
  if (!ai) { const bp = buildFallbackBlueprint(parsed); return { content: { calendar: bp.calendar, scripts: bp.scripts }, model: "fallback-local", usage: { input: 0, output: 0, total: 0 } }; }
  await attachLiveTrends(parsed, lang); // เทรนด์สดเข้าไปถึงขั้นเขียน 30 สคริปต์ด้วย
  const a = analysis || {};
  const ctx = `บทวิเคราะห์ช่อง (ลูกค้ายืนยันว่าตรงแล้ว — ใช้เป็นแกนวางคอนเทนต์ให้ตรงตัวตนเขา):\n${JSON.stringify({ theme: a.theme, positioning: a.positioning, pillars: a.pillars, snapshot: a.snapshot, what_we_see: a.what_we_see, swot: a.swot, audience_summary: a.audience_summary, kim_insight: a.kim_insight, story: a.story, avatar: a.modules?.avatar, archetype: a.modules?.archetype })}`;
  // เจนสูงสุด 2 รอบ: นับเป็น "รายวัน" (วันที่ 1-30 ที่มีสคริปต์เต็ม) — กันเคส 31 อันแต่มีวันซ้ำ/ว่าง
  const sayLen = (x) => (x?.beats || []).reduce((a, b) => a + String(b?.say || "").length, 0);
  const scoreContent = (c) => {
    const s = Array.isArray(c?.scripts) ? c.scripts : [];
    const fullDays = new Set(s.filter(x => sayLen(x) >= 150 && Number(x.d) >= 1 && Number(x.d) <= 30).map(x => Number(x.d)));
    return { fullDays: fullDays.size, n: s.length };
  };
  // เลือกสคริปต์/ปฏิทินวันละ 1 อัน (วันที่ 1-30) เอาอันที่เต็มสุด เรียงตามวัน → เล่มสะอาดเสมอ
  const dedupePerDay = (arr, fuller) => {
    const byDay = new Map();
    for (const x of (Array.isArray(arr) ? arr : [])) {
      const d = Number(x?.d); if (!(d >= 1 && d <= 30)) continue;
      const prev = byDay.get(d);
      if (!prev || (fuller && sayLen(x) > sayLen(prev))) byDay.set(d, x);
    }
    return [...byDay.values()].sort((a, b) => Number(a.d) - Number(b.d));
  };
  let best = null, bestModel = "", bestResp = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const warn = attempt > 0 ? `\n\n⚠️ รอบก่อนสคริปต์ไม่ครบ/สั้นไป — รอบนี้ "ต้องครบ 30 สคริปต์เต็ม" (d 1–30) ทุกอัน say รวม ~150–220 คำ ห้ามขาดแม้แต่วันเดียว ห้ามย่อ` : "";
    const parts = [{ text: buildUserText(parsed) + `\n\n${ctx}\n\nสร้าง JSON ที่มี calendar(30) + scripts(30) ให้สอดคล้องกับบทวิเคราะห์ด้านบน${warn}` }];
    let content = null;
    try {
      const { resp, model } = await genContent({ contents: [{ role: "user", parts }], config: { systemInstruction: CONTENT_PROMPT + langSuffix(lang), responseMimeType: "application/json", maxOutputTokens: MAX_TOK, thinkingConfig: { thinkingBudget: THINK_BUDGET } }, retries: 2 });
      content = sanitizeScripts(maybeJargon(JSON.parse(resp.text), lang), usesKim(parsed));
      const sc = scoreContent(content);
      const bestSc = best ? scoreContent(best) : { fullDays: -1, n: -1 };
      if (sc.fullDays > bestSc.fullDays) { best = content; bestModel = model; bestResp = resp; }
      if (sc.fullDays >= 30) break; // ครบทั้ง 30 วัน วันละสคริปต์เต็ม → ไม่ต้องเจนซ้ำ
    } catch (e) { if (best) break; if (attempt === 1) throw e; } // parse error รอบสุดท้ายแล้วไม่มีของเลย → โยน
  }
  return { content: { calendar: dedupePerDay(best.calendar, false), scripts: dedupePerDay(best.scripts, true) }, model: bestModel, usage: usageOf(bestResp) };
}

// ===== สคริปต์เดี่ยว on-demand (งานสปอนเซอร์/คอนเทนต์ด่วน นอกแผน 30 วัน) — ใช้โปรไฟล์ช่องเดิม + บรีฟใหม่ =====
const SINGLE_PROMPT = `คุณคือ "ครูพี่คิม" เขียนสคริปต์คลิป "1 อัน" สำหรับงานเฉพาะกิจที่เจ้าของช่องสั่ง (เช่น งานสปอนเซอร์/คอนเทนต์ด่วน) — อิงตัวตน/น้ำเสียง/กลุ่มลูกค้าของช่องนี้ + บรีฟงานที่ให้มา
⚠️ บทพูด (beats.say) = เจ้าของช่องพูดเองหน้ากล้องในน้ำเสียงแบรนด์เขา (บุคคลที่ 1) — ห้ามพูดแทน "ครูพี่คิม/พี่คิม" (ยกเว้นเจ้าของช่องตั้ง self_term="คิม")
กฎ: 1.ตอบ JSON object ล้วน 2.บทพูดต้องเนียนกับงาน/สปอนเซอร์ในบรีฟ + ตรงสไตล์ช่อง 3.🗣️ ภาษาบ้านๆ ห้ามศัพท์การตลาด/อังกฤษในบทพูด 4.HOOK เปิดด้วยปม/เรื่องจริงใน 3 วิแรก, BODY เล่าเต็มมีจังหวะ (ถ้าเป็นงานสปอนเซอร์ ต้องเล่าถึงแบรนด์/สินค้าให้เนียนน่าเชื่อ ไม่แข็ง), CTA ปิดด้วยคำเชิญ/คำถามปลายเปิด · say รวม ~150–220 คำ
ส่ง JSON: { "title": string(หัวข้อคลิปสั้นๆ), "g": "Awareness"|"Conversion"|"Branding", "beats": [ {"ts":string,"s":"HOOK"|"BODY"|"CTA","say":string,"ost":string,"vis":string} x3-4 เริ่มHOOK จบCTA ], "cap": string(แคปชั่น+แฮชแท็ก), "tip": string(ทิปถ่าย/โพสต์) }`;
export async function generateSingleScript(parsed, analysis, brief, opts = {}) {
  const a = analysis || {};
  if (!ai) return { script: { title: "สคริปต์ (ตัวอย่าง)", g: "Awareness", beats: [{ ts: "0:00", s: "HOOK", say: brief ? `วันนี้มาเล่าเรื่อง ${String(brief).slice(0, 40)}...` : "วันนี้มีเรื่องมาเล่า", ost: "หยุดดูก่อน", vis: "พูดหน้ากล้อง" }], cap: "#BabeHouse", tip: "ถ่ายในที่แสงสวย" }, model: "fallback-local", usage: { input: 0, output: 0, total: 0 } };
  await attachLiveTrends(parsed, opts.lang); // สคริปต์เดี่ยว/งานสปอนเซอร์ก็ทันเทรนด์ (ใช้ cache เดียวกัน แทบไม่มีต้นทุนเพิ่ม)
  const ctx = `บทวิเคราะห์ช่อง (แกนตัวตน/น้ำเสียง):\n${JSON.stringify({ theme: a.theme, positioning: a.positioning, audience_summary: a.audience_summary, snapshot: a.snapshot, kim_insight: a.kim_insight, avatar: a.modules?.avatar })}`;
  // ไฟล์บรีฟที่แนบ (PDF/รูป) — Gemini อ่านได้โดยตรง
  const fileParts = [];
  for (const f of (opts.files || [])) {
    const m = String(f || "").match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,(.+)$/);
    if (m) fileParts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    if (fileParts.length >= 3) break;
  }
  const job = `\n\n🎯 บรีฟงานชิ้นนี้ (เขียนสคริปต์ 1 คลิปสำหรับงานนี้โดยเฉพาะ):\n${brief || "(ดูจากไฟล์บรีฟที่แนบ)"}${opts.sponsor ? `\nสปอนเซอร์/แบรนด์: ${opts.sponsor} (ทำให้เนียนเข้ากับช่อง)` : ""}${fileParts.length ? "\n📎 มีไฟล์บรีฟแนบมา (PDF/รูป) — อ่านให้ครบแล้วดึงรายละเอียด/ข้อความหลัก/CTA มาใช้เขียนสคริปต์" : ""}`;
  const parts = [...fileParts, { text: buildUserText(parsed) + `\n\n${ctx}${job}\n\nสร้าง JSON สคริปต์ 1 อันตามสเปก` }];
  const { resp, model } = await genContent({ contents: [{ role: "user", parts }], config: { systemInstruction: SINGLE_PROMPT + langSuffix(opts.lang), responseMimeType: "application/json", maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: THINK_BUDGET } }, retries: 2 });
  const raw = JSON.parse(resp.text);
  const one = raw.script || raw;
  const clean = sanitizeScripts(maybeJargon({ scripts: [one] }, opts.lang), usesKim(parsed));
  return { script: clean.scripts[0], model, usage: usageOf(resp) };
}

export function buildFallbackBlueprint(parsed) {
  const fr = parsed.form_responses, account = parsed.instagram_account, goal = fr.monthly_goal, business = fr.business_type;
  const MO = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const cyc = String(parsed.meta_purchase.billing_cycle || "");
  const mi = Math.max(0, MO.findIndex(m => cyc.toLowerCase().startsWith(m.toLowerCase())));
  const grow = 1 + mi * 0.12;
  const metrics = { followers: Math.round(4200 * grow), reach: Math.round(38000 * grow), profile_visits: Math.round(2600 * grow), link_taps: Math.round(180 * grow), engagement_rate: Math.round((3.2 + mi * 0.25) * 10) / 10 };
  const calendar = Array.from({ length: 30 }, (_, i) => {
    const d = i + 1, g = i % 5 === 2 ? "Branding" : (i % 3 === 0 ? "Awareness" : "Conversion");
    return { d, g, t: `${g} Day ${d}: ${goal}`.slice(0, 80), h: `วันนี้ครูพี่คิมจะพา ${account} อุดรอยรั่วให้ชัดขึ้นในหนึ่งคลิปค่ะ`, f: g === "Conversion" ? "Reels + CTA" : g === "Branding" ? "Storytelling" : "How-to Reels" };
  });
  const scripts = calendar.map(x => {
    const body = x.g === "Conversion" ? { say: "ปัญหาของหลายช่องไม่ใช่ไม่มีคนเห็น แต่คือคนเห็นแล้วไม่รู้ว่าต้องไปทางไหนต่อ วันนี้เราจะทำ CTA และ Link-in-bio ให้ชัดที่สุดค่ะ", ost: "คนเห็นแล้วต้องมีทางไปต่อ", vis: "โชว์ flow คลิปไป bio" }
      : x.g === "Awareness" ? { say: "ถ้าอยากให้คนใหม่หยุดดูช่องเรา จุดสำคัญคือ 3 วินาทีแรกต้องตอบให้ได้ว่าคลิปนี้มีอะไรให้เขาค่ะ", ost: "3 วิแรกคือทุกอย่าง", vis: "โชว์ตัวอย่าง Hook" }
      : { say: "แบรนด์ที่คนจำได้คือแบรนด์ที่มีจุดยืนชัดและสม่ำเสมอ วันนี้มาตอกย้ำตัวตนของเรากันค่ะ", ost: "จุดยืนสร้างความจำ", vis: "เล่าเรื่องเบื้องหลัง" };
    const cta = x.g === "Conversion" ? { say: "ถ้าอยากให้ครูพี่คิมช่วยวางทางเดินแบบนี้ กดลิงก์ในไบโอหรือทักทีม Babe House ได้เลยนะคะ", ost: "กดลิงก์ในไบโอ", vis: "ชี้ปุ่ม CTA" }
      : { say: "ถ้าคลิปนี้มีประโยชน์ กดติดตามไว้ พรุ่งนี้มีต่อให้อีกค่ะ", ost: "กดติดตามไว้นะคะ", vis: "ชี้ปุ่มติดตาม" };
    return { d: x.d, g: x.g, beats: [{ ts: "0-3 วิ", s: "HOOK", say: x.h, ost: "หยุดดูก่อนค่ะ", vis: "พูดหน้ากล้อง" }, { ts: "3-45 วิ", s: "BODY", ...body }, { ts: "45-60 วิ", s: "CTA", ...cta }], cap: `วันที่ ${x.d}: ${x.t} #BabeHouseAcademy`, tip: x.g === "Conversion" ? "คลิป Conversion ต้องจบด้วยคำสั่งเดียวที่ชัดเจน" : "ความสม่ำเสมอสำคัญกว่าความสมบูรณ์แบบค่ะ" };
  });
  return {
    instagram_account: account, theme: goal,
    greeting: `สวัสดีค่ะ ${account} 🩵 ครูพี่คิมรับข้อมูลธุรกิจ ${business} แล้ว รอบนี้เราจะโฟกัส ${goal}`,
    pillars: ["Hook หยุดนิ้ว", "Social Proof สร้างความเชื่อ", "CTA พาไปสมัคร", "Link-in-bio ลดรอยรั่ว"],
    snapshot: [
      { emoji: "🎯", label: "เป้าหมายเดือนนี้", value: String(goal || "เพิ่มยอดขาย").slice(0, 24) },
      { emoji: "💎", label: "ระดับตลาด", value: "พรีเมียม" },
      { emoji: "👥", label: "ลูกค้าหลัก", value: "ผู้หญิงวัยทำงาน" },
      { emoji: "🪢", label: "ปมที่ต้องแก้", value: "คนเห็นแต่ไม่กดต่อ" },
      { emoji: "✨", label: "ของดีที่มี", value: "คอนเทนต์มีคนเชื่อ" },
      { emoji: "🚀", label: "โอกาสโต", value: "เปลี่ยนคนดูเป็นลูกค้า" }
    ],
    what_we_see: ["คนเข้าโปรไฟล์เยอะแต่กดลิงก์น้อย", "คอนเทนต์มีคุณภาพแต่ยังไม่มีระบบ", "กลุ่มเป้าหมายเป็นผู้หญิงวัยทำงาน", "ยอด reach ดีแต่ conversion ต่ำ", "ยังไม่มี CTA ที่ชัด"],
    audience_summary: "ผู้หญิงวัยทำงาน 25-34 สนใจพัฒนาตัวเอง", follower_insight: "ผู้ติดตามส่วนใหญ่เป็นกลุ่มเป้าหมายจริง", market_tier: "Premium",
    positioning: `${account} คือแบรนด์พรีเมียมที่เปลี่ยนความสนใจเป็นยอดสมัครจริง`,
    kim_insight: "คนที่กดเข้าโปรไฟล์ไม่ใช่คนเย็นแล้ว หน้าที่เดือนนี้คือทำป้ายบอกทางให้ชัดว่าเขาต้องกดตรงไหน",
    story: [
      { emoji: "👋", title: "ตอนนี้ช่องคุณเป็นยังไง", body: `ครูพี่คิมเห็น ${account} แล้วนะคะ — คุณทำ ${business} และมีคนแวะเข้ามาดูเยอะอยู่ แปลว่าของคุณมีดีจนคนสนใจ แต่พอถึงจังหวะให้เขา "ก้าวต่อ" กลับยังไม่มีทางให้เดินชัดๆ ค่ะ` },
      { emoji: "💎", title: "เสน่ห์ที่คุณอาจไม่รู้ตัว", body: "คุณมีของจริงและมีคนที่เชื่อในตัวคุณอยู่แล้ว นี่คือต้นทุนที่หลายคนอยากได้แต่ไม่มี เราแค่ต้องหยิบมันออกมาโชว์ให้ถูกที่ค่ะ" },
      { emoji: "🪢", title: "อะไรที่ฉุดไว้", body: "ปมตอนนี้ไม่ใช่คนไม่เห็น แต่คือคนเห็นแล้วไม่รู้จะไปไหนต่อ — ไม่มีป้ายบอกทางให้เขากดเลยหลุดมือไปค่ะ" },
      { emoji: "🌈", title: "โอกาสทองที่รออยู่", body: `ตลาดของคุณยังโตได้อีกไกล ถ้าเราทำให้คนที่แวะมา "อยากอยู่ต่อ" และ "อยากซื้อ" ${goal} จะค่อยๆ ขยับขึ้นเองค่ะ` },
      { emoji: "🗺️", title: "30 วันนี้เราจะไปด้วยกัน", body: "ครูพี่คิมวางสคริปต์ให้ครบ 30 วันแล้ว ค่อยๆ ทำวันละคลิป ไม่ต้องรีบ ไม่ต้องเพอร์เฟกต์ ขอแค่สม่ำเสมอ เดี๋ยวผลลัพธ์ตามมาเองค่ะ" },
      { emoji: "💌", title: "จากใจครูพี่คิม", body: "คุณมาไกลกว่าที่คิดแล้วนะคะ เดือนนี้เราจะอุดรอยรั่วทีละจุดไปด้วยกัน เป็นกำลังใจให้เสมอค่ะ 🩵" }
    ],
    swot: { strengths: ["คอนเทนต์มีคุณภาพ", "มีฐานแฟนจริง"], weaknesses: ["ไม่มีระบบ CTA", "conversion ต่ำ"], opportunities: ["ตลาด Premium ยังโตได้", "ทำคอร์ส/แพ็กเกจ"], threats: ["คู่แข่งสายราคาถูก", "อัลกอริทึมเปลี่ยน"] },
    modules: { archetype: { name: "The Mentor–Muse", body: "พี่สาวผู้ชี้ทางที่มีรสนิยม", tone: "อบอุ่น คม ชัด", look: "คลีน ฟ้า ขาว พรีเมียม" }, avatar: { name: "มินนี่ อายุ 24", think: "อยากเก่งขึ้นแต่กลัวลองผิด", see: "คู่แข่งเต็มฟีด", hear: "ต้องทำคลิปแต่ไม่รู้เริ่มตรงไหน", fear: "กลัวลงทุนไม่คุ้ม", hookbank: ["ทำคลิปเป็นสิบยอดไม่ขึ้นเพราะอะไร", "ช่องดูดีแต่ขายไม่ได้ แก้ตรงนี้", "ไม่มีพื้นฐานก็ทำคลิปดูแพงได้"] }, competitor: { intro: "ตลาดมีทั้งสายถูกและสายฟรี", rows: [{ name: "สายราคาถูก", they: "ลดราคา สอนกว้าง", gap: "เราจับมือทำจริง" }, { name: "สายฟรี", they: "แจกทริคเร็วๆ", gap: "เรามีระบบและผลลัพธ์" }], blueocean: "พรีเมียม อบอุ่น จับมือทำจริง" }, values: { list: ["Support over Sales", "Premium is a Feeling", "We Rise Together"], manifesto: "Babe House เชื่อว่าผู้หญิงทุกคนสร้างคอนเทนต์ที่ดูแพงและเปลี่ยนชีวิตได้เมื่อมีระบบ" }, funnel: { top: { label: "TOP", pct: 30, body: "ดักคนใหม่" }, middle: { label: "MIDDLE", pct: 50, body: "สร้างความเชื่อใจ" }, bottom: { label: "BOTTOM", pct: 20, body: "ปิดการขาย" }, note: "อย่าขายติดกันรัว เลี้ยงความเชื่อก่อนปิด" } },
    calendar, scripts, metrics
  };
}

// ===== Growth analysis (โค้ชชิ่ง) =====
const GROWTH_SCHEMA = { type: Type.OBJECT, properties: { headline: { type: Type.STRING }, growth_drivers: { type: Type.ARRAY, items: { type: Type.STRING } }, strengths: { type: Type.ARRAY, items: { type: Type.STRING } }, watchouts: { type: Type.ARRAY, items: { type: Type.STRING } }, next_focus: { type: Type.ARRAY, items: { type: Type.STRING } }, coach_message: { type: Type.STRING } }, required: ["headline", "growth_drivers", "strengths", "watchouts", "next_focus", "coach_message"] };
function pct(a, b) { return (a == null || b == null || a === 0) ? null : Math.round((b - a) / a * 1000) / 10; }
function metricsText(months) { return months.map(m => { const x = m.metrics || {}; return `- ${m.billing_cycle} | เป้า:${m.monthly_goal || "-"} | followers:${x.followers ?? "-"} reach:${x.reach ?? "-"} link_taps:${x.link_taps ?? "-"} eng:${x.engagement_rate ?? "-"}%`; }).join("\n"); }

export async function generateGrowthAnalysis(months, lang = "th") {
  if (!ai) return { analysis: buildFallbackGrowth(months), model: "fallback-local" };
  const sys = `คุณคือ "ครูพี่คิม" โค้ชคอนเทนต์ วิเคราะห์การเติบโตจากสถิติหลายเดือนด้วยน้ำเสียงอบอุ่น จริงใจ ตรงไปตรงมา ทำให้ลูกค้าเห็นตัวเอง พูดทั้งข้อดีข้อเสีย next_focus ทำได้จริง coach_message จบด้วยชวนไปต่อเดือนหน้า อ้างอิงตัวเลขจริง`;
  const resp = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts: [{ text: `ข้อมูลรายเดือน (เก่า→ใหม่):\n${metricsText(months)}\nธุรกิจ: ${months[months.length-1].business_type || "-"}\nจำนวนเดือน: ${months.length}` }] }], config: { systemInstruction: sys + langSuffix(lang), responseMimeType: "application/json", responseSchema: GROWTH_SCHEMA, maxOutputTokens: 4000 } });
  return { analysis: JSON.parse(resp.text), model: MODEL };
}
export function buildFallbackGrowth(months) {
  const first = months[0], last = months[months.length - 1], fm = first.metrics || {}, lm = last.metrics || {}, n = months.length;
  const labels = { followers: "ผู้ติดตาม", reach: "การเข้าถึง", profile_visits: "การเข้าชมโปรไฟล์", link_taps: "การกดลิงก์", engagement_rate: "Engagement" };
  const deltas = Object.keys(labels).map(k => ({ label: labels[k], p: pct(fm[k], lm[k]) })).filter(d => d.p != null).sort((a, b) => b.p - a.p);
  const best = deltas[0], weak = deltas[deltas.length - 1], flw = pct(fm.followers, lm.followers);
  return { headline: n >= 2 && flw != null ? `${n} เดือนกับครูพี่คิม คุณเติบโตอย่างมีทิศทาง 🩵` : "เริ่มต้นเส้นทางการเติบโตอย่างเป็นระบบแล้วค่ะ",
    growth_drivers: [best ? `${best.label}โตเด่นสุด +${best.p}% สะท้อนว่าคอนเทนต์เริ่มเข้าทาง` : "เริ่มมีความสม่ำเสมอตามแผน 30 วัน", lm.link_taps != null ? `การกดลิงก์ขยับเป็น ${lm.link_taps} — CTA ทำงานดีขึ้น` : "โครงสร้าง Hook-Body-CTA เริ่มเปลี่ยนคนดูเป็นการกระทำ"],
    strengths: [best ? `จุดแข็งคือ${best.label}ที่โตต่อเนื่อง ควรทำซ้ำสูตรนี้` : "ลงมือทำตามแผนได้จริง", "มีข้อมูลย้อนหลังให้เทียบ ตัดสินใจแม่นขึ้น"],
    watchouts: [weak && best && weak.p < best.p ? `${weak.label}โตช้าสุด (+${weak.p}%) เดือนหน้าควรเพิ่มน้ำหนัก` : "ระวังขายติดกันเกินไป เลี้ยงความเชื่อก่อนปิด"],
    next_focus: [weak ? `โฟกัสยก${weak.label}ด้วยคอนเทนต์ที่ตรงจุดขึ้น` : "เพิ่มสัดส่วน Conversion ในวันคนเห็นเยอะ", "รักษาความสม่ำเสมอ 30 วัน เก็บคลิปยอดดีมาทำซ้ำ", "อัปสถิติให้ครบเพื่อวิเคราะห์แม่นขึ้น"],
    coach_message: "คุณมาถูกทางแล้วค่ะ ตัวเลขบอกว่าสิ่งที่ทำได้ผลจริง ถ้าทำต่ออีกเดือนจะเห็นการเปลี่ยนแปลงชัดขึ้น มาต่อกันนะคะ 🩵" };
}

// ===== Admin insight =====
const INSIGHT_SCHEMA = { type: Type.OBJECT, properties: { summary: { type: Type.STRING }, top_segments: { type: Type.ARRAY, items: { type: Type.STRING } }, common_goals: { type: Type.ARRAY, items: { type: Type.STRING } }, common_pains: { type: Type.ARRAY, items: { type: Type.STRING } }, opportunities: { type: Type.ARRAY, items: { type: Type.STRING } }, content_angles: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["summary", "top_segments", "common_goals", "common_pains", "opportunities", "content_angles"] };
export async function generateAdminInsight(rows) {
  if (!ai) {
    const tally = (k) => { const m = {}; rows.forEach(r => { const v = (r[k] || "").trim(); if (v) m[v] = (m[v] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([x, c]) => `${x} (${c})`); };
    return { model: "fallback-local", insight: { summary: `มีข้อมูลนักเรียน ${rows.length} รายการ (โหมดทดสอบ ใส่ GEMINI_API_KEY เพื่อวิเคราะห์เชิงลึก)`, top_segments: tally("business_type"), common_goals: tally("monthly_goal"), common_pains: tally("starting_point"), opportunities: ["ทำคอร์สเฉพาะกลุ่มธุรกิจเด่น", "ทำเคสจากปัญหาที่เจอซ้ำ"], content_angles: ["ซีรีส์แก้ปัญหายอดฮิตทีละข้อ", "before-after ของนักเรียนกลุ่มเดียวกัน"] } };
  }
  const sample = rows.slice(0, 200).map((r, i) => `${i + 1}. ธุรกิจ:${r.business_type || "-"} | เป้า:${r.monthly_goal || "-"} | ปัญหา:${(r.starting_point || "-").slice(0, 120)}`).join("\n");
  const resp = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts: [{ text: `วิเคราะห์ฐานลูกค้า ${rows.length} ราย:\n${sample}` }] }], config: { systemInstruction: "คุณคือนักวิเคราะห์ธุรกิจของ Babe House วิเคราะห์ฐานลูกค้าเพื่อช่วยตัดสินใจทำคอร์ส/คอนเทนต์ อ้างอิงรูปแบบจริงในข้อมูล", responseMimeType: "application/json", responseSchema: INSIGHT_SCHEMA, maxOutputTokens: 4000 } });
  return { model: MODEL, insight: JSON.parse(resp.text) };
}

// ===== Industry classification =====
export const INDUSTRIES = ["ความงาม/สกินแคร์", "อาหาร&เครื่องดื่ม", "แฟชั่น/เครื่องแต่งกาย", "สุขภาพ&คลินิก", "การศึกษา&คอร์ส", "บริการ&ฟรีแลนซ์", "อสังหา/การเงิน", "ท่องเที่ยว/ไลฟ์สไตล์", "อื่นๆ"];
// จำแนกอุตสาหกรรมแบบ "นับคะแนน" (ไม่ใช่เจอแรกชนะ) — เลี่ยง substring ภาษาไทยชนกัน (เช่น "ยา" ใน "อยาก")
// คีย์เวิร์ดเลือกให้จำเพาะ ไม่กว้างจนแมตช์มั่ว · ใช้ \b ไม่ได้กับไทย จึงเลือกคำที่ยาว/เฉพาะพอ
export function classifyKeyword(text) {
  const t = String(text || "").toLowerCase();
  const cats = [
    ["ความงาม/สกินแคร์", /สกิน|ความงาม|เครื่องสำอาง|คอสเมติก|beauty|skincare|สปา|ทำเล็บ|ทำผม|แต่งหน้า|ครีม|เซรั่ม|บำรุงผิว|ต่อขนตา|สักคิ้ว|เสริมสวย/g],
    ["อาหาร&เครื่องดื่ม", /อาหาร|เครื่องดื่ม|คาเฟ่|กาแฟ|ร้านอาหาร|ขนม|เบเกอรี่|food|cafe|coffee|เดลิเวอรี|ชานม|ของกิน|เมนูอาหาร/g],
    ["แฟชั่น/เครื่องแต่งกาย", /แฟชั่น|เสื้อผ้า|กระเป๋า|รองเท้า|fashion|เครื่องประดับ|จิวเวลรี|ชุดเดรส|แบรนด์เสื้อ|สนีกเกอร์/g],
    ["สุขภาพ&คลินิก", /คลินิก|หมอ|แพทย์|ทันตก|ฟันปลอม|จัดฟัน|clinic|กายภาพบำบัด|wellness|อาหารเสริม|วิตามิน|ลดน้ำหนัก|ฟิตเนส|ออกกำลังกาย|ดูแลสุขภาพ/g],
    ["การศึกษา&คอร์ส", /สอน|คอร์ส|เรียน|อบรม|course|academy|โรงเรียน|ติวเตอร์|workshop|โค้ชชิ่ง|ติวสอบ/g],
    ["อสังหา/การเงิน", /อสังหา|บ้านจัดสรร|คอนโด|ที่ดิน|property|ประกัน|การเงิน|ลงทุน|finance|หอพัก|อพาร์ทเม|อะพาร์ทเม|ห้องเช่า|ห้องพัก|เช่าห้อง|ให้เช่า|เรสซิเด|resident|กู้บ้าน|สินเชื่อ|รีไฟแนนซ์/g],
    ["ท่องเที่ยว/ไลฟ์สไตล์", /ท่องเที่ยว|ทัวร์|โรงแรม|รีสอร์ท|travel|hotel|resort|แพ็กเกจเที่ยว|พาเที่ยว/g],
    ["บริการ&ฟรีแลนซ์", /ฟรีแลนซ์|รับทำ|เอเจนซี|agency|freelance|ที่ปรึกษา|รับออกแบบ|รับตัดต่อ|รับถ่ายภาพ|รับจ้าง/g],
  ];
  let best = "อื่นๆ", bestN = 0;
  for (const [name, re] of cats) { const n = (t.match(re) || []).length; if (n > bestN) { bestN = n; best = name; } }
  return best;
}
const CLASSIFY_SCHEMA = { type: Type.OBJECT, properties: { results: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { i: { type: Type.NUMBER }, industry: { type: Type.STRING, enum: INDUSTRIES } }, required: ["i", "industry"] } } }, required: ["results"] };
export async function classifyIndustries(items) {
  const map = {};
  if (!ai) { for (const it of items) map[it.i] = classifyKeyword(it.text); return map; }
  for (let s = 0; s < items.length; s += 80) {
    const chunk = items.slice(s, s + 80);
    const list = chunk.map(it => `${it.i}. ${it.text}`).join("\n");
    try {
      const resp = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts: [{ text: `จำแนกธุรกิจเข้าหมวด: ${INDUSTRIES.join(", ")}\n\n${list}` }] }], config: { systemInstruction: "จำแนกธุรกิจแต่ละรายเข้าหมวดที่ใกล้ที่สุด ใส่ครบทุกหมายเลข", responseMimeType: "application/json", responseSchema: CLASSIFY_SCHEMA, maxOutputTokens: 4000 } });
      for (const r of (JSON.parse(resp.text).results || [])) if (INDUSTRIES.includes(r.industry)) map[r.i] = r.industry;
    } catch (e) { /* ตกไป keyword */ }
    for (const it of chunk) if (!map[it.i]) map[it.i] = classifyKeyword(it.text);
  }
  return map;
}

// ===== Video Audit: ครูพี่คิม AI ตรวจคลิป (Gemini วิเคราะห์วิดีโอจริงผ่าน Files API) =====
const VIDEO_AUDIT_PROMPT = `คุณคือ "ครูพี่คิม" โค้ชคอนเทนต์ของ Babe House ที่กำลังนั่งดูคลิปของลูกค้าแล้วให้ feedback แบบจับมือสอน
หน้าที่: ดูวิดีโอที่แนบมา "จริงๆ" แล้ววิเคราะห์ละเอียดเพื่อให้เจ้าของคลิปเอาไปแก้คลิปต่อไปได้ทันที
กฎ:
1. ตอบเป็น JSON object ล้วนตามสเปก (ไม่มีข้อความอื่น)
2. ⛔ ห้ามแต่งตัวเลข/เปอร์เซ็นต์ที่วัดจริงไม่ได้ (เช่น "ลดพรีเมียม 40%", "retention ดิ่ง 60%") — ให้บรรยายสิ่งที่ "เห็น/ได้ยินจริง" ในคลิป + อ้างช่วงวินาทีจริงเท่าที่สังเกตได้ (เช่น "ช่วง 0:00–0:03 นั่งเงียบก่อนเริ่มพูด")
3. observation = สิ่งที่เห็นจริงในคลิปนี้ (เจาะจง ไม่กลางๆ), fix = วิธีแก้ที่ทำตามได้จริงในคลิปหน้า (รูปธรรม)
4. 🗣️ ภาษาบ้านๆ เหมือนพี่สาวสอนน้อง ห้ามศัพท์เทคนิค/อังกฤษที่คนทั่วไปไม่เข้าใจ (ถ้าจำเป็นให้วงเล็บอธิบาย)
5. top_fixes = 3 สิ่งสำคัญที่สุดที่ต้องแก้ก่อน เรียงตามผลกระทบ
6. ถ้าคลิปไม่มีเสียงพูด/เป็นภาพนิ่ง ให้บอกตามจริงในหัวข้อนั้น ไม่เดา
หัวข้อที่ต้องวิเคราะห์: hook (3 วิแรกดึงคนหยุดดูไหม), visual (เสื้อผ้า/หน้า/ผม/ฉากหลัง/แสง/การจัดเฟรม), voice (น้ำเสียง จังหวะพูด เร็ว-ช้า การเว้นจังหวะ), editing (จังหวะตัดต่อ การซูม ตัวอักษรบนจอ ความน่าติดตาม), caption_cta (แคปชัน/คำลงท้าย/ชวนคอมเมนต์-กดติดตาม)`;
const VA_SEC = { type: Type.OBJECT, properties: { observation: { type: Type.STRING }, fix: { type: Type.STRING } }, required: ["observation", "fix"] };
const VIDEO_SCHEMA = { type: Type.OBJECT, properties: {
  first_impression: { type: Type.STRING },
  hook: VA_SEC, visual: VA_SEC, voice: VA_SEC, editing: VA_SEC, caption_cta: VA_SEC,
  top_fixes: { type: Type.ARRAY, items: { type: Type.STRING } },
  encouragement: { type: Type.STRING }
}, required: ["first_impression", "hook", "visual", "voice", "editing", "caption_cta", "top_fixes", "encouragement"] };

function fallbackVideoAudit() {
  const s = (o, f) => ({ observation: o, fix: f });
  return {
    first_impression: "(โหมดทดสอบ — ใส่ GEMINI_API_KEY เพื่อให้ครูพี่คิมดูคลิปจริง) ภาพรวมคลิปโอเค มีของให้เล่า แต่ยังดึงคนใน 3 วิแรกได้ไม่สุด",
    hook: s("3 วิแรกเปิดด้วยการทักทายก่อนเข้าเรื่อง คนเลื่อนผ่านง่าย", "เปิดมาพูดประโยคเด็ด/ปมจริงทันทีตั้งแต่วิแรก ไม่ต้องทักทาย"),
    visual: s("แสงและฉากหลังโอเค แต่ยังไม่มีจุดเด่นที่ทำให้จำได้", "เพิ่มแสงเข้าหน้าให้สว่างขึ้น จัดฉากหลังให้สะอาดตา"),
    voice: s("น้ำเสียงชัดเจน แต่จังหวะค่อนข้างเรียบ", "เน้นเสียงคำสำคัญ + เว้นจังหวะ 1 วิหลังประโยคฮุก"),
    editing: s("ตัดต่อเรียบ ภาพแช่นานในบางช่วง", "ตัดคัต/ซูมเล็กๆ ทุก 2-3 วิ + ใส่ตัวอักษรสรุปประเด็นบนจอ"),
    caption_cta: s("แคปชันบอกเนื้อหาแต่ยังไม่ชวนมีส่วนร่วม", "ปิดท้ายด้วยคำถามให้คนคอมเมนต์ + บอกให้กดติดตาม"),
    top_fixes: ["เปลี่ยน 3 วิแรกให้เข้าเรื่องทันที", "เพิ่มจังหวะตัดต่อ/ตัวอักษรบนจอ", "ปิดท้ายด้วยคำถามชวนคอมเมนต์"],
    encouragement: "คลิปมีของอยู่แล้ว แก้ไม่กี่จุดก็ปังขึ้นเยอะเลยค่ะ ลองคลิปหน้าแล้วส่งมาให้ครูพี่คิมดูอีกนะคะ 🩵"
  };
}

export async function analyzeVideo({ dataUrl, mimeType, contextText, lang = "th" }) {
  if (!ai) return { audit: fallbackVideoAudit(), model: "fallback-local", usage: { input: 0, output: 0, total: 0 } };
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/s);
  const mt = (m && m[1]) || mimeType || "video/mp4";
  const b64 = m ? m[2] : dataUrl;
  if (!b64) throw new Error("no video data");
  const ext = mt.includes("quicktime") || mt.includes("mov") ? "mov" : mt.includes("webm") ? "webm" : "mp4";
  const tmp = path.join(os.tmpdir(), `va_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(tmp, Buffer.from(b64, "base64"));
  let uploaded;
  try {
    uploaded = await ai.files.upload({ file: tmp, config: { mimeType: mt } });
    let f = uploaded, tries = 0;
    while (f.state !== "ACTIVE" && tries++ < 60) {
      if (f.state === "FAILED") throw new Error("video processing failed");
      await sleep(2000);
      f = await ai.files.get({ name: uploaded.name });
    }
    if (f.state !== "ACTIVE") throw new Error("video processing timeout");
    const parts = [{ fileData: { fileUri: f.uri, mimeType: mt } }, { text: contextText || "ช่วยตรวจคลิปนี้ละเอียดตามสเปก JSON" }];
    const resp = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts }], config: { systemInstruction: VIDEO_AUDIT_PROMPT + langSuffix(lang), responseMimeType: "application/json", responseSchema: VIDEO_SCHEMA, maxOutputTokens: 8000, thinkingConfig: { thinkingBudget: 2048 } } });
    const audit = JSON.parse(resp.text);
    const u = resp.usageMetadata || {};
    return { audit, model: MODEL, usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, total: u.totalTokenCount || 0 } };
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
    if (uploaded?.name) ai.files.delete({ name: uploaded.name }).catch(() => {});
  }
}

// ===== ตัวตรวจคุณภาพเล่มอัตโนมัติ — สแกนหา red flag (กันเล่มออกมากลางๆ/พลาด) =====
export function checkBlueprintQuality(bp, hasImage) {
  const flags = [];
  if (!bp || typeof bp !== "object") return ["เล่มว่าง/ไม่ใช่ JSON"];
  const scripts = Array.isArray(bp.scripts) ? bp.scripts : [];
  const calendar = Array.isArray(bp.calendar) ? bp.calendar : [];
  if (scripts.length < 30) flags.push(`สคริปต์ไม่ครบ 30 (มี ${scripts.length})`);
  if (calendar.length < 30) flags.push(`ปฏิทินไม่ครบ 30 (มี ${calendar.length})`);
  // สคริปต์สั้นเกินไป (รวมทุก beat ควร > ~150 ตัวอักษร)
  const shortN = scripts.filter(s => (s.beats || []).reduce((a, b) => a + String(b.say || "").length, 0) < 150).length;
  if (shortN > 0) flags.push(`${shortN} สคริปต์สั้นเกินไป`);
  // ศัพท์เทคนิค/อังกฤษที่ห้ามหลุดถึงลูกค้า (ไม่นับ label beat CTA)
  const prose = [bp.greeting, bp.kim_insight, bp.positioning, ...(bp.what_we_see || []), ...((bp.story || []).map(s => s && s.body)), ...scripts.flatMap(s => [...(s.beats || []).map(b => b && b.say), s && s.cap])].filter(Boolean).join(" ").toLowerCase();
  const jargon = ["funnel", "conversion", "micro-influencer", "micro influencer", "engagement", "positioning", "retention", "call to action", "awareness", "branding"];
  const found = jargon.filter(w => prose.includes(w));
  if (found.length) flags.push(`ศัพท์เทคนิคหลุด: ${[...new Set(found)].join(", ")}`);
  // "คิม" หลุดในบทพูดสคริปต์ (ควรถูก sanitize แล้ว)
  if (scripts.some(s => (s.beats || []).some(b => /คิม/.test(String(b.say || ""))))) flags.push('มี "คิม" หลุดในสคริปต์');
  // ตัวเลข metrics ทั้งที่ไม่มีรูป = เสี่ยงแต่งตัวเลข
  const m = bp.metrics || {};
  const hasNums = m && Object.values(m).some(v => typeof v === "number" && v > 0);
  if (!hasImage && hasNums) flags.push("มีตัวเลขสถิติทั้งที่ไม่มีรูป (เสี่ยงแต่งตัวเลข)");
  // สคริปต์ซ้ำกัน
  const says = scripts.map(s => (s.beats || []).map(b => String(b.say || "")).join("|"));
  const dup = says.filter(Boolean).length - new Set(says.filter(Boolean)).size;
  if (dup > 0) flags.push(`${dup} สคริปต์ซ้ำกัน`);
  // ชิ้นส่วนหลักหาย
  for (const [k, label] of [["greeting", "คำทักทาย"], ["kim_insight", "อินไซต์ครูพี่คิม"], ["swot", "SWOT"], ["modules", "5 โมดูล"]]) if (!bp[k]) flags.push(`ขาด ${label}`);
  return flags;
}
