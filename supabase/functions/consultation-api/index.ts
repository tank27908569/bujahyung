import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://bujahyung.vercel.app",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);
const allowedServices = new Set([
  "auction-consulting",
  "auction-course",
  "property-recommendation",
  "property-consulting",
  "winning-bid-consulting",
  "lending-business",
  "other",
]);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cors(origin: string | null) {
  const safeOrigin = origin && allowedOrigins.has(origin) ? origin : "https://bujahyung.vercel.app";
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(origin, { error: "허용되지 않은 요청입니다." }, 405);
  if (origin && !allowedOrigins.has(origin)) return json(origin, { error: "허용되지 않은 출처입니다." }, 403);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(origin, { error: "요청 형식이 올바르지 않습니다." }, 400); }
  if (String(payload.website || "")) return json(origin, { ok: true });

  const serviceType = String(payload.service_type || "");
  const name = String(payload.name || "").trim().slice(0, 50);
  const phone = String(payload.phone || "").trim().slice(0, 20);
  const preferredContactTime = String(payload.preferred_contact_time || "").trim().slice(0, 100);
  const message = String(payload.message || "").trim().slice(0, 2000);
  if (!allowedServices.has(serviceType) || !name || !/^[0-9+()\-\s]{8,20}$/.test(phone) || !message) {
    return json(origin, { error: "상담 분야, 성함, 올바른 연락처와 상담 내용을 입력해 주세요." }, 400);
  }

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await sha256(forwarded);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db.from("consultation_inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", oneHourAgo);
  if (countError) return json(origin, { error: "상담 접수 상태를 확인하지 못했습니다." }, 503);
  if ((count || 0) >= 5) return json(origin, { error: "요청이 많습니다. 한 시간 후 다시 시도해 주세요." }, 429);

  const { error } = await db.from("consultation_inquiries").insert({
    service_type: serviceType,
    name,
    phone,
    preferred_contact_time: preferredContactTime,
    message,
    ip_hash: ipHash,
  });
  return error ? json(origin, { error: "상담 신청을 저장하지 못했습니다." }, 503) : json(origin, { ok: true }, 201);
});
