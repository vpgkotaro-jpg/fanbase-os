# Fanbase OS

A home base for a creator's community. A creator signs in, picks community templates, and shares one link. Fans join, post ideas and projects, and reply to each other. AI sorts the posts so the creator sees what matters, and the creator turns a chosen idea into an announcement.

Built for the Startupathon assignment "Build the Operating System for Fanbases".

## Status

Work in progress. Done so far:

- Sign in with Google or an email link (Supabase Auth)
- Onboarding: name, public URL, communities from templates (Developers, Designers, Investors, Music, Fitness), optional AI preferences
- Creator dashboard: own communities and recent posts
- Public creator page `/{slug}` with a join form
- Community page `/{slug}/{communityId}`: post an idea or project, read and reply
- Database schema with row-level security, checked locally (see below)
- AI sorting of new posts (kind, one-line summary, spam and prompt-injection flags, highlight with a reason), run on the server after a post is saved. Running on the live deployment.
- Dashboard: posts show kind, summary and highlights; "Draft announcement" asks the AI for a draft, the creator edits it and publishes. Published announcements appear on `/{slug}`.

Live demo: https://fanbase-os-beta.vercel.app (public page: /demo).

Not done: votes and grouping of similar posts, email delivery. If the AI call fails, a post is saved as "Other" with an empty summary and shows as "Unclassified". If `SUPABASE_SERVICE_ROLE_KEY` is missing, new posts are not classified and stay hidden from the public.

## Stack

Next.js (App Router, TypeScript), Tailwind CSS, Supabase (Postgres, Auth, RLS). Deployed on Vercel.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Environment variable names (values go only in `.env.local`, never in git): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `LLM_API_KEY` (Anthropic API key, server only), `LLM_MODEL`, `SITE_URL`. Without `LLM_API_KEY` the AI step is skipped and posts are saved as "Other".

Apply `supabase/schema.sql` to your Supabase project (SQL Editor) before signing in.

## Checks

```bash
npm run check:schema   # runs supabase/schema.sql on a local Postgres (PGlite) with small stand-ins for Supabase auth
npm run check:rls      # switches between guest, creator A, creator B and server roles and checks who can read or write what
```

The RLS checks cover, among others: a user cannot create a creator profile for someone else; guests cannot read members, AI preferences or the raw posts table (which holds emails); guests cannot fill AI fields themselves; a post is public only after it is classified; unpublished announcements stay hidden.

## Data and privacy

- Fans can post without an account. The raw `ideas` table is readable only by the community owner; the public sees the `ideas_public` view, which leaves out email and AI-internal fields.
- AI results are written only from the server. Keys stay in `.env.local` and are never committed.
