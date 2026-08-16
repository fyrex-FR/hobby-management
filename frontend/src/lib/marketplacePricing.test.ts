import { describe, expect, it } from 'vitest';
import { calculateEbayPrice } from './marketplacePricing';

describe('calculateEbayPrice', () => {
  it('applies rates, inflation, then rounds to the next euro above five euros', () => {
    expect(calculateEbayPrice({
      vintedPrice: 4.8,
      commissionRate: 20,
      transactionRate: 9.1666667,
      inflation: 0,
    })).toEqual({ beforeRounding: 6.2, roundingStep: 1, ebayPrice: 7 });
  });

  it('rounds to the next half euro below five euros', () => {
    expect(calculateEbayPrice({
      vintedPrice: 3.2,
      commissionRate: 10,
      transactionRate: 5,
      inflation: 0.1,
    })).toEqual({ beforeRounding: 3.78, roundingStep: 0.5, ebayPrice: 4 });
  });

  it('does not move a value already on an increment', () => {
    expect(calculateEbayPrice({
      vintedPrice: 5,
      commissionRate: 0,
      transactionRate: 0,
      inflation: 0,
    }).ebayPrice).toBe(5);
  });

  it('rejects negative values', () => {
    expect(() => calculateEbayPrice({
      vintedPrice: 5,
      commissionRate: -1,
      transactionRate: 0,
      inflation: 0,
    })).toThrow();
  });
});
