import { PDFParse } from "pdf-parse";

export type PdfPage = { page: number; text: string };

/**
 * Extracts text per page, in page order. Pages with no extractable text
 * (e.g. scanned images with no OCR layer) come back with an empty string —
 * callers should filter those out before chunking.
 */
export async function extractPages(buffer: Buffer): Promise<PdfPage[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => ({ page: p.num, text: p.text.trim() }));
  } finally {
    await parser.destroy();
  }
}
