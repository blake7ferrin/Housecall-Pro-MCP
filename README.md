# Housecall Pro MCP

This is a standalone Model Context Protocol server for Housecall Pro.

## What it does

- Customers: list, get, create, update, list addresses, get address, create address
- Jobs: list, get, create, update/clear schedule, dispatch, create appointment, lock (single or bulk), add/delete notes, add/remove tags, create links, list materials
- Workflows: find-or-create customer, book job, schedule-and-dispatch, convert lead to job, fetch all pages
- MCP resources: company, employees, job types, lead sources, tags, pipeline statuses, price book services, API conventions, webhook events
- Webhooks: HTTP ingress at POST /webhooks/housecall with HMAC verification; list/get/clear stored events via MCP tools
- MCP prompts: morning dispatch briefing, estimate follow-up, invoice aging, book service call
- Estimates: list, get, create, approve/decline options, manage options (create, line items, schedule, notes, links)
- Invoices: list, get by UUID, list for a job
- Leads: list, get, create, convert, list lead line items
- Application: get, enable, disable
- Company and scheduling: get company, get/update schedule windows, get booking windows
- Metadata: employees, checklists, events, tags, lead sources, job types, service zones, routes, pipeline statuses
- Price book: list/create/update/delete materials, material categories, and price forms; list services

## Why the routes are configurable

Housecall Pro's official public API docs are published at [docs.housecallpro.com](https://docs.housecallpro.com/docs/housecall-public-api), and the current authentication page states that the API supports both API keys and OAuth 2.0. The docs are JS-heavy, so this scaffold keeps the base URL, auth scheme, and route templates configurable via environment variables.

The current defaults in this project are:

- `https://api.housecallpro.com`
- `HOUSECALL_PRO_AUTH_SCHEME=auto`
- `/customers`
- `/customers/{customerId}`
- `/jobs`
- `/jobs/{jobId}`
- `/estimates`
- `/estimates/{estimateId}`
- `/invoices`
- `/invoices/{invoiceId}`
- `/jobs/{jobId}/invoices`
- `/leads`

If your tenant uses a different auth header or different paths, update `.env`.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `HOUSECALL_PRO_API_KEY` or `HOUSECALL_PRO_BEARER_TOKEN`.
3. For multi-location accounts, optionally set `HOUSECALL_PRO_COMPANY_ID` to scope requests with the `X-Company-Id` header.
4. For OAuth integrations, set `HOUSECALL_PRO_BEARER_TOKEN` plus the `HOUSECALL_PRO_OAUTH_*` variables to enable automatic token refresh on 401 responses.
5. If needed, set `HOUSECALL_PRO_AUTH_SCHEME` to `auto`, `bearer`, `token`, `x-api-key`, or `authorization`.
6. Install dependencies.
7. Build the server.

```bash
npm install
npm run build
```

## Run

```bash
npm start
```

## Deploy on Railway (public URL)

This project can run as a **public HTTP MCP server** (Streamable HTTP) for integrations that need an HTTP endpoint (like Slack bots).

### Environment variables

You must set one of:

- `HOUSECALL_PRO_API_KEY`
- `HOUSECALL_PRO_BEARER_TOKEN`

Optional (recommended):

- `MCP_HTTP_BEARER_TOKEN` (protects your public `/mcp` endpoint)
- `HOUSECALL_PRO_COMPANY_ID` (scopes API requests to a specific sub-location)
- `HOUSECALL_PRO_OAUTH_CLIENT_ID`, `HOUSECALL_PRO_OAUTH_CLIENT_SECRET`, `HOUSECALL_PRO_OAUTH_REFRESH_TOKEN`, `HOUSECALL_PRO_OAUTH_REDIRECT_URI` (automatic OAuth token refresh)
- `HOUSECALL_PRO_RATE_LIMIT_MAX_RETRIES` (retries on HTTP 429, default `3`)
- `HOUSECALL_PRO_WEBHOOK_SIGNING_SECRET` (verifies incoming webhooks at POST /webhooks/housecall)

### Railway CLI

```bash
npm i -g @railway/cli
railway login
railway init

# Required Housecall Pro auth
railway variables set HOUSECALL_PRO_API_KEY="..."

# Recommended: protect your public MCP endpoint
railway variables set MCP_HTTP_BEARER_TOKEN="some-long-random-string"

railway up
railway open
```

### Endpoints

- `GET /healthz` returns 200 OK.
- `POST /webhooks/housecall` receives signed Housecall Pro webhook payloads.
- `POST /mcp`, `GET /mcp`, `DELETE /mcp` implement MCP Streamable HTTP.
  - If `MCP_HTTP_BEARER_TOKEN` is set, send `Authorization: Bearer <token>`.

For local development:

```bash
npm run dev
```

To validate auth and the default routes against a real account:

```bash
npm run smoke
```

## Webhook ingress

When running `npm start`, register your public URL with Housecall Pro:

```
https://your-app.up.railway.app/webhooks/housecall
```

Set `HOUSECALL_PRO_WEBHOOK_SIGNING_SECRET` from your Housecall Pro account. The server verifies each delivery using the `Api-Timestamp` and `Api-Signature` headers (HMAC-SHA256 over `timestamp + "." + raw_json_body`).

Use `housecall_create_webhook_subscription` to register event types, then inspect deliveries with:

- `housecall_list_webhook_events`
- `housecall_get_webhook_event`

For local testing only, set `HOUSECALL_PRO_WEBHOOK_SKIP_VERIFY=true` to bypass signature checks.

## MCP client example

```json
{
  "mcpServers": {
    "housecall-pro": {
      "command": "node",
      "args": ["C:/Users/blake/OneDrive/Codex/housecall-pro-mcp/dist/index.js"],
      "env": {
        "HOUSECALL_PRO_API_KEY": "replace-me",
        "HOUSECALL_PRO_AUTH_SCHEME": "auto",
        "HOUSECALL_PRO_BASE_URL": "https://api.housecallpro.com"
      }
    }
  }
}
```

## Notes

- Housecall Pro's help center says API access and webhooks are available for MAX customers.
- This project has been live-validated against customer, job, estimate, invoice, company, employee, lead source, job type, tag, service zone, route, and pipeline-status read routes on `https://api.housecallpro.com`.
- In `auto` mode, the client uses `Authorization: Token ...` for API keys and `Authorization: Bearer ...` for OAuth tokens, matching Housecall Pro's published auth guidance.
- When OAuth refresh credentials are configured, the client automatically refreshes expired bearer tokens on 401 and retries the request once.
- The client retries rate-limited requests (HTTP 429) with exponential backoff.
- MCP resources expose reference data at `housecall://reference/*` URIs for company metadata, catalogs, and static API conventions.
- MCP prompts provide ready-made workflows for dispatch briefings, estimate follow-up, invoice aging, and booking service calls.
- Your current credential can read most company-level resources, but `GET /application` and write routes like `POST /customers`, `POST /jobs`, and `POST /estimates` returned `401 Unauthorized ... does not have the necessary permissions`.
- Webhook subscription tools use `POST /webhook_subscriptions` and `DELETE /webhook_subscriptions/{subscription_id}`.
- `POST /jobs/lock` requires a `statuses` array (`scheduled`, `in_progress`, or `completed`) as of June 2026.
