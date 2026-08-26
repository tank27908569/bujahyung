import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sessionSecret = Deno.env.get("ADMIN_SESSION_SECRET")!;
const redirectUri = `${supabaseUrl}/functions/v1/threads-oauth`;
const adminUrl = "https://bujahyung.vercel.app/admin.html?threads=connected";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function integrationKey() {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`threads:${sessionSecret}`));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await integrationKey(),
    new TextEncoder().encode(value),
  ));
  return `${base64Url(iv)}.${base64Url(encrypted)}`;
}

async function decryptSecret(value: string) {
  const [ivPart, encryptedPart] = value.split(".");
  if (!ivPart || !encryptedPart) throw new Error("Threads 앱 시크릿을 읽지 못했습니다.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64Url(ivPart) },
    await integrationKey(),
    decodeBase64Url(encryptedPart),
  );
  return new TextDecoder().decode(decrypted);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

async function verifiedSignedRequest(value: string, appSecret: string) {
  const [signaturePart, payloadPart] = value.split(".");
  if (!signaturePart || !payloadPart) throw new Error("서명된 요청 형식이 올바르지 않습니다.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadPart)));
  if (!constantTimeEqual(decodeBase64Url(signaturePart), expected)) throw new Error("Meta 요청 서명을 확인하지 못했습니다.");
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
}

function page(title: string, message: string, success = false) {
  const color = success ? "#2f6b45" : "#8f2e25";
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:sans-serif;background:#f1eee6;color:#25241f;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:520px;padding:40px;background:#fff;border-top:4px solid ${color}"><h1>${title}</h1><p style="line-height:1.8">${message}</p>${success ? `<p><a href="${adminUrl}">관리자로 돌아가기</a></p>` : ""}</main></body></html>`, {
    status: success ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async request => {
  const url = new URL(request.url);
  if (request.method === "POST") {
    try {
      const form = await request.formData();
      const signedRequest = String(form.get("signed_request") || "");
      const { data: integration, error } = await db.from("threads_integration").select("*").eq("id", 1).maybeSingle();
      if (error || !integration?.app_secret_encrypted) throw new Error("Threads 연결 설정을 찾지 못했습니다.");
      const payload = await verifiedSignedRequest(signedRequest, await decryptSecret(integration.app_secret_encrypted));
      const { error: clearError } = await db.from("threads_integration").update({
        access_token_encrypted: null,
        token_expires_at: null,
        connected_username: null,
        oauth_state: null,
        oauth_state_expires_at: null,
      }).eq("id", 1);
      if (clearError) throw new Error(clearError.message);
      if (url.searchParams.get("event") === "delete") {
        const confirmationCode = base64Url(crypto.getRandomValues(new Uint8Array(18)));
        return Response.json({
          url: `https://bujahyung.vercel.app/data-deletion.html?code=${encodeURIComponent(confirmationCode)}`,
          confirmation_code: confirmationCode,
        });
      }
      return Response.json({ success: true, user_id: payload?.user_id || null });
    } catch (caught) {
      return Response.json({ error: caught instanceof Error ? caught.message : "요청 처리에 실패했습니다." }, { status: 400 });
    }
  }
  if (request.method !== "GET") return page("잘못된 요청", "허용되지 않은 요청입니다.");
  if (["deauthorize", "delete"].includes(url.searchParams.get("event") || "")) {
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  }
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error_message") || url.searchParams.get("error_description") || "";
  if (oauthError) return page("Threads 연결 취소", oauthError);
  if (!code || !state) return page("Threads 연결 실패", "승인 코드가 전달되지 않았습니다.");

  const { data: integration, error } = await db.from("threads_integration").select("*").eq("id", 1).maybeSingle();
  if (error || !integration) return page("Threads 연결 실패", "연결 설정을 찾지 못했습니다.");
  if (integration.oauth_state !== state || !integration.oauth_state_expires_at || new Date(integration.oauth_state_expires_at).getTime() < Date.now()) {
    return page("Threads 연결 실패", "승인 요청이 만료되었거나 올바르지 않습니다. 관리자에서 다시 연결해 주세요.");
  }

  try {
    const appSecret = await decryptSecret(integration.app_secret_encrypted);
    const tokenBody = new URLSearchParams({
      client_id: integration.app_id,
      client_secret: appSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const shortResponse = await fetch("https://graph.threads.net/oauth/access_token", { method: "POST", body: tokenBody });
    const shortToken = await shortResponse.json();
    if (!shortResponse.ok || !shortToken.access_token) throw new Error(shortToken?.error_message || shortToken?.error?.message || "단기 토큰을 발급하지 못했습니다.");

    const longUrl = new URL("https://graph.threads.net/access_token");
    longUrl.searchParams.set("grant_type", "th_exchange_token");
    longUrl.searchParams.set("client_secret", appSecret);
    longUrl.searchParams.set("access_token", shortToken.access_token);
    const longResponse = await fetch(longUrl);
    const longToken = await longResponse.json();
    if (!longResponse.ok || !longToken.access_token) throw new Error(longToken?.error?.message || "장기 토큰을 발급하지 못했습니다.");

    const meUrl = new URL("https://graph.threads.net/v1.0/me");
    meUrl.searchParams.set("fields", "id,username");
    meUrl.searchParams.set("access_token", longToken.access_token);
    const meResponse = await fetch(meUrl);
    const me = await meResponse.json().catch(() => ({}));
    const expiresIn = Number(longToken.expires_in || 5184000);
    const { error: saveError } = await db.from("threads_integration").update({
      access_token_encrypted: await encryptSecret(longToken.access_token),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      connected_username: me?.username || null,
      oauth_state: null,
      oauth_state_expires_at: null,
    }).eq("id", 1);
    if (saveError) throw new Error(saveError.message);
    return page("Threads 연결 완료", `${me?.username ? `@${me.username} 계정이` : "Threads 계정이"} 안전하게 연결되었습니다.`, true);
  } catch (caught) {
    return page("Threads 연결 실패", caught instanceof Error ? caught.message : "토큰 연결을 완료하지 못했습니다.");
  }
});
