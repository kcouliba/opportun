/** Convert a Windows path to a WSL path. Passes through non-Windows paths unchanged. */
export function toWslPath(path: string): string {
  // Strip surrounding quotes (from "Copy as path" in Explorer)
  const cleaned = path.replace(/^["']|["']$/g, "").trim();

  // Match Windows absolute path like C:\Users\... or C:/Users/...
  const match = cleaned.match(/^([A-Za-z]):[/\\](.*)/);
  if (!match) return cleaned;

  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

const VALID_EXTENSIONS = ["pdf", "txt", "md"];

export function validateFileExtension(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext && VALID_EXTENSIONS.includes(ext)) return null;
  return `Unsupported file type. Use ${VALID_EXTENSIONS.join(", ")}`;
}
