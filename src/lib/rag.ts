import { openai, CHAT_MODEL } from "./openai";

export type RetrievedChunk = {
  id: string;
  document_id: string;
  filename: string;
  page: number;
  text: string;
  similarity: number;
};

export type Citation = {
  chunkId: string;
  documentId: string;
  filename: string;
  page: number;
  excerpt: string;
};

export type RagAnswer = {
  answer: string;
  abstained: boolean;
  citations: Citation[];
};

const NO_EVIDENCE_ANSWER =
  "I don't have enough information in your uploaded documents to answer this question. Try uploading the supplier document that covers this, or rephrase your question.";

const SYSTEM_PROMPT = `You are PolicyProof, an assistant that answers warranty, return, and damage-claim questions for furniture retailers using ONLY the numbered document excerpts the user provides.

Rules:
- Base your answer strictly on the provided excerpts. Never use outside knowledge, and never guess.
- If the excerpts do not contain enough information to fully answer the question, you MUST set "abstained" to true and explain in "answer" what's missing (e.g. which policy detail wasn't found). Do not partially answer with a guess.
- If you can answer, set "abstained" to false and write a direct, concise answer.
- "used_sources" must list the 1-based numbers of every excerpt you actually relied on. Leave it empty if you abstained.
- Respond with strict JSON only, matching exactly this shape:
{"answer": string, "abstained": boolean, "used_sources": number[]}`;

type LlmOutput = {
  answer: string;
  abstained: boolean;
  used_sources: number[];
};

function buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
  const excerpts = chunks
    .map((c, i) => `[${i + 1}] (page ${c.page}, "${c.filename}")\n${c.text}`)
    .join("\n\n");
  return `Question: ${question}\n\nExcerpts:\n${excerpts}`;
}

function parseLlmOutput(raw: string): LlmOutput | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.answer === "string" &&
      typeof parsed.abstained === "boolean" &&
      Array.isArray(parsed.used_sources)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generates a grounded answer from retrieved chunks, or abstains when there's
 * no evidence. The model only ever tells us *which* retrieved chunk(s) it
 * used (by index) — the actual page number and excerpt text we cite always
 * come from our own retrieval, never from the model's own transcription.
 */
export async function generateAnswer(
  question: string,
  chunks: RetrievedChunk[]
): Promise<RagAnswer> {
  if (chunks.length === 0) {
    return { answer: NO_EVIDENCE_ANSWER, abstained: true, citations: [] };
  }

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(question, chunks) },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseLlmOutput(raw);

  if (!parsed) {
    // Fail closed: if we can't trust the model's output, abstain rather
    // than risk presenting an unsupported answer.
    return { answer: NO_EVIDENCE_ANSWER, abstained: true, citations: [] };
  }

  if (parsed.abstained) {
    return { answer: parsed.answer, abstained: true, citations: [] };
  }

  const citations: Citation[] = parsed.used_sources
    .filter((idx) => idx >= 1 && idx <= chunks.length)
    .map((idx) => {
      const chunk = chunks[idx - 1];
      return {
        chunkId: chunk.id,
        documentId: chunk.document_id,
        filename: chunk.filename,
        page: chunk.page,
        excerpt: chunk.text,
      };
    });

  if (citations.length === 0) {
    // Model claimed it could answer but cited nothing real — treat as
    // ungrounded and abstain rather than show an uncited claim.
    return { answer: NO_EVIDENCE_ANSWER, abstained: true, citations: [] };
  }

  return { answer: parsed.answer, abstained: false, citations };
}
