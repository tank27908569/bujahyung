import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://bujahyung.vercel.app",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pinSalt = Deno.env.get("ADMIN_PIN_SALT")!;
const expectedPinHash = Deno.env.get("ADMIN_PIN_HASH")!;
const sessionSecret = Deno.env.get("ADMIN_SESSION_SECRET")!;
const categories = new Set([
  "thread-seodang",
  "library",
  "love-auction-philosophy",
  "auction-stories",
  "life-stories",
]);

function cors(origin: string | null) {
  const safeOrigin = origin && allowedOrigins.has(origin) ? origin : "https://bujahyung.vercel.app";
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "content-type, x-admin-session",
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

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function createSession() {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ role: "admin", exp: Date.now() + 12 * 60 * 60 * 1000 })));
  return `${payload}.${await hmac(payload)}`;
}

async function validSession(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !constantTimeEqual(await hmac(payload), signature)) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    return data.role === "admin" && Number(data.exp) > Date.now();
  } catch { return false; }
}

async function login(req: Request, origin: string | null, pin: string) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const identifier = await sha256(forwarded);
  const { data: attempt, error: readError } = await db.from("admin_login_attempts").select("*").eq("identifier", identifier).maybeSingle();
  if (readError) return json(origin, { error: "로그인 보호 기능을 확인하지 못했습니다." }, 503);
  const now = Date.now();
  if (attempt?.blocked_until && new Date(attempt.blocked_until).getTime() > now) {
    return json(origin, { error: "비밀번호 입력 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요." }, 429);
  }
  const pinHash = await sha256(`${pin}:${pinSalt}`);
  if (!/^\d{4}$/.test(pin) || !constantTimeEqual(pinHash, expectedPinHash)) {
    const withinWindow = attempt?.window_started_at && now - new Date(attempt.window_started_at).getTime() < 15 * 60 * 1000;
    const failures = withinWindow ? Number(attempt.failures || 0) + 1 : 1;
    const blockedUntil = failures >= 5 ? new Date(now + 60 * 60 * 1000).toISOString() : null;
    const { error: writeError } = await db.from("admin_login_attempts").upsert({
      identifier,
      failures,
      window_started_at: withinWindow ? attempt.window_started_at : new Date(now).toISOString(),
      blocked_until: blockedUntil,
      updated_at: new Date(now).toISOString(),
    });
    if (writeError) return json(origin, { error: "로그인 보호 기능을 적용하지 못했습니다." }, 503);
    return json(origin, { error: failures >= 5 ? "비밀번호 입력 횟수를 초과했습니다. 1시간 후 다시 시도해 주세요." : "관리 비밀번호가 맞지 않습니다." }, failures >= 5 ? 429 : 401);
  }
  const { error: clearError } = await db.from("admin_login_attempts").delete().eq("identifier", identifier);
  if (clearError) return json(origin, { error: "로그인 보호 기능을 초기화하지 못했습니다." }, 503);
  return json(origin, { session: await createSession() });
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(origin, { error: "허용되지 않은 요청입니다." }, 405);
  if (origin && !allowedOrigins.has(origin)) return json(origin, { error: "허용되지 않은 출처입니다." }, 403);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(origin, { error: "요청 형식이 올바르지 않습니다." }, 400); }
  const action = String(payload.action || "");
  if (action === "login") return login(req, origin, String(payload.pin || ""));
  if (!(await validSession(req.headers.get("x-admin-session") || ""))) return json(origin, { error: "관리자 로그인이 필요합니다." }, 401);

  if (action === "list") {
    const { data, error } = await db.from("posts").select("*").order("updated_at", { ascending: false });
    return error ? json(origin, { error: error.message }, 400) : json(origin, { posts: data });
  }
  if (action === "create") {
    const category = String(payload.category || "");
    const title = String(payload.title || "").trim().slice(0, 300);
    const body = String(payload.body || "").trim().slice(0, 30000);
    const sourceNo = Number(payload.source_no);
    if (!categories.has(category) || !title || !body) return json(origin, { error: "분류, 제목, 본문을 모두 입력해 주세요." }, 400);
    const { data, error } = await db.from("posts").insert({
      category,
      source_no: Number.isInteger(sourceNo) && sourceNo > 0 ? sourceNo : null,
      title,
      body,
      is_published: payload.is_published !== false,
      published_at: new Date().toISOString(),
    }).select("*").single();
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true, post: data });
  }
  if (action === "publish") {
    const posts = Array.isArray(payload.posts) ? payload.posts.slice(0, 30) : [];
    const clean = posts.map((post: Record<string, unknown>) => ({
      source_no: Number(post.source_no),
      category: "thread-seodang",
      title: String(post.title || "").slice(0, 300),
      body: String(post.body || "").slice(0, 30000),
      is_published: true,
      published_at: new Date().toISOString(),
    })).filter(post => Number.isInteger(post.source_no) && post.title && post.body);
    if (!clean.length) return json(origin, { error: "게시할 글이 없습니다." }, 400);
    const { error } = await db.from("posts").insert(clean);
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true, count: clean.length });
  }
  if (action === "update") {
    const id = String(payload.id || "");
    const changes = (payload.changes || {}) as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    if (typeof changes.title === "string") clean.title = changes.title.slice(0, 300);
    if (typeof changes.body === "string") clean.body = changes.body.slice(0, 30000);
    if (typeof changes.is_published === "boolean") clean.is_published = changes.is_published;
    if (typeof changes.category === "string" && categories.has(changes.category)) clean.category = changes.category;
    const { error } = await db.from("posts").update(clean).eq("id", id);
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
  }
  if (action === "delete") {
    const { error } = await db.from("posts").delete().eq("id", String(payload.id || ""));
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
  }
  return json(origin, { error: "알 수 없는 작업입니다." }, 400);
});
