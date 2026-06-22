import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TimeTravelState {
  viewDate: string // ISO string for the start of the month
  setViewDate: (date: string) => void
  resetToCurrentMonth: () => void
}

function currentMonthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function clampToCurrentMonth(date: string) {
  const requested = new Date(date)
  const current = currentMonthStart()

  if (Number.isNaN(requested.getTime()) || requested > current) {
    return current.toISOString()
  }

  return new Date(requested.getFullYear(), requested.getMonth(), 1).toISOString()
}

export const useTimeTravel = create<TimeTravelState>()(
  persist(
    (set) => ({
      viewDate: currentMonthStart().toISOString(),
      setViewDate: (date: string) => set({ viewDate: clampToCurrentMonth(date) }),
      resetToCurrentMonth: () => set({
        viewDate: currentMonthStart().toISOString()
      }),
    }),
    {
      name: 'monai-time-travel',
    }
  )
)
