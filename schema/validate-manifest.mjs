#!/usr/bin/env node
/**
 * Validate agent manifests against the schema, plus the rules a JSON schema
 * cannot express.
 *
 * Usage: node schema/validate-manifest.mjs agents/*.json
 *
 * Dependency-free on purpose: this runs in CI on the public repository, and a
 * validator that needs an install is a validator that rots.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const schema = JSON.parse(
  readFileSync(new URL("./agent-manifest.schema.json", import.meta.url), "utf8"),
);

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: validate-manifest.mjs <manifest.json>...");
  process.exit(2);
}

function checkString(value, spec, path, errors) {
  if (typeof value !== "string") {
    errors.push(`${path}: expected a string`);
    return;
  }
  if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
    errors.push(`${path}: does not match ${spec.pattern}`);
  }
  if (spec.minLength !== undefined && value.length < spec.minLength) {
    errors.push(`${path}: shorter than ${spec.minLength} characters`);
  }
  if (spec.maxLength !== undefined && value.length > spec.maxLength) {
    errors.push(`${path}: longer than ${spec.maxLength} characters`);
  }
  if (spec.enum && !spec.enum.includes(value)) {
    errors.push(`${path}: must be one of ${spec.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  }
}

function checkNode(value, spec, path, errors) {
  if (spec.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    for (const key of spec.required ?? []) {
      if (!(key in value)) errors.push(`${path}${path ? "." : ""}${key}: required`);
    }
    for (const [key, child] of Object.entries(value)) {
      const childSpec = spec.properties?.[key];
      if (!childSpec) {
        if (spec.additionalProperties === false) {
          errors.push(`${path}${path ? "." : ""}${key}: unknown field`);
        }
        continue;
      }
      checkNode(child, childSpec, `${path}${path ? "." : ""}${key}`, errors);
    }
    return;
  }

  if (spec.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected an array`);
      return;
    }
    if (spec.minItems !== undefined && value.length < spec.minItems) {
      errors.push(`${path}: fewer than ${spec.minItems} items`);
    }
    if (spec.maxItems !== undefined && value.length > spec.maxItems) {
      errors.push(`${path}: more than ${spec.maxItems} items`);
    }
    value.forEach((item, i) => checkNode(item, spec.items, `${path}[${i}]`, errors));
    return;
  }

  if (spec.type === "integer") {
    if (!Number.isInteger(value)) {
      errors.push(`${path}: expected an integer`);
      return;
    }
    if (spec.minimum !== undefined && value < spec.minimum) {
      errors.push(`${path}: below the minimum of ${spec.minimum}`);
    }
    if (spec.maximum !== undefined && value > spec.maximum) {
      errors.push(`${path}: above the maximum of ${spec.maximum}`);
    }
    return;
  }

  if (spec.type === "string") checkString(value, spec, path, errors);
}

// Anything that looks like a credential rather than the name of one. The form
// and the schema both say values never belong here, so catch it loudly.
const SECRET_SHAPES = [
  [/sk-[A-Za-z0-9_-]{16,}/, "an OpenAI-style key"],
  [/sk-ant-[A-Za-z0-9_-]{16,}/, "an Anthropic-style key"],
  [/gh[pousr]_[A-Za-z0-9]{20,}/, "a GitHub token"],
  [/AKIA[0-9A-Z]{16}/, "an AWS access key id"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, "a JWT"],
];

function checkNoSecrets(raw, errors) {
  for (const [pattern, what] of SECRET_SHAPES) {
    if (pattern.test(raw)) {
      errors.push(
        `looks like it contains ${what}. Manifests declare credential NAMES, never values. Rotate anything you pasted here.`,
      );
    }
  }
}

function describe(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

let failed = 0;
for (const file of files) {
  const errors = [];
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    console.error(`${file}: cannot read: ${err.message}`);
    failed++;
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    console.error(`${file}: not valid JSON: ${err.message}`);
    failed++;
    continue;
  }

  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    console.error(`${file}: the document must be a JSON object, not ${describe(manifest)}`);
    failed++;
    continue;
  }

  // Scan both the file and the parsed document: a \u escape hides a value
  // from the raw text, and a duplicate key hides one from the parsed form.
  checkNoSecrets(`${raw}\n${JSON.stringify(manifest)}`, errors);

  checkNode(manifest, schema, "", errors);

  // Usernames are compared lowercase everywhere; store them that way. Shape
  // errors are already recorded above, so only well-formed entries are checked.
  for (const login of Array.isArray(manifest.contacts) ? manifest.contacts : []) {
    if (typeof login === "string" && login !== login.toLowerCase()) errors.push(`contacts: "${login}" must be lowercase`);
  }

  // The file name is the identifier, so a mismatch means two manifests could
  // claim the same agent.
  const expected = `${manifest.name}.json`;
  if (manifest.name && basename(file) !== expected) {
    errors.push(`file should be named ${expected} to match "name"`);
  }

  if (errors.length > 0) {
    console.error(`\n${file}`);
    for (const e of errors) console.error(`  - ${e}`);
    failed++;
  } else {
    console.log(`${file}: ok`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} manifest(s) failed validation`);
  process.exit(1);
}
console.log(`\n${files.length} manifest(s) valid`);
