import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface BillingConfigData {
  ratePerMinuteUsd: number;
  freeMinutesOnSignup: number;
  maxGrantPerAction: number;
  currency: string;
}

const DEFAULT_CONFIG: BillingConfigData = {
  ratePerMinuteUsd: 0.08,
  freeMinutesOnSignup: 25,
  maxGrantPerAction: 500,
  currency: "USD",
};

function toNumber(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value);
}

export async function getBillingConfig(): Promise<BillingConfigData> {
  const row = await db.billingConfig.findUnique({
    where: { id: "default" },
  });

  if (!row) {
    await db.billingConfig.create({
      data: {
        id: "default",
        ratePerMinuteUsd: DEFAULT_CONFIG.ratePerMinuteUsd,
        freeMinutesOnSignup: DEFAULT_CONFIG.freeMinutesOnSignup,
        maxGrantPerAction: DEFAULT_CONFIG.maxGrantPerAction,
        currency: DEFAULT_CONFIG.currency,
      },
    });
    return DEFAULT_CONFIG;
  }

  return {
    ratePerMinuteUsd: toNumber(row.ratePerMinuteUsd),
    freeMinutesOnSignup: row.freeMinutesOnSignup,
    maxGrantPerAction: row.maxGrantPerAction,
    currency: row.currency,
  };
}

export async function updateBillingConfig(
  data: Partial<BillingConfigData>
): Promise<BillingConfigData> {
  await getBillingConfig();

  const row = await db.billingConfig.update({
    where: { id: "default" },
    data: {
      ...(data.ratePerMinuteUsd !== undefined
        ? { ratePerMinuteUsd: data.ratePerMinuteUsd }
        : {}),
      ...(data.freeMinutesOnSignup !== undefined
        ? { freeMinutesOnSignup: data.freeMinutesOnSignup }
        : {}),
      ...(data.maxGrantPerAction !== undefined
        ? { maxGrantPerAction: data.maxGrantPerAction }
        : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
    },
  });

  return {
    ratePerMinuteUsd: toNumber(row.ratePerMinuteUsd),
    freeMinutesOnSignup: row.freeMinutesOnSignup,
    maxGrantPerAction: row.maxGrantPerAction,
    currency: row.currency,
  };
}
