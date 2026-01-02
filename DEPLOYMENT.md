# Phoenix Wolf Systems - Deployment Guide

This guide walks you through deploying the complete Sovereign OS bundle to production.

## Prerequisites

- Cloudflare account with Workers and Pages enabled
- GitHub account (for CI/CD)
- Node.js 18+ and npm installed locally

## Step 1: Create Cloudflare KV Namespaces

Log into your Cloudflare dashboard and create three KV namespaces:

```bash
# Using wrangler CLI
wrangler kv:namespace create "SECRETS_KV"
wrangler kv:namespace create "SESSIONS_KV"
wrangler kv:namespace create "AUDIT_KV"
```

Note the IDs returned by each command. You'll need them for the next step.

## Step 2: Configure wrangler.toml

Edit `wrangler.toml` and update the KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "SECRETS_KV"
id = "abc123..."  # Replace with your actual ID

[[kv_namespaces]]
binding = "SESSIONS_KV"
id = "def456..."  # Replace with your actual ID

[[kv_namespaces]]
binding = "AUDIT_KV"
id = "ghi789..."  # Replace with your actual ID
```

## Step 3: Set Setup Token

Generate a secure random token and store it as a secret:

```bash
# Generate a secure token (example)
SETUP_TOKEN=$(openssl rand -hex 32)
echo "Save this token securely: $SETUP_TOKEN"

# Store in Cloudflare
wrangler secret put SETUP_TOKEN
# Paste the token when prompted
```

**Important:** Save this token securely! You'll need it for the one-time setup.

## Step 4: Deploy Cloudflare Worker

```bash
# Login to Cloudflare
wrangler login

# Deploy the Worker
wrangler deploy
```

The Worker will be deployed and you'll receive a URL like:
`https://phoenix-wolf-sovereign-os.your-subdomain.workers.dev`

## Step 5: Deploy Storefront to Cloudflare Pages

### Option A: GitHub Integration (Recommended)

1. Go to Cloudflare Dashboard → Pages
2. Click "Create a project" → "Connect to Git"
3. Select this repository
4. Configure build settings:
   - **Build command:** (leave empty)
   - **Build output directory:** `/`
   - **Root directory:** `/`
5. Click "Save and Deploy"

### Option B: Direct Upload

```bash
# Install wrangler if not already installed
npm install -g wrangler

# Deploy static files
wrangler pages deploy . --project-name=phoenix-wolf-sovereign-os
```

## Step 6: Initialize System Secrets

1. Navigate to `https://your-pages-url.pages.dev/admin/setup.html`
2. Enter your SETUP_TOKEN
3. Paste your secrets JSON:

```json
{
  "STRIPE_SECRET_KEY": "sk_live_...",
  "PROTONMAIL_API_KEY": "your_protonmail_key",
  "YOUTUBE_API_KEY": "your_youtube_api_key",
  "OAUTH_CLIENT_ID": "your_oauth_client_id",
  "OAUTH_CLIENT_SECRET": "your_oauth_client_secret"
}
```

4. Enter your admin email (e.g., `keli@phoenixwolf.systems`)
5. Click "Initialize System Secrets"

**Note:** This form can only be used once! After successful initialization, it will be locked.

## Step 7: Verify Deployment

### Check Public Storefront
Visit `https://your-pages-url.pages.dev/`
- Should display the Sovereign OS catalog
- Verify all 157 products load
- Test filtering (All, Basic, Standard, Pro, Elite)
- Confirm "Curated by Keli" appears in header

### Check Admin Console
Visit `https://your-pages-url.pages.dev/admin/console.html`
- Should display dashboard with statistics
- Verify 157 products shown in stats
- Check catalog preview loads
- Confirm "Admin: Keli" appears in header

### Test Worker Endpoints
```bash
# Test audit logs endpoint
curl https://your-worker-url.workers.dev/api/audit/logs

# Should return an empty array initially: []
```

## Step 8: Configure GitHub Actions (Optional)

If you want automated deployments on push to main:

1. Go to repository Settings → Secrets and variables → Actions
2. Add these secrets:
   - `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

The workflow in `.github/workflows/deploy-sovereign-os.yml` will automatically:
- Validate JSON files
- Verify admin handle presence
- Deploy on push to main branch

## Step 9: Custom Domain (Optional)

### For Cloudflare Pages:
1. Go to your Pages project → Custom domains
2. Click "Set up a custom domain"
3. Enter your domain (e.g., `phoenixwolf.systems`)
4. Follow the DNS configuration instructions

### For Cloudflare Worker:
1. Go to Workers & Pages → your worker → Settings → Triggers
2. Click "Add Custom Domain"
3. Enter your domain or subdomain
4. Follow the DNS configuration instructions

## Production Checklist

Before going live, verify:

- [ ] All KV namespaces created and configured
- [ ] SETUP_TOKEN stored securely in Cloudflare
- [ ] Worker deployed successfully
- [ ] Static site deployed to Cloudflare Pages
- [ ] System secrets initialized via setup form
- [ ] Public storefront loads correctly
- [ ] Admin console accessible and functional
- [ ] Catalog shows all 157 products
- [ ] Elite filter shows exactly 7 products
- [ ] Admin handle "Keli" appears on all pages
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] Backup of SETUP_TOKEN stored securely offline

## Monitoring and Maintenance

### View Worker Logs
```bash
wrangler tail
```

### Check KV Storage Usage
```bash
wrangler kv:key list --namespace-id=YOUR_NAMESPACE_ID
```

### Export Audit Logs
Visit admin console and click "Export" button, or:
```bash
curl https://your-worker-url.workers.dev/api/audit/logs > audit-logs.json
```

### Update Catalog
Edit `assets/industries.json` and redeploy to Cloudflare Pages. The storefront will automatically load the new data.

## Troubleshooting

### Setup form returns "Invalid setup token"
- Verify SETUP_TOKEN secret is correctly set in Cloudflare
- Check that you're using the exact token (no extra spaces)
- Ensure the form hasn't been used before (one-time only)

### Catalog not loading
- Check browser console for errors
- Verify `assets/industries.json` is deployed
- Test direct access: `https://your-url/assets/industries.json`

### Worker returns errors
- Check Worker logs: `wrangler tail`
- Verify KV namespaces are correctly bound
- Ensure all required secrets are set

### Admin console shows 0 products
- Verify `industries.json` is accessible
- Check browser console for CORS errors
- Ensure catalog preview API is working

## Support

For issues or questions:
- Review README-SOVEREIGN.md for detailed documentation
- Check Cloudflare Workers documentation
- Verify all steps in this guide were completed

---

**Admin:** Keli  
**System:** Phoenix Wolf Systems - Sovereign OS  
**Version:** 1.0.0
