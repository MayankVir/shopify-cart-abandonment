import type { Store } from "@prisma/client";
import { type LineItemRecord } from "@/lib/line-items";
import { resolveStoreAdminAccessToken } from "@/lib/shopify-admin-token";

const ADMIN_API_VERSION = "2024-10";

const DRAFT_ORDER_CREATE = `
mutation DraftOrderCreate($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder {
      id
      name
      status
    }
    userErrors {
      field
      message
    }
  }
}`;

const DRAFT_ORDER_GET = `
query DraftOrder($id: ID!) {
  draftOrder(id: $id) {
    id
    name
    status
    email
    phone
    note2
    tags
    currencyCode
    totalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    subtotalPriceSet {
      shopMoney {
        amount
      }
    }
    totalTaxSet {
      shopMoney {
        amount
      }
    }
    lineItems(first: 50) {
      edges {
        node {
          title
          quantity
          sku
          variant {
            id
          }
          originalUnitPriceSet {
            shopMoney {
              amount
            }
          }
        }
      }
    }
    shippingAddress {
      firstName
      lastName
      address1
      city
      province
      zip
      countryCodeV2
    }
  }
}`;

type UserError = { field?: string[] | null; message: string };

export interface CreateDraftOrderInput {
  lineItems: LineItemRecord[];
  phone?: string;
  email?: string;
  checkoutToken?: string;
  note?: string;
  customerName?: string;
  shippingAddress?: {
    address1: string;
    zip: string;
    province: string;
    countryCode: string;
    city?: string;
  } | null;
}

export function hasDraftOrderId(id: string | null | undefined): boolean {
  return Boolean(id?.trim());
}

export interface CreateDraftOrderResult {
  draftOrderId: string;
  draftOrderName: string;
}

/** Flat one-level draft order payload for agent dynamic vars. */
export type DraftOrderContext = Record<string, string | number>;

type DraftOrderGraphNode = {
  id: string;
  name: string;
  status: string;
  email?: string | null;
  phone?: string | null;
  note2?: string | null;
  tags: string[];
  currencyCode?: string;
  totalPriceSet?: { shopMoney: { amount: string; currencyCode: string } };
  subtotalPriceSet?: { shopMoney: { amount: string } };
  totalTaxSet?: { shopMoney: { amount: string } };
  lineItems?: {
    edges: Array<{
      node: {
        title: string;
        quantity: number;
        sku?: string | null;
        variant?: { id: string } | null;
        originalUnitPriceSet?: { shopMoney: { amount: string } };
      };
    }>;
  };
  shippingAddress?: {
    firstName?: string | null;
    lastName?: string | null;
    address1?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    countryCodeV2?: string | null;
  } | null;
};

export function flattenDraftOrderContext(
  draft: DraftOrderGraphNode
): DraftOrderContext {
  const lineItems = (draft.lineItems?.edges ?? []).map(({ node }) => ({
    title: node.title,
    quantity: node.quantity,
    sku: node.sku ?? "",
    variant_id: node.variant?.id ?? "",
    unit_price: node.originalUnitPriceSet?.shopMoney?.amount ?? "",
  }));

  const flat: DraftOrderContext = {
    id: draft.id,
    name: draft.name,
    status: draft.status,
    email: draft.email ?? "",
    phone: draft.phone ?? "",
    note: draft.note2 ?? "",
    tags: (draft.tags ?? []).join(", "),
    currency:
      draft.totalPriceSet?.shopMoney?.currencyCode ?? draft.currencyCode ?? "",
    total_price: draft.totalPriceSet?.shopMoney?.amount ?? "",
    subtotal_price: draft.subtotalPriceSet?.shopMoney?.amount ?? "",
    total_tax: draft.totalTaxSet?.shopMoney?.amount ?? "",
    line_items: JSON.stringify(lineItems),
  };

  const addr = draft.shippingAddress;
  if (addr) {
    flat.shipping_first_name = addr.firstName ?? "";
    flat.shipping_last_name = addr.lastName ?? "";
    flat.shipping_address1 = addr.address1 ?? "";
    flat.shipping_city = addr.city ?? "";
    flat.shipping_province = addr.province ?? "";
    flat.shipping_zip = addr.zip ?? "";
    flat.shipping_country = addr.countryCodeV2 ?? "";
  }

  return flat;
}

