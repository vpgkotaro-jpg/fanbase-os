import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buttonGhost, card, KIND_LABEL } from "@/lib/ui";

async function Content() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: creator } = await supabase
    .from("creators")
    .select("id, display_name, slug")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!creator) redirect("/onboarding");

  const { data: communities } = await supabase
    .from("communities")
    .select("id, name, description")
    .eq("creator_id", creator.id)
    .order("created_at");
  const { data: ideas } = await supabase
    .from("ideas")
    .select(
      "id, community_id, author_name, body, ai_kind, ai_summary, ai_highlight, ai_highlight_reason, ai_spam, ai_injection, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(20);

  const communityName = new Map((communities ?? []).map((c) => [c.id, c.name]));
  const hasCommunities = (communities?.length ?? 0) > 0;
  const hasIdeas = (ideas?.length ?? 0) > 0;
  const steps = [
    { text: "Create your communities", done: hasCommunities },
    { text: "Copy your page link and add it to your bio", done: false },
    { text: "Wait for the first post. It will show up here.", done: hasIdeas },
  ];

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{creator.display_name}</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className={buttonGhost}>Sign out</button>
        </form>
      </header>

      <section className={`${card} space-y-2`}>
        <h2 className="font-semibold">Next steps</h2>
        <ul className="space-y-1 text-sm">
          {steps.map((s) => (
            <li key={s.text}>{s.done ? "[x]" : "[ ]"} {s.text}</li>
          ))}
        </ul>
        <p className="text-sm">
          Your page:{" "}
          <Link href={`/${creator.slug}`} className="underline">/{creator.slug}</Link>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Communities</h2>
        {!hasCommunities && <p className="text-sm text-neutral-600">No communities yet.</p>}
        {communities?.map((c) => (
          <div key={c.id} className={card}>
            <Link href={`/${creator.slug}/${c.id}`} className="font-medium underline">{c.name}</Link>
            {c.description && <p className="text-sm text-neutral-600">{c.description}</p>}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Recent ideas</h2>
        {!hasIdeas && (
          <p className="text-sm text-neutral-600">
            Nothing received yet. Share your page link and ideas will arrive here.
          </p>
        )}
        {ideas?.map((i) => (
          <article key={i.id} className={`${card} space-y-1`}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span>{communityName.get(i.community_id) ?? ""}</span>
              <span>{i.ai_kind ? KIND_LABEL[i.ai_kind] : "Not sorted yet"}</span>
              {i.ai_highlight && <span className="font-medium text-amber-700">Highlight</span>}
              {i.ai_spam && <span className="text-red-600">Possible spam</span>}
              {i.ai_injection && <span className="text-red-600">Contains instructions aimed at AI</span>}
              <span>{new Date(i.created_at).toLocaleDateString("en")}</span>
            </div>
            {i.ai_summary && <p className="text-sm font-medium">{i.ai_summary}</p>}
            {i.ai_highlight_reason && (
              <p className="text-xs text-neutral-600">Why: {i.ai_highlight_reason}</p>
            )}
            <p className="whitespace-pre-wrap text-sm">{i.body}</p>
            {i.author_name && <p className="text-xs text-neutral-500">by {i.author_name}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
      <Content />
    </Suspense>
  );
}
