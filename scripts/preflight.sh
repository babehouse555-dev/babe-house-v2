#!/bin/bash
# 🛡️ ด่านตรวจก่อนขึ้นเว็บ — ทดสอบ "ตัวคอมมิตจริงที่จะขึ้น" ไม่ใช่โฟลเดอร์เครื่องเรา
#
# บทเรียน 2 ส.ค.: เว็บล่มเพราะไฟล์บนสายที่ push ขาดไฟล์เพื่อนบ้าน แต่ทดสอบในเครื่องผ่าน
# เพราะเครื่องเรามีไฟล์นั้นอยู่ — ต่อจากนี้ต้องทดสอบจากต้นไม้ของคอมมิตจริงเท่านั้น
#
# ใช้: bash scripts/preflight.sh [commit]   (ไม่ใส่ = HEAD)
set -u
REF="${1:-HEAD}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SHA=$(git rev-parse "$REF" 2>/dev/null) || { echo "❌ ไม่รู้จัก commit: $REF"; exit 1; }
TMP="$(mktemp -d /tmp/preflight.XXXXXX)"
SRV=""
PORT=$((3900 + RANDOM % 90))
cleanup() { [ -n "$SRV" ] && { kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null; }; git worktree remove --force "$TMP" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

echo "🛡️ ตรวจ commit ${SHA:0:10} ($REF)"

# ① กางต้นไม้ของคอมมิตจริง (ไม่ใช่ working dir)
git worktree add --detach -f "$TMP" "$SHA" -q 2>/dev/null || { echo "❌ กาง worktree ไม่ได้"; exit 1; }
ln -s "$ROOT/node_modules" "$TMP/node_modules"

# ② ไวยากรณ์ทุกไฟล์เซิร์ฟเวอร์
for f in "$TMP"/server/*.js; do
  node --check "$f" 2>/tmp/pf_err || { echo "❌ ไวยากรณ์พังใน $(basename "$f"):"; head -3 /tmp/pf_err; exit 1; }
done
echo "  ✅ ไวยากรณ์ผ่านทุกไฟล์"

# ③ import สัมพัทธ์ทุกตัวต้องมีไฟล์จริง "ในต้นไม้นี้" (ตัวที่จับบั๊กวันนี้ได้)
MISSING=$(cd "$TMP" && grep -rhoE "from ['\"](\./|\.\./)[^'\"]+['\"]" server/ web/src/ 2>/dev/null | sed -E "s/from ['\"]//; s/['\"]$//" | sort -u | while read -r imp; do :; done; \
  for dir in server web/src web/src/pages; do
    [ -d "$TMP/$dir" ] || continue
    (cd "$TMP/$dir" && grep -hoE "from ['\"]\.\.?/[^'\"]+['\"]" *.js *.jsx 2>/dev/null | sed -E "s/from ['\"]//; s/['\"]$//" | sort -u | while read -r imp; do
      base="$imp"
      if [ ! -e "$base" ] && [ ! -e "$base.js" ] && [ ! -e "$base.jsx" ]; then echo "$dir → $imp"; fi
    done)
  done)
if [ -n "$MISSING" ]; then echo "❌ import หาไฟล์ไม่เจอในคอมมิตนี้:"; echo "$MISSING" | sed 's/^/     /'; exit 1; fi
echo "  ✅ import ครบทุกไฟล์"

# ④ บูตจริงจากต้นไม้นี้ (DB ปลอม — เซิร์ฟเวอร์ต้องยังเปิดพอร์ตได้ตามดีไซน์)
( cd "$TMP" && DATABASE_URL='postgres://x:x@127.0.0.1:1/x' EMAIL_ENABLED=0 PAY_PROVIDER=mock PORT=$PORT \
  node server/index.js >/tmp/pf_boot.log 2>&1 ) & SRV=$!
disown "$SRV" 2>/dev/null
OK=""
for i in $(seq 1 15); do
  sleep 1
  if curl -sf --max-time 3 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then OK=1; break; fi
  kill -0 "$SRV" 2>/dev/null || break
done
if [ -z "$OK" ]; then
  echo "❌ เซิร์ฟเวอร์บูตไม่ขึ้นจากคอมมิตนี้:"; tail -6 /tmp/pf_boot.log | sed 's/^/     /'; exit 1
fi
echo "  ✅ บูตติด · /api/health ตอบ 200"
echo "🟢 ผ่านทุกด่าน — คอมมิตนี้ปลอดภัยที่จะขึ้น"
