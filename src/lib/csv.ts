import { parse } from "csv-parse/sync";

export type CsvRow = {
  /** 1-based line number in the original file where this row ends. */
  line: number;
  sku: string;
  quantityRaw: string;
  quantity: number | null;
  location: string | null;
};

export type ParsedCsv = {
  rows: CsvRow[];
  skuColumn: string;
  quantityColumn: string;
  locationColumn: string | null;
};

export class CsvValidationError extends Error {}

const SKU_ALIASES = ["sku", "variant sku"];
const QUANTITY_ALIASES = [
  "available",
  "on hand",
  "inventory",
  "inventory quantity",
  "variant inventory qty",
  "quantity",
  "qty",
];
const LOCATION_ALIASES = ["location", "location name"];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  for (const alias of aliases) {
    const match = byNormalized.get(alias);
    if (match) return match;
  }
  return null;
}

type RawRecord = { record: Record<string, string>; info: { lines: number } };

/**
 * Parses a Shopify-style inventory CSV. Column names are matched
 * case-insensitively against known Shopify export aliases; if no
 * recognizable SKU or quantity column exists, this throws rather than
 * silently producing unusable rows.
 */
export function parseShopifyCsv(content: string): ParsedCsv {
  let parsed: RawRecord[];
  try {
    parsed = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      trim: true,
      info: true,
    }) as RawRecord[];
  } catch (err) {
    throw new CsvValidationError(
      `Could not parse CSV: ${err instanceof Error ? err.message : "invalid file"}`
    );
  }

  if (parsed.length === 0) {
    throw new CsvValidationError("The CSV file has no data rows.");
  }

  const headers = Object.keys(parsed[0].record);
  const skuColumn = findColumn(headers, SKU_ALIASES);
  const quantityColumn = findColumn(headers, QUANTITY_ALIASES);
  const locationColumn = findColumn(headers, LOCATION_ALIASES);

  if (!skuColumn) {
    throw new CsvValidationError(
      'No recognizable SKU column found. Expected a header like "SKU" or "Variant SKU".'
    );
  }
  if (!quantityColumn) {
    throw new CsvValidationError(
      'No recognizable quantity column found. Expected a header like "Available", "On hand", "Inventory quantity", or "Qty".'
    );
  }

  const rows: CsvRow[] = [];
  for (const { record, info } of parsed) {
    const sku = (record[skuColumn] ?? "").trim();
    const quantityRaw = (record[quantityColumn] ?? "").trim();
    const location = locationColumn ? (record[locationColumn] ?? "").trim() : "";

    const isBlankRow = Object.values(record).every((v) => (v ?? "").trim() === "");
    if (isBlankRow) continue;
    if (!sku) continue;

    const parsedQuantity = Number(quantityRaw.replace(/,/g, ""));
    rows.push({
      line: info.lines,
      sku,
      quantityRaw,
      quantity: quantityRaw !== "" && Number.isFinite(parsedQuantity) ? parsedQuantity : null,
      location: location || null,
    });
  }

  if (rows.length === 0) {
    throw new CsvValidationError("No usable inventory rows found in this CSV.");
  }

  return { rows, skuColumn, quantityColumn, locationColumn };
}

/** Normalized text for embedding/indexing: field names plus original values. */
export function csvRowToChunkText(row: CsvRow): string {
  const parts = [
    `SKU=${row.sku}`,
    `quantity=${row.quantityRaw !== "" ? row.quantityRaw : "unknown"}`,
  ];
  if (row.location) parts.push(`location=${row.location}`);
  return parts.join(" | ");
}
