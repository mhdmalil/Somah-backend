/** UAE-aware digit key so 050…, 5…, and +971… count as the same number. */
export function normalizeWaitlistPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.startsWith('9710') && digits.length >= 12) {
    digits = `971${digits.slice(4)}`;
  } else if (digits.startsWith('0') && digits.length === 10) {
    digits = `971${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith('5')) {
    digits = `971${digits}`;
  }
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}
