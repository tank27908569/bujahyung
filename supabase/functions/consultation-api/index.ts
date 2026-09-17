import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
const serviceLabels: Record<string, string> = {
  "auction-consulting": "경매 투자·사업 상담",
  "auction-course": "경매강의",
  "property-recommendation": "경매 물건추천",
  "property-consulting": "경매 물건상담",
  "winning-bid-consulting": "낙찰컨설팅",
  "lending-business": "대부업 사업 준비 상담",
  other: "기타 사업 제안",
};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const gmailUser = Deno.env.get("GMAIL_USER") || "";
// 구글이 보여주는 앱 비밀번호에는 공백이 섞여 있어 그대로 붙여넣어도 되도록 제거한다.
const gmailAppPassword = (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s/g, "");
const notifyTo = Deno.env.get("NOTIFY_TO_EMAIL") || gmailUser;
const siteUrl = Deno.env.get("SITE_URL") || "https://bujahyung.vercel.app";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

type Inquiry = {
  service_type: string;
  name: string;
  phone: string;
  preferred_contact_time: string;
  message: string;
};

function encodeMailHeader(value: string) {
  // denomailer의 헤더 인코더는 74자마다 소프트 줄바꿈을 넣는데, 헤더 안에서는 이것이 허용되지 않는다.
  // 그래서 한글 제목이 조금만 길어져도 헤더가 깨지고 메일 전체가 원본 MIME으로 보인다.
  // 직접 base64 encoded-word로 만들고, 앞에 공백을 둬서 denomailer가 다시 인코딩하지 않도록 한다.
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return ` =?UTF-8?B?${btoa(binary)}?=`;
}

async function notifyByEmail(inquiry: Inquiry) {
  if (!gmailUser || !gmailAppPassword || !notifyTo) return;
  const label = serviceLabels[inquiry.service_type] || inquiry.service_type;
  const receivedAt = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const rows = [
    ["상담 분야", label],
    ["성함", inquiry.name],
    ["연락처", inquiry.phone],
    ["희망 연락 시간", inquiry.preferred_contact_time || "-"],
    ["접수 시각", receivedAt],
  ].map(([key, value]) => `<tr><th align="left" style="padding:6px 14px 6px 0;color:#77746c;font-weight:400;white-space:nowrap">${escapeHtml(key)}</th><td style="padding:6px 0;color:#171815">${escapeHtml(value)}</td></tr>`).join("");
  const html = `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;background:#f1eee6;color:#171815">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:.18em;color:#8f2e25">BUJAHYUNG CONSULTATION</p>
    <h1 style="margin:0 0 22px;font-size:21px;font-weight:600">새 상담 신청이 접수되었습니다</h1>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid rgba(23,24,21,.15);border-bottom:1px solid rgba(23,24,21,.15);margin-bottom:20px">${rows}</table>
    <p style="margin:0 0 8px;font-size:12px;color:#77746c">상담 내용</p>
    <div style="white-space:pre-wrap;font-size:14px;line-height:1.8;background:#fff;padding:16px 18px;border-left:3px solid #8f2e25">${escapeHtml(inquiry.message)}</div>
    <p style="margin:24px 0 0;font-size:13px"><a href="${siteUrl}/admin.html" style="color:#8f2e25">관리자 페이지에서 처리 상태 변경하기 →</a></p>
  </div>`;
  const text = `새 상담 신청\n\n상담 분야: ${label}\n성함: ${inquiry.name}\n연락처: ${inquiry.phone}\n희망 연락 시간: ${inquiry.preferred_contact_time || "-"}\n접수 시각: ${receivedAt}\n\n상담 내용\n${inquiry.message}\n\n관리자 페이지: ${siteUrl}/admin.html`;

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailAppPassword },
    },
  });
  try {
    await client.send({
      from: `부자형 상담 <${gmailUser}>`,
      to: notifyTo.split(",").map(address => address.trim()).filter(Boolean),
      subject: encodeMailHeader(`[상담신청] ${inquiry.name.slice(0, 8)}`),
      content: text,
      html,
    });
  } finally {
    await client.close();
  }
}


const solapiApiKey = Deno.env.get("SOLAPI_API_KEY") || "";
const solapiApiSecret = Deno.env.get("SOLAPI_API_SECRET") || "";
const solapiSender = (Deno.env.get("SOLAPI_SENDER_PHONE") || "").replace(/\D/g, "");
const notifyToPhone = Deno.env.get("NOTIFY_TO_PHONE") || "";

async function hmacSha256Hex(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function notifyBySms(inquiry: Inquiry) {
  if (!solapiApiKey || !solapiApiSecret || !solapiSender || !notifyToPhone) return;
  const label = serviceLabels[inquiry.service_type] || inquiry.service_type;
  // 본문이 90바이트를 넘으면 요금이 비싼 LMS로 자동 전환되므로 문자에는 핵심만 담고 상세 내용은 메일과 관리자 페이지에서 확인한다.
  const text = `[부자형 상담신청]\n${inquiry.name} · ${label}\n${inquiry.phone}`;
  const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const date = new Date().toISOString();
  const signature = await hmacSha256Hex(solapiApiSecret, date + salt);
  const recipients = notifyToPhone.split(",").map(number => number.replace(/\D/g, "")).filter(Boolean);

  for (const to of recipients) {
    const response = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        Authorization: `HMAC-SHA256 apiKey=${solapiApiKey}, date=${date}, salt=${salt}, signature=${signature}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { to, from: solapiSender, text } }),
    });
    const result = await response.json().catch(() => ({}));
    const statusCode = String(result?.statusCode ?? result?.message?.statusCode ?? "");
    if (!response.ok || (statusCode && !statusCode.startsWith("2"))) {
      console.error("consultation sms failed", response.status, JSON.stringify(result));
    }
  }
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

  const inquiry: Inquiry = {
    service_type: serviceType,
    name,
    phone,
    preferred_contact_time: preferredContactTime,
    message,
  };
  const { error } = await db.from("consultation_inquiries").insert({ ...inquiry, ip_hash: ipHash });
  if (error) return json(origin, { error: "상담 신청을 저장하지 못했습니다." }, 503);

  try {
    await Promise.all([
      notifyByEmail(inquiry).catch(error => console.error("consultation email error", error)),
      notifyBySms(inquiry).catch(error => console.error("consultation sms error", error)),
    ]);
  } catch (notifyError) {
    console.error("consultation notify error", notifyError);
  }
  return json(origin, { ok: true }, 201);
});
