import { StyleSheet } from "react-native";

// Native: quiet grouped surfaces, system typography, and one blue action color.
export const palettes = {
  light: {
    accent: "#195AC3", accentSoft: "#E8EFFC", background: "#F3F3F6",
    surface: "#FFFFFF", surfaceInset: "#EDEEF3", border: "#DADCE3",
    text: "#1D1E22", secondaryText: "#575961", mutedText: "#65666E",
    onAccent: "#FFFFFF", warm: "#925008", warmSoft: "#FFF1DA", danger: "#B42332"
  },
  dark: {
    accent: "#84B1FF", accentSoft: "#25334C", background: "#171719",
    surface: "#242427", surfaceInset: "#303035", border: "#3D3D43",
    text: "#F4F4F6", secondaryText: "#C3C4CC", mutedText: "#A9AAB3",
    onAccent: "#101D33", warm: "#EAB875", warmSoft: "#382D20", danger: "#FF8F97"
  }
};

export type ThemeColors = typeof palettes.light;
export type Appearance = keyof typeof palettes;

export function createSurfaces(colors: ThemeColors) {
  return StyleSheet.create({
    group: { backgroundColor: colors.surface, borderRadius: 16 },
    control: { backgroundColor: colors.surface, borderRadius: 12 },
    input: { backgroundColor: colors.surfaceInset, borderRadius: 12 },
    primary: { backgroundColor: colors.accent, borderRadius: 14 },
    content: {
      paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32,
      width: "100%", maxWidth: 720, alignSelf: "center"
    }
  });
}

export const surfaces = { light: createSurfaces(palettes.light), dark: createSurfaces(palettes.dark) };
export type ThemeSurfaces = ReturnType<typeof createSurfaces>;

// Build both sheets once. React selects the matching sheet when appearance changes.
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ThemeColors, ui: ThemeSurfaces) => T
) {
  return {
    light: StyleSheet.create(factory(palettes.light, surfaces.light)),
    dark: StyleSheet.create(factory(palettes.dark, surfaces.dark))
  };
}
