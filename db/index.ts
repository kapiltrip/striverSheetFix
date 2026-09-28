import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Local D1 binding `DB` is unavailable. Start Recall with Open-Striver.cmd."
    );
  }

  return drizzle(env.DB, { schema });
}
