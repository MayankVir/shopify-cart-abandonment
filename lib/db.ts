import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaQueryUrl: string | undefined;
};

/** Drop Prisma's pgbouncer flag so queries are not wrapped in BEGIN/DEALLOCATE ALL/COMMIT. */
function stripPgbouncerParam(url: string): string {
  return url
    .replace(/([?&])pgbouncer=true&?/, "$1")
    .replace(/[?&]$/, "");
}

/**
 * Transaction-mode pooler (:6543 + pgbouncer=true) makes Prisma emit
 * BEGIN / DEALLOCATE ALL / COMMIT around every statement. Session pooler
 * (:5432) or DIRECT_URL does not.
 */
function prismaQueryUrl(): string | undefined {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (directUrl) return stripPgbouncerParam(directUrl);

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) return undefined;
  return stripPgbouncerParam(databaseUrl.replace(/:6543\b/, ":5432"));
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

export const db = created;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
