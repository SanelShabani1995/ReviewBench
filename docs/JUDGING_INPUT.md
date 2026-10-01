# Judging input format

Pass the judging CLI either one JSON file or a directory containing JSON files.
Directories are read recursively, so results may be grouped by round or
repository.

Each file uses the normalized reviewer output:

```json
{
  "pr": {
    "repo": "https://github.com/owner/repo",
    "pr_number": 123,
    "base": "<40-character base SHA>",
    "head": "<40-character head SHA>"
  },
  "agent": "my-reviewer",
  "findings": [
    {
      "producer": "my-reviewer",
      "file": "src/file.ts",
      "start_line": 10,
      "end_line": 12,
      "message": "The cache is updated without holding the mutex, so concurrent requests can lose writes."
    }
  ],
  "usage": {
    "time_in_ms": 12345
  }
}
```

## Field rules

- `pr.repo` is the upstream GitHub repository URL.
- `pr.pr_number`, `pr.base`, and `pr.head` must identify the same benchmark PR
  and commits as [`corpus/manifest.json`](../corpus/manifest.json).
- `findings` is an array. Use an empty array when the reviewer completed the PR
  and found no issues.
- `producer` identifies the reviewer or finding source.
- `file` is repository-relative, uses forward slashes, and has no leading
  `./`.
- `start_line` and `end_line` are integer line numbers in the file at
  `pr.head`. Set both to the same value for a single-line finding.
- `message` explains what is wrong and why it matters.
- `usage` is optional. Supported non-negative numeric fields are
  `prompt_tokens`, `completion_tokens`, `total_tokens`, `cached_tokens`,
  `time_in_ms`, and `cost_usd`.

The loader combines findings from multiple valid files that refer to the same
PR. Malformed JSON and invalid field shapes fail strict validation.
