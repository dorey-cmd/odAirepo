/** Supabase Auth errors arrive in English - translate the common ones so lawyers signing up/in see Hebrew. */
const TRANSLATIONS: { match: RegExp; hebrew: string }[] = [
  { match: /invalid login credentials/i, hebrew: "אימייל או סיסמה שגויים" },
  { match: /user already registered/i, hebrew: "כתובת האימייל הזו כבר רשומה במערכת" },
  { match: /email not confirmed/i, hebrew: "יש לאמת את כתובת האימייל לפני ההתחברות" },
  { match: /password should be at least/i, hebrew: "הסיסמה חייבת להכיל לפחות 6 תווים" },
  { match: /unable to validate email address/i, hebrew: "כתובת האימייל אינה תקינה" },
  { match: /user not found/i, hebrew: "לא נמצא משתמש עם הפרטים האלו" },
  { match: /email rate limit exceeded/i, hebrew: "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות" },
  { match: /for security purposes.*after \d+ seconds/i, hebrew: "יותר מדי ניסיונות. יש להמתין קצת ולנסות שוב" },
  { match: /new password should be different/i, hebrew: "הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית" },
  { match: /signup.*disabled/i, hebrew: "הרשמה אינה זמינה כרגע" },
  { match: /network/i, hebrew: "שגיאת רשת - יש לבדוק את החיבור לאינטרנט ולנסות שוב" },
];

export function translateAuthError(message: string): string {
  const hit = TRANSLATIONS.find((t) => t.match.test(message));
  return hit?.hebrew ?? message;
}
