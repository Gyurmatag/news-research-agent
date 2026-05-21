import type { AgentSandbox } from "./sandbox";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RESULTS: R2Bucket;
  AGENT_SANDBOX: DurableObjectNamespace<AgentSandbox>;
  AGENT_MODEL: string;
  JUDGE_MODEL: string;
  ANTHROPIC_API_KEY: string;
  TAVILY_API_KEY: string;
  OPENAI_API_KEY: string;
}
