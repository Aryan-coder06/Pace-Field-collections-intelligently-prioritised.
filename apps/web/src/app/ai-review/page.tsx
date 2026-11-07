"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { request } from "@/lib/api";

type QueueItem = {
  id: number;
  loan_number: string;
  borrower: string;
  outstanding: string;
  dpd: number;
  score: number;
  band: string;
  reasons: string[];
  priority_source: string;
  priority_model_version?: string | null;
  override_rank?: number | null;
  override_reason?: string | null;
  override_version?: number | null;
};
type Overview = {
  model: null | {
    version: string;
    trained_at: string;
    training_start: string;
    training_end: string;
    sample_count: number;
    positive_count: number;
    metrics: {
      auc: number | null;
      accuracy: number;
      precision: number | null;
      recall: number | null;
      brier: number;
    };
  };
  queue: QueueItem[];
  active_overrides: number;
};
type SyncOverview = {
  acknowledged: number;
  conflicts: number;
  rejected: number;
};
type Backtest = {
  model_version: string;
  method: string;
  periods: {
    period: string;
    observations: number;
    positives: number;
    auc: number | null;
    brier: number;
  }[];
};
const compact = (value: string) => `₹${(Number(value) / 100000).toFixed(1)}L`;

export default function AiReviewPage() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [rank, setRank] = useState("1");
  const [reason, setReason] = useState("");
  const overview = useQuery({
    queryKey: ["ai-overview"],
    queryFn: () => request<Overview>("/manager/ai/overview"),
  });
  const sync = useQuery({
    queryKey: ["sync-overview"],
    queryFn: () => request<SyncOverview>("/manager/sync/overview"),
  });
  const backtest = useQuery({
    queryKey: ["ai-backtest", overview.data?.model?.version],
    queryFn: () => request<Backtest>("/manager/ai/backtest"),
    enabled: Boolean(overview.data?.model),
  });
  const train = useMutation({
    mutationFn: () => request("/manager/ai/train", { method: "POST" }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["ai-overview"] });
      await client.invalidateQueries({ queryKey: ["manager"] });
    },
  });
  const override = useMutation({
    mutationFn: () =>
      request(`/manager/ai/loans/${selected!.id}/override`, {
        method: "POST",
        body: JSON.stringify({
          rank: Number(rank),
          reason,
          expected_version: selected!.override_version ?? null,
        }),
      }),
    onSuccess: async () => {
      setSelected(null);
      setReason("");
      await client.invalidateQueries({ queryKey: ["ai-overview"] });
    },
  });

  return (
    <main className="workflow-page ai-page">
      <header className="workflow-head">
        <div>
          <Link href="/" className="back-link">
            <ArrowLeft size={16} /> Branch overview
          </Link>
          <span className="eyebrow">DECISION SUPPORT · HUMAN CONTROLLED</span>
          <h1>Priority intelligence</h1>
          <p className="muted">
            Inspect the trained recommendation, understand its evidence, and
            override ordering with a retained rationale.
          </p>
        </div>
        <button
          className="btn"
          onClick={() => train.mutate()}
          disabled={train.isPending}
        >
          <RefreshCw size={16} />{" "}
          {train.isPending
            ? "Training model…"
            : overview.data?.model
              ? "Retrain from history"
              : "Train from history"}
        </button>
      </header>
      {(overview.isError || train.isError) && (
        <p className="import-alert" role="alert">
          {overview.error?.message ?? train.error?.message}
        </p>
      )}
      {overview.isLoading ? (
        <div className="surface skeleton ai-skeleton" />
      ) : (
        overview.data && (
          <>
            <section className="ai-model-strip surface">
              <div className="ai-model-name">
                <span>
                  <BrainCircuit size={20} />
                </span>
                <div>
                  <small>ACTIVE RECOMMENDATION</small>
                  <b>
                    {overview.data.model
                      ? "Explainable logistic risk model"
                      : "Seeded demonstration scores"}
                  </b>
                  <em>
                    {overview.data.model?.version ??
                      "Train a model to replace seeded ranking"}
                  </em>
                </div>
              </div>
              {overview.data.model ? (
                <>
                  <div>
                    <small>BACK-TEST AUC</small>
                    <strong>
                      {overview.data.model.metrics.auc?.toFixed(2) ?? "—"}
                    </strong>
                    <em>Discrimination, 0.50 = chance</em>
                  </div>
                  <div>
                    <small>BRIER SCORE</small>
                    <strong>
                      {overview.data.model.metrics.brier.toFixed(2)}
                    </strong>
                    <em>Probability error, lower is better</em>
                  </div>
                  <div>
                    <small>TRAINING COVERAGE</small>
                    <strong>{overview.data.model.sample_count}</strong>
                    <em>
                      {overview.data.model.positive_count} roll-forward events
                    </em>
                  </div>
                </>
              ) : (
                <div className="ai-untrained">
                  No trained run exists. Current scores remain visibly labelled
                  as seeded.
                </div>
              )}
            </section>
            <section className="ai-governance-grid">
              <div className="surface ai-queue-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">OFFICER QUEUE EVIDENCE</span>
                    <h2>Ranked accounts</h2>
                  </div>
                  <span className="queue-count">
                    {overview.data.active_overrides} overrides
                  </span>
                </div>
                <div className="ai-table-head">
                  <span>Account</span>
                  <span>Exposure</span>
                  <span>Risk</span>
                  <span>Decision</span>
                </div>
                <div className="ai-rows">
                  {overview.data.queue.map((loan, index) => (
                    <article key={loan.id} className="ai-row">
                      <span className="ai-rank">
                        {String(loan.override_rank ?? index + 1).padStart(
                          2,
                          "0",
                        )}
                      </span>
                      <div className="ai-account">
                        <b>{loan.borrower}</b>
                        <small>
                          {loan.loan_number} · {loan.dpd} DPD
                        </small>
                        <p>
                          <ShieldCheck size={13} /> {loan.reasons[0]}
                        </p>
                      </div>
                      <div className="ai-exposure">
                        <b>{compact(loan.outstanding)}</b>
                        <small>outstanding</small>
                      </div>
                      <div className="ai-risk">
                        <b>{loan.score}</b>
                        <small>
                          {loan.band} ·{" "}
                          {loan.priority_source === "TRAINED_MODEL"
                            ? "model"
                            : "seeded"}
                        </small>
                      </div>
                      <div className="ai-decision">
                        {loan.override_rank && (
                          <span>
                            <CheckCircle2 size={13} /> Manager #
                            {loan.override_rank}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setSelected(loan);
                            setRank(String(loan.override_rank ?? index + 1));
                            setReason(loan.override_reason ?? "");
                          }}
                        >
                          Override
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <aside className="surface ai-operations">
                <span className="eyebrow">OFFLINE OPERATIONS</span>
                <h2>Sync assurance</h2>
                <div>
                  <span>Acknowledged events</span>
                  <b>{sync.data?.acknowledged ?? "—"}</b>
                </div>
                <div>
                  <span>Conflicts needing review</span>
                  <b>{sync.data?.conflicts ?? "—"}</b>
                </div>
                <div>
                  <span>Rejected events</span>
                  <b>{sync.data?.rejected ?? "—"}</b>
                </div>
                <p>
                  Device events remain retained until the server returns a
                  per-event acknowledgement. Conflicts never overwrite
                  assignment changes.
                </p>
                {backtest.data && (
                  <div className="ai-backtest">
                    <span className="eyebrow">WEEKLY BACK-TEST</span>
                    {backtest.data.periods.slice(-4).map((period) => (
                      <p key={period.period}>
                        <b>{period.period}</b>
                        <span>
                          {period.observations} cases · AUC{" "}
                          {period.auc?.toFixed(2) ?? "n/a"} · Brier{" "}
                          {period.brier.toFixed(2)}
                        </span>
                      </p>
                    ))}
                    <small>{backtest.data.method}</small>
                  </div>
                )}
              </aside>
            </section>
          </>
        )
      )}
      {selected && (
        <div className="sheet-backdrop" onClick={() => setSelected(null)}>
          <section
            className="outcome-sheet ai-override-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="override-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="sheet-close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">
              HUMAN OVERRIDE · {selected.loan_number}
            </span>
            <h2 id="override-title">Reposition {selected.borrower}</h2>
            <p className="muted">
              The model score stays intact for audit and back-testing. Your rank
              controls the operational queue.
            </p>
            <label className="field-label">
              Queue rank
              <input
                type="number"
                min="1"
                max="100"
                value={rank}
                onChange={(event) => setRank(event.target.value)}
              />
            </label>
            <label className="field-label">
              Rationale
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain the operational evidence for this decision"
              />
            </label>
            {override.isError && (
              <p className="import-alert" role="alert">
                {override.error.message}
              </p>
            )}
            <button
              className="btn sheet-save"
              disabled={
                override.isPending ||
                reason.trim().length < 8 ||
                Number(rank) < 1
              }
              onClick={() => override.mutate()}
            >
              {override.isPending
                ? "Saving override…"
                : "Apply audited override"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
