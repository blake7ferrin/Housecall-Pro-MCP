import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { HousecallProClient } from "./housecallProClient.js";
import { runJsonRequest } from "./mcpHelpers.js";

const estimateLineItemKindSchema = z.enum([
  "service",
  "part",
  "labor",
  "discount",
  "percent discount",
]);

const estimateOptionLineItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  unitPrice: z.number().optional(),
  quantity: z.number().optional(),
  kind: estimateLineItemKindSchema.optional(),
});

const estimateOptionScheduleSchema = z.object({
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  arrivalWindow: z.number().int().nonnegative().optional(),
});

const priceFormFieldSchema = z.object({
  label: z.string().min(1),
  type: z.string().min(1),
  options: z.array(z.string()).optional(),
});

const materialBodySchema = z.object({
  name: z.string().min(1),
  unitCost: z.number().int(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
});

function mapMaterialBody(body: z.infer<typeof materialBodySchema>) {
  return {
    name: body.name,
    unit_cost: body.unitCost,
    ...(body.description === undefined ? {} : { description: body.description }),
    ...(body.categoryId === undefined ? {} : { category_id: body.categoryId }),
  };
}

function mapEstimateOptionLineItems(lineItems: z.infer<typeof estimateOptionLineItemSchema>[]) {
  return lineItems.map((item) => ({
    ...(item.id === undefined ? {} : { id: item.id }),
    ...(item.name === undefined ? {} : { name: item.name }),
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.unitPrice === undefined ? {} : { unit_price: item.unitPrice }),
    ...(item.quantity === undefined ? {} : { quantity: item.quantity }),
    ...(item.kind === undefined ? {} : { kind: item.kind }),
  }));
}

function mapPriceFormFields(fields: z.infer<typeof priceFormFieldSchema>[]) {
  return fields.map((field) => ({
    label: field.label,
    type: field.type,
    ...(field.options === undefined ? {} : { options: field.options }),
  }));
}

