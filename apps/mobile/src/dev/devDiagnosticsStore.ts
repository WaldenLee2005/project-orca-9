import { isOrcaDevMode } from "./devMode";

export type DevDiagnosticLevel = "info" | "warning" | "error";
export type DevOperationStatus = "pending" | "resolved" | "failed";

export type DevDiagnosticEvent = {
  id: string;
  level: DevDiagnosticLevel;
  message: string;
  detail?: string;
  createdAt: string;
};

export type DevDiagnosticOperation = {
  id: string;
  label: string;
  detail?: string;
  status: DevOperationStatus;
  startedAt: string;
  updatedAt: string;
};

type DevDiagnosticsSnapshot = {
  events: DevDiagnosticEvent[];
  operations: DevDiagnosticOperation[];
};

type DevDiagnosticsSubscriber = (snapshot: DevDiagnosticsSnapshot) => void;

const MAX_EVENTS = 30;
const STUCK_AFTER_MS = 2500;

let events: DevDiagnosticEvent[] = [];
let operations: DevDiagnosticOperation[] = [];
const subscribers = new Set<DevDiagnosticsSubscriber>();

function now() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSnapshot(): DevDiagnosticsSnapshot {
  return {
    events,
    operations
  };
}

function notify() {
  const snapshot = getSnapshot();
  subscribers.forEach((subscriber) => subscriber(snapshot));
}

function formatUnknownDetail(value: unknown): string | undefined {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function subscribeToDevDiagnostics(subscriber: DevDiagnosticsSubscriber) {
  subscribers.add(subscriber);
  subscriber(getSnapshot());

  return () => {
    subscribers.delete(subscriber);
  };
}

export function getDevDiagnosticsSnapshot() {
  return getSnapshot();
}

export function clearDevDiagnostics() {
  if (!isOrcaDevMode) {
    return;
  }

  events = [];
  operations = operations.filter((operation) => operation.status === "pending");
  notify();
}

export function recordDevEvent(level: DevDiagnosticLevel, message: string, detail?: unknown) {
  if (!isOrcaDevMode) {
    return;
  }

  events = [
    {
      id: createId("event"),
      level,
      message,
      detail: formatUnknownDetail(detail),
      createdAt: now()
    },
    ...events
  ].slice(0, MAX_EVENTS);

  notify();
}

export function trackDevOperation(label: string, detail?: string) {
  if (!isOrcaDevMode) {
    return {
      fail: () => {},
      resolve: () => {},
      update: () => {}
    };
  }

  const id = createId("operation");
  const startedAt = now();

  operations = [
    {
      id,
      label,
      detail,
      status: "pending",
      startedAt,
      updatedAt: startedAt
    },
    ...operations
  ];
  notify();

  const updateOperation = (status: DevOperationStatus, nextDetail?: string) => {
    operations = operations.map((operation) =>
      operation.id === id
        ? {
            ...operation,
            detail: nextDetail ?? operation.detail,
            status,
            updatedAt: now()
          }
        : operation
    );
    notify();
  };

  return {
    fail: (error?: unknown) => {
      updateOperation("failed", formatUnknownDetail(error));
      recordDevEvent("error", `${label} failed`, error);
    },
    resolve: (nextDetail?: string) => updateOperation("resolved", nextDetail),
    update: (nextDetail: string) => updateOperation("pending", nextDetail)
  };
}

export function isDevOperationStale(operation: DevDiagnosticOperation, currentTime = Date.now()) {
  return operation.status === "pending" && currentTime - Date.parse(operation.startedAt) >= STUCK_AFTER_MS;
}
