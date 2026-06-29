/**
 * S3 / R2 storage connectivity diagnostic.
 *
 *   npm run test:s3        (from the repo root, with a populated .env)
 *   # or: npx tsx scripts/test-s3.ts
 *
 * 1. Reads the S3_* env vars and prints isStorageConfigured() (secrets masked).
 * 2. Uploads a tiny text object to  <bucket>/test/connection-check.txt.
 * 3. Prints the absolute public URL and fetches it to verify public read access.
 *
 * Isolated + safe to delete — touches only the test/ prefix.
 */
import { config as loadEnv } from "dotenv";
loadEnv(); // load ./.env from the repo root

import { isStorageConfigured, putObject } from "@pipeline/shared/storage";

function mask(value: string | undefined, opts: { full?: boolean } = {}): string {
  if (!value) return "(empty)";
  if (opts.full) return `${"*".repeat(Math.max(value.length - 0, 8))} (${value.length} chars)`;
  if (value.length <= 6) return "***";
  return `${value.slice(0, 4)}…${value.slice(-2)} (${value.length} chars)`;
}

async function main(): Promise<void> {
  console.log("\n=== S3 / R2 storage diagnostic ===\n");

  // 1. Environment diagnostics
  const env = {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  };
  console.log("Environment:");
  console.log(`  S3_ENDPOINT          ${env.S3_ENDPOINT ?? "(empty)"}`);
  console.log(`  S3_REGION            ${env.S3_REGION ?? "(empty)"}`);
  console.log(`  S3_BUCKET            ${env.S3_BUCKET ?? "(empty)"}`);
  console.log(`  S3_PUBLIC_BASE_URL   ${env.S3_PUBLIC_BASE_URL ?? "(empty)"}`);
  console.log(`  S3_ACCESS_KEY_ID     ${mask(env.S3_ACCESS_KEY_ID)}`);
  console.log(`  S3_SECRET_ACCESS_KEY ${mask(env.S3_SECRET_ACCESS_KEY, { full: true })}`);

  const configured = isStorageConfigured();
  console.log(`\n  isStorageConfigured() => ${configured ? "✅ true" : "❌ false"}`);

  if (!configured) {
    const missing = (
      ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const
    ).filter((k) => !process.env[k]);
    console.log(`\n  Missing required vars: ${missing.join(", ")}`);
    console.log("  Populate .env (or your Coolify env) and re-run. Aborting upload test.\n");
    process.exitCode = 1;
    return;
  }

  // 2. Structural upload test
  const key = "test/connection-check.txt";
  const body = Buffer.from(
    `connection-check ok\nbucket=${env.S3_BUCKET}\nstamp=${new Date().toISOString()}\n`,
    "utf8",
  );
  console.log(`\nUploading ${body.length} bytes → ${env.S3_BUCKET}/${key} …`);

  let url: string;
  try {
    url = await putObject(key, body, "text/plain");
  } catch (err) {
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error("\n❌ Upload FAILED");
    console.error(`   fault: ${e.name ?? "Error"}`);
    console.error(`   http : ${e.$metadata?.httpStatusCode ?? "n/a"}`);
    console.error(`   msg  : ${e.message ?? String(err)}`);
    console.error(hintFor(e.name));
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Upload OK");
  console.log("\n  Public URL (click to verify bucket policy allows public read):");
  console.log(`\n     ${url}\n`);

  // 3. Public accessibility verification
  try {
    const res = await fetch(url);
    const text = (await res.text()).slice(0, 80).replace(/\n/g, " ");
    if (res.ok) {
      console.log(`  GET ${res.status} ${res.statusText} — public read ✅`);
      console.log(`  body: "${text}"`);
    } else {
      console.log(`  GET ${res.status} ${res.statusText} — NOT publicly readable ⚠️`);
      console.log("  The object uploaded, but the bucket policy / public access is not open.");
      console.log("  (Fine if you serve via a signed URL or a public custom domain instead.)");
    }
  } catch (err) {
    console.log(`  GET failed: ${String(err)} (network/DNS — the upload itself succeeded)`);
  }
  console.log("");
}

function hintFor(name?: string): string {
  switch (name) {
    case "SignatureDoesNotMatch":
      return "   hint: S3_SECRET_ACCESS_KEY is wrong, or S3_REGION mismatches (R2 wants 'auto').";
    case "InvalidAccessKeyId":
      return "   hint: S3_ACCESS_KEY_ID is wrong or revoked.";
    case "NoSuchBucket":
      return "   hint: S3_BUCKET doesn't exist at this S3_ENDPOINT.";
    case "AccessDenied":
      return "   hint: the token lacks PutObject on this bucket.";
    case "CredentialsProviderError":
      return "   hint: credentials missing/empty in the environment.";
    default:
      return "   hint: check S3_ENDPOINT (full https URL) and that the token has write access.";
  }
}

main().catch((err) => {
  console.error("unexpected error", err);
  process.exit(1);
});
