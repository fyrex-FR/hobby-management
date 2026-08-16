export interface EbayPricingInput {
  vintedPrice: number;
  commissionRate: number;
  transactionRate: number;
  inflation: number;
}

export interface EbayPricingResult {
  beforeRounding: number;
  roundingStep: 0.5 | 1;
  ebayPrice: number;
}

export function calculateEbayPrice(input: EbayPricingInput): EbayPricingResult {
  const values = [input.vintedPrice, input.commissionRate, input.transactionRate, input.inflation];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Les prix et taux doivent être des nombres positifs ou nuls.');
  }

  const rateMultiplier = 1 + (input.commissionRate + input.transactionRate) / 100;
  const beforeRounding = input.vintedPrice * rateMultiplier + input.inflation;
  const roundingStep: 0.5 | 1 = beforeRounding < 5 ? 0.5 : 1;
  const ebayPrice = Math.ceil((beforeRounding - Number.EPSILON) / roundingStep) * roundingStep;

  return {
    beforeRounding: Math.round(beforeRounding * 100) / 100,
    roundingStep,
    ebayPrice: Math.round(ebayPrice * 100) / 100,
  };
}
