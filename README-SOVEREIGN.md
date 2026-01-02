# Phoenix Wolf Systems - Sovereign OS

**Astral Prisms: High-Frequency Logic & Security Solutions**

A complete deployable bundle for Phoenix Wolf Systems featuring a public storefront, admin console, and Cloudflare Worker backend for the Sovereign OS product catalog.

**Admin:** Keli

---

## 📦 Bundle Contents

### Public Storefront (`index.html`)
- Beautiful deep midnight purple / neon lavender / sky frost blue aesthetic
- Product catalog loaded from `/assets/industries.json`
- Buyer flow with instant checkout via `POST /api/create-checkout`
- Auto-delivery support for presold packages
- HTML5 file upload support and YouTube iframe embeds

### Admin Interface
- **Setup Form** (`admin/setup.html`) - Secure one-time initialization form
  - Posts secrets to `/api/store-secrets` with `x-setup-token` header
  - Stores credentials in `SECRETS_KV` namespace
  
- **Admin Console** (`admin/console.html`) - Command center dashboard
  - Inbound message viewer
  - Audit log browser with export functionality
  - Catalog preview
  - OAuth connection buttons (Stripe, ProtonMail, YouTube)
  - Manual token fallback option

### Backend (`workers/worker.js`)
Production-ready Cloudflare Worker implementing:
- `POST /api/store-secrets` - One-time secret initialization (requires `x-setup-token`)
- `GET /api/oauth/init` - Initiate OAuth flows
- `GET /api/oauth/callback` - OAuth callback handler
- `POST /api/inbound-email` - Email webhook receiver
- `POST /api/create-checkout` - Checkout creation with auto-delivery
- `GET /api/deliver` - Delivery information retrieval
- `POST /api/audit` - Audit log creation (forces admin to "Keli")
- `GET /api/audit/logs` - Audit log retrieval

### Data (`assets/industries.json`)
Canonical table with exactly **157 entries**:
- **IDs 1-150**: Cycling price bands (L=$49, M=$149, H=$499)
  - SKUs: PWS-0001 through PWS-0150
  - Packages: Sovereign Basic, Standard, Pro
- **IDs 151-157**: Elite tier (Invite Only)
  - SKUs: PWS-0151 through PWS-0157
  - Package: Sovereign Elite
  - Price: null with "Invite Only" note

All entries include:
- ✅ `presold: true`
- ✅ `legal_verified: true`
- 📦 Package object with contents, license info, deliverable paths

---

## 🚀 Deployment

### Prerequisites
1. Cloudflare account with Workers enabled
2. Three KV namespaces created:
   - `SECRETS_KV` - For secrets storage
   - `SESSIONS_KV` - For OAuth sessions
   - `AUDIT_KV` - For audit logs
3. Setup token generated for one-time initialization

### Steps

#### 1. Configure Wrangler
```bash
npm install -g wrangler
wrangler login
```

Edit `wrangler.toml` and update KV namespace IDs:
```toml
[[kv_namespaces]]
binding = "SECRETS_KV"
id = "your-secrets-kv-id"

[[kv_namespaces]]
binding = "SESSIONS_KV"
id = "your-sessions-kv-id"

[[kv_namespaces]]
binding = "AUDIT_KV"
id = "your-audit-kv-id"
```

#### 2. Set Setup Token
```bash
wrangler secret put SETUP_TOKEN
# Enter your secure setup token when prompted
```

#### 3. Deploy Worker
```bash
wrangler deploy
```

#### 4. Deploy Storefront
Upload `index.html`, `admin/`, and `assets/` to Cloudflare Pages or your hosting service.

#### 5. Initialize System
1. Navigate to `https://your-domain.com/admin/setup.html`
2. Enter your setup token
3. Paste secrets JSON configuration:
```json
{
  "STRIPE_SECRET_KEY": "sk_...",
  "PROTONMAIL_API_KEY": "...",
  "YOUTUBE_API_KEY": "...",
  "OAUTH_CLIENT_ID": "...",
  "OAUTH_CLIENT_SECRET": "..."
}
```
4. Submit to initialize (one-time only)

