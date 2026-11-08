import "dotenv/config";
import fs from "node:fs/promises";
import { sql } from "../src/lib/db";

async function main() {
  await sql.unsafe(await fs.readFile("db/schema.sql", "utf8"));
  console.log("schema aplicado");
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
