/* Cloudflare Worker scaffold (KV-backed) - endpoints: /api/store-secrets, /api/oauth/init, /api/oauth/callback, /api/inbound-email, /api/create-checkout, /api/deliver, /api/audit, /api/audit/logs */
/* NOTE: Bind SECRETS_KV, SESSIONS_KV, AUDIT_KV in wrangler.toml / Cloudflare. Do NOT put real secrets here. */

const ADMIN_HANDLE = typeof ADMIN_HANDLE !== "undefined" ? ADMIN_HANDLE : "Keli";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-setup-token"
    }
  });
}

async function getSecret(name) {
  if (typeof SECRETS_KV === "undefined") return null;
  const v = await SECRETS_KV.get(`secret:${name}`);
  return v;
}

async function kvPut(kv, key, obj) {
  if (typeof kv === "undefined") throw new Error("KV not bound: " + key);
  await kv.put(key, JSON.stringify(obj));
}
async function kvGet(kv, key) {
  if (typeof kv === "undefined") return null;
  const r = await kv.get(key);
  return r ? JSON.parse(r) : null;
}

function makeSessionId() {
  const rand = crypto.getRandomValues(new Uint32Array(4)).join("-");
  return `sess_${Date.now().toString(36)}_${rand}`;
}

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(req) {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "access-control-allow-origin":"*", "access-control-allow-methods":"GET,HEAD,POST,OPTIONS", "access-control-allow-headers":"content-type,authorization,x-setup-token" }});
  }

  try {
    if (path === "/api/store-secrets" && req.method === "POST") return await handleStoreSecrets(req);
    if (path === "/api/oauth/init") return await handleOAuthInit(url);
    if (path === "/api/oauth/callback") return await handleOAuthCallback(url, req);
    if (path === "/api/inbound-email" && req.method === "POST") return await handleInboundEmail(req);
    if (path === "/api/create-checkout" && req.method === "POST") return await handleCreateCheckout(req);
    if (path === "/api/deliver" && req.method === "GET") return await handleDeliver(url);
    if ((path === "/api/audit" && (req.method === "POST" || req.method === "PUT"))) return await handleAuditPost(req);
    if (path === "/api/audit/logs" && req.method === "GET") return await handleListAudits();
    return new Response("Not found", { status: 404 });
  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}

async function handleStoreSecrets(req) {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const provided = req.headers.get("x-setup-token") || "";
  if (!provided) return json({ error: "missing setup token" }, 401);
  if (typeof SETUP_TOKEN === "undefined" || !SETUP_TOKEN) return json({ error: "worker not configured with SETUP_TOKEN" }, 500);
  if (provided !== SETUP_TOKEN) return json({ error: "invalid setup token" }, 403);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "invalid json" }, 400); }
  if (!body || !body.secrets || typeof body.secrets !== "object") return json({ error: "invalid payload: {secrets:{...}} expected" }, 400);
  if (typeof SECRETS_KV === "undefined") return json({ error: "SECRETS_KV not configured" }, 500);

  const stored = [];
  for (const [k, v] of Object.entries(body.secrets)) {
    await SECRETS_KV.put(`secret:${k}`, String(v));
    stored.push(k);
  }

  const audit = { time: new Date().toISOString(), admin: ADMIN_HANDLE, event: "store_secrets", details: { stored } };
  if (typeof AUDIT_KV !== "undefined") await kvPut(AUDIT_KV, `audit:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, audit);

  return json({ ok: true, stored });
}

async function handleOAuthInit(url) {
  const provider = url.searchParams.get("provider");
  if (!provider) return json({ error: "missing provider param" }, 400);
  const clientId = await getSecret(`OAUTH_${provider.toUpperCase()}_CLIENT_ID`);
  const authUrl = await getSecret(`OAUTH_${provider.toUpperCase()}_AUTH_URL`);
  const redirect = await getSecret("OAUTH_REDIRECT_URI");
  if (!clientId || !authUrl || !redirect) return json({ error: "OAuth info missing for provider." }, 400);

  const state = crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now().toString(36));
  if (typeof SESSIONS_KV !== "undefined") await kvPut(SESSIONS_KV, `oauth_state:${state}`, { provider, created_at: new Date().toISOString() });

  const scope = await getSecret(`OAUTH_${provider.toUpperCase()}_SCOPE`) || "";
  const params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", clientId);
  params.set("redirect_uri", redirect);
  if (scope) params.set("scope", scope);
  params.set("state", state);

  return Response.redirect(`${authUrl}?${params.toString()}`, 302);
}

async function handleOAuthCallback(url) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return json({ error: "missing code or state" }, 400);
  const stateObj = (typeof SESSIONS_KV !== "undefined") ? await kvGet(SESSIONS_KV, `oauth_state:${state}`) : null;
  if (!stateObj) return json({ error: "invalid or expired state" }, 400);

  const provider = stateObj.provider;
  const tokenUrl = await getSecret(`OAUTH_${provider.toUpperCase()}_TOKEN_URL`);
  const clientId = await getSecret(`OAUTH_${provider.toUpperCase()}_CLIENT_ID`);
  const clientSecret = await getSecret(`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET`);
  const redirect = await getSecret("OAUTH_REDIRECT_URI");
  if (!tokenUrl || !clientId) return json({ error: "token configuration missing for provider" }, 500);

  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirect);
  params.set("client_id", clientId);
  if (clientSecret) params.set("client_secret", clientSecret);

  const r = await fetch(tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString() });
  const tokenResp = await r.json();
  if (!r.ok) return json({ error: "token exchange failed", detail: tokenResp }, 500);

  if (typeof SECRETS_KV !== "undefined") await SECRETS_KV.put(`secret:oauth:${provider.toLowerCase()}:token`, JSON.stringify(tokenResp));
  const audit = { time: new Date().toISOString(), admin: ADMIN_HANDLE, event: "oauth_connected", details: { provider } };
  if (typeof AUDIT_KV !== "undefined") await kvPut(AUDIT_KV, `audit:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, audit);

  return new Response(`<html><body><h2>Connected ${provider}</h2><p>Close this window and return to your admin console.</p></body></html>`, { headers: { "content-type": "text/html;charset=utf-8" }});
}

