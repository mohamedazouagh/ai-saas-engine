"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  runReconciliation,
  type ReconciliationFormState,
} from "./actions";
import type { ReconciliationCitation, ReconciliationStatus } from "@/lib/rag";

const initialState: ReconciliationFormState = {};

const STATUS_STYLES: Record<ReconciliationStatus, string> = {
  match: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  mismatch: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  missing: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  duplicate: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
};

const STATUS_LABELS: Record<ReconciliationStatus, string> = {
  match: "Match",
  mismatch: "Mismatch",
  missing: "Missing",
  duplicate: "Duplicate",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
    >
      {pending ? "Reconciling…" : "Run reconciliation"}
    </button>
  );
}

function formatQty(qty: number | null): string {
  return qty === null ? "—" : String(qty);
}

function formatDifference(diff: number | null): string {
  if (diff === null) return "—";
  return diff > 0 ? `+${diff}` : String(diff);
}

function SourceCell({ citations }: { citations: ReconciliationCitation[] }) {
  if (citations.length === 0) return <span className="text-gray-400">—</span>;

  return (
    <div className="flex flex-col gap-2">
      {citations.map((c) => (
        <details key={c.chunkId} className="group">
          <summary className="cursor-pointer text-xs text-gray-600 marker:content-none dark:text-gray-400">
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {c.filename}
            </span>{" "}
            · {c.sourceType === "csv" ? `line ${c.line}` : `page ${c.page}`}
          </summary>
          <p className="mt-1 rounded-md bg-gray-50 p-2 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
            &ldquo;{c.excerpt}&rdquo;
          </p>
        </details>
      ))}
    </div>
  );
}

export function ReconciliationPanel() {
  const [state, formAction] = useActionState(runReconciliation, initialState);
  const result = state.result;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Compare supplier packing lists against your latest Shopify CSV.
        </p>
        <form action={formAction}>
          <SubmitButton />
        </form>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      {result && result.abstained && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-medium">Reconciliation could not run.</p>
          <p className="mt-1">{result.message}</p>
        </div>
      )}

      {result && !result.abstained && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="rounded-lg border border-gray-200 px-4 py-2 dark:border-gray-800">
              <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Rows reconciled
              </span>
              <span className="text-lg font-semibold">{result.totalRows}</span>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-2 dark:border-gray-800">
              <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Matches
              </span>
              <span className="text-lg font-semibold text-green-700 dark:text-green-400">
                {result.matches}
              </span>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-2 dark:border-gray-800">
              <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Exceptions
              </span>
              <span className="text-lg font-semibold text-red-700 dark:text-red-400">
                {result.exceptions}
              </span>
            </div>
          </div>

          {result.message && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{result.message}</p>
          )}

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Expected qty</th>
                  <th className="px-3 py-2 font-medium">Actual qty</th>
                  <th className="px-3 py-2 font-medium">Difference</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={`${row.sku}-${i}`}
                    className={
                      row.status !== "match"
                        ? "border-b border-gray-100 bg-gray-50/60 last:border-0 dark:border-gray-900 dark:bg-gray-900/30"
                        : "border-b border-gray-100 last:border-0 dark:border-gray-900"
                    }
                  >
                    <td className="px-3 py-2 font-medium">{row.sku}</td>
                    <td className="px-3 py-2 tabular-nums">{formatQty(row.expectedQty)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatQty(row.actualQty)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatDifference(row.difference)}</td>
                    <td className="px-3 py-2">
                      <SourceCell citations={row.citations} />
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[row.status]}`}
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                      {row.notes && (
                        <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">
                          {row.notes}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
