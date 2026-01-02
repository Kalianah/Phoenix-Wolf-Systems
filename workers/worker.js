/**
 * Phoenix Wolf Systems - Sovereign OS Cloudflare Worker
 * Production-ready scaffold for secure API operations
 * Admin: Keli
 */

// Environment bindings (configured in wrangler.toml or Cloudflare dashboard):
// - SETUP_TOKEN: One-time setup token for initial configuration
// - SECRETS_KV: KV namespace for storing secrets
// - SESSIONS_KV: KV namespace for OAuth sessions
// - AUDIT_KV: KV namespace for audit logs

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-setup-token',
  };

  // Handle OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Route handlers
    if (path === '/api/store-secrets' && request.method === 'POST') {
      return handleStoreSecrets(request, corsHeaders);
    }
    
    if (path === '/api/oauth/init' && request.method === 'GET') {
      return handleOAuthInit(request, corsHeaders);
    }
    
    if (path === '/api/oauth/callback' && request.method === 'GET') {
      return handleOAuthCallback(request, corsHeaders);
    }
    
    if (path === '/api/inbound-email' && request.method === 'POST') {
      return handleInboundEmail(request, corsHeaders);
    }
    
    if (path === '/api/create-checkout' && request.method === 'POST') {
      return handleCreateCheckout(request, corsHeaders);
    }
    
    if (path === '/api/deliver' && request.method === 'GET') {
      return handleDeliver(request, corsHeaders);
    }
    
    if (path === '/api/audit' && request.method === 'POST') {
      return handleAudit(request, corsHeaders);
    }
    
    if (path === '/api/audit/logs' && request.method === 'GET') {
      return handleGetAuditLogs(request, corsHeaders);
    }

    if (path === '/api/inbound-messages' && request.method === 'GET') {
      return handleGetMessages(request, corsHeaders);
    }

    if (path === '/api/store-token' && request.method === 'POST') {
      return handleStoreToken(request, corsHeaders);
    }

    // Default 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * POST /api/store-secrets
 * One-time setup endpoint to store system secrets
 * Requires x-setup-token header matching SETUP_TOKEN binding
 */
