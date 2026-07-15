const DEFAULT_UAGENTS_BASE_URL = "https://uagents.val.run";

export interface UAgentsContextResult {
  user_phone?: string;
  abandoned_ts?: string;
  cart_value?: string;
  order_context?: string;
  user_context?: string;
  related_items?: unknown[];
  ok?: boolean;
  error?: string;
  detail?: string;
}

function getUAgentsConfig() {
  const customerName = String(process.env.UAGENTS_CUSTOMER_NAME || "ttai")
    .trim()
    .toLowerCase();
  const token = String(process.env.UAGENTS_TOKEN || "").trim();
  const baseUrl = String(process.env.UAGENTS_BASE_URL || DEFAULT_UAGENTS_BASE_URL)
    .trim()
    .replace(/\/+$/, "");

  if (!["ttai", "jjs"].includes(customerName)) {
    throw new Error("UAGENTS_CUSTOMER_NAME must be ttai or jjs");
  }
  if (!token) {
    throw new Error("UAGENTS_TOKEN not set");
  }

  return {
    customerName,
    token,
    endpoint: `${baseUrl}/c/${customerName}/fetch-context`,
  };
}

export async function fetchUAgentsContext(
  orderId: string,
  phoneNumber?: string
): Promise<UAgentsContextResult> {
  const cfg = getUAgentsConfig();
  const payload: Record<string, string> = { order_id: String(orderId).trim() };
  if (phoneNumber) payload.user_phone = phoneNumber;

  let response: Response;
  try {
    response = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("uAgents request timed out after 20s");
    }
    throw error;
  }

  const body = await response.text();
  let parsed: UAgentsContextResult;
  try {
    parsed = JSON.parse(body) as UAgentsContextResult;
  } catch {
    throw new Error(`uAgents: invalid JSON (HTTP ${response.status})`);
  }

  if (response.status < 200 || response.status >= 300 || parsed.ok === false) {
    throw new Error(parsed.error || parsed.detail || `uAgents HTTP ${response.status}`);
  }

  return parsed;
}

export function isUAgentsConfigured(): boolean {
  return Boolean(process.env.UAGENTS_TOKEN?.trim());
}
