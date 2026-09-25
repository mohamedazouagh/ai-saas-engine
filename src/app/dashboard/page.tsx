import { requireOrgContext } from "@/lib/org";
import { signOut } from "@/app/auth/actions";
import { UploadForm } from "./UploadForm";
import { ReconciliationPanel } from "./ReconciliationPanel";
import { DocumentList, type DocumentRow } from "./DocumentList";
import { QueryHistory, type QueryRow } from "./QueryHistory";

export default async function DashboardPage() {
  const { supabase, orgId } = await requireOrgContext();

  const [{ data: org }, { data: documents }, { data: queries }] =
    await Promise.all([
      supabase.from("organizations").select("name").eq("id", orgId).single(),
      supabase
        .from("documents")
        .select("id, filename, status, page_count, error_message, uploaded_at")
        .eq("org_id", orgId)
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("queries")
        .select("id, question, answer, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-12 sm:px-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {org?.name ?? "Dashboard"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Supplier ↔ Shopify inventory reconciliation
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm font-medium text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
          >
            Sign out
          </button>
        </form>
      </header>

      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Reconciliation
        </h2>
        <div className="mt-3">
          <ReconciliationPanel />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Documents
        </h2>
        <div className="mt-3 flex flex-col gap-4">
          <UploadForm />
          <DocumentList documents={(documents ?? []) as DocumentRow[]} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Recent reconciliations
        </h2>
        <div className="mt-3">
          <QueryHistory queries={(queries ?? []) as QueryRow[]} />
        </div>
      </section>
    </main>
  );
}
