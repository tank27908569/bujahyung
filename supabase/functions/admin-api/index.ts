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
const inquiryStatuses = new Set(["new", "contacted", "completed", "archived"]);
const threadsCategories = new Set(["auction-stories", "life-stories"]);
const threadsApiBase = "https://graph.threads.net/v1.0";
const threadsRedirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/threads-oauth`;

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

async function integrationKey() {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`threads:${sessionSecret}`));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptIntegrationSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await integrationKey(),
    new TextEncoder().encode(value),
  ));
  return `${base64Url(iv)}.${base64Url(encrypted)}`;
}

async function decryptIntegrationSecret(value: string) {
  const [ivPart, encryptedPart] = value.split(".");
  if (!ivPart || !encryptedPart) throw new Error("Threads 연결 정보가 손상되었습니다.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivPart) },
    await integrationKey(),
    decodeBase64Url(encryptedPart),
  );
  return new TextDecoder().decode(decrypted);
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

type ThreadsItem = {
  id: string;
  text?: string;
  timestamp?: string;
  permalink?: string;
  is_reply?: boolean;
  is_reply_owned_by_me?: boolean;
  replied_to?: { id?: string };
};

async function threadsGet(path: string, token: string) {
  const first = new URL(path.startsWith("http") ? path : `${threadsApiBase}${path}`);
  first.searchParams.set("access_token", token);
  const items: ThreadsItem[] = [];
  let next: string | null = first.toString();
  for (let page = 0; next && page < 50; page += 1) {
    const response = await fetch(next);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || `Threads API HTTP ${response.status}`);
    if (Array.isArray(result.data)) items.push(...result.data);
    next = typeof result?.paging?.next === "string" ? result.paging.next : null;
  }
  return items;
}

function continuationReplies(rootId: string, conversation: ThreadsItem[]) {
  const ordered = conversation
    .filter(item => item.id && item.text && item.is_reply_owned_by_me)
    .sort((left, right) => Date.parse(left.timestamp || "") - Date.parse(right.timestamp || ""));
  const accepted = new Set([rootId]);
  const result: ThreadsItem[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of ordered) {
      if (accepted.has(item.id)) continue;
      const parentId = item.replied_to?.id || rootId;
      if (!accepted.has(parentId)) continue;
      accepted.add(item.id);
      result.push(item);
      changed = true;
    }
  }
  return result.sort((left, right) => Date.parse(left.timestamp || "") - Date.parse(right.timestamp || ""));
}

function threadsTitle(text: string) {
  const first = text.split(/\r?\n/).map(line => line.trim()).find(Boolean) || "Threads 이야기";
  return first.length <= 60 ? first : `${first.slice(0, 57).trim()}…`;
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

  if (action === "upload-post-image") {
    const mime = String(payload.file_type || "").toLowerCase();
    const base64 = String(payload.file_base64 || "");
    const reportedSize = Number(payload.file_size || 0);
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/webm": "webm",
    };
    const isVideo = mime.startsWith("video/");
    const maxSize = isVideo ? 12 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!extensions[mime]) return json(origin, { error: "JPG, PNG, WEBP, GIF 사진 또는 MP4, WEBM 동영상만 올릴 수 있습니다." }, 400);
    if (!Number.isFinite(reportedSize) || reportedSize <= 0 || reportedSize > maxSize) return json(origin, { error: isVideo ? "동영상은 한 개당 12MB까지 올릴 수 있습니다." : "사진은 한 장당 8MB까지 올릴 수 있습니다." }, 400);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0)); }
    catch { return json(origin, { error: "미디어 파일 형식이 올바르지 않습니다." }, 400); }
    if (!bytes.length || bytes.length > maxSize || Math.abs(bytes.length - reportedSize) > 3) return json(origin, { error: "미디어 파일 크기를 확인해 주세요." }, 400);
    const now = new Date();
    const path = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${extensions[mime]}`;
    const { error } = await db.storage.from("post-images").upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "31536000" });
    if (error) return json(origin, { error: `미디어를 저장하지 못했습니다: ${error.message}` }, 400);
    const { data } = db.storage.from("post-images").getPublicUrl(path);
    return json(origin, { ok: true, url: data.publicUrl });
  }

  if (action === "list") {
    const { data, error } = await db.from("posts").select("*").order("updated_at", { ascending: false });
    return error ? json(origin, { error: error.message }, 400) : json(origin, { posts: data });
  }
  if (action === "threads-integration-status") {
    const { data, error } = await db.from("threads_integration")
      .select("app_id, app_secret_encrypted, access_token_encrypted, token_expires_at, connected_username")
      .eq("id", 1)
      .maybeSingle();
    if (error) return json(origin, { error: error.message }, 400);
    return json(origin, {
      app_id: data?.app_id || Deno.env.get("THREADS_APP_ID") || "",
      secret_configured: Boolean(data?.app_secret_encrypted),
      connected: Boolean(data?.access_token_encrypted),
      token_expires_at: data?.token_expires_at || null,
      connected_username: data?.connected_username || null,
    });
  }
  if (action === "save-threads-app-secret") {
    const appId = Deno.env.get("THREADS_APP_ID") || "";
    const appSecret = String(payload.app_secret || "").trim();
    if (!/^\d+$/.test(appId)) return json(origin, { error: "Threads 앱 ID가 서버에 설정되지 않았습니다." }, 503);
    if (appSecret.length < 16 || appSecret.length > 300) return json(origin, { error: "Threads 앱 시크릿을 확인해 주세요." }, 400);
    const { error } = await db.from("threads_integration").upsert({
      id: 1,
      app_id: appId,
      app_secret_encrypted: await encryptIntegrationSecret(appSecret),
    }, { onConflict: "id" });
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
  }
  if (action === "threads-oauth-url") {
    const { data, error } = await db.from("threads_integration")
      .select("app_id, app_secret_encrypted")
      .eq("id", 1)
      .maybeSingle();
    if (error) return json(origin, { error: error.message }, 400);
    if (!data?.app_secret_encrypted) return json(origin, { error: "먼저 Threads 앱 시크릿을 저장해 주세요." }, 400);
    const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const { error: stateError } = await db.from("threads_integration").update({
      oauth_state: state,
      oauth_state_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }).eq("id", 1);
    if (stateError) return json(origin, { error: stateError.message }, 400);
    const url = new URL("https://threads.net/oauth/authorize");
    url.searchParams.set("client_id", data.app_id);
    url.searchParams.set("redirect_uri", threadsRedirectUri);
    url.searchParams.set("scope", "threads_basic,threads_read_replies");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    return json(origin, { url: url.toString(), redirect_uri: threadsRedirectUri });
  }
  if (action === "list-threads-imports") {
    const { data, error } = await db.from("threads_imports")
      .select("id, thread_id, permalink, root_text, replies, combined_body, thread_timestamp, status, published_post_id, synced_at")
      .order("thread_timestamp", { ascending: false });
    return error ? json(origin, { error: error.message }, 400) : json(origin, { imports: data });
  }
  if (action === "sync-threads") {
    let token = Deno.env.get("THREADS_ACCESS_TOKEN") || "";
    if (!token) {
      const { data, error } = await db.from("threads_integration").select("access_token_encrypted").eq("id", 1).maybeSingle();
      if (error) return json(origin, { error: error.message }, 400);
      if (data?.access_token_encrypted) token = await decryptIntegrationSecret(data.access_token_encrypted);
    }
    if (!token) return json(origin, { error: "Threads 계정 연결이 필요합니다. THREADS_ACCESS_TOKEN을 설정해 주세요." }, 503);
    try {
      const roots = (await threadsGet("/me/threads?fields=id,text,timestamp,permalink,is_reply&limit=100", token))
        .filter(item => item.id && item.text && !item.is_reply);
      const { data: previous, error: previousError } = await db.from("threads_imports")
        .select("thread_id, status, published_post_id");
      if (previousError) return json(origin, { error: previousError.message }, 400);
      const previousById = new Map((previous || []).map(item => [item.thread_id, item]));
      const rows = [];
      for (const root of roots) {
        const conversation = await threadsGet(
          `/${encodeURIComponent(root.id)}/conversation?fields=id,text,timestamp,permalink,is_reply,is_reply_owned_by_me,replied_to,root_post&reverse=false&limit=100`,
          token,
        );
        const replies = continuationReplies(root.id, conversation).map(reply => ({
          id: reply.id,
          text: String(reply.text || "").trim(),
          timestamp: reply.timestamp || null,
          permalink: reply.permalink || null,
          parent_id: reply.replied_to?.id || root.id,
        }));
        const rootText = String(root.text || "").trim();
        const combinedBody = [rootText, ...replies.map(reply => reply.text)].filter(Boolean).join("\n\n").slice(0, 30000);
        const existing = previousById.get(root.id);
        rows.push({
          thread_id: root.id,
          permalink: root.permalink || null,
          root_text: rootText,
          replies,
          combined_body: combinedBody,
          thread_timestamp: Number.isNaN(Date.parse(root.timestamp || "")) ? new Date().toISOString() : new Date(root.timestamp!).toISOString(),
          status: existing?.status || "pending",
          published_post_id: existing?.published_post_id || null,
          synced_at: new Date().toISOString(),
        });
      }
      if (rows.length) {
        const { error } = await db.from("threads_imports").upsert(rows, { onConflict: "thread_id" });
        if (error) return json(origin, { error: error.message }, 400);
      }
      return json(origin, { ok: true, count: rows.length });
    } catch (error) {
      return json(origin, { error: error instanceof Error ? error.message : "Threads 동기화에 실패했습니다." }, 502);
    }
  }
  if (action === "publish-threads-imports") {
    const selections = Array.isArray(payload.selections) ? payload.selections.slice(0, 50) : [];
    const clean = selections.map((item: Record<string, unknown>) => ({
      id: String(item.id || ""),
      category: String(item.category || ""),
    })).filter(item => item.id && threadsCategories.has(item.category));
    if (!clean.length || clean.length !== selections.length) return json(origin, { error: "게시할 글과 분류를 확인해 주세요." }, 400);
    const { data: imports, error: importsError } = await db.from("threads_imports")
      .select("*")
      .in("id", clean.map(item => item.id))
      .eq("status", "pending");
    if (importsError) return json(origin, { error: importsError.message }, 400);
    if (!imports?.length) return json(origin, { error: "게시 가능한 Threads 원고가 없습니다." }, 400);
    const categoryById = new Map(clean.map(item => [item.id, item.category]));
    const nextNumbers = new Map<string, number>();
    for (const category of threadsCategories) {
      const { data, error } = await db.from("posts").select("source_no").eq("category", category).order("source_no", { ascending: false }).limit(1);
      if (error) return json(origin, { error: error.message }, 400);
      nextNumbers.set(category, Number(data?.[0]?.source_no || 0));
    }
    let published = 0;
    for (const item of imports.sort((left, right) => Date.parse(left.thread_timestamp) - Date.parse(right.thread_timestamp))) {
      const category = categoryById.get(item.id)!;
      const sourceNo = (nextNumbers.get(category) || 0) + 1;
      nextNumbers.set(category, sourceNo);
      const { data: post, error } = await db.from("posts").insert({
        external_id: `threads-${item.thread_id}`,
        category,
        source_no: sourceNo,
        title: threadsTitle(item.root_text),
        body: item.combined_body,
        is_published: true,
        published_at: item.thread_timestamp,
      }).select("id").single();
      if (error) return json(origin, { error: error.message, published }, 400);
      const { error: updateError } = await db.from("threads_imports").update({ status: "published", published_post_id: post.id }).eq("id", item.id);
      if (updateError) return json(origin, { error: updateError.message, published }, 400);
      published += 1;
    }
    return json(origin, { ok: true, count: published });
  }
  if (action === "list-inquiries") {
    const { data, error } = await db.from("consultation_inquiries")
      .select("id, service_type, name, phone, preferred_contact_time, message, status, created_at, updated_at")
      .order("created_at", { ascending: false });
    return error ? json(origin, { error: error.message }, 400) : json(origin, { inquiries: data });
  }
  if (action === "update-inquiry") {
    const id = String(payload.id || "");
    const status = String(payload.status || "");
    if (!id || !inquiryStatuses.has(status)) return json(origin, { error: "처리 상태가 올바르지 않습니다." }, 400);
    const { error } = await db.from("consultation_inquiries").update({ status }).eq("id", id);
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
  }
  if (action === "delete-inquiry") {
    const { error } = await db.from("consultation_inquiries").delete().eq("id", String(payload.id || ""));
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
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
      cover_image_url: String(payload.cover_image_url || "").trim().slice(0, 500) || null,
      cover_quote: String(payload.cover_quote || "").trim().slice(0, 200) || null,
      is_published: payload.is_published !== false,
      published_at: new Date().toISOString(),
    }).select("*").single();
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true, post: data });
  }
  if (action === "bulk-create-life-stories") {
    const posts = Array.isArray(payload.posts) ? payload.posts.slice(0, 100) : [];
    const clean = posts.map((post: Record<string, unknown>) => {
      const publishedAt = String(post.published_at || "");
      const sourceNo = Number(post.source_no);
      return {
        external_id: String(post.external_id || "").trim().slice(0, 100),
        source_no: sourceNo,
        category: "life-stories",
        title: String(post.title || "").trim().slice(0, 300),
        body: String(post.body || "").trim().slice(0, 30000),
        is_published: true,
        published_at: Number.isNaN(Date.parse(publishedAt)) ? "" : new Date(publishedAt).toISOString(),
      };
    }).filter(post => post.external_id && Number.isInteger(post.source_no) && post.source_no > 0 && post.title && post.body && post.published_at);
    if (!clean.length || clean.length !== posts.length) return json(origin, { error: "일괄 게시할 글의 형식이 올바르지 않습니다." }, 400);
    const { error } = await db.from("posts").upsert(clean, {
      onConflict: "category,external_id",
      ignoreDuplicates: true,
    });
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true, count: clean.length });
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
    if (typeof changes.cover_image_url === "string") clean.cover_image_url = changes.cover_image_url.trim().slice(0, 500) || null;
    if (typeof changes.cover_quote === "string") clean.cover_quote = changes.cover_quote.trim().slice(0, 200) || null;
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