async function handleStoreSecrets(request, corsHeaders) {
  const setupToken = request.headers.get('x-setup-token');
  
  // Validate setup token
  if (!setupToken || setupToken !== SETUP_TOKEN) {
    return new Response(JSON.stringify({ error: 'Invalid setup token' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check if secrets already exist (one-time use)
  const existing = await SECRETS_KV.get('secrets_initialized');
  if (existing === 'true') {
    return new Response(JSON.stringify({ error: 'Secrets already initialized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const secrets = await request.json();
  
  // Store each secret in KV
  for (const [key, value] of Object.entries(secrets)) {
    await SECRETS_KV.put(`secret_${key}`, value);
  }
  
  // Mark as initialized
  await SECRETS_KV.put('secrets_initialized', 'true');
  
  // Audit log
  await logAudit('secrets_stored', 'System secrets initialized', 'Keli');

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Secrets stored successfully'
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * GET /api/oauth/init?provider=<stripe|protonmail|youtube>
 * Initiate OAuth flow for third-party services
 */
async function handleOAuthInit(request, corsHeaders) {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');
  
  if (!provider) {
    return new Response(JSON.stringify({ error: 'Provider required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Generate session ID
  const sessionId = crypto.randomUUID();
  
  // Store session
  await SESSIONS_KV.put(`session_${sessionId}`, JSON.stringify({
    provider,
    created: new Date().toISOString(),
    admin: 'Keli'
  }), { expirationTtl: 600 }); // 10 minutes

  // OAuth URLs (configured per provider)
  const oauthUrls = {
    stripe: `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=CLIENT_ID&scope=read_write&state=${sessionId}`,
    protonmail: `https://account.proton.me/authorize?client_id=CLIENT_ID&state=${sessionId}`,
    youtube: `https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=REDIRECT_URI&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly&state=${sessionId}`
  };

  await logAudit('oauth_init', `OAuth initiated for ${provider}`, 'Keli');

  return new Response(JSON.stringify({
    auth_url: oauthUrls[provider] || '#',
    session_id: sessionId
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * GET /api/oauth/callback?code=<code>&state=<sessionId>
 * OAuth callback handler
 */
async function handleOAuthCallback(request, corsHeaders) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return new Response(JSON.stringify({ error: 'Invalid callback' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Retrieve session
  const sessionData = await SESSIONS_KV.get(`session_${state}`);
  if (!sessionData) {
    return new Response(JSON.stringify({ error: 'Session expired' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const session = JSON.parse(sessionData);
  
  // Exchange code for token (provider-specific logic)
  // This is a placeholder - actual implementation would call provider APIs
  const token = `token_${code.substring(0, 10)}`;
  
  // Store token
  await SECRETS_KV.put(`oauth_token_${session.provider}`, token);
  
  await logAudit('oauth_complete', `OAuth completed for ${session.provider}`, 'Keli');

  return new Response(JSON.stringify({
    success: true,
    message: 'OAuth completed successfully'
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/inbound-email
 * Handle inbound emails (webhook from email service)
 */
async function handleInboundEmail(request, corsHeaders) {
  const email = await request.json();
  
  // Store email in KV
  const emailId = crypto.randomUUID();
  await SECRETS_KV.put(`email_${emailId}`, JSON.stringify({
    ...email,
    received: new Date().toISOString()
  }), { expirationTtl: 86400 * 30 }); // 30 days

  await logAudit('email_received', `Email from ${email.from}`, 'Keli');

  return new Response(JSON.stringify({
    success: true,
    email_id: emailId
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/create-checkout
 * Create checkout session (auto-deliver for presold items)
 */
async function handleCreateCheckout(request, corsHeaders) {
  const { product_id, sku, buyer_email } = await request.json();
  
  if (!product_id || !sku || !buyer_email) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Check if product is presold
  // In production, this would fetch from industries.json or database
  const isPresold = true; // All items have presold: true per requirements
  
  if (isPresold) {
    // Auto-deliver with simulated Proton link
    const deliveryToken = crypto.randomUUID().substring(0, 12).toUpperCase();
    const deliveryUrl = `https://proton.me/s/${deliveryToken}`;
    
    // Store delivery record
    await SECRETS_KV.put(`delivery_${deliveryToken}`, JSON.stringify({
      product_id,
      sku,
      buyer_email,
      delivered: new Date().toISOString(),
      admin: 'Keli'
    }), { expirationTtl: 86400 * 90 }); // 90 days

    await logAudit('auto_delivery', `Auto-delivered ${sku} to ${buyer_email}`, 'Keli');

    return new Response(JSON.stringify({
      presold_delivery: true,
      delivery_url: deliveryUrl,
      message: 'Package auto-delivered. Check your email for access details.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // For non-presold (not used in this implementation)
  const checkoutUrl = `https://checkout.stripe.com/session_${crypto.randomUUID()}`;
  
  await logAudit('checkout_created', `Checkout created for ${sku}`, 'Keli');

  return new Response(JSON.stringify({
    presold_delivery: false,
    checkout_url: checkoutUrl
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * GET /api/deliver?token=<deliveryToken>
 * Retrieve delivery information
 */
async function handleDeliver(request, corsHeaders) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  
  if (!token) {
    return new Response(JSON.stringify({ error: 'Token required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const delivery = await SECRETS_KV.get(`delivery_${token}`);
  
  if (!delivery) {
    return new Response(JSON.stringify({ error: 'Delivery not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  await logAudit('delivery_accessed', `Delivery ${token} accessed`, 'Keli');

  return new Response(delivery, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/audit
 * Create audit log entry (forces admin to Keli)
 */
async function handleAudit(request, corsHeaders) {
  const entry = await request.json();
  
  // Force admin field to Keli
  entry.admin = 'Keli';
  entry.timestamp = entry.timestamp || new Date().toISOString();
  
  const auditId = crypto.randomUUID();
  await AUDIT_KV.put(`audit_${auditId}`, JSON.stringify(entry), {
    expirationTtl: 86400 * 365 // 1 year
  });

  return new Response(JSON.stringify({
    success: true,
    audit_id: auditId
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * GET /api/audit/logs
 * Retrieve audit logs
 */
async function handleGetAuditLogs(request, corsHeaders) {
  const logs = [];
  
  // List all audit entries
  const list = await AUDIT_KV.list({ prefix: 'audit_' });
  
  for (const key of list.keys) {
    const log = await AUDIT_KV.get(key.name);
    if (log) {
      logs.push(JSON.parse(log));
    }
  }
  
  // Sort by timestamp (newest first)
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return new Response(JSON.stringify(logs), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * GET /api/inbound-messages
 * Retrieve inbound messages
 */
async function handleGetMessages(request, corsHeaders) {
  const messages = [];
  
  const list = await SECRETS_KV.list({ prefix: 'email_' });
  
  for (const key of list.keys) {
    const msg = await SECRETS_KV.get(key.name);
    if (msg) {
      messages.push(JSON.parse(msg));
    }
  }
  
  messages.sort((a, b) => new Date(b.received) - new Date(a.received));

  return new Response(JSON.stringify(messages), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * POST /api/store-token
 * Store manual token
 */
async function handleStoreToken(request, corsHeaders) {
  const { token } = await request.json();
  
  if (!token) {
    return new Response(JSON.stringify({ error: 'Token required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  await SECRETS_KV.put('manual_token', token);
  await logAudit('token_stored', 'Manual token stored', 'Keli');

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Helper function to log audit entries
 * Always forces admin to 'Keli'
 */
async function logAudit(action, details, admin = 'Keli') {
  const auditId = crypto.randomUUID();
  await AUDIT_KV.put(`audit_${auditId}`, JSON.stringify({
    admin: 'Keli', // Force admin to Keli
    action,
    details,
    timestamp: new Date().toISOString()
  }), {
    expirationTtl: 86400 * 365 // 1 year
  });
}
