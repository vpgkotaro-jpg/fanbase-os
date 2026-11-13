import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyPost } from "@/lib/ai";

// Classify one stored post and write the AI columns with the service-role client.
// Never throws: a failure is logged and the post is saved as kind "other" with an empty summary.
export async function classifyAndSave(ideaId: string, communityId: string, body: string) {
  try {
    const admin = createAdminClient();
    const { data: community } = await admin
      .from("communities")
      .select("creator_id")
      .eq("id", communityId)
      .maybeSingle();
    if (!community) return;
    const [{ data: siblings }, { data: settings }] = await Promise.all([
      admin.from("communities").select("id, name, description").eq("creator_id", community.creator_id),
      admin
        .from("creator_settings")
        .select("ai_preferences")
        .eq("creator_id", community.creator_id)
        .maybeSingle(),
    ]);
    const r = await classifyPost({
      postId: ideaId,
      text: body,
      lang: "en", // the app UI is English
      preferences: settings?.ai_preferences ?? "",
      communities: siblings ?? [],
    });
    const { error } = await admin
      .from("ideas")
      .update({
        ai_kind: r.kind,
        ai_summary: r.summary,
        ai_community_id: r.community_id,
        ai_spam: r.spam,
        ai_injection: r.injection_attempt,
        ai_highlight: r.highlight,
        ai_highlight_reason: r.highlight_reason,
      })
      .eq("id", ideaId);
    if (error) console.error("classify: save failed", error.message);
  } catch (e) {
    console.error("classify: failed", e instanceof Error ? e.message : e);
  }
}
