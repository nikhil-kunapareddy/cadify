import { create } from "zustand";
import { services } from "@/services";
import type { AppError } from "@/types/errors";
import type { CredentialStatus, KeyValidation } from "@/types/settings";
import { toAppError } from "@/utils/errors";

interface CredentialState {
  status: CredentialStatus | null;
  loading: boolean;
  busy: "saving" | "removing" | "validating" | null;
  error: AppError | null;
  refresh: () => Promise<void>;
  save: (apiKey: string) => Promise<boolean>;
  remove: () => Promise<boolean>;
  validate: (candidate?: string) => Promise<KeyValidation | null>;
}

export const useCredentialStore = create<CredentialState>((set, get) => ({
  status: null,
  loading: true,
  busy: null,
  error: null,

  refresh: async () => {
    set({ loading: true });
    try {
      const status = await services.credentials.status();
      set({ status, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: toAppError(err, "KEYCHAIN_ERROR") });
    }
  },

  save: async (apiKey) => {
    set({ busy: "saving", error: null });
    try {
      const status = await services.credentials.save(apiKey);
      set({ status, busy: null });
      return true;
    } catch (err) {
      set({ busy: null, error: toAppError(err, "KEYCHAIN_ERROR") });
      return false;
    }
  },

  remove: async () => {
    set({ busy: "removing", error: null });
    try {
      const status = await services.credentials.remove();
      set({ status, busy: null });
      return true;
    } catch (err) {
      set({ busy: null, error: toAppError(err, "KEYCHAIN_ERROR") });
      return false;
    }
  },

  validate: async (candidate) => {
    set({ busy: "validating", error: null });
    try {
      const result = await services.credentials.validate(candidate);
      const current = get().status;
      // Only a check of the stored key updates the stored status.
      if (!candidate && current) set({ status: { ...current, lastValidation: result } });
      set({ busy: null });
      return result;
    } catch (err) {
      set({ busy: null, error: toAppError(err) });
      return null;
    }
  },
}));
