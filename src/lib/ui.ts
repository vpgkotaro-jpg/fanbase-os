export const input =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none";
export const button =
  "inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700";
export const buttonGhost =
  "inline-flex items-center justify-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100";
export const card = "rounded-lg border border-neutral-200 bg-white p-4";
export const label = "mb-1 block text-sm font-medium text-neutral-800";

export const KIND_LABEL: Record<string, string> = {
  idea: "Idea",
  project: "Project",
  collab: "Collaboration offer",
  question: "Question",
  other: "Other",
};

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const RESERVED_SLUGS = ["login", "onboarding", "dashboard", "auth", "api"];

export const TEMPLATES: Record<string, string> = {
  Developers: "Builders sharing projects, tools, and code ideas.",
  Designers: "Designers sharing work, feedback, and collaboration ideas.",
  Investors: "Investors and backers sharing views and opportunities.",
  Music: "Musicians and listeners sharing songs, gigs, and collabs.",
  Fitness: "People sharing training, goals, and events.",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// フォームから来た slug / id で戻り先を作る。形が違えば トップへ（外部サイトへのリダイレクトを防ぐ）。
export function safePath(slug: unknown, communityId?: unknown): string {
  const s = String(slug ?? "");
  if (!SLUG_RE.test(s)) return "/";
  if (communityId === undefined) return `/${s}`;
  const c = String(communityId ?? "");
  return UUID_RE.test(c) ? `/${s}/${c}` : `/${s}`;
}
