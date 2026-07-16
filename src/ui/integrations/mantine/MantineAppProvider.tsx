import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import type { ReactNode } from "react";
import { useTheme } from "../../hooks/useTheme";

export function MantineAppProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const colorScheme = theme.endsWith("-dark") ? "dark" : "light";

  return (
    <MantineProvider defaultColorScheme={colorScheme} forceColorScheme={colorScheme}>
      <DatesProvider settings={{ consistentWeeks: true }}>{children}</DatesProvider>
    </MantineProvider>
  );
}
