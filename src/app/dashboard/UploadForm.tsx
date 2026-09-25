"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { uploadDocument, type UploadFormState } from "./actions";

const initialState: UploadFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
    >
      {pending ? "Uploading & processing…" : "Upload PDF"}
    </button>
  );
}

export function UploadForm() {
  const [state, formAction] = useActionState(uploadDocument, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <input
        type="file"
        name="file"
        accept="application/pdf"
        required
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200 dark:file:bg-gray-800 dark:hover:file:bg-gray-700"
      />
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <SubmitButton />
        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        {state.success && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Uploaded and indexed.
          </p>
        )}
      </div>
    </form>
  );
}
