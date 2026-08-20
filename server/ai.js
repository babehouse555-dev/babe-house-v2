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
บุคลิก: อบอุ่น เป็นกันเอง แบบพี่สาวลูกคุณหนูโกอินเตอร์ วิเคราะห์ธุรกิจและจิตวิทยาการปิดการขายเฉียบคม ภาษาไทยสวย มีน้ำหนัก · 🗣️ ครูพี่คิมพูดกับลูกค้าลงท้ายด้วย "ค่ะ/คะ/นะคะ" เสมอ ⛔ ห้ามใช้ "จ้ะ/จ๊ะ/จ๋า/นะจ๊ะ" เด็ดขาด (ไม่สุภาพกับลูกค้า) · 👤 เรียกเจ้าของช่อง/ลูกค้าว่า "คุณ[ชื่อ]" หรือชื่อช่อง ⛔ ห้ามเรียก "น้อง[ชื่อ]" (ลูกค้าบางคนอายุมากกว่า จะดูไม่ให้เกียรติ) — ยกเว้น "น้องๆ" ที่หมายถึงผู้ติดตาม/คนดูของเขาเอง ใช้ได้ปกติ
หน้าที่: อ่านข้อมูลฟอร์ม + รูปสถิติหลังบ้าน Instagram/TikTok แล้วสร้าง Blueprint เฉพาะตัวสำหรับเสียบ Dashboard

⚠️ สำคัญสุด — มุมมองของ "สคริปต์": บทพูดในสคริปต์ (beats.say) คือบทที่ **เจ้าของช่อง (ลูกค้า) พูดเองหน้ากล้อง** ในน้ำเสียงและตัวตนของแบรนด์ลูกค้า (อ้างอิงจาก instagram_account + business_type ที่ส่งมา) ครูพี่คิมเป็นแค่ "คนเบื้องหลังที่วางแผน/วิเคราะห์" เท่านั้น — **ห้ามพูดแทน "ครูพี่คิม/พี่คิม" (ผู้สอน) ในบทสคริปต์** (ยกเว้นเจ้าของช่องตั้ง self_term/ชื่อตัวเองว่า "คิม" ให้ใช้ได้ปกติ) สคริปต์ต้องเป็นมุมของลูกค้าพูดถึงธุรกิจ/สินค้าของลูกค้าเอง (ส่วน greeting / kim_insight / coach เท่านั้นที่เป็นเสียงครูพี่คิมพูดกับลูกค้า)
⛔⛔ ห้ามใส่ "Babe House / Babe House Academy / เบ๊บเฮาส์" ในบทพูด (say)/แคปชัน (cap)/ฮุก (hooks) ของลูกค้าเด็ดขาด — Babe House คือแพลตฟอร์มเบื้องหลังของเรา ไม่ใช่แบรนด์ลูกค้า. ถ้าต้องอ้างถึงแบรนด์/ทีมของลูกค้า (รีวิว/ที่มาแบรนด์) ให้ใช้ชื่อแบรนด์ลูกค้าถ้ามี ถ้าไม่มีใช้ชื่อเจ้าของช่องหรือคำกลางๆ เช่น "ที่นี่/ทีมของเรา/ร้านของเรา" — ห้ามแต่งชื่อแบรนด์เอง และห้ามหยิบ Babe House มาใส่ (Babe House ใช้ได้แค่ใน greeting/story/kim_insight ที่เป็นเสียงครูพี่คิม)

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
   - 🎯 อ่านให้ตรงป้ายกำกับที่ติดกันในรูป (⛔ ระวังสลับ followers↔reach): ผู้ติดตาม/Followers→followers · การเข้าถึง/บัญชีที่เข้าถึง/Reach/Impressions→reach · การเข้าชมโปรไฟล์→profile_visits · การแตะลิงก์→link_taps · อัตราการมีส่วนร่วม→engagement_rate (อย่าเดาจากขนาดตัวเลข)
   - ⛔ engagement_rate: ใส่ได้เฉพาะเมื่อ**เห็นป้าย "อัตราการมีส่วนร่วม / Engagement rate" พร้อมค่า % ในรูปจริงๆ** เท่านั้น — ⛔ ห้ามคำนวณเองเด็ดขาด (ยอดถูกใจ÷ผู้ติดตาม ไม่ใช่ engagement rate และให้ค่าเวอร์เกินจริง เช่น 30-50% ทั้งที่ของจริงทั้งวงการอยู่ราว 1-8%) ถ้าในรูปไม่มีป้ายนี้ → engagement_rate = null และห้ามพูดถึง % การมีส่วนร่วมใน what_we_see/kim_insight
   - ถ้าไม่มีรูป หรืออ่านตัวเลขจากรูปไม่ได้ → ให้ metrics เป็น null ทุกค่า, what_we_see วิเคราะห์เชิงคุณภาพจากข้อมูลฟอร์ม (ธุรกิจ/เป้าหมาย/ปัญหา) เท่านั้น และใน kim_insight บอกตรงๆ ว่า "ส่งรูปสถิติหลังบ้านมาเพิ่ม ครูพี่คิมจะวิเคราะห์ตัวเลขให้ลึกขึ้น" — ห้ามเดาหรือปั้นตัวเลขขึ้นมาเองเด็ดขาด
   - 🚨 ลูกค้าแนบได้หลายรูป และอาจมาจาก **คนละแพลตฟอร์ม** — ดูให้ออกก่อนเสมอ: Instagram = หัวข้อ "ข้อมูลเชิงลึก/Insights" โทนม่วง-ชมพู · TikTok = หัวข้อ "การวิเคราะห์/Analytics" โทนน้ำเงิน มีแท็บ แรงบันดาลใจ/ผู้ชม/ผู้ติดตาม/LIVE · YouTube/Facebook = หน้า Studio/Meta
     ⛔ ห้ามรวมตัวเลขข้ามแพลตฟอร์มเข้าด้วยกันเด็ดขาด ผิดพลาดร้ายแรง: ห้ามพูดว่าผู้ติดตาม TikTok คือผู้ติดตาม IG · ห้ามเอาตัวเศษของแพลตฟอร์มหนึ่งไปหารตัวส่วนของอีกแพลตฟอร์ม (เช่น "แตะลิงก์ 9 ครั้ง จากเข้าชมโปรไฟล์ 12,500" ทั้งที่ 9 มาจาก IG และ 12,500 มาจาก TikTok = ผิด ต้องเทียบกับเข้าชมโปรไฟล์ของ IG เท่านั้น)
     ✅ metrics (ช่องเดียว) = ตัวเลขของ **แพลตฟอร์มหลักช่องเดียว** เท่านั้น เลือกช่องที่ @handle/ฟอร์มระบุ ถ้าไม่ชัดให้เลือกช่องที่ผู้ติดตามมากกว่า ⛔ ห้ามหยิบ followers จากช่องหนึ่ง + reach จากอีกช่องมาปนใน metrics เดียวกัน
     ✅ ใน what_we_see ทุกประโยคที่มีตัวเลข ต้อง **กำกับชื่อแพลตฟอร์มไว้เสมอ** เช่น "ฝั่ง TikTok ผู้ติดตาม 79,219 คน" / "ฝั่ง IG เข้าถึง 50,496 บัญชี" — และถ้าลูกค้ามี 2 ช่อง ให้วิเคราะห์ว่าแต่ละช่องแข็งคนละเรื่องยังไง ควรวางบทบาทช่องไหนเป็นช่องหลัก/ช่องรอง
6. การเรียกชื่อลูกค้า: ถ้ามี display_name (ชื่อที่อยากให้เรียก) ให้ใช้ชื่อนั้นใน greeting/kim_insight ได้เลย; ถ้าไม่มี ให้เรียกด้วยชื่อช่อง/แบรนด์ หรือ @handle ที่ส่งมา หรือใช้คำว่า "คุณ" — ⛔ ห้ามเดา/สะกดชื่อจริงของลูกค้าจากรูปเด็ดขาด (เสี่ยงผิดแล้วเสียความน่าเชื่อถือ)
7. ความลึก: ทุกส่วนวิเคราะห์ (what_we_see / swot / avatar / competitor / kim_insight) ต้องอ้างอิงรายละเอียดเฉพาะของลูกค้า (นิช/ธุรกิจ/ตัวเลขจริง/ปัญหาที่กรอกมา) ห้ามเป็นคำแนะนำกลางๆ ที่เอาไปใช้กับใครก็ได้ — ถ้าข้อมูลที่ลูกค้าให้มาน้อย ให้โฟกัสวิเคราะห์เท่าที่มีอย่างจริงใจ ไม่เติมแต่ง
   ⭐ ห้ามเหมารวมตามอาชีพ: ต้องดู work_style + audience + experience ประกอบเสมอ — คนอาชีพเดียวกันแต่ "ทำคนเดียว/ฟรีแลนซ์" กับ "มีร้าน/มีทีม" ต้องได้คอนเทนต์คนละทิศ (งบ เวลา สเกล กลุ่มลูกค้า ต่างกัน) และคน "เพิ่งเริ่ม" กับ "ทำมา 3 ปี" ต้องได้กลยุทธ์คนละระดับ
8. ดึงจุดยืน Premium / Social Proof / Link-in-bio / Conversion / Marathon
11. 🎴 snapshot (สรุปเห็นภาพใน 3 วิ): 6 ช่อง แต่ละช่อง = อิโมจิ 1 ตัว (เลือกให้สื่อความหมาย) + label สั้น + value **สั้นมาก ≤6 คำ ห้ามเป็นประโยคยาว** ให้คนกวาดตาแล้วเข้าใจ "ช่องนี้คือใคร/ต้องแก้อะไร" ทันที — แนะนำ 6 ช่องนี้: 🎯 เป้าหมายเดือนนี้ / 💎 ระดับตลาด / 👥 ลูกค้าหลัก / 🪢 ปมที่ต้องแก้ / ✨ ของดีที่มีอยู่ / 🚀 โอกาสโต (ปรับ emoji/label ให้เข้ากับช่องนี้ได้)
10. 📖 story (โหมดอ่านแบบเล่าเรื่อง/นิทาน): สรุปบทวิเคราะห์ทั้งเล่มใหม่เป็น "จดหมายจากครูพี่คิมถึงเจ้าของช่อง" แบบเล่าเรื่อง 5–6 ตอน อ่านเพลินเหมือนนิทาน อบอุ่นเป็นกันเองเหมือนพี่สาวคุยกับเพื่อนสนิท (เรียกเจ้าของช่องว่า "คุณ" ไม่ใช่ "น้อง") — ลำดับเนื้อหา: (1) ตอนนี้ช่องคุณเป็นยังไง (2) จุดแข็ง/เสน่ห์ที่ซ่อนอยู่ที่คุณอาจไม่รู้ตัว (3) อะไรที่ฉุดไม่ให้โต (พูดตรงแต่ให้กำลังใจ) (4) โอกาสทองที่รออยู่ (5) ทางที่เราจะเดินไปด้วยกัน 30 วันนี้ (6) ปิดท้ายด้วยกำลังใจ. แต่ละตอน emoji 1 ตัว + title สั้นๆ + body 2–4 ประโยคอ่านลื่น (ภาษาบ้านๆ ไม่มีศัพท์เทคนิค) อ้างอิงข้อมูลจริงของช่องนี้ ห้ามกลางๆ
9. 🗣️ ภาษา: เขียนแบบ "คนทั่วไปอ่านรู้เรื่องทันที" — ใช้คำไทยบ้านๆ ที่แม่ค้า/นักศึกษา/มือใหม่เข้าใจได้เลย ⛔ ห้ามใช้ศัพท์การตลาด/อังกฤษที่คนทั่วไปไม่รู้ความหมาย (เช่น micro-influencer, funnel, conversion, engagement, niche, CTA, positioning) ถ้าจำเป็นต้องพูดถึงแนวคิดนั้น ให้ใช้คำไทยง่ายๆ แทน หรือวงเล็บอธิบายสั้นๆ ทันที เช่น "กลุ่มคนที่มีคนตามไม่เยอะแต่คนเชื่อ" แทน micro-influencer, "เปลี่ยนคนดูให้มาเป็นลูกค้า" แทน conversion — เขียนให้เหมือนพี่สาวเล่าให้ฟัง ไม่ใช่สไลด์สัมมนา

