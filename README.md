# Housecall Pro Connector for Claude

A remote MCP server that turns Housecall Pro into a **custom connector** you can add to Claude.ai (chat and Cowork) and Claude Desktop.

It speaks the Model Context Protocol over Streamable HTTP, runs anywhere Node.js runs, and is already deployed on Railway in this project.

## What you can do from Claude

- **Customers** — list, get, create, update, list addresses, get address, create address
- **Jobs** — list, get, create, lock by time range
- **Estimates** — list, get, create
- **Invoices** — list, get by UUID, list for a job
- **Leads** — list, get, create, convert, list lead line items
- **Application** — get, enable, disable
- **Company & scheduling** — get company, get / update schedule availability, get booking windows
- **Metadata** — employees, checklists, events, tags, lead sources, job types, service zones, routes, pipeline statuses
- **Price book** — materials, material categories, price forms, services

## Add it to Claude.ai

1. Deploy this server (see below) so you have a public HTTPS URL — e.g. `https://your-app.up.railway.app`.
2. In Claude.ai, open **Settings → Connectors → Add custom connector**.
3. Fill in:
   - **Name**: `Housecall Pro`
   - **URL**: `https://your-app.up.railway.app/mcp`
   - **Authentication**: Bearer token — paste the value of `MCP_BEARER_TOKEN`
4. Click **Add** — Claude will call the server, complete the MCP handshake, and load the tools.
5. Toggle the connector on in chat or Cowork and ask things like *"List my Housecall Pro customers created this week"*.

## Add it to Claude Desktop

You can also run it locally over stdio:

```json
{
  "mcpServers": {
    "housecall-pro": {
      "command": "node",
      "args": ["/absolute/path/to/housecall-pro-mcp/dist/index.js"],
      "env": {
        "HOUSECALL_PRO_API_KEY": "replace-me",
        "HOUSECALL_PRO_AUTH_SCHEME": "auto",
        "HOUSECALL_PRO_BASE_URL": "https://api.housecallpro.com"
      }
    }
  }
}
```

## Deploy on Railway

```bash
npm i -g @railway/cli
railway login
railway init

# Required: Housecall Pro auth (one of these)
railway variables set HOUSECALL_PRO_API_KEY="..."
# or
railway variables set HOUSECALL_PRO_BEARER_TOKEN="..."

# Required for public connector: bearer token Claude.ai will send
railway variables set MCP_BEARER_TOKEN="$(openssl rand -hex 32)"

# Recommended: lock the Host header to your Railway domain
railway variables set MCP_ALLOWED_HOSTS="your-app.up.railway.app"

railway up
railway open
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `HOUSECALL_PRO_API_KEY` | one-of | Housecall Pro API key |
| `HOUSECALL_PRO_BEARER_TOKEN` | one-of | Housecall Pro OAuth bearer token |
| `HOUSECALL_PRO_AUTH_SCHEME` | optional | `auto` (default), `bearer`, `token`, `x-api-key`, or `authorization` |
| `HOUSECALL_PRO_BASE_URL` | optional | Defaults to `https://api.housecallpro.com` |
| `HOUSECALL_PRO_*_PATH` | optional | Override individual route templates if your tenant uses custom paths |
| `MCP_BEARER_TOKEN` | recommended | Bearer token Claude.ai must present; without it the `/mcp` endpoint is unauthenticated |
| `MCP_ALLOWED_HOSTS` | optional | Comma-separated allowlist for the `Host` header (DNS rebinding protection) |
| `PORT` / `MCP_PORT` | optional | Port to bind on (defaults to `3000`; Railway sets `PORT`) |

If your tenant uses different auth headers or paths, override the `HOUSECALL_PRO_*` env vars — the defaults match what's documented at [docs.housecallpro.com](https://docs.housecallpro.com/docs/housecall-public-api).

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/` | JSON connector info (name, MCP endpoint, auth flag) |
| `GET` | `/healthz` | Liveness probe |
| `POST` | `/mcp` | MCP Streamable HTTP — initialize and call tools |
| `GET` | `/mcp` | Server-sent events for an open MCP session |
| `DELETE` | `/mcp` | Tear down an MCP session |

If `MCP_BEARER_TOKEN` is set, every `/mcp` request must include `Authorization: Bearer <token>`. 401 responses include a `WWW-Authenticate: Bearer` header.

## Local development

```bash
npm install
cp .env.example .env   # fill in HOUSECALL_PRO_* and MCP_BEARER_TOKEN
npm run dev            # HTTP connector on http://localhost:3000
npm run dev:stdio      # stdio MCP server (for Claude Desktop)
npm run smoke          # validate auth + default routes against Housecall Pro
npm run build          # type-check and emit dist/
npm start              # run the built HTTP connector
```

## Notes & caveats

- Housecall Pro's help center says public API access and webhooks are MAX-only.
- The connector has been live-validated against customer, job, estimate, invoice, company, employee, lead source, job type, tag, service zone, route, and pipeline-status read routes on `https://api.housecallpro.com`.
- In `auto` mode the client uses `Authorization: Token …` for API keys and `Authorization: Bearer …` for OAuth tokens, matching Housecall Pro's published auth guidance.
- A typical API-key credential can read most company-level resources, but `GET /application` and write routes like `POST /customers`, `POST /jobs`, and `POST /estimates` require additional permissions.
- Webhook subscription endpoints are mapped, but Housecall Pro's OpenAPI does not describe the request body shape in detail, so those tools accept a generic JSON payload.
