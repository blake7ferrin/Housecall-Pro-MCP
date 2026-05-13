import "dotenv/config";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  HousecallProApiError,
  HousecallProClient,
  loadHousecallProConfig,
} from "./housecallProClient.js";
import type { QueryParams } from "./types.js";

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatError(error: unknown): string {
  if (error instanceof HousecallProApiError) {
    return [
      error.message,
      "",
      "Details:",
      toJson(error.details),
    ].join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown error occurred.";
}

function textResponse(text: string, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

async function runJsonRequest(fn: () => Promise<unknown>) {
  try {
    return textResponse(toJson(await fn()));
  } catch (error) {
    return textResponse(formatError(error), true);
  }
}

const looseObject = z.record(z.string(), z.unknown());
const stringArray = z.array(z.string());

const requestQueryRecordSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
);

function validateHousecallRelativePath(path: string): string | null {
  const trimmed = path.trim();
  if (trimmed !== path) {
    return "Path must not have leading or trailing whitespace.";
  }
  if (!trimmed.startsWith("/")) {
    return "Path must start with /.";
  }
  if (trimmed.includes("..")) {
    return "Path must not contain ..";
  }
  if (trimmed.includes("://")) {
    return "Path must be relative to the configured base URL (no URL scheme).";
  }
  if (trimmed.includes("{") || trimmed.includes("}")) {
    return "Path must be fully expanded (no {placeholders}); substitute IDs in the path string.";
  }
  return null;
}

const addressInputSchema = z.object({
  street: z.string().optional(),
  streetLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  latitude: z.union([z.number(), z.string()]).optional(),
  longitude: z.union([z.number(), z.string()]).optional(),
});
const customerAddressCreateSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().min(1),
  streetLine2: z.string().optional(),
  latitude: z.union([z.number(), z.string()]).optional(),
  longitude: z.union([z.number(), z.string()]).optional(),
});
const jobScheduleSchema = z.object({
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  arrivalWindow: z.number().int().nonnegative().optional(),
  anytime: z.boolean().optional(),
  anytimeStartDate: z.string().optional(),
});
const jobFieldsSchema = z.object({
  jobTypeId: z.string().optional(),
  businessUnitId: z.string().optional(),
});
const estimateScheduleSchema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  arrivalWindowInMinutes: z.number().int().nonnegative().optional(),
  notifyCustomer: z.boolean().optional(),
});
const estimateFieldsSchema = z.object({
  jobTypeId: z.string().optional(),
  businessUnitId: z.string().optional(),
});
const leadCustomerSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  notificationsEnabled: z.boolean().optional(),
  mobileNumber: z.string().optional(),
  company: z.string().optional(),
  homeNumber: z.string().optional(),
  workNumber: z.string().optional(),
  leadSource: z.string().optional(),
  notes: z.string().optional(),
  tags: stringArray.optional(),
  addresses: z.array(addressInputSchema).optional(),
});

