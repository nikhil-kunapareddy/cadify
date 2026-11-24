import { create } from "zustand";

interface NetworkState {
  online: boolean;
}

export const useNetworkStore = create<NetworkState>(() => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
}));

export function initNetworkMonitor(onChange?: (online: boolean) => void): () => void {
  const update = () => {
    const online = navigator.onLine;
    if (online === useNetworkStore.getState().online) return;
    useNetworkStore.setState({ online });
    onChange?.(online);
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}
