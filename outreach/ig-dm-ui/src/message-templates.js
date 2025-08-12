/**
 * US Market Instagram DM Templates
 * Authentic style for business outreach
 */

export const US_BUSINESS_TEMPLATES = [
  "hey youre amazing, i just found youre page (i can help you earn more)",
  "hey youre great, just found youre page (i can help you make more $)",
  "just found youre page—love it (i can help you earn more from ig)",
  "hey youre amazing (found youre page today) — i can help you earn more if you want",
  "found youre page—clean vibe (got a tiny way to make more $)",
  "youre fire, just found youre page (i can help you earn more, no spam)",
  "hey just found youre page—i can help you make more from the same posts",
  "youre amazing—found youre page now (1 small tweak = more $)",
  "just saw youre page—so good (i can help you earn more fast)",
  "hey youre dope, just found youre page (i can help you make more from ig)",
  "love youre content, just found it (i can help you get more from youre posts)",
  "hey girl just found youre page (know a way to help you earn more)",
  "youre stunning, found youre page today (i can help you make more)",
  "hey beautiful just saw youre page (got a way to help you earn more)",
  "found youre page and wow (i can help you get more from youre content)",
  "hey gorgeous just found youre page (i can help you make more from posts)",
  "youre incredible, found youre page now (know how to help you earn more)",
  "hey cutie just saw youre page (got a way to help you make more)",
  "love youre vibe, found youre page today (i can help you earn more)",
  "hey babe just found youre page (know a trick to help you make more)"
];

/**
 * Get random message template
 */
export function getRandomMessage() {
  const randomIndex = Math.floor(Math.random() * US_BUSINESS_TEMPLATES.length);
  return US_BUSINESS_TEMPLATES[randomIndex];
}

/**
 * Get message by index (for testing/consistency)
 */
export function getMessageByIndex(index) {
  if (index < 0 || index >= US_BUSINESS_TEMPLATES.length) {
    throw new Error(`Message index ${index} out of range (0-${US_BUSINESS_TEMPLATES.length - 1})`);
  }
  return US_BUSINESS_TEMPLATES[index];
}

/**
 * Get all available messages with indices
 */
export function listMessages() {
  return US_BUSINESS_TEMPLATES.map((msg, idx) => ({
    index: idx,
    message: msg,
    preview: msg.slice(0, 50) + (msg.length > 50 ? '...' : '')
  }));
}

console.log('💬 US Business DM Templates loaded:', US_BUSINESS_TEMPLATES.length, 'messages');