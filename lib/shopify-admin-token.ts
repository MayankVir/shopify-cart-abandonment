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
    throw new Error(describeClientCredentialsFailure(response.status, body));
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

function describeClientCredentialsFailure(status: number, body: string): string {
  const title = body.match(/<title>([^<]+)<\/title>/i)?.[1]
    ?.replace(/^\d+\s*-\s*/, "")
    .trim();
  if (title) {
    return `Client credentials exchange failed (HTTP ${status}): ${title}`;
  }

  try {
    const json = JSON.parse(body) as {
      error?: string;
      error_description?: string;
    };
    if (json.error) {
      const detail = json.error_description
        ? `${json.error} (${json.error_description})`
        : json.error;
      return `Client credentials exchange failed (HTTP ${status}): ${detail}`;
    }
  } catch {
    // Shopify sometimes returns an HTML error page instead of JSON.
  }

  return `Client credentials exchange failed (HTTP ${status}): ${body.slice(0, 200)}`;
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
    try {
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
    } catch (error) {
      if (!storedToken) throw error;

      console.warn(
        "[admin-token] client_credentials failed, using stored shpat",
        JSON.stringify({
          store: store.storeDomain,
          error: error instanceof Error ? error.message : "Unknown token error",
        })
      );
    }
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

const PER_CALL_TOKEN_BUDGET_MS = 2 * 60_000;

function upcomingTokenNeededUntil(
  scheduledAt: Array<Date | null | undefined>,
  sipConcurrency: number
): number {
  const concurrency = Math.min(10, Math.max(1, sipConcurrency));
  const times = scheduledAt
    .map((value) => value?.getTime() ?? Date.now())
    .sort((left, right) => left - right)
    .slice(0, concurrency);
  const lastCallAt = times.length > 0 ? times[times.length - 1] : Date.now();
  return Math.max(Date.now(), lastCallAt) + concurrency * PER_CALL_TOKEN_BUDGET_MS;
}

/**
 * Refresh the Admin token before a cron batch when the cached token would
 * expire before the next sipConcurrency scheduled calls finish.
 * Never throws: bad Client ID/Secret is logged and the stored shpat_ is used.
 */
export async function ensureAdminTokenForUpcomingCalls(
  store: Pick<
    Store,
    "storeDomain" | "apiKey" | "apiSecret" | "adminAccessToken" | "sipConcurrency"
  >,
  upcomingScheduledAt: Array<Date | null | undefined>
): Promise<{
  ok: boolean;
  refreshed: boolean;
  source: AdminTokenSource | null;
  expiresInSec: number | null;
  neededUntil: string;
  error?: string;
}> {
  const neededUntilMs = upcomingTokenNeededUntil(
    upcomingScheduledAt,
    store.sipConcurrency
  );
  const neededUntil = new Date(neededUntilMs).toISOString();

  try {
    const cached = adminTokenCache.get(store.storeDomain);
    if (cached && cached.expiresAt > neededUntilMs + REFRESH_BUFFER_MS) {
      return {
        ok: true,
        refreshed: false,
        source: "cache",
        expiresInSec: Math.floor((cached.expiresAt - Date.now()) / 1000),
        neededUntil,
      };
    }

    const clientId = store.apiKey ? resolveAdminToken(store.apiKey) : "";
    const clientSecret = store.apiSecret ? resolveAdminToken(store.apiSecret) : "";
    const storedToken = store.adminAccessToken
      ? resolveAdminToken(store.adminAccessToken)
      : "";

    if (clientId && clientSecret) {
      try {
        const exchanged = await exchangeClientCredentialsToken(
          store.storeDomain,
          clientId,
          clientSecret
        );
        const expiresAt = Date.now() + exchanged.expires_in * 1000;
        adminTokenCache.set(store.storeDomain, {
          token: exchanged.access_token,
          expiresAt,
        });

        console.info(
          "[admin-token] refreshed for upcoming calls",
          JSON.stringify({
            store: store.storeDomain,
            scope: exchanged.scope,
            expiresInSec: exchanged.expires_in,
            neededUntil,
            sipConcurrency: store.sipConcurrency,
          })
        );

        return {
          ok: true,
          refreshed: true,
          source: "client_credentials",
          expiresInSec: exchanged.expires_in,
          neededUntil,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown token error";
        console.warn(
          "[admin-token] refresh skipped",
          JSON.stringify({
            store: store.storeDomain,
            error: message,
            fallback: storedToken ? "stored_shpat" : "none",
            neededUntil,
          })
        );

        if (storedToken) {
          return {
            ok: true,
            refreshed: false,
            source: "stored_shpat",
            expiresInSec: null,
            neededUntil,
            error: message,
          };
        }

        return {
          ok: false,
          refreshed: false,
          source: null,
          expiresInSec: null,
          neededUntil,
          error: message,
        };
      }
    }

    if (storedToken) {
      return {
        ok: true,
        refreshed: false,
        source: "stored_shpat",
        expiresInSec: null,
        neededUntil,
      };
    }

    return {
      ok: false,
      refreshed: false,
      source: null,
      expiresInSec: null,
      neededUntil,
      error: "No Client ID/Secret or stored Admin token on this store",
    };
  } catch (error) {
    return {
      ok: false,
      refreshed: false,
      source: null,
      expiresInSec: null,
      neededUntil,
      error: error instanceof Error ? error.message : "Unknown token error",
    };
  }
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
