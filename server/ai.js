// AI provider = Gemini (Google GenAI). มี fallback (เทมเพลต) เมื่อไม่มีคีย์
import { GoogleGenAI, Type } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_TOK = Number(process.env.GEMINI_MAX_TOKENS || 30000);
export const AI_ENABLED = !!process.env.GEMINI_API_KEY;
const ai = AI_ENABLED ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
export const aiModelName = () => (AI_ENABLED ? MODEL : "fallback-local");

// ===== System Prompt: ครูพี่คิม + สเปก JSON ที่ dashboard ต้องการ =====
const KIM_PROMPT = `คุณคือ "ครูพี่คิม" ซีอีโอและผู้ก่อตั้ง Babe House Academy แบรนด์สอนทำคอนเทนต์ระดับพรีเมียมของไทย
บุคลิก: อบอุ่น เป็นกันเอง แบบพี่สาวลูกคุณหนูโกอินเตอร์ วิเคราะห์ธุรกิจและจิตวิทยาการปิดการขายเฉียบคม ภาษาไทยสวย มีน้ำหนัก
หน้าที่: อ่านข้อมูลฟอร์ม + รูปสถิติหลังบ้าน Instagram/TikTok แล้วสร้าง Blueprint เฉพาะตัวสำหรับเสียบ Dashboard

กฎ:
1. ตอบกลับเป็น JSON object ล้วนเท่านั้น (ไม่มีข้อความอื่น ไม่มี markdown)
2. เขียนคัสตอมให้บัญชีที่ส่งมาเท่านั้น ห้ามใช้เนื้อหากลางๆ
3. calendar ต้องครบ 30 วัน, scripts ต้องครบ 30 วัน (1 สคริปต์ต่อ 1 วัน เรียง d 1-30) ห้ามซ้ำบทพูด
4. beats ทุกวันต้องมี HOOK, BODY, CTA และ say เป็นบทพูดเต็มที่อัดได้ทันที ห้ามใส่ "..."
5. what_we_see อ้างอิงตัวเลขจากรูป/ฟอร์ม, metrics ใส่ตัวเลขจริงจากรูป (เป็น number)
6. ดึงจุดยืน Premium / Social Proof / Link-in-bio / Conversion / Marathon

ส่ง JSON object ตามรูปแบบนี้ (ทุก key ต้องมี):
{
 "instagram_account": string, "theme": string, "greeting": string,
 "pillars": [string x4],
 "what_we_see": [string x>=5], "audience_summary": string, "follower_insight": string, "market_tier": string, "positioning": string, "kim_insight": string,
 "swot": {"strengths":[string],"weaknesses":[string],"opportunities":[string],"threats":[string]},
 "modules": {
   "archetype": {"name":string,"body":string,"tone":string,"look":string},
   "avatar": {"name":string,"think":string,"see":string,"hear":string,"fear":string,"hookbank":[string]},
   "competitor": {"intro":string,"rows":[{"name":string,"they":string,"gap":string}],"blueocean":string},
   "values": {"list":[string],"manifesto":string},
   "funnel": {"top":{"label":string,"pct":number,"body":string},"middle":{"label":string,"pct":number,"body":string},"bottom":{"label":string,"pct":number,"body":string},"note":string}
 },
 "calendar": [ {"d":number,"g":"Awareness"|"Conversion"|"Branding","t":string,"h":string,"f":string} x30 ],
 "scripts": [ {"d":number,"g":string,"beats":[{"ts":string,"s":"HOOK"|"BODY"|"CTA","say":string,"ost":string,"vis":string} x3],"cap":string,"tip":string} x30 ],
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
export async function generateBlueprint(parsed) {
  if (!ai) return { blueprint: buildFallbackBlueprint(parsed), model: "fallback-local" };
  const images = extractImages(parsed);
  const fr = parsed.form_responses;
  const userText = `ข้อมูลผู้ใช้:\ninstagram_account: ${parsed.instagram_account}\ntier: ${parsed.meta_purchase.tier}\nbilling_cycle: ${parsed.meta_purchase.billing_cycle}\n\nคำตอบจากฟอร์ม:\nbusiness_type: ${fr.business_type}\nstarting_point: ${fr.starting_point}\nmonthly_goal: ${fr.monthly_goal}\ncompetitor_1: ${fr.competitor_1}\ncompetitor_2: ${fr.competitor_2}\n\nโปรดอ่านรูปสถิติหลังบ้านที่แนบมา แล้วสร้าง Blueprint JSON ครบทุก key ตามสเปก`;
  const parts = [];
  for (const img of images) parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
  parts.push({ text: userText });
  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: { systemInstruction: KIM_PROMPT, responseMimeType: "application/json", maxOutputTokens: MAX_TOK }
  });
  const blueprint = JSON.parse(resp.text);
  return { blueprint, model: MODEL };
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
    what_we_see: ["คนเข้าโปรไฟล์เยอะแต่กดลิงก์น้อย", "คอนเทนต์มีคุณภาพแต่ยังไม่มีระบบ", "กลุ่มเป้าหมายเป็นผู้หญิงวัยทำงาน", "ยอด reach ดีแต่ conversion ต่ำ", "ยังไม่มี CTA ที่ชัด"],
    audience_summary: "ผู้หญิงวัยทำงาน 25-34 สนใจพัฒนาตัวเอง", follower_insight: "ผู้ติดตามส่วนใหญ่เป็นกลุ่มเป้าหมายจริง", market_tier: "Premium",
    positioning: `${account} คือแบรนด์พรีเมียมที่เปลี่ยนความสนใจเป็นยอดสมัครจริง`,
    kim_insight: "คนที่กดเข้าโปรไฟล์ไม่ใช่คนเย็นแล้ว หน้าที่เดือนนี้คือทำป้ายบอกทางให้ชัดว่าเขาต้องกดตรงไหน",
    swot: { strengths: ["คอนเทนต์มีคุณภาพ", "มีฐานแฟนจริง"], weaknesses: ["ไม่มีระบบ CTA", "conversion ต่ำ"], opportunities: ["ตลาด Premium ยังโตได้", "ทำคอร์ส/แพ็กเกจ"], threats: ["คู่แข่งสายราคาถูก", "อัลกอริทึมเปลี่ยน"] },
    modules: { archetype: { name: "The Mentor–Muse", body: "พี่สาวผู้ชี้ทางที่มีรสนิยม", tone: "อบอุ่น คม ชัด", look: "คลีน ฟ้า ขาว พรีเมียม" }, avatar: { name: "มินนี่ อายุ 24", think: "อยากเก่งขึ้นแต่กลัวลองผิด", see: "คู่แข่งเต็มฟีด", hear: "ต้องทำคลิปแต่ไม่รู้เริ่มตรงไหน", fear: "กลัวลงทุนไม่คุ้ม", hookbank: ["ทำคลิปเป็นสิบยอดไม่ขึ้นเพราะอะไร", "ช่องดูดีแต่ขายไม่ได้ แก้ตรงนี้", "ไม่มีพื้นฐานก็ทำคลิปดูแพงได้"] }, competitor: { intro: "ตลาดมีทั้งสายถูกและสายฟรี", rows: [{ name: "สายราคาถูก", they: "ลดราคา สอนกว้าง", gap: "เราจับมือทำจริง" }, { name: "สายฟรี", they: "แจกทริคเร็วๆ", gap: "เรามีระบบและผลลัพธ์" }], blueocean: "พรีเมียม อบอุ่น จับมือทำจริง" }, values: { list: ["Support over Sales", "Premium is a Feeling", "We Rise Together"], manifesto: "Babe House เชื่อว่าผู้หญิงทุกคนสร้างคอนเทนต์ที่ดูแพงและเปลี่ยนชีวิตได้เมื่อมีระบบ" }, funnel: { top: { label: "TOP", pct: 30, body: "ดักคนใหม่" }, middle: { label: "MIDDLE", pct: 50, body: "สร้างความเชื่อใจ" }, bottom: { label: "BOTTOM", pct: 20, body: "ปิดการขาย" }, note: "อย่าขายติดกันรัว เลี้ยงความเชื่อก่อนปิด" } },
    calendar, scripts, metrics
  };
}

// ===== Growth analysis (โค้ชชิ่ง) =====
const GROWTH_SCHEMA = { type: Type.OBJECT, properties: { headline: { type: Type.STRING }, growth_drivers: { type: Type.ARRAY, items: { type: Type.STRING } }, strengths: { type: Type.ARRAY, items: { type: Type.STRING } }, watchouts: { type: Type.ARRAY, items: { type: Type.STRING } }, next_focus: { type: Type.ARRAY, items: { type: Type.STRING } }, coach_message: { type: Type.STRING } }, required: ["headline", "growth_drivers", "strengths", "watchouts", "next_focus", "coach_message"] };
function pct(a, b) { return (a == null || b == null || a === 0) ? null : Math.round((b - a) / a * 1000) / 10; }
function metricsText(months) { return months.map(m => { const x = m.metrics || {}; return `- ${m.billing_cycle} | เป้า:${m.monthly_goal || "-"} | followers:${x.followers ?? "-"} reach:${x.reach ?? "-"} link_taps:${x.link_taps ?? "-"} eng:${x.engagement_rate ?? "-"}%`; }).join("\n"); }

export async function generateGrowthAnalysis(months) {
  if (!ai) return { analysis: buildFallbackGrowth(months), model: "fallback-local" };
  const sys = `คุณคือ "ครูพี่คิม" โค้ชคอนเทนต์ วิเคราะห์การเติบโตจากสถิติหลายเดือนด้วยน้ำเสียงอบอุ่น จริงใจ ตรงไปตรงมา ทำให้ลูกค้าเห็นตัวเอง พูดทั้งข้อดีข้อเสีย next_focus ทำได้จริง coach_message จบด้วยชวนไปต่อเดือนหน้า อ้างอิงตัวเลขจริง`;
  const resp = await ai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts: [{ text: `ข้อมูลรายเดือน (เก่า→ใหม่):\n${metricsText(months)}\nธุรกิจ: ${months[months.length-1].business_type || "-"}\nจำนวนเดือน: ${months.length}` }] }], config: { systemInstruction: sys, responseMimeType: "application/json", responseSchema: GROWTH_SCHEMA, maxOutputTokens: 4000 } });
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
export function classifyKeyword(text) {
  const t = String(text || "").toLowerCase();
  if (/สกิน|ความงาม|เครื่องสำอาง|คอสเมติก|beauty|skincare|สปา|เล็บ|ทำผม|แต่งหน้า|ครีม|เซรั่ม/.test(t)) return "ความงาม/สกินแคร์";
  if (/อาหาร|เครื่องดื่ม|คาเฟ่|กาแฟ|ร้านอาหาร|ขนม|เบเกอรี่|food|cafe|coffee|เดลิเวอรี|ชานม/.test(t)) return "อาหาร&เครื่องดื่ม";
  if (/แฟชั่น|เสื้อผ้า|กระเป๋า|รองเท้า|fashion|เครื่องประดับ|จิวเวลรี|ชุด/.test(t)) return "แฟชั่น/เครื่องแต่งกาย";
  if (/คลินิก|สุขภาพ|หมอ|แพทย์|ทันตก|ฟัน|clinic|health|กายภาพ|รักษา|ยา|wellness/.test(t)) return "สุขภาพ&คลินิก";
  if (/สอน|คอร์ส|เรียน|อบรม|course|academy|โรงเรียน|ติว|workshop|โค้ช/.test(t)) return "การศึกษา&คอร์ส";
  if (/บริการ|ฟรีแลนซ์|รับทำ|เอเจนซี|agency|freelance|ที่ปรึกษา|ออกแบบ|กราฟิก|ตัดต่อ|ถ่ายภาพ/.test(t)) return "บริการ&ฟรีแลนซ์";
  if (/อสังหา|บ้าน|คอนโด|ที่ดิน|property|ประกัน|การเงิน|ลงทุน|finance/.test(t)) return "อสังหา/การเงิน";
  if (/ท่องเที่ยว|ทัวร์|โรงแรม|ที่พัก|travel|hotel|resort|ไลฟ์สไตล์|รีวิว/.test(t)) return "ท่องเที่ยว/ไลฟ์สไตล์";
  return "อื่นๆ";
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
