// RLS（行ごとの見え方）の確認。check-schema.mjs と同じ代役の上で、ログイン前の人・作者A・作者B・サーバーの立場を切り替えて試す。
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

// 作者A：作者・コミュニティ・設定を作る
let r = await as("authenticated", A, `insert into creators (user_id, display_name, slug) values ($1,'Aさん','creator-a') returning id`, [A]);
expect("Aは自分の作者行を作れる", r.ok, r); const cA = r.rows?.[0]?.id;
r = await as("authenticated", B, `insert into creators (user_id, display_name, slug) values ($1,'なりすまし','fake-a') returning id`, [A]);
expect("BはAの名前で作者行を作れない", !r.ok, r);
r = await as("authenticated", B, `insert into creators (user_id, display_name, slug) values ($1,'Bさん','creator-b') returning id`, [B]);
const cB = r.rows?.[0]?.id;
r = await as("authenticated", A, `insert into communities (creator_id, name) values ($1,'Developers') returning id`, [cA]);
expect("Aは自分のコミュニティを作れる", r.ok, r); const comA = r.rows?.[0]?.id;
r = await as("authenticated", B, `insert into communities (creator_id, name) values ($1,'乗っ取り') returning id`, [cA]);
expect("BはAのコミュニティを作れない", !r.ok, r);
r = await as("authenticated", A, `insert into creator_settings (creator_id, ai_preferences) values ($1,'具体的な提案を優先')`, [cA]);
expect("AはAI設定を保存できる", r.ok, r);
r = await as("anon", null, `select * from creator_settings`);
expect("ログイン前の人はAI設定を読めない", !r.ok || r.rows.length === 0, r);
r = await as("authenticated", B, `select * from creator_settings`);
expect("BはAのAI設定を読めない", r.ok && r.rows.length === 0, r);

// ファン（ログイン前）：投稿
r = await as("anon", null, `insert into ideas (community_id, author_name, body) values ($1,'fan1','Discordで週1の作業会をやりたい')`, [comA]);
expect("ログイン前の人は投稿できる", r.ok, r);
r = await as("anon", null, `insert into ideas (community_id, body, ai_highlight) values ($1,'自分で注目に入れる',true)`, [comA]);
expect("ログイン前の人はAIの欄を自分で埋められない", !r.ok, r);
r = await as("anon", null, `insert into ideas (community_id, body, ai_kind) values ($1,'自分で分類','idea')`, [comA]);
expect("ログイン前の人はAI分類を自分で付けられない", !r.ok, r);
r = await as("anon", null, `select * from ideas`);
expect("ログイン前の人は ideas 本体（メール欄つき）を読めない", !r.ok, r);
r = await as("anon", null, `select * from ideas_public`);
expect("AIの分類前の投稿は公開ビューに出ない", r.ok && r.rows.length === 0, r);

// サーバー（service_role）がAIの結果を書く
r = await as("service_role", null, `update ideas set ai_kind='project', ai_summary='週1の作業会の提案', ai_highlight=true, ai_highlight_reason='具体的' returning id`);
expect("サーバーはAIの結果を書ける", r.ok && r.rows.length === 1, r);
r = await as("anon", null, `select * from ideas_public`);
expect("分類後は公開ビューに出る", r.ok && r.rows.length === 1, r);
expect("公開ビューにメールと注目理由の列がない", r.ok && !("email" in r.rows[0]) && !("ai_highlight_reason" in r.rows[0]), r.rows?.[0]);
const ideaId = r.rows?.[0]?.id;

// 作者の受信箱
r = await as("authenticated", A, `select id, ai_highlight from ideas`);
expect("Aは自分のコミュニティの投稿を読める", r.ok && r.rows.length === 1, r);
r = await as("authenticated", B, `select id from ideas`);
expect("BはAの投稿本体を読めない", r.ok && r.rows.length === 0, r);
r = await as("authenticated", B, `update ideas set status='selected' returning id`);
expect("BはAの投稿を変えられない", r.ok && r.rows.length === 0, r);

// 返信
r = await as("anon", null, `insert into comments (idea_id, author_name, body) values ($1,'fan2','参加したい')`, [ideaId]);
expect("ログイン前の人は公開済みの投稿に返信できる", r.ok, r);
r = await as("anon", null, `select body from comments`);
expect("返信は誰でも読める", r.ok && r.rows.length === 1, r);
await as("service_role", null, `update ideas set ai_spam=true where id=$1`, [ideaId]);
r = await as("anon", null, `insert into comments (idea_id, body) values ($1,'スパムへの返信')`, [ideaId]);
expect("スパム判定の投稿には返信できない", !r.ok, r);
r = await as("anon", null, `select body from comments`);
expect("スパム判定の投稿の返信は見えなくなる", r.ok && r.rows.length === 0, r);

// メンバー
r = await as("anon", null, `insert into members (community_id, display_name) values ($1,'fan1')`, [comA]);
expect("ログイン前の人はコミュニティに参加できる", r.ok, r);
r = await as("anon", null, `select * from members`);
expect("ログイン前の人はメンバー一覧を読めない", !r.ok || r.rows.length === 0, r);
r = await as("authenticated", A, `select display_name from members`);
expect("Aは自分のメンバーを読める", r.ok && r.rows.length === 1, r);

// 告知
r = await as("authenticated", A, `insert into announcements (creator_id, title, body) values ($1,'下書き','本文') returning id`, [cA]);
expect("Aは告知の下書きを作れる", r.ok, r); const ann = r.rows?.[0]?.id;
r = await as("anon", null, `select * from announcements`);
expect("下書きはログイン前の人に見えない", r.ok && r.rows.length === 0, r);
await as("authenticated", A, `update announcements set published_at=now() where id=$1`, [ann]);
r = await as("anon", null, `select title from announcements`);
expect("公開した告知は見える", r.ok && r.rows.length === 1, r);
r = await as("authenticated", B, `update announcements set body='改ざん' where id=$1 returning id`, [ann]);
expect("BはAの告知を変えられない", r.ok && r.rows.length === 0, r);

console.log(fails ? `\n${fails} 件 NG` : "\nすべて OK");
process.exit(fails ? 1 : 0);
