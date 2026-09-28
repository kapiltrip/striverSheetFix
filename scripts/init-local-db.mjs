import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const base = [wrangler, "d1", "execute", "site-creator-d1", "--config", "wrangler.local.json", "--local", "--persist-to", ".wrangler/state", "--json"];

function execute(args) {
  const result = spawnSync(process.execPath, [...base, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Local database command failed.");
  try { return JSON.parse(result.stdout); }
  catch { throw new Error(`Could not read the local database response: ${result.stdout}`); }
}

const check = execute(["--command", "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"]);
if (check.some((item) => item.results?.some((row) => row.name === "settings"))) {
  console.log("Local study database is ready.");
} else {
  execute(["--file", "drizzle/0000_fair_shape.sql"]);
  console.log("Created the local study database.");
}
