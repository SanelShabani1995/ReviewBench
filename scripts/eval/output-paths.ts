export function outputSidecarPath(
  outputPath: string,
  kind: "checkpoint" | "details",
): string {
  const stem = outputPath.replace(/\.json$/i, "");
  return `${stem}.${kind}.json`;
}
