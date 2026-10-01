import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "react-native" && context.parentURL?.endsWith("/theme/designSystem.ts")) {
    return { shortCircuit: true, url: "data:text/javascript,export const StyleSheet = { create: (styles) => styles };" };
  }
  return nextResolve(specifier, context);
} });
const { palettes, surfaces, createThemedStyles } = await import("../src/theme/designSystem.ts");
function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
for (const [appearance, colors] of Object.entries(palettes)) for (const [foreground, background] of [
  ["text", "background"], ["secondaryText", "background"], ["mutedText", "background"],
  ["text", "surface"], ["secondaryText", "surface"], ["mutedText", "surface"],
  ["text", "surfaceInset"], ["mutedText", "surfaceInset"],
  ["onAccent", "accent"], ["accent", "accentSoft"], ["warm", "warmSoft"],
  ["accent", "background"], ["warm", "background"], ["danger", "background"], ["onAccent", "danger"]
]) {
  test(`Native ${appearance}: ${foreground} on ${background} meets 4.5:1 text contrast`, () => {
    const first = luminance(colors[foreground]);
    const second = luminance(colors[background]);
    const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    assert.ok(ratio >= 4.5, `contrast was ${ratio.toFixed(2)}:1`);
  });
}
test("Native groups and controls stay flat in both appearances", () => {
  for (const [appearance, ui] of Object.entries(surfaces)) {
    for (const surface of [ui.group, ui.control, ui.input, ui.primary]) {
      assert.equal(surface.boxShadow, undefined);
      assert.equal(surface.shadowOpacity, undefined);
      assert.equal(surface.elevation, undefined);
    }
    assert.equal(ui.group.backgroundColor, palettes[appearance].surface);
    assert.equal(ui.input.backgroundColor, palettes[appearance].surfaceInset);
    assert.equal(ui.group.borderRadius, 16);
    assert.equal(ui.content.paddingBottom, 32, "in-flow tab bar needs no floating-bar spacer");
  }
});
test("bottom navigation is edge-to-edge and reserves its own safe-area space", () => {
  const tabs = readFileSync(new URL("../app/(tabs)/_layout.tsx", import.meta.url), "utf8");
  assert.match(tabs, /boxShadow: "none"/);
  assert.doesNotMatch(tabs, /position: "absolute"|navWidth|borderRadius|focused &&/);
  assert.match(tabs, /Math.max\(insets.bottom, 8\)/);
});
test("themed sheets resolve both surface and text colors", () => {
  const sheets = createThemedStyles((colors, ui) => ({ panel: { ...ui.group, color: colors.text } }));
  for (const appearance of ["light", "dark"]) {
    assert.equal(sheets[appearance].panel.color, palettes[appearance].text);
    assert.equal(sheets[appearance].panel.backgroundColor, palettes[appearance].surface);
  }
  assert.notEqual(sheets.light.panel.color, sheets.dark.panel.color);
});
test("system appearance and status-bar content follow the Native palette", () => {
  const { expo } = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
  assert.equal(expo.userInterfaceStyle, "automatic");
  assert.equal(expo.android.adaptiveIcon.backgroundColor, palettes.light.background);
  const provider = readFileSync(new URL("../src/theme/ThemeProvider.tsx", import.meta.url), "utf8");
  assert.match(provider, /useColorScheme\(\)/);
  const root = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
  assert.match(root, /StatusBar style=\{isDark \? "light" : "dark"\}/);
});
