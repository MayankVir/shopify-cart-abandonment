# Shopify IVR Abandoned Cart Recovery

Multi-tenant B2B platform replacing the Apps Script + Sheet workflow with Postgres, Shopify polling, and TTAI SIP dispatch.

## Recovery pipeline (replaces sheet + manual menus)

On **Call now** or **auto-scheduled call**:

1. **Storefront `cartCreate`** — rebuilds cart from line item variant IDs (deferred from poll/webhook)
2. **uAgents `fetch-context`** — enriches order/user context (`UAGENTS_*` env)
3. **TTAI `POST /v2/sip/call`** — dispatches SIP with `dynamic_vars` (`TT_API_*` env + per-store scenario/trunk)

## Ingestion

| Source | Purpose |
|---|---|
| **Poll** (every 5 min) | Lists open `abandonedCheckouts` from Shopify Admin GraphQL — no cart creation |
| **Webhook** `/api/webhooks/checkout-update` | Fast phone/email/line-item updates (optional accelerator) |
| **Auto-call** | Runs on each sync + `/api/cron/process-calls` for due checkouts |

## Setup

```bash
cp .env.example .env.local
# Fill Supabase, Clerk, TT_API_KEY, UAGENTS_TOKEN, ENCRYPTION_KEY

npx prisma db push --accept-data-loss
npx prisma generate
npm run dev
```

### Required env (from Apps Script creds)

```env
TT_API_KEY=          # was TT_API_KEY
TT_ORG_ID=           # was TT_ORG_ID
TT_BASE_URL=https://api.toughtongueai.com/api/public

UAGENTS_CUSTOMER_NAME=ttai
UAGENTS_TOKEN=       # was UAGENTS_TOKEN
UAGENTS_BASE_URL=https://uagents.val.run

TTAI_WEBHOOK_SECRET= # verify POST /api/webhooks/ttai
CRON_SECRET=         # optional Bearer for /api/cron/process-calls
```

Per-store **SIP scenario + trunk** are set in `/admin` (`ttaiScenarioId`, `ttaiTrunkId`).

### Webhooks to register

| URL | Purpose |
|---|---|
| `POST /api/webhooks/checkout-update` | Shopify checkout update (HMAC via store apiSecret) |
| `POST /api/webhooks/ttai` | TTAI call completion → transcript, tool calls, status |

### Cron (optional external scheduler)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.com/api/cron/process-calls
```

## Call status analytics

| Category | Statuses |
|---|---|
| Pre-call failures | `CART_CREATE_FAILED`, `ENRICH_FAILED`, `DISPATCH_FAILED` |
| Telephony outcomes | `NO_ANSWER`, `BUSY`, `INVALID_NUMBER`, `HANG_UP`, `VOICEMAIL` |
| Success | `COMPLETED` |
| In progress | `PREPARING`, `DISPATCHED` |

Each attempt is stored in `CallAttempt` with transcript, tool calls JSON, failure stage/reason, and duration.

## Project structure

```
lib/
  recovery-pipeline.ts   # cart → uAgents → SIP orchestration
  shopify-admin.ts       # abandonedCheckouts GraphQL poll
  shopify.ts             # webhook + Storefront cartCreate
  uagents.ts             # fetch-context enrichment
  ttai.ts                # SIP dispatch + status mapping
  phone.ts               # E.164 normalization
  line-items.ts          # variant GID helpers
app/api/webhooks/ttai/   # call completion callback
app/api/cron/process-calls/
```
