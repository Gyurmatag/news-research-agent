# news-research-agent

Lightweight agentic automation platform: a journalist or analyst pastes a research query, an agent runs end-to-end news research (Claude Agent SDK + optional Tavily MCP), the chat UI streams progress live, and the result is a downloadable CSV plus an auto-generated 4-layer eval verdict.

## Stack

- Cloudflare Workers + Durable Objects (one DO per run)
- Cloudflare Sandbox container running `@anthropic-ai/claude-agent-sdk` (Claude Sonnet 4.6)
- Tavily MCP (default on, user-toggleable)
- Next.js 16 App Router via `@opennextjs/cloudflare`
- AI Elements + shadcn/ui chat
- D1 (Drizzle) for app state, DO SQLite (Drizzle) for per-run events
- R2 for CSV artifacts
- GPT-5.5 judge via Vercel AI SDK

## Output

`/workspace/output/results.csv` with columns `title,source,url,date,summary`.

## Eval thresholds

- Schema: parses, 5 columns, >= 5 rows
- Content: each `date` within last 30 days, >= 3 unique source domains, no duplicate URLs (host+path)
- Tool trace: at least one search-tool call before the first `Write`
- Judge: GPT-5.5 with today's date injected into the prompt

`overallPass = schema && content && toolTrace && judge`.

## Cost cap

`$0.50` per run, enforced both in the agent script and defense-in-depth in the DO.

## Local dev

```bash
cp .env.example .dev.vars   # populate with real keys
npm install
npm run dev
```

## Deploy

```bash
wrangler d1 create news-research-agent-db          # copy id into wrangler.jsonc
wrangler r2 bucket create news-research-agent-outputs
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TAVILY_API_KEY
wrangler secret put OPENAI_API_KEY
npm run db:migrate:remote
npm run deploy
```
