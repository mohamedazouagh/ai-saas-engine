# ReconDesk

Reconciles supplier shipment/packing-list documents against Shopify inventory
CSV exports and surfaces the exceptions — every SKU checked exhaustively, with
every row cited back to the exact PDF page or CSV line it came from, and
honest abstention when there isn't enough evidence.

## Stack

- [Next.js 16](https://nextjs.org) — App Router, Server Components, Server Actions
- [TypeScript](https://www.typescriptlang.org/) · [Tailwind CSS v4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) — Auth, Postgres + [pgvector](https://github.com/pgvector/pgvector), Storage
- [OpenAI](https://platform.openai.com/) — `text-embedding-3-small` for embeddings, `gpt-4o-mini` for reconciliation
- [csv-parse](https://csv.js.org/parse/) — Shopify CSV parsing
- [Vitest](https://vitest.dev/) — unit/integration tests

## Project structure

```
src/
  app/
    page.tsx                # Landing page
    login/, signup/         # Auth pages
    auth/actions.ts         # signIn / signUp / signOut server actions
    dashboard/
      page.tsx              # Dashboard (documents, upload, reconciliation, history)
      actions.ts            # uploadDocument / runReconciliation server actions
      UploadForm.tsx, ReconciliationPanel.tsx, DocumentList.tsx, QueryHistory.tsx
  lib/
    supabase/
      client.ts             # Supabase client — browser
      server.ts             # Supabase client — Server Components/Actions
      middleware.ts         # Session refresh + route protection
    openai.ts                # OpenAI client + model constants
    pdf.ts                   # Per-page text extraction (pdf-parse)
    csv.ts                   # Shopify CSV parsing + column-alias resolution
    chunk.ts                 # Page-bounded chunking
    embeddings.ts            # Batched OpenAI embeddings
    rag.ts                   # Exhaustive reconciliation engine + validation
    org.ts                   # Resolves signed-in user -> organization
  proxy.ts                   # Next.js 16 "proxy" (formerly middleware)
supabase/
  migrations/0001_init.sql   # Full schema, RLS, triggers, storage, RPC
test-fixtures/
  supplier-packing-list-sample.pdf  # Deterministic supplier evidence
  shopify-inventory-sample.csv      # Deterministic Shopify inventory export
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project and run the schema

1. Go to [supabase.com](https://supabase.com/dashboard) and create a new project.
2. Open **SQL Editor** and run the contents of `supabase/migrations/0001_init.sql`.
   This enables `pgvector`, creates every table, sets up RLS policies scoped
   by organization, adds the signup trigger, creates the private
   `documents` storage bucket, and creates the `match_document_chunks`
   vector-search RPC (used for embedding storage; reconciliation itself does
   an exhaustive read, not a similarity search).
3. In **Settings > API**, copy the Project URL, `anon` public key, and
   `service_role` secret key.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-your-openai-key
```

`.env.local` is gitignored. `OPENAI_API_KEY` is read in `src/lib/openai.ts`.

### 4. Run the dev server

```bash
npm run dev
```

- `/` — landing page
- `/signup`, `/login` — auth
- `/dashboard` — upload supplier PDFs and Shopify CSVs, run reconciliation, see history (requires sign-in)

## How it works

**Upload**: a supplier PDF or Shopify inventory CSV → Supabase Storage
(`documents` bucket, path `org_id/document_id/filename`) →

- **PDF**: text extracted per page → each page chunked (~180 words, 30-word
  overlap, never crossing a page boundary).
- **CSV**: parsed with `csv-parse`, matching common Shopify column aliases
  (`SKU`/`Variant SKU`, `Available`/`On hand`/`Inventory quantity`/`Qty`,
  `Location`) case-insensitively; each inventory row becomes its own chunk,
  normalized to `SKU=... | quantity=... | location=...`, keyed by its
  original file line number. A CSV with no recognizable SKU or quantity
  column is rejected with a clear error rather than silently indexed.

Both paths are embedded in batches and stored in `document_chunks` — `page`
holds the PDF page number for PDFs and the original CSV line number for
CSVs.

**Reconciliation**: unlike a typical RAG top-k search, reconciliation is
**exhaustive** — it loads every chunk for every ready supplier PDF plus the
most recently uploaded ready Shopify CSV for the org, in deterministic
document/page/line order, and sends the complete evidence set to the model
in one pass. The model must classify every SKU it can support with evidence
as `match`, `mismatch`, `missing`, or `duplicate`, citing only the numbered
excerpts it actually used.

The app never trusts the model for arithmetic or citation text:

- `difference` is always recomputed server-side (`actual_qty - expected_qty`)
  when both quantities are known, never taken from the model.
- `status` is normalized against the recomputed numbers — a claimed `match`
  with differing quantities becomes `mismatch`, and vice versa, unless the
  model flagged a genuine `duplicate` conflict.
- Citation metadata (filename, page/line, excerpt) is always resolved from
  the app's own retrieval, never from model-generated text.
- A row with zero valid citations is dropped rather than shown as grounded.
- Malformed or unparseable model output, or an evidence set too large for a
  single reconciliation pass, fails closed into an explicit abstention
  message rather than a partial or fabricated result.

**Multi-tenancy**: every table is scoped by `org_id` and enforced with
Postgres RLS (see the migration for policy details). A Postgres trigger
creates an `organizations` row and a `profiles` row automatically when a
user signs up.

## Test fixtures

`test-fixtures/` contains a deterministic supplier PDF and Shopify CSV
covering all four reconciliation statuses:

| SKU     | Supplier | Shopify | Expected result       |
| ------- | -------- | ------- | ---------------------- |
| RD-001  | 10       | 10      | `match`, difference 0  |
| RD-002  | 8        | 5       | `mismatch`, difference -3 |
| RD-003  | 4        | —       | `missing`               |
| RD-004  | —        | 6       | `missing`               |
| RD-005  | 7 and 3 (conflicting) | 7 | `duplicate`      |

`src/lib/reconciliation-fixtures.test.ts` runs the real PDF extraction/CSV
parsing pipeline against these files and asserts the resulting table.

## Scripts

| Command         | Description               |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Build for production       |
| `npm run start` | Run the production build   |
| `npm run lint`  | Lint the codebase          |
| `npm run test`  | Run the test suite (Vitest)|

## Deployment

Deploy to [Vercel](https://vercel.com/new) and set the same four environment
variables in the project settings. Note: document processing (extraction +
embedding) currently runs synchronously inside the upload request — fine for
typical supplier documents locally, but large files may need a longer
function timeout or a background job on serverless platforms.

## Not in this MVP (by design)

No billing (Stripe comes after the first paying pilot), no reranking, no
semantic cache, no agents, no OCR for scanned/image-only PDFs, no support for
reconciling against multiple CSV snapshots at once, and no multi-user
organizations/invites yet — one org is created per signup.
