// ระบบ 2 ภาษา (ไทย/อังกฤษ) — เบาๆ ไม่ใช้ไลบรารี เก็บภาษาที่เลือกใน localStorage
import { useSyncExternalStore } from "react";

let lang = "th";
try { const s = localStorage.getItem("babe_lang"); if (s === "en" || s === "th") lang = s; } catch {}
if (typeof document !== "undefined") document.documentElement.lang = lang;

const listeners = new Set();
export function getLang() { return lang; }
export function setLang(l) {
  lang = l === "en" ? "en" : "th";
  try { localStorage.setItem("babe_lang", lang); } catch {}
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// hook: คืน { lang, setLang, t } — คอมโพเนนต์ที่เรียกจะ re-render เมื่อสลับภาษา
export function useI18n() {
  const l = useSyncExternalStore(subscribe, getLang, () => "th");
  return { lang: l, setLang, t: (k) => translate(k, l) };
}
// แปลแบบไม่ผูก React (เผื่อใช้นอกคอมโพเนนต์)
export function t(k) { return translate(k, lang); }
function translate(k, l) { const e = DICT[k]; return e ? (e[l] ?? e.th ?? k) : k; }

// ปุ่มสลับภาษา — โชว์ภาษาที่จะสลับไป
export function LangToggle({ dark = false }) {
  const { lang, setLang } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === "th" ? "en" : "th")}
      aria-label="Switch language / สลับภาษา"
      style={{ background: "none", border: `1px solid ${dark ? "rgba(255,255,255,.45)" : "var(--border)"}`, color: dark ? "#fff" : "var(--ink)", borderRadius: 20, padding: "5px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
    >
      {lang === "th" ? "🇬🇧 EN" : "🇹🇭 ไทย"}
    </button>
  );
}

