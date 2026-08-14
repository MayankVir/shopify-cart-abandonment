import DodoPayments from "dodopayments";
import { dodoEnvironment } from "@/lib/dodo-env";

let client: DodoPayments | null = null;

export function getDodoClient(): DodoPayments | null {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!apiKey) return null;

  if (!client) {
    client = new DodoPayments({
      bearerToken: apiKey,
      environment: dodoEnvironment,
      webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
    });
  }

  return client;
}
