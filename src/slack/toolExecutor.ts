import type OpenAI from "openai";

import type { EstimateResult } from "../estimator/index.js";
import {
  loadEstimatorRules,
  runEstimator,
  runViktorCatalogEstimate,
  type RunEstimatorInput,
  type SystemKind,
  type ViktorCatalogEstimateResult,
} from "../estimator/index.js";
import {
  HousecallProApiError,
  HousecallProClient,
  tryLoadHousecallProConfig,
} from "../housecallProClient.js";
import {
  buildDuctCleaningPdf,
  buildEstimateSummaryPdf,
  buildInspectionReportPdf,
  buildViktorTieredEstimatePdf,
} from "../pdf/pdfGenerator.js";

export type ToolExecutorContext = {
  housecallClient: HousecallProClient | null;
  estimatorRulesPath?: string;
};

export type ToolExecutorResult = {
  text: string;
  pdf?: { filename: string; buffer: Buffer };
};

function jsonSafe(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function optionalMargin(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function formatHcpError(error: unknown): string {
  if (error instanceof HousecallProApiError) {
    return jsonSafe({ error: error.message, details: error.details });
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function requireHousecall(client: HousecallProClient | null): HousecallProClient {
  if (!client) {
    throw new Error(
      "Housecall Pro is not configured. Set HOUSECALL_PRO_API_KEY or HOUSECALL_PRO_BEARER_TOKEN on the agent process.",
    );
  }
  return client;
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutorContext,
): Promise<ToolExecutorResult> {
  const hc = ctx.housecallClient;

  try {
    switch (name) {
      case "housecall_list_customers": {
        const c = requireHousecall(hc);
        const data = await c.listCustomers({
          q: args.q as string | undefined,
          page: args.page as number | undefined,
          page_size: args.pageSize as number | undefined,
        });
        return { text: jsonSafe(data) };
      }
      case "housecall_get_customer": {
        const c = requireHousecall(hc);
        const data = await c.getCustomer(String(args.customerId));
        return { text: jsonSafe(data) };
      }
      case "housecall_list_jobs": {
        const c = requireHousecall(hc);
        const data = await c.listJobs({
          page: args.page as number | undefined,
          page_size: args.pageSize as number | undefined,
          customer_id: args.customerId as string | undefined,
        });
        return { text: jsonSafe(data) };
      }
      case "housecall_get_job": {
        const c = requireHousecall(hc);
        const data = await c.getJob(String(args.jobId));
        return { text: jsonSafe(data) };
      }
      case "housecall_list_estimates": {
        const c = requireHousecall(hc);
        const data = await c.listEstimates({
          page: args.page as number | undefined,
          page_size: args.pageSize as number | undefined,
          customer_id: args.customerId as string | undefined,
          work_status: args.workStatus as string | undefined,
        });
        return { text: jsonSafe(data) };
      }
      case "housecall_get_estimate": {
        const c = requireHousecall(hc);
        const data = await c.getEstimate(String(args.estimateId));
        return { text: jsonSafe(data) };
      }
      case "housecall_create_estimate": {
        const c = requireHousecall(hc);
        const body = (args.body as Record<string, unknown>) ?? {};
        const data = await c.createEstimate(body);
        return { text: jsonSafe(data) };
      }
      case "housecall_list_invoices": {
        const c = requireHousecall(hc);
        const data = await c.listInvoices({
          page: args.page as number | undefined,
          page_size: args.pageSize as number | undefined,
          customer_uuid: args.customerUuid as string | undefined,
          status: args.status as string | undefined,
        });
        return { text: jsonSafe(data) };
      }
      case "housecall_list_price_book_services": {
        const c = requireHousecall(hc);
        const data = await c.get("/api/price_book/services", {
          query: {
            page: args.page as number | undefined,
            page_size: args.pageSize as number | undefined,
            q: args.q as string | undefined,
          },
        });
        return { text: jsonSafe(data) };
      }
      case "run_estimator": {
        const rules = loadEstimatorRules(ctx.estimatorRulesPath);
        const input: RunEstimatorInput = {
          systemType: args.systemType as string | undefined,
          squareFeet: args.squareFeet as number | undefined,
          bedrooms: args.bedrooms as number | undefined,
          intent: args.intent as string | undefined,
          extraVents: args.extraVents as number | undefined,
          includeRuleIds: args.includeRuleIds as string[] | undefined,
          bundleId: args.bundleId as string | undefined,
          taxRate: args.taxRate as number | undefined,
        };
        const result = runEstimator(rules, input);
        return { text: jsonSafe(result) };
      }
      case "run_viktor_estimate": {
        const systemKind = String(args.systemKind ?? "split_heat_pump") as SystemKind;
        const validKinds: SystemKind[] = ["split_heat_pump", "split_ac", "package_heat_pump", "package_ac"];
        if (!validKinds.includes(systemKind)) {
          return { text: `Invalid systemKind. Use one of: ${validKinds.join(", ")}` };
        }
        const rawMargins = args.margins && typeof args.margins === "object"
          ? (args.margins as Record<string, unknown>)
          : undefined;
        const marginsPartial = rawMargins
          ? {
              ...(optionalMargin(rawMargins.equipmentBundle) !== undefined
                ? { equipmentBundle: optionalMargin(rawMargins.equipmentBundle)! }
                : {}),
              ...(optionalMargin(rawMargins.equipmentStandalone) !== undefined
                ? { equipmentStandalone: optionalMargin(rawMargins.equipmentStandalone)! }
                : {}),
              ...(optionalMargin(rawMargins.labor) !== undefined
                ? { labor: optionalMargin(rawMargins.labor)! }
                : {}),
              ...(optionalMargin(rawMargins.adder) !== undefined
                ? { adder: optionalMargin(rawMargins.adder)! }
                : {}),
            }
          : undefined;

        const result = runViktorCatalogEstimate({
          tonnage: Number(args.tonnage) || 3,
          systemKind,
          customerNotes: args.customerNotes as string | undefined,
          adderIds: args.adderIds as string[] | undefined,
          equipmentMarginMode: args.equipmentMarginMode === "standalone" ? "standalone" : "bundle",
          discountFraction:
            args.discountFraction === undefined ? undefined : Number(args.discountFraction),
          taxRate: args.taxRate === undefined ? undefined : Number(args.taxRate),
          margins: marginsPartial && Object.keys(marginsPartial).length > 0 ? marginsPartial : undefined,
        });
        return { text: jsonSafe(result) };
      }
      case "build_estimate_pdf": {
        const estimate = args.estimate as EstimateResult | ViktorCatalogEstimateResult;
        if (!estimate || typeof estimate !== "object") {
          return { text: "Invalid estimate payload. Call run_estimator or run_viktor_estimate first." };
        }
        const meta = {
          customerName: args.customerName as string | undefined,
          address: args.address as string | undefined,
          jobOrEstimateId: args.jobOrEstimateId as string | undefined,
        };
        const isViktor = (estimate as ViktorCatalogEstimateResult).pricingMethod === "viktor_catalog";
        const buffer = isViktor
          ? await buildViktorTieredEstimatePdf(estimate as ViktorCatalogEstimateResult, meta)
          : await buildEstimateSummaryPdf(estimate as EstimateResult, meta);
        return {
          text: "PDF generated successfully. It will be attached to the Slack thread.",
          pdf: { filename: isViktor ? "catalog-wired-estimate.pdf" : "estimate-summary.pdf", buffer },
        };
      }
      case "build_inspection_pdf": {
        const buffer = await buildInspectionReportPdf({
          title: args.title as string | undefined,
          customerName: args.customerName as string | undefined,
          address: args.address as string | undefined,
          jobOrEstimateId: args.jobOrEstimateId as string | undefined,
          dateIso: args.dateIso as string | undefined,
          findings: (args.findings as string[]) ?? [],
          recommendations: (args.recommendations as string[]) ?? [],
          photosNote: args.photosNote as string | undefined,
        });
        return {
          text: "Inspection report PDF generated. It will be attached to the Slack thread.",
          pdf: { filename: "inspection-report.pdf", buffer },
        };
      }
      case "build_duct_cleaning_pdf": {
        const buffer = await buildDuctCleaningPdf({
          title: args.title as string | undefined,
          customerName: args.customerName as string | undefined,
          address: args.address as string | undefined,
          supplyVents: args.supplyVents as number | undefined,
          returnVents: args.returnVents as number | undefined,
          mainTrunksCleaned: args.mainTrunksCleaned as boolean | undefined,
          sanitizeApplied: args.sanitizeApplied as boolean | undefined,
          beforeAfterNote: args.beforeAfterNote as string | undefined,
          technicianNotes: args.technicianNotes as string | undefined,
        });
        return {
          text: "Duct cleaning report PDF generated. It will be attached to the Slack thread.",
          pdf: { filename: "duct-cleaning-report.pdf", buffer },
        };
      }
      default:
        return { text: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return { text: formatHcpError(error) };
  }
}

export const openAiTools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "housecall_list_customers",
      description: "Search/list Housecall Pro customers (GET /customers).",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Search query" },
          page: { type: "integer" },
          pageSize: { type: "integer", description: "Max 200" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "housecall_get_customer",
      description: "Fetch one Housecall Pro customer by ID.",
      parameters: {
        type: "object",
        properties: { customerId: { type: "string" } },
        required: ["customerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "housecall_list_jobs",
      description: "List Housecall Pro jobs.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          customerId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "housecall_get_job",
      description: "Get one job by Housecall Pro job ID.",
      parameters: {
        type: "object",
        properties: { jobId: { type: "string" } },
        required: ["jobId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "housecall_list_estimates",
      description: "List Housecall Pro estimates.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          customerId: { type: "string" },
          workStatus: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "housecall_get_estimate",
      description: "Get one estimate by ID.",
      parameters: {
        type: "object",
        properties: { estimateId: { type: "string" } },
        required: ["estimateId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "housecall_create_estimate",
      description:
        "Create a Housecall Pro estimate. Pass `body` as the JSON body for POST /estimates (snake_case keys per API, e.g. customer_id, options with line_items).",
      parameters: {
        type: "object",
        properties: {
          body: { type: "object", description: "Raw estimate create payload for Housecall Pro API" },
        },
        required: ["body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "housecall_list_invoices",
      description: "List Housecall Pro invoices.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          customerUuid: { type: "string" },
          status: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "housecall_list_price_book_services",
      description: "Search the Housecall Pro price book services (GET /api/price_book/services).",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string" },
          page: { type: "integer" },
          pageSize: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_estimator",
      description:
        "Simple rule-based estimator (inspection, duct cleaning, tune-up). For replacement Good/Better/Best with margin math, use run_viktor_estimate.",
      parameters: {
        type: "object",
        properties: {
          intent: { type: "string", description: "e.g. inspection, duct_cleaning, tune_up" },
          systemType: { type: "string" },
          squareFeet: { type: "number" },
          bedrooms: { type: "integer" },
          extraVents: { type: "integer" },
          bundleId: { type: "string", description: "e.g. duct_cleaning_premium" },
          includeRuleIds: { type: "array", items: { type: "string" } },
          taxRate: { type: "number", description: "Decimal, e.g. 0.0825" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_viktor_estimate",
      description:
        "Viktor-style catalog estimate: gross margin pricing (sell = cost/(1-margin)), default 40% on labor and adders, Good/Better/Best equipment tiers for 3T split heat pump (Y/M/X). Pass customerNotes for keyword adders (e.g. 'tight attic'). Service/repair: use housecall_list_price_book_services instead.",
      parameters: {
        type: "object",
        properties: {
          tonnage: { type: "number", description: "e.g. 3" },
          systemKind: {
            type: "string",
            enum: ["split_heat_pump", "split_ac", "package_heat_pump", "package_ac"],
          },
          customerNotes: { type: "string", description: "Free text; matches adders like tight attic, weekend" },
          adderIds: { type: "array", items: { type: "string" }, description: "Force catalog adder ids" },
          equipmentMarginMode: { type: "string", enum: ["bundle", "standalone"], description: "bundle uses ~40% equip margin for full replacement" },
          discountFraction: { type: "number", description: "e.g. 0.2 for 20% off sell" },
          taxRate: { type: "number" },
          margins: {
            type: "object",
            properties: {
              equipmentBundle: { type: "number" },
              equipmentStandalone: { type: "number" },
              labor: { type: "number" },
              adder: { type: "number" },
            },
          },
        },
        required: ["tonnage", "systemKind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_estimate_pdf",
      description:
        "Generate PDF from run_estimator (simple) or run_viktor_estimate (tiered catalog-wired layout).",
      parameters: {
        type: "object",
        properties: {
          estimate: { type: "object", description: "EstimateResult or run_viktor_estimate payload" },
          customerName: { type: "string" },
          address: { type: "string" },
          jobOrEstimateId: { type: "string" },
        },
        required: ["estimate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_inspection_pdf",
      description: "Generate inspection report PDF from findings and recommendations.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          customerName: { type: "string" },
          address: { type: "string" },
          jobOrEstimateId: { type: "string" },
          dateIso: { type: "string" },
          findings: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
          photosNote: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "build_duct_cleaning_pdf",
      description: "Generate duct cleaning completion / scope PDF.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          customerName: { type: "string" },
          address: { type: "string" },
          supplyVents: { type: "integer" },
          returnVents: { type: "integer" },
          mainTrunksCleaned: { type: "boolean" },
          sanitizeApplied: { type: "boolean" },
          beforeAfterNote: { type: "string" },
          technicianNotes: { type: "string" },
        },
      },
    },
  },
];

export function createToolExecutorContext(env: NodeJS.ProcessEnv): ToolExecutorContext {
  const config = tryLoadHousecallProConfig(env);
  return {
    housecallClient: config ? new HousecallProClient(config) : null,
    estimatorRulesPath: env.ESTIMATOR_RULES_PATH?.trim() || undefined,
  };
}
