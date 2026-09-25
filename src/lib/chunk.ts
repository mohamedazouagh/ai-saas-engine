const CHUNK_WORDS = 180;
const OVERLAP_WORDS = 30;

/**
 * Splits a single page's text into overlapping word-based chunks. Chunks
 * never cross a page boundary, so every chunk can be cited by one page
 * number.
 */
export function chunkPageText(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= CHUNK_WORDS) return [words.join(" ")];

  const chunks: string[] = [];
  const step = CHUNK_WORDS - OVERLAP_WORDS;
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + CHUNK_WORDS);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
    if (start + CHUNK_WORDS >= words.length) break;
  }
  return chunks;
}
