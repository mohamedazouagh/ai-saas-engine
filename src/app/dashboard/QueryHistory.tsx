export type QueryRow = {
  id: string;
  question: string;
  answer: string;
  created_at: string;
};

export function QueryHistory({ queries }: { queries: QueryRow[] }) {
  if (queries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No reconciliations run yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {queries.map((q) => (
        <li
          key={q.id}
          className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
        >
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-medium">{q.question || "Reconciliation run"}</p>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {new Date(q.created_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-gray-600 dark:text-gray-400">{q.answer}</p>
        </li>
      ))}
    </ul>
  );
}
