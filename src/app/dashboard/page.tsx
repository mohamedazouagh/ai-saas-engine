import Link from "next/link";

export default function Dashboard() {
  return (
    <main className="flex flex-1 flex-col px-6 py-12 sm:px-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Wire this up to your data once Supabase is connected.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
          >
            &larr; Back home
          </Link>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total users", value: "—" },
            { label: "Active subscriptions", value: "—" },
            { label: "MRR", value: "—" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-gray-200 p-5 dark:border-gray-800"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-lg border border-gray-200 p-6 dark:border-gray-800">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Next step
          </h2>
          <p className="mt-2 text-sm">
            Fetch data with the Supabase server client (
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
              src/lib/supabase/server.ts
            </code>
            ) inside this Server Component and replace these placeholders.
          </p>
        </section>
      </div>
    </main>
  );
}
