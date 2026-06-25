import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { HousecallProClient } from "./housecallProClient.js";
import { API_CONVENTIONS_REFERENCE, WEBHOOK_EVENT_REFERENCE } from "./referenceData.js";
import { resourceErrorResponse, resourceJsonResponse } from "./mcpHelpers.js";

const RESOURCE_BASE_URI = "housecall://reference";

export function registerMcpResources(server: McpServer, client: HousecallProClient): void {
  server.registerResource(
    "housecall-company",
    `${RESOURCE_BASE_URI}/company`,
    {
      title: "Housecall Pro Company",
      description: "Company profile and location hierarchy for multi-location accounts.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        return resourceJsonResponse(uri.href, await client.get("/company"));
      } catch (error) {
        return resourceErrorResponse(uri.href, error);
      }
    },
  );

  server.registerResource(
    "housecall-pipeline-statuses",
    `${RESOURCE_BASE_URI}/pipeline-statuses`,
    {
      title: "Housecall Pro Pipeline Statuses",
      description: "Pipeline statuses for leads, jobs, and estimates.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        return resourceJsonResponse(uri.href, await client.get("/pipeline/statuses"));
      } catch (error) {
        return resourceErrorResponse(uri.href, error);
      }
    },
  );

  server.registerResource(
    "housecall-job-types",
    `${RESOURCE_BASE_URI}/job-types`,
    {
      title: "Housecall Pro Job Types",
      description: "Configured job types for the company.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        return resourceJsonResponse(uri.href, await client.get("/job_types"));
      } catch (error) {
        return resourceErrorResponse(uri.href, error);
      }
    },
  );

  server.registerResource(
    "housecall-lead-sources",
    `${RESOURCE_BASE_URI}/lead-sources`,
    {
      title: "Housecall Pro Lead Sources",
      description: "Lead source catalog for the company.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        return resourceJsonResponse(uri.href, await client.get("/lead_sources", {
          query: { page: 1, page_size: 200 },
        }));
      } catch (error) {
        return resourceErrorResponse(uri.href, error);
      }
    },
  );

  server.registerResource(
    "housecall-employees",
    `${RESOURCE_BASE_URI}/employees`,
    {
      title: "Housecall Pro Employees",
      description: "Active employees for scheduling and dispatch.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        return resourceJsonResponse(uri.href, await client.get("/employees", {
          query: { page: 1, page_size: 200 },
        }));
      } catch (error) {
        return resourceErrorResponse(uri.href, error);
      }
    },
  );

  server.registerResource(
    "housecall-tags",
    `${RESOURCE_BASE_URI}/tags`,
    {
      title: "Housecall Pro Tags",
      description: "Tag catalog used across customers, jobs, and leads.",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        return resourceJsonResponse(uri.href, await client.get("/tags", {
          query: { page: 1, page_size: 200 },
        }));
      } catch (error) {
        return resourceErrorResponse(uri.href, error);
      }
    },
  );

  server.registerResource(
    "housecall-webhook-events",
    `${RESOURCE_BASE_URI}/webhook-events`,
    {
      title: "Housecall Pro Webhook Event Reference",
      description: "Static reference for webhook event patterns and verification.",
      mimeType: "application/json",
    },
    async (uri) => resourceJsonResponse(uri.href, WEBHOOK_EVENT_REFERENCE),
  );

  server.registerResource(
    "housecall-api-conventions",
    `${RESOURCE_BASE_URI}/api-conventions`,
    {
      title: "Housecall Pro API Conventions",
      description: "Static reference for pagination, auth, money, dates, and error handling.",
      mimeType: "application/json",
    },
    async (uri) => resourceJsonResponse(uri.href, API_CONVENTIONS_REFERENCE),
  );
}
