<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploys cost money — do not push to `main` casually

`main` auto-deploys to Netlify production. **Every production build costs ~15
credits**, charged before a single visitor loads the site. Branch pushes can
also trigger preview builds that consume credits.

On 2026-09-05 seven pushes to `main` in three hours (~105 credits) exhausted the
account, and the site returned `HTTP 503 {"error":"usage_exceeded"}` on every
URL — including static assets — until the quota reset. Treat a deploy as a
billed, user-visible event, not a way to check whether something worked.

**Rules:**

1. **Ask before merging to `main`.** It is a production deploy every time.
2. **Batch related changes into one deploy.** Never ship a speculative fix and
   check it in production; reproduce it locally first with
   `npm run build && PORT=3011 npm start`. Device/User-Agent-dependent
   behaviour can be verified locally with `curl -H 'User-Agent: …'` — no deploy
   required.
3. **Never deploy just to fix repo hygiene** (stray files, committed artifacts).
   Fold it into the next real change.
4. **Verify a deploy once.** Do not poll production in a loop; that burns
   function invocations.
5. `.planning/` docs-only commits should not reach `main` on their own — GSD
   generates many of them, and each one would otherwise cost a full build.
