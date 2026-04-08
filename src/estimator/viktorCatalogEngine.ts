/**
 * Estimator logic aligned with Viktor screenshots:
 * - Sell price from cost: price = unitCost / (1 - margin)  (gross margin on sell)
 * - Labor & adders: default 40% margin (per Blake)
 * - Equipment: "bundle" margin for full replacement tiers (default 40%), or "standalone" (23%)
 * - Good / Better / Best = Y / M / X series example for 3T heat pump split
 * - Stack adders matched from customerNotes keywords
 * - Service/repair: use housecall_list_price_book_services in the agent (not duplicated here)
 */

export type SystemKind = "split_heat_pump" | "split_ac" | "package_heat_pump" | "package_ac";

export type ViktorMargins = {
  /** Full-replacement equipment (bundled job) */
  equipmentBundle: number;
  /** Equipment sold standalone */
  equipmentStandalone: number;
  labor: number;
  adder: number;
};

export const defaultViktorMargins: ViktorMargins = {
  equipmentBundle: 0.4,
  equipmentStandalone: 0.23,
  labor: 0.4,
  adder: 0.4,
};

export type CatalogEquipmentTier = {
  id: string;
  label: "GOOD" | "BETTER" | "BEST";
  series: string;
  description: string;
  /** Internal cost; sell = cost / (1 - equipmentMargin) when margin mode is bundle */
  unitCost: number;
  recommended?: boolean;
};

export type CatalogLabor = {
  id: string;
  description: string;
  unitCost: number;
  matchSystemKinds: SystemKind[];
  /** Tonnage range label for display */
  tonnageLabel: string;
};

export type CatalogAdder = {
  id: string;
  description: string;
  unitCost: number;
  matchKeywords: string[];
};

export type ViktorCatalogDefaults = {
  equipmentTiers3tSplitHp: CatalogEquipmentTier[];
  labor: CatalogLabor[];
  adders: CatalogAdder[];
};

/** Calibrated so bundle margin 40% reproduces Viktor sample sell prices (~4492 / 5031 / 5938). */
export const defaultViktorCatalog: ViktorCatalogDefaults = {
  equipmentTiers3tSplitHp: [
    {
      id: "eq_y_3t_hp_split",
      label: "GOOD",
      series: "Y-Series",
      description: "Y-Series 3T HP (split)",
      unitCost: 2695,
    },
    {
      id: "eq_m_3t_hp_split",
      label: "BETTER",
      series: "M-Series",
      description: "M-Series 3T HP (split)",
      unitCost: 3019,
      recommended: true,
    },
    {
      id: "eq_x_3t_hp_split",
      label: "BEST",
      series: "X-Series",
      description: "X-Series 3T HP (split)",
      unitCost: 3563,
    },
  ],
  labor: [
    {
      id: "labor_split_changeout_23t",
      description: "Split change-out install (2–3T) — base labor",
      unitCost: 2000,
      matchSystemKinds: ["split_heat_pump", "split_ac"],
      tonnageLabel: "2–3T",
    },
    {
      id: "labor_split_changeout_45t",
      description: "Split change-out install (4–5T) — base labor",
      unitCost: 2000,
      matchSystemKinds: ["split_heat_pump", "split_ac"],
      tonnageLabel: "4–5T",
    },
    {
      id: "labor_package_changeout_23t",
      description: "Package change-out install (2–3T) — base labor",
      unitCost: 1700,
      matchSystemKinds: ["package_heat_pump", "package_ac"],
      tonnageLabel: "2–3T",
    },
    {
      id: "labor_package_changeout_45t",
      description: "Package change-out install (4–5T) — base labor",
      unitCost: 1700,
      matchSystemKinds: ["package_heat_pump", "package_ac"],
      tonnageLabel: "4–5T",
    },
  ],
  adders: [
    {
      id: "adder_variable_speed",
      description: "Variable-speed / communicating system — extended commissioning & wiring complexity",
      /** Higher than typical adders (e.g. tight attic $250 cost → $417 sell @ 40%); tune cost to your catalog */
      unitCost: 1000,
      matchKeywords: [
        "variable speed",
        "variable-speed",
        "vs air handler",
        "communicating",
        "inverter",
        "modulating",
        "velocitech",
        "comfortbridge",
      ],
    },
    { id: "adder_tight_attic", description: "Tight attic", unitCost: 250, matchKeywords: ["tight attic", "cramped attic", "small attic"] },
    { id: "adder_build_in_place", description: "Tight attic — build in place", unitCost: 300, matchKeywords: ["build in place", "build-in-place"] },
    { id: "adder_weekend_sat", description: "Weekend (Saturday)", unitCost: 300, matchKeywords: ["saturday", "weekend sat"] },
    { id: "adder_weekend_sun", description: "Weekend (Sunday)", unitCost: 600, matchKeywords: ["sunday"] },
    { id: "adder_package_stand", description: "Package unit stand", unitCost: 118, matchKeywords: ["package stand", "unit stand"] },
    { id: "adder_radius_sbs", description: "Side-by-side radius elbow", unitCost: 324, matchKeywords: ["side-by-side", "radius elbow", "sbs elbow"] },
    { id: "adder_radius_twist", description: "Twist radius elbow", unitCost: 379, matchKeywords: ["twist elbow", "twist radius"] },
    { id: "adder_condenser_only", description: "Condenser only change-out", unitCost: 800, matchKeywords: ["condenser only"] },
    { id: "adder_coil_upflow", description: "Coil only (upflow / horizontal)", unitCost: 950, matchKeywords: ["coil only upflow", "upflow coil", "horizontal coil"] },
    { id: "adder_coil_attic_pkg", description: "Coil only (attic / package)", unitCost: 800, matchKeywords: ["coil only attic", "package coil"] },
  ],
};

