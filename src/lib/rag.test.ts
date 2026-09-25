import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./openai", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
  CHAT_MODEL: "gpt-4o-mini",
}));

import { openai } from "./openai";
import { generateReconciliation, type RetrievedChunk } from "./rag";

const mockCreate = openai.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

function completionWith(content: string) {
  return { choices: [{ message: { content } }] };
}

const chunks: RetrievedChunk[] = [
  {
    id: "c1",
    document_id: "d1",
    filename: "packing-list.pdf",
    page: 1,
    text: "SKU RD-001 quantity 10",
    similarity: 1,
  },
  {
    id: "c2",
    document_id: "d2",
    filename: "inventory.csv",
    page: 2,
    text: "SKU=RD-001 | quantity=10",
    similarity: 1,
  },
];

beforeEach(() => {
  mockCreate.mockReset();
});

describe("generateReconciliation", () => {
  it("abstains immediately with no evidence, never calling the model", async () => {
    const result = await generateReconciliation([]);
    expect(result.abstained).toBe(true);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("recomputes difference and normalizes a claimed mismatch to match when quantities are equal", async () => {
    mockCreate.mockResolvedValue(
      completionWith(
        JSON.stringify({
          abstained: false,
          message: "ok",
          rows: [
            {
              sku: "RD-001",
              expected_qty: 10,
              actual_qty: 10,
              difference: 999, // model's arithmetic must be ignored
              status: "mismatch", // model's status must be ignored when it contradicts the numbers
              used_sources: [1, 2],
              notes: "",
            },
          ],
        })
      )
    );

    const result = await generateReconciliation(chunks);
    expect(result.abstained).toBe(false);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("match");
    expect(result.rows[0].difference).toBe(0);
  });

  it("normalizes a claimed match to mismatch when quantities differ, with recomputed difference", async () => {
    mockCreate.mockResolvedValue(
      completionWith(
        JSON.stringify({
          abstained: false,
          message: "ok",
          rows: [
            {
              sku: "RD-002",
              expected_qty: 8,
              actual_qty: 5,
              difference: 0,
              status: "match",
              used_sources: [1, 2],
              notes: "",
            },
          ],
        })
      )
    );

    const result = await generateReconciliation(chunks);
    expect(result.rows[0].status).toBe("mismatch");
    expect(result.rows[0].difference).toBe(-3);
  });

  it("normalizes to missing and nulls the difference when only one side has a quantity", async () => {
    mockCreate.mockResolvedValue(
      completionWith(
        JSON.stringify({
          abstained: false,
          message: "ok",
          rows: [
            {
              sku: "RD-003",
              expected_qty: 4,
              actual_qty: null,
              difference: 4,
              status: "match",
              used_sources: [1],
              notes: "",
            },
          ],
        })
      )
    );

    const result = await generateReconciliation(chunks);
    expect(result.rows[0].status).toBe("missing");
    expect(result.rows[0].difference).toBeNull();
    expect(result.rows[0].expectedQty).toBe(4);
    expect(result.rows[0].actualQty).toBeNull();
  });

  it("drops rows whose used_sources are all invalid citation indices", async () => {
    mockCreate.mockResolvedValue(
      completionWith(
        JSON.stringify({
          abstained: false,
          message: "ok",
          rows: [
            {
              sku: "RD-GOOD",
              expected_qty: 1,
              actual_qty: 1,
              difference: 0,
              status: "match",
              used_sources: [1, 2],
              notes: "",
            },
            {
              sku: "RD-BAD",
              expected_qty: 1,
              actual_qty: 1,
              difference: 0,
              status: "match",
              used_sources: [99],
              notes: "",
            },
          ],
        })
      )
    );

    const result = await generateReconciliation(chunks);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].sku).toBe("RD-GOOD");
  });

  it("fails closed and abstains when the model output is not valid JSON", async () => {
    mockCreate.mockResolvedValue(completionWith("not json at all"));

    const result = await generateReconciliation(chunks);
    expect(result.abstained).toBe(true);
    expect(result.rows).toHaveLength(0);
  });

  it("fails closed and abstains when the model output is missing required fields", async () => {
    mockCreate.mockResolvedValue(completionWith(JSON.stringify({ foo: "bar" })));

    const result = await generateReconciliation(chunks);
    expect(result.abstained).toBe(true);
  });

  it("passes through the model's own abstention", async () => {
    mockCreate.mockResolvedValue(
      completionWith(
        JSON.stringify({ abstained: true, message: "No Shopify CSV uploaded.", rows: [] })
      )
    );

    const result = await generateReconciliation(chunks);
    expect(result.abstained).toBe(true);
    expect(result.message).toBe("No Shopify CSV uploaded.");
  });

  it("abstains before calling the model when the evidence set is too large", async () => {
    const hugeChunks: RetrievedChunk[] = [
      {
        id: "big",
        document_id: "d1",
        filename: "huge.csv",
        page: 1,
        text: "x".repeat(300_000),
        similarity: 1,
      },
    ];

    const result = await generateReconciliation(hugeChunks);
    expect(result.abstained).toBe(true);
    expect(result.message).toMatch(/too large/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
