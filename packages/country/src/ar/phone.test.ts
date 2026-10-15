import { describe, expect, it } from 'vitest';
import { argentineWhatsapp } from './phone';

describe('Argentine WhatsApp numbers', () => {
  it.each([
    ['+54 9 11 5555-1234', '5491155551234'],
    ['+54 11 5555-1234', '5491155551234'],
    ['011 5555-1234', '5491155551234'],
    ['11 5555 1234', '5491155551234'],
    ['0054 9 351 555 1234', '5493515551234'],
    ['(0351) 555-1234', '5493515551234'],
  ])('%s → %s', (input, expected) => {
    expect(argentineWhatsapp(input)).toBe(expected);
  });

  it('rejects what it cannot read', () => {
    expect(argentineWhatsapp('15-5555-1234')).toBeNull();
    expect(argentineWhatsapp('011 15 5555 1234')).toBeNull();
    expect(argentineWhatsapp('hola')).toBeNull();
  });
});
