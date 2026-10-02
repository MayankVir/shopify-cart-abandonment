export const PLAN_IDS = ["starter", "growth", "pro"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceInr: number;
  includedMinutes: number;
  overageRatePerMin: number;
  features: readonly string[];
}

/** Share taken off twelve months when the store pays yearly. */
export const YEARLY_DISCOUNT = 0.2;

/** Internal telephony cost per billed minute, for profit tracking. */
export const COGS_INR_PER_MIN = 5;

export const PLANS = {
  starter: {
    id: "starter",
    name: "Starter",
    priceInr: 4999,
    includedMinutes: 400,
    overageRatePerMin: 13,
    features: [
      "Abandoned checkout recovery",
      "Standard Hinglish agent",
      "WhatsApp cart link fallback",
      "Email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceInr: 9999,
    includedMinutes: 1000,
    overageRatePerMin: 11,
    features: [
      "Dynamic discount negotiation",
      "Real-time WhatsApp link injection",
      "GoKwik and Shopflo routing",
      "Priority support",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInr: 19999,
    includedMinutes: 2500,
    overageRatePerMin: 9,
    features: [
      "COD address verification",
      "NDR dispatch handling",
      "Custom voice clone",
      "Dedicated DID protection",
    ],
  },
} as const satisfies Record<PlanId, PlanDefinition>;

const PLAN_LIST: readonly PlanDefinition[] = [PLANS.starter, PLANS.growth, PLANS.pro];

export function listPlans(): readonly PlanDefinition[] {
  return PLAN_LIST;
}

export function getPlanById(planId: string): PlanDefinition | undefined {
  if (!isPlanId(planId)) return undefined;
  return PLANS[planId];
}

export function isPlanId(planId: string): planId is PlanId {
  return (PLAN_IDS as readonly string[]).includes(planId);
}

export function fullYearlyPriceInr(monthlyPriceInr: number): number {
  return monthlyPriceInr * 12;
}

export function yearlyPriceInr(monthlyPriceInr: number): number {
  return Math.round(fullYearlyPriceInr(monthlyPriceInr) * (1 - YEARLY_DISCOUNT));
}
