import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { button, card, input, KIND_LABEL, label } from "@/lib/ui";
import { postIdea, postReply } from "./actions";

const POST_ERRORS: Record<string, string> = {
  empty: "Please write something.",
  long: "Please keep it under 2000 characters.",
  failed: "Could not send. Please try again.",
};
const REPLY_ERRORS: Record<string, string> = {
  empty: "Please write something.",
  long: "Please keep it under 1000 characters.",
  failed: "Could not send. Please try again.",
};
const UUID = /^[0-9a-f-]{36}$/i;

async function Content({
  params,
  searchParams,
}: PageProps<"/[slug]/[communityId]">) {
  const { slug, communityId } = await params;
  const sp = await searchParams;
  if (!UUID.test(communityId)) notFound();

  const supabase = await createClient();
  const { data: creator } = await supabase
    .from("creators")
    .select("id, display_name")
    .eq("slug", slug)
    .maybeSingle();
  if (!creator) notFound();
  const { data: community } = await supabase
    .from("communities")
    .select("id, name, description")
    .eq("id", communityId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!community) notFound();

  const { data: ideas } = await supabase
    .from("ideas_public")
    .select("id, author_name, body, ai_kind, ai_summary, created_at")
    .eq("community_id", community.id)
    .order("created_at", { ascending: false });
  const ids = (ideas ?? []).map((i) => i.id);
  const { data: comments } = ids.length
    ? await supabase
        .from("comments")
        .select("id, idea_id, author_name, body, created_at")
        .in("idea_id", ids)
        .order("created_at")
    : { data: [] };

  const postError = typeof sp.postError === "string" ? POST_ERRORS[sp.postError] : undefined;
  const replyError = typeof sp.replyError === "string" ? REPLY_ERRORS[sp.replyError] : undefined;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link href={`/${slug}`} className="text-sm text-neutral-500 underline">
          {creator.display_name}
        </Link>
        <h1 className="text-2xl font-semibold">{community.name}</h1>
        {community.description && <p className="text-neutral-600">{community.description}</p>}
      </header>

      <section id="post" className={`${card} space-y-3`}>
        <h2 className="font-semibold">Send an idea</h2>
        {sp.posted && (
          <p className="text-sm text-green-700">
            Sent. Thank you. Your post will appear here after it has been reviewed.
          </p>
        )}
        {postError && <p className="text-sm text-red-600">{postError}</p>}
        <form action={postIdea} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="community_id" value={community.id} />
          <div>
            <label htmlFor="author_name" className={label}>Name (optional)</label>
            <input id="author_name" name="author_name" maxLength={60} className={input} />
          </div>
          <div>
            <label htmlFor="body" className={label}>Your idea</label>
            <textarea id="body" name="body" required rows={4} maxLength={2000}
              placeholder="What you want to see, what you're building, what to do together, or a question"
              className={input} />
          </div>
          <button type="submit" className={button}>Send</button>
        </form>
      </section>

      <section className="space-y-4">
        {!ideas?.length && (
          <p className="text-sm text-neutral-600">No ideas yet. Be the first to send one.</p>
        )}
        {ideas?.map((idea) => {
          const replies = (comments ?? []).filter((c) => c.idea_id === idea.id);
          return (
            <article key={idea.id} id={`idea-${idea.id}`} className={`${card} space-y-2`}>
              <div className="flex gap-2 text-xs text-neutral-500">
                {idea.ai_kind && <span>{KIND_LABEL[idea.ai_kind]}</span>}
                {idea.author_name && <span>by {idea.author_name}</span>}
                <span>{new Date(idea.created_at).toLocaleDateString("en")}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{idea.body}</p>
              <div className="space-y-2 border-t border-neutral-100 pt-2">
                <p className="text-xs font-medium text-neutral-500">Replies {replies.length}</p>
                {!replies.length && <p className="text-xs text-neutral-500">No replies yet.</p>}
                {replies.map((r) => (
                  <p key={r.id} className="text-sm">
                    <span className="font-medium">{r.author_name || "Anonymous"}: </span>
                    <span className="whitespace-pre-wrap">{r.body}</span>
                  </p>
                ))}
                <form action={postReply} className="space-y-2">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="community_id" value={community.id} />
                  <input type="hidden" name="idea_id" value={idea.id} />
                  <input name="author_name" placeholder="Name (optional)" maxLength={60} className={input} />
                  <textarea name="body" required rows={2} maxLength={1000}
                    placeholder="Write a reply" className={input} />
                  <button type="submit" className={button}>Reply</button>
                </form>
              </div>
            </article>
          );
        })}
        {replyError && <p className="text-sm text-red-600">{replyError}</p>}
      </section>
    </div>
  );
}

export default function CommunityPage(props: PageProps<"/[slug]/[communityId]">) {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
      <Content {...props} />
    </Suspense>
  );
}
