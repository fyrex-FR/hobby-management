export interface EbayPricingInput {
  vintedPrice: number;
}

export interface EbayPricingResult {
  beforeRounding: number;
  roundingStep: 0.5 | 1;
  ebayPrice: number;
}

export function calculateEbayPrice(input: EbayPricingInput): EbayPricingResult {
  if (!Number.isFinite(input.vintedPrice) || input.vintedPrice < 0) {
    throw new Error('Le prix doit être un nombre positif ou nul.');
  }

  const beforeRounding = (input.vintedPrice + 0.35) / 0.91;
  const roundingStep: 0.5 | 1 = beforeRounding < 5 ? 0.5 : 1;
  const ebayPrice = Math.ceil((beforeRounding - Number.EPSILON) / roundingStep) * roundingStep;

  return {
    beforeRounding: Math.round(beforeRounding * 100) / 100,
    roundingStep,
    ebayPrice: Math.round(ebayPrice * 100) / 100,
  };
}
