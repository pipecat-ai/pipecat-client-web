#!/usr/bin/env node
/**
 * KEEP IN SYNC: this file is duplicated in pipecat-ai/pipecat-client-web and
 * pipecat-ai/pipecat-client-web-transports as
 * .github/scripts/curate-release-notes.mjs; apply fixes to both copies.
 *
 * Curate a release-please release PR.
 *
 * Replaces the generated changelog entries in the release PR's newest
 * CHANGELOG.md section with the "## Release Notes" sections authored on the
 * feature PRs those entries came from. Entries from PRs without curated notes
 * are kept as generated. The release PR body is rewritten to match, preserving
 * the header/`---`/footer structure release-please parses at tag time.
 *
 * Runs after every release-please update (which force-pushes the release
 * branch), so curation is reapplied each time and never fights the force-push.
 *
 * Usage: node curate-release-notes.mjs --pr <release PR number>
 * Requires: gh CLI authenticated (GH_TOKEN), cwd = repo root with the release
 * PR's branch checked out.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function fail(msg) {
  console.error(`curate-release-notes: ${msg}`);
  process.exit(1);
}

const prArgIdx = process.argv.indexOf("--pr");
if (prArgIdx === -1 || !process.argv[prArgIdx + 1]) {
  fail("usage: curate-release-notes.mjs --pr <release PR number>");
}
const releasePrNumber = process.argv[prArgIdx + 1];
const repo =
  process.env.GITHUB_REPOSITORY ??
  JSON.parse(gh(["repo", "view", "--json", "nameWithOwner"])).nameWithOwner;

// ---------------------------------------------------------------------------
// Locate the package and its CHANGELOG from the release PR's branch name.
// ---------------------------------------------------------------------------

const releasePr = JSON.parse(
  gh([
    "pr",
    "view",
    releasePrNumber,
    "--repo",
    repo,
    "--json",
    "headRefName,body",
  ])
);
const componentMatch = releasePr.headRefName.match(/--components--(.+)$/);
if (!componentMatch) {
  fail(
    `#${releasePrNumber} head branch "${releasePr.headRefName}" is not a per-component release-please branch`
  );
}
const component = componentMatch[1];

const config = JSON.parse(readFileSync("release-please-config.json", "utf8"));
const pkgEntry = Object.entries(config.packages ?? {}).find(
  ([dir, pkg]) => (pkg.component ?? dir) === component
);
if (!pkgEntry) fail(`no package with component "${component}" in release-please-config.json`);
const [pkgDir, pkg] = pkgEntry;
const changelogPath = join(pkgDir, pkg["changelog-path"] ?? "CHANGELOG.md");

// ---------------------------------------------------------------------------
// Extract the newest section of the CHANGELOG (the one this release PR adds).
// ---------------------------------------------------------------------------

const changelog = readFileSync(changelogPath, "utf8");
const lines = changelog.split(/\r?\n/);
// Version headings: "## [1.9.0](...)" for minor/major, "### [1.8.3](...)" for patch.
const VERSION_HEADING = /^#{2,3} \[?\d+\.\d+\.\d+/;
const start = lines.findIndex((l) => VERSION_HEADING.test(l));
if (start === -1) fail(`no version heading found in ${changelogPath}`);
let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (VERSION_HEADING.test(lines[i])) {
    end = i;
    break;
  }
}
const sectionLines = lines.slice(start, end);

// ---------------------------------------------------------------------------
// Parse the section into groups ("### Features", ...) of bullet entries.
// ---------------------------------------------------------------------------

const versionHeading = sectionLines[0];
const groups = []; // { name, entries: [string] }
let currentGroup = null;
for (const line of sectionLines.slice(1)) {
  const heading = line.match(/^###\s+(.+?)\s*$/);
  if (heading) {
    currentGroup = { name: heading[1], entries: [] };
    groups.push(currentGroup);
  } else if (/^[*-]\s/.test(line)) {
    if (!currentGroup) {
      currentGroup = { name: "Features", entries: [] };
      groups.push(currentGroup);
    }
    currentGroup.entries.push(line.replace(/^-\s/, "* "));
  } else if (line.trim() !== "" && currentGroup?.entries.length) {
    // Continuation of a multi-line entry.
    currentGroup.entries[currentGroup.entries.length - 1] += `\n${line}`;
  }
}

// ---------------------------------------------------------------------------
// Map each generated entry to the feature PR it came from.
// ---------------------------------------------------------------------------

const shaToPr = new Map();
function prForSha(sha) {
  if (!shaToPr.has(sha)) {
    let num = null;
    try {
      const out = gh([
        "api",
        `repos/${repo}/commits/${sha}/pulls`,
        "--jq",
        ".[0].number",
      ]).trim();
      if (out) num = Number(out);
    } catch {
      // Commit pushed directly, or API hiccup: keep the generated entry.
    }
    shaToPr.set(sha, num);
  }
  return shaToPr.get(sha);
}

function prForEntry(entry) {
  const sha = entry.match(/\/commit\/([0-9a-f]{7,40})/);
  if (sha) return prForSha(sha[1]);
  const prRef = entry.match(/\/pull\/(\d+)/) ?? entry.match(/#(\d+)/);
  return prRef ? Number(prRef[1]) : null;
}

const referencedPrs = new Set();
for (const group of groups) {
  for (const entry of group.entries) {
    const num = prForEntry(entry);
    if (num) referencedPrs.add(num);
  }
}

// ---------------------------------------------------------------------------
// Pull curated "## Release Notes" sections from those PRs.
// ---------------------------------------------------------------------------

// Canonical group names, keyed by lowercase alias. Accepts release-please
// names, keep-a-changelog names (Added/Changed/Deprecated/Removed/Fixed/
// Security), and common shorthands.
const GROUP_ALIASES = new Map([
  ["features", "Features"],
  ["feature", "Features"],
  ["feat", "Features"],
  ["added", "Features"],
  ["add", "Features"],
  ["new", "Features"],
  ["changed", "Changed"],
  ["changes", "Changed"],
  ["change", "Changed"],
  ["deprecations", "Deprecations"],
  ["deprecated", "Deprecations"],
  ["deprecation", "Deprecations"],
  ["deprecate", "Deprecations"],
  ["removed", "Removed"],
  ["removals", "Removed"],
  ["bug fixes", "Bug Fixes"],
  ["bugfixes", "Bug Fixes"],
  ["fixes", "Bug Fixes"],
  ["fixed", "Bug Fixes"],
  ["fix", "Bug Fixes"],
  ["security", "Security"],
  ["performance improvements", "Performance Improvements"],
  ["performance", "Performance Improvements"],
  ["perf", "Performance Improvements"],
  ["reverts", "Reverts"],
  ["revert", "Reverts"],
  ["documentation", "Documentation"],
  ["docs", "Documentation"],
  ["other", "Other"],
  ["misc", "Other"],
  ["miscellaneous", "Other"],
  ["miscellaneous chores", "Other"],
  ["chores", "Other"],
  ["chore", "Other"],
  ["breaking changes", "⚠ BREAKING CHANGES"],
  ["breaking change", "⚠ BREAKING CHANGES"],
  ["breaking", "⚠ BREAKING CHANGES"],
  ["⚠ breaking changes", "⚠ BREAKING CHANGES"],
]);
for (const section of config["changelog-sections"] ?? []) {
  GROUP_ALIASES.set(section.section.toLowerCase(), section.section);
}
const GROUP_ORDER = [
  "⚠ BREAKING CHANGES",
  "Features",
  "Changed",
  "Deprecations",
  "Removed",
  "Bug Fixes",
  "Security",
  "Performance Improvements",
  "Reverts",
  "Documentation",
  "Dependencies",
  "Other",
];

function normalizeComponentTitle(title) {
  return title
    .replace(/`/g, "")
    .replace(/^@[\w-]+\//, "")
    .trim()
    .toLowerCase();
}

// Fork PRs whose curated notes were skipped for lack of the approval label.
const unapprovedForkPrs = new Set();

/**
 * Extract this component's curated notes from a feature PR body.
 * Returns Map<groupName, bullets[]> or null if the PR has none.
 */