export function serializeDraftOrderContext(context: DraftOrderContext): string {
  return JSON.stringify(context);
}

async function adminGraphql<T>(
  storeDomain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `https://${storeDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Admin API HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const json = JSON.parse(body) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Empty GraphQL response");
  }

  return json.data;
}

function assertUserErrors(label: string, userErrors: UserError[] | undefined) {
  if (!userErrors?.length) return;
  const detail = userErrors
    .map((e) => `${e.field?.join(".") ?? "input"}: ${e.message}`)
    .join("; ");
  throw new Error(`${label}: ${detail}`);
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function buildDraftInput(input: CreateDraftOrderInput) {
  const lineItems = input.lineItems
    .filter((item) => item.variant_gid)
    .map((item) => ({
      variantId: item.variant_gid,
      quantity: Math.max(1, Number(item.quantity) || 1),
    }));

  if (!lineItems.length) {
    throw new Error("No variant IDs available for draft order");
  }

  const tags = ["voice-agent-recovery"];
  if (input.checkoutToken) {
    tags.push(input.checkoutToken);
  }

  const draftInput: Record<string, unknown> = {
    lineItems,
    tags,
    note:
      input.note ||
      `Abandoned cart recovery${input.checkoutToken ? ` — ${input.checkoutToken}` : ""}`,
  };

  if (input.email?.trim()) draftInput.email = input.email.trim();
  if (input.phone?.trim()) draftInput.phone = input.phone.trim();

  if (input.shippingAddress?.address1) {
    const { firstName, lastName } = splitName(input.customerName || "");
    draftInput.shippingAddress = {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      address1: input.shippingAddress.address1,
      zip: input.shippingAddress.zip || undefined,
      province: input.shippingAddress.province || undefined,
      countryCode: input.shippingAddress.countryCode || "IN",
      city: input.shippingAddress.city || undefined,
    };
  }

  return draftInput;
}

export async function createDraftOrderForStore(
  store: Pick<Store, "storeDomain" | "apiKey" | "apiSecret" | "adminAccessToken">,
  input: CreateDraftOrderInput
): Promise<CreateDraftOrderResult> {
  const { token } = await resolveStoreAdminAccessToken(store);
  const draftInput = buildDraftInput(input);

  const data = await adminGraphql<{
    draftOrderCreate: {
      draftOrder?: { id: string; name: string };
      userErrors: UserError[];
    };
  }>(store.storeDomain, token, DRAFT_ORDER_CREATE, { input: draftInput });

  assertUserErrors("draftOrderCreate", data.draftOrderCreate.userErrors);

  const draft = data.draftOrderCreate.draftOrder;
  if (!draft?.id) {
    throw new Error("draftOrderCreate returned no draft order id");
  }

  return {
    draftOrderId: draft.id,
    draftOrderName: draft.name || "",
  };
}

export async function getDraftOrderContextForStore(
  store: Pick<Store, "storeDomain" | "apiKey" | "apiSecret" | "adminAccessToken">,
  draftOrderId: string
): Promise<DraftOrderContext> {
  const { token } = await resolveStoreAdminAccessToken(store);

  const data = await adminGraphql<{
    draftOrder?: DraftOrderGraphNode | null;
  }>(store.storeDomain, token, DRAFT_ORDER_GET, { id: draftOrderId });

  if (!data.draftOrder?.id) {
    throw new Error(`Draft order not found: ${draftOrderId}`);
  }

  return flattenDraftOrderContext(data.draftOrder);
}
