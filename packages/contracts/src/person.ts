import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const PERSON_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Who a paired device belongs to on an environment several people share. A short handle
 * rather than an account: lower case so two spellings never name two people.
 */
export const PersonName = TrimmedNonEmptyString.check(
  Schema.makeFilter((value) =>
    PERSON_NAME_PATTERN.test(value)
      ? true
      : "A person's name is 1 to 64 lower-case letters, digits, dots, dashes or underscores.",
  ),
);
export type PersonName = typeof PersonName.Type;

/** What someone typed, as the name it would be stored under, or undefined when it cannot be one. */
export function normalizePersonName(input: string): PersonName | undefined {
  const candidate = input.trim().toLowerCase();
  return PERSON_NAME_PATTERN.test(candidate) ? candidate : undefined;
}
