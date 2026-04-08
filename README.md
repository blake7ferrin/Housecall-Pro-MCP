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

## Slack agent (Viktor-style)

This repo also ships a **Slack Bolt** assistant that mirrors an MCP-style tool surface: Housecall Pro reads/writes (when credentials are present), the in-repo **estimator** (`run_estimator`), and **PDF** generators for estimate summaries, inspection reports, and duct cleaning reports.

### Configure Slack

1. Create a Slack app with **Socket Mode** enabled and subscribe to bot events: `app_mention`, `message.im`.
2. Add OAuth scopes your workflows need (for mentions and DMs: `app_mentions:read`, `chat:write`, `im:history`, `files:write`).
3. Install the app to your workspace and copy **Bot User OAuth Token** (`SLACK_BOT_TOKEN`) and **App-Level Token** with `connections:write` (`SLACK_APP_TOKEN`).

### Run

```bash
npm install
npm run build
npm run start:slack
```

For development:

```bash
npm run dev:slack
```

Environment variables are listed in `.env.example`. Set `OPENAI_API_KEY` for the tool-calling loop. Housecall Pro keys are optional: without them, estimator + PDF tools still work; the model will tell the user HCP is unavailable.

### Estimator rules

Default line items and bundles live in `src/estimator/defaultRulesData.ts`. Point `ESTIMATOR_RULES_PATH` at a JSON file with the same shape (see `src/estimator/schema.ts`) to override without code changes.

### Viktor-style replacement estimator

`run_viktor_estimate` (Slack/OpenAI tool) implements the logic from the Viktor screenshots:

- **Sell from cost** with gross margin: `price = unitCost / (1 - margin)`.
- **Labor & adders** default to **40%** margin; **equipment** uses **40%** in full-replacement (`bundle`) mode or **23%** in `standalone` mode.
- **Good / Better / Best** for **3T split heat pump** uses Y / M / X tier costs calibrated to match the sample totals (~$7,492 / $8,031 / $8,938 with tight attic).
- **Adders** stack from `customerNotes` keywords (e.g. “tight attic”) or explicit `adderIds`; see `src/estimator/viktorCatalogEngine.ts`.
- **Service & repair** catalog items are **not** duplicated here — the agent should call **`housecall_list_price_book_services`** per your HCP workflow.

### PDF templates

`src/pdf/pdfGenerator.ts` builds customer-facing PDFs with **pdfkit**. Replace or extend that module to match your branded templates (logos, colors, legal copy). The Slack agent uploads generated PDFs to the thread via `files.uploadV2`.

If you share **Word/PDF/InDesign** (or HTML) templates for duct cleaning, estimate, HVAC inspection, and **new build**, those can be mapped into this generator or a small template engine. An **exported Housecall Pro price book** (CSV/JSON) can back `run_viktor_estimate` or HCP line-item mapping so catalog and API stay aligned.

**Variable-speed adder:** mention “variable speed”, “communicating”, or “inverter” in `customerNotes`, or pass `adderIds: ["adder_variable_speed"]`. Default internal cost is set high for a clear gap vs tight attic; adjust `unitCost` in `viktorCatalogEngine.ts` to match your book.

## Notes

- Housecall Pro's help center says API access and webhooks are available for MAX customers.
- This project has been live-validated against customer, job, estimate, invoice, company, employee, lead source, job type, tag, service zone, route, and pipeline-status read routes on `https://api.housecallpro.com`.
- In `auto` mode, the client uses `Authorization: Token ...` for API keys and `Authorization: Bearer ...` for OAuth tokens, matching Housecall Pro's published auth guidance.
- Your current credential can read most company-level resources, but `GET /application` and write routes like `POST /customers`, `POST /jobs`, and `POST /estimates` returned `401 Unauthorized ... does not have the necessary permissions`.
- Webhook subscription endpoints are mapped in the MCP, but Housecall Pro's OpenAPI spec does not describe the request body shape in detail, so those tools accept a generic JSON payload.
