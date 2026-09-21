import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";

interface ThemeState {
  theme: ThemeName;
  toggleTheme: () => void;
  setTheme: (theme: ThemeName) => void;
}

function normalizeTheme(value: unknown): ThemeName {
  if (value === "light" || value === "dark") return value;
  if (typeof value === "string" && value.endsWith("-dark")) return "dark";
  return "dark";
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "dark" ? "light" : "dark",
        })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "monai-theme",
      version: 2,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as { theme?: unknown };
        return { theme: normalizeTheme(state.theme) };
      },
    },
  ),
);
