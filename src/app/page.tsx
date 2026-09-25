import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex max-w-2xl flex-col items-center gap-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Ship your SaaS idea, faster.
        </h1>
        <p className="text-lg text-gray-500 dark:text-gray-400">
          A Next.js, TypeScript, Tailwind, and Supabase starter kit so you can
          skip the boilerplate and get straight to building the thing that
          matters.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          Get started
        </Link>
      </div>
    </main>
  );
}
