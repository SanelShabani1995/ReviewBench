// Turns the text `codex review` prints into contract findings.
/** Codex prints one bullet per finding: "- [P1] Title — path/to/file.ts:12-20" followed by body lines. */
export function parseReview(raw, producer, repo = "/work/repo") {
  // Codex prints paths as it sees them, usually absolute inside the container;
  // the contract wants them relative to the repository root.
  const prefix = repo.replace(/\/+$/, "") + "/";
  const relative = (file) => (file.startsWith(prefix) ? file.slice(prefix.length) : file).replace(/^\.\//, "");
  const findings = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    const body = current.body.join(" ").replace(/\s+/g, " ").trim();
    findings.push({
      file: relative(current.file),
      start_line: current.start,
      end_line: Math.max(current.start, current.end),
      message: body ? `${current.title}: ${body}` : current.title,
      producer,
    });
    current = null;
  };
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*- \[[^\]]+\]\s+(.+?)\s+[—-]\s+(.+?):(\d+)(?:-(\d+))?\s*$/);
    if (m) {
      flush();
      current = { title: m[1].trim(), file: m[2].trim(), start: Number(m[3]), end: Number(m[4] ?? m[3]), body: [] };
      continue;
    }
    if (current && line.trim()) current.body.push(line.trim());
  }
  flush();
  return findings;
}

