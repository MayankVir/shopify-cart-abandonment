export const CHECKOUT_SYNC_MODES = {
  WEBHOOK: "WEBHOOK",
  POLLING: "POLLING",
} as const;

export type CheckoutSyncModeValue =
  (typeof CHECKOUT_SYNC_MODES)[keyof typeof CHECKOUT_SYNC_MODES];

export function isCheckoutSyncMode(value: string): value is CheckoutSyncModeValue {
  return value === CHECKOUT_SYNC_MODES.WEBHOOK || value === CHECKOUT_SYNC_MODES.POLLING;
}

export function isWebhookIngestEnabled(mode: CheckoutSyncModeValue): boolean {
  return mode === CHECKOUT_SYNC_MODES.WEBHOOK;
}

export function isPollingIngestEnabled(mode: CheckoutSyncModeValue): boolean {
  return mode === CHECKOUT_SYNC_MODES.POLLING;
}
