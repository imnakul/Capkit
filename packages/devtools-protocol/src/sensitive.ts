export type SensitiveKind = "token" | "card" | "email" | "phone" | "secret";

/** Kinds the extension can report: the text kinds plus a filled password field. */
export type WebSensitiveKind = SensitiveKind | "password";

export type SensitiveSpan = {
  kind: SensitiveKind;
  start: number;
  end: number;
};

export const SENSITIVE_KIND_LABELS: Readonly<Record<WebSensitiveKind, string>> = {
  password: "Password",
  token: "API key or token",
  card: "Card number",
  email: "Email address",
  phone: "Phone number",
  secret: "Possible secret",
};

const TOKEN_PATTERN =
  /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g;
const CARD_PATTERN = /\b\d(?:[ -]?\d){12,18}\b/g;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,5}(?:[\s.-]?\d{2,5}){1,4}/g;
const SECRET_CANDIDATE_PATTERN = /[A-Za-z0-9+/=_-]{24,}/g;

/** Below this, long identifiers such as `getElementByIdOrThrow` stop qualifying. */
const SECRET_MIN_ENTROPY_BITS = 3.5;

/** Card-number checksum; it removes most random 13–19 digit runs. */
export function passesLuhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Shannon entropy in bits per character. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function digitCount(value: string): number {
  return value.replace(/\D/g, "").length;
}

function looksLikeSecret(value: string): boolean {
  return /[A-Za-z]/.test(value)
    && /\d/.test(value)
    && shannonEntropy(value) >= SECRET_MIN_ENTROPY_BITS;
}

type Matcher = {
  kind: SensitiveKind;
  pattern: RegExp;
  accepts: (match: string) => boolean;
};

// Ordered by confidence: an earlier matcher claims overlapping text first.
const MATCHERS: readonly Matcher[] = [
  { kind: "token", pattern: TOKEN_PATTERN, accepts: () => true },
  { kind: "card", pattern: CARD_PATTERN, accepts: (match) => passesLuhn(match.replace(/\D/g, "")) },
  { kind: "email", pattern: EMAIL_PATTERN, accepts: () => true },
  {
    kind: "phone",
    pattern: PHONE_PATTERN,
    accepts: (match): boolean => {
      const digits = digitCount(match);
      return digits >= 10 && digits <= 15;
    },
  },
  { kind: "secret", pattern: SECRET_CANDIDATE_PATTERN, accepts: looksLikeSecret },
];

/** Finds sensitive spans in one line of text. Spans never overlap. */
export function findSensitiveSpans(text: string): SensitiveSpan[] {
  const spans: SensitiveSpan[] = [];
  for (const matcher of MATCHERS) {
    for (const match of text.matchAll(matcher.pattern)) {
      const value = match[0].trim();
      if (value.length === 0 || !matcher.accepts(value)) continue;
      const start = match.index + match[0].indexOf(value);
      const end = start + value.length;
      if (spans.some((span) => start < span.end && end > span.start)) continue;
      spans.push({ kind: matcher.kind, start, end });
    }
  }
  return spans.sort((left, right) => left.start - right.start);
}

/** Masks all but the first and last two characters. */
export function maskPreview(value: string): string {
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 2)}${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-2)}`;
}

/** Replaces every sensitive span with a bullet mask, so exported text never carries a secret. */
export function maskSensitiveText(text: string): { text: string; masked: number } {
  const spans = text
    .split("\n")
    .map((line) => ({ line, spans: findSensitiveSpans(line) }));
  let masked = 0;
  const lines = spans.map(({ line, spans: lineSpans }) => {
    let result = "";
    let cursor = 0;
    for (const span of lineSpans) {
      result += line.slice(cursor, span.start) + maskPreview(line.slice(span.start, span.end));
      cursor = span.end;
      masked += 1;
    }
    return result + line.slice(cursor);
  });
  return { text: lines.join("\n"), masked };
}
