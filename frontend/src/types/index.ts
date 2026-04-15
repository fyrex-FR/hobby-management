export type CardType = 'base' | 'insert' | 'parallel' | 'numbered' | 'auto' | 'patch' | 'auto_patch';
export type CardStatus = 'draft' | 'collection' | 'a_vendre' | 'reserve' | 'vendu';
export type GradingCompany = 'PSA' | 'BGS' | 'SGC' | 'CGC' | 'HGA';
export type GradingStatus = 'submitted' | 'received' | 'graded' | 'returned';

export interface Card {
  id: string;
  user_id: string;
  player: string | null;
  team: string | null;
  year: string | null;
  brand: string | null;
  set_name: string | null;
  card_type: CardType | null;
  insert_name: string | null;
  parallel_name: string | null;
  parallel_confidence: number | null;
  card_number: string | null;
  numbered: string | null;
  condition_notes: string | null;
  status: CardStatus;
  price: number | null;
  purchase_price: number | null;
  sale_mode: string;
  is_shelved: boolean;
  is_listed: boolean;
  listing_validated: boolean;
  validated_at: string | null;
  image_front_url: string | null;
  image_back_url: string | null;
  created_at: string;
  // Grading
  grading_company: GradingCompany | null;
  grading_status: GradingStatus | null;
  grading_submitted_at: string | null;
  grading_returned_at: string | null;
  grading_grade: string | null;
  grading_cert: string | null;
  grading_cost: number | null;
  vinted_url: string | null;
}

export interface AIIdentificationResult {
  player: string;
  team: string;
  year: string;
  brand: string;
  set: string;
  insert: string;
  parallel: string;
  parallel_confidence: number;
  card_number: string;
  numbered: string;
  condition_notes: string;
  card_type: CardType;
}

export interface VintedPayload {
  title: string;
  description: string;
  price: number;
  image_front_url: string;
  image_back_url: string;
}
