"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function postIdea(formData: FormData) {
  const base = `/${String(formData.get("slug"))}/${String(formData.get("community_id"))}`;
  const body = String(formData.get("body") ?? "").trim();
  const name = String(formData.get("author_name") ?? "").trim().slice(0, 60);
  if (!body) redirect(`${base}?postError=empty#post`);
  if (body.length > 2000) redirect(`${base}?postError=long#post`);

  const supabase = await createClient();
  // No .select(): anon fans cannot read the raw ideas table.
  const { error } = await supabase.from("ideas").insert({
    community_id: String(formData.get("community_id")),
    author_name: name || null,
    body,
  });
  if (error) redirect(`${base}?postError=failed#post`);
  redirect(`${base}?posted=1#post`);
}

export async function postReply(formData: FormData) {
  const base = `/${String(formData.get("slug"))}/${String(formData.get("community_id"))}`;
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
