import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TimeTravelState {
  viewDate: string // ISO string for the start of the month
  setViewDate: (date: string) => void
  resetToCurrentMonth: () => void
}

export const useTimeTravel = create<TimeTravelState>()(
  persist(
    (set) => ({
      viewDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      setViewDate: (date: string) => set({ viewDate: date }),
      resetToCurrentMonth: () => set({ 
        viewDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() 
      }),
    }),
    {
      name: 'monai-time-travel',
    }
  )
)
