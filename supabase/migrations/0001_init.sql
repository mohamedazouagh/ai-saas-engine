-- PolicyProof MVP schema: multi-tenant orgs, documents, vector chunks, query log.
-- Run this once against your Supabase project (SQL Editor, or `supabase db push`).

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists vector;

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Bridges auth.users to an organization. One row per user, one org per user
-- at signup time for this MVP (no multi-user orgs / invites yet).
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  filename text not null,
  storage_path text not null,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  page_count int,
  error_message text,
  uploaded_at timestamptz not null default now()
);

create index if not exists documents_org_id_idx on documents (org_id);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  page int not null,
  text text not null,
  embedding vector(1536) not null
);

create index if not exists document_chunks_document_id_idx on document_chunks (document_id);

-- Cosine-distance HNSW index for similarity search.
create index if not exists document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);

create table if not exists queries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  answer text not null,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists queries_org_id_created_at_idx on queries (org_id, created_at desc);

-- ── Helper: current user's org_id ────────────────────────────────────────────
-- security definer so it can read `profiles` regardless of the caller's RLS
-- policies on that table, avoiding recursive-policy issues.
create or replace function auth_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from profiles where id = auth.uid();
$$;

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table queries enable row level security;

-- organizations: members can read their own org. Writes happen only via the
-- signup trigger below (runs as the table owner and bypasses RLS).
create policy "org members can view their organization"
  on organizations for select
  using (id = auth_org_id());

-- profiles: users can read and update only their own row.
create policy "users can view their own profile"
  on profiles for select
  using (id = auth.uid());

create policy "users can update their own profile"
  on profiles for update
  using (id = auth.uid());

-- documents: full CRUD scoped to the caller's org.
create policy "org members can view their documents"
  on documents for select
  using (org_id = auth_org_id());

create policy "org members can insert documents into their org"
  on documents for insert
  with check (org_id = auth_org_id());

create policy "org members can update their documents"
  on documents for update
  using (org_id = auth_org_id());

create policy "org members can delete their documents"
  on documents for delete
  using (org_id = auth_org_id());

-- document_chunks: scoped to the caller's org via the parent document.
create policy "org members can view chunks of their documents"
  on document_chunks for select
  using (
    exists (
      select 1 from documents d
      where d.id = document_chunks.document_id
        and d.org_id = auth_org_id()
    )
  );

create policy "org members can insert chunks for their documents"
  on document_chunks for insert
  with check (
    exists (
      select 1 from documents d
      where d.id = document_chunks.document_id
        and d.org_id = auth_org_id()
    )
  );

create policy "org members can delete chunks of their documents"
  on document_chunks for delete
  using (
    exists (
      select 1 from documents d
      where d.id = document_chunks.document_id
        and d.org_id = auth_org_id()
    )
  );

-- queries: scoped to the caller's org; inserts must be attributed to self.
create policy "org members can view their org's query history"
  on queries for select
  using (org_id = auth_org_id());

create policy "org members can log their own queries"
  on queries for insert
  with check (org_id = auth_org_id() and user_id = auth.uid());

-- ── Signup trigger: create an organization + profile for every new user ─────
-- Reads `org_name` from signup metadata (falls back to a default). Runs as
-- security definer (owner-level) so it can write regardless of RLS.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into organizations (name)
  values (coalesce(new.raw_user_meta_data ->> 'org_name', 'My Organization'))
  returning id into new_org_id;

  insert into profiles (id, org_id, email)
  values (new.id, new_org_id, new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Vector search RPC ─────────────────────────────────────────────────────
-- security invoker (default): RLS on documents/document_chunks still applies,
-- match_org is an explicit belt-and-suspenders filter and lets the planner
-- use the org index efficiently.
create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_org uuid,
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  filename text,
  page int,
  text text,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    d.filename,
    c.page,
    c.text,
    1 - (c.embedding <=> query_embedding) as similarity
  from document_chunks c
  join documents d on d.id = c.document_id
  where d.org_id = match_org
    and d.status = 'ready'
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ── Storage bucket for uploaded PDFs ─────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Objects are stored at `${org_id}/${document_id}/${filename}`; policies
-- check the leading path segment against the caller's org.
create policy "org members can read their org's files"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth_org_id()::text
  );

create policy "org members can upload files to their org"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth_org_id()::text
  );

create policy "org members can delete their org's files"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth_org_id()::text
  );
