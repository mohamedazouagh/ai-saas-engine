"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUp, type AuthFormState } from "@/app/auth/actions";

const initialState: AuthFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
    >
      {pending ? "Creating account…" : "Create account"}
    </button>
  );
}

export default function SignupPage() {
  const [state, formAction] = useActionState(signUp, initialState);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Sets up your organization&apos;s private workspace.
        </p>

        {state.message ? (
          <p className="mt-8 rounded-md border border-gray-200 p-4 text-sm dark:border-gray-800">
            {state.message}
          </p>
        ) : (
          <form action={formAction} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="orgName" className="text-sm font-medium">
                Company name
              </label>
              <input
                id="orgName"
                name="orgName"
                type="text"
                required
                placeholder="Acme Furniture Co."
                className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black dark:border-gray-700 dark:bg-transparent dark:focus:border-white"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black dark:border-gray-700 dark:bg-transparent dark:focus:border-white"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black dark:border-gray-700 dark:bg-transparent dark:focus:border-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">At least 8 characters.</p>
            </div>

            {state.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
            )}

            <SubmitButton />
          </form>
        )}

        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-black underline dark:text-white">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
