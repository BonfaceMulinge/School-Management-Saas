import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL="?([^"\s]+)"?\s*$/);
    if (m && !process.env.DATABASE_URL) process.env.DATABASE_URL = m[1];
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Cannot run live-database integration tests."
  );
}