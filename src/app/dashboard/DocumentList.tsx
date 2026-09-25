export type DocumentRow = {
  id: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  page_count: number | null;
  error_message: string | null;
  uploaded_at: string;
};

const STATUS_STYLES: Record<DocumentRow["status"], string> = {
  processing:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  ready: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  if (documents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No documents yet. Upload a supplier PDF to get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-800"
        >
          <div className="flex flex-col">
            <span className="font-medium">{doc.filename}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(doc.uploaded_at).toLocaleString()}
              {doc.page_count ? ` · ${doc.page_count} pages` : ""}
            </span>
            {doc.status === "failed" && doc.error_message && (
              <span className="mt-1 text-xs text-red-600 dark:text-red-400">
                {doc.error_message}
              </span>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[doc.status]}`}
          >
            {doc.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
