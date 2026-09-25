# PolicyProof

Answers warranty, return, and damage-claim questions for furniture retailers by
searching their suppliers' PDFs — with page citations, and honest abstention
when the evidence isn't there.

## Stack

- [Next.js 16](https://nextjs.org) — App Router, Server Components, Server Actions
- [TypeScript](https://www.typescriptlang.org/) · [Tailwind CSS v4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) — Auth, Postgres + [pgvector](https://github.com/pgvector/pgvector), Storage
- [OpenAI](https://platform.openai.com/) — `text-embedding-3-small` for embeddings, `gpt-4o-mini` for answers

## Project structure

```
src/
  app/
    page.tsx                # Landing page
    login/, signup/         # Auth pages
    auth/actions.ts         # signIn / signUp / signOut server actions
    dashboard/
      page.tsx              # Dashboard (documents, upload, ask, history)
      actions.ts            # uploadDocument / askQuestion server actions
      UploadForm.tsx, QueryForm.tsx, DocumentList.tsx, QueryHistory.tsx
  lib/
    supabase/
      client.ts             # Supabase client — browser
      server.ts             # Supabase client — Server Components/Actions
      middleware.ts         # Session refresh + route protection
    openai.ts                # OpenAI client + model constants
    pdf.ts                   # Per-page text extraction (pdf-parse)
    chunk.ts                 # Page-bounded chunking
    embeddings.ts            # Batched OpenAI embeddings
    rag.ts                   # Answer generation + citation/abstention logic
    org.ts                   # Resolves signed-in user -> organization
  proxy.ts                   # Next.js 16 "proxy" (formerly middleware)
supabase/
  migrations/0001_init.sql   # Full schema, RLS, triggers, storage, RPC
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
   vector-search RPC.
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
- `/dashboard` — upload documents, ask questions, see history (requires sign-in)

## How it works

**Upload**: PDF → Supabase Storage (`documents` bucket, path
`org_id/document_id/filename.pdf`) → text extracted per page → each page
chunked (~180 words, 30-word overlap, never crossing a page boundary) →
chunks embedded in batches → stored in `document_chunks`.

**Query**: question embedded → `match_document_chunks` RPC does a
cosine-similarity search over `document_chunks`, scoped to the caller's org
via RLS and an explicit org filter → top 5 chunks sent to the model, which
must answer using only those excerpts and name which ones it used → the app
resolves citations (page number, excerpt, filename) from its own retrieval
results, never from the model's transcription → if there are no chunks, or
the model can't ground an answer in what's given, it abstains instead of
guessing.

**Multi-tenancy**: every table is scoped by `org_id` and enforced with
Postgres RLS (see the migration for policy details). A Postgres trigger
creates an `organizations` row and a `profiles` row automatically when a
user signs up.

## Scripts

| Command         | Description               |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Build for production       |
| `npm run start` | Run the production build   |
| `npm run lint`  | Lint the codebase          |

## Deployment

Deploy to [Vercel](https://vercel.com/new) and set the same four environment
variables in the project settings. Note: document processing (extraction +
embedding) currently runs synchronously inside the upload request — fine for
typical supplier PDFs locally, but large files may need a longer function
timeout or a background job on serverless platforms.

## Not in this MVP (by design)

No billing (Stripe comes after the first paying pilot), no reranking, no
semantic cache, no agents, no OCR for scanned/image-only PDFs, and no
multi-user organizations/invites yet — one org is created per signup.
