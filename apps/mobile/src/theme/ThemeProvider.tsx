import { createContext, PropsWithChildren, useContext } from "react";
import { useColorScheme } from "react-native";
import { palettes, surfaces, type Appearance } from "./designSystem";

const ThemeContext = createContext<Appearance>("light");

export function ThemeProvider({ children }: PropsWithChildren) {
  const appearance = useColorScheme() === "dark" ? "dark" : "light";
  return <ThemeContext.Provider value={appearance}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const appearance = useContext(ThemeContext);
  return { appearance, isDark: appearance === "dark", colors: palettes[appearance], ui: surfaces[appearance] };
}

export function useThemeStyles<T>(sheets: { light: T; dark: T }) {
  const theme = useAppTheme();
  return { ...theme, styles: sheets[theme.appearance] };
}
