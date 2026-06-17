// Blueprint ตัวอย่างสำหรับโหมด demo (ไม่ต้องมี backend)
export function sampleBlueprint() {
  const calendar = Array.from({ length: 30 }, (_, i) => {
    const d = i + 1, g = i % 5 === 2 ? "Branding" : (i % 3 === 0 ? "Awareness" : "Conversion");
    return { d, g, t: `${g} Day ${d}: เพิ่มยอดสมัครคอร์ส`, h: `วันนี้ครูพี่คิมจะพา @babehouse อุดรอยรั่วให้ชัดขึ้นในหนึ่งคลิปค่ะ`, f: g === "Conversion" ? "Reels + CTA" : g === "Branding" ? "Storytelling" : "How-to Reels" };
  });
  const scripts = calendar.map(x => ({
    d: x.d, g: x.g,
    beats: [
      { ts: "0-3 วิ", s: "HOOK", say: x.h, ost: "หยุดดูก่อนค่ะ", vis: "พูดหน้ากล้อง" },
      { ts: "3-45 วิ", s: "BODY", say: x.g === "Conversion" ? "คนเห็นแล้วไม่รู้ว่าต้องไปทางไหนต่อ วันนี้เราจะทำ CTA และ Link-in-bio ให้ชัดที่สุดค่ะ" : "จุดสำคัญคือ 3 วินาทีแรกต้องตอบให้ได้ว่าคลิปนี้มีอะไรให้เขาค่ะ", ost: "ทำทางให้ชัด", vis: "โชว์ flow" },
      { ts: "45-60 วิ", s: "CTA", say: "ถ้าอยากให้ครูพี่คิมช่วยวางทางเดินแบบนี้ กดลิงก์ในไบโอได้เลยนะคะ", ost: "กดลิงก์ในไบโอ", vis: "ชี้ปุ่ม CTA" }
    ],
    cap: `วันที่ ${x.d}: ${x.t} #BabeHouseAcademy`, tip: x.g === "Conversion" ? "คลิป Conversion ต้องจบด้วยคำสั่งเดียวที่ชัดเจน" : "ความสม่ำเสมอสำคัญกว่าความสมบูรณ์แบบค่ะ"
  }));
  return {
    instagram_account: "@babehouse", theme: "เพิ่มยอดสมัครคอร์ส",
    greeting: "สวัสดีค่ะ 🩵 นี่คือตัวอย่าง Blueprint — เล่มจริงครูพี่คิมจะวิเคราะห์จากช่องและสถิติของคุณโดยเฉพาะ",
    pillars: ["Hook หยุดนิ้ว", "Social Proof สร้างความเชื่อ", "CTA พาไปสมัคร", "Link-in-bio ลดรอยรั่ว"],
    what_we_see: ["คนเข้าโปรไฟล์เยอะแต่กดลิงก์น้อย", "คอนเทนต์มีคุณภาพแต่ยังไม่มีระบบ", "กลุ่มเป้าหมายผู้หญิงวัยทำงาน", "reach ดีแต่ conversion ต่ำ", "ยังไม่มี CTA ที่ชัด"],
    audience_summary: "ผู้หญิงวัยทำงาน 25-34 สนใจพัฒนาตัวเอง", follower_insight: "ผู้ติดตามส่วนใหญ่เป็นกลุ่มเป้าหมายจริง", market_tier: "Premium",
    positioning: "@babehouse คือแบรนด์พรีเมียมที่เปลี่ยนความสนใจเป็นยอดสมัครจริง",
    kim_insight: "คนที่กดเข้าโปรไฟล์ไม่ใช่คนเย็นแล้ว หน้าที่เดือนนี้คือทำป้ายบอกทางให้ชัดว่าเขาต้องกดตรงไหน",
    swot: { strengths: ["คอนเทนต์มีคุณภาพ", "มีฐานแฟนจริง"], weaknesses: ["ไม่มีระบบ CTA", "conversion ต่ำ"], opportunities: ["ตลาด Premium โตได้", "ทำคอร์ส/แพ็กเกจ"], threats: ["คู่แข่งราคาถูก", "อัลกอริทึมเปลี่ยน"] },
    modules: {
      archetype: { name: "The Mentor–Muse", body: "พี่สาวผู้ชี้ทางที่มีรสนิยม", tone: "อบอุ่น คม ชัด", look: "คลีน ฟ้า ขาว พรีเมียม" },
      avatar: { name: "มินนี่ อายุ 24", think: "อยากเก่งขึ้นแต่กลัวลองผิด", see: "คู่แข่งเต็มฟีด", hear: "ต้องทำคลิปแต่ไม่รู้เริ่มตรงไหน", fear: "กลัวลงทุนไม่คุ้ม", hookbank: ["ทำคลิปเป็นสิบยอดไม่ขึ้นเพราะอะไร", "ช่องดูดีแต่ขายไม่ได้ แก้ตรงนี้"] },
      competitor: { intro: "ตลาดมีทั้งสายถูกและสายฟรี", rows: [{ name: "สายราคาถูก", they: "ลดราคา สอนกว้าง", gap: "เราจับมือทำจริง" }, { name: "สายฟรี", they: "แจกทริคเร็วๆ", gap: "เรามีระบบและผลลัพธ์" }], blueocean: "พรีเมียม อบอุ่น จับมือทำจริง" },
      values: { list: ["Support over Sales", "Premium is a Feeling", "We Rise Together"], manifesto: "Babe House เชื่อว่าผู้หญิงทุกคนสร้างคอนเทนต์ที่ดูแพงและเปลี่ยนชีวิตได้เมื่อมีระบบ" },
      funnel: { top: { label: "TOP", pct: 30, body: "ดักคนใหม่" }, middle: { label: "MIDDLE", pct: 50, body: "สร้างความเชื่อใจ" }, bottom: { label: "BOTTOM", pct: 20, body: "ปิดการขาย" }, note: "อย่าขายติดกันรัว เลี้ยงความเชื่อก่อนปิด" }
    },
    calendar, scripts,
    metrics: { followers: 6720, reach: 60800, profile_visits: 4160, link_taps: 288, engagement_rate: 4.5 }
  };
}
