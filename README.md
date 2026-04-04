# Housecall Pro MCP

This is a standalone Model Context Protocol server for Housecall Pro.

## What it does

- Customers: list, get, create, update, list addresses, get address, create address
- Jobs: list, get, create, lock by time range
- Estimates: list, get, create
- Invoices: list, get by UUID, list for a job
- Leads: list, get, create, convert, list lead line items
- Application: get, enable, disable
- Company and scheduling: get company, get schedule availability, update schedule availability, get booking windows
- Metadata: employees, checklists, events, tags, lead sources, job types, service zones, routes, pipeline statuses
- Price book: materials, material categories, price forms, services

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
