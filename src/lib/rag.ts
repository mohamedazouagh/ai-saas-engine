import { openai, CHAT_MODEL } from "./openai";

export type RetrievedChunk = {
  id: string;
  document_id: string;
  filename: string;
  page: number;
  text: string;
  similarity: number;
};

export type ReconciliationStatus = "match" | "mismatch" | "missing" | "duplicate";

export type ReconciliationCitation = {
  chunkId: string;
  documentId: string;
  filename: string;
  sourceType: "pdf" | "csv";
  page?: number;
  line?: number;
  excerpt: string;
};

export type ReconciliationRow = {
  sku: string;
  expectedQty: number | null;
  actualQty: number | null;
  difference: number | null;
  status: ReconciliationStatus;
  notes: string;
  citations: ReconciliationCitation[];
};

export type ReconciliationResult = {
  abstained: boolean;
  message: string;
  rows: ReconciliationRow[];
};

// Conservative character budget for the evidence prompt. Well within
// gpt-4o-mini's context window even after accounting for the system prompt
// and response tokens, but small enough to fail closed before we'd ever
// need to truncate evidence and silently produce an incomplete answer.
const MAX_PROMPT_CHARS = 250_000;

const SYSTEM_PROMPT = `You are ReconDesk, an evidence-grounded inventory reconciliation engine.

Your job is to reconcile supplier shipment or packing-list evidence against Shopify inventory records supplied to you by the application.

You will receive numbered evidence excerpts. Evidence can come from:
1. supplier PDF documents, identified by filename and PDF page; and
2. Shopify CSV records, identified by filename and CSV line.

You must compare the records by SKU and identify reconciliation exceptions.

For every SKU supported by the supplied evidence, determine:
- expected_qty: the quantity supported by the supplier document;
- actual_qty: the quantity supported by the Shopify CSV;
- difference: actual_qty - expected_qty;
- status: exactly one of "match", "mismatch", "missing", or "duplicate".

Status rules:
- "match": the SKU exists on both sides and the supported quantities are equal.
- "mismatch": the SKU exists on both sides but the supported quantities differ.
- "missing": the SKU is evidenced on one side but no corresponding SKU is evidenced on the other side.
- "duplicate": the same SKU occurs more than once where the duplication makes the reconciliation ambiguous or indicates duplicate inventory/shipment records.

Evidence rules:
- Use ONLY the supplied evidence. Never use outside knowledge.
- Never invent, infer, estimate, or autocomplete a SKU or quantity that is not explicitly supported by evidence.
- Preserve SKU text exactly except for harmless surrounding whitespace.
- A missing value must be null, not zero, unless the evidence explicitly states zero.
- Never turn absent evidence into quantity 0.
- If a supplier quantity or Shopify quantity cannot be determined reliably, use null.
- If evidence conflicts and cannot be resolved safely, report the affected SKU as "duplicate" or "mismatch" as appropriate and explain the ambiguity in notes.
- Do not merge different SKUs merely because their product names are similar.
- SKU comparison may ignore surrounding whitespace, but otherwise treat identifiers conservatively.
- Check every supplied record. Do not stop after finding the first discrepancy.
- Include matching rows as well as exceptions so the reconciliation can be proven complete.
- Each output row MUST cite the numbered evidence excerpts actually supporting it.
- A row comparing both supplier and Shopify quantities should normally cite evidence from both sides.
- If a row is "missing", cite the evidence that proves the SKU exists on the side where it was found.
- If there is not enough evidence to perform a meaningful reconciliation at all, set "abstained" to true and explain exactly what input is missing.
- If reconciliation can be performed, set "abstained" to false.
- Do not output Markdown.
- Respond with strict JSON only.

The JSON must match exactly this shape:

{
  "abstained": boolean,
  "message": string,
  "rows": [
    {
      "sku": string,
      "expected_qty": number | null,
      "actual_qty": number | null,
      "difference": number | null,
      "status": "match" | "mismatch" | "missing" | "duplicate",
      "used_sources": number[],
      "notes": string
    }
  ]
}

For \`difference\`:
- when both expected_qty and actual_qty are known, calculate actual_qty - expected_qty;
- otherwise return null.

Sort the final rows with exceptions first in this order:
1. missing
2. duplicate
3. mismatch
4. match

Within each status group, sort by SKU ascending.`;

type LlmRow = {
  sku: unknown;
  expected_qty: unknown;
  actual_qty: unknown;
  status: unknown;
  used_sources: unknown;
  notes: unknown;
};

type LlmOutput = {
  abstained: unknown;
  message: unknown;
  rows: unknown;
};

const STATUS_VALUES: ReconciliationStatus[] = ["match", "mismatch", "missing", "duplicate"];
const STATUS_SORT_ORDER: Record<ReconciliationStatus, number> = {
  missing: 0,
  duplicate: 1,
  mismatch: 2,
  match: 3,
};

/** Infers whether a document is a supplier PDF or a Shopify CSV from its filename. */
export function inferSourceType(filename: string): "pdf" | "csv" {
  return filename.toLowerCase().endsWith(".csv") ? "csv" : "pdf";
}

