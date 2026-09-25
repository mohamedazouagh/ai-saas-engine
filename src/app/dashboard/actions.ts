"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOrgContext } from "@/lib/org";
import { extractPages } from "@/lib/pdf";
import { chunkPageText } from "@/lib/chunk";
import { embedText, embedTexts } from "@/lib/embeddings";
import { generateAnswer, type Citation, type RetrievedChunk } from "@/lib/rag";

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
    return { error: "Choose a PDF file to upload." };
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Only PDF files are supported." };
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
    .upload(storagePath, bytes, { contentType: "application/pdf" });

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
    const pages = (await extractPages(Buffer.from(bytes))).filter(
      (p) => p.text.length > 0
    );

    if (pages.length === 0) {
      await supabase
        .from("documents")
        .update({
          status: "failed",
          error_message:
            "No extractable text found. This may be a scanned/image-only PDF.",
        })
        .eq("id", documentId);
      revalidatePath("/dashboard");
      return { error: "No extractable text found in that PDF." };
    }

    const chunks = pages.flatMap((p) =>
      chunkPageText(p.text).map((text) => ({ page: p.page, text }))
    );

    const embeddings = await embedTexts(chunks.map((c) => c.text));

    const rows = chunks.map((c, i) => ({
      document_id: documentId,
      page: c.page,
      text: c.text,
      embedding: embeddings[i],
    }));

    for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
      const batch = rows.slice(i, i + CHUNK_INSERT_BATCH);
      const { error: chunkError } = await supabase
        .from("document_chunks")
        .insert(batch);
      if (chunkError) throw chunkError;
    }

    await supabase
      .from("documents")
      .update({ status: "ready", page_count: pages.length })
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

export type QueryFormState = {
  error?: string;
  result?: {
    question: string;
    answer: string;
    abstained: boolean;
    citations: Citation[];
  };
};

export async function askQuestion(
  _prevState: QueryFormState,
  formData: FormData
): Promise<QueryFormState> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { error: "Type a question first." };

  const { supabase, user, orgId } = await requireOrgContext();

  const queryEmbedding = await embedText(question);

  const { data, error: searchError } = await supabase.rpc(
    "match_document_chunks",
    {
      query_embedding: queryEmbedding,
      match_org: orgId,
      match_count: 5,
    }
  );

  if (searchError) {
    return { error: `Search failed: ${searchError.message}` };
  }

  const chunks = (data ?? []) as RetrievedChunk[];
  const result = await generateAnswer(question, chunks);

  const { error: logError } = await supabase.from("queries").insert({
    org_id: orgId,
    user_id: user.id,
    question,
    answer: result.answer,
    source_ids: result.citations.map((c) => c.chunkId),
  });

  if (logError) {
    // Non-fatal — still show the answer even if history logging failed.
    console.error("Failed to log query:", logError.message);
  }

  revalidatePath("/dashboard");

  return {
    result: {
      question,
      answer: result.answer,
      abstained: result.abstained,
      citations: result.citations,
    },
  };
}