function curatedNotesFor(prNumber) {
  let body;
  try {
    body = JSON.parse(
      gh([
        "pr",
        "view",
        String(prNumber),
        "--repo",
        repo,
        "--json",
        "body,url,isCrossRepository,labels",
      ])
    );
  } catch {
    return null;
  }
  // A PR author can edit their own description after merge, so merge-time
  // review doesn't vouch for the notes of a fork PR. Only use them once a
  // maintainer has read the section and applied the approval label.
  if (
    body.isCrossRepository &&
    !(body.labels ?? []).some((l) => l.name === "release-notes: approved")
  ) {
    unapprovedForkPrs.add(prNumber);
    console.log(
      `#${prNumber} is a fork PR without the "release-notes: approved" label; keeping its generated entries.`
    );
    return null;
  }
  const text = (body.body ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const sectionMatch = text.match(
    /^##\s+Release Notes\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im
  );
  if (!sectionMatch) return null;

  // Split into "### <package>" subsections and pick ours.
  const subsections = sectionMatch[1].split(/^###\s+/m).slice(1);
  let subBody = null;
  for (const sub of subsections) {
    const newline = sub.indexOf("\n");
    const title = newline === -1 ? sub : sub.slice(0, newline);
    if (normalizeComponentTitle(title) === component.toLowerCase()) {
      subBody = newline === -1 ? "" : sub.slice(newline + 1);
      break;
    }
  }
  if (subBody === null) return null;

  // Split the subsection into "#### <group>" chunks; bare bullets => Features.
  const result = new Map();
  const chunks = subBody.split(/^####\s+(.+?)\s*$/m);
  for (let i = 0; i < chunks.length; i += 2) {
    const groupName =
      i === 0
        ? "Features"
        : GROUP_ALIASES.get(chunks[i - 1].toLowerCase()) ?? chunks[i - 1];
    const bullets = parseBullets(chunks[i]);
    if (!bullets.length) continue;
    if (!result.has(groupName)) result.set(groupName, []);
    result.get(groupName).push(...bullets.map((b) => ensureLink(b, body.url)));
  }
  return result.size ? result : null;
}

/**
 * Parse markdown bullets out of a text block. A bullet spans continuation
 * lines, and blank lines followed by indented content (extra paragraphs,
 * code blocks) stay inside the bullet; an unindented heading or a new bullet
 * ends it.
 */
function parseBullets(block) {
  const bullets = [];
  let current = null;
  let pendingBlanks = 0;
  const finish = () => {
    if (current) bullets.push(current);
    current = null;
    pendingBlanks = 0;
  };
  for (let line of block.split(/\r?\n/)) {
    // A bare horizontal rule inside a bullet would break release-please's
    // `---`-delimited PR body parsing at tag time; escape it.
    if (/^\s*-{3,}\s*$/.test(line)) line = line.replace(/-/, "\\-");
    if (/^[*-]\s+/.test(line)) {
      finish();
      current = line.replace(/^[*-]\s+/, "* ");
    } else if (!current) {
      continue;
    } else if (line.trim() === "") {
      pendingBlanks++;
    } else if (/^#/.test(line)) {
      finish();
    } else if (pendingBlanks > 0 && !/^\s{2,}/.test(line)) {
      // Blank line followed by unindented text: the bullet is over.
      finish();
    } else {
      current += `${"\n".repeat(pendingBlanks + 1)}${line}`;
      pendingBlanks = 0;
    }
  }
  finish();
  // Drop untouched template placeholders.
  return bullets.filter((b) => b.replace(/^\*\s*/, "").trim() !== "...");
}

/** Make sure a curated bullet links back to something (fallback: its PR). */
function ensureLink(bullet, prUrl) {
  if (/\]\(http/.test(bullet) || /#\d+/.test(bullet)) return bullet;
  const prNum = prUrl.split("/").pop();
  return `${bullet} ([#${prNum}](${prUrl}))`;
}

const curatedByPr = new Map();
for (const prNumber of referencedPrs) {
  const notes = curatedNotesFor(prNumber);
  if (notes) curatedByPr.set(prNumber, notes);
}

// Surface, on the workflow run's summary page, which feature PRs still lack
// curated notes — the signal to add a "## Release Notes" section and re-run.
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = [...referencedPrs]
    .sort((a, b) => a - b)
    .map(
      (n) =>
        `| [#${n}](https://github.com/${repo}/pull/${n}) | ${
          curatedByPr.has(n)
            ? "✅ curated"
            : unapprovedForkPrs.has(n)
              ? '⚠️ fork PR — review its "## Release Notes" section, add the "release-notes: approved" label, and re-run this workflow'
              : '⚠️ generated fallback — add a "## Release Notes" section to the PR and re-run this workflow'
        } |`
    );
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### ${component} release PR #${releasePrNumber}: notes sources\n\n| Feature PR | Release notes |\n| --- | --- |\n${rows.join("\n")}\n\n`
  );
}

if (curatedByPr.size === 0) {
  console.log(
    `No feature PR in this release has a "## Release Notes" section for ${component}; keeping generated notes.`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Rebuild the section: drop generated entries covered by curated notes, then
// merge the curated bullets in.
// ---------------------------------------------------------------------------

for (const group of groups) {
  const isBreaking = group.name.includes("BREAKING");
  group.entries = group.entries.filter((entry) => {
    const num = prForEntry(entry);
    if (!num || !curatedByPr.has(num)) return true;
    // Never drop a generated breaking-change notice unless the curated notes
    // provide their own; a missed break is worse than a duplicate entry.
    if (isBreaking) return !curatedByPr.get(num).has("⚠ BREAKING CHANGES");
    return false;
  });
}

function groupNamed(name) {
  let group = groups.find(
    (g) => g.name.toLowerCase() === name.toLowerCase()
  );
  if (!group) {
    group = { name, entries: [] };
    groups.push(group);
  }
  return group;
}

for (const notes of curatedByPr.values()) {
  for (const [groupName, bullets] of notes) {
    groupNamed(groupName).entries.push(...bullets);
  }
}

const orderedGroups = groups
  .filter((g) => g.entries.length > 0)
  .sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a.name);
    const bi = GROUP_ORDER.indexOf(b.name);
    return (ai === -1 ? GROUP_ORDER.length : ai) - (bi === -1 ? GROUP_ORDER.length : bi);
  });

const newSection =
  [
    versionHeading,
    ...orderedGroups.map((g) => `### ${g.name}\n\n${g.entries.join("\n")}`),
  ].join("\n\n") + "\n";

// ---------------------------------------------------------------------------
// Write CHANGELOG.md and the release PR body.
// ---------------------------------------------------------------------------

const newChangelog = [
  ...lines.slice(0, start),
  ...newSection.split("\n"),
  ...lines.slice(end),
].join("\n");
if (newChangelog !== changelog) {
  writeFileSync(changelogPath, newChangelog);
  console.log(`Updated ${changelogPath}`);
} else {
  console.log(`${changelogPath} already curated.`);
}

// Rebuild the PR body around release-please's `---` delimiters so the notes
// stay extractable when the merged PR is turned into a GitHub release.
const bodyLines = releasePr.body.trim().replace(/\r\n/g, "\n").split("\n");
const firstDelim = bodyLines.indexOf("---");
let lastDelim = bodyLines.lastIndexOf("---");
if (firstDelim !== -1) {
  if (lastDelim === firstDelim) lastDelim = bodyLines.length;
  const header = bodyLines.slice(0, firstDelim).join("\n").trim();
  const footer = bodyLines.slice(lastDelim + 1).join("\n").trim();
  const newBody = `${header}\n---\n\n\n${newSection.trim()}\n\n---\n${footer}`;
  if (newBody !== releasePr.body.trim().replace(/\r\n/g, "\n")) {
    const bodyFile = join(tmpdir(), `release-pr-body-${releasePrNumber}.md`);
    writeFileSync(bodyFile, newBody);
    gh([
      "pr",
      "edit",
      releasePrNumber,
      "--repo",
      repo,
      "--body-file",
      bodyFile,
    ]);
    console.log(`Updated #${releasePrNumber} body.`);
  } else {
    console.log(`#${releasePrNumber} body already curated.`);
  }
}

console.log(
  `Curated notes applied from PR(s): ${[...curatedByPr.keys()]
    .sort((a, b) => a - b)
    .map((n) => `#${n}`)
    .join(", ")}`
);