const DICT = {
  // ราคา (EN โชว์ ฿ + ประมาณ $ ให้ฝรั่งเทียบง่าย — จ่ายจริงเป็น THB ผ่าน Stripe)
  price_full: { th: "1,590฿", en: "฿1,590 (~$44)" },
  price_promo: { th: "490฿", en: "฿490 (~$14)" },

  // เมนูบน + ทั่วไป
  nav_promo: { th: "โปรเปิดตัว", en: "Launch offer" },
  nav_login: { th: "เข้าสู่ระบบ", en: "Log in" },
  nav_home: { th: "หน้าแรก", en: "Home" },
  nav_account: { th: "บัญชีของฉัน", en: "My account" },
  cta_start: { th: "เริ่มสร้าง Blueprint ของฉัน →", en: "Create my Blueprint →" },
  cta_see_demo: { th: "ดูตัวอย่างผลลัพธ์ก่อน", en: "See a sample result" },

  // HERO
  hero_badge: { th: "🩵 โปรเปิดตัว — กลุ่มแรกเท่านั้น", en: "🩵 Launch offer — first group only" },
  hero_title_a: { th: "ทำคอนเทนต์มานาน", en: "Posting for months," },
  hero_title_b: { th: "แต่ช่องไม่โตสักที?", en: "but not growing?" },
  hero_sub: { th: "ครูพี่คิมอ่าน Insight ของคุณ แล้ววางแผนคอนเทนต์ 30 วัน พร้อมสคริปต์และแคปชัน", en: "Kim reads your Insights and builds a 30-day content plan — scripts and captions included." },
  hero_for_launch: { th: "ราคาโปรเปิดตัว · จ่ายหลังดูสรุปแล้ว", en: "Launch price · pay only after you see the summary" },
  // พรีวิวเล่ม (ภาพสินค้าใน hero)
  preview_label: { th: "เล่ม 30 วันของคุณ", en: "Your 30-Day Blueprint" },
  preview_cal: { th: "📅 ปฏิทินคอนเทนต์ 30 วัน", en: "📅 30-Day Content Calendar" },
  preview_day: { th: "วันที่ 1 · เปิดเรื่อง", en: "DAY 1 · HOOK" },
  preview_hook: { th: "“หยุดเลื่อนก่อน — นี่คือเหตุผลที่ยอดวิวคุณนิ่ง…”", en: "“Stop scrolling — here's why your views are stuck…”" },
  hero_nocharge: { th: "🔒 กรอกข้อมูลช่องก่อน · ดูสรุปแล้วค่อยจ่าย — กดแล้วยังไม่ตัดเงิน", en: "🔒 Fill in your channel first · see the summary, then pay — you won't be charged yet" },
  hero_returning: { th: "นักเรียนเก่า? เข้าสู่ระบบที่นี่ →", en: "Returning user? Log in here →" },

  // PAIN
  pain_title: { th: "คุณกำลังเจอแบบนี้อยู่ไหม?", en: "Are you facing any of these?" },
  probs: { th: [
    ["😮‍💨", "ลงคลิปทุกวันแต่ยอดวิวนิ่ง", "ทำมานานแต่ยอดไม่ขึ้น ไม่รู้อันไหนเวิร์ก"],
    ["📉", "คนติดตามไม่เพิ่ม reach ตก", "คนใหม่ไม่เข้ามา ช่องโตช้า"],
    ["🤔", "คิดคอนเทนต์ไม่ออก", "นั่งคิดทุกวันว่าวันนี้ลงอะไรดี เสียเวลา"],
    ["💸", "มีคนดูแต่ไม่ซื้อ", "ยอดวิวดีแต่เปลี่ยนเป็นรายได้ไม่ได้"],
  ], en: [
    ["😮‍💨", "Posting daily but views are flat", "Been at it a while but numbers won't move — and you don't know what's working"],
    ["📉", "Followers stuck, reach dropping", "New people aren't coming in; the channel grows slowly"],
    ["🤔", "Out of content ideas", "Wasting time every day wondering what to post"],
    ["💸", "Views but no sales", "Good reach, but it never turns into revenue"],
  ] },

  // HOW IT WORKS
  how_label: { th: "ใช้งานยังไง?", en: "How it works" },
  how_title: { th: "3 ขั้นตอน ง่ายๆ", en: "3 simple steps" },
  steps3: { th: [
    ["📝", "1. กรอกข้อมูลช่องของคุณ", "บอกเราว่าคุณเป็นใคร ทำธุรกิจอะไร ตอนนี้ติดปัญหาอะไร และเดือนนี้อยากโตตรงไหน"],
    ["📊", "2. แนบรูป Insight หลังบ้าน", "แนบได้หลายภาพ เช่น Reach, Profile Visits, Link Taps, Audience, Top Content หรือสถิติที่คุณมี"],
    ["📘", "3. รับ Blueprint 30 วัน", "ระบบจะวิเคราะห์และสร้างแผนคอนเทนต์ พร้อม Hook, Format, Script, Caption และระบบ Marathon ให้คุณเริ่มทำจริง"],
  ], en: [
    ["📝", "1. Tell us about your channel", "Who you are, what you sell, what you're stuck on, and where you want to grow this month"],
    ["📊", "2. Attach your Insights screenshots", "Add as many as you like — Reach, Profile Visits, Link Taps, Audience, Top Content, or any stats you have"],
    ["📘", "3. Get your 30-day Blueprint", "We analyze and build a content plan with Hooks, Formats, Scripts, Captions, and a Marathon tracker to get you started"],
  ] },
  how_note: { th: "ยิ่งกรอกละเอียด ยิ่งได้ Blueprint ที่แม่นขึ้น แต่ถ้าไม่รู้บางข้อ เว้นว่างได้ค่ะ", en: "The more detail you give, the sharper your Blueprint — but feel free to leave blanks if you're unsure." },

  // OFFER (490)
  offer_title_pre: { th: "โปรเปิดตัว", en: "What's in the" },
  offer_title_post: { th: "ได้อะไรบ้าง?", en: "launch offer?" },
  offer_desc_a: { th: "จากราคาเต็ม", en: "Down from" },
  offer_desc_b: { th: "ช่วงเปิดตัวนี้คุณจะได้ Blueprint วิเคราะห์ช่องและวางแผนคอนเทนต์ทั้งเดือนในราคา", en: "— during launch you get a full channel analysis and a month of content planning for just" },
  offer_includes: { th: [
    "วิเคราะห์จุดแข็งและจุดอ่อนของช่อง",
    "วิเคราะห์กลุ่มเป้าหมายและสิ่งที่เขาต้องการ",
    "วิเคราะห์ช่องว่างระหว่างคนดู โปรไฟล์ และยอดกดลิงก์",
    "วาง Theme คอนเทนต์ประจำเดือน",
    "ได้แผนคอนเทนต์ 30 วัน",
    "ได้ Hook และ Format ของแต่ละคลิป",
    "ได้สคริปต์พร้อมถ่ายสำหรับคลิปสำคัญ",
    "ได้แคปชันพร้อมโพสต์",
    "ได้ระบบ 30-Day Marathon ช่วยติดตามความต่อเนื่อง",
    "กลับมาสร้าง Blueprint ใหม่ได้ทุกเดือน เพื่อเทียบการเติบโตและปรับแผนให้แม่นขึ้น",
  ], en: [
    "Analysis of your channel's strengths and weaknesses",
    "A read on your audience and what they actually want",
    "The gap between viewers, profile visits, and link taps",
    "A monthly content theme",
    "A full 30-day content plan",
    "Hook and Format for every clip",
    "Ready-to-shoot scripts for your key clips",
    "Ready-to-post captions",
    "A 30-Day Marathon tracker for consistency",
    "Come back monthly to compare growth and sharpen the plan",
  ] },
  offer_worth: { th: "ถ้าคุณเสียเวลาคิดคอนเทนต์ทั้งเดือนมากกว่า 1 ชั่วโมง โปรเปิดตัวนี้คุ้มมากค่ะ", en: "If planning a month of content costs you more than an hour, this launch offer pays for itself." },
  offer_cta: { th: "รับโปรเปิดตัว", en: "Get the launch offer" },

  // LAUNCH PRICE CARD
  launch_label: { th: "LAUNCH OFFER", en: "LAUNCH OFFER" },
  launch_title: { th: "โปรเปิดตัว สำหรับกลุ่มแรก", en: "Launch offer for the first group" },
  launch_save: { th: "ประหยัด 1,100฿ ในช่วงเปิดตัว", en: "Save ฿1,100 during launch" },
  card_includes: { th: [
    "วิเคราะห์ช่องจากข้อมูลจริงของคุณ",
    "แนบ Insight หลังบ้านได้หลายรูป",
    "แผนคอนเทนต์ 30 วัน",
    "Script & Caption พร้อมต่อยอด",
    "Creator Marathon Dashboard",
  ], en: [
    "Channel analysis from your real data",
    "Attach multiple Insights screenshots",
    "30-day content plan",
    "Scripts & Captions ready to build on",
    "Creator Marathon Dashboard",
  ] },
  card_nocharge: { th: "กรอกข้อมูลก่อน · ดูสรุปแล้วค่อยจ่าย — กดแล้วยังไม่ตัดเงิน", en: "Fill in first · see the summary, then pay — you won't be charged yet" },

  // EXAMPLE
  ex_label: { th: "ตัวอย่างผลลัพธ์", en: "Sample result" },
  ex_title: { th: "ตัวอย่าง Blueprint ที่คุณจะได้รับ", en: "A sample of the Blueprint you'll get" },
  example_cards: { th: [
    ["📊", "Executive Snapshot", "สรุปปัญหา โอกาส และสิ่งที่ควรทำทันที แบบอ่านจบใน 30 วินาที"],
    ["📅", "30-Day Content Calendar", "แผนคอนเทนต์ทั้งเดือน แบ่ง Awareness, Branding และ Conversion"],
    ["🎬", "Scripts & Captions", "สคริปต์พร้อมถ่ายและแคปชันที่เอาไปปรับใช้ได้ทันที"],
    ["🏃‍♀️", "Creator Marathon", "ระบบติดตามการลงงาน สะสมดาว และช่วยให้คุณไม่หายไปกลางเดือน"],
  ], en: [
    ["📊", "Executive Snapshot", "Problems, opportunities, and what to do now — readable in 30 seconds"],
    ["📅", "30-Day Content Calendar", "A full month split into Awareness, Branding, and Conversion"],
    ["🎬", "Scripts & Captions", "Ready-to-shoot scripts and captions you can use right away"],
    ["🏃‍♀️", "Creator Marathon", "Tracks your posting, builds streaks, and keeps you from disappearing mid-month"],
  ] },
  ex_see_dash: { th: "ดูตัวอย่าง Dashboard", en: "See a sample Dashboard" },
  ex_try: { th: "ลองสร้างแผนของช่องฉันในราคาโปร", en: "Build my channel's plan at the launch price" },

  // VS AI
  vs_title: { th: "ต่างจากการใช้ AI เองยังไง?", en: "How is this different from using AI yourself?" },
  vs_p1: { th: "ใช้ AI เองได้ค่ะ แต่หลายคนยังเหนื่อย เพราะยังต้องคิด prompt เอง วางกลุ่มเป้าหมายเอง เลือกหัวข้อเอง และจัด calendar เอง", en: "You can use AI yourself — but it's still tiring: you write the prompts, define the audience, pick the topics, and build the calendar." },
  vs_p2: { th: "Blueprint ต่างออกไป เพราะเราใส่ workflow การทำคอนเทนต์ของ Babe House ไว้ในระบบแล้ว — คุณไม่ต้องเริ่มจากหน้าว่างๆ แค่กรอกข้อมูลครั้งเดียว ระบบจะช่วยจัดออกมาเป็นแผนที่พร้อมใช้", en: "Blueprint is different: the Babe House content workflow is built in. You don't start from a blank page — fill in once and get a ready-to-use plan." },
  vs_self_h: { th: "😓 ใช้ AI เอง", en: "😓 DIY with AI" },
  vs_bp_h: { th: "🩵 ใช้ Blueprint", en: "🩵 With Blueprint" },
  vs_self: { th: ["ต้องคิด prompt เอง", "ต้องวาง funnel เอง", "ต้องเลือกไอเดียเอง", "ต้องจัด calendar เอง", "ต้องเขียน script/caption ต่อเอง"],
    en: ["Write your own prompts", "Design your own funnel", "Pick your own ideas", "Build your own calendar", "Write your own scripts/captions"] },
  vs_bp: { th: ["กรอกข้อมูลครั้งเดียว", "วิเคราะห์จาก Insight จริง", "ได้ Theme รายเดือน", "ได้ Calendar 30 วัน", "ได้ Script/Caption พร้อมต่อยอด"],
    en: ["Fill in once", "Analyzed from real Insights", "A monthly theme", "A 30-day calendar", "Scripts/Captions ready to build on"] },
  vs_tagline: { th: "นี่ไม่ใช่ AI เปล่าๆ แต่เป็น AI ที่ออกแบบมาเพื่อคนทำคอนเทนต์โดยเฉพาะ", en: "This isn't raw AI — it's AI built specifically for content creators." },

  // PROOF
  proof_title: { th: "ทดลองกับช่องจริงก่อนเปิดขาย", en: "Tested on real channels before launch" },
  proof_intro: { th: "ก่อนเปิดให้ทุกคนใช้ Babe House ทดลอง framework นี้กับช่องของเราเองก่อน เราเห็นชัดว่าเมื่อหยุดเดา แล้วเริ่มวางคอนเทนต์จากข้อมูลจริง เราจะรู้มากขึ้นว่า:", en: "Before opening it up, Babe House tested this framework on our own channels. Once we stopped guessing and planned from real data, it became clear:" },
  proof_points: { th: ["คอนเทนต์ไหนดึงคนใหม่", "คอนเทนต์ไหนสร้างความเชื่อใจ", "คอนเทนต์ไหนพาคนเข้าโปรไฟล์", "ตรงไหนคือ Conversion Leak ที่ควรอุด"],
    en: ["Which content pulls in new people", "Which content builds trust", "Which content drives profile visits", "Where the conversion leak is — and how to plug it"] },
  proof_outro: { th: "Blueprint คือการเอาวิธีคิดนี้มาช่วยวิเคราะห์ช่องของคุณ ในแบบที่เข้าใจง่ายและลงมือทำต่อได้จริง", en: "Blueprint brings that same thinking to your channel — clear, and ready to act on." },

  // SOCIAL PROOF
  sp_label: { th: "เสียงจากคนใช้จริง", en: "From real users" },
  sp_title: { th: "คนทำคอนเทนต์พูดถึง Blueprint ยังไง", en: "What creators say about Blueprint" },
  sp_from: { th: "จาก", en: "from" },
  sp_reviews: { th: "รีวิว", en: "reviews" },
  sp_anon: { th: "ลูกค้า Babe House", en: "Babe House customer" },
  sp_cta: { th: "เริ่มสร้าง Blueprint ของฉัน", en: "Create my Blueprint" },

  // MONTHLY
  monthly_title: { th: "ทำไมควรสร้าง Blueprint ใหม่ทุกเดือน?", en: "Why create a new Blueprint each month?" },
  monthly_p1: { th: "คอนเทนต์ไม่ใช่งานที่วางแผนครั้งเดียวแล้วจบค่ะ — เดือนนี้คนอาจชอบ topic หนึ่ง เดือนหน้า trend อาจเปลี่ยน บางเดือน reach ดีแต่กดลิงก์น้อย บางเดือนคนดูเยอะแต่ยังไม่เชื่อใจพอจะซื้อ", en: "Content isn't plan-once-and-done — this month one topic lands, next month the trend shifts; some months reach is great but link taps are low, others get views but not enough trust to buy." },
  monthly_p2: { th: "ยิ่งคุณกลับมาสร้าง Blueprint ใหม่ทุกเดือน ระบบยิ่งเข้าใจช่องของคุณมากขึ้น", en: "The more you come back each month, the better the system understands your channel." },
  monthly_cards: { th: [
    ["🌱", "เดือนแรก", "เริ่มรู้จักช่องของคุณ — วางแผนจากข้อมูลจริง ไม่ต้องเดา"],
    ["📈", "เดือนต่อไป", "เห็น pattern การเติบโต ว่าคอนเทนต์ไหนเวิร์ก"],
    ["🎯", "ใช้ต่อเนื่อง", "วางแผนแม่นขึ้นทุกเดือน ระบบยิ่งเข้าใจช่องคุณ"],
  ], en: [
    ["🌱", "Month one", "Get to know your channel — plan from real data, no guessing"],
    ["📈", "Following months", "See your growth pattern and what's working"],
    ["🎯", "Ongoing", "Sharper planning every month as the system learns your channel"],
  ] },
  monthly_cta: { th: "เริ่มเดือนแรกในราคาโปร", en: "Start month one at the launch price" },

  // FAQ
  faq_title: { th: "คำถามที่พบบ่อย", en: "Frequently asked questions" },
  faqs: { th: [
    ["ต้องมีผู้ติดตามเยอะไหมถึงใช้ได้?", "ไม่จำเป็นค่ะ ใช้ได้ทั้งคนเริ่มต้นและคนที่ทำคอนเทนต์มาสักพักแล้ว ถ้ามี Insight หลังบ้าน ระบบจะวิเคราะห์ได้ละเอียดขึ้น"],
    ["ถ้าไม่รู้ว่าคู่แข่งคือใครทำยังไง?", "เว้นว่างได้ค่ะ ระบบจะช่วยวิเคราะห์คู่แข่งเชิงตลาดจากประเภทธุรกิจและเป้าหมายของคุณ"],
    ["แนบรูปอะไรได้บ้าง?", "แนบได้หลายภาพ เช่น Reach, Profile Visits, Link Taps, Audience, Top Content, Follower Growth หรือสถิติที่คุณมี"],
    ["หลังจ่ายเงินจะได้อะไร?", "คุณจะได้ Dashboard ส่วนตัวที่มีการวิเคราะห์ช่อง แผนคอนเทนต์ 30 วัน สคริปต์ แคปชัน และระบบติดตาม Marathon"],
    ["ใช้เวลาประมวลผลนานไหม?", "โดยทั่วไปใช้เวลาไม่นาน แต่ขึ้นอยู่กับจำนวนรูปและข้อมูลที่ส่งมา ระหว่างรอระบบจะพาไปหน้า Processing"],
    ["ทำไมควรสร้าง Blueprint ใหม่ทุกเดือน?", "เพราะทุกเดือนช่องของคุณมีข้อมูลใหม่ ระบบจะช่วยอ่านการเปลี่ยนแปลงและปรับแผนให้เหมาะกับการเติบโตเดือนถัดไป"],
    ["ราคา 490฿ เป็นราคาปกติไหม?", "490฿ เป็นโปรเปิดตัวจากราคาเต็ม 1,590฿ สำหรับช่วงเปิดตัวเท่านั้น"],
  ], en: [
    ["Do I need a lot of followers?", "Not at all. It works for beginners and seasoned creators alike. If you have Insights to share, the analysis gets more detailed."],
    ["What if I don't know who my competitors are?", "Leave it blank. The system analyzes your market based on your business type and goals."],
    ["What screenshots can I attach?", "As many as you like — Reach, Profile Visits, Link Taps, Audience, Top Content, Follower Growth, or any stats you have."],
    ["What do I get after paying?", "A private Dashboard with your channel analysis, a 30-day content plan, scripts, captions, and a Marathon tracker."],
    ["How long does processing take?", "Usually not long, depending on how many images and details you send. You'll see a Processing screen while you wait."],
    ["Why create a new Blueprint each month?", "Each month your channel has new data. The system reads the changes and adjusts your plan for next month's growth."],
    ["Is ฿490 the regular price?", "฿490 is the launch promo, down from the full price of ฿1,590 — for the launch period only."],
  ] },

  // FINAL CTA
  final_title: { th: "พร้อมวางแผนคอนเทนต์ทั้งเดือนแล้วหรือยัง?", en: "Ready to plan a full month of content?" },
  final_sub: { th: "กรอกข้อมูลครั้งเดียว รับแผน 30 วัน พร้อมสคริปต์และแคปชัน", en: "Fill in once, get a 30-day plan with scripts and captions." },
  final_disclaimer: { th: "ข้อมูลของคุณใช้เพื่อสร้าง Blueprint ส่วนตัวเท่านั้น · หากระบบประมวลผลไม่สำเร็จ ทีม Babe House จะช่วยตรวจสอบและออก Blueprint ให้ใหม่ค่ะ", en: "Your data is used only to create your private Blueprint · If processing fails, the Babe House team will check and reissue your Blueprint." },

  // FOOTER
  footer_make: { th: "สร้าง Blueprint", en: "Create Blueprint" },
  footer_privacy: { th: "นโยบายความเป็นส่วนตัว", en: "Privacy policy" },

  // CHECKOUT
  co_title: { th: "ชำระเงิน Blueprint Premium", en: "Pay for Blueprint Premium" },
  co_sub: { th: "เมื่อชำระสำเร็จ ระบบจะเริ่มให้ AI วิเคราะห์และส่งลิงก์ Dashboard ทางอีเมลค่ะ", en: "Once paid, the AI starts analyzing and emails you your Dashboard link." },
  co_pay_mock: { th: "จำลองชำระสำเร็จ (PromptPay/บัตร)", en: "Simulate successful payment (PromptPay/card)" },
  co_pay: { th: "ชำระเงิน (PromptPay / บัตรเครดิต)", en: "Pay (PromptPay / credit card)" },
  co_or_code: { th: "หรือมีโค้ดส่วนลด", en: "or use a discount code" },
  co_code_ph: { th: "กรอกโค้ด เช่น SAVE30", en: "Enter code, e.g. SAVE30" },
  co_use_code: { th: "ใช้โค้ด", en: "Apply" },
  co_code_empty: { th: "กรุณากรอกโค้ด", en: "Please enter a code" },
  co_code_checking: { th: "กำลังตรวจสอบ...", en: "Checking…" },
  co_code_ok_pre: { th: "ใช้โค้ดสำเร็จ! ลด", en: "Code applied! " },
  co_off: { th: "แล้ว", en: "off" },

  // PROCESSING
  pr_checking: { th: "กำลังตรวจสอบการชำระเงิน", en: "Verifying your payment" },
  pr_wait: { th: "รอสักครู่ค่ะ", en: "One moment…" },
  pr_done_title: { th: "ได้รับข้อมูลเรียบร้อยแล้วค่ะ", en: "We've got your details" },
  pr_done_sub: { th: "ครูพี่คิมกำลังวิเคราะห์ข้อมูลและรูป Insight เพื่อสร้างแผน 30 วันเฉพาะตัว", en: "Kim is analyzing your details and Insights to build your personal 30-day plan." },
  pr_email_note: { th: "📩 ใช้เวลาไม่เกิน 30 นาที เราจะส่งลิงก์ไปที่อีเมลของคุณ — ปิดหน้านี้ได้เลย หรือรอไว้ ระบบจะเปิดให้อัตโนมัติเมื่อเสร็จ", en: "📩 Within 30 minutes we'll email you the link — you can close this page, or wait and it'll open automatically when ready." },
  pr_go_account: { th: "ไปที่บัญชีของฉัน", en: "Go to my account" },
  pr_error_title: { th: "ระบบขัดข้อง", en: "Something went wrong" },
  pr_back_form: { th: "กลับหน้าแบบฟอร์ม", en: "Back to the form" },
  pr_err_noorder: { th: "ไม่พบหมายเลขคำสั่งซื้อ", en: "Order not found" },
  pr_err_unpaid: { th: "ยังไม่พบสถานะชำระเงินสำเร็จ", en: "Payment not confirmed yet" },

  // NOT FOUND
  nf_title: { th: "ไม่พบหน้านี้ค่ะ 🩵", en: "Page not found 🩵" },
  nf_sub: { th: "หน้าที่คุณกำลังหาอาจถูกย้ายหรือไม่มีอยู่แล้ว", en: "The page you're looking for may have moved or no longer exists." },
  back_home: { th: "กลับหน้าแรก", en: "Back to home" },
  back_home_arrow: { th: "← กลับหน้าแรก", en: "← Back to home" },

  // PRIVACY
  pv_title: { th: "นโยบายความเป็นส่วนตัว", en: "Privacy policy" },
  pv_pdpa: { th: "สอดคล้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)", en: "Compliant with Thailand's Personal Data Protection Act (PDPA)" },
  pv_summary: { th: "โดยสรุป: เราเก็บข้อมูลที่คุณกรอกและรูปสถิติ เพื่อให้ AI วิเคราะห์และสร้างแผนคอนเทนต์เฉพาะตัวให้คุณเท่านั้น ไม่ขายข้อมูลให้บุคคลที่สาม", en: "In short: we collect what you enter and your stats screenshots only so the AI can analyze and build your personal content plan. We never sell your data to third parties." },
  pv_h1: { th: "1. ข้อมูลที่เราเก็บ", en: "1. What we collect" },
  pv_p1: { th: "อีเมล, บัญชี Instagram/TikTok, ข้อมูลธุรกิจ/เป้าหมาย/ปัญหา, รูปสถิติหลังบ้าน, ข้อมูลการชำระเงิน (ผ่าน Stripe — เราไม่เก็บเลขบัตร)", en: "Email, your Instagram/TikTok handle, business/goals/pain details, Insights screenshots, payment info (via Stripe — we never store card numbers)." },
  pv_h2: { th: "2. การใช้ข้อมูล", en: "2. How we use it" },
  pv_p2: { th: "วิเคราะห์สร้างแผนเฉพาะตัว, ติดตามการเติบโต, ส่งลิงก์/แจ้งเตือนทางอีเมล, ปรับปรุงบริการ", en: "To build your personal plan, track growth, email links/notifications, and improve the service." },
  pv_h3: { th: "3. การประมวลผลด้วย AI", en: "3. AI processing" },
  pv_p3: { th: "ข้อมูลและรูปถูกส่งไปประมวลผลกับผู้ให้บริการ AI (Google Gemini) เท่าที่จำเป็นต่อการวิเคราะห์", en: "Your data and images are sent to our AI provider (Google Gemini) only as needed for the analysis." },
  pv_h4: { th: "4. สิทธิของคุณ (PDPA)", en: "4. Your rights (PDPA)" },
  pv_p4: { th: "ขอเข้าถึง แก้ไข ลบ คัดค้าน หรือถอนความยินยอมได้ทุกเมื่อ ติดต่อ babehouse555@gmail.com", en: "You can request access, correction, deletion, objection, or withdraw consent anytime — contact babehouse555@gmail.com." },

  // ACCOUNT
  ac_title: { th: "บัญชีของฉัน", en: "My account" },
  ac_sub: { th: "เข้าสู่ระบบเพื่อดูเล่ม Blueprint ย้อนหลังและติดตามการเติบโตทุกเดือน", en: "Log in to view past Blueprints and track your growth each month." },
  ac_email_label: { th: "อีเมลที่ใช้ตอนซื้อ", en: "Email used at purchase" },
  ac_send_code: { th: "ส่งรหัสเข้าอีเมล", en: "Email me a code" },
  ac_email_invalid: { th: "กรุณากรอกอีเมลให้ถูกต้อง", en: "Please enter a valid email" },
  ac_otp_label_pre: { th: "รหัส 6 หลักที่ส่งไปที่", en: "The 6-digit code sent to" },
  ac_dev_mode_pre: { th: "โหมดทดสอบ — รหัสของคุณคือ", en: "Test mode — your code is" },
  ac_verify: { th: "ยืนยันและเข้าสู่ระบบ", en: "Verify & log in" },
  ac_change_email: { th: "← เปลี่ยนอีเมล", en: "← Change email" },
  ac_otp_len: { th: "กรอกรหัส 6 หลัก", en: "Enter the 6-digit code" },
  ac_books_of_pre: { th: "เล่มของ", en: "Books for" },
  ac_logout: { th: "ออกจากระบบ", en: "Log out" },
  ac_pending_err_title: { th: "กำลังสร้าง (สะดุดนิดหน่อย)", en: "generating (small hiccup)" },
  ac_pending_err_sub: { th: "ไม่ต้องห่วงนะคะ ระบบกำลังลองใหม่ให้อัตโนมัติ เดี๋ยวเสร็จส่งเมลแจ้งทันที — หรือกดดูสถานะได้เลยค่ะ", en: "No worries — it's retrying automatically and we'll email you when it's done. Or check the status." },
  ac_view_status: { th: "ดูสถานะเล่ม", en: "View status" },
  ac_pending_title: { th: "⏳ ครูพี่คิมกำลังสร้างเล่มของคุณอยู่นะคะ...", en: "⏳ Kim is building your Blueprint…" },
  ac_pending_sub: { th: "· กำลังทำงานอยู่ รอสักครู่ค่ะ — พอเสร็จจะส่งลิงก์เข้าเมล และเด้งขึ้นตรงนี้เองอัตโนมัติ 🩵", en: "· in progress — one moment. We'll email the link and it'll appear here automatically 🩵" },
  ac_view_gen_status: { th: "ดูสถานะการสร้างเล่ม", en: "View generation status" },
  ac_no_books: { th: "ยังไม่มีเล่ม Blueprint ในบัญชีนี้", en: "No Blueprints in this account yet" },
  ac_my_channels: { th: "ช่องของฉัน", en: "My channels" },
  ac_months_suffix: { th: "เดือน", en: "months" },
  ac_latest: { th: " · ล่าสุด", en: " · latest" },
  ac_new_badge: { th: "ใหม่", en: "New" },
  ac_renew: { th: "+ ต่อแผนเดือนนี้", en: "+ Renew this month" },
  ac_see_growth: { th: "📈 ดูการโต", en: "📈 See growth" },
  ac_add_channel: { th: "+ เพิ่มช่องใหม่ (490฿)", en: "+ Add a new channel (฿490)" },
  ac_delete_confirm_a: { th: "ลบเล่มเดือน", en: "Delete the" },
  ac_delete_confirm_b: { th: "?\n\n(ลบออกจากบัญชีของคุณ — ถ้าเผลอลบ ทักทีม Babe House กู้คืนให้ได้)", en: " book?\n\n(Removes it from your account — if you delete by mistake, message the Babe House team to restore it.)" },
  ac_delete_fail: { th: "ลบไม่สำเร็จ ลองอีกครั้งนะคะ", en: "Couldn't delete, please try again" },
  ac_ref_title: { th: "🎁 ชวนเพื่อน — ได้กันทั้งคู่", en: "🎁 Refer a friend — you both win" },
  ac_ref_desc_a: { th: "เพื่อนสมัครผ่านลิงก์คุณ", en: "Friends who sign up via your link" },
  ac_ref_desc_b: { th: "รับลด", en: "get" },
  ac_ref_desc_c: { th: "ทันที · และคุณได้", en: "off instantly · and you get a" },
  ac_ref_desc_d: { th: "โค้ดลดเดือนถัดไป", en: "discount code for next month" },
  ac_ref_desc_e: { th: "ทุกครั้งที่มีเพื่อนสมัครสำเร็จ 🩵", en: "every time a friend signs up 🩵" },
  ac_copy_link: { th: "คัดลอกลิงก์", en: "Copy link" },
  ac_copied_link: { th: "คัดลอกแล้ว ✓", en: "Copied ✓" },
  ac_copy_msg: { th: "📋 คัดลอกข้อความชวนเพื่อน", en: "📋 Copy invite message" },
  ac_copied_msg: { th: "คัดลอกข้อความแล้ว ✓", en: "Message copied ✓" },
  ac_share_line: { th: "แชร์ทาง LINE", en: "Share on LINE" },
  ac_share: { th: "แชร์...", en: "Share…" },
  ac_ref_count_pre: { th: "แนะนำสำเร็จแล้ว:", en: "Successful referrals:" },
  ac_people: { th: "คน", en: "" },
  ac_ref_thanks: { th: " — ขอบคุณที่ช่วยบอกต่อค่ะ 🩵", en: " — thank you for spreading the word 🩵" },
  ac_share_msg: { th: "แนะนำเลย! ครูพี่คิม (Babe House) ช่วยวางแผนคอนเทนต์ 30 วัน + สคริปต์พร้อมใช้ ให้ช่องเราโตขึ้นจริง 🩵\nสมัครผ่านลิงก์นี้รับส่วนลด", en: "Highly recommend! Kim (Babe House) builds a 30-day content plan + ready-to-use scripts that actually grow your channel 🩵\nSign up via this link for" },
  ac_share_msg_tail: { th: "เลย 👇", en: "off 👇" },
};
