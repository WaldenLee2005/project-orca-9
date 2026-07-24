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
  durationMs?: number;
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
const MAX_COMPLETED_OPERATIONS = 20;
const STUCK_AFTER_MS = 2500;
const SLOW_OPERATION_MS = 500;

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

function trimOperations(nextOperations: DevDiagnosticOperation[]) {
  const pendingOperations = nextOperations.filter((operation) => operation.status === "pending");
  const completedOperations = nextOperations.filter((operation) => operation.status !== "pending").slice(0, MAX_COMPLETED_OPERATIONS);

  return [...pendingOperations, ...completedOperations].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
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

export function formatDevDiagnosticsSnapshot(snapshot = getSnapshot(), currentTime = Date.now()) {
  const lines = [
    "Project Orca 9 Dev Diagnostics",
    `Copied At: ${new Date(currentTime).toISOString()}`,
    `Events: ${snapshot.events.length}`,
    `Operations: ${snapshot.operations.length}`,
    ""
  ];

  lines.push("Operations");
  if (snapshot.operations.length === 0) {
    lines.push("- none");
  } else {
    snapshot.operations.forEach((operation) => {
      const elapsedMs =
        operation.status === "pending"
          ? Math.max(0, currentTime - Date.parse(operation.startedAt))
          : operation.durationMs ?? Math.max(0, Date.parse(operation.updatedAt) - Date.parse(operation.startedAt));
      const stuckText = isDevOperationStale(operation, currentTime) ? " stuck=true" : "";
      lines.push(
        `- [${operation.status}] ${operation.label} (${elapsedMs}ms${stuckText}) started=${operation.startedAt} updated=${operation.updatedAt}`
      );
      if (operation.detail) {
        lines.push(`  detail: ${operation.detail}`);
      }
    });
  }

  lines.push("", "Events");
  if (snapshot.events.length === 0) {
    lines.push("- none");
  } else {
    snapshot.events.forEach((event) => {
      lines.push(`- [${event.level}] ${event.createdAt} ${event.message}`);
      if (event.detail) {
        lines.push(`  detail: ${event.detail}`);
      }
    });
  }

  return lines.join("\n");
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
    const currentOperation = operations.find((operation) => operation.id === id);

    if (!currentOperation) {
      return;
    }

    const updatedAt = now();
    const updatedOperation: DevDiagnosticOperation = {
      ...currentOperation,
      detail: nextDetail ?? currentOperation.detail,
      durationMs: status === "pending" ? currentOperation.durationMs : Date.parse(updatedAt) - Date.parse(currentOperation.startedAt),
      status,
      updatedAt
    };

    operations = trimOperations(
      operations.map((operation) => (operation.id === id ? updatedOperation : operation))
    );
    notify();

    if (status === "resolved" && updatedOperation.durationMs && updatedOperation.durationMs >= SLOW_OPERATION_MS) {
      recordDevEvent(
        "info",
        `${label} took ${updatedOperation.durationMs}ms`,
        updatedOperation.detail ?? "Operation resolved slowly."
      );
    }
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
