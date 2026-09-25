"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org";
import { extractPages } from "@/lib/pdf";
import { chunkPageText } from "@/lib/chunk";
import { parseShopifyCsv, csvRowToChunkText, CsvValidationError } from "@/lib/csv";
import { embedTexts } from "@/lib/embeddings";
import {
  generateReconciliation,
  inferSourceType,
  type ReconciliationRow,
  type RetrievedChunk,
} from "@/lib/rag";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB
const CHUNK_INSERT_BATCH = 200;

export type UploadFormState = {
  error?: string;
  success?: boolean;
};

export async function uploadDocument(
  _prevState: UploadFormState,
  formData: FormData
): Promise<UploadFormState> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a supplier PDF or Shopify CSV to upload." };
  }

  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  const isCsv =
    file.type === "text/csv" || file.type === "application/csv" || lowerName.endsWith(".csv");

  if (!isPdf && !isCsv) {
    return { error: "Only PDF or CSV files are supported." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "File is too large (max 25MB)." };
  }

  const { supabase, orgId } = await requireOrgContext();

  const documentId = randomUUID();
  const storagePath = `${orgId}/${documentId}/${file.name}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, bytes, {
      contentType: isPdf ? "application/pdf" : "text/csv",
    });

  if (uploadError) {
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    org_id: orgId,
    filename: file.name,
    storage_path: storagePath,
    status: "processing",
  });

  if (insertError) {
    return { error: `Could not save document record: ${insertError.message}` };
  }

  try {
    let chunks: { page: number; text: string }[];
    let rowCount: number;

    if (isPdf) {
      const pages = (await extractPages(Buffer.from(bytes))).filter((p) => p.text.length > 0);

      if (pages.length === 0) {
        await supabase
          .from("documents")
          .update({
            status: "failed",
            error_message: "No extractable text found. This may be a scanned/image-only PDF.",
          })
          .eq("id", documentId);
        revalidatePath("/dashboard");
        return { error: "No extractable text found in that PDF." };
      }

      chunks = pages.flatMap((p) =>
        chunkPageText(p.text).map((text) => ({ page: p.page, text }))
      );
      rowCount = pages.length;
    } else {
      const text = Buffer.from(bytes).toString("utf-8");
      let parsedCsv;
      try {
        parsedCsv = parseShopifyCsv(text);
      } catch (err) {
        const message =
          err instanceof CsvValidationError
            ? err.message
            : "Could not read that CSV file.";
        await supabase
          .from("documents")
          .update({ status: "failed", error_message: message })
          .eq("id", documentId);
        revalidatePath("/dashboard");
        return { error: message };
      }

      chunks = parsedCsv.rows.map((row) => ({
        page: row.line,
        text: csvRowToChunkText(row),
      }));
      rowCount = parsedCsv.rows.length;
    }

    const embeddings = await embedTexts(chunks.map((c) => c.text));

    const rows = chunks.map((c, i) => ({
      document_id: documentId,
      page: c.page,
      text: c.text,
      embedding: embeddings[i],
    }));

    for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
      const batch = rows.slice(i, i + CHUNK_INSERT_BATCH);
      const { error: chunkError } = await supabase.from("document_chunks").insert(batch);
      if (chunkError) throw chunkError;
    }

    await supabase
      .from("documents")
      .update({ status: "ready", page_count: rowCount })
      .eq("id", documentId);
  } catch (err) {
    await supabase
      .from("documents")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : "Unknown error",
      })
      .eq("id", documentId);
    revalidatePath("/dashboard");
    return { error: "Processing failed while chunking or embedding the document." };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export type ReconciliationFormState = {
  error?: string;
  result?: {
    abstained: boolean;
    message: string;
    rows: ReconciliationRow[];
    totalRows: number;
    matches: number;
    exceptions: number;
  };
};

export async function runReconciliation(
  _prevState: ReconciliationFormState,
  _formData: FormData
): Promise<ReconciliationFormState> {
  const { supabase, user, orgId } = await requireOrgContext();

  const { data: documents, error: docError } = await supabase
    .from("documents")
    .select("id, filename, status, uploaded_at")
    .eq("org_id", orgId)
    .eq("status", "ready")
    .order("uploaded_at", { ascending: true });

  if (docError) {
    return { error: `Could not load documents: ${docError.message}` };
  }

  const readyDocs = documents ?? [];
  const pdfDocs = readyDocs.filter((d) => inferSourceType(d.filename) === "pdf");
  const csvDocs = readyDocs.filter((d) => inferSourceType(d.filename) === "csv");

  if (pdfDocs.length === 0 || csvDocs.length === 0) {
    return {
      error:
        "Upload at least one ready supplier PDF and one ready Shopify CSV before running reconciliation.",
    };
  }

  // Ascending upload order, so the last CSV is the most recently uploaded.
  const latestCsv = csvDocs[csvDocs.length - 1];
  const selectedDocs = [...pdfDocs, latestCsv];
  const selectedIds = selectedDocs.map((d) => d.id);
  const docOrder = new Map(selectedIds.map((id, i) => [id, i]));
  const filenameById = new Map(selectedDocs.map((d) => [d.id, d.filename]));

  const { data: chunkRows, error: chunkError } = await supabase
    .from("document_chunks")
    .select("id, document_id, page, text")
    .in("document_id", selectedIds);

  if (chunkError) {
    return { error: `Could not load evidence: ${chunkError.message}` };
  }

  const chunks: RetrievedChunk[] = (chunkRows ?? [])
    .map((r) => ({
      id: r.id as string,
      document_id: r.document_id as string,
      filename: filenameById.get(r.document_id as string) ?? "unknown",
      page: r.page as number,
      text: r.text as string,
      similarity: 1,
    }))
    .sort((a, b) => {
      const orderA = docOrder.get(a.document_id) ?? 0;
      const orderB = docOrder.get(b.document_id) ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      if (a.page !== b.page) return a.page - b.page;
      return a.id.localeCompare(b.id);
    });

  const result = await generateReconciliation(chunks);

  const citedChunkIds = Array.from(
    new Set(result.rows.flatMap((row) => row.citations.map((c) => c.chunkId)))
  );
  const matches = result.rows.filter((r) => r.status === "match").length;
  const exceptions = result.rows.length - matches;

  const summary = result.abstained
    ? result.message
    : `Reconciled ${result.rows.length} SKU${result.rows.length === 1 ? "" : "s"} (${exceptions} exception${exceptions === 1 ? "" : "s"}). ${result.message}`.trim();

  const { error: logError } = await supabase.from("queries").insert({
    org_id: orgId,
    user_id: user.id,
    question: "Reconciliation run",
    answer: summary,
    source_ids: citedChunkIds,
  });

  if (logError) {
    console.error("Failed to log reconciliation run:", logError.message);
  }

  revalidatePath("/dashboard");

  return {
    result: {
      abstained: result.abstained,
      message: result.message,
      rows: result.rows,
      totalRows: result.rows.length,
      matches,
      exceptions,
    },
  };
}
