import { spawnSync } from "node:child_process";

const PROJECT_NAME = "ntu-light-map";
const args = process.argv.slice(2);

function hasFlag(flag) {
  return args.includes(flag);
}

function flagValue(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] || null;
}

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.log(`Usage:\n  node scripts/cleanup_pages_deployments.mjs --keep <deployment-id> [options]\n\nOptions:\n  --project <name>       Cloudflare Pages project (default: ${PROJECT_NAME})\n  --include-preview      Include Preview deployments; default is Production only\n  --apply                Delete the listed deployments\n  --yes                  Required with --apply\n\nDefault mode is dry-run. No deployment is deleted without both --apply and --yes.`);
  process.exit(message ? 1 : 0);
}

if (hasFlag("--help")) usage();

const projectName = flagValue("--project") || PROJECT_NAME;
const keepId = flagValue("--keep");
const apply = hasFlag("--apply");
const confirmed = hasFlag("--yes");
const includePreview = hasFlag("--include-preview");

if (!keepId) usage("--keep is required");
if (apply && !confirmed) usage("--yes is required with --apply");
if (!apply && confirmed) usage("--yes is only valid with --apply");

const result = spawnSync(
  "npx",
  ["wrangler", "pages", "deployment", "list", "--project-name", projectName, "--json"],
  { encoding: "utf8" },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || "Unable to list deployments.\n");
  process.exit(result.status || 1);
}

const output = result.stdout.trim();
const jsonStart = output.indexOf("[");
const deployments = JSON.parse(jsonStart === -1 ? output : output.slice(jsonStart));
const keep = deployments.find(deployment => deployment.Id === keepId);

if (!keep) {
  usage(`deployment ${keepId} was not found in ${projectName}`);
}

const candidates = deployments.filter(deployment => {
  if (deployment.Id === keepId) return false;
  if (includePreview) return true;
  return deployment.Environment === "Production";
});

console.log(`Keeping ${keep.Id} (${keep.Environment}) ${keep.Deployment}`);
if (candidates.length === 0) {
  console.log("No superseded deployments matched the cleanup scope.");
  process.exit(0);
}

console.log(`${apply ? "Deleting" : "Would delete"} ${candidates.length} deployment(s):`);
for (const deployment of candidates) {
  console.log(`- ${deployment.Id} [${deployment.Environment}] ${deployment.Deployment}`);
}

if (!apply) {
  console.log("Dry run only. Re-run with --apply --yes to delete these deployments.");
  process.exit(0);
}

for (const deployment of candidates) {
  const deletion = spawnSync(
    "npx",
    ["wrangler", "pages", "deployment", "delete", deployment.Id, "--project-name", projectName],
    { stdio: "inherit" },
  );
  if (deletion.status !== 0) process.exit(deletion.status || 1);
}
