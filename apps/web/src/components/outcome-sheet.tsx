"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MapPin, X } from "lucide-react";
import type { User } from "@/lib/api";
import { enqueueOutcome, syncNow } from "@/lib/offline";

type Outcome = "PAID" | "PROMISE_TO_PAY" | "NOT_REACHABLE" | "DISPUTE";
const options: { value: Outcome; label: string; description: string }[] = [
  {
    value: "PAID",
    label: "Paid (reported)",
    description: "Record a reported collection, pending verification",
  },
  {
    value: "PROMISE_TO_PAY",
    label: "Promise to pay",
    description: "Record amount and agreed due date",
  },
  {
    value: "NOT_REACHABLE",
    label: "Not reachable",
    description: "No borrower contact was made",
  },
  {
    value: "DISPUTE",
    label: "Dispute",
    description: "Flag this account for manager review",
  },
];
type Location = {
  latitude?: number;
  longitude?: number;
  location_status: string;
};
export function OutcomeSheet({
  loanId,
  borrower,
  onClose,
  assignmentVersion,
}: {
  loanId: number;
  borrower: string;
  onClose: () => void;
  assignmentVersion: number;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<Outcome | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<"SYNCED" | "QUEUED" | null>(null);
  const [eventId, setEventId] = useState(() => crypto.randomUUID());
  async function location(): Promise<Location> {
    if (!navigator.geolocation) return { location_status: "UNAVAILABLE" };
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve(
            pos.coords.accuracy > 300
              ? {
                  location_status: "LOW_ACCURACY",
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                }
              : {
                  location_status: "CAPTURED",
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                },
          ),
        (err) =>
          resolve({
            location_status:
              err.code === 1
                ? "DENIED"
                : err.code === 3
                  ? "TIMEOUT"
                  : "UNAVAILABLE",
          }),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
      ),
    );
  }
  async function save() {
    if (!type) return;
    setBusy(true);
    setError("");
    try {
      const gps = await location();
      const user = qc.getQueryData<User>(["me"]);
      if (!user)
        throw new Error(
          "Your verified session is required to save this outcome.",
        );
      const queued = await enqueueOutcome(
        user,
        loanId,
        assignmentVersion,
        {
          outcome_type: type,
          notes,
          reported_amount: type === "PAID" && amount ? amount : null,
          promised_amount: type === "PROMISE_TO_PAY" ? amount : null,
          promise_date: type === "PROMISE_TO_PAY" ? date : null,
          ...gps,
        },
        eventId,
      );
      const results = await syncNow(user);
      const result = results.find(
        (item) => item.client_event_id === queued.client_event_id,
      );
      if (result?.status === "CONFLICT" || result?.status === "REJECTED") {
        throw new Error(
          result.error?.message ?? "The server could not accept this outcome.",
        );
      }
      setSuccess(result?.status === "ACKNOWLEDGED" ? "SYNCED" : "QUEUED");
      setEventId(crypto.randomUUID());
      for (const key of [
        ["loan", String(loanId)],
        ["today"],
        ["promises"],
        ["activity"],
        ["manager"],
      ])
        qc.invalidateQueries({ queryKey: key });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save outcome.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="outcome-sheet real-outcome-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="outcome-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="sheet-close" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
        {success ? (
          <div className="outcome-success">
            <CheckCircle2 size={32} />
            <h2>
              {success === "SYNCED" ? "Outcome recorded" : "Saved on device"}
            </h2>
            <p>
              {success === "SYNCED"
                ? "The server acknowledged this event and updated the branch record."
                : "This outcome is safely queued. Pace will verify and sync it when the API is reachable."}
            </p>
            <button className="btn" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <span className="eyebrow">FIELD RECORD · {borrower}</span>
            <h2 id="outcome-title">Log an outcome</h2>
            <p className="muted">
              Select what happened. Payment entries are reports, not verified
              settlements.
            </p>
            <div className="outcome-options">
              {options.map((option) => (
                <button
                  key={option.value}
                  className={type === option.value ? "selected" : ""}
                  onClick={() => {
                    setType(option.value);
                    setError("");
                  }}
                >
                  <b>{option.label}</b>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
            {type && (
              <div className="outcome-fields">
                {(type === "PAID" || type === "PROMISE_TO_PAY") && (
                  <label>
                    {type === "PAID"
                      ? "Reported amount (optional)"
                      : "Promised amount"}
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="₹ Amount"
                    />
                  </label>
                )}
                {type === "PROMISE_TO_PAY" && (
                  <label>
                    Promise date
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </label>
                )}
                {type !== "NOT_REACHABLE" && (
                  <label>
                    {type === "DISPUTE"
                      ? "Dispute explanation"
                      : "Notes (optional)"}
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Add context for the branch"
                    />
                  </label>
                )}
              </div>
            )}
            <p className="location-note">
              <MapPin size={14} /> Location requested on save. If unavailable,
              your work is still recorded.
            </p>
            {error && (
              <p className="import-alert" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn sheet-save"
              disabled={
                !type ||
                busy ||
                (type === "PROMISE_TO_PAY" && (!amount || !date)) ||
                (type === "DISPUTE" && notes.trim().length < 8)
              }
              onClick={save}
            >
              {busy ? "Saving outcome…" : "Save outcome"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