export function registerPriceBookAndEstimateTools(server: McpServer, client: HousecallProClient): void {
  server.registerTool(
    "housecall_create_material",
    {
      title: "Create Housecall Pro Price Book Material",
      description: "Create a price book material using POST /api/price_book/materials. Amounts are in cents.",
      inputSchema: {
        material: materialBodySchema,
      },
    },
    async ({ material }) => runJsonRequest(() => client.post("/api/price_book/materials", {
      body: mapMaterialBody(material),
    })),
  );

  server.registerTool(
    "housecall_update_material",
    {
      title: "Update Housecall Pro Price Book Material",
      description: "Update a price book material using PUT /api/price_book/materials/{material_id}.",
      inputSchema: {
        materialId: z.string().min(1),
        material: materialBodySchema,
      },
    },
    async ({ materialId, material }) => runJsonRequest(() => client.put("/api/price_book/materials/{material_id}", {
      pathParams: { material_id: materialId },
      body: mapMaterialBody(material),
    })),
  );

  server.registerTool(
    "housecall_delete_material",
    {
      title: "Delete Housecall Pro Price Book Material",
      description: "Delete a price book material using DELETE /api/price_book/materials/{material_id}.",
      inputSchema: {
        materialId: z.string().min(1),
      },
    },
    async ({ materialId }) => runJsonRequest(() => client.delete("/api/price_book/materials/{material_id}", {
      pathParams: { material_id: materialId },
    })),
  );

  server.registerTool(
    "housecall_create_material_category",
    {
      title: "Create Housecall Pro Material Category",
      description: "Create a material category using POST /api/price_book/material_categories.",
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async ({ name }) => runJsonRequest(() => client.post("/api/price_book/material_categories", {
      body: { name },
    })),
  );

  server.registerTool(
    "housecall_update_material_category",
    {
      title: "Update Housecall Pro Material Category",
      description: "Update a material category using PUT /api/price_book/material_categories/{category_id}.",
      inputSchema: {
        categoryId: z.string().min(1),
        name: z.string().min(1),
      },
    },
    async ({ categoryId, name }) => runJsonRequest(() => client.put("/api/price_book/material_categories/{category_id}", {
      pathParams: { category_id: categoryId },
      body: { name },
    })),
  );

  server.registerTool(
    "housecall_delete_material_category",
    {
      title: "Delete Housecall Pro Material Category",
      description: "Delete a material category using DELETE /api/price_book/material_categories/{category_id}.",
      inputSchema: {
        categoryId: z.string().min(1),
      },
    },
    async ({ categoryId }) => runJsonRequest(() => client.delete("/api/price_book/material_categories/{category_id}", {
      pathParams: { category_id: categoryId },
    })),
  );

  server.registerTool(
    "housecall_get_price_form",
    {
      title: "Get Housecall Pro Price Form",
      description: "Fetch a single price form using GET /api/price_book/price_forms/{uuid}.",
      inputSchema: {
        priceFormId: z.string().min(1),
      },
    },
    async ({ priceFormId }) => runJsonRequest(() => client.get("/api/price_book/price_forms/{uuid}", {
      pathParams: { uuid: priceFormId },
    })),
  );

  server.registerTool(
    "housecall_create_price_form",
    {
      title: "Create Housecall Pro Price Form",
      description: "Create a price form using POST /api/price_book/price_forms.",
      inputSchema: {
        name: z.string().min(1),
        fields: z.array(priceFormFieldSchema).min(1),
      },
    },
    async ({ name, fields }) => runJsonRequest(() => client.post("/api/price_book/price_forms", {
      body: {
        name,
        fields: mapPriceFormFields(fields),
      },
    })),
  );

  server.registerTool(
    "housecall_update_price_form",
    {
      title: "Update Housecall Pro Price Form",
      description: "Update a price form using PUT /api/price_book/price_forms/{uuid}.",
      inputSchema: {
        priceFormId: z.string().min(1),
        name: z.string().min(1),
        fields: z.array(priceFormFieldSchema).min(1),
      },
    },
    async ({ priceFormId, name, fields }) => runJsonRequest(() => client.put("/api/price_book/price_forms/{uuid}", {
      pathParams: { uuid: priceFormId },
      body: {
        name,
        fields: mapPriceFormFields(fields),
      },
    })),
  );

  server.registerTool(
    "housecall_delete_price_form",
    {
      title: "Delete Housecall Pro Price Form",
      description: "Delete a price form using DELETE /api/price_book/price_forms/{uuid}.",
      inputSchema: {
        priceFormId: z.string().min(1),
      },
    },
    async ({ priceFormId }) => runJsonRequest(() => client.delete("/api/price_book/price_forms/{uuid}", {
      pathParams: { uuid: priceFormId },
    })),
  );

  server.registerTool(
    "housecall_create_estimate_option",
    {
      title: "Create Housecall Pro Estimate Option",
      description: "Create a new estimate option using POST /estimates/{estimate_id}/options.",
      inputSchema: {
        estimateId: z.string().min(1),
        name: z.string().min(1),
        messageFromPro: z.string().optional(),
      },
    },
    async ({ estimateId, name, messageFromPro }) => runJsonRequest(() => client.post("/estimates/{estimate_id}/options", {
      pathParams: { estimate_id: estimateId },
      body: {
        name,
        ...(messageFromPro === undefined ? {} : { message_from_pro: messageFromPro }),
      },
    })),
  );

  server.registerTool(
    "housecall_list_estimate_option_line_items",
    {
      title: "List Housecall Pro Estimate Option Line Items",
      description: "List line items for an estimate option using GET /estimates/{estimate_id}/options/{option_id}/line_items.",
      inputSchema: {
        estimateId: z.string().min(1),
        optionId: z.string().min(1),
      },
    },
    async ({ estimateId, optionId }) => runJsonRequest(() => client.get("/estimates/{estimate_id}/options/{option_id}/line_items", {
      pathParams: { estimate_id: estimateId, option_id: optionId },
    })),
  );

  server.registerTool(
    "housecall_bulk_update_estimate_option_line_items",
    {
      title: "Bulk Update Housecall Pro Estimate Option Line Items",
      description: "Bulk update line items on an estimate option using PUT /estimates/{estimate_id}/options/{option_id}/line_items/bulk_update.",
      inputSchema: {
        estimateId: z.string().min(1),
        optionId: z.string().min(1),
        lineItems: z.array(estimateOptionLineItemSchema).min(1),
      },
    },
    async ({ estimateId, optionId, lineItems }) => runJsonRequest(() => client.put("/estimates/{estimate_id}/options/{option_id}/line_items/bulk_update", {
      pathParams: { estimate_id: estimateId, option_id: optionId },
      body: {
        line_items: mapEstimateOptionLineItems(lineItems),
      },
    })),
  );

  server.registerTool(
    "housecall_create_estimate_option_link",
    {
      title: "Create Housecall Pro Estimate Option Link",
      description: "Create a link on an estimate option using POST /estimates/{estimate_id}/options/{option_id}/links.",
      inputSchema: {
        estimateId: z.string().min(1),
        optionId: z.string().min(1),
        title: z.string().min(1),
        url: z.string().url(),
      },
    },
    async ({ estimateId, optionId, title, url }) => runJsonRequest(() => client.post("/estimates/{estimate_id}/options/{option_id}/links", {
      pathParams: { estimate_id: estimateId, option_id: optionId },
      body: { title, url },
    })),
  );

  server.registerTool(
    "housecall_update_estimate_option_schedule",
    {
      title: "Update Housecall Pro Estimate Option Schedule",
      description: "Update schedule for an estimate option using PUT /estimates/{estimate_id}/options/{option_id}/schedule.",
      inputSchema: {
        estimateId: z.string().min(1),
        optionId: z.string().min(1),
        schedule: estimateOptionScheduleSchema,
      },
    },
    async ({ estimateId, optionId, schedule }) => runJsonRequest(() => client.put("/estimates/{estimate_id}/options/{option_id}/schedule", {
      pathParams: { estimate_id: estimateId, option_id: optionId },
      body: {
        ...(schedule.scheduledStart === undefined ? {} : { scheduled_start: schedule.scheduledStart }),
        ...(schedule.scheduledEnd === undefined ? {} : { scheduled_end: schedule.scheduledEnd }),
        ...(schedule.arrivalWindow === undefined ? {} : { arrival_window: schedule.arrivalWindow }),
      },
    })),
  );

  server.registerTool(
    "housecall_add_estimate_option_note",
    {
      title: "Add Housecall Pro Estimate Option Note",
      description: "Add a note to an estimate option using POST /estimates/{estimate_id}/options/{option_id}/notes.",
      inputSchema: {
        estimateId: z.string().min(1),
        optionId: z.string().min(1),
        content: z.string().min(1),
      },
    },
    async ({ estimateId, optionId, content }) => runJsonRequest(() => client.post("/estimates/{estimate_id}/options/{option_id}/notes", {
      pathParams: { estimate_id: estimateId, option_id: optionId },
      body: { content },
    })),
  );

  server.registerTool(
    "housecall_delete_estimate_option_note",
    {
      title: "Delete Housecall Pro Estimate Option Note",
      description: "Delete a note from an estimate option using DELETE /estimates/{estimate_id}/options/{option_id}/notes/{note_id}.",
      inputSchema: {
        estimateId: z.string().min(1),
        optionId: z.string().min(1),
        noteId: z.string().min(1),
      },
    },
    async ({ estimateId, optionId, noteId }) => runJsonRequest(() => client.delete("/estimates/{estimate_id}/options/{option_id}/notes/{note_id}", {
      pathParams: {
        estimate_id: estimateId,
        option_id: optionId,
        note_id: noteId,
      },
    })),
  );
}
