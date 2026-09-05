import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaQueryUrl: string | undefined;
};

/** Drop Prisma's pgbouncer flag so queries are not wrapped in BEGIN / DEALLOCATE ALL / COMMIT. */
function stripPgbouncerParam(url: string): string {
  return url
    .replace(/([?&])pgbouncer=true&?/, "$1")
    .replace(/[?&]$/, "");
}

function appendQueryParam(url: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`).test(url)) return url;
  return url.includes("?") ? `${url}&${key}=${value}` : `${url}?${key}=${value}`;
}

/**
 * Supabase session pooler (DIRECT_URL :5432) is capped at ~15 clients.
 * Prisma's default pool is `cpus * 2 + 1` and will exhaust that alone.
 */
function prismaConnectionLimit(): string {
  const override = process.env.PRISMA_CONNECTION_LIMIT?.trim();
  if (override) return override;
  return process.env.VERCEL || process.env.NODE_ENV === "production" ? "1" : "3";
}

function withPoolLimits(url: string): string {
  return appendQueryParam(
    appendQueryParam(url, "connection_limit", prismaConnectionLimit()),
    "pool_timeout",
    "10"
  );
}

/**
 * Transaction-mode pooler (:6543 + pgbouncer=true) makes Prisma emit
 * BEGIN / DEALLOCATE ALL / COMMIT around every statement. Session pooler
 * (:5432) or DIRECT_URL does not.
 */
function prismaQueryUrl(): string | undefined {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (directUrl) return withPoolLimits(stripPgbouncerParam(directUrl));

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return undefined;
  return withPoolLimits(
    stripPgbouncerParam(databaseUrl.replace(/:6543\b/, ":5432"))
  );
}

const queryUrl = prismaQueryUrl();

if (
  globalForPrisma.prisma &&
  globalForPrisma.prismaQueryUrl !== queryUrl
) {
  void globalForPrisma.prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

const created =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(queryUrl ? { datasources: { db: { url: queryUrl } } } : {}),
  });

globalForPrisma.prismaQueryUrl = queryUrl;
globalForPrisma.prisma = created;

export const db = created;
