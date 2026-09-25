/**
 * Exercises the real ingestion pipeline (PDF extraction + chunking, CSV
 * parsing) against the actual test-fixtures files, then feeds the resulting
 * evidence through the real generateReconciliation() validation/normalization
 * logic. Only the OpenAI chat completion call itself is mocked (with a
 * response representing what a correctly-behaving model should return for
 * this evidence set) — everything else is the real production code path.
 */
import fs from "node:fs";
import path from "node:path";
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
import { extractPages } from "./pdf";
import { chunkPageText } from "./chunk";
import { parseShopifyCsv, csvRowToChunkText } from "./csv";
import { generateReconciliation, type RetrievedChunk } from "./rag";

const mockCreate = openai.chat.completions.create as unknown as ReturnType<typeof vi.fn>;

const FIXTURES_DIR = path.resolve(__dirname, "../../test-fixtures");
const PDF_PATH = path.join(FIXTURES_DIR, "supplier-packing-list-sample.pdf");
const CSV_PATH = path.join(FIXTURES_DIR, "shopify-inventory-sample.csv");

beforeEach(() => {
  mockCreate.mockReset();
});

describe("real ingestion pipeline on test fixtures", () => {
  it("extracts and chunks the supplier PDF fixture with all five SKU lines", async () => {
    const buffer = fs.readFileSync(PDF_PATH);
    const pages = await extractPages(buffer);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages).toHaveLength(1);
    expect(pages[0].page).toBe(1);
    expect(Number.isInteger(pages[0].page)).toBe(true);
    expect(pages[0].text.length).toBeGreaterThan(0);

    const chunkTexts = chunkPageText(pages[0].text);
    const combined = chunkTexts.join(" ");
    expect(combined).toContain("RD-001");
    for (const sku of ["RD-001", "RD-002", "RD-003", "RD-005"]) {
      expect(combined).toContain(sku);
    }
    // RD-005 appears twice (duplicate/ambiguous supplier evidence).
    expect(combined.match(/RD-005/g)).toHaveLength(2);
    expect(combined).toContain("quantity 10");
    expect(combined).toContain("quantity 8");
    expect(combined).toContain("quantity 4");
    expect(combined).toContain("quantity 7");
    expect(combined).toContain("quantity 3");
  });

  it("parses the Shopify CSV fixture with RD-001, RD-002, RD-004, RD-005 and no RD-003", () => {
    const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
    const { rows } = parseShopifyCsv(csvContent);
    const bySku = new Map(rows.map((r) => [r.sku, r]));

    expect(bySku.get("RD-001")?.quantity).toBe(10);
    expect(bySku.get("RD-002")?.quantity).toBe(5);
    expect(bySku.get("RD-004")?.quantity).toBe(6);
    expect(bySku.get("RD-005")?.quantity).toBe(7);
    expect(bySku.has("RD-003")).toBe(false);
  });

  it("produces the expected RD-001..RD-005 reconciliation table from real evidence", async () => {
    // Build evidence chunks the same way the real upload pipeline would:
    // one PDF page chunked, one row per CSV line.
    const pdfBuffer = fs.readFileSync(PDF_PATH);
    const pages = await extractPages(pdfBuffer);
    const pdfChunks = pages.flatMap((p) =>
      chunkPageText(p.text).map((text) => ({ page: p.page, text }))
    );

    const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
    const { rows: csvRows } = parseShopifyCsv(csvContent);
    const csvChunks = csvRows.map((row) => ({ page: row.line, text: csvRowToChunkText(row) }));

    const chunks: RetrievedChunk[] = [
      ...pdfChunks.map((c, i) => ({
        id: `pdf-${i}`,
        document_id: "supplier-doc",
        filename: "supplier-packing-list-sample.pdf",
        page: c.page,
        text: c.text,
        similarity: 1,
      })),
      ...csvChunks.map((c, i) => ({
        id: `csv-${i}`,
        document_id: "shopify-doc",
        filename: "shopify-inventory-sample.csv",
        page: c.page,
        text: c.text,
        similarity: 1,
      })),
    ];

    // The PDF is one chunk (short page), containing all five supplier lines
    // including the duplicate RD-005 entries.
    const pdfSourceIndex = chunks.findIndex((c) => c.filename.endsWith(".pdf")) + 1;
    const csvIndexFor = (sku: string) =>
      chunks.findIndex((c) => c.filename.endsWith(".csv") && c.text.startsWith(`SKU=${sku}`)) + 1;

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              abstained: false,
              message: "Reconciled 5 SKUs against the latest Shopify CSV.",
              rows: [
                {
                  sku: "RD-001",
                  expected_qty: 10,
                  actual_qty: 10,
                  difference: 0,
                  status: "match",
                  used_sources: [pdfSourceIndex, csvIndexFor("RD-001")],
                  notes: "",
                },
                {
                  sku: "RD-002",
                  expected_qty: 8,
                  actual_qty: 5,
                  difference: -3,
                  status: "mismatch",
                  used_sources: [pdfSourceIndex, csvIndexFor("RD-002")],
                  notes: "",
                },
                {
                  sku: "RD-003",
                  expected_qty: 4,
                  actual_qty: null,
                  difference: null,
                  status: "missing",
                  used_sources: [pdfSourceIndex],
                  notes: "Not found in Shopify CSV.",
                },
                {
                  sku: "RD-004",
                  expected_qty: null,
                  actual_qty: 6,
                  difference: null,
                  status: "missing",
                  used_sources: [csvIndexFor("RD-004")],
                  notes: "Not found in supplier PDF.",
                },
                {
                  sku: "RD-005",
                  expected_qty: null,
                  actual_qty: 7,
                  difference: null,
                  status: "duplicate",
                  used_sources: [pdfSourceIndex, csvIndexFor("RD-005")],
                  notes: "Supplier PDF lists RD-005 twice with conflicting quantities (7 and 3).",
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await generateReconciliation(chunks);
    expect(result.abstained).toBe(false);

    const bySku = new Map(result.rows.map((r) => [r.sku, r]));

    expect(bySku.get("RD-001")).toMatchObject({
      expectedQty: 10,
      actualQty: 10,
      difference: 0,
      status: "match",
    });
    expect(bySku.get("RD-002")).toMatchObject({
      expectedQty: 8,
      actualQty: 5,
      difference: -3,
      status: "mismatch",
    });
    expect(bySku.get("RD-003")).toMatchObject({
      expectedQty: 4,
      actualQty: null,
      difference: null,
      status: "missing",
    });
    expect(bySku.get("RD-004")).toMatchObject({
      expectedQty: null,
      actualQty: 6,
      difference: null,
      status: "missing",
    });
    expect(bySku.get("RD-005")).toMatchObject({
      status: "duplicate",
    });

    // Every row must carry at least one trusted, application-resolved citation.
    for (const row of result.rows) {
      expect(row.citations.length).toBeGreaterThan(0);
    }

    // Exceptions-first ordering: missing, duplicate, mismatch, match.
    expect(result.rows.map((r) => r.status)).toEqual([
      "missing",
      "missing",
      "duplicate",
      "mismatch",
      "match",
    ]);
  });
});
