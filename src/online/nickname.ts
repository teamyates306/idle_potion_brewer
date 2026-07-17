// One-time nickname validation: format rules mirror the DB CHECK constraint,
// plus a client-side moderation pass (normalised against leetspeak) so the
// obvious stuff never even reaches the server. Uniqueness is enforced by the
// DB's case-insensitive unique index.

const FORMAT = /^[A-Za-z0-9_][A-Za-z0-9_ ]{1,18}[A-Za-z0-9_]$/;

// Blocked substrings, matched against the normalised (lowercased, de-leeted,
// space/underscore-stripped) nickname. Deliberately conservative — false
// positives on a free nickname are cheaper than slurs on a public board.
const BLOCKLIST = [
  // slurs / hate speech
  "nigg", "fagg", "faggot", "kike", "spic", "chink", "gook", "tranny",
  "retard", "raghead", "wetback", "coon", "beaner", "dyke",
  "nazi", "hitler", "kkk", "whitepower", "heilh",
  // sexual / crude
  "fuck", "shit", "cunt", "twat", "wank", "cock", "dick", "penis",
  "vagina", "pussy", "boob", "tits", "anal", "anus", "rape", "rapist",
  "cum", "semen", "porn", "hentai", "blowjob", "handjob", "dildo",
  "whore", "slut", "bitch", "bastard", "asshole", "arsehole",
  "pedo", "paedo", "molest",
  // misc
  "suicide", "killyourself", "kys",
];

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
  "8": "b", "9": "g", "@": "a", "$": "s", "!": "i",
};

function normalise(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^a-z]/g, "");
}

export type NicknameVerdict = { ok: true } | { ok: false; reason: string };

export function validateNickname(raw: string): NicknameVerdict {
  const name = raw.trim();
  if (name.length < 3) return { ok: false, reason: "At least 3 characters." };
  if (name.length > 20) return { ok: false, reason: "At most 20 characters." };
  if (!FORMAT.test(name)) {
    return { ok: false, reason: "Letters, numbers, spaces and _ only (no leading/trailing space)." };
  }
  const norm = normalise(name);
  for (const bad of BLOCKLIST) {
    if (norm.includes(bad)) {
      return { ok: false, reason: "That name isn't allowed. Pick something guild-appropriate." };
    }
  }
  return { ok: true };
}
