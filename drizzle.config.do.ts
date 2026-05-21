import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/do-schema.ts",
  out: "./drizzle/migrations/do",
});
