import fs from "node:fs";
import crypto from "node:crypto";

const [classificationPath, apiUrl] = process.argv.slice(2);
if (!classificationPath || !apiUrl) {
  throw new Error("Usage: node tools/import_threads_life.mjs <classification.json> <admin-api-url>");
}

const dryRun = process.argv.includes("--dry-run");
const pin = process.env.BUJAHYUNG_ADMIN_PIN;
if (!dryRun && !pin) throw new Error("BUJAHYUNG_ADMIN_PIN is required");

const propertyTerms = [
  "경매", "공매", "낙찰", "입찰", "패찰", "유찰", "권리분석", "매각물건명세서",
  "사건번호", "타경", "감정가", "최저가", "명도", "배당", "대항력", "우선변제",
  "유치권", "법정지상권", "근저당", "임차인", "채무자", "채권자", "담보대출",
  "대부업", "대부", "npl", "부실채권", "입찰표", "보증금", "매각기일", "부동산",
  "등기부", "실거래가", "대지권", "재건축", "재개발", "토지", "상가", "아파트",
  "오피스텔", "다세대", "다가구", "빌라", "임대차", "전세", "월세", "소유권",
  "점유자", "현장 임장", "매물", "시세차익", "수익률", "매수인",
];

const input = JSON.parse(fs.readFileSync(classificationPath, "utf8"));
const candidates = [
  ...input.daily,
  ...input.excluded.filter(post => ["too-short", "social-noise"].includes(post.classification)),
].filter(post => !propertyTerms.some(term => post.body.toLowerCase().includes(term)));

candidates.sort((a, b) => a.timestamp - b.timestamp || a.external_id.localeCompare(b.external_id));

if (dryRun) {
  console.log(JSON.stringify({ candidates: candidates.length, first: candidates.at(0), last: candidates.at(-1) }, null, 2));
  process.exit(0);
}

async function call(payload, session = "") {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://bujahyung.vercel.app",
      ...(session ? { "x-admin-session": session } : {}),
    },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch {
    throw new Error(`HTTP ${response.status}: ${raw.replace(/\s+/g, " ").slice(0, 240)}`);
  }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const { session } = await call({ action: "login", pin });
const { posts: existing } = await call({ action: "list" }, session);
const life = existing.filter(post => post.category === "life-stories");
const existingBodies = new Set(life.map(post => post.body.replace(/\s+/g, " ").trim()));
const existingExternalIds = new Set(life.map(post => post.external_id).filter(Boolean));
const maximumSourceNo = life.reduce((maximum, post) => Math.max(maximum, Number(post.source_no) || 0), 0);

const pending = candidates.filter(post => {
  const key = post.body.replace(/\s+/g, " ").trim();
  return !existingBodies.has(key) && !existingExternalIds.has(post.external_id);
}).map((post, index) => ({
  external_id: post.external_id || crypto.createHash("sha256").update(`${post.timestamp}\n${post.body}`).digest("hex").slice(0, 24),
  source_no: maximumSourceNo + index + 1,
  title: post.title,
  body: post.body,
  published_at: post.published_at,
}));

console.log(JSON.stringify({ candidates: candidates.length, existing: life.length, pending: pending.length }));
for (let start = 0; start < pending.length; start += 100) {
  const batch = pending.slice(start, start + 100);
  await call({ action: "bulk-create-life-stories", posts: batch }, session);
  console.log(`uploaded=${Math.min(start + batch.length, pending.length)}/${pending.length}`);
}