async function handleInboundEmail(req) {
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "invalid json" }, 400); }
  const id = `msg:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
  const stored = { id, received_at: new Date().toISOString(), payload: body };
  if (typeof SESSIONS_KV !== "undefined") await kvPut(SESSIONS_KV, id, stored);
  const audit = { time: new Date().toISOString(), admin: ADMIN_HANDLE, event: "inbound_email", details: { id } };
  if (typeof AUDIT_KV !== "undefined") await kvPut(AUDIT_KV, `audit:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, audit);
  return json({ ok: true, id });
}

async function handleCreateCheckout(req) {
  const body = await req.json();
  if (!body || !body.sku) return json({ error: "missing sku" }, 400);
  const session_id = makeSessionId();
  const session = { session_id, sku: body.sku, user: body.user || null, manifest: body.manifest || {}, presold: !!body.presold, status: "pending", created_at: new Date().toISOString() };
  if (typeof SESSIONS_KV !== "undefined") await kvPut(SESSIONS_KV, `session:${session_id}`, session);
  const audit = { time: new Date().toISOString(), admin: ADMIN_HANDLE, event: "create_checkout", details: { session_id, sku: body.sku, presold: !!body.presold } };
  if (typeof AUDIT_KV !== "undefined") await kvPut(AUDIT_KV, `audit:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, audit);

  if (session.presold) {
    const deliver = { proton_link: `https://proton.me/s/${encodeURIComponent(session_id)}` };
    session.status = "delivered"; session.delivered_at = new Date().toISOString(); session.delivery = deliver;
    if (typeof SESSIONS_KV !== "undefined") await kvPut(SESSIONS_KV, `session:${session_id}`, session);
    const auditD = { time: new Date().toISOString(), admin: ADMIN_HANDLE, event: "auto_deliver_presold", details: { session_id } };
    if (typeof AUDIT_KV !== "undefined") await kvPut(AUDIT_KV, `audit:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, auditD);
    return json({ ok: true, session_id, deliver });
  }

  return json({ ok: true, session_id });
}

async function handleDeliver(url) {
  const session_id = url.searchParams.get("session_id") || url.searchParams.get("session");
  if (!session_id) return json({ error: "missing session_id" }, 400);
  const session = (typeof SESSIONS_KV !== "undefined") ? await kvGet(SESSIONS_KV, `session:${session_id}`) : null;
  if (!session) return json({ error: "session not found" }, 404);
  if (!session.delivery) {
    const deliver = { proton_link: `https://proton.me/s/${encodeURIComponent(session_id)}` };
    session.delivery = deliver; session.status = "delivered"; session.delivered_at = new Date().toISOString();
    if (typeof SESSIONS_KV !== "undefined") await kvPut(SESSIONS_KV, `session:${session_id}`, session);
    const audit = { time: new Date().toISOString(), admin: ADMIN_HANDLE, event: "deliver_resolved", details: { session_id } };
    if (typeof AUDIT_KV !== "undefined") await kvPut(AUDIT_KV, `audit:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, audit);
    return json({ ok: true, session_id, deliver });
  }
  return json({ ok: true, session_id, deliver: session.delivery });
}

async function handleAuditPost(req) {
  const body = await req.json();
  const entry = Object.assign({}, body, { admin: ADMIN_HANDLE, received_at: new Date().toISOString() });
  if (typeof AUDIT_KV !== "undefined") await kvPut(AUDIT_KV, `audit:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, entry);
  return json({ ok: true, entry });
}

async function handleListAudits() {
  if (typeof AUDIT_KV === "undefined") return json({ ok: false, error: "AUDIT_KV not bound" }, 500);
  const out = [];
  for await (const item of AUDIT_KV.list({ prefix: "audit:", limit: 200 })) {
    const raw = await AUDIT_KV.get(item.name);
    try { out.push(JSON.parse(raw)); } catch (e) {}
  }
  return json({ ok: true, count: out.length, logs: out.reverse() });
}
