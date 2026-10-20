/** Public URL of a key: each path segment is encoded, the slashes are kept. */
export function publicUrl(baseUrl: string, key: string): string {
  return `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/** Last path segment: "img/2026/" → "2026", "img/cat.png" → "cat.png". */
export function baseName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
