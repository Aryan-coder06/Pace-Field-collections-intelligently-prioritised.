"use client";
import { useState } from "react";
import { Phone } from "lucide-react";
import { request } from "@/lib/api";

export function contactOpen() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return hour >= 8 && hour < 19;
}

export function ContactButton({
  loanId,
  borrower,
  className = "btn",
}: {
  loanId: number;
  borrower: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = contactOpen();
  async function call() {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ phone: string }>(
        `/loans/${loanId}/contact-attempts`,
        {
          method: "POST",
          body: JSON.stringify({ channel: "CALL" }),
        },
      );
      window.location.href = `tel:${result.phone}`;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start contact.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="contact-button-wrap">
      <button
        type="button"
        className={className}
        onClick={call}
        disabled={!open || busy}
        aria-label={`Call ${borrower}`}
        title={
          !open
            ? "Borrower contact is available between 8:00 AM and 7:00 PM."
            : undefined
        }
      >
        <Phone size={16} /> {busy ? "Checking…" : "Call"}
      </button>
      {!open && <small>Contact: 8 AM–7 PM</small>}
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
