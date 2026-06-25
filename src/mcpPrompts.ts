import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerMcpPrompts(server: McpServer): void {
  server.registerPrompt(
    "morning-dispatch-briefing",
    {
      title: "Morning Dispatch Briefing",
      description: "Generate a morning operations briefing for today's dispatch board.",
      argsSchema: {
        date: z.string().optional().describe("ISO date for the briefing (defaults to today)"),
      },
    },
    async ({ date }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Prepare a morning dispatch briefing for our Housecall Pro operation.",
              date ? `Focus on ${date}.` : "Focus on today.",
              "",
              "Use Housecall Pro tools and resources to:",
              "1. Read housecall://reference/employees and housecall://reference/company for context.",
              "2. List today's routes with housecall_list_routes.",
              "3. List scheduled and in-progress jobs for today with housecall_list_jobs.",
              "4. List unscheduled jobs that may need attention.",
              "5. Summarize: jobs by technician, gaps in coverage, and recommended dispatch actions.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "estimate-follow-up",
    {
      title: "Estimate Follow-Up",
      description: "Identify open estimates that need customer follow-up.",
      argsSchema: {
        daysOpen: z.number().int().positive().optional().describe("Highlight estimates older than this many days"),
      },
    },
    async ({ daysOpen }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Review our Housecall Pro estimates and recommend follow-up actions.",
              daysOpen ? `Prioritize estimates open longer than ${daysOpen} days.` : "Prioritize stale open estimates first.",
              "",
              "Steps:",
              "1. Use housecall_list_estimates to fetch open/unscheduled estimates.",
              "2. Read housecall://reference/pipeline-statuses for pipeline context.",
              "3. Group by customer and age.",
              "4. Output a follow-up list with suggested next actions (call, email, approve options, convert to job).",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "invoice-aging-report",
    {
      title: "Invoice Aging Report",
      description: "Summarize overdue and unpaid invoices.",
      argsSchema: {
        minDaysOverdue: z.number().int().nonnegative().optional().describe("Minimum days overdue to include"),
      },
    },
    async ({ minDaysOverdue }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Build an invoice aging report from Housecall Pro.",
              minDaysOverdue !== undefined
                ? `Include invoices at least ${minDaysOverdue} days overdue.`
                : "Include all open and pending-payment invoices.",
              "",
              "Steps:",
              "1. Use housecall_list_invoices with status filters for open and pending_payment.",
              "2. Read housecall://reference/api-conventions to interpret amounts in cents.",
              "3. Group by aging buckets (0-30, 31-60, 61-90, 90+ days).",
              "4. Summarize total due by bucket and list top accounts to chase.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "book-service-call",
    {
      title: "Book Service Call",
      description: "Guide booking a new service call end-to-end.",
      argsSchema: {
        customerName: z.string().optional().describe("Customer name if known"),
        serviceDescription: z.string().optional().describe("Brief description of the service needed"),
      },
    },
    async ({ customerName, serviceDescription }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Book a new service call in Housecall Pro.",
              customerName ? `Customer: ${customerName}.` : "Ask for customer details if missing.",
              serviceDescription ? `Service: ${serviceDescription}.` : "Capture service details from the conversation.",
              "",
              "Workflow:",
              "1. Use housecall_find_or_create_customer to resolve the customer.",
              "2. Confirm or create the service address.",
              "3. Use housecall_book_job to create, schedule, and dispatch when details are complete.",
              "4. Confirm the booked job ID, schedule window, and assigned technician(s).",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
