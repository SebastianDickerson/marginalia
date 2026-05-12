#!/usr/bin/env node
// Regenerates hub/HUB.md from journal state. No dependencies.
// Run from project root: node hub/rebuild-hub.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const HUB = "hub";
const out = [];
const now = new Date().toISOString();

function readSafe(p, fallback = "") {
  try { return readFileSync(p, "utf8"); } catch { return fallback; }
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(".md") && !f.startsWith("."))
    .sort();
}

out.push("# HUB\n");
out.push("> Generated file. Do not edit by hand. Run `node hub/rebuild-hub.mjs` to refresh.\n");

out.push("## North Star\n");
out.push(readSafe(join(HUB, "state/north-star.md"), "_(missing state/north-star.md)_") + "\n");

out.push("## Component Status\n");
try {
  const comps = JSON.parse(readSafe(join(HUB, "state/components.json"), "[]"));
  if (comps.length === 0) {
    out.push("_(no components)_\n");
  } else {
    out.push("| ID | Name | State | Owner | Updated | Notes |");
    out.push("|---|---|---|---|---|---|");
    for (const c of comps) {
      out.push(`| ${c.id} | ${c.name} | ${c.state} | ${c.owner ?? "—"} | ${c.updated ?? "—"} | ${(c.notes ?? "").replace(/\n/g, " ")} |`);
    }
    out.push("");
  }
} catch (e) {
  out.push(`_(components.json parse error: ${e.message})_\n`);
}

out.push("## Active Claims\n");
const claims = listFiles(join(HUB, "claims"));
if (claims.length === 0) {
  out.push("_(none)_\n");
} else {
  for (const f of claims) {
    out.push(`### ${f}`);
    out.push("```");
    out.push(readSafe(join(HUB, "claims", f)).trim());
    out.push("```\n");
  }
}

out.push("## Decision Log\n");
const decisions = listFiles(join(HUB, "decisions"));
if (decisions.length === 0) {
  out.push("_(none)_\n");
} else {
  for (const f of decisions) {
    out.push(`### ${f}`);
    out.push(readSafe(join(HUB, "decisions", f)).trim() + "\n");
  }
}

out.push("## Questions\n");
const questions = listFiles(join(HUB, "questions"));
const open = [], answered = [];
for (const f of questions) {
  const body = readSafe(join(HUB, "questions", f));
  (/Status:\s*open/i.test(body) ? open : answered).push({ f, body });
}
out.push("### Open\n");
if (open.length === 0) out.push("_(none)_\n");
else for (const { f, body } of open) {
  out.push(`#### ${f}`);
  out.push(body.trim() + "\n");
}
out.push("### Answered\n");
if (answered.length === 0) out.push("_(none)_\n");
else for (const { f, body } of answered) {
  out.push(`#### ${f}`);
  out.push(body.trim() + "\n");
}

out.push("## Recent Inbox (last 20)\n");
const inbox = listFiles(join(HUB, "inbox")).slice(-20).reverse();
if (inbox.length === 0) {
  out.push("_(none)_\n");
} else {
  for (const f of inbox) {
    out.push(`### ${f}`);
    out.push(readSafe(join(HUB, "inbox", f)).trim() + "\n");
  }
}

out.push(`---\nGenerated ${now}. Do not edit by hand. Run \`node hub/rebuild-hub.mjs\` to refresh.\n`);

writeFileSync(join(HUB, "HUB.md"), out.join("\n"));
console.log(`Wrote ${join(HUB, "HUB.md")} at ${now}`);
