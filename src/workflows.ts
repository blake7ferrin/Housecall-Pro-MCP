import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { HousecallProClient } from "./housecallProClient.js";
import { formatError, runJsonRequest, textResponse, toJson } from "./mcpHelpers.js";

const stringArray = z.array(z.string());
const addressInputSchema = z.object({
  street: z.string().optional(),
  streetLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
});
const customerAddressCreateSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().min(1),
  streetLine2: z.string().optional(),
});
const jobScheduleUpdateSchema = z.object({
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  arrivalWindow: z.number().int().nonnegative().optional(),
  anytime: z.boolean().optional(),
});

type PaginatedListKey =
  | "customers"
  | "jobs"
  | "estimates"
  | "invoices"
  | "leads"
  | "employees"
  | "tags"
  | "lead_sources";

const PAGINATED_LISTS: Record<PaginatedListKey, { path: string; collectionKey: string }> = {
  customers: { path: "/customers", collectionKey: "customers" },
  jobs: { path: "/jobs", collectionKey: "jobs" },
  estimates: { path: "/estimates", collectionKey: "estimates" },
  invoices: { path: "/invoices", collectionKey: "invoices" },
  leads: { path: "/leads", collectionKey: "leads" },
  employees: { path: "/employees", collectionKey: "employees" },
  tags: { path: "/tags", collectionKey: "tags" },
  lead_sources: { path: "/lead_sources", collectionKey: "lead_sources" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mapAddressToApi(address: z.infer<typeof addressInputSchema>) {
  return {
    ...(address.street === undefined ? {} : { street: address.street }),
    ...(address.streetLine2 === undefined ? {} : { street_line_2: address.streetLine2 }),
    ...(address.city === undefined ? {} : { city: address.city }),
    ...(address.state === undefined ? {} : { state: address.state }),
    ...(address.zip === undefined ? {} : { zip: address.zip }),
    ...(address.country === undefined ? {} : { country: address.country }),
  };
}

async function fetchAllPages(
  client: HousecallProClient,
  listKey: PaginatedListKey,
  query: Record<string, unknown> = {},
  maxPages = 10,
  pageSize = 100,
) {
  const { path, collectionKey } = PAGINATED_LISTS[listKey];
  const items: unknown[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const response = await client.get(path, {
      query: {
        ...query,
        page,
        page_size: pageSize,
      },
    });

    if (!isRecord(response)) {
      throw new Error(`Unexpected response while paginating ${listKey}.`);
    }

    const pageItems = response[collectionKey];
    if (Array.isArray(pageItems)) {
      items.push(...pageItems);
    }

    const responseTotalPages = response.total_pages;
    totalPages = typeof responseTotalPages === "number" && responseTotalPages > 0
      ? responseTotalPages
      : page;

    page += 1;
  }

  return {
    list: listKey,
    page_size: pageSize,
    max_pages: maxPages,
    pages_fetched: page - 1,
    total_items: items.length,
    [collectionKey]: items,
  };
}

export function registerWorkflowTools(server: McpServer, client: HousecallProClient): void {
  server.registerTool(
    "housecall_find_or_create_customer",
    {
      title: "Find or Create Housecall Pro Customer",
      description:
        "Search for a customer by query string and return the first match, or create a new customer when no match is found.",
      inputSchema: {
        customerId: z.string().min(1).optional(),
        searchQuery: z.string().min(1).optional(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        email: z.string().email().optional(),
        mobileNumber: z.string().min(3).optional(),
        homeNumber: z.string().min(3).optional(),
        workNumber: z.string().min(3).optional(),
        company: z.string().min(1).optional(),
        notes: z.string().optional(),
        notificationsEnabled: z.boolean().optional(),
        leadSource: z.string().optional(),
        tags: stringArray.optional(),
        addresses: z.array(addressInputSchema).optional(),
      },
    },
    async (input) => {
      if (input.customerId) {
        return runJsonRequest(async () => {
          const customer = await client.getCustomer(input.customerId!);
          return { action: "existing", customer };
        });
      }

      if (input.searchQuery) {
        try {
          const matches = await client.listCustomers({
            q: input.searchQuery,
            page: 1,
            page_size: 10,
          });

          if (isRecord(matches) && Array.isArray(matches.customers) && matches.customers.length > 0) {
            return textResponse(toJson({
              action: "found",
              customer: matches.customers[0],
              matchCount: matches.customers.length,
            }));
          }
        } catch (error) {
          return textResponse(formatError(error), true);
        }
      }

      const identifierPresent = Boolean(
        input.firstName
          ?? input.lastName
          ?? input.email
          ?? input.mobileNumber
          ?? input.homeNumber
          ?? input.workNumber,
      );

      if (!identifierPresent) {
        return textResponse(
          "Provide customerId, searchQuery, or at least one customer identifier (firstName, lastName, email, mobileNumber, homeNumber, workNumber) to create a customer.",
          true,
        );
      }

      return runJsonRequest(async () => {
        const customer = await client.createCustomer({
          ...(input.firstName === undefined ? {} : { first_name: input.firstName }),
          ...(input.lastName === undefined ? {} : { last_name: input.lastName }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.company === undefined ? {} : { company: input.company }),
          ...(input.notificationsEnabled === undefined ? {} : { notifications_enabled: input.notificationsEnabled }),
          ...(input.mobileNumber === undefined ? {} : { mobile_number: input.mobileNumber }),
          ...(input.homeNumber === undefined ? {} : { home_number: input.homeNumber }),
          ...(input.workNumber === undefined ? {} : { work_number: input.workNumber }),
          ...(input.tags === undefined ? {} : { tags: input.tags }),
          ...(input.leadSource === undefined ? {} : { lead_source: input.leadSource }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          ...(input.addresses === undefined
            ? {}
            : { addresses: input.addresses.map(mapAddressToApi) }),
        });

        return { action: "created", customer };
      });
    },
  );

  server.registerTool(
    "housecall_book_job",
    {
      title: "Book Housecall Pro Job",
      description:
        "End-to-end workflow: resolve customer, ensure address, create job, optionally schedule, and optionally dispatch to employees.",
      inputSchema: {
        customerId: z.string().min(1).optional(),
        searchQuery: z.string().min(1).optional(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        email: z.string().email().optional(),
        mobileNumber: z.string().min(3).optional(),
        addressId: z.string().min(1).optional(),
        address: customerAddressCreateSchema.optional(),
        invoiceNumber: z.number().int().positive().optional(),
        assignedEmployeeIds: stringArray.optional(),
        dispatchEmployeeIds: stringArray.optional(),
        lineItems: z.array(z.record(z.string(), z.unknown())).optional(),
        tags: stringArray.optional(),
        leadSource: z.string().optional(),
        notes: z.string().optional(),
        schedule: jobScheduleUpdateSchema.optional(),
      },
    },
    async (input) => runJsonRequest(async () => {
      const steps: Record<string, unknown> = {};

      let customerId = input.customerId;
      if (!customerId) {
        if (input.searchQuery) {
          const matches = await client.listCustomers({
            q: input.searchQuery,
            page: 1,
            page_size: 1,
          });

          if (isRecord(matches) && Array.isArray(matches.customers) && matches.customers[0]) {
            const match = matches.customers[0];
            if (isRecord(match) && typeof match.id === "string") {
              customerId = match.id;
              steps.customer = { action: "found", customerId };
            }
          }
        }

        if (!customerId) {
          const identifierPresent = Boolean(
            input.firstName
              ?? input.lastName
              ?? input.email
              ?? input.mobileNumber,
          );

          if (!identifierPresent) {
            throw new Error("Provide customerId, searchQuery, or enough customer details to find or create a customer.");
          }

          const createdCustomer = await client.createCustomer({
            ...(input.firstName === undefined ? {} : { first_name: input.firstName }),
            ...(input.lastName === undefined ? {} : { last_name: input.lastName }),
            ...(input.email === undefined ? {} : { email: input.email }),
            ...(input.mobileNumber === undefined ? {} : { mobile_number: input.mobileNumber }),
            ...(input.leadSource === undefined ? {} : { lead_source: input.leadSource }),
          });

          if (!isRecord(createdCustomer) || typeof createdCustomer.id !== "string") {
            throw new Error("Created customer response did not include an id.");
          }

          customerId = createdCustomer.id;
          steps.customer = { action: "created", customerId };
        }
      } else {
        steps.customer = { action: "existing", customerId };
      }

      let addressId = input.addressId;
      if (!addressId) {
        if (!input.address) {
          throw new Error("Provide addressId or address when booking a job.");
        }

        const createdAddress = await client.post(`/customers/${customerId}/addresses`, {
          body: {
            street: input.address.street,
            city: input.address.city,
            state: input.address.state,
            zip: input.address.zip,
            country: input.address.country,
            ...(input.address.streetLine2 === undefined ? {} : { street_line_2: input.address.streetLine2 }),
          },
        });

        if (!isRecord(createdAddress) || typeof createdAddress.id !== "string") {
          throw new Error("Created address response did not include an id.");
        }

        addressId = createdAddress.id;
        steps.address = { action: "created", addressId };
      } else {
        steps.address = { action: "existing", addressId };
      }

      const job = await client.createJob({
        customer_id: customerId,
        address_id: addressId,
        ...(input.invoiceNumber === undefined ? {} : { invoice_number: input.invoiceNumber }),
        ...(input.assignedEmployeeIds === undefined ? {} : { assigned_employee_ids: input.assignedEmployeeIds }),
        ...(input.lineItems === undefined ? {} : { line_items: input.lineItems }),
        ...(input.tags === undefined ? {} : { tags: input.tags }),
        ...(input.leadSource === undefined ? {} : { lead_source: input.leadSource }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.schedule === undefined
          ? {}
          : {
            schedule: {
              ...(input.schedule.scheduledStart === undefined ? {} : { scheduled_start: input.schedule.scheduledStart }),
              ...(input.schedule.scheduledEnd === undefined ? {} : { scheduled_end: input.schedule.scheduledEnd }),
              ...(input.schedule.arrivalWindow === undefined ? {} : { arrival_window: input.schedule.arrivalWindow }),
              ...(input.schedule.anytime === undefined ? {} : { anytime: input.schedule.anytime }),
            },
          }),
      });

      if (!isRecord(job) || typeof job.id !== "string") {
        throw new Error("Created job response did not include an id.");
      }

      steps.job = { action: "created", jobId: job.id };

      if (input.schedule) {
        const schedule = await client.put(`/jobs/${job.id}/schedule`, {
          body: {
            ...(input.schedule.scheduledStart === undefined ? {} : { scheduled_start: input.schedule.scheduledStart }),
            ...(input.schedule.scheduledEnd === undefined ? {} : { scheduled_end: input.schedule.scheduledEnd }),
            ...(input.schedule.arrivalWindow === undefined ? {} : { arrival_window: input.schedule.arrivalWindow }),
            ...(input.schedule.anytime === undefined ? {} : { anytime: input.schedule.anytime }),
          },
        });
        steps.schedule = schedule;
      }

      if (input.dispatchEmployeeIds?.length) {
        const dispatch = await client.put(`/jobs/${job.id}/dispatch`, {
          body: { employee_ids: input.dispatchEmployeeIds },
        });
        steps.dispatch = dispatch;
      }

      return {
        success: true,
        jobId: job.id,
        customerId,
        addressId,
        steps,
        job,
      };
    }),
  );

  server.registerTool(
    "housecall_schedule_and_dispatch_job",
    {
      title: "Schedule and Dispatch Housecall Pro Job",
      description: "Update a job schedule and dispatch it to employees in one workflow.",
      inputSchema: {
        jobId: z.string().min(1),
        schedule: jobScheduleUpdateSchema,
        employeeIds: z.array(z.string().min(1)).min(1),
      },
    },
    async ({ jobId, schedule, employeeIds }) => runJsonRequest(async () => {
      const scheduleResult = await client.put(`/jobs/${jobId}/schedule`, {
        body: {
          ...(schedule.scheduledStart === undefined ? {} : { scheduled_start: schedule.scheduledStart }),
          ...(schedule.scheduledEnd === undefined ? {} : { scheduled_end: schedule.scheduledEnd }),
          ...(schedule.arrivalWindow === undefined ? {} : { arrival_window: schedule.arrivalWindow }),
          ...(schedule.anytime === undefined ? {} : { anytime: schedule.anytime }),
        },
      });

      const dispatchResult = await client.put(`/jobs/${jobId}/dispatch`, {
        body: { employee_ids: employeeIds },
      });

      return {
        success: true,
        jobId,
        schedule: scheduleResult,
        dispatch: dispatchResult,
      };
    }),
  );

  server.registerTool(
    "housecall_convert_lead_to_job",
    {
      title: "Convert Housecall Pro Lead to Job",
      description: "Convert a lead to a job and return the conversion result.",
      inputSchema: {
        leadId: z.string().min(1),
      },
    },
    async ({ leadId }) => runJsonRequest(() => client.post("/leads/{id}/convert", {
      pathParams: { id: leadId },
      body: { type: "job" },
    })),
  );

  server.registerTool(
    "housecall_fetch_all_pages",
    {
      title: "Fetch All Pages from Housecall Pro List Endpoint",
      description:
        "Paginate through a list endpoint until all pages are retrieved or maxPages is reached.",
      inputSchema: {
        list: z.enum([
          "customers",
          "jobs",
          "estimates",
          "invoices",
          "leads",
          "employees",
          "tags",
          "lead_sources",
        ]),
        query: z.record(z.string(), z.unknown()).optional(),
        maxPages: z.number().int().positive().max(50).optional(),
        pageSize: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ list, query, maxPages, pageSize }) => runJsonRequest(() => fetchAllPages(
      client,
      list,
      query ?? {},
      maxPages ?? 10,
      pageSize ?? 100,
    )),
  );
}
