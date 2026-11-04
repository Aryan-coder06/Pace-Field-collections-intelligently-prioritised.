import type { LoanSummary, PaceUser } from "@pace/types";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const send = async () => {
    try {
      return await fetch(`${API}${path}`, {
        ...init,
        credentials: "include",
        headers: {
          ...(init?.body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...init?.headers,
        },
      });
    } catch {
      throw new Error(
        "Pace can’t reach the service. Check your connection and try again.",
      );
    }
  };
  let response = await send();
  if (response.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await fetch(`${API}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) response = await send();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : (detail?.message ??
            detail?.code ??
            "Something went wrong. Please try again."),
    );
  }
  return response.json() as Promise<T>;
}
export type User = PaceUser;
export type Loan = LoanSummary;
