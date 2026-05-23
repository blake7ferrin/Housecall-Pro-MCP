# Housecall Pro MCP

This is a standalone Model Context Protocol server for Housecall Pro.

## What it does

The server registers **100+ MCP tools** that map to Housecall Pro’s HTTP API (defaults target `https://api.housecallpro.com`). Highlights:

- **Customers**: full CRUD, addresses (CRUD), optional **PATCH** partial updates, **DELETE** customer when the API allows it.
- **Jobs**: list (rich filters), get (with `expand`), create, **PATCH** update, **DELETE**, lock (range + single), appointments, line items (list / add / bulk update), input materials (list + bulk update), schedule, dispatch, attachments, tags, notes, links.
- **Estimates**: list (filters aligned with jobs where applicable), get (`expand`), create, **PATCH**, **DELETE**, option approve/decline, line items (list / add / bulk update).
- **Invoices & payments**: list/get/preview invoices, job invoices, **send invoice**, list/get/create **payments**.
- **Leads**: list, get, create, **PATCH**, **DELETE**, convert, line items; lead sources CRUD.
- **Application & company**: application get/enable/disable, company, schedule availability, booking windows.
- **Metadata**: employees (list + get), checklists, events (list + get), tags (CRUD including **delete**), job types & business units, service zones, routes, pipeline statuses.
- **Price book** (`/api/price_book/...`): list materials/categories/forms/services; get single resource; create/update/delete materials and services; get category and price form by id.
- **Webhooks**: create/delete subscription payloads, **get** subscription (when supported).
- **Locations** (multi-location): list and get.
- **Escape hatch**: `housecall_request` runs any **GET/POST/PUT/PATCH/DELETE** against a **fully expanded** relative path under your configured base URL (for new or tenant-specific routes).

Prefer the typed tools first; use `housecall_request` when the API exposes a route that is not yet modeled as its own tool.

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
- `/api/invoices/{invoiceId}`
- `/jobs/{jobId}/invoices`
- `/leads`

If your tenant uses a different auth header or different paths, update `.env`.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `HOUSECALL_PRO_API_KEY` or `HOUSECALL_PRO_BEARER_TOKEN`.
3. If needed, set `HOUSECALL_PRO_AUTH_SCHEME` to `auto`, `bearer`, `token`, `x-api-key`, or `authorization`.
4. Install dependencies.
5. Build the server.

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

- `MCP_BEARER_TOKEN` (protects your public `/mcp` endpoint)

### Railway CLI

```bash
npm i -g @railway/cli
railway login
railway init

# Required Housecall Pro auth
railway variables set HOUSECALL_PRO_API_KEY="..."

# Recommended: protect your public MCP endpoint
railway variables set MCP_BEARER_TOKEN="some-long-random-string"

railway up
railway open
```

### Endpoints

- `GET /healthz` returns 200 OK.
- `POST /mcp`, `GET /mcp`, `DELETE /mcp` implement MCP Streamable HTTP.
  - If `MCP_BEARER_TOKEN` is set, send `Authorization: Bearer <token>`.

For local development:

```bash
npm run dev
```

To validate auth and the default routes against a real account:

```bash
npm run smoke
```

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
- Your current credential can read most company-level resources, but `GET /application` and write routes like `POST /customers`, `POST /jobs`, and `POST /estimates` returned `401 Unauthorized ... does not have the necessary permissions`.
- Webhook subscription endpoints are mapped in the MCP, but Housecall Pro's OpenAPI spec does not describe the request body shape in detail, so those tools accept a generic JSON payload.
- **PATCH**, **DELETE**, payments, locations, invoice send, and some price-book write routes may return `404` or `405` if your tenant or API version does not expose them; use `housecall_request` against the path from the official docs when needed.
- **`housecall_request`** only accepts relative paths starting with `/`, rejects `..` and `{placeholders}`, and still uses your configured Housecall Pro credentials—double-check paths and bodies before calling destructive methods.
