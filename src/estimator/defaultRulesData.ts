import type { EstimatorRules } from "./schema.js";

/** Replace or override via ESTIMATOR_RULES_PATH JSON file at runtime. */
export const defaultRulesData: EstimatorRules = {
  currency: "USD",
  taxRateDefault: 0.0825,
  lineItems: [
    {
      id: "inspection_base",
      description: "Full system inspection & diagnostic",
      unit: "flat",
      defaultQuantity: 1,
      unitPrice: 89,
      tags: ["inspection"],
    },
    {
      id: "tune_up",
      description: "Preventive maintenance / tune-up",
      unit: "flat",
      defaultQuantity: 1,
      unitPrice: 149,
      tags: ["maintenance"],
    },
    {
      id: "duct_cleaning_base",
      description: "Air duct cleaning (per system, up to 12 vents)",
      unit: "flat",
      defaultQuantity: 1,
      unitPrice: 449,
      tags: ["duct_cleaning"],
    },
    {
      id: "extra_vent",
      description: "Additional supply/return vent",
      unit: "each",
      defaultQuantity: 0,
      unitPrice: 25,
      tags: ["duct_cleaning"],
    },
    {
      id: "main_trunk_sanitize",
      description: "Main trunk sanitize & deodorize",
      unit: "flat",
      defaultQuantity: 0,
      unitPrice: 125,
      tags: ["duct_cleaning", "addon"],
    },
    {
      id: "filter_upgrade",
      description: "MERV 13 media filter upgrade (installed)",
      unit: "each",
      defaultQuantity: 0,
      unitPrice: 85,
      tags: ["iaq"],
    },
  ],
  bundles: {
    duct_cleaning_standard: ["duct_cleaning_base"],
    duct_cleaning_premium: ["duct_cleaning_base", "main_trunk_sanitize"],
    inspection_plus_tune: ["inspection_base", "tune_up"],
  },
};