export type ViktorLineDetail = {
  id: string;
  description: string;
  category: "equipment" | "labor" | "adder";
  quantity: number;
  unitCost: number;
  margin: number;
  unitPrice: number;
  lineTotal: number;
};

export type ViktorTierResult = {
  tierLabel: string;
  series: string;
  tierDescription: string;
  recommended?: boolean;
  lines: ViktorLineDetail[];
  subtotal: number;
  /** Gross margin % on this tier: (subtotal - totalCost) / subtotal */
  grossMarginPercent: number;
  totalCost: number;
};

export type RunViktorCatalogInput = {
  tonnage: number;
  systemKind: SystemKind;
  customerNotes?: string;
  /** Extra adder ids to force-include */
  adderIds?: string[];
  margins?: Partial<ViktorMargins>;
  equipmentMarginMode?: "bundle" | "standalone";
  /** Optional discount applied to subtotal after line build (e.g. 0.2 = 20% off sell) */
  discountFraction?: number;
  taxRate?: number;
  currency?: string;
};

export type ViktorCatalogEstimateResult = {
  pricingMethod: "viktor_catalog";
  currency: string;
  marginsUsed: ViktorMargins;
  equipmentMarginMode: "bundle" | "standalone";
  laborLine: ViktorLineDetail;
  matchedAdders: ViktorLineDetail[];
  tiers: ViktorTierResult[];
  notes: string[];
  /** Flattened "primary" tier for PDF compatibility (BETTER if present, else first) */
  lines: import("./index.js").EstimateLine[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  discountFraction?: number;
  subtotalAfterDiscount?: number;
  grossMarginAfterDiscount?: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function priceFromCost(unitCost: number, margin: number): number {
  if (margin >= 1) throw new Error("Margin must be < 1");
  return roundMoney(unitCost / (1 - margin));
}

function pickLabor(defaults: ViktorCatalogDefaults, tonnage: number, systemKind: SystemKind): CatalogLabor {
  const isPackage = systemKind === "package_heat_pump" || systemKind === "package_ac";
  const large = tonnage >= 4;
  const pool = defaults.labor.filter((l) => l.matchSystemKinds.includes(systemKind));
  const label = large ? "4–5T" : "2–3T";
  const hit = pool.find((l) => l.tonnageLabel === label) ?? pool[0];
  if (!hit) {
    return {
      id: "labor_split_changeout_23t",
      description: "Change-out base labor",
      unitCost: 2000,
      matchSystemKinds: ["split_heat_pump"],
      tonnageLabel: "2–3T",
    };
  }
  return hit;
}

function normalizeNotes(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchAddersFromNotes(defaults: ViktorCatalogDefaults, customerNotes: string | undefined): CatalogAdder[] {
  if (!customerNotes) return [];
  const n = normalizeNotes(customerNotes);
  const out: CatalogAdder[] = [];
  for (const adder of defaults.adders) {
    if (adder.matchKeywords.some((kw) => n.includes(kw.toLowerCase()))) {
      out.push(adder);
    }
  }
  return out;
}

function toEstimateLines(tier: ViktorTierResult): import("./index.js").EstimateLine[] {
  return tier.lines.map((l) => ({
    ruleId: l.id,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: roundMoney(l.lineTotal),
  }));
}

export function runViktorCatalogEstimate(
  input: RunViktorCatalogInput,
  catalog: ViktorCatalogDefaults = defaultViktorCatalog,
): ViktorCatalogEstimateResult {
  const margins: ViktorMargins = { ...defaultViktorMargins, ...input.margins };
  const mode = input.equipmentMarginMode ?? "bundle";
  const equipMargin = mode === "bundle" ? margins.equipmentBundle : margins.equipmentStandalone;

  const notes: string[] = [
    "Pricing uses gross margin on sell: sell = cost ÷ (1 − margin).",
    `Equipment margin (${mode}): ${(equipMargin * 100).toFixed(0)}%. Labor: ${(margins.labor * 100).toFixed(0)}%. Adders: ${(margins.adder * 100).toFixed(0)}%.`,
    "Service & repair line items are not in this catalog — use Housecall Pro price book (housecall_list_price_book_services) for those.",
  ];

  const laborRule = pickLabor(catalog, input.tonnage, input.systemKind);
  const laborPrice = priceFromCost(laborRule.unitCost, margins.labor);
  const laborLine: ViktorLineDetail = {
    id: laborRule.id,
    description: laborRule.description,
    category: "labor",
    quantity: 1,
    unitCost: laborRule.unitCost,
    margin: margins.labor,
    unitPrice: laborPrice,
    lineTotal: laborPrice,
  };

  const fromKeywords = matchAddersFromNotes(catalog, input.customerNotes);
  const forced = (input.adderIds ?? [])
    .map((id) => catalog.adders.find((a) => a.id === id))
    .filter((a): a is CatalogAdder => Boolean(a));
  const adderMap = new Map<string, CatalogAdder>();
  for (const a of [...fromKeywords, ...forced]) adderMap.set(a.id, a);
  const matchedAdders: ViktorLineDetail[] = [...adderMap.values()].map((a) => {
    const unitPrice = priceFromCost(a.unitCost, margins.adder);
    return {
      id: a.id,
      description: a.description,
      category: "adder",
      quantity: 1,
      unitCost: a.unitCost,
      margin: margins.adder,
      unitPrice,
      lineTotal: unitPrice,
    };
  });

  const isHpSplit =
    input.systemKind === "split_heat_pump" &&
    input.tonnage >= 2.5 &&
    input.tonnage <= 3.5;
  const tiersSource: CatalogEquipmentTier[] = isHpSplit
    ? catalog.equipmentTiers3tSplitHp
    : [
        {
          id: "eq_generic_mid",
          label: "BETTER",
          series: "Mid-tier",
          description: `${input.tonnage}T ${input.systemKind.replace(/_/g, " ")} — single equipment line (add Y/M/X to catalog for Good/Better/Best)`,
          unitCost: roundMoney(3019 * (input.tonnage / 3)),
          recommended: true,
        },
      ];

  if (!isHpSplit) {
    notes.push(
      "Only one equipment line shown; Good/Better/Best Y/M/X tiers are calibrated for 3T split heat pump. Extend defaultViktorCatalog for other sizes or pull equipment from HCP.",
    );
  }

  const tiers: ViktorTierResult[] = tiersSource.map((eq) => {
    const equipPrice = priceFromCost(eq.unitCost, equipMargin);
    const eqLine: ViktorLineDetail = {
      id: eq.id,
      description: eq.description,
      category: "equipment",
      quantity: 1,
      unitCost: eq.unitCost,
      margin: equipMargin,
      unitPrice: equipPrice,
      lineTotal: equipPrice,
    };
    const lines = [eqLine, laborLine, ...matchedAdders];
    const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));
    const totalCost = roundMoney(lines.reduce((s, l) => s + l.unitCost * l.quantity, 0));
    const grossMarginPercent = subtotal > 0 ? roundMoney(((subtotal - totalCost) / subtotal) * 100) : 0;
    return {
      tierLabel: eq.label,
      series: eq.series,
      tierDescription: eq.description,
      recommended: eq.recommended,
      lines,
      subtotal,
      grossMarginPercent,
      totalCost,
    };
  });

  const primaryTier = tiers.find((t) => t.recommended) ?? tiers[0]!;
  const discount = input.discountFraction ?? 0;
  const subtotalPre = primaryTier.subtotal;
  const subtotalAfterDiscount = roundMoney(subtotalPre * (1 - discount));
  const costForPrimary = primaryTier.totalCost;
  const grossAfter =
    subtotalAfterDiscount > 0 ? roundMoney(((subtotalAfterDiscount - costForPrimary) / subtotalAfterDiscount) * 100) : 0;

  if (discount > 0) {
    notes.push(
      `Discount ${(discount * 100).toFixed(0)}% applied to primary tier subtotal; gross margin after discount ≈ ${grossAfter.toFixed(1)}%.`,
    );
  }

  const taxRate = input.taxRate ?? 0;
  const taxAmount = roundMoney(subtotalAfterDiscount * taxRate);
  const total = roundMoney(subtotalAfterDiscount + taxAmount);

  return {
    pricingMethod: "viktor_catalog",
    currency: input.currency ?? "USD",
    marginsUsed: margins,
    equipmentMarginMode: mode,
    laborLine,
    matchedAdders,
    tiers,
    notes,
    lines: toEstimateLines(primaryTier),
    subtotal: subtotalPre,
    taxRate,
    taxAmount,
    total,
    discountFraction: discount > 0 ? discount : undefined,
    subtotalAfterDiscount: discount > 0 ? subtotalAfterDiscount : undefined,
    grossMarginAfterDiscount: discount > 0 ? grossAfter : undefined,
  };
}
