// Check RLS (row-level visibility). On the same stand-in as check-schema.mjs, switch between logged-out user, creator A, creator B, and server roles and try operations.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const db = new PGlite({ extensions: { pgcrypto } });
const stub = readFileSync(new URL("./check-schema.mjs", import.meta.url), "utf8").match(/const stub = `([\s\S]*?)`;/)[1];
await db.exec(stub);
await db.exec(readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8"));

const A = "00000000-0000-0000-0000-00000000000a", B = "00000000-0000-0000-0000-00000000000b";
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);

async function as(role, uid, q, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  if (role !== "postgres") await db.exec(`set role ${role}`);
  try { return { ok: true, rows: (await db.query(q, params)).rows }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec("reset role"); }
}
let fails = 0;
function expect(name, cond, detail) { console.log(`${cond ? "OK  " : "NG  "} ${name}${cond ? "" : "  -> " + JSON.stringify(detail)}`); if (!cond) fails++; }

// Creator A: creates creator, community, and settings
let r = await as("authenticated", A, `insert into creators (user_id, display_name, slug) values ($1,'Creator A','creator-a') returning id`, [A]);
expect("A can create their own creator row", r.ok, r); const cA = r.rows?.[0]?.id;
r = await as("authenticated", B, `insert into creators (user_id, display_name, slug) values ($1,'impersonator','fake-a') returning id`, [A]);
expect("B cannot create a creator row for A's user_id", !r.ok, r);
r = await as("authenticated", B, `insert into creators (user_id, display_name, slug) values ($1,'Creator B','creator-b') returning id`, [B]);
r = await as("authenticated", A, `insert into communities (creator_id, name) values ($1,'Developers') returning id`, [cA]);
expect("A can create their own community", r.ok, r); const comA = r.rows?.[0]?.id;
r = await as("authenticated", B, `insert into communities (creator_id, name) values ($1,'hijack') returning id`, [cA]);
expect("B cannot create a community for A", !r.ok, r);
r = await as("authenticated", A, `insert into creator_settings (creator_id, ai_preferences) values ($1,'Prefer concrete proposals')`, [cA]);
expect("A can save AI settings", r.ok, r);
r = await as("anon", null, `select * from creator_settings`);
expect("Logged-out users cannot read AI settings", !r.ok || r.rows.length === 0, r);
r = await as("authenticated", B, `select * from creator_settings`);
expect("B cannot read A's AI settings", r.ok && r.rows.length === 0, r);

// Fan (logged out): posting
r = await as("anon", null, `insert into ideas (community_id, author_name, body) values ($1,'fan1','I want to run a weekly work session on Discord')`, [comA]);
expect("Logged-out users can post", r.ok, r);
r = await as("anon", null, `insert into ideas (community_id, body, ai_highlight) values ($1,'self-highlighted',true)`, [comA]);
expect("Logged-out users cannot fill AI columns themselves", !r.ok, r);
r = await as("anon", null, `insert into ideas (community_id, body, ai_kind) values ($1,'self-classified','idea')`, [comA]);
expect("Logged-out users cannot set AI classification themselves", !r.ok, r);
r = await as("anon", null, `select * from ideas`);
expect("Logged-out users cannot read the ideas table itself (with email column)", !r.ok, r);
r = await as("anon", null, `select * from ideas_public`);
expect("Posts not yet classified by AI do not appear in the public view", r.ok && r.rows.length === 0, r);

const pre = (await as("postgres", null, `select id from ideas limit 1`)).rows[0].id;
r = await as("anon", null, `insert into comments (idea_id, body) values ($1,'reply before classification')`, [pre]);
expect("Cannot reply to a post before AI classification (even knowing the id)", !r.ok, r);

// Server (service_role) writes the AI result
r = await as("service_role", null, `update ideas set ai_kind='project', ai_summary='Proposal for a weekly work session', ai_highlight=true, ai_highlight_reason='concrete' returning id`);
expect("Server can write AI results", r.ok && r.rows.length === 1, r);
r = await as("anon", null, `select * from ideas_public`);
expect("After classification it appears in the public view", r.ok && r.rows.length === 1, r);
expect("Public view has no email or highlight-reason columns", r.ok && !("email" in r.rows[0]) && !("ai_highlight_reason" in r.rows[0]), r.rows?.[0]);
const ideaId = r.rows?.[0]?.id;

// Creator's inbox
r = await as("authenticated", A, `select id, ai_highlight from ideas`);
expect("A can read posts in their own community", r.ok && r.rows.length === 1, r);
r = await as("authenticated", B, `select id from ideas`);
expect("B cannot read A's posts", r.ok && r.rows.length === 0, r);
r = await as("authenticated", B, `update ideas set status='selected' returning id`);
expect("B cannot modify A's posts", r.ok && r.rows.length === 0, r);

// Replies
r = await as("anon", null, `insert into comments (idea_id, author_name, body) values ($1,'fan2','I want to join')`, [ideaId]);
expect("Logged-out users can reply to published posts", r.ok, r);
r = await as("anon", null, `select body from comments`);
expect("Anyone can read replies", r.ok && r.rows.length === 1, r);
await as("service_role", null, `update ideas set ai_spam=true where id=$1`, [ideaId]);
r = await as("anon", null, `insert into comments (idea_id, body) values ($1,'reply to spam')`, [ideaId]);
expect("Cannot reply to a post flagged as spam", !r.ok, r);
r = await as("anon", null, `select body from comments`);
expect("Replies to spam-flagged posts become invisible", r.ok && r.rows.length === 0, r);

// Members
r = await as("anon", null, `insert into members (community_id, display_name) values ($1,'fan1')`, [comA]);
expect("Logged-out users can join a community", r.ok, r);
r = await as("anon", null, `select * from members`);
expect("Logged-out users cannot read the member list", !r.ok || r.rows.length === 0, r);
r = await as("authenticated", A, `select display_name from members`);
expect("A can read their own members", r.ok && r.rows.length === 1, r);

// Announcements
r = await as("authenticated", A, `insert into announcements (creator_id, title, body) values ($1,'Draft','Body') returning id`, [cA]);
expect("A can create an announcement draft", r.ok, r); const ann = r.rows?.[0]?.id;
r = await as("anon", null, `select * from announcements`);
expect("Drafts are invisible to logged-out users", r.ok && r.rows.length === 0, r);
await as("authenticated", A, `update announcements set published_at=now() where id=$1`, [ann]);
r = await as("anon", null, `select title from announcements`);
expect("Published announcements are visible", r.ok && r.rows.length === 1, r);
r = await as("authenticated", B, `update announcements set body='tampered' where id=$1 returning id`, [ann]);
expect("B cannot modify A's announcements", r.ok && r.rows.length === 0, r);

console.log(fails ? `\n${fails} NG` : "\nAll OK");
process.exit(fails ? 1 : 0);
