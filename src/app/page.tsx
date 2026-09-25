import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex max-w-2xl flex-col items-center gap-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Find the shipment discrepancies before they find you.
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400">
          ReconDesk reconciles supplier documents against Shopify inventory
          and surfaces the exceptions — every SKU checked, every row cited
          back to the page or line it came from.
        </p>
        <div className="mt-2 flex items-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