ส่ง JSON object ตามรูปแบบนี้ (ทุก key ต้องมี):
{
 "instagram_account": string, "theme": string, "greeting": string,
 "pillars": [string x4],
 "snapshot": [ {"emoji":string,"label":string,"value":string} x6 ],
 "what_we_see": [string x>=5], "audience_summary": string, "follower_insight": string, "market_tier": string /* ระดับตลาดของช่องลูกค้า เช่น "พรีเมียม" "กลางบน" "แมส" — ⛔ ห้ามใส่รหัสสินค้าของเรา (Premium_490, Credits_10) เด็ดขาด นั่นคือรหัสภายในไม่ใช่ระดับตลาดของลูกค้า */, "positioning": string, "kim_insight": string,
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
// กันแบรนด์ "เรา" (Babe House) หลุดเข้าไปในสคริปต์ลูกค้า — Babe House คือแพลตฟอร์มเบื้องหลัง ไม่ใช่แบรนด์ลูกค้า
// (ใช้กับ beats.say/hooks/cap ที่เป็น "เสียงลูกค้า" เท่านั้น — ไม่แตะ greeting/story/kim_insight ที่เป็นเสียงครูพี่คิมซึ่งพูดถึง Babe House ได้)
const deBrand = (s) => {
  if (typeof s !== "string") return s;
  return s
    .replace(/(?:ที่|จาก|ของ)\s*Babe\s*House(?:\s*Academy)?/gi, "ที่นี่") // "ที่ Babe House Academy" → "ที่นี่"
    .replace(/กับ\s*Babe\s*House(?:\s*Academy)?/gi, "กับเรา")            // "กับ Babe House" → "กับเรา"
    .replace(/Babe\s*House(?:\s*Academy)?|เบ๊บเฮาส์/gi, "ที่นี่")          // ที่เหลือ → "ที่นี่"
    .replace(/ที่นี่\s*ที่นี่/g, "ที่นี่");
};
// กัน placeholder วงเล็บเหลี่ยม [ชื่อ...สมมติ] หลุดถึงลูกค้า → แทนด้วยคำธรรมชาติตามบริบท (net; prompt กันชั้นแรกแล้ว)
const dePlaceholder = (s) => {
  if (typeof s !== "string" || !/\[[^\]]{2,}\]/.test(s)) return s;
  return s
    .replace(/\[[^\]]*(?:คาเฟ่|ร้าน|สถานที่|ที่เที่ยว|โรงแรม|ที่พัก)[^\]]*\]/gi, "ร้านนี้")
    .replace(/\[[^\]]*(?:เมนู|เครื่องดื่ม|อาหาร|กาแฟ|จาน|ขนม|เบเกอรี|ของหวาน)[^\]]*\]/gi, "เมนูนี้")
    .replace(/\[[^\]]*(?:สินค้า|ผลิตภัณฑ์|รุ่น|แบรนด์|ไอเทม|ตัวโปรด|คอลเลกชัน)[^\]]*\]/gi, "ตัวนี้")
    .replace(/\[[^\]]{2,}\]/g, "อันนี้")                                              // fallback ทั่วไป
    .replace(/['"“”‘’]\s*(ร้านนี้|เมนูนี้|ตัวนี้|อันนี้)\s*['"“”‘’]/g, "$1")            // ตัดอัญประกาศที่ครอบคำแทน (เช่น ' [ชื่อคาเฟ่] ' → ร้านนี้)
    .replace(/\s{2,}/g, " ").trim();
};
const usesKim = (parsed) => { const fr = (parsed && parsed.form_responses) || {}; return /คิม/.test(`${fr.self_term || ""} ${fr.display_name || ""}`); };
// แบรนด์ของลูกค้า "คือ Babe House จริงๆ" (แอคของคิมเอง / ธุรกิจในเครือ babehouse) → อย่าไปกรอง Babe House ออกจากสคริปต์เขา
const usesBabeHouse = (parsed) => { const fr = (parsed && parsed.form_responses) || {}; return /babe\s*house|เบ๊บเฮาส์/i.test(`${fr.business_type || ""} ${fr.self_term || ""} ${fr.display_name || ""} ${(parsed && parsed.instagram_account) || ""}`); };

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

function sanitizeScripts(bp, keepKim, keepBrand) {
  const db = keepBrand ? (s) => s : deBrand; // แบรนด์ลูกค้าคือ Babe House จริง → ไม่กรอง (แอคคิมเอง/ธุรกิจในเครือ)
  if (bp && Array.isArray(bp.scripts)) {
    for (const sc of bp.scripts) {
      if (Array.isArray(sc.beats)) for (const b of sc.beats) b.say = dePlaceholder(db(deKim(b.say, keepKim)));
      if (Array.isArray(sc.hooks)) sc.hooks = sc.hooks.map(h => dePlaceholder(db(deKim(h, keepKim)))).filter(Boolean);
      sc.cap = dePlaceholder(db(deKim(sc.cap, keepKim)));
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
  const blueprint = sanitizeScripts(deepJargon(JSON.parse(resp.text)), usesKim(parsed), usesBabeHouse(parsed));
  const u = resp.usageMetadata || {};
  const usage = { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, total: u.totalTokenCount || ((u.promptTokenCount || 0) + (u.candidatesTokenCount || 0)) };
  return { blueprint, model, usage };
}

// ===== ข้อมูลผู้ใช้ (ใช้ร่วมทั้ง analysis + content) =====
// บอก AI ว่า "วันนี้คือวันที่เท่าไหร่" — ไม่งั้นมันเดาปีจากข้อมูลที่เทรนมา (เคยเจนเป็น "เทรนด์ 2024" ทั้งที่ปี 2026)
function todayBlock() {
  const d = new Date();
  const y = d.getFullYear();
  const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return `\n\n📅 *** วันนี้คือ ${d.getDate()} ${months[d.getMonth()]} ค.ศ. ${y} (พ.ศ. ${y + 543}) *** — ปีปัจจุบันคือ ${y}
⛔⛔ ห้ามอ้างอิงปีเก่าเด็ดขาด (เช่น "เทรนด์ 2024", "อัปเดต 2023", "ปีนี้ 2024") เพราะจะทำให้คอนเทนต์ดูเก่าล้าสมัยทันที
✅ วิธีที่ถูก: (ก) **ไม่ต้องใส่เลขปีเลย** ใช้คำว่า "ตอนนี้ / ปีนี้ / ช่วงนี้ / ล่าสุด" แทน (คอนเทนต์จะไม่เก่าเร็ว — ดีที่สุด) หรือ (ข) ถ้าจำเป็นต้องใส่จริงๆ ให้ใช้ ${y} เท่านั้น`;
}

// 🎯 "แนวที่อยากได้ / ไม่อยากได้" — เจ้าของช่องบอกมาเอง ต้องมาก่อนการตีความของ AI เสมอ
// เพิ่ม 2 ส.ค. 2569 หลังเจอลูกค้า 3 รายในวันเดียวบอกว่าแผนไม่ตรงแนว สาเหตุเดียวกันหมด:
// AI ตีความอาชีพ/สินค้าเป็นแนวคอนเทนต์ (ออกกำลังกาย→ช่องสอนฟิตเนส · บิวตี้→รีวิวสกินแคร์ · affiliate→ช่องรีวิวล้วน)
function wantAvoidBlock(fr) {
  const want = String(fr.content_want || "").trim();
  const avoid = String(fr.content_avoid || "").trim();
  if (!want && !avoid) return "";
  let s = "\n\n🎯🎯 *** แนวคอนเทนต์ที่เจ้าของช่องบอกมาเอง — สำคัญกว่าการตีความจาก business_type ทุกกรณี *** ";
  if (want) s += `\n✅ อยากได้แนวนี้ (ให้เป็นแกนหลักของทั้ง 30 วัน · ฟอร์แมต/โทนต้องเป็นไปตามนี้): ${want}`;
  if (avoid) s += `\n⛔ ไม่อยากได้แนวนี้เด็ดขาด (ห้ามมีในปฏิทินและสคริปต์แม้แต่วันเดียว): ${avoid}`;
  s += "\n⚠️ ถ้าสิ่งที่เจ้าของช่องอยากได้ขัดกับสิ่งที่ดูควรจะเป็นจากอาชีพ/สินค้าของเขา ให้ยึดตามที่เขาบอกเสมอ — เขารู้จักคนดูของตัวเองดีที่สุด";
  return s;
}

function buildUserText(parsed) {
  const fr = parsed.form_responses;
  // 📱 บอก AI ให้ชัดว่าลูกค้าอยู่แพลตฟอร์มไหน — เพิ่ม 17 ส.ค. 2569 จากรีวิว 2 ดาวของลูกค้าจริง
  //
  // ⛔ จงใจให้เลือกได้ "ช่องเดียว" เท่านั้น ไม่มีตัวเลือก "ทั้งสองช่อง" (คิมเคาะ 17 ส.ค.)
  //    เพราะถ้าให้เลือก "ทั้งคู่" AI จะเขียนแบบกลางๆ ที่ไม่เวิร์กกับช่องไหนเลย
  //    ⚠️ แต่ "เลือกช่องเดียว" ไม่ได้แปลว่าห้ามลงช่องอื่น — คิมทักเอง 17 ส.ค.:
  //       "เวลาทำ content ฉันทำทีนึงก็ลงทุกช่อง เพราะไม่มีเวลาแยกช่องขนาดนั้น"
  //       ลูกค้าส่วนใหญ่ก็เหมือนกัน → prompt ต้องบอกว่า "ออกแบบเพื่อช่องหลัก" ไม่ใช่ "ห้ามลงช่องอื่น"
  //       ห้ามเขียนกฎที่เราเองยังไม่ทำตาม
  //
  // เดิมระบบ "ไม่เคยบอก AI เลย" ว่าลูกค้าอยู่ TikTok หรือ Instagram (ช่องในฟอร์มชื่อ instagram_account ตรงๆ)
  // AI จึงต้องเดาจากรูป Insight แล้วเดาผิด — ลูกค้าลง Insight ของ TikTok (ผู้ติดตาม ~1,000)
  // แต่ได้เล่มที่วางแผนบน Instagram ทั้งเล่ม (ที่นั่นมีผู้ติดตาม 4 คน) เธอเลยใช้เล่มไม่ได้เลย
  // ⚠️ AI ไม่ได้อ่านผิด — มันไม่เคยถูกบอก
  // ⚠️ รอบสอง 19 ส.ค. 69 — บอกแพลตฟอร์มแล้วยังเพี้ยนอยู่ (พลอยแจ้ง "เลือก TikTok แต่ผลออกมาเป็นไอจี" 2 ราย)
  //    ดูเล่มจริงของ joincinederella แล้วเจอว่า AI ไม่ได้วางแผนผิดแพลตฟอร์ม
  //    แต่มัน "เรียกสถิติ TikTok ของลูกค้าว่า ฝั่ง IG" ทั้งเล่ม
  //    หลักฐานชัด: เขียนว่า "ยอดเข้าชมฝั่ง IG 92.7% มาจาก 'สำหรับคุณ' (For You Page)"
  //    ซึ่ง For You Page เป็นของ TikTok ล้วนๆ · แถมแนะนำ Trial Reels ที่มีเฉพาะ IG
  //    เหตุที่มันดริฟต์: คำว่า instagram โผล่ทั่ว prompt (ชื่อคีย์ instagram_account ใน JSON สเปก)
  // → ต้องสั่งตรงๆ ว่า "ห้ามเรียกข้อมูลของลูกค้าว่าอีกแพลตฟอร์ม" ไม่ใช่แค่บอกว่าให้วางแผนบนอะไร
  const PLAT = {
    tiktok: `\n\n📱 *** แพลตฟอร์มหลักของลูกค้าคือ TikTok *** (ลูกค้าเลือกเองในฟอร์ม)
🚨 รูปสถิติหลังบ้านที่แนบมา = ของ TikTok ทั้งหมด
⛔ ห้ามเรียกข้อมูล/ตัวเลขของลูกค้าว่า "ฝั่ง IG" · "ทาง Instagram" · "บน IG" เด็ดขาด — ต้องเรียกว่า TikTok เท่านั้น
⛔ ห้ามแนะนำฟีเจอร์ที่มีเฉพาะ Instagram: Trial Reels · Close Friends · Notes · Broadcast Channel · ไฮไลต์สตอรี่
⛔ ห้ามใช้คำว่า Reels / Feed / Story เป็นชื่อฟอร์แมตหลัก
📌 คำว่า "สำหรับคุณ" ในสถิติ = For You Page ของ TikTok ไม่ใช่ของ IG
✅ ใช้ภาษาและกลไกของ TikTok: คลิปสั้น · ฮุก 3 วิแรก · เสียง/เพลงเทรนด์ · For You Page · การดูจนจบ · คอมเมนต์
✅ ตัวเลขและการวิเคราะห์ทั้งหมดให้อ้างอิงผลบน TikTok
📌 ลูกค้าส่วนใหญ่ถ่ายคลิปทีเดียวแล้วลงหลายช่อง — ไม่ต้องห้ามเขาลง Instagram
   แต่พูดถึง IG ได้เฉพาะ "ท้ายสคริปต์ สั้นๆ ไม่เกิน 1 บรรทัด" เท่านั้น
   ⛔ ห้ามพูดถึง IG ในบทวิเคราะห์ช่อง (what_we_see / strengths / risks / follower_insight) เด็ดขาด`,
    instagram: `\n\n📱 *** แพลตฟอร์มหลักของลูกค้าคือ Instagram *** (ลูกค้าเลือกเองในฟอร์ม)
🚨 รูปสถิติหลังบ้านที่แนบมา = ของ Instagram ทั้งหมด
⛔ ห้ามเรียกข้อมูล/ตัวเลขของลูกค้าว่า "ฝั่ง TikTok" · "บน TikTok" เด็ดขาด — ต้องเรียกว่า Instagram เท่านั้น
⛔ ห้ามแนะนำฟีเจอร์ที่มีเฉพาะ TikTok: LIVE ของขวัญ · Duet · Stitch · TikTok Shop · เสียงเทรนด์ของ TikTok
✅ ใช้ภาษาและกลไกของ IG: Reels · ภาพเลื่อน (carousel) · Story · การส่งต่อทาง DM · การบันทึกโพสต์
✅ ตัวเลขและการวิเคราะห์ทั้งหมดให้อ้างอิงผลบน Instagram
📌 ลูกค้าส่วนใหญ่ถ่ายคลิปทีเดียวแล้วลงหลายช่อง — ไม่ต้องห้ามเขาลง TikTok
   แต่พูดถึง TikTok ได้เฉพาะ "ท้ายสคริปต์ สั้นๆ ไม่เกิน 1 บรรทัด" เท่านั้น
   ⛔ ห้ามพูดถึง TikTok ในบทวิเคราะห์ช่อง (what_we_see / strengths / risks / follower_insight) เด็ดขาด`,
  };
  const platBlock = PLAT[String(fr.platform || "").toLowerCase()] || "";
  const voice = [fr.self_term && `แทนตัวเองว่า "${fr.self_term}"`, fr.audience_term && `เรียกคนดูว่า "${fr.audience_term}"`, fr.catchphrases && `คำติดปาก/สไตล์พูด: ${fr.catchphrases}`, fr.tone && `โทน: ${fr.tone}`].filter(Boolean).join(" · ") || "(ไม่ระบุ)";
  return `${platBlock}\n\nข้อมูลผู้ใช้:\nช่องหลัก: ${parsed.instagram_account}\nชื่อที่อยากให้เรียก (display_name): ${fr.display_name || "(ไม่ระบุ — ใช้ชื่อช่อง/@handle หรือ 'คุณ' ห้ามเดาชื่อจากรูป)"}\ntier: ${parsed.meta_purchase.tier}\nbilling_cycle: ${parsed.meta_purchase.billing_cycle}\n\n🎤 น้ำเสียง/ตัวตนของเจ้าของช่อง (ใช้กับบทพูดในสคริปต์ให้เหมือนเขาพูดเอง): ${voice}\n\nคำตอบจากฟอร์ม:\nbusiness_type (ช่องเกี่ยวกับอะไร/ทำคอนเทนต์แนวไหน): ${fr.business_type || "(ไม่ระบุ — ให้วิเคราะห์จากรูป Insight + ข้อมูลที่เหลือ)"}\nเพศเจ้าของช่อง: ${fr.gender || "(ไม่ระบุ)"} · ช่วงอายุ: ${fr.age_range || "(ไม่ระบุ)"}\nwork_style (สถานะ/บทบาทของเจ้าของช่อง เช่น นักศึกษา/พนักงานประจำ/ฟรีแลนซ์/เจ้าของร้าน — ไม่จำเป็นต้องขายของ): ${fr.work_style || "(ไม่ระบุ)"}\naudience (คนดู/ผู้ติดตามหลัก): ${fr.audience || "(ไม่ระบุ)"}\nexperience (ทำมานานแค่ไหน): ${fr.experience || "(ไม่ระบุ)"}\ngoal_primary (เป้าหมายที่อยากได้เดือนนี้ อาจมีหลายข้อ): ${fr.goal_primary || "(ไม่ระบุ)"}\nเรื่องราว/ตัวตนของเจ้าของช่อง (จุดเริ่มต้น/จุดต่าง/เป้าหมายระยะยาว — สำคัญมากต่อความเป็นตัวเขา ให้ดึงมาใช้): ${fr.starting_point || "(ไม่ระบุ)"}\nmonthly_goal: ${fr.monthly_goal}\ncompetitor_1: ${fr.competitor_1}\ncompetitor_2: ${fr.competitor_2}${wantAvoidBlock(fr)}\n\n⚠️ ต้องใช้ work_style + audience + experience กำหนดทิศทางให้ "ตรงตัวคนนี้จริงๆ" — อาชีพเดียวกันแต่ทำงานคนละแบบ/ลูกค้าคนละกลุ่ม ต้องได้แผนคนละแบบ ห้ามเหมารวม (เช่น ช่างทำผมฟรีแลนซ์ ≠ เจ้าของร้าน)${todayBlock()}${prevBlock(parsed)}${trendsBlock(parsed)}`;
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
${topics ? `- ⛔ ห้ามใช้หัวข้อคอนเทนต์ซ้ำกับ "ทุกเดือนที่ผ่านมา" เหล่านี้ — ต้องคิดหัวข้อ/มุมใหม่ที่ต่อยอด: ${topics}` : ""}${clipLearningBlock(p.clip_learning)}`;
}

// 📈 ผลจริงรายคลิปของเดือนก่อน — ของจริงที่สุดที่เรามี สำคัญกว่าทฤษฎีทุกอย่าง
// คิมสั่ง 3 ส.ค.: "ยิ่งลูกค้ากลับมาใช้ ตัวคอนเทนต์ยิ่งเก่งขึ้นไปเรื่อยๆ ช่องเค้ายิ่งเติบโต วิเคราะห์ได้ลึกขึ้น"
function clipLearningBlock(L) {
  if (!L) return "";
  // สรุปที่ครูพี่คิม (AI) อ่านจากแคปสิ้นเดือน — มาก่อนตัวเลขดิบ เพราะเป็นข้อสรุปที่ใช้ต่อได้เลย
  const fromReview = (L.worked?.length || L.didnt_work?.length) ? `

📸📸 *** สรุปสิ้นเดือนที่แล้ว จากสถิติจริงที่เจ้าของช่องส่งมา — ของจริงที่สุดที่เรามี ***
${L.clips_done != null ? `- เดือนที่แล้วเขาลงไปจริง ${L.clips_done} คลิป จาก 30 วันในแผน${L.clips_done < 15 ? " (ลงได้ไม่ถึงครึ่ง → เดือนนี้ให้แผนทำง่ายขึ้น อย่าเพิ่มภาระ)" : ""}` : ""}
${L.worked?.length ? `✅ แนวที่เวิร์กจริงกับช่องนี้ (→ ต่อยอด ทำซ้ำสูตรในมุมใหม่):\n${L.worked.map(x => "  • " + x).join("\n")}` : ""}
${L.didnt_work?.length ? `❌ แนวที่ยังไม่ไป (→ เลี่ยง หรือเปลี่ยนวิธีนำเสนอใหม่หมด):\n${L.didnt_work.map(x => "  • " + x).join("\n")}` : ""}
${L.coach_summary ? `- สรุปภาพรวมเดือนที่แล้ว: ${L.coach_summary}` : ""}` : "";
  if (!L.enough) return fromReview;
  const fmtRow = (r) => `วันที่ ${r.day} · ${Number(r.views).toLocaleString()} วิว · "${r.title}"${r.format ? ` · ฟอร์แมต: ${r.format}` : ""}${r.goal ? ` · เป้า: ${r.goal}` : ""}`;
  const grp = (list, label) => list.length
    ? `\n- ${label}: ` + list.map(x => `${x.key} เฉลี่ย ${x.avg.toLocaleString()} วิว (${x.vs_avg >= 0 ? "+" : ""}${x.vs_avg}% จากค่าเฉลี่ยช่อง · ${x.clips} คลิป)`).join(" · ")
    : "";
  return `${fromReview}

📈📈 *** ผลจริงจากคลิปที่เจ้าของช่องลงไปแล้ว ${L.clips} คลิป — ข้อมูลนี้สำคัญที่สุดในทั้งหมด ***
นี่คือ "คนดูของช่องนี้จริงๆ" ไม่ใช่ทฤษฎีทั่วไป ⛔ ถ้าสิ่งที่คุณคิดว่าควรทำขัดกับตัวเลขพวกนี้ ให้เชื่อตัวเลขเสมอ
- ค่าเฉลี่ยของช่อง: ${L.avg_views.toLocaleString()} วิว/คลิป
🏆 คลิปที่ทำได้ดีที่สุด (→ ทำซ้ำ "สูตร" นี้ในมุม/หัวข้อใหม่ ห้ามลอกหัวข้อเดิม):
${L.best.map(r => "  • " + fmtRow(r)).join("\n")}
📉 คลิปที่ทำได้แย่ที่สุด (→ เลี่ยงแนวนี้ หรือถ้าจำเป็นต้องมี ให้เปลี่ยนวิธีนำเสนอใหม่หมด):
${L.worst.map(r => "  • " + fmtRow(r)).join("\n")}${grp(L.by_goal, "แยกตามเป้าหมายคอนเทนต์")}${grp(L.by_format, "แยกตามฟอร์แมต")}

⚠️ วิธีใช้ข้อมูลนี้ในการวางแผน 30 วันเดือนนี้:
1. ให้สัดส่วนคอนเทนต์เอียงไปทางฟอร์แมต/เป้าหมายที่ทำได้ดีกว่าค่าเฉลี่ย
2. ถอด "ทำไมคลิปที่ปังถึงปัง" (ฮุกแบบไหน อารมณ์แบบไหน) แล้วใช้หลักนั้นกับหัวข้อใหม่
3. แนวที่แป้กซ้ำๆ ให้ตัดออกหรือลดจำนวนลง อย่าดันทุรังทำต่อ
4. ใน kim_insight ให้พูดถึงสิ่งที่เรียนรู้จากตัวเลขจริงของเขา 1-2 ประโยค ด้วยน้ำเสียงโค้ชที่จำลูกค้าได้ (เช่น "เดือนที่แล้วคลิป...ของคุณไปได้ดีกว่าค่าเฉลี่ยเยอะเลย เดือนนี้เราจะต่อยอดจากตรงนั้น")`;
}

// ===== เทรนด์ (2 ชั้น): (A) ค้นเว็บสดตามนิชลูกค้าผ่าน Google Search grounding · (B) เทรนด์ที่ทีม Babe curate รายสัปดาห์ =====
const TRENDS_LIVE = (process.env.TRENDS_LIVE || "off") === "on"; // ปิดค้นสดเป็นค่าเริ่มต้น (ช้า) — ใช้เทรนด์ที่ทีมวางเองแทน (เร็ว) · เปิดค้นสดด้วย TRENDS_LIVE=on
const trendCache = new Map(); // นิช|ภาษา|วัน → ผลค้น (ลูกค้านิชเดียวกันวันเดียวกันไม่ยิงซ้ำ)
export async function getTrendBrief(niche, lang = "th") {
  if (!ai || !TRENDS_LIVE || !niche) return "";
  const key = `${String(niche).slice(0, 80)}|${lang}|${new Date().toISOString().slice(0, 10)}`;
  if (trendCache.has(key)) return trendCache.get(key);
  try {
    // ⚠️ ต้องสั้น: เทรนด์ยาวๆ ทำให้ prompt เจนเล่มบวม → เจนช้าขึ้นเกือบเท่าตัว (วัดแล้ว 2.5 → 4.5+ นาที) ลูกค้ารอไม่ไหว
    const q = lang === "en"
      ? `Search the web: which short-form (TikTok/Reels) trends are hot RIGHT NOW for this niche: "${niche}". Answer as EXACTLY 5 bullet lines, each ≤20 words: "<trend name> — <how to apply in one short phrase>". No intro, no closing, no sub-bullets. Only what's trending now.`
      : `ค้นเว็บ: เทรนด์คอนเทนต์สั้น (TikTok/Reels) ที่กำลังมาช่วงนี้ในไทย สำหรับนิช: "${niche}" — ตอบเป็น bullet 5 บรรทัดเท่านั้น บรรทัดละไม่เกิน 20 คำ รูปแบบ "ชื่อเทรนด์ — วิธีปรับใช้สั้นๆ" ⛔ ห้ามมีย่อหน้าเกริ่น/สรุป/หัวข้อย่อย เอาเฉพาะที่เป็นกระแสจริงตอนนี้`;
    // ปิด thinking (แค่ค้นแล้วสรุป) — ถ้า thinking กินโควตา คำตอบจะโดนตัดเหลือแต่ย่อหน้าเกริ่น = เทรนด์ไร้ประโยชน์
    const { resp } = await genContent({ contents: [{ role: "user", parts: [{ text: q }] }], config: { tools: [{ googleSearch: {} }], maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } }, retries: 1 });
    const text = String(resp.text || "").trim().slice(0, 800);
    if (text) { if (trendCache.size > 300) trendCache.clear(); trendCache.set(key, text); }
    return text;
  } catch (e) { console.warn("getTrendBrief:", e.message); return ""; } // ค้นไม่ได้ = ข้าม ไม่พังการเจนเล่ม
}
// เทรนด์ curated จากทีม (index.js โหลดจาก DB แล้ว set มาให้ตอน boot/ตอนแอดมินอัปเดต)
// เทรนด์ curated แยกตามกลุ่มอาชีพ (category) — "general" = ใช้ได้ทุกอาชีพ (fallback)
const curatedByCat = new Map(); // category -> { text, at }
export const TREND_GENERAL = "general";
export function setCuratedTrends(category, text, atMs) { curatedByCat.set(category || TREND_GENERAL, { text: String(text || ""), at: Number(atMs) || 0 }); }
const CURATED_MAX_AGE = 30 * 86400000; // เกิน 1 เดือนไม่อัปเดต = หยุดใช้ (เทรนด์เก่าเกินไป กันหลอก AI)
function pickCurated(cat) { const c = curatedByCat.get(cat); return (c && c.text && Date.now() - c.at < CURATED_MAX_AGE) ? c.text : ""; }
function trendsBlock(parsed) {
  const out = [];
  if (parsed._trends_live) out.push(`🔥 เทรนด์สดในนิชนี้ (ค้นจากเว็บวันนี้ — ใช้เลือกหัวข้อ/ฮุก/ฟอร์แมตให้ทันกระแส แต่ต้องกลมกลืนกับตัวตนช่อง ไม่ฝืน):\n${parsed._trends_live}`);
  // เลือกเทรนด์ตามอาชีพลูกค้าก่อน (จาก business_type) — ไม่มีค่อยใช้ชุดทั่วไป
  const cat = classifyKeyword(parsed?.form_responses?.business_type || "");
  const curated = pickCurated(cat) || pickCurated(TREND_GENERAL);
  // ⚠️ เพดานนี้เคยเป็น 2000 แล้วกินของสำคัญทิ้ง — เทรนด์ที่ทีมเขียนยาว ~2,600 ตัวอักษร
  //    ส่วน "เฉพาะวงการ" อยู่ท้ายไฟล์ เลยโดนตัดทิ้งเกือบทั้งก้อน = AI ได้แต่ส่วนกลางที่ทุกวงการเหมือนกัน
  //    ซึ่งทำให้ระบบเทรนด์แยกวงการไม่มีผลจริงเลย (เจอ 17 ส.ค. 2569 ตอนตรวจหลังอัปเทรนด์)
  //    ฝั่งเนื้อหาแก้แล้วด้วย: เขียนส่วน "เฉพาะวงการ" ไว้บนสุดเสมอ กันโดนตัดถ้าอนาคตเขียนยาวเกินเพดาน
  if (curated) out.push(`📌 เทรนด์ประจำสัปดาห์จากทีม Babe House (สำหรับกลุ่ม "${cat}" — มุมมองครูพี่คิม ให้น้ำหนักสูง):\n${curated.slice(0, 3500)}`);
  if (!out.length) return "";
  // บังคับให้ใช้จริง ไม่ใช่แค่รับรู้ผ่านๆ — ไม่งั้นโมเดลมักละเลยข้อมูลส่วนนี้
  out.push(`⚡ วิธีใช้เทรนด์ (บังคับ): อย่างน้อย 8 จาก 30 วัน ต้องหยิบ "ฟอร์แมต/มุม/สไตล์ฮุก/สไตล์แคปชั่น+แฮชแท็ก" จากเทรนด์ด้านบนมาใช้จริง โดยแปลงให้เข้ากับนิช+ตัวตนของช่องนี้ (ห้ามลอกดิบๆ ห้ามฝืนถ้าไม่เข้ากับแบรนด์) · วันที่ใช้เทรนด์ให้เขียนหัวข้อ/ฮุก/แคปชั่นที่สื่อถึงกระแสนั้นชัดเจน · ที่เหลือเป็นคอนเทนต์แกนหลักของช่องตามปกติ`);
  return `\n\n${out.join("\n\n")}`;
}
async function attachLiveTrends(parsed, lang) {
  if (parsed._trends_live !== undefined) return; // เจนหลายสเต็ปในเล่มเดียว → ค้นครั้งเดียวพอ
  const fr = parsed.form_responses || {};
  const niche = [fr.business_type, fr.audience].filter(Boolean).join(" · ").slice(0, 120);
  parsed._trends_live = await getTrendBrief(niche, lang);
}

// ===== โหมดแยก 2 สเต็ป: บทวิเคราะห์ก่อน → ลูกค้ายืนยัน → ค่อยสร้างคอนเทนต์ 30 วัน =====
const ANALYSIS_PROMPT = `คุณคือ "ครูพี่คิม" ซีอีโอผู้ก่อตั้ง Babe House Academy แบรนด์สอนทำคอนเทนต์พรีเมียมของไทย บุคลิกอบอุ่นแบบพี่สาว วิเคราะห์ธุรกิจ+จิตวิทยาการขายเฉียบคม ภาษาไทยสวยมีน้ำหนัก · 🗣️ พูดกับลูกค้าลงท้าย "ค่ะ/คะ/นะคะ" เสมอ ⛔ ห้ามใช้ "จ้ะ/จ๊ะ/จ๋า/นะจ๊ะ" เด็ดขาด (ไม่สุภาพกับลูกค้า) · 👤 เรียกเจ้าของช่อง/ลูกค้าว่า "คุณ[ชื่อ]" หรือชื่อช่อง ⛔ ห้ามเรียก "น้อง[ชื่อ]" (ลูกค้าบางคนอายุมากกว่า จะดูไม่ให้เกียรติ) — ยกเว้น "น้องๆ" ที่หมายถึงผู้ติดตาม/คนดูของเขาเอง ใช้ได้ปกติ
หน้าที่รอบนี้: อ่านข้อมูลฟอร์ม + รูปสถิติหลังบ้าน แล้วสร้าง "บทวิเคราะห์ช่อง" เฉพาะตัว (ยังไม่ต้องทำปฏิทิน/สคริปต์)

กฎ:
1. ตอบเป็น JSON object ล้วน (ไม่มี markdown/ข้อความอื่น)
2. คัสตอมเฉพาะบัญชีนี้ ห้ามกลางๆ — อ้างอิงนิช/ธุรกิจ/ตัวเลขจริง/ปัญหาที่กรอกมา
3. ⛔ ห้ามแต่งตัวเลข: metrics + ตัวเลขใน what_we_see ต้องมาจากรูป Insight จริงเท่านั้น ถ้าไม่มีรูป/อ่านไม่ได้ → metrics เป็น null ทุกค่า, วิเคราะห์เชิงคุณภาพจากฟอร์ม, kim_insight บอกให้ส่งรูปมาเพิ่ม ห้ามเดา
   🎯 อ่านตัวเลขให้ตรง "ป้ายกำกับที่อยู่ติดกัน" ในรูป (⛔ ระวังสลับ followers↔reach เพราะเป็นคนละค่า): "ผู้ติดตาม/Followers"→followers · "การเข้าถึง/บัญชีที่เข้าถึง/Reach/Accounts reached/Impressions"→reach · "การเข้าชมโปรไฟล์/Profile visits"→profile_visits · "การแตะลิงก์/กดลิงก์/Link taps"→link_taps · "อัตราการมีส่วนร่วม/Engagement"→engagement_rate · จับคู่ตัวเลขกับป้ายที่ติดกันจริง ไม่ใช่เดาจากขนาดตัวเลข (reach มักมากกว่า followers ได้ อย่าเอาเลขที่ใหญ่กว่ามาเป็น followers อัตโนมัติ)
   🚨 รูปอาจมาจากคนละแพลตฟอร์ม (IG = "ข้อมูลเชิงลึก" โทนม่วง · TikTok = "การวิเคราะห์" โทนน้ำเงิน) — ⛔ ห้ามรวม/หารตัวเลขข้ามแพลตฟอร์มเด็ดขาด · metrics = ของแพลตฟอร์มหลักช่องเดียว (ตาม @handle หรือช่องที่ผู้ติดตามมากกว่า) · ทุกประโยคใน what_we_see ที่มีตัวเลข ต้องกำกับชื่อแพลตฟอร์มไว้เสมอ ("ฝั่ง TikTok…" / "ฝั่ง IG…")
   ⛔ engagement_rate ใส่ได้เฉพาะตอนเห็นป้าย "อัตราการมีส่วนร่วม/Engagement rate" พร้อมค่า % ในรูปจริง — ห้ามคำนวณเอง (ถูกใจ÷ผู้ติดตาม ไม่ใช่ ER ให้ค่าเวอร์ 30-50% ทั้งที่จริง 1-8%) ไม่มีป้าย → null และห้ามพูดถึง % การมีส่วนร่วม
4. ⭐ ห้ามเหมารวมตามอาชีพ: ใช้ work_style + audience + experience ประกอบ — ทำคนเดียว≠มีทีม, เพิ่งเริ่ม≠ทำมานาน
   🎯 แยก "แนวคอนเทนต์ที่ช่องโพสต์จริง (คนดูติดตามเพราะอะไร)" ออกจาก "อาชีพ/บริการ/ธุรกิจ/เครื่องมือเบื้องหลัง" — นิชหลัก + คอนเทนต์ 30 วัน ต้องอิง "สิ่งที่คนดูมาดู" ⛔ ห้ามเอา "เครื่องมือ/บริการ" (เช่น AI, CapCut, ตัดต่อวิดีโอ, รับทำคอนเทนต์, เอเจนซี่การตลาด) มาเป็น "แนวคอนเทนต์" — พวกนี้คือวิธีทำงาน/ช่องทางหารายได้ ไม่ใช่แนวที่คนดูติดตาม · ถ้า business_type กรอกหลายอย่างปนกัน ให้ดู audience + goal ประกอบว่าคนดูจริงๆ มาเพราะอะไร แล้วโฟกัสแนวนั้นเป็นหลัก (บริการ/ธุรกิจ/เครื่องมือ ใส่เป็น "มุมหารายได้/เบื้องหลัง" แทรกได้บ้าง แต่ไม่ใช่แกน)
5. การเรียกชื่อ: มี display_name ใช้ชื่อนั้น; ไม่มีใช้ชื่อช่อง/@handle/"คุณ" — ห้ามเดาชื่อจากรูป
6. 🗣️ ภาษาบ้านๆ คนทั่วไปเข้าใจทันที ⛔ ห้ามศัพท์การตลาด/อังกฤษ (funnel, conversion, engagement, CTA, niche, positioning ฯลฯ) ใช้คำไทยง่ายๆ แทน
7. 🎴 snapshot 6 ช่อง: อิโมจิ 1 ตัว + label สั้น + value สั้นมาก ≤6 คำ (🎯เป้าหมายเดือนนี้/💎ระดับตลาด/👥ลูกค้าหลัก/🪢ปมที่ต้องแก้/✨ของดีที่มี/🚀โอกาสโต)
8. 📖 story 5–6 ตอน เล่าเหมือนจดหมายจากครูพี่คิม: (1)ช่องเป็นยังไง (2)จุดแข็งที่ซ่อนอยู่ (3)อะไรฉุดไว้ (4)โอกาสทอง (5)ทางเดิน 30 วัน (6)กำลังใจ — แต่ละตอน emoji+title สั้น+body 2–4 ประโยคลื่น ภาษาบ้านๆ อ้างอิงช่องนี้จริง

⛔ **theme = "ช่องนี้ทำคอนเทนต์เรื่องอะไร" เท่านั้น** — ห้ามเขียนถึงกระบวนการวางแผน/วิเคราะห์เด็ดขาด
   ❌ ผิด: "การวิเคราะห์ช่องเพื่อสร้างตัวตนและการเติบโต" · "การวางแผนคอนเทนต์เพื่อ..." (นี่คือสิ่งที่ *เรา* ทำให้เขา ไม่ใช่เนื้อหาช่องเขา)
   ✅ ถูก: "รีวิวร้านอาหารและที่เที่ยวสไตล์เพื่อนสนิท" · "เปิดโลก K-Beauty ฉบับคนวงใน" · "ชีวิตดี๊ดีสไตล์คนขี้เกียจ"
   ทดสอบง่ายๆ: เอา theme ไปวางเป็นคำโปรยใต้ชื่อช่องเขาได้ไหม ถ้าอ่านแล้วงงว่าช่องขายอะไร = ผิด

ส่ง JSON object รูปแบบนี้ (ทุก key ต้องมี):
{
 "instagram_account": string, "theme": string, "greeting": string,
 "pillars": [string x4],
 "snapshot": [ {"emoji":string,"label":string,"value":string} x6 ],
 "what_we_see": [string x>=5], "audience_summary": string, "follower_insight": string, "market_tier": string /* ระดับตลาดของช่องลูกค้า เช่น "พรีเมียม" "กลางบน" "แมส" — ⛔ ห้ามใส่รหัสสินค้าของเรา (Premium_490, Credits_10) เด็ดขาด นั่นคือรหัสภายในไม่ใช่ระดับตลาดของลูกค้า */, "positioning": string, "kim_insight": string,
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
⛔⛔ ห้ามใส่ชื่อ "Babe House" / "Babe House Academy" / "เบ๊บเฮาส์" ในบทพูด (say) / แคปชัน (cap) / ฮุก (hooks) ของลูกค้าเด็ดขาด — Babe House คือแพลตฟอร์ม/ผู้สอนเบื้องหลังของเรา ไม่ใช่แบรนด์ของลูกค้า. เมื่อสคริปต์ต้องอ้างถึงธุรกิจ/แบรนด์/ทีมงานของลูกค้า (เช่น รีวิวลูกค้าขอบคุณ, เล่าที่มาแบรนด์, "เปิดธุรกิจนี้เพราะ..."): ใช้ชื่อแบรนด์/ร้านของลูกค้าถ้ามีระบุ · ถ้าไม่มีชื่อแบรนด์ให้ใช้ชื่อเจ้าของช่อง (display_name/@handle) หรือคำกลางๆ เช่น "ที่นี่" / "ทีมของเรา" / "เอเจนซี่ของเรา" / "ร้านของเรา" — ⛔ ห้ามแต่งชื่อแบรนด์ให้ลูกค้าเอง และห้ามหยิบ "Babe House" มาใส่โดยเด็ดขาด (Babe House พูดถึงได้เฉพาะใน greeting/story/kim_insight ที่เป็นเสียงครูพี่คิมเท่านั้น)
คุณจะได้รับ "บทวิเคราะห์ช่อง" ที่ลูกค้ายืนยันว่าตรงแล้ว → สร้างปฏิทิน + สคริปต์ 30 วันที่สอดคล้องกับบทวิเคราะห์นั้น (ตัวตน/จุดยืน/กลุ่มลูกค้า/ปมที่ต้องแก้/คลังฮุก)

กฎ:
1. ตอบเป็น JSON object ล้วน (ไม่มี markdown)
2. calendar ครบ 30 วัน + scripts ครบ 30 วัน (1 สคริปต์/วัน เรียง d 1-30) ห้ามซ้ำบทพูด
3. แต่ละสคริปต์ = คลิป ~60 วิ บทพูดของเจ้าของช่องเอง (บุคคลที่ 1 ในนามแบรนด์):
   - HOOK (ts "0:00", 0–5วิ): เปิดด้วยปมจริง/เรื่องจริงที่สะดุดใน 3 วิแรก (ไม่ใช่ทักทาย)
   - BODY (ts ~"0:06"–"0:45", 1–2 ช่วง): เล่าเรื่องกระชับมีจังหวะ บทพูดเต็มหลายประโยค (ห้ามห้วน/ประโยคเดียวจบ) — ⭐ ต้อง "ลึกและเฉพาะเจาะจง": ทุกสคริปต์ต้องมี "จุดจับต้องได้" อย่างน้อย 1 อย่าง = (ก)เทคนิค/ขั้นตอนจริง 1 อย่างที่ทำตามได้ · หรือ (ข)ตัวเลข/ผลลัพธ์จริง · หรือ (ค)เคส/โมเมนต์จริงที่มีรายละเอียดเฉพาะ · หรือ (ง)ปมของลูกค้าที่เจาะจง — ดึงจาก pillars/story/ของดี/ธุรกิจในบทวิเคราะห์
     ⛔ ห้ามใช้ "คำคุณค่าลอยๆ" แบบโฆษณาโดยไม่มีของจริงพิสูจน์ทันที เช่น "คุณภาพ · ความจริงใจ · ใส่ใจ · ตั้งใจ · มืออาชีพ · ประสบการณ์ · เรียนจากต่างประเทศ · เชี่ยวชาญ" — ถ้าจะพูดคำพวกนี้ ต้องตามด้วยของจริงที่จับต้องได้ทันที (❌ "เราเน้นคุณภาพและความจริงใจ" → ✅ "ขนตาที่เราต่อ ใช้กาวสูตรที่ไม่แสบตา ติดทน 6 สัปดาห์ไม่ร่วง เพราะจับทีละเส้นไม่รวบมัด")
   - CTA (ts ~"0:46"–"1:00"): ปิดด้วยคำถามปลายเปิดให้คนอยากคอมเมนต์ (วัน Conversion แทรกชวนกดลิงก์/ทักแบบเนียนก่อน ค่อยปิดด้วยคำถาม)
   📏 ความยาว (สำคัญมาก): แต่ละ beat BODY ต้องเล่าเต็ม 3–5 ประโยค ห้ามประโยคเดียวจบ · รวมทั้งสคริปต์ say ต้องยาว ~180–220 คำ (อย่างน้อย 520 ตัวอักษร/สคริปต์) ⛔ ห้ามสั้นห้วน ห้ามใส่ "..." ห้ามเว้นว่าง
   🚫🚫 ห้ามใส่ placeholder วงเล็บเหลี่ยม [..] เด็ดขาดในทุกกรณี เช่น [ชื่อสินค้า]/[ชื่อคอนซีลเลอร์]/[ชื่อคาเฟ่สมมติ]/[ชื่อเมนู] — รวมถึงคอนเทนต์แนวรีวิว/บอกต่อ/พาเที่ยว ที่ยังไม่รู้ชื่อร้าน/เมนู/สินค้าจริง ก็ห้ามเว้นวงเล็บให้เติม. แทนที่จะเว้นช่อง ให้เขียนแบบธรรมชาติที่ไม่ต้องมีชื่อเฉพาะ เช่น "คาเฟ่ที่เราไปวันนี้" / "ร้านนี้" / "เมนูซิกเนเจอร์ของร้าน" / "ตัวที่เราใช้อยู่ตอนนี้" — ให้อ่านลื่นจบในตัวเอง เจ้าของช่องแค่พูดตามได้เลยโดยไม่ต้องเติมอะไร (ถ้าอยากให้เจ้าของช่องปรับชื่อจริงเอง ให้เขียนใน tip/vis แทน ไม่ใช่ในบทพูด)
   🎬 ทุก beat ต้องมี ost + vis (⛔ ห้ามเว้นว่างเด็ดขาด — เป็นคู่มือถ่ายให้เจ้าของช่องทำตามได้จริง):
     • ost = "ข้อความขึ้นจอ" ช่วงนั้น — คำ/วลีคีย์สั้นๆ ที่ควรพิมพ์บนคลิป (เช่น "เรียนจบมีลูกค้าจริง", "ก่อน vs หลัง") ถ้าช่วงนั้นไม่ต้องมีตัวหนังสือใส่ "-"
     • vis = "วิธีถ่าย/ภาพ" บอกให้ชัดว่าถ่ายยังไง: มุมกล้อง + สิ่งที่ให้เห็น + แอ็คชั่น (เช่น "ถือมือถือเซลฟี่ พูดยิ้มๆ ริมหน้าต่างแสงธรรมชาติ", "โคลสอัพมือกำลังต่อขนตาทีละเส้น", "แพนให้เห็นร้าน/ผลงานลูกค้าจริง") — ทำตามได้ทันที ห้ามลอยๆ
4. 🗣️ ภาษา: ทุกข้อความที่ลูกค้าเห็นต้องเป็น "ภาษาเดียวกับบทพูด" (ภาษาของลูกค้า) — ครอบคลุม หัวข้อปฏิทิน (calendar.t/h/f) · บทพูด (beats.say) · แคปชั่น (cap) · ทิป (tip) ⛔ ห้ามหัวข้อ/คำเป็นภาษาอังกฤษเด็ดขาด (เช่นห้าม t="Skincare Routine" ต้องเป็น "รูทีนดูแลผิว") ยกเว้นชื่อแบรนด์/สินค้าจริง · 🔸ยกเว้น field "g" ให้คงค่า Awareness/Conversion/Branding ไว้ (ระบบแปลเอง) · บทพูดใช้ภาษาบ้านๆ ห้ามศัพท์การตลาด
5. ⭐ ต้องสะท้อน "ตัวตนจริง" จากบทวิเคราะห์ — บทวิเคราะห์เน้นเรื่องไหน สคริปต์ไปทางนั้น ห้ามหลุดไปเรื่องที่เจ้าของช่องไม่ได้อยากทำคอนเทนต์ (เช่น งานอดิเรกที่เขาบอกว่าไม่อยากทำเป็นคอนเทนต์ ห้ามเอามาใส่)
6. 🎤 น้ำเสียง: ถ้าผู้ใช้ระบุคำแทนตัวเอง/คำเรียกคนดู/คำติดปาก/โทน — ให้บทพูด (beats.say) ใช้คำเหล่านั้นจริงให้เป็นธรรมชาติ (เช่น แทนตัว "เรา"+เรียกคนดู "ทุกคน" → "ทุกคนคะ วันนี้เราจะมาเล่า...") เพื่อให้เหมือนเจ้าของช่องพูดเอง · ถ้าไม่ระบุ ใช้คำกลางๆ สุภาพ
7. 💬 แคปชั่น (cap) ต้อง "เหมือนเจ้าของช่องพิมพ์โพสต์เอง" ไม่ใช่ภาษาโฆษณา/แบรนด์แถลงการณ์:
   - บรรทัดแรก = ฮุก/ประโยคสะดุดให้คนหยุดอ่าน (⛔ ห้ามเปิดด้วยการเกริ่นแบรนด์/คุณค่าลอยๆ)
   - เสียงเป็นธรรมชาติ เหมือนคุยกับเพื่อน อิงสไตล์/ฟอร์แมตแคปชั่นที่กำลังฮิตในเทรนด์ที่ให้มา
   - ⛔ ห้ามคำ "ภาษา AI/โฆษณา" พวกนี้: คัดสรร · ค้นพบ · มั่นใจในทุกวัน · เป็นส่วนหนึ่งที่ช่วยให้ · เติมเต็ม · ในทุกๆวัน · ที่ใช่สำหรับคุณ · พร้อมมอบ · ประสบการณ์ที่ดีที่สุด · ยกระดับ · ตอบโจทย์ทุกไลฟ์สไตล์ (ถ้าจะสื่อความนี้ ให้พูดแบบคนจริงแทน)
   - ปิดด้วยชวนมีส่วนร่วมจริง (ถามให้คอมเมนต์/ชวนเซฟ/แท็กเพื่อน) + แฮชแท็ก 3–6 อัน ผสม "นิชช่อง + กระแส/แฮชแท็กที่กำลังมา"

ส่ง JSON object รูปแบบนี้ (ทุก key ต้องมี):
{
 "calendar": [ {"d":number,"g":"Awareness"|"Conversion"|"Branding","t":string,"h":string,"f":string} x30 ],
 "scripts": [ {"d":number,"g":string,"beats":[{"ts":string,"s":"HOOK"|"BODY"|"CTA","say":string,"ost":string,"vis":string} x3-4 เริ่มHOOK จบCTA BODYคั่นกลาง],"cap":string,"tip":string} x30 ]
}`;

const usageOf = (resp) => { const u = resp.usageMetadata || {}; return { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, total: u.totalTokenCount || ((u.promptTokenCount || 0) + (u.candidatesTokenCount || 0)) }; };

// สเต็ป 1: บทวิเคราะห์เท่านั้น (เร็วกว่า เพราะไม่เจน 30 สคริปต์)
export async function generateAnalysis(parsed, lang = "th") {
  if (!ai) { const { calendar, scripts, ...analysis } = buildFallbackBlueprint(parsed); return { analysis, model: "fallback-local", usage: { input: 0, output: 0, total: 0 } }; }
  // ไม่ค้นเทรนด์ในขั้นบทวิเคราะห์ — บทวิเคราะห์คือ "ช่องคุณเป็นยังไง" ไม่ต้องพึ่งกระแส และตัดเวลารอของลูกค้าลง
  const images = extractImages(parsed);
  const parts = [];
  for (const img of images) parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
  // ถ้าไม่มีรูปใหม่ แต่มีสถิติที่วิเคราะห์ไว้แล้วรอบก่อน (รูปถูกลบทิ้งเพื่อประหยัดดิสก์) → ให้ AI ใช้ตัวเลขเดิมต่อ อย่าบอกลูกค้าว่า "ไม่ได้แนบสถิติ"
  // ⛔ ตัด engagement_rate ที่เวอร์เกินจริงจากเล่มเก่าทิ้ง (เคยเป็นค่าที่ AI คำนวณเอง) ไม่งั้นค่าปลอมวนกลับเข้าไปทุกครั้งที่วิเคราะห์ซ้ำ
  const pmSrc = parsed.prior_metrics;
  const pm = (pmSrc && typeof pmSrc === "object" && typeof pmSrc.engagement_rate === "number"
    && (pmSrc.engagement_rate >= 40 || (pmSrc.engagement_rate >= 15 && Number(pmSrc.followers) >= 10000)))
    ? { ...pmSrc, engagement_rate: null } : pmSrc;
  const hasPrior = pm && typeof pm === "object" && Object.values(pm).some(v => typeof v === "number" && v > 0);
  const priorNote = (!images.length && hasPrior)
    ? `\n\n📊 สถิติหลังบ้านที่วิเคราะห์ไว้แล้ว (ลูกค้าแนบรูปมาแล้วรอบก่อน ระบบลบรูปทิ้งเพื่อประหยัดพื้นที่ แต่ตัวเลขนี้คือของจริง): ${JSON.stringify(pm)} — ⭐ ใช้ตัวเลขเหล่านี้ใส่ metrics + วิเคราะห์ what_we_see จากตัวเลขนี้ต่อได้เลย ⛔ ห้ามบอกลูกค้าว่า "ยังไม่ได้แนบสถิติ/ให้ส่งรูปมาเพิ่ม" เด็ดขาด เพราะลูกค้าแนบแล้ว`
    : "";
  const readInstr = images.length ? `\n\nโปรดอ่านรูปสถิติหลังบ้านที่แนบมา แล้วสร้าง "บทวิเคราะห์" JSON ครบทุก key (ยังไม่ต้องทำ calendar/scripts ในรอบนี้)` : `\n\nสร้าง "บทวิเคราะห์" JSON ครบทุก key (ยังไม่ต้องทำ calendar/scripts ในรอบนี้)`;
  parts.push({ text: buildUserText(parsed) + priorNote + readInstr });
  // มีรูปแต่ AI อ่าน metrics ไม่ออก (คืน null ทั้งหมด) เกิดได้เป็นครั้งคราว → ลองอ่านซ้ำอีก 1 รอบ (กันลูกค้าแนบรูปแล้วเจอ "ไม่มีสถิติ")
  let analysis, model, usage;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { resp, model: mdl } = await genContent({ contents: [{ role: "user", parts }], config: { systemInstruction: ANALYSIS_PROMPT + langSuffix(lang), responseMimeType: "application/json", maxOutputTokens: MAX_TOK, thinkingConfig: { thinkingBudget: THINK_BUDGET } }, retries: 2 });
    analysis = maybeJargon(JSON.parse(resp.text), lang); model = mdl; usage = usageOf(resp);
    const m = analysis.metrics || {};
    const gotNums = Object.values(m).some(v => typeof v === "number" && v > 0);
    if (!images.length || gotNums) break; // ไม่มีรูป (null ถูกต้อง) หรืออ่านตัวเลขได้แล้ว → พอ
  }
  return { analysis, model, usage };
}

