import { PrismaClient } from "@prisma/client";

const withConnectionLimit = (url: string) => {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "10");
    }
    return parsed.toString();
  } catch (_error) {
    return url;
  }
};

const FALLBACK_DATABASE_URL = "postgresql://placeholder:placeholder@127.0.0.1:5432/life_dashboard";
const databaseUrl = withConnectionLimit(process.env.DATABASE_URL || FALLBACK_DATABASE_URL);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
