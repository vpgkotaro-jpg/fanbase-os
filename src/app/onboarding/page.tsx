import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { button, input, label, TEMPLATES } from "@/lib/ui";
import { createCreator } from "./actions";

const ERRORS: Record<string, string> = {
  taken: "This URL is already taken.",
  slug: "Use 3 to 40 letters, numbers, or hyphens.",
  name: "Please enter a display name (up to 80 characters).",
  length: "Something is too long. Please shorten it.",
  failed: "Could not save. Please try again.",
};

async function Content({ searchParams }: PageProps<"/onboarding">) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: existing } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (existing) redirect("/dashboard");

  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <form action={createCreator} className="space-y-6">
      <h1 className="text-2xl font-semibold">Setup</h1>
      {message && <p className="text-sm text-red-600">{message}</p>}
      <div>
        <label htmlFor="display_name" className={label}>Display name</label>
        <input id="display_name" name="display_name" required maxLength={80} className={input} />
      </div>
      <div>
        <label htmlFor="slug" className={label}>Page URL (letters, numbers, hyphens)</label>
        <input id="slug" name="slug" required maxLength={40} pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" className={input} />
      </div>
      <div>
        <label htmlFor="bio" className={label}>About you (optional)</label>
        <textarea id="bio" name="bio" rows={3} maxLength={1000} className={input} />
      </div>
      <fieldset className="space-y-2">
        <legend className={label}>Communities (2 or 3 is a good start)</legend>
        <p className="text-sm text-neutral-600">Pick what fits your followers, or write your own.</p>
        {Object.keys(TEMPLATES).map((name) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="template" value={name} /> {name}
          </label>
        ))}
        <div className="grid gap-2 pt-2 sm:grid-cols-2">
          <input name="custom_name" placeholder="Name" maxLength={60} className={input} />
          <input name="custom_description" placeholder="Description" maxLength={500} className={input} />
        </div>
      </fieldset>
      <div>
        <label htmlFor="ai_preferences" className={label}>What should AI look out for? (optional)</label>
        <textarea id="ai_preferences" name="ai_preferences" rows={2} maxLength={500}
          placeholder="e.g. people who can make videos with me, local events" className={input} />
        <p className="mt-1 text-xs text-neutral-500">Not shown publicly.</p>
      </div>
      <button type="submit" className={button}>Save and start</button>
    </form>
  );
}

export default function OnboardingPage(props: PageProps<"/onboarding">) {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
      <Content {...props} />
    </Suspense>
  );
}