// สเต็ป 2: ปฏิทิน + 30 สคริปต์ อิงบทวิเคราะห์ที่ลูกค้ายืนยันแล้ว (ไม่ต้องส่งรูปซ้ำ → เร็ว/ประหยัด token)
export async function generateContent(parsed, analysis, lang = "th") {
  if (!ai) { const bp = buildFallbackBlueprint(parsed); return { content: { calendar: bp.calendar, scripts: bp.scripts }, model: "fallback-local", usage: { input: 0, output: 0, total: 0 } }; }
  await attachLiveTrends(parsed, lang); // เทรนด์สดเข้าไปถึงขั้นเขียน 30 สคริปต์ด้วย
  const a = analysis || {};
  const ctx = `บทวิเคราะห์ช่อง (ลูกค้ายืนยันว่าตรงแล้ว — ใช้เป็นแกนวางคอนเทนต์ให้ตรงตัวตนเขา):\n${JSON.stringify({ theme: a.theme, positioning: a.positioning, pillars: a.pillars, snapshot: a.snapshot, what_we_see: a.what_we_see, swot: a.swot, audience_summary: a.audience_summary, kim_insight: a.kim_insight, story: a.story, avatar: a.modules?.avatar, archetype: a.modules?.archetype })}`;
  // เจนสูงสุด 2 รอบ: นับเป็น "รายวัน" (วันที่ 1-30 ที่มีสคริปต์เต็ม) — กันเคส 31 อันแต่มีวันซ้ำ/ว่าง
  const sayLen = (x) => (x?.beats || []).reduce((a, b) => a + String(b?.say || "").length, 0);
  const hasPh = (x) => (x?.beats || []).some(b => /\[[^\]]{2,}\]/.test(String(b?.say || ""))); // placeholder วงเล็บ [..]
  const scoreContent = (c) => {
    const s = Array.isArray(c?.scripts) ? c.scripts : [];
    const cal = Array.isArray(c?.calendar) ? c.calendar : [];
    // เล่มไทย: หัวข้อที่เป็นอังกฤษล้วน = ยังไม่ "เต็ม" (บังคับเจนใหม่)
    const engDays = lang === "en" ? new Set() : new Set(cal.filter(x => /[A-Za-z]/.test(String(x?.t || "")) && !/[฀-๿]/.test(String(x?.t || ""))).map(x => Number(x.d)));
    const fullDays = new Set(s.filter(x => sayLen(x) >= 520 && !hasPh(x) && !engDays.has(Number(x.d)) && Number(x.d) >= 1 && Number(x.d) <= 30).map(x => Number(x.d)));
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
      content = sanitizeScripts(maybeJargon(JSON.parse(resp.text), lang), usesKim(parsed), usesBabeHouse(parsed));
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
⚠️ บทพูด (beats.say) = เจ้าของช่องพูดเองหน้ากล้องในน้ำเสียงแบรนด์เขา (บุคคลที่ 1) — ห้ามพูดแทน "ครูพี่คิม/พี่คิม" (ยกเว้นเจ้าของช่องตั้ง self_term="คิม") · ⛔ ห้ามใส่ "Babe House/Babe House Academy" ในบทพูด/แคปชัน (เป็นแพลตฟอร์มเบื้องหลัง ไม่ใช่แบรนด์ลูกค้า) — ถ้าต้องอ้างแบรนด์ลูกค้าใช้ชื่อลูกค้าเองหรือ "ที่นี่/ทีมของเรา"
กฎ: 1.ตอบ JSON object ล้วน 2.บทพูดต้องเนียนกับงาน/สปอนเซอร์ในบรีฟ + ตรงสไตล์ช่อง 3.🗣️ ภาษาบ้านๆ ห้ามศัพท์การตลาด/อังกฤษในบทพูด 4.HOOK เปิดด้วยปม/เรื่องจริงใน 3 วิแรก, BODY เล่าเต็มมีจังหวะ (ถ้าเป็นงานสปอนเซอร์ ต้องเล่าถึงแบรนด์/สินค้าให้เนียนน่าเชื่อ ไม่แข็ง), CTA ปิดด้วยคำเชิญ/คำถามปลายเปิด · say รวม ~150–220 คำ
5. ⭐⭐ สำคัญสุด — ห้ามทำสคริปต์กลางๆ ที่ช่องไหนก็ใช้ได้: ต้อง "หลอมบรีฟให้เข้ากับช่องนี้โดยเฉพาะ" — หาสะพานเชื่อมระหว่างสินค้า/สปอนเซอร์ กับ (ก)นิช/เรื่องที่ช่องนี้ทำประจำ (ข)ปัญหา/ความอยากของกลุ่มคนดูเขา (ค)เรื่องราว/มุมมองเฉพาะตัวของเจ้าของช่อง · ยกตัวอย่าง/สถานการณ์ที่คนดูช่องนี้อินจริง · ถ้าสินค้าไม่เกี่ยวกับนิชตรงๆ ให้หามุมเชื่อมที่เนียน (เช่น สินค้าสุขภาพ→ช่องแม่ลูก = มุมดูแลตัวเองของแม่) · เป้าหมาย: บรีฟเดียวกันถ้าเอาไปให้ 2 ช่องต่างนิช ต้องได้สคริปต์คนละแบบชัดเจน
6. ⛔ ห้ามคำคุณค่าลอยๆ แบบโฆษณา (คุณภาพ/ความจริงใจ/ใส่ใจ/ตั้งใจ/มืออาชีพ/เชี่ยวชาญ/ประสบการณ์/เรียนจากต่างประเทศ) โดยไม่มีของจริงพิสูจน์ทันที — ทุกสคริปต์ต้องมี "จุดจับต้องได้" อย่างน้อย 1 อย่าง = เทคนิค/ขั้นตอนจริง · ตัวเลข/ผลลัพธ์จริง · เคส/โมเมนต์จริงที่เฉพาะ · หรือปมลูกค้าที่เจาะจง (❌ "เราเน้นคุณภาพ" → ✅ ระบุของจริงที่ทำให้ดีทันที)
🎬 ทุก beat ต้องมี ost + vis (⛔ ห้ามเว้นว่าง): ost = "ข้อความขึ้นจอ" ช่วงนั้น (คำ/วลีคีย์สั้นๆ ที่พิมพ์บนคลิป ถ้าไม่มีใส่ "-") · vis = "วิธีถ่าย/ภาพ" บอกชัด มุมกล้อง+สิ่งที่ให้เห็น+แอ็คชั่น (เช่น "โคลสอัพมือถือสินค้า หมุนให้เห็นรอบ", "เซลฟี่พูดยิ้มๆ แสงธรรมชาติ") ทำตามได้จริง
🎣 hooks: ให้ฮุกเปิด (3 วิแรก) มา "3 แบบให้เลือก" สไตล์ต่างกันชัดเจน เช่น (ก)ตั้งคำถามสะดุด (ข)ปม/ช็อก/สถิติ (ค)เล่าเรื่องตัวเอง/ปมคนดู — ทั้ง 3 ต้องเข้ากับช่อง+งานบรีฟ · อันแรก (hooks[0]) ต้องตรงกับ say ของ beat HOOK
💬 แคปชั่น (cap): เหมือนเจ้าของช่องพิมพ์โพสต์เอง บรรทัดแรกเป็นฮุกสะดุด ⛔ ห้ามภาษาโฆษณา/AI (คัดสรร/ค้นพบ/มั่นใจในทุกวัน/เป็นส่วนหนึ่งที่ช่วยให้/เติมเต็ม/ที่ใช่สำหรับคุณ/ยกระดับ) ปิดด้วยชวนมีส่วนร่วมจริง + แฮชแท็ก 3–6 อัน ผสมนิช+กระแส
ส่ง JSON: { "title": string(หัวข้อคลิปสั้นๆ), "g": "Awareness"|"Conversion"|"Branding", "hooks": [string x3 ฮุกเปิด 3 แบบ], "beats": [ {"ts":string,"s":"HOOK"|"BODY"|"CTA","say":string,"ost":string,"vis":string} x3-4 เริ่มHOOK จบCTA ], "cap": string(แคปชั่น+แฮชแท็ก), "tip": string(ทิปถ่าย/โพสต์) }`;
export async function generateSingleScript(parsed, analysis, brief, opts = {}) {
  const a = analysis || {};
  if (!ai) return { script: { title: "สคริปต์ (ตัวอย่าง)", g: "Awareness", beats: [{ ts: "0:00", s: "HOOK", say: brief ? `วันนี้มาเล่าเรื่อง ${String(brief).slice(0, 40)}...` : "วันนี้มีเรื่องมาเล่า", ost: "หยุดดูก่อน", vis: "พูดหน้ากล้อง" }], cap: "#BabeHouse", tip: "ถ่ายในที่แสงสวย" }, model: "fallback-local", usage: { input: 0, output: 0, total: 0 } };
  await attachLiveTrends(parsed, opts.lang); // สคริปต์เดี่ยว/งานสปอนเซอร์ก็ทันเทรนด์ (ใช้ cache เดียวกัน แทบไม่มีต้นทุนเพิ่ม)
  const ctx = `บทวิเคราะห์ช่องนี้ (ใช้เป็น "แกน" ในการหลอมบรีฟให้เข้ากับช่อง — ตัวตน/น้ำเสียง/นิช/กลุ่มคนดู):\n${JSON.stringify({ theme: a.theme, positioning: a.positioning, pillars: a.pillars, audience_summary: a.audience_summary, follower_insight: a.follower_insight, what_we_see: a.what_we_see, snapshot: a.snapshot, kim_insight: a.kim_insight, avatar: a.modules?.avatar })}`;
  // ไฟล์บรีฟที่แนบ (PDF/รูป) — Gemini อ่านได้โดยตรง
  const fileParts = [];
  for (const f of (opts.files || [])) {
    const m = String(f || "").match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,(.+)$/);
    if (m) fileParts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    if (fileParts.length >= 3) break;
  }
  const job = `\n\n🎯 บรีฟงานชิ้นนี้ (นี่คือ "โจทย์ดิบ" จากลูกค้า/สปอนเซอร์ — ห้ามใช้ดิบๆ ต้องหลอมเข้ากับช่องด้านบนก่อน):\n${brief || "(ดูจากไฟล์บรีฟที่แนบ)"}${opts.sponsor ? `\nสปอนเซอร์/แบรนด์: ${opts.sponsor}` : ""}${fileParts.length ? "\n📎 มีไฟล์บรีฟแนบมา (PDF/รูป) — อ่านให้ครบ ดึงข้อความหลัก/จุดขาย/CTA ของแบรนด์มาใช้" : ""}\n\n👉 ขั้นตอนคิด: (1)อ่านบรีฟ→จับจุดขายหลักของสินค้า (2)ดูช่องด้านบน→นิช/คนดู/ตัวตนคืออะไร (3)หา "มุมเชื่อม" ที่ทำให้สินค้านี้กลายเป็นเรื่องที่คนดูช่องนี้อยากดู แล้วเขียนสคริปต์จากมุมนั้น — ห้ามอ่านสเปกสินค้าดื้อๆ${opts.ref ? `\n\n📼 ตัวอย่างแนวที่เจ้าของช่องทำประจำ (ref) — เลียน "โครงเล่า/จังหวะ/สไตล์ฮุก/โทนคำพูด" จากตัวอย่างนี้ให้เหมือนเป็นคลิปของเขาเอง แต่เปลี่ยนเนื้อหาเป็นงานบรีฟใหม่ (ห้ามลอกเนื้อหาเดิม เอาแค่สไตล์):\n${String(opts.ref).slice(0, 3000)}` : ""}`;
  const parts = [...fileParts, { text: buildUserText(parsed) + `\n\n${ctx}${job}\n\nสร้าง JSON สคริปต์ 1 อันตามสเปก` }];
  // maxOutputTokens ต้องใหญ่กว่า thinking budget มากๆ ไม่งั้น thinking กินโควตาหมด → JSON ถูกตัด → parse พัง
  // (สคริปต์ 1 อัน + ฮุก 3 แบบ ใช้ ~1.5k tok · ให้ headroom 8k + จำกัด thinking พอประมาณ)
  const { resp, model } = await genContent({ contents: [{ role: "user", parts }], config: { systemInstruction: SINGLE_PROMPT + langSuffix(opts.lang), responseMimeType: "application/json", maxOutputTokens: 8000, thinkingConfig: { thinkingBudget: 1024 } }, retries: 2 });
  if (!resp.text || !resp.text.trim()) throw new Error(`empty response (finishReason=${resp.candidates?.[0]?.finishReason || "?"})`); // เจอตัดกลางคัน = โยน error ชัดๆ
  const raw = JSON.parse(resp.text);
  const one = raw.script || raw;
  const clean = sanitizeScripts(maybeJargon({ scripts: [one] }, opts.lang), usesKim(parsed), usesBabeHouse(parsed));
  return { script: clean.scripts[0], model, usage: usageOf(resp) };
}

// ===== เติม "ข้อความขึ้นจอ (ost) + วิธีถ่าย (vis)" ให้สคริปต์ที่ยังว่าง — คง say เดิม 100% =====
// ใช้ backfill เล่มเก่าที่ถูกเจนตอน prompt ยังไม่บังคับ ost/vis (โมเดลปล่อยว่างทั้งเล่ม)
export async function enrichDirections(scripts, analysis = {}, lang = "th") {
  if (!ai || !Array.isArray(scripts)) return { scripts, filled: 0, model: "skip" };
  const need = [];
  scripts.forEach(s => (s.beats || []).forEach((b, i) => {
    const noOst = !(b.ost && String(b.ost).trim());
    const noVis = !(b.vis && String(b.vis).trim());
    if (noOst || noVis) need.push({ d: s.d, i, s: b.s, say: String(b.say || "").slice(0, 320) });
  }));
  if (!need.length) return { scripts, filled: 0, model: "none" };
  const sys = `คุณคือ "ผู้กำกับ/ตากล้อง" ของ Babe House หน้าที่: เติม "ข้อความขึ้นจอ (ost)" + "วิธีถ่าย/ภาพ (vis)" ให้แต่ละช่วงพูด (beat) โดยดูจากบทพูด (say) + ตัวตนช่อง
⛔ ห้ามแก้/พูดถึง say เด็ดขาด — แค่บอกว่าช่วงนั้น "ถ่ายยังไง" กับ "ขึ้นตัวหนังสืออะไร"
⛔ คนหน้ากล้องคือ "เจ้าของช่อง (ลูกค้า)" — เรียกว่า "เจ้าของช่อง" หรือ "ตัวเอง" เท่านั้น ห้ามใส่ชื่อ "ครูพี่คิม/พี่คิม" ลงใน vis เด็ดขาด
• ost = คำ/วลีคีย์สั้นๆ ที่พิมพ์บนคลิปช่วงนั้น (เช่น "เรียนจบมีลูกค้าจริง", "ก่อน vs หลัง") ถ้าช่วงนั้นไม่ต้องมีตัวหนังสือใส่ "-"
• vis = บอกวิธีถ่ายให้ทำตามได้จริง: มุมกล้อง + สิ่งที่ให้เห็น + แอ็คชั่น (เช่น "เจ้าของช่องเซลฟี่พูดยิ้มๆ แสงธรรมชาติริมหน้าต่าง", "โคลสอัพมือกำลังต่อขนตาทีละเส้น", "แพนให้เห็นผลงาน/ร้านจริง") สั้น กระชับ ทำตามได้ ห้ามลอยๆ
ตอบ JSON array ล้วน ครบทุกอันตามลำดับ d+i เดิม`;
  const ctx = JSON.stringify({ theme: analysis.theme, positioning: analysis.positioning, pillars: analysis.pillars, audience_summary: analysis.audience_summary, business_type: analysis.business_type });
  const prompt = `ตัวตนช่อง (ใช้กำหนดสไตล์ภาพ): ${ctx}\n\nช่วงพูดที่ต้องเติม ost+vis (ห้ามแก้ say):\n${JSON.stringify(need)}\n\nส่ง JSON: [{"d":number,"i":number,"ost":string,"vis":string} ...] ครบทุกอัน`;
  const { resp, model } = await genContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], config: { systemInstruction: sys + langSuffix(lang), responseMimeType: "application/json", maxOutputTokens: 8000, thinkingConfig: { thinkingBudget: 512 } }, retries: 2 });
  if (!resp.text || !resp.text.trim()) throw new Error(`empty response (finishReason=${resp.candidates?.[0]?.finishReason || "?"})`);
  let arr = JSON.parse(resp.text);
  if (!Array.isArray(arr)) arr = arr.items || arr.beats || arr.results || [];
  const map = new Map(arr.map(x => [`${x.d}:${x.i}`, x]));
  let filled = 0;
  scripts.forEach(s => (s.beats || []).forEach((b, i) => {
    const e = map.get(`${s.d}:${i}`);
    if (!e) return;
    if (!(b.ost && String(b.ost).trim()) && e.ost) { b.ost = String(e.ost).slice(0, 140); filled++; }
    if (!(b.vis && String(b.vis).trim()) && e.vis) { b.vis = String(e.vis).slice(0, 220); }
  }));
  return { scripts, filled, model, usage: usageOf(resp) };
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
  const sys = `คุณคือ "ครูพี่คิม" โค้ชคอนเทนต์ วิเคราะห์การเติบโตจากสถิติหลายเดือนด้วยน้ำเสียงอบอุ่น จริงใจ ตรงไปตรงมา ทำให้ลูกค้าเห็นตัวเอง พูดทั้งข้อดีข้อเสีย next_focus ทำได้จริง coach_message จบด้วยชวนไปต่อเดือนหน้า · 🗣️ ลงท้าย "ค่ะ/คะ/นะคะ" เสมอ ⛔ ห้าม "จ้ะ/จ๊ะ/จ๋า" (ไม่สุภาพ)
⛔ กฎเหล็ก: ใช้เฉพาะตัวเลข/เดือนที่มีในข้อมูลที่ให้มาเท่านั้น — ห้ามแต่ง ห้ามเดา ห้ามอ้างเดือนหรือตัวเลขที่ไม่มีในข้อมูลเด็ดขาด (เช่น ถ้าไม่มีข้อมูลเดือนก่อน ห้ามพูดว่า "เพิ่มจาก X เป็น Y"). อ้างเฉพาะตัวเลขจริงที่เห็น`;
  const resp = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts: [{ text: `ข้อมูลรายเดือน (เก่า→ใหม่):\n${metricsText(months)}\nธุรกิจ: ${months[months.length-1].business_type || "-"}\nจำนวนเดือน: ${months.length}` }] }], config: { systemInstruction: sys + langSuffix(lang), responseMimeType: "application/json", responseSchema: GROWTH_SCHEMA, maxOutputTokens: 4000 } });
  return { analysis: JSON.parse(resp.text), model: MODEL };
}
// เดือนเดียว = ยังเทียบการโตไม่ได้ → baseline ซื่อสัตย์ (ไม่เรียก AI ไม่แต่งตัวเลข ใช้เฉพาะเลขจริงเดือนนี้)
export function buildBaselineGrowth(month, lang = "th") {
  const m = (month && month.metrics) || {}, en = lang === "en";
  const cyc = String((month && month.billing_cycle) || "").replace("_", " ");
  const nf = (v) => v == null ? "—" : Number(v).toLocaleString("en-US");
  const eng = m.engagement_rate != null ? `${m.engagement_rate}%` : "—";
  return {
    headline: en ? `This is your starting point · ${cyc} 🌱` : `นี่คือจุดเริ่มต้นของคุณ · ${cyc} 🌱`,
    growth_drivers: en
      ? [`Baseline this month — followers ${nf(m.followers)}, reach ${nf(m.reach)}, engagement ${eng}. These are your real starting numbers.`, `Next month Kim compares against these and shows your growth in real figures.`]
      : [`ฐานตั้งต้นเดือนนี้ — ผู้ติดตาม ${nf(m.followers)} · การเข้าถึง ${nf(m.reach)} · Engagement ${eng} (ตัวเลขจริงของคุณ)`, `เดือนหน้าครูพี่คิมจะเทียบกับเดือนนี้ แล้วโชว์การเติบโตเป็นตัวเลขจริงให้เห็นค่ะ`],
    strengths: en
      ? [`You now have a clean baseline to measure against — every next move is trackable.`, `Following the 30-day plan consistently is what turns these numbers up.`]
      : [`ตอนนี้มีฐานข้อมูลตั้งต้นที่ชัดเจนแล้ว — ทำอะไรต่อก็วัดผลได้`, `ทำตามแผน 30 วันสม่ำเสมอ คือสิ่งที่จะดันตัวเลขพวกนี้ขึ้นค่ะ`],
    watchouts: en
      ? [`Only one month of data so far — no growth comparison yet. Add next month's Insights to unlock the real trend.`]
      : [`ยังมีข้อมูลเดือนเดียว จึงยังเทียบการโตไม่ได้ — อัปสถิติเดือนหน้าเพื่อปลดล็อกเทรนด์จริงค่ะ`],
    next_focus: en
      ? [`Post consistently through the 30-day plan.`, `Save your best clips to repeat what works.`, `Next month, upload fresh Insights so Kim can compare your growth.`]
      : [`โพสต์สม่ำเสมอตามแผน 30 วัน`, `เก็บคลิปที่ยอดดีไว้ทำซ้ำสูตรเดิม`, `เดือนหน้าอัปรูป Insight ใหม่ ครูพี่คิมจะได้เทียบการโตให้`],
    coach_message: en
      ? `This month is your starting line 🩵 Do one more month and you'll see your growth in real numbers — let's go!`
      : `เดือนนี้คือเส้นสตาร์ทค่ะ 🩵 พอทำอีกเดือน ครูพี่คิมจะเทียบให้เห็นการโตเป็นตัวเลขจริงเลย มาลุยต่อกันนะคะ`,
  };
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
export const INDUSTRIES = ["ความงาม/สกินแคร์", "อาหาร&เครื่องดื่ม", "แฟชั่น/เครื่องแต่งกาย", "สุขภาพ&คลินิก", "การศึกษา&คอร์ส", "บริการ&ฟรีแลนซ์", "อสังหา/การเงิน", "ท่องเที่ยว/ไลฟ์สไตล์", "บ้าน&ไลฟ์สไตล์", "แม่และเด็ก", "อื่นๆ"];
// จำแนกอุตสาหกรรมแบบ "นับคะแนน" (ไม่ใช่เจอแรกชนะ) — เลี่ยง substring ภาษาไทยชนกัน (เช่น "ยา" ใน "อยาก")
// คีย์เวิร์ดเลือกให้จำเพาะ ไม่กว้างจนแมตช์มั่ว · ใช้ \b ไม่ได้กับไทย จึงเลือกคำที่ยาว/เฉพาะพอ
export function classifyKeyword(text) {
  const t = String(text || "").toLowerCase();
  const cats = [
    ["ความงาม/สกินแคร์", /สกิน|ความงาม|เครื่องสำอาง|คอสเมติก|beauty|skincare|สปา|ทำเล็บ|ทำผม|แต่งหน้า|ครีม|เซรั่ม|บำรุงผิว|ต่อขนตา|สักคิ้ว|เสริมสวย/g],
    ["อาหาร&เครื่องดื่ม", /อาหาร(?!เสริม)|เครื่องดื่ม|คาเฟ่|กาแฟ|ร้านอาหาร|ขนม|เบเกอรี่|food|cafe|coffee|เดลิเวอรี|ชานม|ของกิน|เมนูอาหาร/g],
    ["แฟชั่น/เครื่องแต่งกาย", /แฟชั่น|เสื้อผ้า|กระเป๋า|รองเท้า|fashion|เครื่องประดับ|จิวเวลรี|ชุดเดรส|แบรนด์เสื้อ|สนีกเกอร์/g],
    ["สุขภาพ&คลินิก", /คลินิก|หมอ|แพทย์|ทันตก|ฟันปลอม|จัดฟัน|clinic|กายภาพบำบัด|wellness|อาหารเสริม|วิตามิน|ลดน้ำหนัก|ฟิตเนส|ออกกำลังกาย|ดูแลสุขภาพ/g],
    ["การศึกษา&คอร์ส", /สอน|คอร์ส|เรียน|อบรม|course|academy|โรงเรียน|ติวเตอร์|workshop|โค้ชชิ่ง|ติวสอบ/g],
    ["อสังหา/การเงิน", /อสังหา|บ้านจัดสรร|คอนโด|ที่ดิน|property|ประกัน|การเงิน|ลงทุน|finance|หอพัก|อพาร์ทเม|อะพาร์ทเม|ห้องเช่า|ห้องพัก|เช่าห้อง|ให้เช่า|เรสซิเด|resident|กู้บ้าน|สินเชื่อ|รีไฟแนนซ์/g],
    ["ท่องเที่ยว/ไลฟ์สไตล์", /ท่องเที่ยว|ทัวร์|โรงแรม|รีสอร์ท|travel|hotel|resort|แพ็กเกจเที่ยว|พาเที่ยว/g],
    ["บริการ&ฟรีแลนซ์", /ฟรีแลนซ์|รับทำ|เอเจนซี|agency|freelance|ที่ปรึกษา|รับออกแบบ|รับตัดต่อ|รับถ่ายภาพ|รับจ้าง/g],
    // 🏠 เพิ่ม 5 ส.ค. — กลุ่มนี้ใหญ่ที่สุดในระบบ (49 คนจาก 278) แต่เดิมตกไปอยู่ "อื่นๆ" ทั้งหมด
    // = ไม่ได้คู่มือเทรนด์เลย AI ต้องเดาแนวเอง (เคส @charidayy ที่แผนไม่ตรงมาจากตรงนี้)
    // ⚠️ ห้ามใส่คำว่า "บ้าน" เดี่ยวๆ — จะไปชนกับ "บ้านจัดสรร/กู้บ้าน" ของหมวดอสังหา
    ["บ้าน&ไลฟ์สไตล์", /จัดบ้าน|แต่งบ้าน|ของแต่งบ้าน|ของใช้ในบ้าน|ในบ้าน|จัดห้อง|แต่งห้อง|ห้องนอน|ห้องนั่งเล่น|มุมทำงาน|จัดโต๊ะ|จัดระเบียบ|มินิมอล|minimal|cozy|home\s*decor|interior|ไลฟ์สไตล์|lifestyle|ชีวิตประจำวัน|กิจวัตร|routine|เครื่องเขียน|เดลี่|daily\s*vlog|บ้านน่าอยู่/g],
    // 👶 ⚠️ ห้ามใส่ "ลูก" หรือ "ท้อง" เดี่ยวๆ — "ลูก" ไปโดน "ลูกค้า" (มี 155 คนใช้คำนี้) · "ท้อง" ไปโดน "ท้องถิ่น/ท้องตลาด"
    ["แม่และเด็ก", /แม่และเด็ก|เลี้ยงลูก|ลูกน้อย|ลูกวัย|คุณแม่|แม่มือใหม่|ตั้งครรภ์|คนท้อง|หลังคลอด|ของใช้เด็ก|สินค้าเด็ก|พัฒนาการเด็ก|ลูกสาว|ลูกชาย/g],
  ];
  let best = "อื่นๆ", bestN = 0;
  for (const [name, re] of cats) { const n = (t.match(re) || []).length; if (n > bestN) { bestN = n; best = name; } }
  return best;
}
// ป้ายเตือน "กฎโฆษณา" ตามวงการที่มีข้อกำกับ (อย./Meta/กลต.) — ลูกค้าส่วนใหญ่ไม่รู้กฎ กันโดนแบนแอด/ปรับ
export function complianceNote(category) {
  const N = {
    "สุขภาพ&คลินิก": {
      icon: "⚕️",
      title: "ก่อนโพสต์/ยิงแอด — เนื้อหาสายสุขภาพต้องระวังคำเคลม (กฎ อย. + Meta)",
      avoid: ["รักษา / หาย / หายขาด", "ลด...ได้แน่นอน", "การันตีผล / 100% / เห็นผลทันที"],
      use: ["ช่วยดูแล / รู้สึกสบายขึ้น", "ใส่ท้ายว่า “ผลลัพธ์ขึ้นกับแต่ละบุคคล”"],
      why: "เคลมเกินจริงเรื่องสุขภาพ = ผิดกฎ อย. + Meta อาจโดนแบนแอด/เพจ หรือถูกปรับ",
    },
    "ความงาม/สกินแคร์": {
      icon: "💄",
      title: "ก่อนโพสต์/ยิงแอด — เนื้อหาสายความงามต้องระวังคำเคลม (กฎ อย.)",
      avoid: ["รักษาสิว/ฝ้า หายขาด", "ขาวถาวร / ขาวใน X วัน", "ปลอดภัย 100% / เห็นผลแน่นอน"],
      use: ["ช่วยดูแล / ดูกระจ่างใสขึ้น", "ใส่ท้ายว่า “ผลลัพธ์แต่ละคนต่างกัน”"],
      why: "เครื่องสำอางเคลมเกินจริง = ผิดกฎ อย. โดนแบนแอด/ปรับได้",
    },
    "อสังหา/การเงิน": {
      icon: "💰",
      title: "ก่อนโพสต์/ยิงแอด — เนื้อหาสายการเงิน/ลงทุนต้องระวังคำเคลม",
      avoid: ["ได้กำไรแน่นอน / รวยเร็ว", "การันตีผลตอบแทน X%", "คืนทุนใน X เดือนแน่นอน"],
      use: ["ระบุความเสี่ยงจริง", "ใส่ท้ายว่า “การลงทุนมีความเสี่ยง ควรศึกษาก่อนตัดสินใจ”"],
      why: "การันตีผลตอบแทน = ผิดกฎ Meta/กลต. เสี่ยงโดนแบนแอดหรือปัญหากฎหมาย",
    },
  };
  return N[category] || null;
}
// แทน "จ้ะ/จ๊ะ/จ๋า" → "ค่ะ/คะ" ในน้ำเสียงครูพี่คิม (กัน AI หลุด + แก้เล่มเก่าตอนแสดงผลทันที)
export function politeKim(s) {
  if (typeof s !== "string") return s;
  return s.replace(/นะจ๊ะ/g, "นะคะ").replace(/นะจ้ะ/g, "นะคะ").replace(/จ๊ะ/g, "คะ").replace(/จ้ะ/g, "ค่ะ").replace(/จ๋า/g, "คะ")
    // ทักทาย/เรียกลูกค้าด้วย "น้อง" → "คุณ" (ลูกค้าบางคนอายุมากกว่า) — เฉพาะคำทักทายเปิด ไม่แตะ "น้องๆ/น้องสาว/น้องชาย" ที่หมายถึงคนอื่น
    .replace(/(สวัสดี[^น]{0,4})น้อง(?!ๆ|สาว|ชาย)/g, "$1คุณ");
}
// เดินทั้ง blueprint แทนที่ทุก field ยกเว้นใต้ "scripts" (บทพูดลูกค้า = เสียงของเขาเอง ห้ามแตะ)
export function politeKimBlueprint(bp) {
  const walk = (obj, skip) => {
    if (Array.isArray(obj)) return obj.map(x => walk(x, skip));
    if (obj && typeof obj === "object") { const o = {}; for (const k of Object.keys(obj)) o[k] = walk(obj[k], skip || k === "scripts"); return o; }
    return skip ? obj : politeKim(obj);
  };
  return (bp && typeof bp === "object") ? walk(bp, false) : bp;
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
4. 🗣️ ภาษาบ้านๆ เป็นกันเองเหมือนพี่สาวคุยกับเพื่อน ห้ามศัพท์เทคนิค/อังกฤษที่คนทั่วไปไม่เข้าใจ (ถ้าจำเป็นให้วงเล็บอธิบาย)
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

// ===== ตรวจการบ้านคอร์สเรียน — "สมองครูพี่คิม" ตรวจงานนักเรียนแทนแอดมิน =====
// ปรัชญาการตรวจ: ให้ผ่านง่ายกว่าตก เพราะเป้าหมายคือ "ทำให้เขาทำต่อ" ไม่ใช่คัดคนออก
// แต่ต้องคอมเมนต์ให้ตรงงานจริง ไม่ใช่คำชมลอยๆ — ลูกค้าจ่ายเงินมาเพื่อฟีดแบ็กที่ใช้ได้จริง
const HOMEWORK_PROMPT = `คุณคือ "ครูพี่คิม" (BEARBYKIM) ผู้ก่อตั้ง Babe House Academy กำลังตรวจการบ้านของนักเรียนที่ส่งงานเข้ามาในคอร์สออนไลน์

🎯 หน้าที่: ดูงานที่นักเรียนส่งมา แล้วให้ฟีดแบ็กแบบที่ครูพี่คิมให้จริง — อบอุ่น ตรงไปตรงมา และบอกวิธีแก้ที่ลงมือทำต่อได้ทันที

📏 เกณฑ์ตัดสิน (สำคัญมาก):
1. ✅ ให้ผ่าน (passed:true) เมื่อ "นักเรียนทำโจทย์ตามที่สั่งจริง และเห็นความพยายามใช้สิ่งที่เรียน" — ไม่ต้องสวยระดับมืออาชีพ ไม่ต้องสมบูรณ์แบบ
   - งานมือใหม่ที่ยังไม่เนี้ยบ แต่ครบโจทย์ = ผ่าน
   - เป้าหมายของเราคือให้กำลังใจให้เขาทำต่อ ไม่ใช่จับผิด
2. ⛔ ให้ไม่ผ่าน (passed:false) เฉพาะ 3 กรณีนี้เท่านั้น:
   (ก) งานที่ส่งมา **ไม่เกี่ยวกับโจทย์เลย** (เช่น โจทย์ให้ส่งคลิปที่ตัดต่อเอง แต่ส่งรูปเซลฟี่/ภาพจอว่าง/สกรีนช็อตที่ไม่ใช่งาน)
   (ข) ไฟล์เสีย/ว่างเปล่า/มืดสนิท/ดูไม่ออกว่าคืออะไร
   (ค) เห็นชัดว่าไม่ได้ทำเอง (เช่น เป็นคลิปโฆษณา/หนัง/งานสำเร็จรูปที่ไม่ได้แตะเลย)
   ⛔⛔ นอกจาก 3 ข้อนี้ ให้ passed:true เสมอ — งานยังไม่สวย/ยังไม่เก่ง ไม่ใช่เหตุผลให้ตก!
3. score = 0-100 ให้ตามความครบถ้วนของโจทย์ + ความตั้งใจ (งานที่ผ่านส่วนใหญ่ควรอยู่ 70-90 ไม่ต้องขี้เหนียวคะแนน)

✍️ วิธีเขียนคอมเมนต์:
- 🗣️ ภาษาพูดแบบพี่สาวใจดีที่เก่งจริง ลงท้าย "ค่ะ/นะคะ" — ⛔ ห้ามใช้ "จ้ะ/จ๊ะ/จ๋า" และ ⛔ ห้ามเรียกนักเรียนว่า "น้อง" (บางคนอายุมากกว่าเรา) ให้ใช้ "คุณ" หรือไม่ต้องเรียกเลย
- strengths = ชมสิ่งที่เห็นจริงในงานนี้ เจาะจง (เช่น "จังหวะตัดตอนเปลี่ยนซีนที่นาทีแรกลื่นมาก") ⛔ ห้ามชมลอยๆ แบบ "เก่งมากค่ะ" เฉยๆ
- improvements = จุดที่แก้แล้วงานดีขึ้นชัด บอก **วิธีทำ** ไม่ใช่แค่บอกว่าไม่ดี (เช่น "ลองเพิ่มแสงเข้าหน้าโดยหันไปทางหน้าต่าง จะทำให้ภาพคมขึ้น")
- ⛔ ห้ามแต่งตัวเลข/เปอร์เซ็นต์ที่วัดจริงไม่ได้ ให้บรรยายสิ่งที่เห็นจริงในงาน
- ถ้าไม่ผ่าน: what_to_fix ต้องบอกชัดว่าต้องส่งอะไรมาใหม่ ด้วยน้ำเสียงที่ไม่ทำให้เขาท้อ
- ⛔ ห้ามเอ่ยชื่อแบรนด์ "Babe House" ในคอมเมนต์ (นักเรียนรู้อยู่แล้วว่าเรียนที่ไหน)`;
const HOMEWORK_SCHEMA = { type: Type.OBJECT, properties: {
  passed: { type: Type.BOOLEAN },
  score: { type: Type.NUMBER },
  summary: { type: Type.STRING },
  strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
  improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
  next_step: { type: Type.STRING },
  what_to_fix: { type: Type.STRING },
}, required: ["passed", "score", "summary", "strengths", "improvements", "next_step"] };

// ตรวจการบ้าน 1 ชิ้น — รับได้ทั้งรูปและวิดีโอ (วิดีโอต้องอัปขึ้น Files API ก่อนเหมือน analyzeVideo)
// รับได้ 2 ทาง: filePath (ไฟล์ใหญ่ อัปแบบ multipart แล้วเขียนลงดิสก์) หรือ dataUrl (ไฟล์เล็ก/รูป)
// ไฟล์ใหญ่ต้องไม่โหลดเข้าหน่วยความจำเป็น string — คลิป 200MB จะกลายเป็น base64 ~274MB กินแรมจนเซิร์ฟเวอร์ล่ม
export async function gradeHomework({ dataUrl, filePath, mimeType, courseName, title, brief, criteria, lang = "th" }) {
  const ctx = [
    `คอร์ส: ${courseName || "-"}`,
    `โจทย์การบ้าน: ${title || "-"}`,
    brief ? `รายละเอียดโจทย์: ${brief}` : "",
    criteria ? `เกณฑ์เพิ่มเติมจากครูพี่คิมสำหรับการบ้านชิ้นนี้: ${criteria}` : "",
    "", "ดูงานที่นักเรียนส่งมาแล้วตรวจตามสเปก JSON",
  ].filter(Boolean).join("\n");

  const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/s);
  const mt = (m && m[1]) || mimeType || "image/jpeg";
  const b64 = filePath ? null : (m ? m[2] : dataUrl);
  if (!b64 && !filePath) throw new Error("no homework data");
  const isVideo = /^video\//.test(mt);

  if (!ai) return { result: fallbackHomework(isVideo), model: "fallback-local", usage: { input: 0, output: 0, total: 0 } };

  const cfg = { systemInstruction: HOMEWORK_PROMPT + langSuffix(lang), responseMimeType: "application/json", responseSchema: HOMEWORK_SCHEMA, maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 2048 } };
  const finish = (resp) => {
    const r = JSON.parse(resp.text);
    const u = resp.usageMetadata || {};
    // กันน้ำเสียงหลุด (จ้ะ/น้อง) ตอนแสดงผล เหมือนที่ทำกับเล่ม Blueprint
    for (const k of ["summary", "next_step", "what_to_fix"]) if (r[k]) r[k] = politeKim(r[k]);
    for (const k of ["strengths", "improvements"]) if (Array.isArray(r[k])) r[k] = r[k].map(politeKim);
    r.score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
    return { result: r, model: MODEL, usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, total: u.totalTokenCount || 0 } };
  };

  if (!isVideo && b64) {
    const parts = [{ inlineData: { mimeType: mt, data: b64 } }, { text: ctx }];
    return finish(await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts }], config: cfg }));
  }

  // คลิป (หรือไฟล์ที่อัปแบบ multipart) → ส่งผ่าน Files API ของ Gemini โดยอ่านจากไฟล์บนดิสก์
  const ext = mt.includes("quicktime") || mt.includes("mov") ? "mov" : mt.includes("webm") ? "webm" : "mp4";
  const ownTmp = !filePath;   // ไฟล์ที่เราสร้างเองต้องลบเอง · ไฟล์จาก multipart ให้ฝั่งเรียกลบ
  const tmp = filePath || path.join(os.tmpdir(), `hw_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  if (ownTmp) fs.writeFileSync(tmp, Buffer.from(b64, "base64"));
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
    const parts = [{ fileData: { fileUri: f.uri, mimeType: mt } }, { text: ctx }];
    return finish(await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts }], config: cfg }));
  } finally {
    if (ownTmp) { try { fs.unlinkSync(tmp); } catch {} }
    if (uploaded?.name) ai.files.delete({ name: uploaded.name }).catch(() => {});
  }
}
function fallbackHomework(isVideo) {
  return {
    passed: true, score: 78,
    summary: `(โหมดทดสอบ — ใส่ GEMINI_API_KEY เพื่อให้ครูพี่คิมตรวจงานจริง) ได้รับ${isVideo ? "คลิป" : "รูป"}แล้วค่ะ งานทำครบตามโจทย์`,
    strengths: ["ส่งงานครบตามที่โจทย์กำหนด", "เห็นความตั้งใจในการลงมือทำจริง"],
    improvements: ["ลองเก็บรายละเอียดให้เนี้ยบขึ้นอีกนิดในงานชิ้นถัดไป"],
    next_step: "ลองทำงานชิ้นต่อไปโดยใช้เทคนิคเดิมแต่เพิ่มลูกเล่นอีกหนึ่งอย่างนะคะ",
    what_to_fix: "",
  };
}

// ===== ตัวตรวจคุณภาพเล่มอัตโนมัติ — สแกนหา red flag (กันเล่มออกมากลางๆ/พลาด) =====
// ✏️ เขียน "ธีมเล่ม" ใหม่อย่างเดียว โดยไม่แตะสคริปต์/ปฏิทินที่ลูกค้าอาจใช้ไปแล้ว
// ใช้กับเล่มเก่าที่ธีมหลุดไปเป็น "บทวิเคราะห์ช่อง: ..." (= ชื่อเอกสาร ไม่ใช่คำโปรยของช่องลูกค้า)
export async function rewriteTheme(bp, lang = "th") {
  if (!ai) return null;
  const ctx = {
    ช่อง: bp.instagram_account, จุดยืน: bp.positioning, คนดู: bp.audience_summary,
    เสาคอนเทนต์: (bp.pillars || []).slice(0, 5),
    ตัวอย่างหัวข้อจริงในแผน: (bp.calendar || []).slice(0, 8).map(c => c.title || c.topic || c.idea).filter(Boolean),
  };
  const sys = `เขียน "ธีมเล่ม" ให้ช่องนี้ใหม่ 1 บรรทัด — ธีมคือ "ช่องนี้ทำคอนเทนต์เรื่องอะไร" ที่เอาไปวางเป็นคำโปรยใต้ชื่อช่องเขาได้เลย
✅ ถูก: "รีวิวร้านอาหาร ที่เที่ยว และทริคเดินทางสำหรับคนชอบลองสิ่งใหม่ๆ" · "ปั้นลิปสติกแบรนด์ไทยให้เป็นลิปที่ผู้หญิงหยิบใช้ทุกวัน"
⛔ ผิด (ห้ามเด็ดขาด): ขึ้นต้นด้วย "บทวิเคราะห์ช่อง" / "การวิเคราะห์ช่อง" / "วางแผนคอนเทนต์" / "Blueprint" — พวกนี้คือชื่อเอกสารของเรา ไม่ใช่ตัวตนช่องลูกค้า
⛔ ห้ามใส่ชื่อ Babe House · ห้ามใส่เครื่องหมายคำพูด · ยาว 8-22 คำ
ตอบ JSON: {"theme":"..."}`;
  const { resp } = await genContent({
    contents: [{ role: "user", parts: [{ text: JSON.stringify(ctx, null, 1) }] }],
    config: {
      systemInstruction: sys + langSuffix(lang), responseMimeType: "application/json",
      // ต้องมี schema — ไม่งั้นโมเดลตอบเป็นร้อยแก้ว ("Here is the theme...") แล้ว JSON.parse พัง
      responseSchema: { type: Type.OBJECT, properties: { theme: { type: Type.STRING } }, required: ["theme"] },
      maxOutputTokens: 800,
    },
    retries: 2,
  });
  let parsed = null;
  try { parsed = JSON.parse(resp.text); }
  catch { const m = String(resp.text || "").match(/"theme"\s*:\s*"([^"]+)"/); parsed = m ? { theme: m[1] } : null; }
  const t = String(parsed?.theme || "").trim().replace(/^["“”']|["“”']$/g, "");
  return t && !BAD_THEME_RE.test(t) && !/babe\s*house/i.test(t) ? t : null;
}
// ธีมที่เป็น "ชื่อเอกสาร" ไม่ใช่ตัวตนของช่องลูกค้า
export const BAD_THEME_RE = /^\s*(การ|บท)?(วิเคราะห์ช่อง|วิเคราะห์|วางแผนคอนเทนต์|วางกลยุทธ์คอนเทนต์|blueprint)/i;
export function checkBlueprintQuality(bp, hasImage) {
  const flags = [];
  if (!bp || typeof bp !== "object") return ["เล่มว่าง/ไม่ใช่ JSON"];
  const scripts = Array.isArray(bp.scripts) ? bp.scripts : [];
  const calendar = Array.isArray(bp.calendar) ? bp.calendar : [];
  if (scripts.length < 30) flags.push(`สคริปต์ไม่ครบ 30 (มี ${scripts.length})`);
  if (calendar.length < 30) flags.push(`ปฏิทินไม่ครบ 30 (มี ${calendar.length})`);
  // theme ต้องบอกว่า "ช่องทำคอนเทนต์เรื่องอะไร" ไม่ใช่ "เราวิเคราะห์/วางแผนให้เขา"
  // เจอจริง 2/14 เล่ม (@ssavesavee, @palmierr23) — AI หลุดไปเขียนถึงกระบวนการของเราแทนเนื้อหาช่องลูกค้า
  const theme = String(bp.theme || "");
  if (BAD_THEME_RE.test(theme)) {   // ครอบคลุม "บทวิเคราะห์ช่อง:" ด้วย — เจอเพิ่มอีก 19 เล่มตอนสแกนทั้งระบบ
    flags.push(`ธีมเล่มพูดถึงการวางแผนแทนเนื้อหาช่อง: "${theme.slice(0, 60)}"`);
  }
  // 🚨 เล่มกลายเป็นของ Babe House แทนช่องลูกค้า — เกิดเมื่อลูกค้ากด "ใช้ตัวอย่างนี้" แล้วส่งเลย (เจอจริง 2 คน)
  // ต้องจับให้ได้เสมอ เพราะเป็นความผิดพลาดที่ลูกค้าเห็นทันทีบรรทัดแรกของเล่ม
  if (/babe\s*house|เบ๊บเฮาส์|สถาบันสอนตัดต่อวิดีโอ/i.test(`${theme} ${bp.positioning || ""} ${bp.audience_summary || ""}`)) {
    flags.push(`⚠️ เล่มนี้วิเคราะห์เป็น Babe House แทนช่องลูกค้า (ลูกค้าน่าจะส่งข้อความตัวอย่างมา) — ต้องทำใหม่`);
  }
  // สคริปต์สั้นเกินไป — เล่มดีอยู่ที่ ~600-800 ตัวอักษร
  // ⚠️ ปรับ 4 ส.ค.: เดิมเตือนทุกวันที่ต่ำกว่า 520 ทำให้ @Oumtrd โดนเตือนเพราะมี 3 วันได้ 483-509
  //    (ต่ำกว่าเส้นแค่ 2-7% แต่เนื้อหาครบ ฮุก/เนื้อ/ปิดท้าย ไม่ได้ขาดอะไร)
  //    ตอนนี้เตือนเฉพาะที่ "สั้นจริงจัง" (<420 = เนื้อหาไม่พอแน่) หรือสั้นกันหลายวัน (≥5 วัน = ทั้งเล่มบาง)
  const lens = scripts.map(s => (s.beats || []).reduce((a, b) => a + String(b.say || "").length, 0));
  const tooShort = lens.filter(l => l < 420).length;
  const belowBar = lens.filter(l => l < 520).length;
  if (tooShort > 0) flags.push(`${tooShort} สคริปต์สั้นเกินไป (ต่ำกว่า 420 ตัวอักษร)`);
  else if (belowBar >= 5) flags.push(`${belowBar} สคริปต์บางกว่ามาตรฐาน (ต่ำกว่า 520 ตัวอักษร)`);
  // placeholder วงเล็บเหลี่ยมค้าง เช่น [ชื่อสินค้า] (ดูไม่เสร็จ)
  const phN = scripts.reduce((n, s) => n + (s.beats || []).filter(b => /\[[^\]]{2,}\]/.test(String(b.say || ""))).length, 0);
  if (phN > 0) flags.push(`${phN} จุดมี placeholder วงเล็บ [..]`);
  // หัวข้อปฏิทินเป็นภาษาอังกฤษทั้งที่เป็นเล่มไทย
  const isThaiBook = /[฀-๿]/.test(String(bp.greeting || "") + String(bp.theme || ""));
  if (isThaiBook) {
    const engT = calendar.filter(c => /[A-Za-z]/.test(String(c.t || "")) && !/[฀-๿]/.test(String(c.t || ""))).length;
    if (engT > 0) flags.push(`${engT} หัวข้อปฏิทินเป็นภาษาอังกฤษ`);
  }
  // ศัพท์เทคนิค/อังกฤษที่ห้ามหลุดถึงลูกค้า (ไม่นับ label beat CTA)
  const prose = [bp.greeting, bp.kim_insight, bp.positioning, ...(bp.what_we_see || []), ...((bp.story || []).map(s => s && s.body)), ...scripts.flatMap(s => [...(s.beats || []).map(b => b && b.say), s && s.cap])].filter(Boolean).join(" ").toLowerCase();
  const jargon = ["funnel", "conversion", "micro-influencer", "micro influencer", "engagement", "positioning", "retention", "call to action", "awareness", "branding"];
  const found = jargon.filter(w => prose.includes(w));
  if (found.length) flags.push(`ศัพท์เทคนิคหลุด: ${[...new Set(found)].join(", ")}`);
  // อ้างอิงปีเก่าแบบ "อ้างว่าเป็นปัจจุบัน" (เช่น "เทรนด์ 2024" ทั้งที่ปีนี้ 2026) = ดูล้าสมัย
  // ⛔ ไม่นับปีที่เป็นเรื่องเล่าอดีตจริงของลูกค้า ("เมื่อปี 2019 เราไปเรียนต่อ") — ดูจากคำรอบๆ ว่าอ้างเป็นปัจจุบันไหม
  const nowY = new Date().getFullYear();
  const oldYears = new Set();
  // มีคำบ่งอดีตชัดเจน = เป็นเรื่องเล่าจริงของลูกค้า ปล่อยผ่าน · นอกนั้นถือว่าอ้างเป็นปัจจุบัน = ผิด
  const PAST_CONTEXT = /(เมื่อ|ตั้งแต่|ย้อน|อดีต|เคย|ก่อตั้ง|เปิดร้าน|เริ่มต้น|จบการศึกษา|ปีที่แล้ว|สมัย|ตอนนั้น)/;
  const scanYear = (s) => {
    const str = String(s || "");
    for (const m of str.matchAll(/\b(20[0-9]{2})\b/g)) {
      const y = Number(m[1]); if (y >= nowY) continue;
      const before = str.slice(Math.max(0, m.index - 40), m.index);
      if (!PAST_CONTEXT.test(before)) oldYears.add(y);
    }
  };
  scripts.forEach(s => { (s.beats || []).forEach(b => scanYear(b.say)); scanYear(s.cap); scanYear(s.title); });
  calendar.forEach(c => { scanYear(c.t); scanYear(c.h); });
  if (oldYears.size) flags.push(`อ้างอิงปีเก่า (${[...oldYears].sort().join(", ")}) ทั้งที่ปีนี้ ${nowY}`);
  // "คิม" หลุดในบทพูดสคริปต์ (ควรถูก sanitize แล้ว)
  if (scripts.some(s => (s.beats || []).some(b => /คิม/.test(String(b.say || ""))))) flags.push('มี "คิม" หลุดในสคริปต์');
  // "Babe House" หลุดในสคริปต์/แคปชันลูกค้า (แบรนด์เรา ไม่ใช่แบรนด์ลูกค้า — ควรถูก sanitize แล้ว)
  // ยกเว้นเล่มที่ "แบรนด์ลูกค้าคือ Babe House จริง" (แอคคิมเอง/ธุรกิจในเครือ — ดูจาก theme/positioning/greeting)
  const brandRe = /babe\s*house|เบ๊บเฮาส์/i;
  const ownBrand = brandRe.test(String(bp.theme || "") + String(bp.positioning || "") + String(bp.greeting || ""));
  if (!ownBrand) {
    const brandN = scripts.reduce((n, s) => n + (s.beats || []).filter(b => brandRe.test(String(b.say || ""))).length + (brandRe.test(String(s.cap || "")) ? 1 : 0) + (s.hooks || []).filter(h => brandRe.test(String(h))).length, 0);
    if (brandN > 0) flags.push(`${brandN} จุดมี "Babe House" หลุดในสคริปต์ลูกค้า (แบรนด์เราไม่ใช่ของลูกค้า)`);
  }
  // ตัวเลข metrics ทั้งที่ไม่มีรูป = เสี่ยงแต่งตัวเลข
  const m = bp.metrics || {};
  const hasNums = m && Object.values(m).some(v => typeof v === "number" && v > 0);
  if (!hasImage && hasNums) flags.push("มีตัวเลขสถิติทั้งที่ไม่มีรูป (เสี่ยงแต่งตัวเลข)");
  // engagement rate เกินจริง = AI คำนวณเอง (ถูกใจ÷ผู้ติดตาม) ไม่ได้อ่านจากป้ายในรูป
  // ⚠️ ช่องเล็ก ER ต่อ reach สูงได้จริง (เช่น 175 การตอบโต้ / เข้าถึง 521 = 33%) → เตือนเฉพาะช่องใหญ่ที่เป็นไปไม่ได้ หรือค่าเวอร์เกินทุกขนาด
  const er = m.engagement_rate;
  if (typeof er === "number" && (er >= 40 || (er >= 15 && Number(m.followers) >= 10000)))
    flags.push(`อัตราการมีส่วนร่วม ${er}% สูงเกินจริงสำหรับช่องขนาดนี้ (น่าจะคำนวณเอง ไม่ได้อ่านจากรูป)`);
  // สคริปต์ซ้ำกัน
  const says = scripts.map(s => (s.beats || []).map(b => String(b.say || "")).join("|"));
  const dup = says.filter(Boolean).length - new Set(says.filter(Boolean)).size;
  if (dup > 0) flags.push(`${dup} สคริปต์ซ้ำกัน`);
  // ชิ้นส่วนหลักหาย
  for (const [k, label] of [["greeting", "คำทักทาย"], ["kim_insight", "อินไซต์ครูพี่คิม"], ["swot", "SWOT"], ["modules", "5 โมดูล"]]) if (!bp[k]) flags.push(`ขาด ${label}`);
  return flags;
}

// ===== ยามตรวจ "ความหมาย" (semantic self-audit) — AI ตรวจงานตัวเองว่า "แผนตรงกับช่องลูกค้าจริงไหม + ตัวเลขสมเหตุผลไหม" =====
// checkBlueprintQuality เช็ก "รูปแบบ" (สั้น/ครบ/ภาษา) — ตัวนี้เช็ก "เนื้อใน" ที่ระบบเดิมจับไม่ได้: วิเคราะห์ผิดนิช / ตัวเลขสลับ
// คืน string[] (ว่าง = ผ่าน) · fail-safe: error ใดๆ คืน [] เพื่อไม่บล็อกเล่มลูกค้า
const AUDIT_SCHEMA = { type: Type.OBJECT, properties: {
  niche_match: { type: Type.BOOLEAN },       // แผนตรงกับแนวคอนเทนต์ช่องจริงไหม
  real_niche_guess: { type: Type.STRING },   // ช่องนี้ "น่าจะ" ทำคอนเทนต์แนวไหนจริง (จาก handle/คนดู/คู่แข่ง)
  niche_reason: { type: Type.STRING },       // เหตุผลสั้นๆ ไทย
  metrics_ok: { type: Type.BOOLEAN },        // ตัวเลขสถิติสมเหตุผล/ไม่สลับ label ไหม
  metrics_reason: { type: Type.STRING },     // เหตุผลสั้นๆ ไทย (ถ้าปัญหา)
  confidence: { type: Type.NUMBER }          // 0-1 มั่นใจแค่ไหนว่า "มีปัญหา" จริง
}, required: ["niche_match", "real_niche_guess", "niche_reason", "metrics_ok", "metrics_reason", "confidence"] };

const AUDIT_PROMPT = `คุณคือ "ผู้ตรวจสอบคุณภาพ" ของ Babe House ที่เข้มงวดแต่ยุติธรรม หน้าที่: ตรวจว่าแผนคอนเทนต์ที่ทีมสร้างให้ลูกค้า "ตรงกับช่องจริงของเขา" และ "ตัวเลขสถิติสมเหตุผล" ไหม เพื่อไม่ให้ส่งของผิดถึงมือลูกค้า

⚠️ จุดพลาดที่ต้องจับให้ได้ (เคยเกิดจริง):
1. **ลูกค้าเขียน "อาชีพ/บริการที่ขาย" แทน "แนวคอนเทนต์ช่อง"** → แผนเลยหลุดนิช. เช่น ช่องความงาม แต่ลูกค้ากรอกว่า "สอน AI, รับทำ CapCut, เอเจนซี่" (= บริการที่เขาขาย) → ทีมไปทำแผนสาย AI ทั้งที่ช่องจริงคือบิวตี้. **สัญญาณของนิชจริง = ชื่อ @handle + กลุ่มคนดู + คู่แข่งที่ลูกค้าอ้างอิง** (คนมักตามคู่แข่งที่ทำคอนเทนต์แนวเดียวกับตัวเอง). ถ้าแผน (theme/positioning) สร้างรอบ "บริการที่ขาย" แต่สัญญาณเหล่านี้ชี้ไปคนละแนวชัดเจน = niche_match:false
2. **ตัวเลขสถิติผิดแบบ "เป็นไปไม่ได้จริง" เท่านั้น** = metrics_ok:false — ให้ใช้เกณฑ์แคบๆ 3 ข้อนี้เท่านั้น ห้ามคิดกฎเพิ่มเอง:
   (ก) มีตัวเลขใดมากกว่า **reach** (reach คือเพดานสูงสุดเสมอ — ไลก์/คอมเมนต์/แชร์/เข้าชมโปรไฟล์ ต้องไม่เกิน reach)
   (ข) **engagement_rate > 30%** (สูงจนผิดปกติ = อ่านผิด/สลับ)
   (ค) followers กับ reach ดูสลับกันชัดเจนมาก
   ⛔⛔⛔ นอกจาก 3 ข้อนี้ ให้ **metrics_ok:true เสมอ** — โดยเฉพาะกรณีเหล่านี้ที่ **ปกติ 100% ห้าม flag เด็ดขาด**:
   • **ไลก์ > เข้าชมโปรไฟล์ (profile visits)** = ปกติมาก! คนกดไลก์ในฟีดง่ายกว่ากดเข้าไปดูโปรไฟล์เยอะ — ⛔ ห้ามอ้างว่า "profile visits ควรมากกว่าหรือเท่ากับ likes" เพราะ **ไม่จริง**
   • เอนเกจ/ไลก์ต่ำเมื่อเทียบ reach (1-3% เป็นเรื่องปกติของคอนเทนต์ไวรัล)
   • คอมเมนต์/แชร์น้อยกว่าไลก์มากๆ (ปกติ)
   • ตัวเลขบางค่าเป็น null/ไม่มี (ลูกค้าอาจไม่ได้ส่งภาพครบ — ไม่ใช่ error)
   ⛔ อย่าเดาว่าตัวเลข "ถูกตัด/truncate/เป็น placeholder" ถ้าตัวเลขนั้นสมเหตุผลในตัวมันเอง — เมตริกแต่ละตัวเป็นคนละขั้นของกรวย ไม่จำเป็นต้องเรียงลำดับกัน

⛔ กันเตือนพร่ำเพรื่อ (สำคัญมาก): ค่า default คือ **niche_match:true / metrics_ok:true** — ให้ผ่านไว้ก่อน. ตอบ false **เฉพาะเมื่อขัดแย้งกันชัดเจนจริงๆ** เท่านั้น. ถ้าแผนกว้างๆ ครอบคลุมได้ / ไม่แน่ใจ / เป็นแค่มุมมองต่างเล็กน้อย → ให้ผ่าน (true) และ confidence ต่ำ. confidence = ความมั่นใจว่า "มีปัญหาจริง" (สูง = มั่นใจว่าผิดจริง). อย่าเดานิชจากเพศ/ชื่อคน. ตอบ JSON เท่านั้น`;

// ตรวจความสมเหตุผลของตัวเลข Insight ด้วยกฎตายตัว (ไม่ใช้ AI — AI แต่งกฎเองซ้ำๆ จนเตือนผิด 3 ครั้ง)
// จับเฉพาะ "เป็นไปไม่ได้จริง" เท่านั้น · เคสกำกวมปล่อยผ่านหมด (เตือนผิดแย่กว่าไม่เตือน)
export function checkMetricsSanity(m) {
  const flags = [];
  const n = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
  const reach = n(m.reach), followers = n(m.followers), er = n(m.engagement_rate);

  // (ก) reach คือเพดาน — ไลก์/คอมเมนต์/แชร์/เซฟ/เข้าชมโปรไฟล์/กดลิงก์ เกิน reach ไม่ได้
  if (reach) {
    const capped = { likes: "ไลก์", comments: "คอมเมนต์", shares: "แชร์", saves: "เซฟ", profile_visits: "เข้าชมโปรไฟล์", link_taps: "กดลิงก์" };
    const over = Object.entries(capped).filter(([k]) => n(m[k]) && m[k] > reach).map(([k, th]) => `${th} ${m[k].toLocaleString()}`);
    if (over.length) flags.push(`🔢 ตัวเลขเกินการเข้าถึง (reach ${reach.toLocaleString()}): ${over.join(" · ")} — น่าจะอ่านภาพสลับช่อง`);
  }
  // (ข) engagement rate สูงเกินจริง (รับได้ทั้งรูปแบบ 0-1 และ 0-100)
  const erPct = er == null ? null : (er <= 1 ? er * 100 : er);
  if (erPct != null && erPct > 30) flags.push(`🔢 อัตราการมีส่วนร่วม ${erPct.toFixed(1)}% สูงผิดปกติ — น่าจะอ่านตัวเลขผิด`);
  // (ค) ⛔ เลิกเตือน "reach สูงแต่คนเข้าโปรไฟล์น้อย" แล้ว — ไม่ใช่สัญญาณที่เชื่อถือได้
  // เจอผิดซ้ำ 3 ราย: @jabo0oo · @todaysmoment.khao · @Oumtrd (1,301 ฟอล / reach 240,900 / เข้าโปรไฟล์ 944)
  // ความจริง: คลิปไวรัลทำ reach ทะลุผู้ติดตามได้ร้อยเท่า และคนดูส่วนใหญ่ไม่กดเข้าโปรไฟล์
  //           944 จาก 240,900 = 0.39% เป็นอัตราปกติของรีล ไม่ได้ขัดกันเอง
  // เตือนเฉพาะกรณีที่ "เป็นไปไม่ได้จริง" เท่านั้น: คนเข้าโปรไฟล์มากกว่าการเข้าถึงทั้งหมด
  const pv = n(m.profile_visits);
  if (reach && pv && pv > reach * 1.5) {
    flags.push(`🔢 คนเข้าโปรไฟล์ ${pv.toLocaleString()} มากกว่าการเข้าถึง ${reach.toLocaleString()} — น่าจะอ่านสลับช่อง`);
  }
  // (ง) reach น้อยกว่าผู้ติดตาม 100 เท่า = อ่านผิดแน่ (เจอจริง: @jeowfee 1,300 ฟอล แต่ reach 2)
  if (reach && followers && followers > 200 && reach < followers / 100) {
    flags.push(`🔢 ผู้ติดตาม ${followers.toLocaleString()} แต่การเข้าถึงแค่ ${reach.toLocaleString()} — ต่ำผิดปกติ น่าจะอ่านตัวเลขผิดช่อง`);
  }
  return flags;
}

export async function auditBlueprintMatch(parsed, analysis, lang = "th") {
  try {
    if (!ai || !parsed || !analysis) return [];
    const fr = parsed.form_responses || {};
    const a = analysis || {};
    const m = a.metrics || {};
    const hasNums = Object.values(m).some(v => typeof v === "number" && v > 0);
    const signal = [
      `@handle: ${parsed.instagram_account || "-"}`,
      `ลูกค้ากรอก business_type (อาจเป็นอาชีพ/บริการ ไม่ใช่แนวช่อง): ${fr.business_type || "-"}`,
      `บทบาท/สถานะ (work_style): ${fr.work_style || "-"}`,
      `กลุ่มคนดู (audience): ${fr.audience || "-"}`,
      `เป้าหมายเดือนนี้: ${fr.goal_primary || fr.monthly_goal || "-"}`,
      `คู่แข่ง/ช่องอ้างอิง: ${[fr.competitor_1, fr.competitor_2].filter(Boolean).join(", ") || "-"}`,
      `เรื่องราวตัวตน: ${String(fr.starting_point || "-").slice(0, 400)}`
    ].join("\n");
    const plan = [
      `theme: ${a.theme || "-"}`,
      `positioning: ${a.positioning || "-"}`,
      `pillars: ${(Array.isArray(a.pillars) ? a.pillars : []).map(p => (p && (p.name || p.title || p)) || p).filter(Boolean).join(" / ").slice(0, 300) || "-"}`,
      `what_we_see: ${(Array.isArray(a.what_we_see) ? a.what_we_see : []).join(" · ").slice(0, 300) || "-"}`,
      `metrics: ${hasNums ? JSON.stringify(m) : "(ไม่มีตัวเลข — ข้ามการตรวจ metrics ให้ metrics_ok:true)"}`
    ].join("\n");
    const resp = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts: [{ text: `=== สัญญาณช่องจริงของลูกค้า ===\n${signal}\n\n=== แผนที่ทีมสร้างให้ (ตรวจว่าตรงกับช่องข้างบนไหม) ===\n${plan}` }] }], config: { systemInstruction: AUDIT_PROMPT, responseMimeType: "application/json", responseSchema: AUDIT_SCHEMA, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 1024 } } });
    const r = JSON.parse(resp.text);
    const flags = [];
    // เตือนเรื่องนิชเฉพาะเมื่อ AI มั่นใจพอ (≥0.6) — กันเตือนพร่ำเพรื่อจน "เมลเตือน" ไม่น่าเชื่อถือ
    if (r.niche_match === false && Number(r.confidence) >= 0.6) {
      flags.push(`🎯 แผนอาจไม่ตรงกับช่อง: ${String(r.niche_reason || "").slice(0, 200)}${r.real_niche_guess ? ` (ช่องน่าจะเป็นแนว "${String(r.real_niche_guess).slice(0, 60)}")` : ""}`);
    }
    // 🔢 ตัวเลขสถิติ: ตรวจด้วยโค้ด ไม่ถาม AI แล้ว
    // เหตุผล: AI แต่งกฎขึ้นมาเองซ้ำ 3 ครั้ง (@_junenicha อ่าน 23,700 เป็น 23 · @ceoliplover อ้างว่า
    // profile visits ต้อง ≥ likes · @davi_brand บอกว่า profile_visits 334 < reach 1828 ผิด ทั้งที่ปกติ)
    // เขียน prompt ห้ามละเอียดแค่ไหนก็ยังหลุด — กฎทั้ง 3 ข้อคำนวณเองได้ 100% จึงเลิกพึ่ง AI ตรงนี้
    if (hasNums) flags.push(...checkMetricsSanity(m));
    return flags;
  } catch (e) { console.warn("auditBlueprintMatch", e.message); return []; }
}

// ═══════ 📸 สรุปสิ้นเดือนจากแคป Insight — "ยิ่งใช้ยิ่งแม่น" (คิมสั่ง 3 ส.ค. 2569) ═══════
// คิม: "ลูกค้าต้องมาส่ง insight หลายคลิปเลยหรอ มันเยอะมากเลยนะ 30 คลิป — ทำแค่ตอนจบเดือนก็พอ
//       คือเราดูว่ายอดรายเดือนมันเพิ่มขึ้นจากคลิปไหน แล้วก็ให้ AI เอาข้อมูลนี้ไปทำงานต่อ
//       ไม่ต้องให้เค้ามากรอกรายคลิป มันเยอะมาก"
//
// ลูกค้าแคปหน้า Insights / Top content มาแค่รูปเดียว (หรือ 2-3 รูป) แล้ว AI อ่านให้ทั้งหมด
// แล้วจับคู่กับปฏิทิน 30 วันของเดือนนั้น → รู้ว่าแผนวันไหนที่ลงจริงแล้วไปได้ดี
const MONTH_REVIEW_SCHEMA = { type: Type.OBJECT, properties: {
  readable: { type: Type.BOOLEAN },
  unreadable_reason: { type: Type.STRING },
  posts: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
    label: { type: Type.STRING },              // ที่อ่านได้จากรูป (แคปชัน/หัวข้อ/สิ่งที่เห็นในภาพปก)
    views: { type: Type.NUMBER },
    matched_day: { type: Type.NUMBER },        // วันในแผนที่ตรงกัน · 0 = จับคู่ไม่ได้
    match_confidence: { type: Type.STRING },   // high | medium | low
  }, required: ["label", "views", "matched_day", "match_confidence"] } },
  worked: { type: Type.ARRAY, items: { type: Type.STRING } },
  didnt_work: { type: Type.ARRAY, items: { type: Type.STRING } },
  summary: { type: Type.STRING },
}, required: ["readable", "posts", "worked", "didnt_work", "summary"] };

const MONTH_REVIEW_PROMPT = `คุณคือครูพี่คิม กำลังดู "แคปหน้าสถิติสิ้นเดือน" ที่ลูกค้าส่งมา เพื่อสรุปว่าเดือนที่ผ่านมาคอนเทนต์แนวไหนเวิร์ก

หน้าที่:
1. อ่านรูปให้ครบทุกโพสต์ที่เห็น — เอา "ยอดวิว/ยอดเข้าถึง" ของแต่ละโพสต์ กับสิ่งที่พอบอกได้ว่าโพสต์นั้นเกี่ยวกับอะไร (จากแคปชัน/ตัวหนังสือบนภาพปก/สิ่งที่เห็นในภาพ)
2. จับคู่แต่ละโพสต์กับ "แผน 30 วัน" ที่ให้มา → ใส่ matched_day
   - ตรงชัด (หัวข้อ/แคปชันตรงกัน) = high · พอเดาได้จากแนวเรื่อง = medium · เดาไม่ออก = low
   - ⛔ ถ้าจับคู่ไม่ได้จริงๆ ให้ matched_day = 0 และ confidence = low — **ห้ามเดามั่วให้ครบ**
3. สรุป worked / didnt_work เป็นข้อสั้นๆ ที่เอาไปใช้วางแผนต่อได้ (พูดถึง "แนว/ฟอร์แมต/วิธีเปิดเรื่อง" ไม่ใช่แค่ชื่อคลิป)
4. summary = 2-3 ประโยคด้วยน้ำเสียงโค้ชที่อบอุ่น พูดกับเจ้าของช่องตรงๆ

⛔ กฎเหล็ก:
- ใช้เฉพาะตัวเลขที่เห็นในรูปจริงๆ ห้ามคำนวณเอง ห้ามเดา ห้ามแต่ง
- ถ้ารูปเบลอ/ไม่ใช่หน้าสถิติ/อ่านไม่ออก → readable = false + บอกเหตุผลสั้นๆ ว่าให้แคปหน้าไหนมาแทน
- ถ้าเห็นแค่ยอดรวมของช่อง ไม่เห็นรายโพสต์ → posts = [] แต่ยัง readable = true ได้ ถ้าสรุปภาพรวมได้`;

// อ่านแคปสิ้นเดือน + จับคู่กับปฏิทินของเดือนนั้น
export async function reviewMonth({ images, calendar, lang = "th" }) {
  const cal = (Array.isArray(calendar) ? calendar : []).map(c => `วันที่ ${c.d} · ${c.g || ""} · ${c.f || ""} · ${c.t || ""}${c.h ? ` · ฮุก: ${c.h}` : ""}`).join("\n");
  if (!ai) return {
    review: { readable: true, posts: [], worked: ["(โหมดทดสอบ — ใส่ GEMINI_API_KEY เพื่อให้ครูพี่คิมอ่านแคปจริง)"], didnt_work: [], summary: "โหมดทดสอบค่ะ" },
    model: "fallback-local", usage: { input: 0, output: 0, total: 0 },
  };
  const parts = [];
  for (const img of (images || [])) parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
  parts.push({ text: `แผน 30 วันของเดือนที่ผ่านมา (ใช้จับคู่กับโพสต์ในรูป):\n${cal}\n\nอ่านรูปแล้วตอบตามสเปก JSON` });
  const resp = await ai.models.generateContent({
    model: MODEL, contents: [{ role: "user", parts }],
    config: { systemInstruction: MONTH_REVIEW_PROMPT + langSuffix(lang), responseMimeType: "application/json",
              responseSchema: MONTH_REVIEW_SCHEMA, maxOutputTokens: 6000, thinkingConfig: { thinkingBudget: 2048 } },
  });
  const u = resp.usageMetadata || {};
  return { review: JSON.parse(resp.text), model: MODEL,
           usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, total: u.totalTokenCount || 0 } };
}

// ═══════ 🧠 AI ประเมินการทำงานรายคน (คิมสั่ง 4 ส.ค. 2569 — รายสัปดาห์) ═══════
// "ใช้ AI ประเมินการทำงานรายคน ส่งรายงานมาที่หน้าการทำงานของฉัน"
// ⛔ กฎเหล็ก: ประเมินจากตัวเลขจริงเท่านั้น ห้ามเดาเรื่องนิสัย/ทัศนคติของคน
//    รายงานนี้คิมอ่านคนเดียว แต่ต้องเขียนแบบที่กล้าให้เจ้าตัวอ่านได้
const TEAM_REVIEW_SCHEMA = { type: Type.OBJECT, properties: {
  headline: { type: Type.STRING },
  people: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
    name: { type: Type.STRING },
    status: { type: Type.STRING },        // ดีมาก | ปกติ | ต้องช่วย
    good: { type: Type.STRING },
    watch: { type: Type.STRING },
    suggest: { type: Type.STRING },
  }, required: ["name", "status", "good", "watch", "suggest"] } },
  team_risks: { type: Type.ARRAY, items: { type: Type.STRING } },
  kim_should_do: { type: Type.ARRAY, items: { type: Type.STRING } },
}, required: ["headline", "people", "team_risks", "kim_should_do"] };

const TEAM_REVIEW_PROMPT = `คุณคือที่ปรึกษาของคิม เจ้าของ Babe House กำลังอ่านตัวเลขการทำงานของทีมโปรดักชั่นสัปดาห์นี้

หน้าที่: อ่านตัวเลข แล้วบอกคิมว่า "ใครโอเค ใครต้องช่วย และคิมควรทำอะไร"

⛔ กฎเหล็ก:
- วิเคราะห์จาก **ตัวเลขที่ให้มาเท่านั้น** ห้ามเดานิสัย ทัศนคติ หรือเรื่องส่วนตัวของใคร
- คนที่งานน้อยไม่ได้แปลว่าขี้เกียจ — อาจเพราะระบบไม่ได้มอบงานให้ หรือเขาไม่ได้ลงวันว่าง ให้พูดถึงสาเหตุที่เป็นไปได้อย่างเป็นธรรม
- ถ้าข้อมูลน้อยเกินจะสรุป ให้บอกตรงๆ ว่า "ยังน้อยเกินจะสรุป" ห้ามแต่งให้ดูมีอะไร
- น้ำเสียง: ตรงไปตรงมาแต่เมตตา เขียนแบบที่ถ้าเจ้าตัวมาอ่านก็ไม่เสียใจ
- status: ใช้ "ดีมาก" / "ปกติ" / "ต้องช่วย" เท่านั้น
- kim_should_do: สิ่งที่คิมลงมือได้จริงในสัปดาห์นี้ 2-4 ข้อ ไม่ใช่คำแนะนำลอยๆ`;

export async function reviewTeamWeek({ people, jobs, week }) {
  if (!ai) return { review: { headline: "(โหมดทดสอบ — ใส่ GEMINI_API_KEY เพื่อให้ AI ประเมินจริง)",
    people: [], team_risks: [], kim_should_do: [] }, model: "fallback-local", usage: { input: 0, output: 0, total: 0 } };
  const text = `สัปดาห์: ${week}

ตัวเลขรายคน:
${people.map(p => `- ${p.name} (${p.position || p.role}): งานที่ถืออยู่ ${p.open_jobs} ชิ้น/${p.busy_clips} คลิป · ลงวันว่างไว้ ${p.capacity} คลิป · เหลือรับได้ ${p.free_slots}` +
  (p.score ? ` · ส่งแล้ว ${p.score.delivered}/${p.score.total} · ตรงเวลา ${p.score.on_time_pct ?? "ไม่มีข้อมูล"}% · โดนตีกลับเฉลี่ย ${p.score.rejects_per_job} ครั้ง/งาน` : " · ยังไม่มีสถิติสัปดาห์นี้")).join("\n")}

ภาพรวมงาน:
- งานที่ยังไม่มีคนทำ: ${jobs.unassigned} ชิ้น
- งานเลยกำหนดส่ง: ${jobs.late} ชิ้น
- งานที่รอลูกค้าส่งไฟล์: ${jobs.awaiting_files} ชิ้น
- งานที่ส่งให้ลูกค้าแล้วรอตอบ: ${jobs.draft_sent} ชิ้น

ตอบตามสเปก JSON`;
  const resp = await ai.models.generateContent({
    model: MODEL, contents: [{ role: "user", parts: [{ text }] }],
    config: { systemInstruction: TEAM_REVIEW_PROMPT, responseMimeType: "application/json",
              responseSchema: TEAM_REVIEW_SCHEMA, maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 2048 } },
  });
  const u = resp.usageMetadata || {};
  return { review: JSON.parse(resp.text), model: MODEL,
           usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0, total: u.totalTokenCount || 0 } };
}

// ═══════ 🏢 คอนเทนต์งานลูกค้า (คิมสั่ง 7 ส.ค.) ═══════
// ลูกตาลกรอกบรีฟลูกค้า → AI ร่างคอนเทนต์ให้ N ชิ้น → กันตรวจแก้ให้เป็นภาษาคน → ลูกตาลส่งลูกค้า
// ⚠️ ตั้งใจให้ AI เป็น "คนร่าง" ไม่ใช่ "คนตัดสิน" — กันต้องแก้ทุกชิ้นก่อนอนุมัติเสมอ
// 📝 ลูกตาลใช้จริงแล้วให้ฟีดแบ็ก 20 ส.ค. 2569 (ผ่านคิม) 2 ข้อ:
//    1. "อ่านบรีฟไม่ครบ ต้องให้อ่านละเอียดกว่านี้"
//    2. "อยากให้แยกแบบละเอียดขึ้น" — ส่งตัวอย่างมาให้ดู
//       ของเดิม AI ให้สคริปต์เป็นย่อหน้ายาว แล้วลูกตาลต้องมานั่งแตกเป็นช็อตเอง
//       ของที่อยากได้คือ "แยกทีละคัต" มี 4 บรรทัดต่อคัต: INS / ขึ้นภาพประกอบ / TEXT / VO
//       (INS = สั่งว่าถ่ายอะไร · TEXT = ตัวหนังสือบนจอ · VO = เสียงพากย์)
// ⚠️ ห้ามเปลี่ยนกลับไปเป็นย่อหน้ายาว — ทีมตัดต่อเอาไปใช้ต่อไม่ได้
const CLIENT_CONTENT_PROMPT = `คุณคือทีมครีเอทีฟของ Babe House ร่างคอนเทนต์ให้ลูกค้าตามบรีฟ

🔍 ขั้นที่ 1 — อ่านบรีฟให้ครบก่อนคิดอะไรทั้งสิ้น (ทีมบ่นว่ารอบก่อนอ่านไม่ครบ)
อ่านบรีฟ + ไฟล์แนบทั้งหมด แล้วดึงของจริงออกมาให้ครบ ห้ามข้าม:
- ชื่อแบรนด์ · ชื่อสินค้า/บริการ · ราคา · โปรโมชั่น · ที่ตั้ง · ช่องทางติดต่อ (ต้องสะกดตามบรีฟเป๊ะ)
- จุดขายที่ลูกค้าย้ำเอง · กลุ่มลูกค้าที่ระบุ · โทน/สไตล์ที่ขอ
- สิ่งที่ลูกค้า "ไม่อยากได้" — ข้อนี้สำคัญที่สุด ห้ามฝ่าฝืนเด็ดขาด
⛔ ห้ามแต่งข้อมูลที่ไม่มีในบรีฟ (ราคา ส่วนผสม รางวัล สรรพคุณ) — ไม่มีก็ไม่ต้องพูดถึง
✅ ทุกชิ้นต้องอ้างอิงของจริงจากบรีฟอย่างน้อย 1 อย่าง แล้วเขียนไว้ในช่อง angle ว่าหยิบข้อไหนมาใช้

🎬 ขั้นที่ 2 — เขียน script เป็น "แผนถ่ายทีละคัต" ไม่ใช่ย่อหน้ายาว
แต่ละคัตมี 4 บรรทัดนี้ เรียงตามนี้เสมอ (บรรทัดไหนไม่มีให้ข้ามไป):
INS: สั่งว่าถ่ายอะไร ใครทำท่าอะไร มุมกล้องแบบไหน
ขึ้นภาพประกอบ: ภาพ/คลิปที่ต้องเอามาแปะทับ (ถ้าไม่ต้องมีก็ข้าม)
TEXT: ตัวหนังสือที่ขึ้นบนจอ สั้น อ่านจบใน 2 วินาที
VO: บทพูด/เสียงพากย์ของคัตนี้
คั่นระหว่างคัตด้วยบรรทัดว่าง 1 บรรทัด · 1 ชิ้นควรมี 5-8 คัต

ตัวอย่างรูปแบบที่ต้องการ (เลียนแบบโครงนี้ ไม่ใช่ลอกเนื้อหา):
INS: เจ้าของแบรนด์ทำท่าสงสัยตอนพูด
ขึ้นภาพประกอบ: ภาพสินค้าวางบนโต๊ะ
TEXT: ทำเองได้ ไม่ต้องพึ่งใคร
VO: เคยคิดว่าเรื่องนี้ยากใช่ไหมคะ

INS: ถือสินค้าขึ้นมาให้เห็นชัด
TEXT: 3 ขั้นตอนง่ายๆ
VO: จริงๆ แล้วมีแค่ 3 ขั้นตอนเองค่ะ

หลักการเขียน
- ห้ามอ่านสเปกสินค้าดื้อๆ ต้องหามุมที่คนดูอยากดู
- ทุกชิ้นต้องต่างมุมกันจริงๆ ห้ามเป็นเรื่องเดิมเปลี่ยนคำ
- ภาษาพูดแบบคนไทยคุยกัน ไม่ใช่ภาษาโฆษณาแข็งๆ ไม่ใช้คำวัยรุ่นเกินจริง
- ห้ามกล่าวอ้างสรรพคุณเกินจริง โดยเฉพาะอาหาร/เครื่องสำอาง/อาหารเสริม

ตอบเป็น JSON เท่านั้น:
{"items":[{
  "title":"ชื่อคอนเทนต์สั้นๆ",
  "angle":"มุมเล่าคืออะไร 1 ประโยค + วงเล็บบอกว่าหยิบข้อไหนจากบรีฟมาใช้",
  "hook":"ประโยคเปิด 3 วินาทีแรก",
  "script":"แผนถ่ายทีละคัต รูปแบบ INS/ขึ้นภาพประกอบ/TEXT/VO ตามด้านบน",
  "visual":"ของที่ต้องเตรียมก่อนถ่าย: สถานที่ พร็อพ เสื้อผ้า สินค้าที่ต้องมี",
  "caption":"แคปชั่นลงโพสต์",
  "hashtags":"#แฮชแท็ก คั่นด้วยเว้นวรรค",
  "cta":"ปิดท้ายให้คนดูทำอะไร"
}]}`;

export async function generateClientContent({ client, brief, count = 5, refLinks = "", files = [] }) {
  const n = Math.max(1, Math.min(30, Number(count) || 5));
  if (!ai) {
    return { items: Array.from({ length: n }, (_, i) => ({
      title: `คอนเทนต์ชิ้นที่ ${i + 1} (ตัวอย่าง)`, angle: "โหมดทดสอบ ยังไม่ได้ต่อ AI",
      hook: "ฮุกตัวอย่าง", script: `สคริปต์ตัวอย่างสำหรับ ${client || "ลูกค้า"}`,
      visual: "ภาพตัวอย่าง", caption: "แคปชั่นตัวอย่าง", hashtags: "#BabeHouse", cta: "ทักแชทได้เลย",
    })), model: "fallback-local", usage: { input: 0, output: 0, total: 0 } };
  }
  // ไฟล์บรีฟที่ลูกตาลแนบ (PDF/รูป) — Gemini อ่านได้ตรงๆ ไม่ต้องให้คนพิมพ์ซ้ำ
  const fileParts = [];
  for (const f of files) {
    const m = String(f || "").match(/^data:(application\/pdf|image\/jpeg|image\/png|image\/webp);base64,(.+)$/);
    if (m) fileParts.push({ inlineData: { mimeType: m[1], data: m[2] } });
    if (fileParts.length >= 4) break;
  }
  const text = `ลูกค้า: ${client || "-"}
จำนวนคอนเทนต์ที่ต้องการ: ${n} ชิ้น

บรีฟจากลูกค้า:
${brief || "(ดูจากไฟล์แนบ)"}
${refLinks ? `\nตัวอย่าง/อ้างอิงที่ลูกค้าส่งมา:\n${refLinks}` : ""}
${fileParts.length ? "\n📎 มีไฟล์บรีฟแนบมาด้วย อ่านให้ครบ" : ""}

สร้าง JSON ตามสเปก ให้ครบ ${n} ชิ้น ทุกชิ้นต้องต่างมุมกันจริงๆ`;
  const { resp, model } = await genContent({
    contents: [{ role: "user", parts: [...fileParts, { text }] }],
    // ⚠️ สคริปต์แบบแยกคัต (INS/TEXT/VO 5-8 คัต) ยาวกว่าย่อหน้าเดิมราว 2 เท่า
    //    เพดานเดิม 2200 tokens/ชิ้น ทำให้ชิ้นท้ายๆ ถูกตัดกลางคัน → ขยายเป็น 4000
    //    thinkingBudget เพิ่มด้วย เพราะต้องอ่านบรีฟให้ครบก่อนคิด (ลูกตาลบ่นว่าอ่านไม่ครบ)
    config: { systemInstruction: CLIENT_CONTENT_PROMPT, responseMimeType: "application/json",
              maxOutputTokens: Math.min(60000, 4000 * n + 4000), thinkingConfig: { thinkingBudget: 4096 } },
    retries: 2,
  });
  if (!resp.text?.trim()) throw new Error(`empty response (finishReason=${resp.candidates?.[0]?.finishReason || "?"})`);
  const raw = JSON.parse(resp.text);
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, n).map(x => ({
    title: String(x.title || "").slice(0, 200), angle: String(x.angle || "").slice(0, 500),
    // ⚠️ script เก็บแผนถ่ายทีละคัตแล้ว ยาวกว่าเดิมมาก — เพดาน 6000 เดิมตัดทิ้งกลางคัต
    hook: String(x.hook || "").slice(0, 500), script: String(x.script || "").slice(0, 20000),
    visual: String(x.visual || "").slice(0, 2000), caption: String(x.caption || "").slice(0, 2000),
    hashtags: String(x.hashtags || "").slice(0, 500), cta: String(x.cta || "").slice(0, 300),
  }));
  if (!items.length) throw new Error("AI ไม่ได้ส่งคอนเทนต์กลับมา");
  return { items, model, usage: usageOf(resp) };
}
