import { z } from "zod";

export const lineItemRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  unit: z.enum(["flat", "each", "per_sqft"]),
  defaultQuantity: z.number(),
  unitPrice: z.number(),
  tags: z.array(z.string()).optional(),
});

export const rulesSchema = z.object({
  currency: z.string().default("USD"),
  taxRateDefault: z.number().min(0).max(1).default(0),
  lineItems: z.array(lineItemRuleSchema),
  bundles: z.record(z.string(), z.array(z.string())).optional(),
});

export type EstimatorRules = z.infer<typeof rulesSchema>;