export function buildMcpServer(): McpServer {
  const config = loadHousecallProConfig();
  const client = new HousecallProClient(config);

  const server = new McpServer({
    name: "housecall-pro-mcp",
    version: "0.4.0",
  });

  server.registerTool(
    "housecall_list_customers",
    {
      title: "List Housecall Pro Customers",
      description: "List customers from Housecall Pro using the documented GET /customers parameters.",
      inputSchema: {
        q: z.string().min(1).optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.enum(["created_at"]).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        locationIds: stringArray.optional(),
        expand: z.array(z.enum(["attachments", "do_not_service"])).optional(),
      },
    },
    async (input) => runJsonRequest(() => client.listCustomers({
      q: input.q,
      page: input.page,
      page_size: input.pageSize,
      sort_by: input.sortBy,
      sort_direction: input.sortDirection,
      location_ids: input.locationIds,
      expand: input.expand,
    })),
  );

  server.registerTool(
    "housecall_get_customer",
    {
      title: "Get Housecall Pro Customer",
      description: "Fetch one customer by Housecall Pro customer ID.",
      inputSchema: {
        customerId: z.string().min(1),
        expand: z.array(z.enum(["attachments", "do_not_service"])).optional(),
      },
    },
    async ({ customerId, expand }) => runJsonRequest(() => client.get("/customers/{customerId}", {
      pathParams: { customerId },
      query: { expand },
    })),
  );

  server.registerTool(
    "housecall_create_customer",
    {
      title: "Create Housecall Pro Customer",
      description: "Create a customer in Housecall Pro using the documented POST /customers contract.",
      inputSchema: {
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
      const identifierPresent = Boolean(
        input.firstName ??
          input.lastName ??
          input.email ??
          input.mobileNumber ??
          input.homeNumber ??
          input.workNumber,
      );

      if (!identifierPresent) {
        return textResponse(
          "Housecall Pro requires at least one of firstName, lastName, email, mobileNumber, homeNumber, or workNumber when creating a customer.",
          true,
        );
      }

      return runJsonRequest(() => client.createCustomer({
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
          : {
            addresses: input.addresses.map((address) => ({
              ...(address.street === undefined ? {} : { street: address.street }),
              ...(address.streetLine2 === undefined ? {} : { street_line_2: address.streetLine2 }),
              ...(address.city === undefined ? {} : { city: address.city }),
              ...(address.state === undefined ? {} : { state: address.state }),
              ...(address.zip === undefined ? {} : { zip: address.zip }),
              ...(address.country === undefined ? {} : { country: address.country }),
              ...(address.latitude === undefined ? {} : { latitude: address.latitude }),
              ...(address.longitude === undefined ? {} : { longitude: address.longitude }),
            })),
          }),
      }));
    },
  );

  server.registerTool(
    "housecall_update_customer",
    {
      title: "Update Housecall Pro Customer",
      description: "Update a customer in Housecall Pro using the documented PUT /customers/{customer_id} contract.",
      inputSchema: {
        customerId: z.string().min(1),
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
      },
    },
    async ({ customerId, ...input }) => runJsonRequest(() => client.updateCustomer(customerId, {
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
    })),
  );

  server.registerTool(
    "housecall_list_customer_addresses",
    {
      title: "List Housecall Pro Customer Addresses",
      description: "List a customer's addresses using GET /customers/{customer_id}/addresses.",
      inputSchema: {
        customerId: z.string().min(1),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.enum(["created_at", "updated_at"]).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      },
    },
    async ({ customerId, page, pageSize, sortBy, sortDirection }) => runJsonRequest(() => client.get("/customers/{customerId}/addresses", {
      pathParams: { customerId },
      query: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_direction: sortDirection,
      },
    })),
  );

  server.registerTool(
    "housecall_get_customer_address",
    {
      title: "Get Housecall Pro Customer Address",
      description: "Fetch a single customer address by customer and address ID.",
      inputSchema: {
        customerId: z.string().min(1),
        addressId: z.string().min(1),
      },
    },
    async ({ customerId, addressId }) => runJsonRequest(() => client.get("/customers/{customerId}/addresses/{addressId}", {
      pathParams: { customerId, addressId },
    })),
  );

  server.registerTool(
    "housecall_create_customer_address",
    {
      title: "Create Housecall Pro Customer Address",
      description: "Create an address for a customer using POST /customers/{customer_id}/addresses.",
      inputSchema: {
        customerId: z.string().min(1),
        address: customerAddressCreateSchema,
      },
    },
    async ({ customerId, address }) => runJsonRequest(() => client.post("/customers/{customerId}/addresses", {
      pathParams: { customerId },
      body: {
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: address.country,
        ...(address.streetLine2 === undefined ? {} : { street_line_2: address.streetLine2 }),
        ...(address.latitude === undefined ? {} : { latitude: address.latitude }),
        ...(address.longitude === undefined ? {} : { longitude: address.longitude }),
      },
    })),
  );

  server.registerTool(
    "housecall_update_customer_address",
    {
      title: "Update Housecall Pro Customer Address",
      description: "Update a customer address using PUT /customers/{customer_id}/addresses/{address_id}.",
      inputSchema: {
        customerId: z.string().min(1),
        addressId: z.string().min(1),
        address: customerAddressCreateSchema,
      },
    },
    async ({ customerId, addressId, address }) => runJsonRequest(() => client.put("/customers/{customerId}/addresses/{addressId}", {
      pathParams: { customerId, addressId },
      body: {
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: address.country,
        ...(address.streetLine2 === undefined ? {} : { street_line_2: address.streetLine2 }),
        ...(address.latitude === undefined ? {} : { latitude: address.latitude }),
        ...(address.longitude === undefined ? {} : { longitude: address.longitude }),
      },
    })),
  );

  server.registerTool(
    "housecall_delete_customer_address",
    {
      title: "Delete Housecall Pro Customer Address",
      description: "Delete a customer address using DELETE /customers/{customer_id}/addresses/{address_id}.",
      inputSchema: {
        customerId: z.string().min(1),
        addressId: z.string().min(1),
      },
    },
    async ({ customerId, addressId }) => runJsonRequest(() => client.delete("/customers/{customerId}/addresses/{addressId}", {
      pathParams: { customerId, addressId },
    })),
  );

  server.registerTool(
    "housecall_list_jobs",
    {
      title: "List Housecall Pro Jobs",
      description: "List jobs from Housecall Pro using the documented GET /jobs parameters.",
      inputSchema: {
        scheduledStartMin: z.string().optional(),
        scheduledStartMax: z.string().optional(),
        scheduledEndMin: z.string().optional(),
        scheduledEndMax: z.string().optional(),
        employeeIds: stringArray.optional(),
        customerId: z.string().min(1).optional(),
        page: z.number().int().positive().optional(),
        workStatus: z.array(z.enum(["unscheduled", "scheduled", "in_progress", "completed", "canceled"])).optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        locationIds: stringArray.optional(),
        expand: z.array(z.enum(["attachments", "appointments"])).optional(),
        sortBy: z.enum(["created_at", "updated_at", "invoice_number", "id", "description", "work_status"]).optional(),
      },
    },
    async (input) => runJsonRequest(() => client.listJobs({
      scheduled_start_min: input.scheduledStartMin,
      scheduled_start_max: input.scheduledStartMax,
      scheduled_end_min: input.scheduledEndMin,
      scheduled_end_max: input.scheduledEndMax,
      employee_ids: input.employeeIds,
      customer_id: input.customerId,
      page: input.page,
      work_status: input.workStatus,
      page_size: input.pageSize,
      sort_direction: input.sortDirection,
      location_ids: input.locationIds,
      expand: input.expand,
      sort_by: input.sortBy,
    })),
  );

  server.registerTool(
    "housecall_create_job",
    {
      title: "Create Housecall Pro Job",
      description: "Create a job in Housecall Pro using the documented JobCreate contract from the OpenAPI file.",
      inputSchema: {
        customerId: z.string().min(1),
        addressId: z.string().min(1),
        invoiceNumber: z.number().int().positive().optional(),
        schedule: jobScheduleSchema.optional(),
        assignedEmployeeIds: stringArray.optional(),
        lineItems: z.array(looseObject).optional(),
        tags: stringArray.optional(),
        leadSource: z.string().optional(),
        notes: z.string().optional(),
        jobFields: jobFieldsSchema.optional(),
        custom: looseObject.optional(),
      },
    },
    async (input) => {
      const { custom, schedule, jobFields, ...rest } = input;

      return runJsonRequest(() => client.createJob({
        customer_id: rest.customerId,
        address_id: rest.addressId,
        ...(rest.invoiceNumber === undefined ? {} : { invoice_number: rest.invoiceNumber }),
        ...(rest.assignedEmployeeIds === undefined ? {} : { assigned_employee_ids: rest.assignedEmployeeIds }),
        ...(rest.lineItems === undefined ? {} : { line_items: rest.lineItems }),
        ...(rest.tags === undefined ? {} : { tags: rest.tags }),
        ...(rest.leadSource === undefined ? {} : { lead_source: rest.leadSource }),
        ...(rest.notes === undefined ? {} : { notes: rest.notes }),
        ...(schedule === undefined
          ? {}
          : {
            schedule: {
              ...(schedule.scheduledStart === undefined ? {} : { scheduled_start: schedule.scheduledStart }),
              ...(schedule.scheduledEnd === undefined ? {} : { scheduled_end: schedule.scheduledEnd }),
              ...(schedule.arrivalWindow === undefined ? {} : { arrival_window: schedule.arrivalWindow }),
              ...(schedule.anytime === undefined ? {} : { anytime: schedule.anytime }),
              ...(schedule.anytimeStartDate === undefined ? {} : { anytime_start_date: schedule.anytimeStartDate }),
            },
          }),
        ...(jobFields === undefined
          ? {}
          : {
            job_fields: {
              ...(jobFields.jobTypeId === undefined ? {} : { job_type_id: jobFields.jobTypeId }),
              ...(jobFields.businessUnitId === undefined ? {} : { business_unit_id: jobFields.businessUnitId }),
            },
          }),
        ...(custom ?? {}),
      }));
    },
  );

  server.registerTool(
    "housecall_get_job",
    {
      title: "Get Housecall Pro Job",
      description: "Fetch one job by Housecall Pro job ID. Optional expand matches GET /jobs query parameters.",
      inputSchema: {
        jobId: z.string().min(1),
        expand: z.array(z.enum(["attachments", "appointments"])).optional(),
      },
    },
    async ({ jobId, expand }) => runJsonRequest(() => client.getJob(jobId, expand === undefined ? {} : { expand })),
  );

  server.registerTool(
    "housecall_lock_jobs",
    {
      title: "Lock Housecall Pro Jobs",
      description: "Lock completed or scheduled jobs by time range using POST /jobs/lock.",
      inputSchema: {
        startingAt: z.string().datetime(),
        endingAt: z.string().datetime(),
      },
    },
    async ({ startingAt, endingAt }) => runJsonRequest(() => client.post("/jobs/lock", {
      body: {
        starting_at: startingAt,
        ending_at: endingAt,
      },
    })),
  );

  server.registerTool(
    "housecall_lock_job",
    {
      title: "Lock Single Housecall Pro Job",
      description: "Lock one job by ID using POST /jobs/{job_id}/lock.",
      inputSchema: {
        jobId: z.string().min(1),
      },
    },
    async ({ jobId }) => runJsonRequest(() => client.post("/jobs/{jobId}/lock", {
      pathParams: { jobId },
    })),
  );

  server.registerTool(
    "housecall_list_job_line_items",
    {
      title: "List Housecall Pro Job Line Items",
      description: "List line items for a job using GET /jobs/{job_id}/line_items.",
      inputSchema: {
        jobId: z.string().min(1),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ jobId, page, pageSize }) => runJsonRequest(() => client.get("/jobs/{job_id}/line_items", {
      pathParams: { job_id: jobId },
      query: {
        page,
        page_size: pageSize,
      },
    })),
  );

  server.registerTool(
    "housecall_add_job_line_item",
    {
      title: "Add Housecall Pro Job Line Item",
      description: "Add a line item to a job using POST /jobs/{job_id}/line_items. Use custom for fields not covered by the typed schema.",
      inputSchema: {
        jobId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        unitPrice: z.number().optional(),
        quantity: z.number().optional(),
        custom: looseObject.optional(),
      },
    },
    async ({ jobId, name, description, unitPrice, quantity, custom }) => runJsonRequest(() => client.post("/jobs/{job_id}/line_items", {
      pathParams: { job_id: jobId },
      body: {
        name,
        ...(description === undefined ? {} : { description }),
        ...(unitPrice === undefined ? {} : { unit_price: unitPrice }),
        ...(quantity === undefined ? {} : { quantity }),
        ...(custom ?? {}),
      },
    })),
  );

  server.registerTool(
    "housecall_bulk_update_job_line_items",
    {
      title: "Bulk Update Housecall Pro Job Line Items",
      description: "Replace or bulk-update job line items using PUT /jobs/{job_id}/line_items/bulk_update.",
      inputSchema: {
        jobId: z.string().min(1),
        lineItems: z.array(looseObject).min(1),
      },
    },
    async ({ jobId, lineItems }) => runJsonRequest(() => client.put("/jobs/{job_id}/line_items/bulk_update", {
      pathParams: { job_id: jobId },
      body: {
        line_items: lineItems,
      },
    })),
  );

  server.registerTool(
    "housecall_update_job_schedule",
    {
      title: "Update Housecall Pro Job Schedule",
      description: "Update a job's schedule using PUT /jobs/{job_id}/schedule.",
      inputSchema: {
        jobId: z.string().min(1),
        startTime: z.string().min(1),
        endTime: z.string().optional(),
        arrivalWindowInMinutes: z.number().int().nonnegative().optional(),
        notify: z.boolean().optional(),
        notifyPro: z.boolean().optional(),
        dispatchedEmployees: z.array(z.object({
          employeeId: z.string().optional(),
        })).optional(),
        custom: looseObject.optional(),
      },
    },
    async ({
      jobId,
      startTime,
      endTime,
      arrivalWindowInMinutes,
      notify,
      notifyPro,
      dispatchedEmployees,
      custom,
    }) => runJsonRequest(() => client.put("/jobs/{job_id}/schedule", {
      pathParams: { job_id: jobId },
      body: {
        start_time: startTime,
        ...(endTime === undefined ? {} : { end_time: endTime }),
        ...(arrivalWindowInMinutes === undefined ? {} : { arrival_window_in_minutes: arrivalWindowInMinutes }),
        ...(notify === undefined ? {} : { notify }),
        ...(notifyPro === undefined ? {} : { notify_pro: notifyPro }),
        ...(dispatchedEmployees === undefined
          ? {}
          : {
            dispatched_employees: dispatchedEmployees.map((row) => ({
              ...(row.employeeId === undefined ? {} : { employee_id: row.employeeId }),
            })),
          }),
        ...(custom ?? {}),
      },
    })),
  );

  server.registerTool(
    "housecall_delete_job_schedule",
    {
      title: "Delete Housecall Pro Job Schedule",
      description: "Clear a job's schedule using DELETE /jobs/{job_id}/schedule.",
      inputSchema: {
        jobId: z.string().min(1),
      },
    },
    async ({ jobId }) => runJsonRequest(() => client.delete("/jobs/{job_id}/schedule", {
      pathParams: { job_id: jobId },
    })),
  );

  server.registerTool(
    "housecall_dispatch_job",
    {
      title: "Dispatch Housecall Pro Job",
      description: "Dispatch a job to employees using PUT /jobs/{job_id}/dispatch.",
      inputSchema: {
        jobId: z.string().min(1),
        dispatchedEmployees: z.array(z.object({
          employeeId: z.string().min(1),
        })).min(1),
      },
    },
    async ({ jobId, dispatchedEmployees }) => runJsonRequest(() => client.put("/jobs/{job_id}/dispatch", {
      pathParams: { job_id: jobId },
      body: {
        dispatched_employees: dispatchedEmployees.map((row) => ({
          employee_id: row.employeeId,
        })),
      },
    })),
  );

  server.registerTool(
    "housecall_add_job_attachment",
    {
      title: "Add Housecall Pro Job Attachment",
      description: "Attach a file to a job by URL using POST /jobs/{job_id}/attachments.",
      inputSchema: {
        jobId: z.string().min(1),
        fileUrl: z.string().url(),
      },
    },
    async ({ jobId, fileUrl }) => runJsonRequest(() => client.post("/jobs/{job_id}/attachments", {
      pathParams: { job_id: jobId },
      body: {
        file_url: fileUrl,
      },
    })),
  );

  server.registerTool(
    "housecall_add_job_tag",
    {
      title: "Add Housecall Pro Job Tag",
      description: "Associate a tag with a job using POST /jobs/{job_id}/tags.",
      inputSchema: {
        jobId: z.string().min(1),
        tagId: z.string().min(1),
      },
    },
    async ({ jobId, tagId }) => runJsonRequest(() => client.post("/jobs/{job_id}/tags", {
      pathParams: { job_id: jobId },
      body: {
        tag_id: tagId,
      },
    })),
  );

  server.registerTool(
    "housecall_remove_job_tag",
    {
      title: "Remove Housecall Pro Job Tag",
      description: "Remove a tag from a job using DELETE /jobs/{job_id}/tags/{tag_id}.",
      inputSchema: {
        jobId: z.string().min(1),
        tagId: z.string().min(1),
      },
    },
    async ({ jobId, tagId }) => runJsonRequest(() => client.delete("/jobs/{job_id}/tags/{tag_id}", {
      pathParams: { job_id: jobId, tag_id: tagId },
    })),
  );

  server.registerTool(
    "housecall_add_job_note",
    {
      title: "Add Housecall Pro Job Note",
      description: "Add a note to a job using POST /jobs/{job_id}/notes.",
      inputSchema: {
        jobId: z.string().min(1),
        content: z.string().min(1),
      },
    },
    async ({ jobId, content }) => runJsonRequest(() => client.post("/jobs/{job_id}/notes", {
      pathParams: { job_id: jobId },
      body: {
        content,
      },
    })),
  );

  server.registerTool(
    "housecall_delete_job_note",
    {
      title: "Delete Housecall Pro Job Note",
      description: "Delete a job note using DELETE /jobs/{job_id}/notes/{note_id}.",
      inputSchema: {
        jobId: z.string().min(1),
        noteId: z.string().min(1),
      },
    },
    async ({ jobId, noteId }) => runJsonRequest(() => client.delete("/jobs/{job_id}/notes/{note_id}", {
      pathParams: { job_id: jobId, note_id: noteId },
    })),
  );

  server.registerTool(
    "housecall_create_job_link",
    {
      title: "Create Housecall Pro Job Link",
      description: "Add a named URL link to a job using POST /jobs/{job_id}/links.",
      inputSchema: {
        jobId: z.string().min(1),
        name: z.string().min(1),
        url: z.string().url(),
        custom: looseObject.optional(),
      },
    },
    async ({ jobId, name, url, custom }) => runJsonRequest(() => client.post("/jobs/{job_id}/links", {
      pathParams: { job_id: jobId },
      body: {
        name,
        url,
        ...(custom ?? {}),
      },
    })),
  );

  server.registerTool(
    "housecall_list_estimates",
    {
      title: "List Housecall Pro Estimates",
      description: "List estimates from Housecall Pro using GET /estimates with optional filters (aligned with job list filters where applicable).",
      inputSchema: {
        scheduledStartMin: z.string().optional(),
        scheduledStartMax: z.string().optional(),
        scheduledEndMin: z.string().optional(),
        scheduledEndMax: z.string().optional(),
        employeeIds: stringArray.optional(),
        customerId: z.string().min(1).optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        workStatus: z.union([
          z.string().min(1),
          z.array(z.enum(["unscheduled", "scheduled", "in_progress", "completed", "canceled"])),
        ]).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        locationIds: stringArray.optional(),
        expand: z.array(z.enum(["attachments", "appointments"])).optional(),
        sortBy: z.enum(["created_at", "updated_at", "invoice_number", "id", "description", "work_status"]).optional(),
      },
    },
    async (input) => runJsonRequest(() => client.listEstimates({
      scheduled_start_min: input.scheduledStartMin,
      scheduled_start_max: input.scheduledStartMax,
      scheduled_end_min: input.scheduledEndMin,
      scheduled_end_max: input.scheduledEndMax,
      employee_ids: input.employeeIds,
      customer_id: input.customerId,
      page: input.page,
      page_size: input.pageSize,
      work_status: input.workStatus,
      sort_direction: input.sortDirection,
      location_ids: input.locationIds,
      expand: input.expand,
      sort_by: input.sortBy,
    })),
  );

  server.registerTool(
    "housecall_create_estimate",
    {
      title: "Create Housecall Pro Estimate",
      description: "Create an estimate in Housecall Pro using the documented POST /estimates contract.",
      inputSchema: {
        estimateNumber: z.number().int().positive().optional(),
        note: z.string().optional(),
        message: z.string().optional(),
        customerId: z.string().min(1).optional(),
        assignedEmployeeIds: stringArray.optional(),
        addressId: z.string().min(1).optional(),
        leadSource: z.string().optional(),
        address: z.object({
          street: z.string().optional(),
          streetLine2: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zip: z.string().optional(),
        }).optional(),
        options: z.array(z.object({
          name: z.string().optional(),
          tags: stringArray.optional(),
          lineItems: z.array(looseObject).optional(),
          tax: z.object({
            taxable: z.boolean().optional(),
            taxRate: z.number().optional(),
            taxName: z.string().optional(),
          }).optional(),
        })).optional(),
        schedule: estimateScheduleSchema.optional(),
        estimateFields: estimateFieldsSchema.optional(),
        custom: looseObject.optional(),
      },
    },
    async (input) => {
      const {
        estimateNumber,
        customerId,
        assignedEmployeeIds,
        addressId,
        leadSource,
        address,
        options,
        schedule,
        estimateFields,
        custom,
        ...rest
      } = input;

      return runJsonRequest(() => client.createEstimate({
        ...rest,
        ...(estimateNumber === undefined ? {} : { estimate_number: estimateNumber }),
        ...(customerId === undefined ? {} : { customer_id: customerId }),
        ...(assignedEmployeeIds === undefined ? {} : { assigned_employee_ids: assignedEmployeeIds }),
        ...(addressId === undefined ? {} : { address_id: addressId }),
        ...(leadSource === undefined ? {} : { lead_source: leadSource }),
        ...(address === undefined
          ? {}
          : {
            address: {
              ...(address.street === undefined ? {} : { street: address.street }),
              ...(address.streetLine2 === undefined ? {} : { street_line_2: address.streetLine2 }),
              ...(address.city === undefined ? {} : { city: address.city }),
              ...(address.state === undefined ? {} : { state: address.state }),
              ...(address.zip === undefined ? {} : { zip: address.zip }),
            },
          }),
        ...(options === undefined
          ? {}
          : {
            options: options.map((option) => ({
              ...(option.name === undefined ? {} : { name: option.name }),
              ...(option.tags === undefined ? {} : { tags: option.tags }),
              ...(option.lineItems === undefined ? {} : { line_items: option.lineItems }),
              ...(option.tax === undefined
                ? {}
                : {
                  tax: {
                    ...(option.tax.taxable === undefined ? {} : { taxable: option.tax.taxable }),
                    ...(option.tax.taxRate === undefined ? {} : { tax_rate: option.tax.taxRate }),
                    ...(option.tax.taxName === undefined ? {} : { tax_name: option.tax.taxName }),
                  },
                }),
            })),
          }),
        ...(schedule === undefined
          ? {}
          : {
            schedule: {
              ...(schedule.startTime === undefined ? {} : { start_time: schedule.startTime }),
              ...(schedule.endTime === undefined ? {} : { end_time: schedule.endTime }),
              ...(schedule.arrivalWindowInMinutes === undefined ? {} : { arrival_window_in_minutes: schedule.arrivalWindowInMinutes }),
              ...(schedule.notifyCustomer === undefined ? {} : { notify_customer: schedule.notifyCustomer }),
            },
          }),
        ...(estimateFields === undefined
          ? {}
          : {
            estimate_fields: {
              ...(estimateFields.jobTypeId === undefined ? {} : { job_type_id: estimateFields.jobTypeId }),
              ...(estimateFields.businessUnitId === undefined ? {} : { business_unit_id: estimateFields.businessUnitId }),
            },
          }),
        ...(custom ?? {}),
      }));
    },
  );

  server.registerTool(
    "housecall_get_estimate",
    {
      title: "Get Housecall Pro Estimate",
      description: "Fetch one estimate by Housecall Pro estimate ID. Optional expand matches GET /estimates query parameters.",
      inputSchema: {
        estimateId: z.string().min(1),
        expand: z.array(z.enum(["attachments", "appointments"])).optional(),
      },
    },
    async ({ estimateId, expand }) => runJsonRequest(() => client.getEstimate(estimateId, expand === undefined ? {} : { expand })),
  );

  server.registerTool(
    "housecall_decline_estimate_options",
    {
      title: "Decline Housecall Pro Estimate Options",
      description: "Decline estimate options using POST /estimates/options/decline.",
      inputSchema: {
        optionIds: z.array(z.string().min(1)).min(1),
      },
    },
    async ({ optionIds }) => runJsonRequest(() => client.post("/estimates/options/decline", {
      body: {
        option_ids: optionIds,
      },
    })),
  );

  server.registerTool(
    "housecall_approve_estimate_options",
    {
      title: "Approve Housecall Pro Estimate Options",
      description: "Approve estimate options using POST /estimates/options/approve.",
      inputSchema: {
        optionIds: z.array(z.string().min(1)).min(1),
      },
    },
    async ({ optionIds }) => runJsonRequest(() => client.post("/estimates/options/approve", {
      body: {
        option_ids: optionIds,
      },
    })),
  );

  server.registerTool(
    "housecall_list_invoices",
    {
      title: "List Housecall Pro Invoices",
      description: "List invoices from Housecall Pro using the documented GET /invoices parameters.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        status: z.string().optional(),
        customerUuid: z.string().optional(),
        createdAtMin: z.string().optional(),
        createdAtMax: z.string().optional(),
        dueAtMin: z.string().optional(),
        dueAtMax: z.string().optional(),
        paidAtMin: z.string().optional(),
        paidAtMax: z.string().optional(),
        amountDueMin: z.number().optional(),
        amountDueMax: z.number().optional(),
        paymentMethod: z.string().optional(),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      },
    },
    async (input) => runJsonRequest(() => client.listInvoices({
      page: input.page,
      page_size: input.pageSize,
      status: input.status,
      customer_uuid: input.customerUuid,
      created_at_min: input.createdAtMin,
      created_at_max: input.createdAtMax,
      due_at_min: input.dueAtMin,
      due_at_max: input.dueAtMax,
      paid_at_min: input.paidAtMin,
      paid_at_max: input.paidAtMax,
      amount_due_min: input.amountDueMin,
      amount_due_max: input.amountDueMax,
      payment_method: input.paymentMethod,
      sort_by: input.sortBy,
      sort_direction: input.sortDirection,
    })),
  );

  server.registerTool(
    "housecall_get_invoice",
    {
      title: "Get Housecall Pro Invoice",
      description: "Fetch one invoice by UUID using GET /api/invoices/{uuid}.",
      inputSchema: {
        invoiceId: z.string().min(1),
      },
    },
    async ({ invoiceId }) => runJsonRequest(() => client.getInvoice(invoiceId)),
  );

  server.registerTool(
    "housecall_get_invoice_preview",
    {
      title: "Get Housecall Pro Invoice Preview",
      description: "Fetch invoice preview HTML using GET /api/invoices/{uuid}/preview.",
      inputSchema: {
        invoiceId: z.string().min(1),
      },
    },
    async ({ invoiceId }) => runJsonRequest(() => client.get("/api/invoices/{uuid}/preview", {
      pathParams: { uuid: invoiceId },
    })),
  );

  server.registerTool(
    "housecall_get_job_invoices",
    {
      title: "Get Housecall Pro Job Invoices",
      description: "List all invoices for a job using GET /jobs/{job_id}/invoices.",
      inputSchema: {
        jobId: z.string().min(1),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ jobId, page, pageSize }) => runJsonRequest(() => client.getJobInvoices(jobId, {
      page,
      page_size: pageSize,
    })),
  );

  server.registerTool(
    "housecall_list_payments",
    {
      title: "List Housecall Pro Payments",
      description: "List payments using GET /payments (or tenant-specific payments index). Filter fields follow API snake_case in query mapping.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        customerUuid: z.string().optional(),
        invoiceUuid: z.string().optional(),
        jobUuid: z.string().optional(),
        status: z.string().optional(),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      },
    },
    async (input) => runJsonRequest(() => client.get("/payments", {
      query: {
        page: input.page,
        page_size: input.pageSize,
        customer_uuid: input.customerUuid,
        invoice_uuid: input.invoiceUuid,
        job_uuid: input.jobUuid,
        status: input.status,
        sort_by: input.sortBy,
        sort_direction: input.sortDirection,
      },
    })),
  );

  server.registerTool(
    "housecall_get_payment",
    {
      title: "Get Housecall Pro Payment",
      description: "Fetch one payment using GET /payments/{id}.",
      inputSchema: {
        paymentId: z.string().min(1),
      },
    },
    async ({ paymentId }) => runJsonRequest(() => client.get("/payments/{id}", {
      pathParams: { id: paymentId },
    })),
  );

  server.registerTool(
    "housecall_create_payment",
    {
      title: "Create Housecall Pro Payment",
      description: "Record a payment using POST /payments. Supply the JSON body using API field names (snake_case).",
      inputSchema: {
        body: looseObject,
      },
    },
    async ({ body }) => runJsonRequest(() => client.post("/payments", { body })),
  );

  server.registerTool(
    "housecall_send_invoice",
    {
      title: "Send Housecall Pro Invoice",
      description: "Trigger sending an invoice (for example by email) using POST /api/invoices/{uuid}/send when your tenant supports it.",
      inputSchema: {
        invoiceId: z.string().min(1),
        body: looseObject.optional(),
      },
    },
    async ({ invoiceId, body }) => runJsonRequest(() => client.post("/api/invoices/{uuid}/send", {
      pathParams: { uuid: invoiceId },
      body: body ?? {},
    })),
  );

  server.registerTool(
    "housecall_get_application",
    {
      title: "Get Housecall Pro Application",
      description: "Fetch application metadata for the current company using GET /application.",
      inputSchema: {},
    },
    async () => runJsonRequest(() => client.get("/application")),
  );

  server.registerTool(
    "housecall_enable_application",
    {
      title: "Enable Housecall Pro Application",
      description: "Enable the current application for the company using POST /application/enable.",
      inputSchema: {},
    },
    async () => runJsonRequest(() => client.post("/application/enable")),
  );

  server.registerTool(
    "housecall_disable_application",
    {
      title: "Disable Housecall Pro Application",
      description: "Disable the current application for the company using POST /application/disable.",
      inputSchema: {},
    },
    async () => runJsonRequest(() => client.post("/application/disable")),
  );

  server.registerTool(
    "housecall_list_checklists",
    {
      title: "List Housecall Pro Checklists",
      description: "List checklists for jobs or estimates using GET /checklists.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().max(200).optional(),
        jobUuids: stringArray.optional(),
        estimateUuids: stringArray.optional(),
      },
    },
    async ({ page, perPage, jobUuids, estimateUuids }) => {
      if (!jobUuids?.length && !estimateUuids?.length) {
        return textResponse("Provide at least one jobUuid or estimateUuid to list checklists.", true);
      }

      return runJsonRequest(() => client.get("/checklists", {
        query: {
          page,
          per_page: perPage,
          job_uuids: jobUuids,
          estimate_uuids: estimateUuids,
        },
      }));
    },
  );

  server.registerTool(
    "housecall_list_employees",
    {
      title: "List Housecall Pro Employees",
      description: "List employees from Housecall Pro using GET /employees.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        locationIds: stringArray.optional(),
      },
    },
    async (input) => runJsonRequest(() => client.get("/employees", {
      query: {
        page: input.page,
        page_size: input.pageSize,
        sort_by: input.sortBy,
        sort_direction: input.sortDirection,
        location_ids: input.locationIds,
      },
    })),
  );

  server.registerTool(
    "housecall_get_employee",
    {
      title: "Get Housecall Pro Employee",
      description: "Fetch one employee by ID using GET /employees/{id}.",
      inputSchema: {
        employeeId: z.string().min(1),
      },
    },
    async ({ employeeId }) => runJsonRequest(() => client.get("/employees/{id}", {
      pathParams: { id: employeeId },
    })),
  );

  server.registerTool(
    "housecall_create_webhook_subscription",
    {
      title: "Create Housecall Pro Webhook Subscription",
      description: "Create a webhook subscription using POST /webhooks/subscription.",
      inputSchema: {
        payload: looseObject,
      },
    },
    async ({ payload }) => runJsonRequest(() => client.post("/webhooks/subscription", { body: payload })),
  );

  server.registerTool(
    "housecall_delete_webhook_subscription",
    {
      title: "Delete Housecall Pro Webhook Subscription",
      description: "Delete a webhook subscription using DELETE /webhooks/subscription.",
      inputSchema: {
        payload: looseObject.optional(),
      },
    },
    async ({ payload }) => runJsonRequest(() => client.delete("/webhooks/subscription", {
      ...(payload === undefined ? {} : { body: payload }),
    })),
  );

  server.registerTool(
    "housecall_get_company",
    {
      title: "Get Housecall Pro Company",
      description: "Fetch general company information using GET /company.",
      inputSchema: {},
    },
    async () => runJsonRequest(() => client.get("/company")),
  );

  server.registerTool(
    "housecall_get_schedule_availability",
    {
      title: "Get Housecall Pro Schedule Availability",
      description: "Fetch company schedule availability using GET /company/schedule_availability.",
      inputSchema: {},
    },
    async () => runJsonRequest(() => client.get("/company/schedule_availability")),
  );

  server.registerTool(
    "housecall_update_schedule_availability",
    {
      title: "Update Housecall Pro Schedule Availability",
      description: "Update company schedule windows using PUT /company/schedule_availability.",
      inputSchema: {
        availabilityBufferInDays: z.number().int().nonnegative().optional(),
        dailyScheduleWindows: z.array(z.object({
          dayName: z.string(),
          scheduleWindows: z.array(z.object({
            startTime: z.string(),
            endTime: z.string(),
          })),
        })).optional(),
        custom: looseObject.optional(),
      },
    },
    async ({ availabilityBufferInDays, dailyScheduleWindows, custom }) => runJsonRequest(() => client.put("/company/schedule_availability", {
      body: {
        ...(availabilityBufferInDays === undefined ? {} : { availability_buffer_in_days: availabilityBufferInDays }),
        ...(dailyScheduleWindows === undefined
          ? {}
          : {
            daily_schedule_windows: dailyScheduleWindows.map((day) => ({
              day_name: day.dayName,
              schedule_windows: day.scheduleWindows.map((window) => ({
                start_time: window.startTime,
                end_time: window.endTime,
              })),
            })),
          }),
        ...(custom ?? {}),
      },
    })),
  );

  server.registerTool(
    "housecall_get_booking_windows",
    {
      title: "Get Housecall Pro Booking Windows",
      description: "Fetch online-booking windows using GET /company/schedule_availability/booking_windows.",
      inputSchema: {
        showForDays: z.number().int().positive().optional(),
        startDate: z.string().optional(),
        serviceId: z.string().optional(),
        serviceDuration: z.number().int().positive().optional(),
        priceFormId: z.string().optional(),
        employeeIds: stringArray.optional(),
      },
    },
    async (input) => runJsonRequest(() => client.get("/company/schedule_availability/booking_windows", {
      query: {
        show_for_days: input.showForDays,
        start_date: input.startDate,
        service_id: input.serviceId,
        service_duration: input.serviceDuration,
        price_form_id: input.priceFormId,
        employee_ids: input.employeeIds,
      },
    })),
  );

  server.registerTool(
    "housecall_list_events",
    {
      title: "List Housecall Pro Events",
      description: "List company events using GET /events.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.enum(["name", "note", "created_at", "updated_at", "street", "street_line_2", "city", "state", "zip"]).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        locationIds: stringArray.optional(),
      },
    },
    async ({ page, pageSize, sortBy, sortDirection, locationIds }) => runJsonRequest(() => client.get("/events", {
      query: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_direction: sortDirection,
        location_ids: locationIds,
      },
    })),
  );

  server.registerTool(
    "housecall_list_tags",
    {
      title: "List Housecall Pro Tags",
      description: "List tags using GET /tags.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.enum(["created_at", "name"]).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      },
    },
    async ({ page, pageSize, sortBy, sortDirection }) => runJsonRequest(() => client.get("/tags", {
      query: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_direction: sortDirection,
      },
    })),
  );

  server.registerTool(
    "housecall_create_tag",
    {
      title: "Create Housecall Pro Tag",
      description: "Create a tag using POST /tags.",
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async ({ name }) => runJsonRequest(() => client.post("/tags", { body: { name } })),
  );

  server.registerTool(
    "housecall_update_tag",
    {
      title: "Update Housecall Pro Tag",
      description: "Update a tag using PUT /tags/{tag_id}.",
      inputSchema: {
        tagId: z.string().min(1),
        name: z.string().min(1),
      },
    },
    async ({ tagId, name }) => runJsonRequest(() => client.put("/tags/{tagId}", {
      pathParams: { tagId },
      body: { name },
    })),
  );

  server.registerTool(
    "housecall_list_leads",
    {
      title: "List Housecall Pro Leads",
      description: "List leads from Housecall Pro using GET /leads.",
      inputSchema: {
        employeeIds: stringArray.optional(),
        customerId: z.string().optional(),
        page: z.number().int().positive().optional(),
        status: z.enum(["lost", "open", "won"]).optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        tagIds: stringArray.optional(),
        leadSource: stringArray.optional(),
        locationIds: stringArray.optional(),
        sortBy: z.enum(["created_at", "updated_at", "id", "status"]).optional(),
      },
    },
    async (input) => runJsonRequest(() => client.get("/leads", {
      query: {
        employee_ids: input.employeeIds,
        customer_id: input.customerId,
        page: input.page,
        status: input.status,
        page_size: input.pageSize,
        sort_direction: input.sortDirection,
        tag_ids: input.tagIds,
        lead_source: input.leadSource,
        location_ids: input.locationIds,
        sort_by: input.sortBy,
      },
    })),
  );

  server.registerTool(
    "housecall_get_lead",
    {
      title: "Get Housecall Pro Lead",
      description: "Fetch one lead by Housecall Pro ID using GET /leads/{id}.",
      inputSchema: {
        leadId: z.string().min(1),
      },
    },
    async ({ leadId }) => runJsonRequest(() => client.get("/leads/{id}", {
      pathParams: { id: leadId },
    })),
  );

  server.registerTool(
    "housecall_create_lead",
    {
      title: "Create Housecall Pro Lead",
      description: "Create a lead in Housecall Pro using the documented LeadCreate schema from the OpenAPI file.",
      inputSchema: {
        customerId: z.string().optional(),
        customer: leadCustomerSchema.optional(),
        assignedEmployeeId: z.string().optional(),
        addressId: z.string().optional(),
        address: addressInputSchema.optional(),
        leadSource: z.string().optional(),
        lineItems: z.array(looseObject).optional(),
        note: z.string().optional(),
        tags: stringArray.optional(),
        taxName: z.string().optional(),
        taxRate: z.number().optional(),
        custom: looseObject.optional(),
      },
    },
    async (input) => {
      if (!input.customerId && !input.customer) {
        return textResponse("Housecall Pro requires either customerId or customer when creating a lead.", true);
      }

      return runJsonRequest(() => client.createLead({
        ...(input.customerId === undefined ? {} : { customer_id: input.customerId }),
        ...(input.customer === undefined
          ? {}
          : {
            customer: {
              ...(input.customer.firstName === undefined ? {} : { first_name: input.customer.firstName }),
              ...(input.customer.lastName === undefined ? {} : { last_name: input.customer.lastName }),
              ...(input.customer.email === undefined ? {} : { email: input.customer.email }),
              ...(input.customer.notificationsEnabled === undefined ? {} : { notifications_enabled: input.customer.notificationsEnabled }),
              ...(input.customer.mobileNumber === undefined ? {} : { mobile_number: input.customer.mobileNumber }),
              ...(input.customer.company === undefined ? {} : { company: input.customer.company }),
              ...(input.customer.homeNumber === undefined ? {} : { home_number: input.customer.homeNumber }),
              ...(input.customer.workNumber === undefined ? {} : { work_number: input.customer.workNumber }),
              ...(input.customer.leadSource === undefined ? {} : { lead_source: input.customer.leadSource }),
              ...(input.customer.notes === undefined ? {} : { notes: input.customer.notes }),
              ...(input.customer.tags === undefined ? {} : { tags: input.customer.tags }),
              ...(input.customer.addresses === undefined
                ? {}
                : {
                  addresses: input.customer.addresses.map((address) => ({
                    ...(address.street === undefined ? {} : { street: address.street }),
                    ...(address.streetLine2 === undefined ? {} : { street_line_2: address.streetLine2 }),
                    ...(address.city === undefined ? {} : { city: address.city }),
                    ...(address.state === undefined ? {} : { state: address.state }),
                    ...(address.zip === undefined ? {} : { zip: address.zip }),
                    ...(address.country === undefined ? {} : { country: address.country }),
                  })),
                }),
            },
          }),
        ...(input.assignedEmployeeId === undefined ? {} : { assigned_employee_id: input.assignedEmployeeId }),
        ...(input.addressId === undefined ? {} : { address_id: input.addressId }),
        ...(input.address === undefined
          ? {}
          : {
            address: {
              ...(input.address.street === undefined ? {} : { street: input.address.street }),
              ...(input.address.streetLine2 === undefined ? {} : { street_line_2: input.address.streetLine2 }),
              ...(input.address.city === undefined ? {} : { city: input.address.city }),
              ...(input.address.state === undefined ? {} : { state: input.address.state }),
              ...(input.address.zip === undefined ? {} : { zip: input.address.zip }),
              ...(input.address.country === undefined ? {} : { country: input.address.country }),
            },
          }),
        ...(input.leadSource === undefined ? {} : { lead_source: input.leadSource }),
        ...(input.lineItems === undefined ? {} : { line_items: input.lineItems }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.tags === undefined ? {} : { tags: input.tags }),
        ...(input.taxName === undefined ? {} : { tax_name: input.taxName }),
        ...(input.taxRate === undefined ? {} : { tax_rate: input.taxRate }),
        ...(input.custom ?? {}),
      }));
    },
  );

  server.registerTool(
    "housecall_convert_lead",
    {
      title: "Convert Housecall Pro Lead",
      description: "Convert a lead into an estimate or job using POST /leads/{id}/convert.",
      inputSchema: {
        leadId: z.string().min(1),
        type: z.enum(["estimate", "job"]),
      },
    },
    async ({ leadId, type }) => runJsonRequest(() => client.post("/leads/{id}/convert", {
      pathParams: { id: leadId },
      body: { type },
    })),
  );

  server.registerTool(
    "housecall_list_lead_line_items",
    {
      title: "List Housecall Pro Lead Line Items",
      description: "List line items for a lead using GET /leads/{lead_id}/line_items.",
      inputSchema: {
        leadId: z.string().min(1),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ leadId, page, pageSize }) => runJsonRequest(() => client.get("/leads/{lead_id}/line_items", {
      pathParams: { lead_id: leadId },
      query: {
        page,
        page_size: pageSize,
      },
    })),
  );

  server.registerTool(
    "housecall_list_lead_sources",
    {
      title: "List Housecall Pro Lead Sources",
      description: "List lead sources using GET /lead_sources.",
      inputSchema: {
        q: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      },
    },
    async ({ q, page, pageSize, sortDirection }) => runJsonRequest(() => client.get("/lead_sources", {
      query: {
        q,
        page,
        page_size: pageSize,
        sort_direction: sortDirection,
      },
    })),
  );

  server.registerTool(
    "housecall_create_lead_source",
    {
      title: "Create Housecall Pro Lead Source",
      description: "Create a lead source using POST /lead_sources.",
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async ({ name }) => runJsonRequest(() => client.post("/lead_sources", { body: { name } })),
  );

  server.registerTool(
    "housecall_update_lead_source",
    {
      title: "Update Housecall Pro Lead Source",
      description: "Update a lead source using PUT /lead_sources/{lead_source_id}.",
      inputSchema: {
        leadSourceId: z.string().min(1),
        name: z.string().min(1),
      },
    },
    async ({ leadSourceId, name }) => runJsonRequest(() => client.put("/lead_sources/{lead_source_id}", {
      pathParams: { lead_source_id: leadSourceId },
      body: { name },
    })),
  );

  server.registerTool(
    "housecall_list_job_types",
    {
      title: "List Housecall Pro Job Types",
      description: "List job types using GET /job_fields/job_types.",
      inputSchema: {
        name: z.string().optional(),
      },
    },
    async ({ name }) => runJsonRequest(() => client.get("/job_fields/job_types", {
      query: { name },
    })),
  );

  server.registerTool(
    "housecall_create_job_type",
    {
      title: "Create Housecall Pro Job Type",
      description: "Create a job type using POST /job_fields/job_types.",
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async ({ name }) => runJsonRequest(() => client.post("/job_fields/job_types", { body: { name } })),
  );

  server.registerTool(
    "housecall_update_job_type",
    {
      title: "Update Housecall Pro Job Type",
      description: "Update a job type using PUT /job_fields/job_types/{job_type_id}.",
      inputSchema: {
        jobTypeId: z.string().min(1),
        name: z.string().min(1),
      },
    },
    async ({ jobTypeId, name }) => runJsonRequest(() => client.put("/job_fields/job_types/{job_type_id}", {
      pathParams: { job_type_id: jobTypeId },
      body: { name },
    })),
  );

  server.registerTool(
    "housecall_list_business_units",
    {
      title: "List Housecall Pro Business Units",
      description: "List business units (job field) using GET /job_fields/business_units.",
      inputSchema: {
        name: z.string().optional(),
      },
    },
    async ({ name }) => runJsonRequest(() => client.get("/job_fields/business_units", {
      query: { name },
    })),
  );

  server.registerTool(
    "housecall_create_business_unit",
    {
      title: "Create Housecall Pro Business Unit",
      description: "Create a business unit using POST /job_fields/business_units.",
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async ({ name }) => runJsonRequest(() => client.post("/job_fields/business_units", { body: { name } })),
  );

  server.registerTool(
    "housecall_update_business_unit",
    {
      title: "Update Housecall Pro Business Unit",
      description: "Update a business unit using PUT /job_fields/business_units/{business_unit_id}.",
      inputSchema: {
        businessUnitId: z.string().min(1),
        name: z.string().min(1),
      },
    },
    async ({ businessUnitId, name }) => runJsonRequest(() => client.put("/job_fields/business_units/{business_unit_id}", {
      pathParams: { business_unit_id: businessUnitId },
      body: { name },
    })),
  );

  server.registerTool(
    "housecall_list_materials",
    {
      title: "List Housecall Pro Price Book Materials",
      description: "List materials from the price book using GET /api/price_book/materials.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        q: z.string().optional(),
      },
    },
    async ({ page, pageSize, sortBy, sortDirection, q }) => runJsonRequest(() => client.get("/api/price_book/materials", {
      query: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_direction: sortDirection,
        q,
      },
    })),
  );

  server.registerTool(
    "housecall_list_material_categories",
    {
      title: "List Housecall Pro Material Categories",
      description: "List price book material categories using GET /api/price_book/material_categories.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        q: z.string().optional(),
      },
    },
    async ({ page, pageSize, sortBy, sortDirection, q }) => runJsonRequest(() => client.get("/api/price_book/material_categories", {
      query: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_direction: sortDirection,
        q,
      },
    })),
  );

  server.registerTool(
    "housecall_list_price_forms",
    {
      title: "List Housecall Pro Price Forms",
      description: "List price forms using GET /api/price_book/price_forms.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        q: z.string().optional(),
      },
    },
    async ({ page, pageSize, sortBy, sortDirection, q }) => runJsonRequest(() => client.get("/api/price_book/price_forms", {
      query: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_direction: sortDirection,
        q,
      },
    })),
  );

  server.registerTool(
    "housecall_list_price_book_services",
    {
      title: "List Housecall Pro Price Book Services",
      description: "List price book services using GET /api/price_book/services.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
        q: z.string().optional(),
      },
    },
    async ({ page, pageSize, sortBy, sortDirection, q }) => runJsonRequest(() => client.get("/api/price_book/services", {
      query: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_direction: sortDirection,
        q,
      },
    })),
  );

  server.registerTool(
    "housecall_list_service_zones",
    {
      title: "List Housecall Pro Service Zones",
      description: "List service zones using GET /service_zones.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        zipCode: z.string().optional(),
        address: z.string().optional(),
      },
    },
    async ({ page, pageSize, zipCode, address }) => runJsonRequest(() => client.get("/service_zones", {
      query: {
        page,
        page_size: pageSize,
        zip_code: zipCode,
        address,
      },
    })),
  );

  server.registerTool(
    "housecall_list_routes",
    {
      title: "List Housecall Pro Routes",
      description: "List routes for a date using GET /routes.",
      inputSchema: {
        date: z.string().optional(),
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ date, page, perPage }) => runJsonRequest(() => client.get("/routes", {
      query: {
        date,
        page,
        per_page: perPage,
      },
    })),
  );

  server.registerTool(
    "housecall_list_pipeline_statuses",
    {
      title: "List Housecall Pro Pipeline Statuses",
      description: "List pipeline statuses for leads, jobs, or estimates using GET /pipeline/statuses.",
      inputSchema: {
        resourceType: z.enum(["lead", "job", "estimate"]),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ resourceType, page, pageSize }) => runJsonRequest(() => client.get("/pipeline/statuses", {
      query: {
        resource_type: resourceType,
        page,
        page_size: pageSize,
      },
    })),
  );

  server.registerTool(
    "housecall_update_pipeline_status",
    {
      title: "Update Housecall Pro Pipeline Status",
      description: "Move a lead, job, or estimate to a pipeline status using PUT /pipeline/statuses.",
      inputSchema: {
        resourceType: z.enum(["lead", "job", "estimate"]),
        resourceId: z.string().min(1),
        statusId: z.string().min(1),
      },
    },
    async ({ resourceType, resourceId, statusId }) => runJsonRequest(() => client.put("/pipeline/statuses", {
      body: {
        resource_type: resourceType,
        resource_id: resourceId,
        status_id: statusId,
      },
    })),
  );

  server.registerTool(
    "housecall_patch_customer",
    {
      title: "Patch Housecall Pro Customer",
      description: "Partially update a customer using PATCH on the configured customer path (RFC-style partial update).",
      inputSchema: {
        customerId: z.string().min(1),
        body: looseObject,
      },
    },
    async ({ customerId, body }) => runJsonRequest(() => client.patchCustomer(customerId, body)),
  );

  server.registerTool(
    "housecall_patch_job",
    {
      title: "Patch Housecall Pro Job",
      description: "Partially update a job using PATCH on the configured job path.",
      inputSchema: {
        jobId: z.string().min(1),
        body: looseObject,
      },
    },
    async ({ jobId, body }) => runJsonRequest(() => client.patchJob(jobId, body)),
  );

  server.registerTool(
    "housecall_patch_estimate",
    {
      title: "Patch Housecall Pro Estimate",
      description: "Partially update an estimate using PATCH on the configured estimate path.",
      inputSchema: {
        estimateId: z.string().min(1),
        body: looseObject,
      },
    },
    async ({ estimateId, body }) => runJsonRequest(() => client.patchEstimate(estimateId, body)),
  );

  server.registerTool(
    "housecall_patch_lead",
    {
      title: "Patch Housecall Pro Lead",
      description: "Partially update a lead using PATCH under the configured leads base path.",
      inputSchema: {
        leadId: z.string().min(1),
        body: looseObject,
      },
    },
    async ({ leadId, body }) => runJsonRequest(() => client.patchLead(leadId, body)),
  );

  server.registerTool(
    "housecall_delete_customer",
    {
      title: "Delete Housecall Pro Customer",
      description: "Delete a customer using DELETE on the configured customer path. Many tenants restrict this operation.",
      inputSchema: {
        customerId: z.string().min(1),
      },
    },
    async ({ customerId }) => runJsonRequest(() => client.deleteCustomer(customerId)),
  );

  server.registerTool(
    "housecall_delete_job",
    {
      title: "Delete Housecall Pro Job",
      description: "Delete a job using DELETE on the configured job path. Availability depends on company permissions and API version.",
      inputSchema: {
        jobId: z.string().min(1),
      },
    },
    async ({ jobId }) => runJsonRequest(() => client.deleteJob(jobId)),
  );

  server.registerTool(
    "housecall_delete_estimate",
    {
      title: "Delete Housecall Pro Estimate",
      description: "Delete an estimate using DELETE on the configured estimate path. Availability depends on company permissions.",
      inputSchema: {
        estimateId: z.string().min(1),
      },
    },
    async ({ estimateId }) => runJsonRequest(() => client.deleteEstimate(estimateId)),
  );

  server.registerTool(
    "housecall_delete_lead",
    {
      title: "Delete Housecall Pro Lead",
      description: "Delete a lead using DELETE under the configured leads base path.",
      inputSchema: {
        leadId: z.string().min(1),
      },
    },
    async ({ leadId }) => runJsonRequest(() => client.deleteLead(leadId)),
  );

  server.registerTool(
    "housecall_list_job_input_materials",
    {
      title: "List Housecall Pro Job Input Materials",
      description: "List input materials for a job using GET /jobs/{job_id}/job_input_materials.",
      inputSchema: {
        jobId: z.string().min(1),
      },
    },
    async ({ jobId }) => runJsonRequest(() => client.get("/jobs/{job_id}/job_input_materials", {
      pathParams: { job_id: jobId },
    })),
  );

  server.registerTool(
    "housecall_bulk_update_job_input_materials",
    {
      title: "Bulk Update Housecall Pro Job Input Materials",
      description: "Bulk-update job input materials using PUT /jobs/{job_id}/job_input_materials/bulk_update.",
      inputSchema: {
        jobId: z.string().min(1),
        jobInputMaterials: z.array(looseObject).min(1),
      },
    },
    async ({ jobId, jobInputMaterials }) => runJsonRequest(() => client.put("/jobs/{job_id}/job_input_materials/bulk_update", {
      pathParams: { job_id: jobId },
      body: {
        job_input_materials: jobInputMaterials,
      },
    })),
  );

  server.registerTool(
    "housecall_list_job_appointments",
    {
      title: "List Housecall Pro Job Appointments",
      description: "List appointments for a job using GET /jobs/{job_id}/appointments.",
      inputSchema: {
        jobId: z.string().min(1),
      },
    },
    async ({ jobId }) => runJsonRequest(() => client.get("/jobs/{job_id}/appointments", {
      pathParams: { job_id: jobId },
    })),
  );

  server.registerTool(
    "housecall_get_event",
    {
      title: "Get Housecall Pro Event",
      description: "Fetch a single company event using GET /events/{id}.",
      inputSchema: {
        eventId: z.string().min(1),
      },
    },
    async ({ eventId }) => runJsonRequest(() => client.get("/events/{id}", {
      pathParams: { id: eventId },
    })),
  );

  server.registerTool(
    "housecall_delete_tag",
    {
      title: "Delete Housecall Pro Tag",
      description: "Delete a tag using DELETE /tags/{tag_id}.",
      inputSchema: {
        tagId: z.string().min(1),
      },
    },
    async ({ tagId }) => runJsonRequest(() => client.delete("/tags/{tagId}", {
      pathParams: { tagId },
    })),
  );

  server.registerTool(
    "housecall_get_price_book_material",
    {
      title: "Get Housecall Pro Price Book Material",
      description: "Fetch one price book material using GET /api/price_book/materials/{id}.",
      inputSchema: {
        materialId: z.string().min(1),
      },
    },
    async ({ materialId }) => runJsonRequest(() => client.get("/api/price_book/materials/{id}", {
      pathParams: { id: materialId },
    })),
  );

  server.registerTool(
    "housecall_create_price_book_material",
    {
      title: "Create Housecall Pro Price Book Material",
      description: "Create a price book material using POST /api/price_book/materials. Use body fields in API snake_case; merge custom for additional properties.",
      inputSchema: {
        name: z.string().min(1),
        custom: looseObject.optional(),
      },
    },
    async ({ name, custom }) => runJsonRequest(() => client.post("/api/price_book/materials", {
      body: {
        name,
        ...(custom ?? {}),
      },
    })),
  );

  server.registerTool(
    "housecall_update_price_book_material",
    {
      title: "Update Housecall Pro Price Book Material",
      description: "Update a price book material using PUT /api/price_book/materials/{id}. Body uses API field names (snake_case); include custom for extra keys.",
      inputSchema: {
        materialId: z.string().min(1),
        body: looseObject,
      },
    },
    async ({ materialId, body }) => runJsonRequest(() => client.put("/api/price_book/materials/{id}", {
      pathParams: { id: materialId },
      body,
    })),
  );

  server.registerTool(
    "housecall_delete_price_book_material",
    {
      title: "Delete Housecall Pro Price Book Material",
      description: "Delete a price book material using DELETE /api/price_book/materials/{id}.",
      inputSchema: {
        materialId: z.string().min(1),
      },
    },
    async ({ materialId }) => runJsonRequest(() => client.delete("/api/price_book/materials/{id}", {
      pathParams: { id: materialId },
    })),
  );

  server.registerTool(
    "housecall_get_price_book_service",
    {
      title: "Get Housecall Pro Price Book Service",
      description: "Fetch one price book service using GET /api/price_book/services/{id}.",
      inputSchema: {
        serviceId: z.string().min(1),
      },
    },
    async ({ serviceId }) => runJsonRequest(() => client.get("/api/price_book/services/{id}", {
      pathParams: { id: serviceId },
    })),
  );

  server.registerTool(
    "housecall_create_price_book_service",
    {
      title: "Create Housecall Pro Price Book Service",
      description: "Create a price book service using POST /api/price_book/services.",
      inputSchema: {
        name: z.string().min(1),
        custom: looseObject.optional(),
      },
    },
    async ({ name, custom }) => runJsonRequest(() => client.post("/api/price_book/services", {
      body: {
        name,
        ...(custom ?? {}),
      },
    })),
  );

  server.registerTool(
    "housecall_update_price_book_service",
    {
      title: "Update Housecall Pro Price Book Service",
      description: "Update a price book service using PUT /api/price_book/services/{id}.",
      inputSchema: {
        serviceId: z.string().min(1),
        body: looseObject,
      },
    },
    async ({ serviceId, body }) => runJsonRequest(() => client.put("/api/price_book/services/{id}", {
      pathParams: { id: serviceId },
      body,
    })),
  );

  server.registerTool(
    "housecall_delete_price_book_service",
    {
      title: "Delete Housecall Pro Price Book Service",
      description: "Delete a price book service using DELETE /api/price_book/services/{id}.",
      inputSchema: {
        serviceId: z.string().min(1),
      },
    },
    async ({ serviceId }) => runJsonRequest(() => client.delete("/api/price_book/services/{id}", {
      pathParams: { id: serviceId },
    })),
  );

  server.registerTool(
    "housecall_get_material_category",
    {
      title: "Get Housecall Pro Material Category",
      description: "Fetch one material category using GET /api/price_book/material_categories/{id}.",
      inputSchema: {
        categoryId: z.string().min(1),
      },
    },
    async ({ categoryId }) => runJsonRequest(() => client.get("/api/price_book/material_categories/{id}", {
      pathParams: { id: categoryId },
    })),
  );

  server.registerTool(
    "housecall_get_price_form",
    {
      title: "Get Housecall Pro Price Form",
      description: "Fetch one price form using GET /api/price_book/price_forms/{id}.",
      inputSchema: {
        priceFormId: z.string().min(1),
      },
    },
    async ({ priceFormId }) => runJsonRequest(() => client.get("/api/price_book/price_forms/{id}", {
      pathParams: { id: priceFormId },
    })),
  );

  server.registerTool(
    "housecall_list_estimate_line_items",
    {
      title: "List Housecall Pro Estimate Line Items",
      description: "List line items for an estimate using GET /estimates/{estimate_id}/line_items.",
      inputSchema: {
        estimateId: z.string().min(1),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ estimateId, page, pageSize }) => runJsonRequest(() => client.get("/estimates/{estimate_id}/line_items", {
      pathParams: { estimate_id: estimateId },
      query: {
        page,
        page_size: pageSize,
      },
    })),
  );

  server.registerTool(
    "housecall_add_estimate_line_item",
    {
      title: "Add Housecall Pro Estimate Line Item",
      description: "Add a line item to an estimate using POST /estimates/{estimate_id}/line_items.",
      inputSchema: {
        estimateId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        unitPrice: z.number().optional(),
        quantity: z.number().optional(),
        custom: looseObject.optional(),
      },
    },
    async ({ estimateId, name, description, unitPrice, quantity, custom }) => runJsonRequest(() => client.post("/estimates/{estimate_id}/line_items", {
      pathParams: { estimate_id: estimateId },
      body: {
        name,
        ...(description === undefined ? {} : { description }),
        ...(unitPrice === undefined ? {} : { unit_price: unitPrice }),
        ...(quantity === undefined ? {} : { quantity }),
        ...(custom ?? {}),
      },
    })),
  );

  server.registerTool(
    "housecall_bulk_update_estimate_line_items",
    {
      title: "Bulk Update Housecall Pro Estimate Line Items",
      description: "Bulk-update estimate line items using PUT /estimates/{estimate_id}/line_items/bulk_update.",
      inputSchema: {
        estimateId: z.string().min(1),
        lineItems: z.array(looseObject).min(1),
      },
    },
    async ({ estimateId, lineItems }) => runJsonRequest(() => client.put("/estimates/{estimate_id}/line_items/bulk_update", {
      pathParams: { estimate_id: estimateId },
      body: {
        line_items: lineItems,
      },
    })),
  );

  server.registerTool(
    "housecall_list_locations",
    {
      title: "List Housecall Pro Locations",
      description: "List company locations (multi-location) using GET /locations.",
      inputSchema: {
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(200).optional(),
        sortBy: z.string().optional(),
        sortDirection: z.enum(["asc", "desc"]).optional(),
      },
    },
    async ({ page, pageSize, sortBy, sortDirection }) => runJsonRequest(() => client.get("/locations", {
      query: {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_direction: sortDirection,
      },
    })),
  );

  server.registerTool(
    "housecall_get_location",
    {
      title: "Get Housecall Pro Location",
      description: "Fetch one location using GET /locations/{id}.",
      inputSchema: {
        locationId: z.string().min(1),
      },
    },
    async ({ locationId }) => runJsonRequest(() => client.get("/locations/{id}", {
      pathParams: { id: locationId },
    })),
  );

  server.registerTool(
    "housecall_get_webhook_subscription",
    {
      title: "Get Housecall Pro Webhook Subscription",
      description: "Fetch the current webhook subscription using GET /webhooks/subscription when supported by the tenant API.",
      inputSchema: {},
    },
    async () => runJsonRequest(() => client.get("/webhooks/subscription")),
  );

  server.registerTool(
    "housecall_request",
    {
      title: "Housecall Pro Raw API Request",
      description:
        "Call any Housecall Pro API path relative to the configured base URL. Path must be fully expanded (no {placeholders}). Use typed tools first; this is an escape hatch for undocumented or new routes.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().min(1),
        query: requestQueryRecordSchema.optional(),
        body: looseObject.optional(),
      },
    },
    async ({ method, path, query, body }) => {
      const pathError = validateHousecallRelativePath(path);
      if (pathError) {
        return textResponse(pathError, true);
      }

      const queryParams = query as QueryParams | undefined;

      switch (method) {
        case "GET":
          return runJsonRequest(() => client.get(path, { query: queryParams }));
        case "POST":
          return runJsonRequest(() => client.post(path, { query: queryParams, body }));
        case "PUT":
          return runJsonRequest(() => client.put(path, { query: queryParams, body }));
        case "PATCH":
          return runJsonRequest(() => client.patch(path, { query: queryParams, body }));
        case "DELETE":
          return runJsonRequest(() => client.delete(path, { query: queryParams, body }));
        default: {
          const exhaustive: never = method;
          return textResponse(`Unsupported method: ${String(exhaustive)}`, true);
        }
      }
    },
  );

  return server;
}

