"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { draftAnnouncement } from "@/lib/ai";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(error?: string, hash?: string): never {
  const q = error ? `?error=${error}` : "";
  redirect(`/dashboard${q}${hash ? `#${hash}` : ""}`);
}

// Owner actions use the user's own client, so RLS decides what is allowed.
export async function draftFromIdea(formData: FormData) {
  const ideaId = String(formData.get("idea_id") ?? "");
  if (!UUID_RE.test(ideaId)) back("failed");
  const planNote = String(formData.get("plan_note") ?? "").trim().slice(0, 300);
  const hash = `idea-${ideaId}`;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: creator } = await supabase
    .from("creators")
    .select("id, display_name")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!creator) redirect("/onboarding");
  // RLS limits this select to ideas in the creator's own communities.
  const { data: idea } = await supabase
    .from("ideas")
    .select("id, body, ai_summary")
    .eq("id", ideaId)
    .maybeSingle();
  if (!idea) back("failed", hash);

  const draft = await draftAnnouncement({
    postId: idea.id,
    creatorName: creator.display_name,
    summary: idea.ai_summary || idea.body.slice(0, 100),
    text: idea.body,
    planNote,
    lang: "en",
  });
  if (!draft) back("ai", hash);

  const { error } = await supabase.from("announcements").insert({
    creator_id: creator.id,
    idea_id: idea.id,
    title: draft.title,
    body: draft.body,
    published_at: null,
  });
  if (error) back("failed", hash);
  await supabase.from("ideas").update({ status: "selected" }).eq("id", idea.id);
  revalidatePath("/dashboard");
  back(undefined, "announcements");
}

export async function saveAnnouncement(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) back("failed");
  const title = String(formData.get("title") ?? "").trim().slice(0, 100);
  const body = String(formData.get("body") ?? "").trim();
  const publish = formData.get("intent") === "publish";
  const hash = `ann-${id}`;
  if (!body || body.length > 3000) back("body", hash);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const patch: { title: string | null; body: string; published_at?: string } = {
    title: title || null,
    body,
  };
  if (publish) patch.published_at = new Date().toISOString();
  // Only drafts can be edited here; RLS limits rows to the owner.
  const { data: row, error } = await supabase
    .from("announcements")
    .update(patch)
    .eq("id", id)
    .is("published_at", null)
    .select("idea_id")
    .maybeSingle();
  if (error || !row) back("failed", hash);
  if (publish && row.idea_id) {
    await supabase.from("ideas").update({ status: "announced" }).eq("id", row.idea_id);
  }
  revalidatePath("/dashboard");
  back(undefined, "announcements");
}
