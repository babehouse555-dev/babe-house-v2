// เมล็ดข้อมูล workshop — คัดจากเอกสาร "รายละเอียดคอร์สเรียน (workshop)" ของคิม
// ทำงานครั้งเดียวตอนตารางยังว่าง (ถ้าคิมแก้ในหน้าแอดมินแล้ว จะไม่ถูกเขียนทับ)
// คิมแค่เข้าไป "ลงวันเรียน" ในหน้าแอดมิน รายละเอียด/ราคา/รีวิว มีให้พร้อมแล้ว
import { q, run } from "./db.js";

const WORKSHOPS = [
  {
    id: "ws_sme", seq: 1, name: "SME Content Marketing Workshop", price: 9990, duration: "1 วันเต็ม 11.00–15.30 น.",
    instructor: "ครูพี่คิม & ครูพี่ปอนด์",
    tagline: "คลาสการตลาดที่ออกแบบมาเพื่อเจ้าของธุรกิจตัวจริง",
    detail: "• วิเคราะห์ลูกค้าแบบแม่นยำ เพื่อออกแบบ Content ที่โดนใจตรงเป้า\n• เทคนิคทำ Content อย่างไรให้ได้ Reach สูงๆ แบบไม่ต้องลงเงินเยอะ\n• รู้จักเครื่องมือช่วยทำคอนเทนต์ที่ประหยัด ทำง่าย แต่ดูแพง\n• เรียนรู้การโปรโมตธุรกิจให้คนรู้จักแบรนด์มากขึ้น และช่วยให้ขายของได้จริง",
    who_for: "• เจ้าของแบรนด์ SME ที่อยากทำการตลาดด้วยตัวเอง\n• คนที่อยากเพิ่มยอดขายแบบไม่ต้องง้อ Ads\n• ผู้ประกอบการที่อยากใช้ Content ช่วยให้คนรู้จักและจดจำแบรนด์\n• ผู้ที่ไม่มีพื้นฐานด้านการตลาด แต่อยากเริ่มต้นอย่างเข้าใจง่าย",
    what_you_get: "• เรียนสด + ลงมือทำจริงในห้องเรียน\n• แบบฝึกหัด วิเคราะห์จริง + ตัวอย่างจากธุรกิจจริง\n• เทมเพลต + แนวทางวางแผน Content ที่ใช้ได้กับทุกแพลตฟอร์ม\n• ไฟล์เครื่องมือ + สไลด์ + Community สำหรับต่อยอดหลังเรียน",
    reviews: ["https://www.instagram.com/reel/DLFSv2oyp9a/", "https://www.instagram.com/reel/DIOfwBNS9gd/"],
  },
  {
    id: "ws_influ101", seq: 2, name: "Influ 101 — สร้างตัวตนในแบบที่ใช่ อย่างมีทิศทาง", price: 3990, duration: "เวิร์กช็อป 1 วัน 11.00–15.30 น.",
    instructor: "ครูพี่คิม & ครูพี่ปอนด์",
    tagline: "ค้นหาตัวตน แล้วเปลี่ยนความเป็นเราให้เป็นคอนเทนต์ที่คนอยากดู",
    detail: "ช่วงเช้า — ค้นหาตัวตนผ่าน Mind Mapping กับครูพี่คิม\n• ฝึกสังเกตตัวเองว่าเราเหมาะกับคอนเทนต์แนวไหน\n• ทำ Mind Mapping หาสไตล์คอนเทนต์ที่เป็นตัวเราจริงๆ\n• ตั้งคอนเซ็ปต์ \"ตัวตนบนโลกออนไลน์\" ให้ชัด\n\nช่วงบ่าย — เปลี่ยนความเป็นเราให้กลายเป็นคอนเทนต์ที่คนอยากดู\n• นำหลักการตลาดมาช่วยวางโครงคอนเทนต์\n• ทำให้ \"ความเป็นเรา\" น่าสนใจขึ้นด้วยเทคนิคการเล่าเรื่อง",
    who_for: "• ผู้เริ่มต้นที่อยากเป็น Influencer แต่ยังไม่รู้แนวทางของตัวเอง\n• คนที่อยากสร้างตัวตนให้เป็นเอกลักษณ์\n• Creator ที่อยากทำให้ช่องดูมีคุณค่าและสื่อสารชัดขึ้น\n• ผู้ประกอบการที่อยากสร้างแฟนคลับและชุมชนของตัวเอง",
    what_you_get: "• แผน Mind Mapping ตัวตน + Template วางแผนคอนเทนต์\n• วิธีเล่าเรื่องให้คน \"หยุดดู\" ไม่ใช่แค่ \"เลื่อนผ่าน\"\n• เทคนิคอ่าน Insight ช่องเพื่อรู้ว่าคอนเทนต์แบบไหนปัง\n• เข้าใจหลักการสร้างฐานแฟนคลับอย่างยั่งยืน",
    reviews: ["https://www.instagram.com/reel/DLPvJMPSHfi/", "https://www.instagram.com/reel/DHYNYc-yzET/"],
  },
  {
    id: "ws_backinflu", seq: 3, name: "หลังบ้าน INFLU — คลาสลับของคนจริงในวงการอินฟลู", price: 5990, duration: "เวิร์กช็อป 1 วัน 11.00–15.30 น.",
    instructor: "ครูพี่คิม & ครูพี่เกม",
    tagline: "เบื้องหลังการรับงานที่ไม่มีใครสอนในคลาสทั่วไป",
    detail: "• วิธีคุยกับลูกค้าแบบมือโปร ที่ไม่เกร็ง ไม่งง ไม่พัง\n• Step-by-step กระบวนการขายงานให้ปิดจบได้อย่างมั่นใจ\n• เทคนิคคิด Rate Card ให้ดูโปรและได้เรทราคาที่เหมาะสม\n• ฝึกทำเอกสารหลังบ้านสำหรับ Creator เช่น ใบเสนอราคา ใบตอบรับงาน การสรุปบรีฟ\n• แชร์ประสบการณ์จริงจากผู้สอนที่รับงานจริงมาแล้วนับไม่ถ้วน",
    who_for: "• อินฟลูเอนเซอร์มือใหม่ที่เริ่มมีลูกค้าแต่ยังไม่รู้จะรับงานยังไง\n• Creator ที่เคยโดนลูกค้าโกง หรือยังจัดการเอกสารหลังบ้านไม่เป็น\n• คนที่อยากดูเป็นมืออาชีพมากขึ้นเวลาคุยกับแบรนด์\n• ผู้ที่อยากสร้างระบบให้ตัวเองในการทำงานสายคอนเทนต์",
    what_you_get: "• ได้ฝึกเขียน/พูดจริงในสถานการณ์จำลอง\n• ตัวอย่างฟอร์มให้ใช้จริง + แชร์ให้ดาวน์โหลด\n• ได้ทั้งความรู้และความมั่นใจในการรับงานครั้งต่อไป",
    reviews: ["https://www.instagram.com/reel/DHK4XxWyH_2/"],
  },
  {
    id: "ws_phone_basic", seq: 4, name: "All in your phone (Basic)", price: 3990, duration: "เวิร์กช็อป 1 วัน",
    instructor: "ครูพี่คิม",
    tagline: "เรียนตัดต่อ วาดรูป ทำ Animation ทำหน้าปก บนมือถือและ iPad ด้วย CapCut",
    detail: "• พื้นฐานการตัดต่อวิดีโอในมือถือ เข้าใจง่าย ไม่ต้องมีพื้นฐาน\n• ฝึกวาดรูปเบื้องต้นใน CapCut ด้วยเทคนิคง่ายๆ\n• สร้าง Animation สั้นๆ แบบมือโปรในแอปเดียว\n• ทำหน้าปกให้น่าสนใจ\n• เรียนแบบลงมือทำจริง พร้อมไฟล์สำหรับฝึก",
    who_for: "• คนที่ไม่เคยตัดต่อวิดีโอมาก่อน\n• ผู้เริ่มต้นที่อยากเข้าใจเครื่องมือในมือถืออย่าง CapCut\n• คนที่อยากวาดหรือทำคลิปง่ายๆ ด้วยมือถือ/iPad\n• นักเรียน นักศึกษา คนทำเพจ เจ้าของแบรนด์เล็กๆ",
    what_you_get: "• ครบจบในแอปเดียว (CapCut)\n• สอนเข้าใจง่าย ลงมือทำจริง\n• เรียนจบแล้วใช้งานได้ทันที",
    reviews: ["https://www.instagram.com/reel/C7f7cRdNd2I/", "https://www.instagram.com/reel/DHnVVZ-Sk6v/", "https://www.instagram.com/reel/DHlhLBITje3/", "https://www.instagram.com/reel/DBXvHf5Pnpa/", "https://www.instagram.com/reel/C9B--KaPcu3/", "https://www.instagram.com/reel/C83dXpZvZah/", "https://www.instagram.com/reel/C8qt8x2vseq/", "https://www.instagram.com/reel/C8vsT3VPana/"],
  },
  {
    id: "ws_phone_adv", seq: 5, name: "All in your phone (Advance)", price: 5990, duration: "1 วันเต็ม 11.00–15.30 น.",
    instructor: "ครูพี่คิม",
    tagline: "คอร์สตัดต่อมือถือระดับเทพ เจาะลึกทุกเทคนิคขั้นสูงของ CapCut",
    detail: "• เจาะลึกการใช้ Keyframe และเทคนิคขั้นสูงในแอป CapCut\n• ฝึกประยุกต์ใช้เครื่องมือกับสไตล์วิดีโอที่แตกต่าง\n• เตรียมคลิปที่อยากทำมาได้เลย ในคลาสจะช่วยทั้งการวางแผนถ่ายและการตัดต่อ\n• ทุกคลาสไม่เหมือนกันเลยในแต่ละรอบ เพราะเนื้อหาปรับตามสิ่งที่นักเรียนแต่ละคนอยากทำจริง",
    who_for: "• ผู้ที่เคยเรียนคอร์สเบสิคมาแล้ว\n• Creator / Influencer ที่ต้องการยกระดับงานให้ดูโปร\n• เจ้าของเพจหรือแบรนด์ ที่อยากทำวิดีโอคุณภาพสูง\n• ผู้ที่เคยใช้ CapCut และอยากเข้าใจแบบลึก",
    what_you_get: "• ปรับการสอนให้เฉพาะกับงานที่นักเรียนอยากทำ\n• ได้ลงมือทำจริง พร้อมปรึกษาตัวต่อตัว",
    reviews: ["https://www.instagram.com/reel/DJ_iQmTyeQn/", "https://www.instagram.com/reel/DJi4xACRcFU/", "https://www.instagram.com/reel/DJG7PsfyU1c/", "https://www.instagram.com/reel/DLeIvJjSzKC/", "https://www.instagram.com/reel/DKeGIeaSgwo/"],
  },
  {
    id: "ws_canva", seq: 6, name: "Canva Craft (Workshop)", price: 3990, duration: "1 วันเต็ม 11.00–15.30 น.",
    instructor: "ครูพี่คิม",
    tagline: "สร้างงานดีไซน์ง่ายๆ ใน Canva แบบมืออาชีพ · แนะนำให้พก notebook มาด้วย",
    detail: "• เรียนรู้การใช้ Canva ตั้งแต่พื้นฐานจนทำงานจริงได้\n• ทำ Presentation / หน้าปก / โปสเตอร์ แบบมือโปร\n• สร้าง Animation เบื้องต้นสำหรับใช้ในคอนเทนต์\n• ฝึกใช้ AI ด้วยเครื่องมือใน Canva\n• ฝึกตัดต่อวิดีโอด้วยฟีเจอร์ใหม่ๆ ที่ Canva มีให้",
    who_for: "• มือใหม่ที่อยากสร้างผลงานเองแบบดูโปร\n• คนที่อยากใช้ Canva ทำคอนเทนต์สวยๆ ลงโซเชียล\n• เจ้าของธุรกิจที่อยากออกแบบสื่อด้วยตัวเอง\n• นักเรียน/นักศึกษาที่อยากทำสไลด์หรือรายงานให้โดดเด่น",
    what_you_get: "• รวมครบทุกทักษะที่ควรรู้ใน Canva ในคอร์สเดียว\n• ใช้ได้ทั้งบนคอมและ iPad\n• ไม่จำเป็นต้องมีพื้นฐานมาก่อน",
    reviews: ["https://www.instagram.com/reel/DA2VeoOvGIu/", "https://www.instagram.com/reel/DApgHtSPhg0/", "https://www.instagram.com/reel/DApxaOWvUtN/", "https://www.instagram.com/reel/DAC88nhP9Uo/", "https://www.instagram.com/reel/DAAxr9uPpoS/", "https://www.instagram.com/reel/C_9wL97vbkl/", "https://www.instagram.com/reel/C_xBzqRPTKY/"],
  },
  {
    id: "ws_specialai", seq: 7, name: "Special AI — รวมทุกพลังของ AI ไว้ในคลาสเดียว", price: 5990, duration: "1 วันเต็ม 11.00–15.30 น.",
    instructor: "ครูพี่คิม",
    tagline: "ตอนนี้เปิดรับเฉพาะแบบ Private",
    detail: "• เปลี่ยนไอเดียในหัวให้กลายเป็น \"ภาพจริง\" ด้วย AI\n• เทคนิค Prompt สำหรับสร้างงานภาพ ปก แคมเปญ และคาแรกเตอร์\n• ตัดต่อวิดีโอไวรัลด้วย AI tools + CapCut\n• ดีไซน์โปสเตอร์ให้สวยปังใน Canva\n• ได้รับ 10 Prompts ที่พิสูจน์แล้วว่าสร้างงานขายได้จริง",
    who_for: "• ครีเอเตอร์ที่อยากใช้ AI มาช่วยสร้างงานภาพและวิดีโอ\n• คนที่อยากเริ่มใช้ Prompt แต่ยังใช้ไม่คล่อง\n• เจ้าของแบรนด์ / นักออกแบบ / นักเรียน ที่อยากปั้นไอเดียให้เป็นภาพ\n• นักเรียนที่ได้พื้นฐานการตัดต่อแล้ว ต้องการต่อยอดให้เก่งขึ้นไปอีก",
    what_you_get: "• เทมเพลต + Prompt สำหรับนำไปใช้ต่อ\n• ได้ลงมือทำจริงทุกขั้นตอน พร้อมตัวอย่างงาน\n• ได้เข้ากลุ่มพูดคุย แชร์ผลงาน และอัปเดตเทคนิคใหม่ๆ",
    reviews: ["https://www.instagram.com/reel/DLXDsvnSTH8/", "https://www.instagram.com/reel/DLSQiB3yQKL/", "https://www.instagram.com/reel/DLR-eX5y7Z5/"],
  },
  {
    id: "ws_private", seq: 8, name: "Private Class — คลาสส่วนตัว เลือกเรื่องที่อยากเรียนเอง", price: 12900, duration: "เต็มวัน 11.00–15.30 น.",
    instructor: "ครูพี่คิม",
    tagline: "เรียนตัวต่อตัวหรือกลุ่มเล็ก · เลือกหัวข้อได้เอง คลาสเดียวเรียนได้หลายเรื่อง",
    detail: "เลือกได้เลยว่าอยากเรียนเรื่องอะไร เช่น\n• คอร์สตัดต่อมือถือ / iPad\n• ออกแบบ Canva\n• ใช้ AI ช่วยงานคอนเทนต์\n• หรือจะให้ช่วยดูงานจริงที่กำลังทำอยู่\n\nราคาแบบกลุ่ม (เหมาจ่ายต่อกลุ่ม)\n• 1 คน (ส่วนตัว) — ฿12,900\n• 3–5 คน — ฿35,000\n• 10 คน — ฿50,000\n• 20 คน — ฿80,000\n• 30 คน — ฿100,000\n• 50–100 คนขึ้นไป — ฿120,000\n\nสอนนอกสถานที่: ในกรุงเทพ +2,000 บาท · ต่างจังหวัด +2,000 บาท + ค่าเครื่องบินและที่พัก",
    who_for: "• บุคคลทั่วไปที่อยากเรียนแบบเน้นเฉพาะเรื่อง\n• ผู้บริหาร / เจ้าของแบรนด์ ที่อยากเข้าใจงานคอนเทนต์\n• บริษัทหรือทีมที่อยากจัด Workshop in-house ให้ทีมงาน\n• ผู้ที่ต้องการคำปรึกษาแบบลงลึก พร้อมเวิร์กจริง",
    what_you_get: "• วางแผนบทเรียนตามความต้องการของผู้เรียน\n• ได้ลงมือทำจริง พร้อม Feedback ตรง\n• เอกสาร/เทมเพลต/โปรเจกต์ที่เหมาะกับผู้เรียนโดยเฉพาะ",
    reviews: ["https://www.instagram.com/reel/C8fD-FHvDeA/", "https://www.instagram.com/reel/DLXDsvnSTH8/", "https://www.instagram.com/reel/DLSQiB3yQKL/", "https://www.instagram.com/reel/DK9lIu1SMwx/", "https://www.instagram.com/reel/DJ1nVtGy0xh/", "https://www.instagram.com/reel/DHvILWFSJ2g/", "https://www.instagram.com/reel/DFua3-iyzdp/"],
  },
  {
    id: "ws_brandkickoff", seq: 9, name: "Brand Kick Off — Build Your Brand in 5 Days", price: 29500, duration: "5 วัน (3 สัปดาห์) 15.00–18.00 น.",
    instructor: "ครูพี่ไซ (ASAIDEMY) & ครูพี่คิม",
    tagline: "จาก 0 สู่การมีแบรนด์ของตัวเอง แบบจับมือทำ · ราคายังไม่รวม VAT",
    detail: "Week 1\n• Day 1 — Business Planning & Pricing Strategy (ครูพี่ไซ): วางโครงสร้างธุรกิจ, หาตลาดเป้าหมายและ Positioning, โครงสร้างราคาและ Cashflow\n• Day 2 — Brand Identity & Naming (ครูพี่ไซ): สร้าง CI, Moodboard, ตั้งชื่อแบรนด์, Logo / สี / ฟอนต์\n\nWeek 2\n• Day 3 — TikTok & Content for Branding (ครูพี่คิม): สร้างแบรนด์ผ่าน TikTok, สื่อสารให้ตรง DNA แบรนด์, คิดคอนเทนต์ให้โดนกลุ่มเป้าหมาย\n• Day 4 — AI Tools for Branding (ครูพี่คิม): ใช้ AI สร้างภาพและวิดีโอให้แบรนด์ดูโปร\n\nWeek 3\n• Day 5 — Final Presentation & Brand Consultation: พรีเซนต์แบรนด์ของตัวเอง รับคอมเมนต์ตรงจากผู้สอนทั้งสอง พร้อมมอบ Certificate",
    who_for: "• วัยรุ่นและผู้เริ่มต้นที่ไม่มีพื้นฐาน\n• คนที่มีไอเดียแต่ยังไม่รู้จะเริ่มยังไงให้เป็นแบรนด์จริง\n• ผู้ที่อยากรู้กระบวนการตั้งแต่ Branding, Marketing, Content, Ads แบบครบจบ\n• คนที่อยากมีแบรนด์ขายของเป็นของตัวเอง",
    what_you_get: "• แบรนด์ของคุณเองที่พร้อมต่อยอดได้จริง (CI, Story, Naming ครบ)\n• กลยุทธ์การตลาดและคอนเทนต์ที่นำไปใช้ได้ทันที\n• TikTok + AI Content ที่พร้อมปล่อยจริง\n• การบ้าน + Feedback ทุกสัปดาห์\n• คอมมิวนิตี้เพื่อนร่วมรุ่น",
    reviews: [],
  },
  {
    id: "ws_speaking", seq: 10, name: "Speaking Confidence Workshop", price: 5990, duration: "1 วันเต็ม 11.00–15.30 น.",
    instructor: "ครูพี่คิม", active: false,
    tagline: "(ยังไม่เปิดขาย) ฝึกพูดคล่อง พูดมั่นใจ สื่อสารได้อย่างน่าฟัง",
    detail: "• ปลดล็อกความกลัวการพูดด้วยเทคนิคปรับ Mindset ที่ใช้ได้จริง\n• ฝึกวางโครงสร้างการพูดให้กระชับ ชัด เข้าใจง่าย\n• ฝึกเสียง น้ำเสียง การพูดให้มั่นใจและน่าฟัง\n• ฝึกพูดต่อหน้าคน / หน้ากล้อง / เวที แบบไม่ตะกุกตะกัก\n• เทคนิคพูดโน้มน้าว พูดขายของ หรือพรีเซนต์งานแบบมือโปร",
    who_for: "• คนที่ไม่กล้าพูด ไม่มั่นใจ ไม่รู้จะเริ่มต้นยังไง\n• คนที่อยากพรีเซนต์งาน/พูดหน้ากล้อง/พูดขายของให้ดูมืออาชีพขึ้น\n• อินฟลูเอนเซอร์ / ฟรีแลนซ์ / เจ้าของกิจการ ที่อยากสื่อสารให้ชัดเจน",
    what_you_get: "• ไฟล์เทคนิคฝึกพูดรายวัน\n• สไลด์ประกอบเวิร์กช็อป\n• เข้ากลุ่ม Community เพื่อฝึกพูดต่อเนื่องหลังคลาส",
    reviews: [],
  },
];

