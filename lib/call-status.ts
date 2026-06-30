import { CallStatus } from "@prisma/client";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "info"
  | "muted";

export const STATUS_VARIANT: Record<CallStatus, BadgeVariant> = {
  PENDING: "muted",
  PREPARING: "info",
  DISPATCHED: "info",
  COMPLETED: "success",
  NO_ANSWER: "warning",
  BUSY: "warning",
  INVALID_NUMBER: "destructive",
  HANG_UP: "secondary",
  VOICEMAIL: "warning",
  CART_CREATE_FAILED: "destructive",
  ENRICH_FAILED: "destructive",
  DISPATCH_FAILED: "destructive",
};

export const FAILURE_STATUSES: CallStatus[] = [
  CallStatus.CART_CREATE_FAILED,
  CallStatus.ENRICH_FAILED,
  CallStatus.DISPATCH_FAILED,
];

export const TERMINAL_FAILURE_STATUSES: CallStatus[] = [
  CallStatus.NO_ANSWER,
  CallStatus.BUSY,
  CallStatus.INVALID_NUMBER,
  CallStatus.HANG_UP,
  CallStatus.VOICEMAIL,
  ...FAILURE_STATUSES,
];

export function formatCallStatus(status: CallStatus): string {
  return status.replace(/_/g, " ");
}

export function isActiveCall(status: CallStatus): boolean {
  return status === CallStatus.PREPARING || status === CallStatus.DISPATCHED;
}

export function canInitiateCall(status: CallStatus): boolean {
  return (
    status === CallStatus.PENDING ||
    FAILURE_STATUSES.includes(status)
  );
}

export function canStopCall(status: CallStatus, callScheduled: boolean): boolean {
  return isActiveCall(status) || (status === CallStatus.PENDING && callScheduled);
}
