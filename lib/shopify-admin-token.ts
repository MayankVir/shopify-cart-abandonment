import type { Store } from "@prisma/client";
import { resolveAdminToken } from "@/lib/shopify-admin";

export interface ClientCredentialsTokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
}

interface CachedAdminToken {
  token: string;
  expiresAt: number;
}

const REFRESH_BUFFER_MS = 60_000;

const globalForCache = globalThis as typeof globalThis & {
  shopifyAdminTokenCache?: Map<string, CachedAdminToken>;
};

const adminTokenCache =
  globalForCache.shopifyAdminTokenCache ?? new Map<string, CachedAdminToken>();
globalForCache.shopifyAdminTokenCache = adminTokenCache;

export function getCachedAdminTokenInfo(storeDomain: string): {
  cached: boolean;
  expiresAt: string | null;
  expiresInSec: number | null;
} {
  const entry = adminTokenCache.get(storeDomain);
  if (!entry || Date.now() >= entry.expiresAt - REFRESH_BUFFER_MS) {
    return { cached: false, expiresAt: null, expiresInSec: null };
  }

  const expiresInSec = Math.max(
    0,
    Math.floor((entry.expiresAt - Date.now()) / 1000)
  );
  return {
    cached: true,
    expiresAt: new Date(entry.expiresAt).toISOString(),
    expiresInSec,
  };
}

export function clearCachedAdminToken(storeDomain: string): void {
  adminTokenCache.delete(storeDomain);
}

/** Exchange Dev Dashboard Client ID + shpss_ for a ~24h Admin API token. */
export async function exchangeClientCredentialsToken(
  storeDomain: string,
  clientId: string,
  clientSecret: string
): Promise<ClientCredentialsTokenResponse> {
  const response = await fetch(
    `https://${storeDomain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Client credentials exchange failed (HTTP ${response.status}): ${body.slice(0, 400)}`
    );
  }

  let json: ClientCredentialsTokenResponse;
  try {
    json = JSON.parse(body) as ClientCredentialsTokenResponse;
  } catch {
    throw new Error("Client credentials exchange returned invalid JSON");
  }

  if (!json.access_token) {
    throw new Error("Client credentials exchange did not return access_token");
  }

  return json;
}

export type AdminTokenSource = "cache" | "client_credentials" | "stored_shpat";

export interface ResolvedAdminToken {
  token: string;
  source: AdminTokenSource;
  expiresInSec: number | null;
}

/**
 * Resolve an Admin API bearer token for polling.
 * Prefers cached client-credentials token, then fresh exchange (Client ID + shpss_),
 * then a stored shpat_ from Manual Setup / OAuth.
 */
export async function resolveStoreAdminAccessToken(
  store: Pick<Store, "storeDomain" | "apiKey" | "apiSecret" | "adminAccessToken">
): Promise<ResolvedAdminToken> {
  const clientId = store.apiKey ? resolveAdminToken(store.apiKey) : "";
  const clientSecret = store.apiSecret ? resolveAdminToken(store.apiSecret) : "";
  const storedToken = store.adminAccessToken
    ? resolveAdminToken(store.adminAccessToken)
    : "";

  const cacheKey = store.storeDomain;
  const cached = adminTokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
    return {
      token: cached.token,
      source: "cache",
      expiresInSec: Math.floor((cached.expiresAt - Date.now()) / 1000),
    };
  }

  if (clientId && clientSecret) {
    const exchanged = await exchangeClientCredentialsToken(
      store.storeDomain,
      clientId,
      clientSecret
    );

    const expiresAt = Date.now() + exchanged.expires_in * 1000;
    adminTokenCache.set(cacheKey, {
      token: exchanged.access_token,
      expiresAt,
    });

    console.info(
      "[admin-token] client_credentials",
      JSON.stringify({
        store: store.storeDomain,
        scope: exchanged.scope,
        expiresInSec: exchanged.expires_in,
      })
    );

    return {
      token: exchanged.access_token,
      source: "client_credentials",
      expiresInSec: exchanged.expires_in,
    };
  }

  if (storedToken) {
    return {
      token: storedToken,
      source: "stored_shpat",
      expiresInSec: null,
    };
  }

  throw new Error(
    "Admin API polling requires Dev Dashboard Client ID + Client Secret (shpss_), " +
      "or a stored Admin access token (shpat_). Install the custom app on this store first."
  );
}

/** Plain-text credentials (Manual Setup form before encrypt/save). */
export async function resolveAdminAccessTokenFromPlainCredentials(input: {
  storeDomain: string;
  clientId: string;
  clientSecret: string;
  adminAccessToken?: string;
}): Promise<ResolvedAdminToken> {
  return resolveStoreAdminAccessToken({
    storeDomain: input.storeDomain,
    apiKey: input.clientId,
    apiSecret: input.clientSecret,
    adminAccessToken: input.adminAccessToken ?? "",
  });
}
