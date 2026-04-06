import "server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, "GOOGLE_TOKEN_ENCRYPTION_KEY is required"),
  ALLOWED_EMAILS: z.string().min(1, "ALLOWED_EMAILS is required"),
});

type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;
let cachedAllowedEmails: string[] | null = null;

function formatEnvIssues() {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) {
    return null;
  }

  return parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = formatEnvIssues();
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getAllowedEmails() {
  if (cachedAllowedEmails) {
    return cachedAllowedEmails;
  }

  const raw = process.env.ALLOWED_EMAILS || "";
  const emails = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  cachedAllowedEmails = emails;
  return emails;
}

export const env = new Proxy({} as Env, {
  get(_target, prop) {
    const key = String(prop) as keyof Env;
    return getEnv()[key];
  },
});

