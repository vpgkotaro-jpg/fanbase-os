import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { button, buttonGhost, card, input, label } from "@/lib/ui";
import { joinCommunity } from "./actions";

const JOIN_ERRORS: Record<string, string> = {
  empty: "Please enter a name or an email.",
  email: "The email address is not valid.",
  already: "You're already in.",
  failed: "Could not send. Please try again.",
};

async function Content({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: creator } = await supabase
    .from("creators")
    .select("id, display_name, bio")
    .eq("slug", slug)
    .maybeSingle();
  if (!creator) notFound();

  const { data: communities } = await supabase
    .from("communities")
    .select("id, name, description")
    .eq("creator_id", creator.id)
    .order("created_at");

  const joinedId = typeof sp.joined === "string" ? sp.joined : undefined;
  const joined = communities?.find((c) => c.id === joinedId);
  const joinError = typeof sp.joinError === "string" ? JOIN_ERRORS[sp.joinError] : undefined;

  return (
    <div className="space-y-8">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">{creator.display_name}</h1>
        {creator.bio && <p className="whitespace-pre-wrap text-neutral-600">{creator.bio}</p>}
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold">Communities</h2>
        {!communities?.length && <p className="text-sm text-neutral-600">No communities yet.</p>}
        {communities?.map((c) => (
          <div key={c.id} className={`${card} flex items-center justify-between gap-3`}>
            <div>
              <p className="font-medium">{c.name}</p>
              {c.description && <p className="text-sm text-neutral-600">{c.description}</p>}
            </div>
            <Link href={`/${slug}/${c.id}`} className={buttonGhost}>Open</Link>
          </div>
        ))}
      </section>

      {!!communities?.length && (
        <section id="join" className={`${card} space-y-3`}>
          <h2 className="font-semibold">Join a community</h2>
          {joined && <p className="text-sm text-green-700">You joined {joined.name}.</p>}
          {joinError && <p className="text-sm text-red-600">{joinError}</p>}
          <form action={joinCommunity} className="space-y-3">
            <input type="hidden" name="slug" value={slug} />
            <div>
              <label htmlFor="community_id" className={label}>Community</label>
              <select id="community_id" name="community_id" className={input}>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="name" className={label}>Name</label>
              <input id="name" name="name" maxLength={80} className={input} />
            </div>
            <div>
              <label htmlFor="email" className={label}>Email (name or email is enough)</label>
              <input id="email" name="email" type="email" maxLength={254} className={input} />
              <p className="mt-1 text-xs text-neutral-500">
                Only the creator can see it. It is not shown publicly.
              </p>
            </div>
            <button type="submit" className={button}>Join</button>
          </form>
        </section>
      )}
    </div>
  );
}

export default function CreatorPage(props: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
      <Content {...props} />
    </Suspense>
  );
}
