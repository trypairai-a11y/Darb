/**
 * languageStore.ts — persisted UI language ("en" | "ar").
 *
 * Mirrors the driverStore persistence pattern (zustand + AsyncStorage). The
 * store is the single writer of the i18n module's active dictionary: it calls
 * setLanguage() when AsyncStorage rehydrates at boot and on every user change.
 * The root layout gates first render on `hydrated` (fail-open with the same
 * boot timeout used for fonts) and re-keys the navigator on `lang` so a switch
 * re-renders every mounted screen without an app restart.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { setLanguage, type Lang } from "../i18n/strings";

export interface LanguageStoreState {
  lang: Lang;
  /** AsyncStorage rehydrate finished (success or failure — fail-open to EN). */
  hydrated: boolean;
  setLang: (lang: Lang) => void;
  markHydrated: () => void;
}

export const useLanguageStore = create<LanguageStoreState>()(
  persist(
    (set) => ({
      lang: "en",
      hydrated: false,
      setLang: (lang) => {
        setLanguage(lang);
        set({ lang });
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "darb-language",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lang: s.lang }),
      onRehydrateStorage: () => (state, error) => {
        // Sync the i18n module BEFORE the root layout lifts its render gate.
        if (state && !error) setLanguage(state.lang);
        useLanguageStore.getState().markHydrated();
      },
    },
  ),
);
