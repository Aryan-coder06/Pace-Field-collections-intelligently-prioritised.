"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileUp,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { request, type User } from "@/lib/api";

type Row = {
  row: number;
  loan_id: string;
  borrower_name: string;
  outstanding_amount: string;
  dpd: number;
  pincode: string;
  existing: boolean;
  errors: string[];
};
type Preview = {
  id: number;
  status: string;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
    existing: number;
    new: number;
    already_imported?: boolean;
    assigned?: number;
    retained?: number;
    unassigned?: number;
  };
  rows: Row[];
};
type History = {
  id: number;
  filename: string;
  status: string;
  date: string;
  summary: Preview["summary"];
};
export default function ImportsPage() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Preview["summary"] | null>(null);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => request<User>("/auth/me"),
  });
  const history = useQuery({
    queryKey: ["imports"],
    queryFn: () => request<History[]>("/manager/imports"),
    enabled: me.data?.role === "BRANCH_MANAGER",
  });
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setSuccess(null);
    setPreview(null);
    try {
      const body = new FormData();
      body.append("file", file);
      setPreview(
        await request<Preview>("/manager/imports/preview", {
          method: "POST",
          body,
        }),
      );
      queryClient.invalidateQueries({ queryKey: ["imports"] });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not validate CSV.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ summary: Preview["summary"] }>(
        `/manager/imports/${preview.id}/confirm`,
        { method: "POST" },
      );
      setSuccess(result.summary);
      setPreview(null);
      for (const key of [
        ["imports"],
        ["manager"],
        ["officers"],
        ["assignments"],
      ])
        queryClient.invalidateQueries({ queryKey: key });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not confirm import.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (me.isLoading)
    return (
      <main className="import-page">
        <div className="surface skeleton" />
      </main>
    );
  if (me.isError || me.data?.role !== "BRANCH_MANAGER")
    return (
      <main className="import-page">
        <p>You need branch manager access to view imports.</p>
        <Link href="/">Back to Pace</Link>
      </main>
    );
  return (
    <main className="import-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Branch overview
      </Link>
      <header className="import-header">
        <div>
          <span className="eyebrow">DAILY DATA OPERATIONS</span>
          <h1>Import overdue accounts</h1>
          <p className="muted">
            Validate the branch file before snapshots and assignments are
            committed.
          </p>
        </div>
        <a className="btn secondary" href="/sample-overdue-valid.csv" download>
          Download sample CSV
        </a>
      </header>
      <section
        className="import-drop surface"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          upload(event.dataTransfer.files[0]);
        }}
      >
        <FileUp size={28} />
        <h2>Drop your CSV here</h2>
        <p>UTF-8 CSV · maximum 2 MB · one loan per row</p>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => upload(event.target.files?.[0])}
        />
        <button
          className="btn"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Validating…" : "Choose file"}
        </button>
      </section>
      {error && (
        <div className="import-alert" role="alert">
          <AlertCircle size={18} /> {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {success && (
        <div className="import-success" role="status">
          <CheckCircle2 size={20} />
          <div>
            <b>Import confirmed</b>
            <p>
              {success.assigned ?? 0} assigned · {success.retained ?? 0}{" "}
              retained · {success.unassigned ?? 0} need review
            </p>
          </div>
          <Link href="/assignments">Review assignments →</Link>
        </div>
      )}
      {preview && (
        <section className="surface import-preview">
          <div className="panel-head">
            <div>
              <span className="eyebrow">VALIDATION PREVIEW</span>
              <h2>{preview.summary.total} rows reviewed</h2>
            </div>
            <span className="pill medium">{preview.summary.valid} valid</span>
          </div>
          <div className="import-stats">
            <span>{preview.summary.invalid} invalid</span>
            <span>{preview.summary.duplicates} duplicates</span>
            <span>{preview.summary.existing} existing</span>
            <span>{preview.summary.new} new</span>
          </div>
          {preview.summary.already_imported && (
            <p className="import-alert">
              This exact file was already confirmed.
            </p>
          )}
          <div className="import-rows">
            <div className="import-row import-row-head">
              <span>ROW / LOAN</span>
              <span>BORROWER</span>
              <span>OUTSTANDING</span>
              <span>STATUS</span>
            </div>
            {preview.rows.map((row) => (
              <div
                className={`import-row ${row.errors.length ? "invalid" : ""}`}
                key={row.row}
              >
                <span>
                  {row.row} · {row.loan_id}
                </span>
                <span>
                  {row.borrower_name}
                  <small>
                    {row.pincode} · {row.dpd} DPD
                  </small>
                </span>
                <span>
                  ₹{Number(row.outstanding_amount).toLocaleString("en-IN")}
                </span>
                <span>
                  {row.errors.length
                    ? row.errors.join(" ")
                    : row.existing
                      ? "Existing"
                      : "New"}
                </span>
              </div>
            ))}
          </div>
          <div className="import-confirm">
            <p>
              {preview.summary.invalid
                ? "Correct all invalid rows and upload again."
                : "Confirmation writes snapshots and assigns eligible accounts."}
            </p>
            <button
              className="btn"
              disabled={
                busy ||
                !!preview.summary.invalid ||
                !!preview.summary.already_imported
              }
              onClick={confirm}
            >
              {busy ? "Confirming…" : "Confirm import"}
            </button>
          </div>
        </section>
      )}
      <section className="surface import-history">
        <div className="panel-head">
          <div>
            <span className="eyebrow">AUDIT TRAIL</span>
            <h2>Import history</h2>
          </div>
          <FileText size={18} />
        </div>
        {history.isLoading ? (
          <div className="skeleton" />
        ) : history.isError ? (
          <button className="btn secondary" onClick={() => history.refetch()}>
            Retry history
          </button>
        ) : history.data?.length ? (
          history.data.map((item) => (
            <div className="import-history-row" key={item.id}>
              <b>{item.filename}</b>
              <span>{item.date}</span>
              <span>{item.summary.total} rows</span>
              <span
                className={`pill ${item.status === "CONFIRMED" ? "good" : "medium"}`}
              >
                {item.status}
              </span>
            </div>
          ))
        ) : (
          <p className="muted">No files uploaded yet.</p>
        )}
      </section>
    </main>
  );
}
