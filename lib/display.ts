// Google doesn't guarantee a name or photo, so the UI always goes through these helpers.

type Named = { name: string | null; email: string | null };

/** Name, else the part of the email before "@", else a friendly default. */
export function displayName({ name, email }: Named): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const prefix = email?.split("@")[0]?.trim();
  if (prefix) return prefix;
  return "Movie fan";
}

/** Up to two initials for the avatar fallback, e.g. "Ada Lovelace" -> "AL". */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}
