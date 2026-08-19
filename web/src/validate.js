// ═══════ ตัวตรวจข้อมูลที่ลูกค้ากรอก — แยกออกมาเป็นไฟล์ธรรมดา เพื่อให้ "ตัวตรวจอัตโนมัติ" เรียกทดสอบได้ ═══════
//
// ⚠️ ทำไมต้องแยกไฟล์: ของเดิมตรรกะนี้ฝังอยู่ในไฟล์หน้าเว็บ (.jsx) ซึ่งสคริปต์ตรวจอัตโนมัติเรียกไม่ได้
//    ผลคือบั๊กร้ายแรงหลุดขึ้นเว็บจริง — ลูกค้าบุคคลธรรมดากรอกชื่อ-นามสกุลแล้ว "กดจ่ายเงินไม่ผ่าน"
//    (คิมเจอเองบนมือถือ 12 ส.ค. 2569) ทั้งที่ทดสอบครั้งเดียวก็เจอ
//    → ย้ายมาไว้ตรงนี้ ทุกครั้งที่แก้ ตัวตรวจจะไล่เคสให้เองก่อนขึ้นเว็บ

// 🧾 ข้อมูลใบกำกับภาษี
// กติกา: ลูกค้าทั่วไปกรอกแค่ชื่อ-นามสกุล (หรือไม่กรอกเลย) ต้องผ่านเสมอ
//        บังคับกรอกข้อมูลบริษัทเฉพาะตอนติ๊ก "ต้องการใบกำกับในนามบริษัท" เท่านั้น
export function validateTax(tax) {
  if (!tax) return null;                                 // ไม่ได้กรอกอะไรเลย = ผ่าน
  if (!tax.is_company) return null;                      // บุคคลธรรมดา = ผ่าน (ชื่อ-นามสกุลจะกรอกหรือไม่ก็ได้)
  if (!String(tax.name || "").trim()) return "ใส่ชื่อบริษัทด้วยนะคะ";
  if (String(tax.tax_id || "").replace(/\D/g, "").length !== 13) return "เลขประจำตัวผู้เสียภาษีต้องมี 13 หลักค่ะ";
  if (!String(tax.address || "").trim()) return "ใส่ที่อยู่บริษัทตามที่จดทะเบียนด้วยนะคะ";
  return null;
}

// 💸 ภาษีหัก ณ ที่จ่าย 3% — หักจากยอดก่อน VAT เท่านั้น (ราคาเรารวม VAT แล้ว ต้องถอดก่อน)
// ⚠️ บุคคลธรรมดาหักไม่ได้ตามกฎหมาย → คืน 0 เสมอถ้าไม่ได้ขอ
export const WHT_PCT = 3;
export function whtAmount(totalSatang, wantWht) {
  if (!wantWht) return 0;
  const net = Math.round(Number(totalSatang || 0) / 1.07);
  return Math.round(net * WHT_PCT / 100);
}

// ═══════════ 📧 ตัวเตือนอีเมลพิมพ์ผิด ═══════════
//
// ⚠️ เคสจริง 19 ส.ค. 2569: ลูกค้าพิมพ์ saranya.kanr@gmail.con (ตกตัว m)
//    จ่ายเงินสำเร็จ · เล่มสร้างเสร็จ · แต่อีเมลแจ้งเล่มส่งไปไม่ถึงตลอดกาล
//    ลูกค้าเข้าใจว่า "จ่ายแล้วไม่ได้ของ" → ทักมาต่อว่า ทีมต้องไล่หาย้อนหลัง
//
// 📌 จงใจให้เป็นแค่ "คำเตือน" ไม่ใช่การบล็อก — เพราะโดเมนแปลกๆ ที่ถูกจริงก็มี
//    ห้ามกันลูกค้าไม่ให้จ่ายเงินเด็ดขาด แค่ถามยืนยันก่อนพอ
//
// คืน { suggest } = อีเมลที่น่าจะถูก · คืน null = ไม่มีอะไรน่าสงสัย

// โดเมนที่ลูกค้าไทยใช้จริงเกือบทั้งหมด + รูปแบบที่พิมพ์พลาดบ่อย
const DOMAIN_FIXES = {
  // gmail
  "gmail.con": "gmail.com", "gmail.co": "gmail.com", "gmail.cm": "gmail.com",
  "gmail.cpm": "gmail.com", "gmail.comm": "gmail.com", "gmail.xom": "gmail.com",
  "gmail.vom": "gmail.com", "gmail.om": "gmail.com", "gmail.cim": "gmail.com",
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmil.com": "gmail.com",
  "gmaill.com": "gmail.com", "gnail.com": "gmail.com", "gmali.com": "gmail.com",
  "gamil.com": "gmail.com", "gmail.co.th": "gmail.com",
  // hotmail
  "hotmail.con": "hotmail.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com", "hotmail.cm": "hotmail.com",
  // yahoo
  "yahoo.con": "yahoo.com", "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  // outlook / icloud
  "outlook.con": "outlook.com", "outlok.com": "outlook.com", "outloook.com": "outlook.com",
  "icloud.con": "icloud.com", "icoud.com": "icloud.com", "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

export function emailTypoHint(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email.includes("@")) return null;
  const at = email.lastIndexOf("@");
  const user = email.slice(0, at), domain = email.slice(at + 1);
  if (!user || !domain) return null;

  // 1) โดเมนที่รู้จักว่าพิมพ์ผิดแน่ๆ → บอกตัวที่ถูกได้เลย
  if (DOMAIN_FIXES[domain]) return { suggest: `${user}@${DOMAIN_FIXES[domain]}` };

  // 2) ลงท้ายด้วยนามสกุลที่ไม่มีอยู่จริง (.con .cim .xom ...) แต่โดเมนไม่อยู่ในรายการข้างบน
  //    เดาว่าเจ้าตัวตั้งใจพิมพ์ .com — เจอบ่อยกับโดเมนบริษัท
  const badTld = domain.match(/\.(con|cim|xom|vom|cpm|comm|ocm|cmo)$/);
  if (badTld) return { suggest: `${user}@${domain.replace(/\.[^.]+$/, ".com")}` };

  return null;
}
