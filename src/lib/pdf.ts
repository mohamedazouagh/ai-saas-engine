import { PDFParse } from "pdf-parse";
import { getPath } from "pdf-parse/worker";

export type PdfPage = { page: number; text: string };

let workerConfigured = false;

/**
 * pdf-parse (pdf.js under the hood) needs an explicit worker path in
 * Next.js/Turbopack — its own default resolution assumes a plain Node
 * require graph and breaks under Turbopack's module bundling. `getPath()`
 * resolves the worker file from pdf-parse's own installed location, so
 * this stays correct across environments (dev, Vercel/serverless) without
 * a hardcoded path or CDN dependency.
 */
function ensureWorkerConfigured() {
  if (workerConfigured) return;
  PDFParse.setWorker(getPath());
  workerConfigured = true;
}

/**
 * Extracts text per page, in page order. Pages with no extractable text
 * (e.g. scanned images with no OCR layer) come back with an empty string —
 * callers should filter those out before chunking.
 */
export async function extractPages(buffer: Buffer): Promise<PdfPage[]> {
  ensureWorkerConfigured();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => ({ page: p.num, text: p.text.trim() }));
  } finally {
    await parser.destroy();
  }
}
