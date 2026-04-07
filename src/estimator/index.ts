import { readFileSync } from "node:fs";

import { defaultRulesData } from "./defaultRulesData.js";
import { rulesSchema, type EstimatorRules } from "./schema.js";

export type { EstimatorRules } from "./schema.js";

export type EstimateLine = {
  ruleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type EstimateResult = {
  currency: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  lines: EstimateLine[];
  notes: string[];
};

export function loadEstimatorRules(path?: string): EstimatorRules {
  if (path === undefined) {
    return rulesSchema.parse(defaultRulesData);
  }
  const raw = readFileSync(path, "utf8");
  return rulesSchema.parse(JSON.parse(raw));
}

export type RunEstimatorInput = {
  /** e.g. heat_pump, furnace, ac, package */
  systemType?: string;
  squareFeet?: number;
  bedrooms?: number;
  /** User intent: inspection, duct_cleaning, tune_up, full_replace */
  intent?: string;
  /** Extra vent count for duct packages */
  extraVents?: number;
  /** Include add-ons by rule id */
  includeRuleIds?: string[];
  /** Named bundle from rules (e.g. duct_cleaning_premium) */
  bundleId?: string;
  taxRate?: number;
};

function linesWithAnyTag(rules: EstimatorRules, tags: string[]): EstimateLine[] {
  const out: EstimateLine[] = [];
  for (const rule of rules.lineItems) {
    const ruleTags = rule.tags ?? [];
    if (!tags.some((t) => ruleTags.includes(t))) continue;
    const qty = Math.max(rule.defaultQuantity, 1);
    out.push(lineFromRule(rule, qty));
  }
  return out;
}

function lineFromRule(rule: EstimatorRules["lineItems"][number], quantity: number): EstimateLine {
  return {
    ruleId: rule.id,
    description: rule.description,
    quantity,
    unitPrice: rule.unitPrice,
    lineTotal: quantity * rule.unitPrice,
  };
}

export function runEstimator(rules: EstimatorRules, input: RunEstimatorInput): EstimateResult {
  const notes: string[] = [];
  const byId = new Map(rules.lineItems.map((r) => [r.id, r]));
  const lines: EstimateLine[] = [];
  const intent = (input.intent ?? "").toLowerCase();

  const addBundle = (bundleId: string) => {
    const ids = rules.bundles?.[bundleId];
    if (!ids) {
      notes.push(`Unknown bundle "${bundleId}" — skipped.`);
      return;
    }
    for (const id of ids) {
      const rule = byId.get(id);
      if (!rule) continue;
      lines.push(lineFromRule(rule, Math.max(rule.defaultQuantity, 1)));
    }
  };

  if (input.bundleId) {
    addBundle(input.bundleId);
  }

  if (intent.includes("duct") || intent.includes("vent")) {
    if (!input.bundleId) addBundle("duct_cleaning_standard");
    const extra = input.extraVents ?? 0;
    const extraRule = byId.get("extra_vent");
    if (extraRule && extra > 0) {
      lines.push(lineFromRule(extraRule, extra));
    }
  } else if (intent.includes("tune") || intent.includes("maintenance")) {
    const tune = byId.get("tune_up");
    if (tune) lines.push(lineFromRule(tune, 1));
  } else if (intent.includes("inspect")) {
    const ins = byId.get("inspection_base");
    if (ins) lines.push(lineFromRule(ins, 1));
  } else {
    // Default: inspection baseline when intent unclear
    const ins = byId.get("inspection_base");
    if (ins) lines.push(lineFromRule(ins, 1));
    notes.push("Intent was not specific; included a baseline inspection line. Ask the customer what they need.");
  }

  for (const id of input.includeRuleIds ?? []) {
    const rule = byId.get(id);
    if (rule) {
      const qty = rule.unit === "each" ? Math.max(1, rule.defaultQuantity || 1) : 1;
      lines.push(lineFromRule(rule, qty));
    }
  }

  if (input.squareFeet && input.squareFeet > 2500) {
    notes.push("Home over 2,500 sq ft — confirm zoning and capacity before final pricing.");
  }

  if (input.systemType) {
    notes.push(`System type noted: ${input.systemType}. Align line items with your price book in Housecall Pro before sending.`);
  }

  // De-dupe by ruleId (keep first)
  const seen = new Set<string>();
  let deduped = lines.filter((l) => {
    if (seen.has(l.ruleId)) return false;
    seen.add(l.ruleId);
    return true;
  });

  if (deduped.length === 0) {
    const ins = byId.get("inspection_base");
    deduped = ins ? [lineFromRule(ins, 1)] : linesWithAnyTag(rules, ["inspection"]);
  }

  const subtotal = deduped.reduce((s, l) => s + l.lineTotal, 0);
  const taxRate = input.taxRate ?? rules.taxRateDefault;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  return {
    currency: rules.currency,
    subtotal,
    taxRate,
    taxAmount,
    total,
    lines: deduped,
    notes,
  };
}
