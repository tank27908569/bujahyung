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
// Threads 원고도 다섯 분류 전체로 게시할 수 있습니다.
const threadsCategories = categories;
const threadsApiBase = "https://graph.threads.com/v1.0";

// 기존에 게시된 글을 나눌 때 쓰던 기준을 그대로 씁니다.
// tools/import_threads_life.mjs 의 propertyTerms 목록이 원본입니다.
const propertyTerms = [
  "경매", "공매", "낙찰", "입찰", "패찰", "유찰", "권리분석", "매각물건명세서",
  "사건번호", "타경", "감정가", "최저가", "명도", "배당", "대항력", "우선변제",
  "유치권", "법정지상권", "근저당", "임차인", "채무자", "채권자", "담보대출",
  "대부업", "대부", "npl", "부실채권", "입찰표", "보증금", "매각기일", "부동산",
  "등기부", "실거래가", "대지권", "재건축", "재개발", "토지", "상가", "아파트",
  "오피스텔", "다세대", "다가구", "빌라", "임대차", "전세", "월세", "소유권",
  "점유자", "현장 임장", "매물", "시세차익", "수익률", "매수인",
];

function normalizedText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// 중복 판정 키: 정규화한 본문 앞부분. 예전 대량 임포트가 남긴 external_id는
// 재현할 수 없는 해시라, 본문 대조가 유일하게 믿을 수 있는 방법입니다.
function duplicateKey(body: string) {
  const text = normalizedText(body);
  return text.length > 60 ? text.slice(0, 60) : text;
}

// 기존 990편으로 검증했을 때 실제 분류와 95.9% 일치합니다.
function suggestCategory(title: string, body: string) {
  const heading = normalizedText(title);
  const lowerBody = String(body || "").toLowerCase();
  const head = normalizedText(body).slice(0, 260);
  if (/[一-鿿]{4}\s*[（(][가-힣]{3,6}[）)]/.test(heading) || /^[一-鿿]{4}\s*[（(][가-힣]{3,6}[）)]/.test(head)) {
    return { category: "thread-seodang", reason: "사자성어와 한글 독음이 제목에 있습니다." };
  }
  if (/《[^》]{1,60}》/.test(heading)) {
    return { category: "library", reason: "제목에 《책 제목》이 있습니다." };
  }
  if (/사랑|연애|인연|배우자/.test(heading) && /경매|낙찰|입찰|물건|가치/.test(lowerBody)) {
    return { category: "love-auction-philosophy", reason: "사랑을 경매에 빗댄 글입니다." };
  }
  const hits = propertyTerms.filter(term => lowerBody.includes(term));
  if (hits.length) {
    return { category: "auction-stories", reason: `경매 용어 ${hits.slice(0, 3).join(", ")} 등이 나옵니다.` };
  }
  return { category: "life-stories", reason: "경매 용어가 없는 일상 글입니다." };
}

