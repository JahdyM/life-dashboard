import { access, cp, rm } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);
const sourceDir = join(repoRoot, "web", ".next");
const targetDir = join(repoRoot, ".next");

async function main() {
  await access(sourceDir, fsConstants.F_OK);
  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, { recursive: true });
  console.log(`Synced Next output from ${sourceDir} to ${targetDir}`);
}

main().catch((error) => {
  console.error("Failed to sync Next output", error);
  process.exitCode = 1;
});
