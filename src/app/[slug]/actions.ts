"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function joinCommunity(formData: FormData) {
  const slug = String(formData.get("slug"));
  const communityId = String(formData.get("community_id"));
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const base = `/${slug}`;
  if (!name && !email) redirect(`${base}?joinError=empty#join`);
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) redirect(`${base}?joinError=email#join`);

  const supabase = await createClient();
  const { error } = await supabase.from("members").insert({
    community_id: communityId,
    display_name: name || null,
    email: email || null,
  });
  if (error?.code === "23505") redirect(`${base}?joinError=already#join`);
  if (error) redirect(`${base}?joinError=failed#join`);
  redirect(`${base}?joined=${encodeURIComponent(communityId)}#join`);
}
