/**
 * Claude API errors can carry raw JSON/internal details (request IDs, provider
 * error shapes) that shouldn't reach a lawyer's chat window verbatim - unlike
 * lib/auth/errorMessages.ts, this never falls back to the raw message itself,
 * only to a safe generic line, since an unrecognized AI error is more likely
 * to be something internal than something meaningful to show a user.
 */
const TRANSLATIONS: { match: RegExp; hebrew: string }[] = [
  { match: /credit balance is too low/i, hebrew: "שירות ה-AI אינו זמין כרגע (בעיית חיוב מול הספק) - יש לפנות לתמיכה." },
  { match: /rate.?limit/i, hebrew: "יותר מדי בקשות בזמן קצר - יש להמתין רגע ולנסות שוב." },
  { match: /overloaded/i, hebrew: "שירות ה-AI עמוס כרגע - יש לנסות שוב בעוד כמה דקות." },
];

export function translateAiError(message: string): string {
  const hit = TRANSLATIONS.find((t) => t.match.test(message));
  return hit?.hebrew ?? "אירעה שגיאה בעת יצירת התגובה. נסה/י שוב, ואם זה נמשך יש לפנות לתמיכה.";
}
