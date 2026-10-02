import {
  COGS_INR_PER_MIN,
  getPlanById,
  PLANS,
  type PlanId,
} from "@/lib/billing/plans";

export interface UsageCalculationInput {
  planId: PlanId;
  /** Raw seconds from call logs for the billing cycle. */
  totalSecondsDialed: number;
}

export interface UsageCalculationOutput {
  planId: string;
  basePriceInr: number;
  /** Billed minutes, rounded up to the next minute. */
  totalMinutesUsed: number;
  includedMinutes: number;
  overageMinutes: number;
  overageRatePerMin: number;
  overageChargeInr: number;
  totalAmountDueInr: number;
  /** Internal cost at ₹5.00 per billed minute. */
  estimatedCogsInr: number;
  grossProfitInr: number;
}

export interface UpgradeRecommendation {
  shouldUpgrade: boolean;
  recommendedPlan?: "growth" | "pro";
  potentialSavingsInr?: number;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Store call length as a non-negative whole number of seconds. */
export function toBilledDurationSec(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

export function billedMinutesFromSeconds(totalSecondsDialed: number): number {
  if (!Number.isFinite(totalSecondsDialed) || totalSecondsDialed <= 0) return 0;
  return Math.ceil(totalSecondsDialed / 60);
}

export function calculateMonthlyInvoice(
  input: UsageCalculationInput
): UsageCalculationOutput {
  const plan = getPlanById(input.planId);
  if (!plan) {
    throw new Error(`Unknown plan: ${input.planId}`);
  }

  const totalMinutesUsed = billedMinutesFromSeconds(input.totalSecondsDialed);
  const overageMinutes = Math.max(0, totalMinutesUsed - plan.includedMinutes);
  const overageChargeInr = money(overageMinutes * plan.overageRatePerMin);
  const totalAmountDueInr = money(plan.priceInr + overageChargeInr);
  const estimatedCogsInr = money(totalMinutesUsed * COGS_INR_PER_MIN);

  return {
    planId: plan.id,
    basePriceInr: plan.priceInr,
    totalMinutesUsed,
    includedMinutes: plan.includedMinutes,
    overageMinutes,
    overageRatePerMin: plan.overageRatePerMin,
    overageChargeInr,
    totalAmountDueInr,
    estimatedCogsInr,
    grossProfitInr: money(totalAmountDueInr - estimatedCogsInr),
  };
}

/**
 * Suggest the next plan when the current bill has crossed that plan's price
 * and the next plan would cost less for the same minutes.
 */
export function checkRecommendedUpgrade(
  currentPlanId: PlanId,
  totalMinutesUsed: number
): UpgradeRecommendation {
  const seconds = Math.max(0, totalMinutesUsed) * 60;
  const current = calculateMonthlyInvoice({
    planId: currentPlanId,
    totalSecondsDialed: seconds,
  });

  const nextId = currentPlanId === "starter" ? "growth" : currentPlanId === "growth" ? "pro" : null;
  if (!nextId) return { shouldUpgrade: false };

  const nextPrice = PLANS[nextId].priceInr;
  if (current.totalAmountDueInr <= nextPrice) return { shouldUpgrade: false };

  const next = calculateMonthlyInvoice({
    planId: nextId,
    totalSecondsDialed: seconds,
  });
  const potentialSavingsInr = money(current.totalAmountDueInr - next.totalAmountDueInr);
  if (potentialSavingsInr <= 0) return { shouldUpgrade: false };

  return {
    shouldUpgrade: true,
    recommendedPlan: nextId,
    potentialSavingsInr,
  };
}
