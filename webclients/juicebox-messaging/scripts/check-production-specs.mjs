import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const productionDocsRoot = resolve(projectRoot, "docs/production");

const POLICY = Object.freeze({
  requirementPrefixes: Object.freeze([
    "INV",
    "CRY",
    "PRO",
    "ID",
    "ENT",
    "PRIV",
    "EMB",
    "UX",
    "DATA",
    "OPS",
    "PLAT",
  ]),
  conversationStates: Object.freeze([
    "provisioning",
    "active",
    "membership_pending",
    "suspended",
    "closing",
    "closed",
    "retention_expired",
    "purged",
  ]),
  openDecisionColumns: Object.freeze([
    "id",
    "decision",
    "owner",
    "closure gate",
    "secure state while open",
  ]),
});

const failures = [];

function report(file, line, message) {
  const location = line === undefined ? file : `${file}:${line}`;
  failures.push(`${location}: ${message}`);
}

function lineNumberAt(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = resolve(directory, entry.name);

      if (entry.isDirectory()) return markdownFiles(absolutePath);
      if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") return [absolutePath];
      return [];
    }),
  );

  return nested.flat().sort();
}

function relativeToProject(absolutePath) {
  return relative(projectRoot, absolutePath).split(sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isExplicitAntiPlaceholderStatement(line, token, tokenIndex) {
  if (token.toUpperCase() !== "TBD") return false;

  const beforeToken = line.slice(0, tokenIndex);
  const afterToken = line.slice(tokenIndex + token.length);
  return (
    /\bwithout\s+[“"'`]?$/i.test(beforeToken) ||
    /^\s*No row may ship while any cell is\s+[“"'`]?$/i.test(beforeToken) ||
    /^(?:[”"'`.)\s]*)?(?:is\s+)?(?:forbidden|prohibited|not permitted)\b/i.test(afterToken)
  );
}

function checkTextHygiene(file, text) {
  const localPathPatterns = [
    /(?:^|[\s("'`])~\/[\w./-]+/,
    /(?:^|[\s("'`])\/(?:Users|home|workspace|workspaces)\/[\w.-]+\/[\w./-]+/,
    /(?:^|[\s("'`])\/private\/(?:tmp|var\/folders)\/[\w./-]+/,
    /(?:^|[\s("'`])\/tmp\/[\w./-]+/,
    /(?:^|[\s("'`])[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s)]+/,
    /\bfile:\/\/\/[^\s)]+/i,
    new RegExp(escapeRegExp(projectRoot)),
    new RegExp(escapeRegExp(homedir())),
  ];

  for (const [index, line] of text.split("\n").entries()) {
    const lineNumber = index + 1;

    if (/[\t ]+$/.test(line)) {
      report(file, lineNumber, "trailing whitespace");
    }

    for (const pattern of localPathPatterns) {
      if (pattern.test(line)) {
        report(file, lineNumber, "contains an absolute local filesystem path");
        break;
      }
    }

    for (const match of line.matchAll(/\b(?:TODO|TBD|FIXME|XXX)\b/gi)) {
      const token = match[0];
      if (!isExplicitAntiPlaceholderStatement(line, token, match.index)) {
        report(file, lineNumber, `contains unresolved placeholder ${token.toUpperCase()}`);
      }
    }
  }
}

function specificationMapSection(readme) {
  const match = readme.match(/^## Specification map\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
  return match?.[1];
}

function requiredDocuments(readme) {
  const section = specificationMapSection(readme);
  if (!section) return [];

  return [
    ...new Set(
      [...section.matchAll(/`([^`\n]+\.md)(?:#[^`\n]+)?`/g)].map((match) => match[1]),
    ),
  ];
}

function stripMarkdownFormatting(heading) {
  return heading
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .trim();
}

function githubLikeSlug(value) {
  return stripMarkdownFormatting(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function markdownAnchors(text) {
  const anchors = new Set();
  const slugCounts = new Map();
  let inFence = false;

  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    for (const explicit of line.matchAll(/\b(?:id|name)=["']([^"']+)["']/gi)) {
      anchors.add(explicit[1]);
    }

    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const explicitId = match[1].match(/\s+\{#([^}]+)}\s*$/)?.[1];
    if (explicitId) {
      anchors.add(explicitId);
      continue;
    }

    const baseSlug = githubLikeSlug(match[1]);
    const occurrence = slugCounts.get(baseSlug) ?? 0;
    const slug = occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence}`;
    slugCounts.set(baseSlug, occurrence + 1);
    anchors.add(slug);
  }

  return anchors;
}

function markdownLinkTargets(text) {
  const targets = [];
  let inFence = false;

  for (const [index, line] of text.split("\n").entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    for (const match of line.matchAll(/!?\[[^\]]*]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g)) {
      targets.push({ line: index + 1, target: match[1] });
    }

    const definition = line.match(/^\s{0,3}\[[^\]]+]:\s*(<[^>]+>|\S+)/);
    if (definition) targets.push({ line: index + 1, target: definition[1] });
  }

  return targets;
}

function decodeLinkPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function isInsideProject(absolutePath) {
  const projectRelative = relative(projectRoot, absolutePath);
  return projectRelative === "" || (!projectRelative.startsWith(`..${sep}`) && projectRelative !== "..");
}

async function checkLocalLinks(absolutePath, file, text, documentCache) {
  for (const { line, target: rawTarget } of markdownLinkTargets(text)) {
    const target = rawTarget.replace(/^<|>$/g, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue;
    if (target.startsWith("/")) continue;

    const hashIndex = target.indexOf("#");
    const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
    const rawFragment = hashIndex === -1 ? "" : target.slice(hashIndex + 1);
    const rawPathWithoutQuery = rawPath.split("?", 1)[0];
    const linkPath = decodeLinkPart(rawPathWithoutQuery);
    const fragment = decodeLinkPart(rawFragment);

    if (linkPath === undefined || fragment === undefined) {
      report(file, line, `contains an invalid percent-encoded local link: ${rawTarget}`);
      continue;
    }

    const targetPath = linkPath === "" ? absolutePath : resolve(dirname(absolutePath), linkPath);
    if (!isInsideProject(targetPath)) {
      report(file, line, `local link escapes the project root: ${rawTarget}`);
      continue;
    }

    let targetStats;
    try {
      targetStats = await stat(targetPath);
    } catch {
      report(file, line, `local link target does not exist: ${rawTarget}`);
      continue;
    }

    if (!targetStats.isFile()) {
      report(file, line, `local link target is not a file: ${rawTarget}`);
      continue;
    }

    if (!fragment || extname(targetPath).toLowerCase() !== ".md") continue;

    let targetText = documentCache.get(targetPath);
    if (targetText === undefined) {
      targetText = await readFile(targetPath, "utf8");
      documentCache.set(targetPath, targetText);
    }

    if (!markdownAnchors(targetText).has(fragment)) {
      report(file, line, `Markdown anchor does not exist: ${rawTarget}`);
    }
  }
}

function checkRequirementIds(verificationText) {
  const definitions = new Map();

  for (const match of verificationText.matchAll(/^\|\s*([A-Z][A-Z0-9]*)-(\d+)\s*\|/gm)) {
    const prefix = match[1];
    const numberText = match[2];
    const id = `${prefix}-${numberText}`;
    const numericId = `${prefix}:${Number(numberText)}`;
    const line = lineNumberAt(verificationText, match.index);

    if (!/^(?:0[1-9]|[1-9]\d+)$/.test(numberText)) {
      report(
        "docs/production/verification.md",
        line,
        `requirement ID ${id} must use zero-padded 01-09 or an unpadded value of 10 or greater`,
      );
    }

    if (definitions.has(numericId)) {
      report(
        "docs/production/verification.md",
        line,
        `duplicate requirement ID ${id}; first defined on line ${definitions.get(numericId).line}`,
      );
      continue;
    }

    definitions.set(numericId, { line, number: Number(numberText), prefix });
  }

  for (const prefix of POLICY.requirementPrefixes) {
    const entries = [...definitions.entries()]
      .filter(([, definition]) => definition.prefix === prefix)
      .sort((left, right) => left[1].number - right[1].number);

    if (entries.length === 0) {
      report("docs/production/verification.md", undefined, `has no ${prefix} requirement definitions`);
      continue;
    }

    const observedNumbers = new Set(entries.map(([, definition]) => definition.number));
    const maximum = Math.max(...observedNumbers);
    const missing = Array.from({ length: maximum }, (_, index) => index + 1).filter(
      (number) => !observedNumbers.has(number),
    );

    if (missing.length > 0) {
      report(
        "docs/production/verification.md",
        undefined,
        `${prefix} requirement sequence has gaps: ${missing.join(", ")}`,
      );
    }
  }

  const unknownPrefixes = new Set(
    [...definitions.values()]
      .map((definition) => definition.prefix)
      .filter((prefix) => !POLICY.requirementPrefixes.includes(prefix)),
  );
  if (unknownPrefixes.size > 0) {
    report(
      "docs/production/verification.md",
      undefined,
      `requirement table uses unconfigured prefixes: ${[...unknownPrefixes].sort().join(", ")}`,
    );
  }
}

function uniqueTokens(value, pattern) {
  return [...new Set([...value.matchAll(pattern)].map((match) => match[1]))];
}

function extractConversationStateDeclarations(documents) {
  const architecture = documents.get(resolve(productionDocsRoot, "architecture.md"));
  const serviceApi = documents.get(resolve(productionDocsRoot, "service-api.md"));
  const storage = documents.get(resolve(productionDocsRoot, "storage-and-retention.md"));

  const architectureBlock = architecture?.match(
    /Conversation lifecycle:\s*\n+```(?:text)?\s*\n([\s\S]*?)```/i,
  )?.[1];
  const serviceSentence = serviceApi?.match(/Conversation states are ([\s\S]*?)\. A plan\b/i)?.[1];
  const conversationTable = storage?.match(
    /CREATE TABLE conversations\s*\(([\s\S]*?)\n\);/i,
  )?.[1];
  const storageCheck = conversationTable?.match(
    /state\s+text\s+NOT NULL\s+CHECK\s*\(state\s+IN\s*\(([\s\S]*?)\)\)/i,
  )?.[1];

  return [
    {
      file: "docs/production/architecture.md",
      name: "Conversation lifecycle state machine",
      states: architectureBlock
        ? uniqueTokens(architectureBlock, /\b([a-z][a-z0-9_]*)\b/g)
        : undefined,
    },
    {
      file: "docs/production/service-api.md",
      name: "Conversation states declaration",
      states: serviceSentence ? uniqueTokens(serviceSentence, /`([a-z][a-z0-9_]*)`/g) : undefined,
    },
    {
      file: "docs/production/storage-and-retention.md",
      name: "conversations.state SQL constraint",
      states: storageCheck ? uniqueTokens(storageCheck, /'([a-z][a-z0-9_]*)'/g) : undefined,
    },
  ];
}

function checkConversationStates(documents) {
  const expected = POLICY.conversationStates;

  for (const declaration of extractConversationStateDeclarations(documents)) {
    if (!declaration.states) {
      report(declaration.file, undefined, `${declaration.name} is missing or cannot be parsed`);
      continue;
    }

    const unexpected = declaration.states.filter((state) => !expected.includes(state));
    const missing = expected.filter((state) => !declaration.states.includes(state));
    const orderingDiffers =
      unexpected.length === 0 && missing.length === 0 && declaration.states.join("|") !== expected.join("|");

    if (unexpected.length > 0) {
      report(
        declaration.file,
        undefined,
        `${declaration.name} contains non-canonical states: ${unexpected.join(", ")}`,
      );
    }
    if (missing.length > 0) {
      report(
        declaration.file,
        undefined,
        `${declaration.name} omits canonical states: ${missing.join(", ")}`,
      );
    }
    if (orderingDiffers) {
      report(
        declaration.file,
        undefined,
        `${declaration.name} must use the canonical state order: ${expected.join(", ")}`,
      );
    }
  }
}

function sourceThemeColorKeys(source) {
  const declaration = source.match(
    /export const THEME_COLOR_KEYS\s*=\s*\[([\s\S]*?)]\s*as const;/,
  );
  if (!declaration) return undefined;

  const keys = [...declaration[1].matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map(
    (match) => match[1],
  );
  const residue = declaration[1]
    .replaceAll(/"[A-Za-z][A-Za-z0-9]*"/g, "")
    .replaceAll(/[\s,]/g, "");
  return keys.length > 0 && residue === "" ? keys : undefined;
}

function documentedThemeColorKeys(embedContract) {
  const section = embedContract.match(
    /<!-- BEGIN:THEME_COLOR_KEYS -->\s*\n([\s\S]*?)\n<!-- END:THEME_COLOR_KEYS -->/,
  );
  if (!section) return undefined;

  return [...section[1].matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map(
    (match) => match[1],
  );
}

async function checkThemeColorContract(documents) {
  const documentationFile = "docs/production/embed-contract.md";
  const embedContract = documents.get(resolve(productionDocsRoot, "embed-contract.md"));
  if (embedContract === undefined) {
    report(documentationFile, undefined, "embed contract is missing");
    return;
  }

  let themeSource;
  try {
    themeSource = await readFile(resolve(projectRoot, "src/theme/theme.ts"), "utf8");
  } catch {
    report("src/theme/theme.ts", undefined, "theme source is missing");
    return;
  }

  const sourceKeys = sourceThemeColorKeys(themeSource);
  if (sourceKeys === undefined) {
    report("src/theme/theme.ts", undefined, "cannot parse THEME_COLOR_KEYS");
    return;
  }

  const documentedKeys = documentedThemeColorKeys(embedContract);
  if (documentedKeys === undefined) {
    report(
      documentationFile,
      undefined,
      "missing the marked THEME_COLOR_KEYS semantic table",
    );
    return;
  }

  const duplicates = documentedKeys.filter(
    (key, index) => documentedKeys.indexOf(key) !== index,
  );
  if (duplicates.length > 0) {
    report(
      documentationFile,
      undefined,
      `THEME_COLOR_KEYS table contains duplicates: ${[...new Set(duplicates)].join(", ")}`,
    );
    return;
  }

  if (sourceKeys.join("\n") === documentedKeys.join("\n")) return;

  const documentedSet = new Set(documentedKeys);
  const sourceSet = new Set(sourceKeys);
  const missing = sourceKeys.filter((key) => !documentedSet.has(key));
  const unexpected = documentedKeys.filter((key) => !sourceSet.has(key));
  const details = [];
  if (missing.length > 0) details.push(`missing ${missing.join(", ")}`);
  if (unexpected.length > 0) details.push(`unexpected ${unexpected.join(", ")}`);
  if (details.length === 0) details.push("key order differs from THEME_COLOR_KEYS");
  report(
    documentationFile,
    undefined,
    `theme semantic table drifted from src/theme/theme.ts: ${details.join("; ")}`,
  );
}

function sectionUnderHeading(text, heading) {
  const escapedHeading = escapeRegExp(heading);
  return text.match(
    new RegExp(`^## ${escapedHeading}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "mi"),
  )?.[1];
}

function tableRows(section) {
  const lines = section.split("\n");
  const headerIndex = lines.findIndex((line) => /^\s*\|.*\|\s*$/.test(line));
  if (headerIndex === -1 || !/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(lines[headerIndex + 1] ?? "")) {
    return undefined;
  }

  const parseRow = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());

  const headers = parseRow(lines[headerIndex]).map((header) => header.toLocaleLowerCase("en-US"));
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!/^\s*\|.*\|\s*$/.test(line)) break;
    rows.push(parseRow(line));
  }

  return { headers, rows };
}

function containsPlaceholderValue(value) {
  return /^(?:-|—|n\/?a|none|unknown|unassigned|todo|tbd|fixme|xxx)$/i.test(value.trim());
}

function productDecisionIds(launchGates) {
  const section = sectionUnderHeading(launchGates, "9. Product decisions required before launch");
  if (!section) return undefined;

  const ids = [...section.matchAll(/^\|\s*(PD-\d{3})\s*\|/gm)].map((match) => match[1]);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    report(
      "docs/production/launch-gates.md",
      undefined,
      `section 9 duplicates product-decision IDs: ${duplicates.join(", ")}`,
    );
  }

  return uniqueIds;
}

function checkOpenDecisions(decisionLog, launchGates) {
  const file = "docs/production/decision-log.md";
  const section = sectionUnderHeading(decisionLog, "Open decisions with launch impact");
  if (!section) {
    report(file, undefined, "missing the open-decisions launch-impact section");
    return;
  }

  const table = tableRows(section);
  if (!table) {
    report(
      file,
      undefined,
      "open launch-impact decisions must be a table with ID, Decision, Accountable owner, Closure gate, and Secure state while open columns",
    );
    return;
  }

  const normalizedHeaders = table.headers.map((header) => {
    if (header === "gate" || header === "launch gate") return "closure gate";
    if (header === "accountable owner") return "owner";
    if (header === "secure state" || header === "fail-closed state") return "secure state while open";
    return header;
  });
  const columnIndexes = new Map(
    POLICY.openDecisionColumns.map((column) => [column, normalizedHeaders.indexOf(column)]),
  );
  const missingColumns = [...columnIndexes].filter(([, index]) => index === -1).map(([column]) => column);
  if (missingColumns.length > 0) {
    report(file, undefined, `open-decision table is missing columns: ${missingColumns.join(", ")}`);
    return;
  }

  if (table.rows.length === 0) {
    report(file, undefined, "open-decision table has no decision rows");
    return;
  }

  const seenIds = new Set();
  const decisionLogProductIds = new Set();
  for (const [rowIndex, row] of table.rows.entries()) {
    const rowLabel = `open-decision row ${rowIndex + 1}`;
    const id = row[columnIndexes.get("id")] ?? "";
    const decision = row[columnIndexes.get("decision")] ?? "";
    const owner = row[columnIndexes.get("owner")] ?? "";
    const gate = row[columnIndexes.get("closure gate")] ?? "";
    const secureState = row[columnIndexes.get("secure state while open")] ?? "";

    for (const [name, value] of [
      ["ID", id],
      ["Decision", decision],
      ["Owner", owner],
      ["Closure gate", gate],
      ["Secure state while open", secureState],
    ]) {
      if (!value || containsPlaceholderValue(value)) {
        report(file, undefined, `${rowLabel} has no concrete ${name}`);
      }
    }

    if (!/^(?:ENG|PD)-\d{3}$/.test(id)) {
      report(file, undefined, `${rowLabel} has invalid ID ${JSON.stringify(id)}; expected ENG-NNN or PD-NNN`);
    } else if (seenIds.has(id)) {
      report(file, undefined, `${rowLabel} duplicates ${id}`);
    }
    seenIds.add(id);
    if (id.startsWith("PD-")) decisionLogProductIds.add(id);

    if (!/\bG(?:[0-8]|X)\b|\b(?:feature|client|channel)\s+gate\b/i.test(gate)) {
      report(file, undefined, `${rowLabel} closure gate does not identify a release or feature gate`);
    }
  }

  const launchGateProductIds = productDecisionIds(launchGates);
  if (launchGateProductIds === undefined) {
    report(
      "docs/production/launch-gates.md",
      undefined,
      "missing the section 9 product-decision table",
    );
    return;
  }

  const missingFromDecisionLog = [...launchGateProductIds].filter(
    (id) => !decisionLogProductIds.has(id),
  );
  const missingFromLaunchGates = [...decisionLogProductIds].filter(
    (id) => !launchGateProductIds.has(id),
  );
  if (missingFromDecisionLog.length > 0) {
    report(
      file,
      undefined,
      `launch-gates.md product decisions missing from the open-decision register: ${missingFromDecisionLog.join(", ")}`,
    );
  }
  if (missingFromLaunchGates.length > 0) {
    report(
      "docs/production/launch-gates.md",
      undefined,
      `decision-log.md product decisions missing from launch gate section 9: ${missingFromLaunchGates.join(", ")}`,
    );
  }
}

async function main() {
  const readmePath = resolve(productionDocsRoot, "README.md");
  let readme;
  try {
    readme = await readFile(readmePath, "utf8");
  } catch {
    report("docs/production/README.md", undefined, "required production specification index is missing");
  }

  const files = await markdownFiles(productionDocsRoot);
  const documents = new Map(
    await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")])),
  );

  if (readme !== undefined) {
    const required = requiredDocuments(readme);
    if (required.length === 0) {
      report("docs/production/README.md", undefined, "Specification map lists no required Markdown documents");
    }

    for (const requiredDocument of required) {
      const absolutePath = resolve(productionDocsRoot, requiredDocument);
      if (!isInsideProject(absolutePath) || !documents.has(absolutePath)) {
        report(
          "docs/production/README.md",
          undefined,
          `required specification is missing: docs/production/${requiredDocument}`,
        );
      }
    }
  }

  for (const [absolutePath, text] of documents) {
    const file = relativeToProject(absolutePath);
    checkTextHygiene(file, text);
    await checkLocalLinks(absolutePath, file, text, documents);
  }

  const verification = documents.get(resolve(productionDocsRoot, "verification.md"));
  if (verification === undefined) {
    report("docs/production/verification.md", undefined, "verification specification is missing");
  } else {
    checkRequirementIds(verification);
  }

  checkConversationStates(documents);
  await checkThemeColorContract(documents);

  const decisionLog = documents.get(resolve(productionDocsRoot, "decision-log.md"));
  const launchGates = documents.get(resolve(productionDocsRoot, "launch-gates.md"));
  if (decisionLog === undefined) {
    report("docs/production/decision-log.md", undefined, "production decision log is missing");
  } else if (launchGates === undefined) {
    report("docs/production/launch-gates.md", undefined, "production launch-gates specification is missing");
  } else {
    checkOpenDecisions(decisionLog, launchGates);
  }

  if (failures.length > 0) {
    process.stderr.write(
      [`Production specification integrity check failed (${failures.length}):`, ...failures.map((item) => `- ${item}`), ""].join(
        "\n",
      ),
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Production specification integrity check passed (${files.length} documents, ${POLICY.requirementPrefixes.length} requirement prefixes).\n`,
  );
}

await main();