function buildUserPrompt(chunks: RetrievedChunk[]): string {
  const excerpts = chunks
    .map((c, i) => {
      const idx = i + 1;
      if (inferSourceType(c.filename) === "csv") {
        return `[${idx}] SOURCE=SHOPIFY_CSV FILE="${c.filename}" LINE=${c.page}\n${c.text}`;
      }
      return `[${idx}] SOURCE=SUPPLIER_PDF FILE="${c.filename}" PAGE=${c.page}\n${c.text}`;
    })
    .join("\n\n");
  return `Evidence:\n${excerpts}`;
}

function parseLlmOutput(raw: string): LlmOutput | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.abstained === "boolean" &&
      typeof parsed.message === "string" &&
      Array.isArray(parsed.rows)
    ) {
      return parsed as LlmOutput;
    }
    return null;
  } catch {
    return null;
  }
}

function toNullableNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isValidStatus(v: unknown): v is ReconciliationStatus {
  return typeof v === "string" && (STATUS_VALUES as string[]).includes(v);
}

/**
 * Validates and normalizes one model-produced row against the trusted
 * evidence chunks. The model is never trusted for citation metadata,
 * quantity arithmetic, or status when it contradicts the numbers it itself
 * reported — those are always recomputed here. Returns null if the row
 * can't be grounded in real evidence at all.
 */
function buildRow(raw: unknown, chunks: RetrievedChunk[]): ReconciliationRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as LlmRow;

  const sku = typeof r.sku === "string" ? r.sku.trim() : "";
  if (!sku) return null;

  const usedSourcesRaw = Array.isArray(r.used_sources) ? r.used_sources : [];
  const validIndexes = Array.from(
    new Set(
      usedSourcesRaw.filter(
        (n): n is number =>
          typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= chunks.length
      )
    )
  );

  const citations: ReconciliationCitation[] = validIndexes.map((idx) => {
    const chunk = chunks[idx - 1];
    const sourceType = inferSourceType(chunk.filename);
    return {
      chunkId: chunk.id,
      documentId: chunk.document_id,
      filename: chunk.filename,
      sourceType,
      page: sourceType === "pdf" ? chunk.page : undefined,
      line: sourceType === "csv" ? chunk.page : undefined,
      excerpt: chunk.text,
    };
  });

  // No real, verifiable evidence behind this row — never present it as
  // grounded, no matter what the model claims.
  if (citations.length === 0) return null;

  const expectedQty = toNullableNumber(r.expected_qty);
  const actualQty = toNullableNumber(r.actual_qty);
  const modelStatus = isValidStatus(r.status) ? r.status : null;

  const bothKnown = expectedQty !== null && actualQty !== null;
  const oneKnown = (expectedQty === null) !== (actualQty === null);

  let status: ReconciliationStatus;
  let difference: number | null;

  if (bothKnown) {
    difference = (actualQty as number) - (expectedQty as number);
    if (expectedQty === actualQty) {
      status = modelStatus === "duplicate" ? "duplicate" : "match";
    } else {
      status = modelStatus === "duplicate" ? "duplicate" : "mismatch";
    }
  } else if (oneKnown) {
    difference = null;
    status = modelStatus === "duplicate" ? "duplicate" : "missing";
  } else {
    difference = null;
    status = modelStatus ?? "missing";
  }

  return {
    sku,
    expectedQty,
    actualQty,
    difference,
    status,
    notes: typeof r.notes === "string" ? r.notes : "",
    citations,
  };
}

/**
 * Runs an exhaustive reconciliation over the full evidence set (never a
 * top-k similarity search). Fails closed — abstaining with a clear reason —
 * whenever the model's output can't be trusted, rather than presenting a
 * partial or fabricated result.
 */
export async function generateReconciliation(
  chunks: RetrievedChunk[]
): Promise<ReconciliationResult> {
  if (chunks.length === 0) {
    return {
      abstained: true,
      message:
        "No supplier PDF or Shopify CSV evidence is indexed yet. Upload at least one ready supplier PDF and one ready Shopify CSV, then run reconciliation again.",
      rows: [],
    };
  }

  const userPrompt = buildUserPrompt(chunks);
  if (userPrompt.length > MAX_PROMPT_CHARS) {
    return {
      abstained: true,
      message:
        "The uploaded reconciliation set is too large for a single-pass reconciliation. Split the shipment into smaller documents.",
      rows: [],
    };
  }

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseLlmOutput(raw);

  if (!parsed) {
    return {
      abstained: true,
      message:
        "Reconciliation failed: the model returned a response we could not validate. Please retry.",
      rows: [],
    };
  }

  if (parsed.abstained === true) {
    return {
      abstained: true,
      message: typeof parsed.message === "string" ? parsed.message : "Not enough evidence to reconcile.",
      rows: [],
    };
  }

  const rowsRaw = Array.isArray(parsed.rows) ? parsed.rows : [];
  const rows = rowsRaw
    .map((r) => buildRow(r, chunks))
    .filter((r): r is ReconciliationRow => r !== null);

  if (rows.length === 0) {
    return {
      abstained: true,
      message:
        "The model did not return any groundable reconciliation rows. Please retry or check your uploaded evidence.",
      rows: [],
    };
  }

  rows.sort((a, b) => {
    const byStatus = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    if (byStatus !== 0) return byStatus;
    return a.sku.localeCompare(b.sku);
  });

  return {
    abstained: false,
    message: typeof parsed.message === "string" ? parsed.message : "",
    rows,
  };
}
