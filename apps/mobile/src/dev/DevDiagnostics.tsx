import * as Clipboard from "expo-clipboard";
import { Component, ErrorInfo, PropsWithChildren, ReactNode, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { isOrcaDevMode } from "./devMode";
import {
  clearDevDiagnostics,
  DevDiagnosticEvent,
  DevDiagnosticOperation,
  formatDevDiagnosticsSnapshot,
  getDevDiagnosticsSnapshot,
  isDevOperationStale,
  recordDevEvent,
  subscribeToDevDiagnostics
} from "./devDiagnosticsStore";

type ErrorUtilsShape = {
  getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

type DevDiagnosticsSnapshot = {
  events: DevDiagnosticEvent[];
  operations: DevDiagnosticOperation[];
};

type DevErrorBoundaryState = {
  error: Error | null;
};

class DevErrorBoundary extends Component<PropsWithChildren, DevErrorBoundaryState> {
  state: DevErrorBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    recordDevEvent("error", "React render failure", `${error.stack ?? error.message}\n${errorInfo.componentStack}`);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.boundaryContainer}>
        <Text style={styles.boundaryEyebrow}>Dev Mode Failure</Text>
        <Text style={styles.boundaryTitle}>{this.state.error.message}</Text>
        <ScrollView style={styles.boundaryScroll}>
          <Text style={styles.boundaryStack}>{this.state.error.stack}</Text>
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={styles.boundaryButton}
        >
          <Text style={styles.boundaryButtonText}>Try Render Again</Text>
        </Pressable>
      </View>
    );
  }
}

export function DevDiagnosticsRoot({ children }: PropsWithChildren) {
  if (!isOrcaDevMode) {
    return <>{children}</>;
  }

  return (
    <DevErrorBoundary>
      {children}
      <DevDiagnosticsConsole />
    </DevErrorBoundary>
  );
}

function DevDiagnosticsConsole() {
  const [snapshot, setSnapshot] = useState<DevDiagnosticsSnapshot>(() => getDevDiagnosticsSnapshot());
  const [isOpen, setIsOpen] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => subscribeToDevDiagnostics(setSnapshot), []);

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const originalWarn = console.warn;
    const originalError = console.error;
    const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
    const originalGlobalHandler = errorUtils?.getGlobalHandler?.();

    console.warn = (...args: unknown[]) => {
      recordDevEvent("warning", "Console warning", args.map(String).join(" "));
      originalWarn(...args);
    };

    console.error = (...args: unknown[]) => {
      recordDevEvent("error", "Console error", args.map(String).join(" "));
      originalError(...args);
    };

    errorUtils?.setGlobalHandler?.((error, isFatal) => {
      recordDevEvent(isFatal ? "error" : "warning", isFatal ? "Fatal runtime error" : "Runtime error", error);
      originalGlobalHandler?.(error, isFatal);
    });

    recordDevEvent("info", "Dev diagnostics enabled", "Started with EXPO_PUBLIC_ORCA_DEV_MODE=1.");

    return () => {
      console.warn = originalWarn;
      console.error = originalError;
      if (originalGlobalHandler) {
        errorUtils?.setGlobalHandler?.(originalGlobalHandler);
      }
    };
  }, []);

  const stuckOperations = useMemo(
    () => snapshot.operations.filter((operation) => isDevOperationStale(operation, clock)),
    [clock, snapshot.operations]
  );

  const unresolvedOperations = snapshot.operations.filter((operation) => operation.status === "pending");
  const latestFailure = snapshot.events.find((event) => event.level === "error");
  const badgeText = stuckOperations.length > 0 ? `${stuckOperations.length} stuck` : latestFailure ? "error" : "dev";

  async function copyLogs() {
    const copiedAt = Date.now();

    try {
      await Clipboard.setStringAsync(formatDevDiagnosticsSnapshot(snapshot, copiedAt));
      setCopyStatus("Logs copied");
      recordDevEvent("info", "Copied dev diagnostics logs", `Copied ${snapshot.operations.length} operations and ${snapshot.events.length} events.`);
    } catch (error) {
      setCopyStatus("Copy failed");
      recordDevEvent("error", "Could not copy dev diagnostics logs", error);
    }
  }

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      {isOpen ? (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelEyebrow}>Dev Mode</Text>
              <Text style={styles.panelTitle}>Diagnostics</Text>
              {copyStatus ? <Text style={styles.panelStatus}>{copyStatus}</Text> : null}
            </View>
            <View style={styles.panelActions}>
              <Pressable accessibilityRole="button" onPress={copyLogs} style={styles.iconButton}>
                <Text style={styles.iconButtonText}>Copy Logs</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={clearDevDiagnostics} style={styles.iconButton}>
                <Text style={styles.iconButtonText}>Clear</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setIsOpen(false)} style={styles.iconButton}>
                <Text style={styles.iconButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.panelScroll}>
            <DiagnosticSection title="Stuck" emptyText="No pending operation has crossed the stuck threshold.">
              {stuckOperations.map((operation) => (
                <OperationRow key={operation.id} operation={operation} currentTime={clock} />
              ))}
            </DiagnosticSection>

            <DiagnosticSection title="Pending" emptyText="No tracked operations are pending.">
              {unresolvedOperations.map((operation) => (
                <OperationRow key={operation.id} operation={operation} currentTime={clock} />
              ))}
            </DiagnosticSection>

            <DiagnosticSection title="Failures And Signals" emptyText="No warnings or errors recorded yet.">
              {snapshot.events.map((event) => (
                <EventRow event={event} key={event.id} />
              ))}
            </DiagnosticSection>
          </ScrollView>
        </View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => setIsOpen(true)} style={styles.fab}>
        <Text style={styles.fabText}>{badgeText}</Text>
      </Pressable>
    </View>
  );
}

