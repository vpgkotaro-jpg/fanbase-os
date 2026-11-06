// supabase/schema.sql をローカルの PGlite（Postgres）で流して、構文と RLS の基本を確かめる。
// Supabase 固有の部分（auth.users, auth.uid(), anon/authenticated ロール）は最小限の代役を作る。
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const db = new PGlite({ extensions: { pgcrypto } });
const stub = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;
await db.exec(stub);
const sql = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
try {
  await db.exec(sql);
  console.log("schema.sql: OK");
} catch (e) {
  console.log("schema.sql: ERROR", e.message, e.position ? `(position ${e.position})` : "");
  if (e.position) {
    const upto = sql.slice(0, Number(e.position));
    console.log("line", upto.split("\n").length, ":", sql.split("\n")[upto.split("\n").length - 1]);
  }
  process.exit(1);
}
const t = await db.query(`select table_name, table_type from information_schema.tables where table_schema='public' order by 1`);
console.log(t.rows.map(r => `${r.table_name}${r.table_type === "VIEW" ? "(view)" : ""}`).join(", "));
const rls = await db.query(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
console.log("RLS off:", rls.rows.map(r => r.relname).join(", ") || "none");
export { db };
