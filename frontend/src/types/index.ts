export type CardType = 'base' | 'insert' | 'parallel' | 'numbered' | 'auto' | 'patch' | 'auto_patch';
export type CardStatus = 'draft' | 'collection' | 'a_vendre' | 'reserve' | 'vendu';
export type Sport = 'Basket' | 'Foot' | 'Baseball' | 'Football US' | 'Hockey' | 'Autre';
export const SPORTS: Sport[] = ['Basket', 'Foot', 'Baseball', 'Football US', 'Hockey', 'Autre'];
export type GradingCompany = 'PSA' | 'BGS' | 'SGC' | 'CGC' | 'HGA';
export type GradingStatus = 'submitted' | 'received' | 'graded' | 'returned';

export interface Card {
  id: string;
  user_id: string;
  sport: Sport;
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
  serial_number: string | null;
  is_rookie: boolean | null;
  condition_notes: string | null;
  status: CardStatus;
  price: number | null;
  vinted_price: number | null;
  ebay_price: number | null;
  price_inflation: number | null;
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
  ebay_url: string | null;
  ebay_offer_id: string | null;
  ebay_listing_id: string | null;
  ebay_sold_price: number | null;
  ebay_sold_at: string | null;
  quantity: number | null;
  folder_ids: string[] | null;
}

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  position: number | null;
  created_at: string;
}

export type ShareRequestStatus = 'new' | 'contacted' | 'archived';

export interface ShareRequest {
  id: string;
  user_id: string;
  share_token: string | null;
  viewer_handle: string;
  message: string | null;
  card_ids: string[] | null;
  status: ShareRequestStatus;
  created_at: string;
}

export interface AIIdentificationResult {
  sport: Sport;
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
  serial_number: string;
  is_rookie: boolean;
  condition_notes: string;
  card_type: CardType;
}

export type ImportClassification = 'processing' | 'match' | 'probable' | 'new' | 'insufficient' | 'error';
export type ImportAction = 'shelve' | 'create' | 'increment' | 'ignore' | 'review';

export interface ImportMatch {
  card_id: string;
  score: number;
  coverage: number;
  reasons: string[];
  conflicts: string[];
  hard_conflict: boolean;
}

export interface ImportItem {
  id: string;
  batch_id: string;
  position: number;
  front_image_url: string;
  back_image_url: string | null;
  front_filename: string | null;
  back_filename: string | null;
  identification: (AIIdentificationResult & { set_name?: string; insert_name?: string; parallel_name?: string }) | null;
  classification: ImportClassification;
  matches: ImportMatch[];
  error: string | null;
  action: ImportAction | null;
  target_card_id: string | null;
  created_card_id: string | null;
  action_at: string | null;
}

export interface ImportBatch {
  id: string;
  name: string;
  status: 'open' | 'completed';
  created_at: string;
  updated_at: string;
  items?: ImportItem[];
}

export interface VintedPayload {
  title: string;
  description: string;
  price: number;
  image_front_url: string;
  image_back_url: string;
}
