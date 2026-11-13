"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safePath } from "@/lib/ui";
import { classifyAndSave } from "@/lib/classify";

export async function postIdea(formData: FormData) {
  const base = safePath(formData.get("slug"), formData.get("community_id"));
  const body = String(formData.get("body") ?? "").trim();
  const name = String(formData.get("author_name") ?? "").trim().slice(0, 60);
  if (!body) redirect(`${base}?postError=empty#post`);
  if (body.length > 2000) redirect(`${base}?postError=long#post`);

  const supabase = await createClient();
  // No .select(): anon fans cannot read the raw ideas table, so the id is generated here.
  const id = crypto.randomUUID();
  const communityId = String(formData.get("community_id"));
  const { error } = await supabase.from("ideas").insert({
    id,
    community_id: communityId,
    author_name: name || null,
    body,
  });
  if (error) redirect(`${base}?postError=failed#post`);
  // Classify after the response is sent. Only the post text goes to the AI (never email).
  after(() => classifyAndSave(id, communityId, body));
  redirect(`${base}?posted=1#post`);
}

export async function postReply(formData: FormData) {
  const base = safePath(formData.get("slug"), formData.get("community_id"));
  const ideaId = String(formData.get("idea_id"));
  const body = String(formData.get("body") ?? "").trim();
  const name = String(formData.get("author_name") ?? "").trim().slice(0, 60);
  if (!body) redirect(`${base}?replyError=empty#idea-${ideaId}`);
  if (body.length > 1000) redirect(`${base}?replyError=long#idea-${ideaId}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .insert({ idea_id: ideaId, author_name: name || null, body });
  if (error) redirect(`${base}?replyError=failed#idea-${ideaId}`);
  redirect(`${base}#idea-${ideaId}`);
}
