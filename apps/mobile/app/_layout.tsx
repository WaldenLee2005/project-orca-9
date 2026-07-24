import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { DevDiagnosticsRoot } from "../src/dev/DevDiagnostics";
import { ThemeProvider } from "../src/theme/ThemeProvider";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <DevDiagnosticsRoot>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#000000" }
          }}
        />
      </DevDiagnosticsRoot>
    </ThemeProvider>
  );
}
