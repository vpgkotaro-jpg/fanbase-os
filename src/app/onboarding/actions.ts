"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RESERVED_SLUGS, SLUG_RE, TEMPLATES } from "@/lib/ui";

function back(error: string): never {
  redirect(`/onboarding?error=${error}`);
}

export async function createCreator(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const displayName = String(formData.get("display_name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const bio = String(formData.get("bio") ?? "").trim();
  const aiPrefs = String(formData.get("ai_preferences") ?? "").trim();
  if (!displayName || displayName.length > 80) back("name");
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.includes(slug)) back("slug");
  if (bio.length > 1000 || aiPrefs.length > 500) back("length");

  const communities = formData
    .getAll("template")
    .map(String)
    .filter((t) => t in TEMPLATES)
    .map((name) => ({ name, description: TEMPLATES[name] }));
  const customName = String(formData.get("custom_name") ?? "").trim().slice(0, 60);
  if (customName) {
    communities.push({
      name: customName,
      description: String(formData.get("custom_description") ?? "").trim().slice(0, 500),
    });
  }

  const { data: creator, error } = await supabase
    .from("creators")
    .insert({ user_id: auth.user.id, display_name: displayName, slug, bio: bio || null })
    .select("id")
    .single();
  if (error || !creator) back(error?.code === "23505" ? "taken" : "failed");

  if (communities.length) {
    await supabase
      .from("communities")
      .insert(communities.map((c) => ({ ...c, creator_id: creator.id })));
  }
  if (aiPrefs) {
    await supabase
      .from("creator_settings")
      .insert({ creator_id: creator.id, ai_preferences: aiPrefs });
  }
  redirect("/dashboard");
}
