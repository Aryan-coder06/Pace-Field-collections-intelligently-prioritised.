import { API } from "@/lib/api";

export type Connectivity = "ONLINE" | "OFFLINE" | "CHECKING";
let state: Connectivity = "CHECKING";
const listeners = new Set<() => void>();
function publish(next: Connectivity) {
  if (state !== next) {
    state = next;
    listeners.forEach((listener) => listener());
  }
}
export function subscribeConnectivity(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getConnectivity = () => state;
export const getServerConnectivity = (): Connectivity => "CHECKING";
export async function checkApiConnectivity() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    publish("OFFLINE");
    return false;
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${API}/health`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    publish(response.ok ? "ONLINE" : "OFFLINE");
    return response.ok;
  } catch {
    publish("OFFLINE");
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
export const markOffline = () => publish("OFFLINE");
