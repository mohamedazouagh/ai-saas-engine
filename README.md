# AI SaaS Engine

Starter kit for the AI SaaS Engine product: Next.js (App Router) + TypeScript + Tailwind CSS + Supabase.

## Stack

- [Next.js 16](https://nextjs.org) — App Router, Server Components
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) — auth, database, storage (via `@supabase/supabase-js` and `@supabase/ssr`)

## Project structure

```
src/
  app/
    page.tsx            # Landing page
    dashboard/page.tsx  # Dashboard page
    layout.tsx          # Root layout
  lib/
    supabase/
      client.ts         # Supabase client for Client Components (browser)
      server.ts         # Supabase client for Server Components / Route Handlers
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com/dashboard) and create a new project.
2. In your project, go to **Settings > API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key (server-side only — never expose this to the client)

### 3. Configure environment variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`.env.local` is gitignored and will not be committed.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page, and [http://localhost:3000/dashboard](http://localhost:3000/dashboard) for the dashboard.

## Scripts

| Command         | Description              |
| ---------------- | ------------------------ |
| `npm run dev`     | Start the dev server     |
| `npm run build`   | Build for production     |
| `npm run start`   | Run the production build |
| `npm run lint`    | Lint the codebase        |

## Deployment

The easiest way to deploy is [Vercel](https://vercel.com/new). Set the same environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) in your Vercel project settings.