// 페이지를 나눠 전체 글을 읽습니다.
async function allPosts() {
  const rows: { id: string; category: string; title: string; body: string; external_id: string | null }[] = [];
  for (let from = 0; from < 20000; from += 500) {
    const { data, error } = await db.from("posts")
      .select("id, category, title, body, external_id")
      .order("id", { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows;
}
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

// 한 번의 호출에서 가져올 양을 제한합니다. 원문 목록은 커서로 나눠 받고,
// 대화(이어 쓴 답글)는 작은 묶음으로 병렬 수집해 Edge Function 제한시간을 넘기지 않습니다.
const threadsRequestTimeoutMs = 10000;
const threadsRootPagesPerCall = 3;
const threadsConversationPages = 5;
const threadsRepliesPerCall = 8;

async function threadsFetch(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(threadsRequestTimeoutMs) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || `Threads API HTTP ${response.status}`);
  return result;
}

// maxPages까지만 따라가고 남은 커서를 next로 돌려줍니다.
async function threadsPage(path: string, token: string, maxPages: number) {
  const first = new URL(path.startsWith("http") ? path : `${threadsApiBase}${path}`);
  if (!first.searchParams.get("access_token")) first.searchParams.set("access_token", token);
  const items: ThreadsItem[] = [];
  let next: string | null = first.toString();
  for (let page = 0; next && page < maxPages; page += 1) {
    const result = await threadsFetch(next);
    if (Array.isArray(result.data)) items.push(...result.data);
    next = typeof result?.paging?.next === "string" ? result.paging.next : null;
  }
  return { items, next };
}

async function threadsToken() {
  const fromEnv = Deno.env.get("THREADS_ACCESS_TOKEN") || "";
  if (fromEnv) return fromEnv;
  const { data } = await db.from("threads_integration").select("access_token_encrypted").eq("id", 1).maybeSingle();
  if (!data?.access_token_encrypted) return "";
  return await decryptIntegrationSecret(data.access_token_encrypted);
}

function threadsTimestamp(value?: string) {
  return Number.isNaN(Date.parse(value || "")) ? new Date().toISOString() : new Date(value!).toISOString();
}

function threadsCombinedBody(rootText: string, replies: { text?: string }[]) {
  return [rootText, ...replies.map(reply => String(reply?.text || ""))].filter(Boolean).join("\n\n").slice(0, 30000);
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
    const url = new URL("https://threads.com/oauth/authorize");
    url.searchParams.set("client_id", data.app_id);
    url.searchParams.set("redirect_uri", threadsRedirectUri);
    url.searchParams.set("scope", "threads_basic,threads_read_replies");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    return json(origin, { url: url.toString(), redirect_uri: threadsRedirectUri });
  }
  // 게시 대기 원고마다 분류 제안과 중복 여부를 붙여 돌려줍니다.
  if (action === "plan-threads-imports") {
    try {
      const posts = await allPosts();
      const byKey = new Map<string, { id: string; category: string; title: string }>();
      const byExternal = new Set<string>();
      for (const post of posts) {
        const key = duplicateKey(post.body);
        if (key && !byKey.has(key)) byKey.set(key, { id: post.id, category: post.category, title: post.title });
        if (post.external_id) byExternal.add(post.external_id);
      }
      const { data: imports, error } = await db.from("threads_imports")
        .select("id, thread_id, root_text, combined_body, thread_timestamp, status")
        .eq("status", "pending");
      if (error) return json(origin, { error: error.message }, 400);

      const plans = (imports || []).map(item => {
        const title = threadsTitle(item.root_text);
        const suggestion = suggestCategory(title, item.combined_body);
        const match = byKey.get(duplicateKey(item.root_text))
          || (byExternal.has(`threads-${item.thread_id}`) ? { id: "", category: "", title: "" } : undefined);
        return {
          id: item.id,
          title,
          suggested_category: suggestion.category,
          reason: suggestion.reason,
          duplicate: match ? { post_id: match.id, category: match.category, title: match.title } : null,
        };
      });
      const duplicates = plans.filter(plan => plan.duplicate).length;
      return json(origin, { ok: true, plans, total: plans.length, duplicates, posts: posts.length });
    } catch (error) {
      return json(origin, { error: error instanceof Error ? error.message : "분류를 계산하지 못했습니다." }, 400);
    }
  }
  if (action === "list-threads-imports") {
    const { data, error } = await db.from("threads_imports")
      .select("id, thread_id, permalink, root_text, replies, combined_body, thread_timestamp, status, published_post_id, synced_at")
      .order("thread_timestamp", { ascending: false });
    return error ? json(origin, { error: error.message }, 400) : json(origin, { imports: data });
  }
  // 1단계: 원문 목록만 빠르게 저장합니다. 남은 커서(next)를 돌려주면 브라우저가 이어서 부릅니다.
  if (action === "sync-threads-roots") {
    const token = await threadsToken();
    if (!token) return json(origin, { error: "Threads 계정 연결이 필요합니다. THREADS_ACCESS_TOKEN을 설정해 주세요." }, 503);
    try {
      const after = typeof payload.after === "string" && payload.after ? payload.after : "";
      const { items, next } = await threadsPage(
        after || "/me/threads?fields=id,text,timestamp,permalink,is_reply&limit=100",
        token,
        threadsRootPagesPerCall,
      );
      const roots = items
        .filter(item => item.id && item.text && !item.is_reply)
        .map(item => ({ ...item, rootText: String(item.text || "").trim() }))
        .filter(item => item.rootText);
      if (!roots.length) return json(origin, { ok: true, count: 0, pending: [], next, fetched: items.length });

      const { data: previous, error: previousError } = await db.from("threads_imports")
        .select("thread_id, status, published_post_id, replies, combined_body")
        .in("thread_id", roots.map(root => root.id));
      if (previousError) return json(origin, { error: previousError.message }, 400);
      const previousById = new Map((previous || []).map(item => [item.thread_id, item]));

      // 답글을 아직 한 번도 못 가져온 원문만 2단계 대상으로 넘깁니다.
      const pending: string[] = [];
      const rows = roots.map(root => {
        const existing = previousById.get(root.id);
        const replies = Array.isArray(existing?.replies) ? existing!.replies : [];
        if (!replies.length) pending.push(root.id);
        return {
          thread_id: root.id,
          permalink: root.permalink || null,
          root_text: root.rootText,
          replies,
          combined_body: existing?.combined_body || root.rootText,
          thread_timestamp: threadsTimestamp(root.timestamp),
          status: existing?.status || "pending",
          published_post_id: existing?.published_post_id || null,
          synced_at: new Date().toISOString(),
        };
      });
      const { error } = await db.from("threads_imports").upsert(rows, { onConflict: "thread_id" });
      if (error) return json(origin, { error: error.message }, 400);
      return json(origin, { ok: true, count: rows.length, pending, next, fetched: items.length });
    } catch (error) {
      return json(origin, { error: error instanceof Error ? error.message : "Threads 원문 목록을 가져오지 못했습니다." }, 502);
    }
  }

  // 2단계: 넘겨받은 원문 묶음의 이어 쓴 답글만 병렬로 채웁니다. 한 건이 실패해도 나머지는 저장합니다.
  if (action === "sync-threads-replies") {
    const token = await threadsToken();
    if (!token) return json(origin, { error: "Threads 계정 연결이 필요합니다. THREADS_ACCESS_TOKEN을 설정해 주세요." }, 503);
    const ids = (Array.isArray(payload.ids) ? payload.ids : [])
      .map((id: unknown) => String(id || "").trim())
      .filter(Boolean)
      .slice(0, threadsRepliesPerCall);
    if (!ids.length) return json(origin, { ok: true, updated: 0, failed: [] });

    const { data: current, error: currentError } = await db.from("threads_imports")
      .select("thread_id, permalink, root_text, thread_timestamp, status, published_post_id")
      .in("thread_id", ids);
    if (currentError) return json(origin, { error: currentError.message }, 400);
    const currentById = new Map((current || []).map(item => [item.thread_id, item]));

    const results = await Promise.all(ids.map(async (id: string) => {
      try {
        const { items } = await threadsPage(
          `/${encodeURIComponent(id)}/conversation?fields=id,text,timestamp,permalink,is_reply,is_reply_owned_by_me,replied_to,root_post&reverse=false&limit=100`,
          token,
          threadsConversationPages,
        );
        return { id, conversation: items };
      } catch (error) {
        return { id, error: error instanceof Error ? error.message : "대화를 가져오지 못했습니다." };
      }
    }));

    const rows = [];
    const failed: { id: string; error: string }[] = [];
    for (const result of results) {
      const base = currentById.get(result.id);
      if (!base) { failed.push({ id: result.id, error: "저장된 원문을 찾지 못했습니다." }); continue; }
      if (!result.conversation) { failed.push({ id: result.id, error: result.error! }); continue; }
      const replies = continuationReplies(result.id, result.conversation).map(reply => ({
        id: reply.id,
        text: String(reply.text || "").trim(),
        timestamp: reply.timestamp || null,
        permalink: reply.permalink || null,
        parent_id: reply.replied_to?.id || result.id,
      }));
      rows.push({
        thread_id: result.id,
        permalink: base.permalink,
        root_text: base.root_text,
        replies,
        combined_body: threadsCombinedBody(base.root_text, replies),
        thread_timestamp: base.thread_timestamp,
        status: base.status,
        published_post_id: base.published_post_id,
        synced_at: new Date().toISOString(),
      });
    }
    if (rows.length) {
      const { error } = await db.from("threads_imports").upsert(rows, { onConflict: "thread_id" });
      if (error) return json(origin, { error: error.message }, 400);
    }
    return json(origin, { ok: true, updated: rows.length, failed });
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

    // 이미 같은 내용이 올라가 있으면 건너뜁니다. 화면에서 걸러도 서버에서 한 번 더 봅니다.
    const allowDuplicates = payload.allow_duplicates === true;
    const existingKeys = new Set<string>();
    if (!allowDuplicates) {
      try {
        for (const post of await allPosts()) {
          const key = duplicateKey(post.body);
          if (key) existingKeys.add(key);
        }
      } catch (error) {
        return json(origin, { error: error instanceof Error ? error.message : "기존 글을 확인하지 못했습니다." }, 400);
      }
    }

    let published = 0;
    const skipped: { id: string; title: string }[] = [];
    for (const item of imports.sort((left, right) => Date.parse(left.thread_timestamp) - Date.parse(right.thread_timestamp))) {
      const category = categoryById.get(item.id)!;
      if (!allowDuplicates && existingKeys.has(duplicateKey(item.root_text))) {
        skipped.push({ id: item.id, title: threadsTitle(item.root_text) });
        await db.from("threads_imports").update({ status: "ignored" }).eq("id", item.id);
        continue;
      }
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
      existingKeys.add(duplicateKey(item.root_text));
    }
    return json(origin, { ok: true, count: published, skipped });
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

    // 분류를 옮길 때는 (category, source_no) 고유 제약에 걸리지 않도록 번호를 다시 매깁니다.
    if (typeof clean.category === "string") {
      const { data: current, error: currentError } = await db.from("posts").select("category").eq("id", id).maybeSingle();
      if (currentError) return json(origin, { error: currentError.message }, 400);
      if (current && current.category !== clean.category) {
        const { data: last, error: lastError } = await db.from("posts")
          .select("source_no").eq("category", clean.category)
          .order("source_no", { ascending: false }).limit(1);
        if (lastError) return json(origin, { error: lastError.message }, 400);
        clean.source_no = Number(last?.[0]?.source_no || 0) + 1;
      }
    }

    const { error } = await db.from("posts").update(clean).eq("id", id);
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
  }
  if (action === "delete") {
    const { error } = await db.from("posts").delete().eq("id", String(payload.id || ""));
    return error ? json(origin, { error: error.message }, 400) : json(origin, { ok: true });
  }
  return json(origin, { error: "알 수 없는 작업입니다." }, 400);
});
