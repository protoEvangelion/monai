import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const themePalettes = ['ocean', 'graphite', 'sunset'] as const

export type ThemePalette = (typeof themePalettes)[number]
export type ThemeName = ThemePalette | `${ThemePalette}-dark`

interface ThemeState {
  theme: ThemeName
  toggleTheme: () => void
  setTheme: (theme: ThemeName) => void
  setPalette: (palette: ThemePalette) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'ocean',
      toggleTheme: () => set((state) => ({
        theme: state.theme.endsWith('-dark')
          ? (state.theme.replace('-dark', '') as ThemeName)
          : (`${state.theme}-dark` as ThemeName),
      })),
      setTheme: (theme) => set({ theme }),
      setPalette: (palette) => set((state) => ({
        theme: state.theme.endsWith('-dark')
          ? (`${palette}-dark` as ThemeName)
          : palette,
      })),
    }),
    {
      name: 'monai-theme',
    }
  )
)
