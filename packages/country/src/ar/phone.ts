/**
 * Argentine phone → WhatsApp number (wa.me): 54 + 9 + area code + number,
 * without the trunk 0. Accepts "+54 9 11 5555-1234", "011 5555 1234",
 * "11-5555-1234"... The local "15" prefix can't be removed reliably without
 * knowing the area code length, so numbers written that way are rejected.
 */
export function argentineWhatsapp(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  // No area code starts with 15: that's the local mobile prefix without area code.
  if (digits.startsWith('15')) return null;
  if (digits.length === 10) digits = `9${digits}`;
  return digits.length === 11 && digits.startsWith('9') ? `54${digits}` : null;
}