#### 6. Access Admin Console
Navigate to `https://your-domain.com/admin/console.html` to manage the system.

---

## 🔒 Security Features

### Audit Trail
All system actions are logged with:
- Timestamp
- Admin handle (forced to "Keli")
- Action type
- Details

Access logs via:
- Admin console UI
- `GET /api/audit/logs` endpoint

### One-Time Setup
The setup form can only be used once. After successful initialization, the endpoint rejects further attempts.

### Secret Management
All secrets stored in Cloudflare KV with encryption at rest.

### Auto-Delivery
Presold items are automatically delivered with simulated Proton links:
```
https://proton.me/s/{UNIQUE_TOKEN}
```

---

## 📊 Pricing Structure

| Band | Price | Package | IDs |
|------|-------|---------|-----|
| L | $49 | Sovereign Basic | 1, 4, 7, 10... (every 3rd) |
| M | $149 | Sovereign Standard | 2, 5, 8, 11... (every 3rd) |
| H | $499 | Sovereign Pro | 3, 6, 9, 12... (every 3rd) |
| Elite | Invite Only | Sovereign Elite | 151-157 |

All packages include:
- Core infrastructure components
- Security protocols and encryption
- Audit logging system
- Identity management module
- Documentation and setup guides

Elite packages additionally include:
- Complete enterprise infrastructure suite
- Advanced security and threat detection
- Priority support and dedicated engineering
- Custom integration services
- Exclusive audit and compliance tools
- White-glove deployment assistance

---

## 🎨 Design Aesthetic

**Color Palette:**
- Deep Midnight Purple: `#0d0221`, `#1a0b2e`
- Neon Lavender: `#bf94ff`
- Sky Frost Blue: `#87cefa`
- Glass effects with backdrop blur

**Typography:**
- Primary: Inter (Google Fonts)
- Monospace: Courier Prime (logs, code)

---

## 🔧 Development

### Local Testing
```bash
# Start local development server
wrangler dev

# Test storefront locally
python3 -m http.server 8000
# Navigate to http://localhost:8000
```

### Validating Data
```bash
# Check JSON validity
cat assets/industries.json | jq empty

# Count entries
cat assets/industries.json | jq 'length'

# Verify Elite entries
cat assets/industries.json | jq '[.[] | select(.price_band == "Elite")] | length'
```

---

## 📝 API Reference

### POST /api/store-secrets
**Headers:**
- `x-setup-token`: Setup token for authorization
- `Content-Type`: application/json

**Body:**
```json
{
  "STRIPE_SECRET_KEY": "sk_...",
  "PROTONMAIL_API_KEY": "...",
  "YOUTUBE_API_KEY": "...",
  "OAUTH_CLIENT_ID": "...",
  "OAUTH_CLIENT_SECRET": "..."
}
```

### POST /api/create-checkout
**Body:**
```json
{
  "product_id": 1,
  "sku": "PWS-0001",
  "buyer_email": "customer@example.com"
}
```

**Response (presold):**
```json
{
  "presold_delivery": true,
  "delivery_url": "https://proton.me/s/ABC123DEF456",
  "message": "Package auto-delivered..."
}
```

### POST /api/audit
**Body:**
```json
{
  "action": "user_action",
  "details": "Description of action"
}
```

Note: `admin` field is automatically forced to "Keli"

---

## 📄 License

This system is part of the Phoenix Wolf Systems Sovereign OS suite. All packages include appropriate licensing as specified in their individual license documents.

---

## 👤 Contact

**Admin:** Keli  
**System:** Phoenix Wolf Systems  
**Status:** Persistent // Matured // Secure

---

*High-frequency logic for 2026 infrastructure*
