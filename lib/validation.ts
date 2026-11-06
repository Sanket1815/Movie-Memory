import { z } from "zod";

export const MOVIE_MAX_LENGTH = 100;

// Control characters (newlines, tabs, NUL, ...) never belong in a movie title.
const CONTROL_CHARS = /\p{Cc}/u;
// Whitespace, control and invisible "format" characters (e.g. zero-width space U+200B).
// trim() doesn't remove zero-width characters, so "​" alone would otherwise pass.
const INVISIBLE_CHARS = /[\s\p{Cc}\p{Cf}]/gu;

const REQUIRED_MESSAGE = "Please enter a movie title.";

/**
 * Server-side source of truth for a favorite movie. Returns the trimmed title.
 * The 100 limit is counted in UTF-16 code units, which is never fewer than Postgres's
 * character count, so anything that passes here also fits the VARCHAR(100) column.
 */
export const movieSchema = z
  .string({ error: REQUIRED_MESSAGE })
  .trim()
  .min(1, REQUIRED_MESSAGE)
  .max(MOVIE_MAX_LENGTH, `Movie titles can be at most ${MOVIE_MAX_LENGTH} characters.`)
  .refine((v) => !CONTROL_CHARS.test(v), "Movie titles can't contain line breaks or tabs.")
  .refine((v) => v.replace(INVISIBLE_CHARS, "").length > 0, REQUIRED_MESSAGE);
