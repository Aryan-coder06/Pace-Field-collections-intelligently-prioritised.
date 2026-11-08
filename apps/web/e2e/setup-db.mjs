import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const api = resolve(root, "apps/api");
const databaseUrl = "postgresql+psycopg://pace:pace@127.0.0.1:5432/pace_e2e";

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
}

run("docker", [
  "compose", "-f", "infra/docker-compose.yml", "exec", "-T", "postgres",
  "psql", "-U", "pace", "-d", "postgres", "-c",
  "DROP DATABASE IF EXISTS pace_e2e WITH (FORCE)",
]);
run("docker", [
  "compose", "-f", "infra/docker-compose.yml", "exec", "-T", "postgres",
  "psql", "-U", "pace", "-d", "postgres", "-c", "CREATE DATABASE pace_e2e",
]);
execFileSync(resolve(api, ".venv/bin/alembic"), ["upgrade", "head"], {
  cwd: api,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
execFileSync(resolve(api, ".venv/bin/python"), ["-m", "app.seed"], {
  cwd: api,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
