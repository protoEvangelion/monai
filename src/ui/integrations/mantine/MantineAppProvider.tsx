import { createTheme, MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import type { ReactNode } from "react";
import { useTheme } from "../../hooks/useTheme";

const bezelMantineTheme = createTheme({
  fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif",
  primaryColor: "teal",
  defaultRadius: "md",
  colors: {
    // Bezel primary teal ramp (approx from base.color.teal)
    teal: [
      "#f0fdfa",
      "#ccfbf1",
      "#99f6e4",
      "#5eead4",
      "#2dd4bf",
      "#14B8A6",
      "#0d9488",
      "#0f766e",
      "#115e59",
      "#134e4a",
    ],
  },
  other: {
    bezelBackground: "var(--page)",
    bezelCard: "var(--card)",
    bezelBorder: "var(--border)",
    bezelForeground: "var(--foreground)",
  },
});

export function MantineAppProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const colorScheme = theme === "dark" ? "dark" : "light";

  return (
    <MantineProvider
      theme={bezelMantineTheme}
      defaultColorScheme={colorScheme}
      forceColorScheme={colorScheme}
      cssVariablesResolver={() => ({
        variables: {
          "--mantine-color-body": "var(--page)",
          "--mantine-color-text": "var(--foreground)",
          "--mantine-color-dimmed": "var(--muted-foreground)",
          "--mantine-color-placeholder": "var(--muted-foreground)",
          "--mantine-color-anchor": "var(--primary)",
        },
        light: {
          "--mantine-color-body": "var(--page)",
          "--mantine-color-default": "var(--card)",
          "--mantine-color-default-hover":
            "color-mix(in oklch, var(--primary) 10%, var(--card))",
          "--mantine-color-default-border": "var(--border)",
        },
        dark: {
          "--mantine-color-body": "var(--page)",
          "--mantine-color-default": "var(--card)",
          "--mantine-color-default-hover":
            "color-mix(in oklch, var(--primary) 10%, var(--card))",
          "--mantine-color-default-border": "var(--border)",
        },
      })}
    >
      <DatesProvider settings={{ consistentWeeks: true }}>{children}</DatesProvider>
    </MantineProvider>
  );
}
