// scripts/build-server.mjs — bundles server.ts → dist/server.cjs, embedding the
// Groq API keys at build time via esbuild --define so the packaged desktop app
// works with zero user setup.
//
// Key sources (in order):
//   1. GROQ_API_KEYS / GROQ_API_KEY environment variables (used by CI release)
//   2. .env file in the repo root (used by local packaging)
//
// The embedded keys land ONLY in dist/server.cjs — never in the git-tracked
// source or the public repo. Check dist/ is gitignored (it is).

import { build } from "esbuild";
import dotenv from "dotenv";

// Load .env for local builds (CI passes real env vars, dotenv no-ops there).
dotenv.config();

const rawKeys =
  process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";

if (!rawKeys.trim()) {
  console.warn(
    "\n[build-server] WARNING: No GROQ_API_KEYS / GROQ_API_KEY found.\n" +
    "  The bundled server will have no AI features unless keys are provided\n" +
    "  at runtime via environment. Set GROQ_API_KEYS (comma-separated) or\n" +
    "  create a .env file. Continuing anyway...\n"
  );
}

// Normalize: trim, drop empties, join with commas — a clean JSON string to embed.
const keys = rawKeys
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean)
  .join(",");

const result = await build({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  sourcemap: true,
  outfile: "dist/server.cjs",
  define: {
    // Identifier → literal. Escaped as JSON so commas/quotes survive intact.
    EMBEDDED_GROQ_KEYS: JSON.stringify(keys),
  },
});

if (keys) {
  const count = keys.split(",").length;
  console.log(`[build-server] Embedded ${count} Groq key(s) into dist/server.cjs`);
} else {
  console.log("[build-server] Built server without embedded keys (env-only mode)");
}

console.log("[build-server] dist/server.cjs written");
