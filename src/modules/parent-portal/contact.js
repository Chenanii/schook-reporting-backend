import { env } from '../../config/env.js';

export function normalizeParentIdentifier(identifier) {
  const value = identifier.trim();
  if (value.includes('@')) {
    return { type: 'email', value: value.toLowerCase(), variants: [value.toLowerCase()] };
  }

  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;

  const countryCode = env.TEXTBEE_DEFAULT_COUNTRY_CODE;
  let internationalDigits = digits;
  if (value.startsWith('+')) {
    internationalDigits = digits;
  } else if (digits.startsWith('00')) {
    internationalDigits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    internationalDigits = `${countryCode}${digits.slice(1)}`;
  } else if (!digits.startsWith(countryCode)) {
    internationalDigits = `${countryCode}${digits}`;
  }

  if (internationalDigits.length < 7 || internationalDigits.length > 15) return null;
  const e164 = `+${internationalDigits}`;
  const variants = new Set([value, digits, e164, internationalDigits]);
  if (internationalDigits.startsWith(countryCode)) {
    variants.add(`0${internationalDigits.slice(countryCode.length)}`);
  }
  return { type: 'phone', value: e164, variants: [...variants] };
}