function DiagnosticSection({ children, emptyText, title }: PropsWithChildren<{ emptyText: string; title: string }>) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hasChildren ? children : <Text style={styles.emptyText}>{emptyText}</Text>}
    </View>
  );
}

function OperationRow({ currentTime, operation }: { currentTime: number; operation: DevDiagnosticOperation }) {
  const elapsedSeconds = Math.max(0, Math.round((currentTime - Date.parse(operation.startedAt)) / 1000));

  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>
        {operation.label} / {operation.status} / {elapsedSeconds}s
      </Text>
      {operation.detail ? <Text style={styles.rowDetail}>{operation.detail}</Text> : null}
    </View>
  );
}

function EventRow({ event }: { event: DevDiagnosticEvent }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>
        {event.level.toUpperCase()} / {new Date(event.createdAt).toLocaleTimeString()}
      </Text>
      <Text style={styles.rowMessage}>{event.message}</Text>
      {event.detail ? <Text style={styles.rowDetail}>{event.detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  boundaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18
  },
  boundaryButtonText: {
    color: "#000000",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  boundaryContainer: {
    backgroundColor: "#000000",
    flex: 1,
    gap: 16,
    padding: 24,
    paddingTop: 72
  },
  boundaryEyebrow: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  boundaryScroll: {
    borderColor: "#444444",
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    padding: 12
  },
  boundaryStack: {
    color: "#D8D8D8",
    fontFamily: "Courier",
    fontSize: 11,
    lineHeight: 16
  },
  boundaryTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0
  },
  emptyText: {
    color: "#9A9A9A",
    fontSize: 12,
    lineHeight: 17
  },
  fab: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#000000",
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 72,
    paddingHorizontal: 12
  },
  fabText: {
    color: "#000000",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  iconButton: {
    borderColor: "#5A5A5A",
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  iconButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  overlay: {
    bottom: 96,
    position: "absolute",
    right: 14,
    zIndex: 9999
  },
  panel: {
    backgroundColor: "#101010",
    borderColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    maxHeight: 520,
    width: 330
  },
  panelActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    maxWidth: 190
  },
  panelEyebrow: {
    color: "#BDBDBD",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  panelHeader: {
    alignItems: "flex-start",
    borderBottomColor: "#3A3A3A",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12
  },
  panelScroll: {
    maxHeight: 448
  },
  panelStatus: {
    color: "#BDBDBD",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 2
  },
  panelTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0
  },
  row: {
    borderTopColor: "#303030",
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingVertical: 9
  },
  rowDetail: {
    color: "#BDBDBD",
    fontFamily: "Courier",
    fontSize: 10,
    lineHeight: 15
  },
  rowMessage: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  rowTitle: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  section: {
    padding: 12
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: "uppercase"
  }
});
