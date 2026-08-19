import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://bujahyung.vercel.app",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tokenSalt = Deno.env.get("ADMIN_TOKEN_SALT")!;
const expectedTokenHash = Deno.env.get("ADMIN_TOKEN_HASH")!;

function cors(origin: string | null) {
  const safeOrigin = origin && allowedOrigins.has(origin) ? origin : "https://bujahyung.vercel.app";
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "content-type, x-admin-token",
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

async function authorized(req: Request) {
  const token = req.headers.get("x-admin-token") || "";
  if (token.length < 40) return false;
  return constantTimeEqual(await sha256(`${token}:${tokenSalt}`), expectedTokenHash);
}

Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(origin, { error: "허용되지 않은 요청입니다." }, 405);
  if (origin && !allowedOrigins.has(origin)) return json(origin, { error: "허용되지 않은 출처입니다." }, 403);
  if (!(await authorized(req))) return json(origin, { error: "관리 기기 인증이 필요합니다." }, 401);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json(origin, { error: "요청 형식이 올바르지 않습니다." }, 400); }
  const action = String(payload.action || "");

  if (action === "list") {
    const { data, error } = await db.from("posts").select("*").order("source_no", { ascending: true });
    return error ? json(origin, { error: error.message }, 400) : json(origin, { posts: data });
  }
  if (action === "publish") {
    const posts = Array.isArray(payload.posts) ? payload.posts.slice(0, 30) : [];
    const clean = posts.map((post: Record<string, unknown>) => ({
      source_no: Number(post.source_no),
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
    const { error } = await db.from("posts").update(clean).eq("id", id);
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
  }
  if (action === "delete") {
    const { error } = await db.from("posts").delete().eq("id", String(payload.id || ""));
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
  }
  return json(origin, { error: "알 수 없는 작업입니다." }, 400);
});