export async function seedWorkshops() {
  try {
    const existing = await q(`SELECT COUNT(*) c FROM workshops`);
    if (Number(existing[0]?.c || 0) > 0) return;   // คิมจัดการเองแล้ว ไม่ยุ่ง
    for (const w of WORKSHOPS) {
      await run(`INSERT INTO workshops (workshop_id, name, tagline, detail, who_for, what_you_get, instructor, price, duration, active, seq)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (workshop_id) DO NOTHING`,
        [w.id, w.name, w.tagline, w.detail, w.who_for, w.what_you_get, w.instructor, w.price, w.duration, w.active !== false, w.seq]);
      let i = 1;
      for (const url of w.reviews || []) {
        await run(`INSERT INTO workshop_showcase (showcase_id, workshop_id, url, caption, seq) VALUES ($1,$2,$3,'',$4) ON CONFLICT (showcase_id) DO NOTHING`,
          [`${w.id}_r${i}`, w.id, url, i]);
        i++;
      }
    }
    console.log(`[seed] workshops: ใส่ ${WORKSHOPS.length} คลาสพร้อมรีวิวเรียบร้อย (ยังไม่มีรอบวันเรียน — คิมลงวันเองในหน้าแอดมิน)`);
  } catch (e) { console.warn("seedWorkshops", e.message); }
}
