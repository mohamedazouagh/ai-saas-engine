"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { askQuestion, type QueryFormState } from "./actions";

const initialState: QueryFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
    >
      {pending ? "Thinking…" : "Ask"}
    </button>
  );
}

export function QueryForm() {
  const [state, formAction] = useActionState(askQuestion, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          name="question"
          required
          placeholder="e.g. What's the warranty period for the Oslo sofa frame?"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black dark:border-gray-700 dark:bg-transparent dark:focus:border-white"
        />
        <SubmitButton />
      </form>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      {state.result && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <p className="text-sm font-medium">{state.result.question}</p>
          <p
            className={`mt-2 text-sm ${
              state.result.abstained
                ? "text-amber-600 dark:text-amber-400"
                : ""
            }`}
          >
            {state.result.answer}
          </p>

          {state.result.citations.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Sources
              </p>
              {state.result.citations.map((c) => (
                <div
                  key={c.chunkId}
                  className="rounded-md border border-gray-200 p-3 text-xs dark:border-gray-800"
                >
                  <p className="font-medium">
                    {c.filename} — page {c.page}
                  </p>
                  <p className="mt-1 text-gray-500 dark:text-gray-400">
                    “{c.excerpt}”
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
