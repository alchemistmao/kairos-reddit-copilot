-- Seed de desenvolvimento local (`supabase db reset`).
--
-- O seed real (subreddits, keywords, allowed_emails) vive em
-- packages/core/src/seed-data.ts e é aplicado de forma idempotente pelo worker
-- no boot (ensureSeed), para que o deploy não tenha passo manual.
--
-- Este arquivo existe só para dar paridade ao ambiente local: se você rodar
-- `supabase db reset`, rode em seguida `npm run seed`.

select 1;
