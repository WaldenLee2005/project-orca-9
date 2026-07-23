import { createContext, PropsWithChildren, useContext } from "react";

const theme = {
  colors: {
    accent: "#FFFFFF",
    background: "#000000",
    border: "#CFCFCF",
    mutedText: "#A0A0A0",
    onAccent: "#000000",
    secondaryText: "#D8D8D8",
    surface: "#000000",
    text: "#FFFFFF"
  }
};

type AppTheme = typeof theme;

const ThemeContext = createContext<AppTheme>(theme);

export function ThemeProvider({ children }: PropsWithChildren) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
