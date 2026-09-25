import { describe, expect, it } from "vitest";
import { CsvValidationError, csvRowToChunkText, parseShopifyCsv } from "./csv";

describe("parseShopifyCsv", () => {
  it("parses quoted commas within fields", () => {
    const csv = 'SKU,Title,Available\nRD-100,"Widget, Deluxe",12\n';
    const { rows } = parseShopifyCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].sku).toBe("RD-100");
    expect(rows[0].quantity).toBe(12);
  });

  it("accepts common Shopify SKU column aliases case-insensitively", () => {
    for (const header of ["SKU", "sku", "Variant SKU", "variant sku"]) {
      const csv = `${header},Available\nRD-1,5\n`;
      const { rows } = parseShopifyCsv(csv);
      expect(rows[0].sku).toBe("RD-1");
    }
  });

  it("accepts common Shopify quantity column aliases case-insensitively", () => {
    for (const header of [
      "Available",
      "On hand",
      "Inventory",
      "Inventory quantity",
      "Variant Inventory Qty",
      "Quantity",
      "qty",
    ]) {
      const csv = `SKU,${header}\nRD-1,9\n`;
      const { rows } = parseShopifyCsv(csv);
      expect(rows[0].quantity).toBe(9);
    }
  });

  it("ignores completely blank rows", () => {
    const csv = "SKU,Available\nRD-1,5\n\nRD-2,3\n";
    const { rows } = parseShopifyCsv(csv);
    expect(rows.map((r) => r.sku)).toEqual(["RD-1", "RD-2"]);
  });

  it("preserves original file line numbers", () => {
    const csv = "SKU,Available\nRD-1,5\nRD-2,3\n";
    const { rows } = parseShopifyCsv(csv);
    expect(rows[0].line).toBe(2);
    expect(rows[1].line).toBe(3);
  });

  it("throws a clear error for invalid CSV syntax", () => {
    const csv = 'SKU,Available\n"unterminated,5\n';
    expect(() => parseShopifyCsv(csv)).toThrow(CsvValidationError);
  });

  it("throws a clear error when no SKU column is recognizable", () => {
    const csv = "Product,Available\nWidget,5\n";
    expect(() => parseShopifyCsv(csv)).toThrow(CsvValidationError);
    expect(() => parseShopifyCsv(csv)).toThrow(/SKU column/);
  });

  it("throws a clear error when no quantity column is recognizable", () => {
    const csv = "SKU,Widgets Count\nRD-1,5\n";
    expect(() => parseShopifyCsv(csv)).toThrow(CsvValidationError);
    expect(() => parseShopifyCsv(csv)).toThrow(/quantity column/);
  });

  it("throws when the CSV has no usable rows at all", () => {
    const csv = "SKU,Available\n";
    expect(() => parseShopifyCsv(csv)).toThrow(CsvValidationError);
  });

  it("skips rows with no SKU value", () => {
    const csv = "SKU,Available\n,5\nRD-2,3\n";
    const { rows } = parseShopifyCsv(csv);
    expect(rows.map((r) => r.sku)).toEqual(["RD-2"]);
  });

  it("returns quantity null (not fabricated) when the value can't be parsed", () => {
    const csv = "SKU,Available\nRD-1,n/a\n";
    const { rows } = parseShopifyCsv(csv);
    expect(rows[0].quantity).toBeNull();
    expect(rows[0].quantityRaw).toBe("n/a");
  });
});

describe("csvRowToChunkText", () => {
  it("includes normalized field names and original values", () => {
    const text = csvRowToChunkText({
      line: 2,
      sku: "RD-001",
      quantityRaw: "10",
      quantity: 10,
      location: "Breda Warehouse",
    });
    expect(text).toBe("SKU=RD-001 | quantity=10 | location=Breda Warehouse");
  });

  it("shows 'unknown' quantity rather than fabricating a number", () => {
    const text = csvRowToChunkText({
      line: 2,
      sku: "RD-001",
      quantityRaw: "",
      quantity: null,
      location: null,
    });
    expect(text).toBe("SKU=RD-001 | quantity=unknown");
  });
});
