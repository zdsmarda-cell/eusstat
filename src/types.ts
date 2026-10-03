export interface MovementRecord {
  id?: string | number;
  box_id?: string | number;
  sberny_box: string; // box_code e.g. L1Z2-TR-0252
  obsah_objednavek: string; // order_id e.g. 8385399
  pocet_produktu: number; // total units in order
  ean_produktu: string; // ean or sample ean
  pocet_ks: number; // units of this ean
  zacatek_pickovani: string; // ISO string
  konec_pickovani: string;   // ISO string
  zacatek_baleni: string;      // ISO string
  konec_baleni: string;        // ISO string
  pick_duration_s: number;
  pack_duration_s: number;
  pick_per_item_s: number;
  pack_per_item_s: number;
  total_per_item_s: number;
  bracket: '1' | '2' | '3' | '4' | '5+';
  packer?: string;
  sec_per_scan?: number;
  wait_pick_to_pack_min?: number;
  created_at?: string;
}

export interface MariaDbConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl?: boolean;
}

export interface DbStatus {
  connected: boolean;
  type: 'mariadb' | 'memory';
  host?: string;
  database?: string;
  user?: string;
  totalRows?: number;
  latencyMs?: number;
  version?: string;
  lastError?: string;
}

export type ItemBracket = '1' | '2' | '3' | '4' | '5+';

export interface BracketStat {
  bracket: ItemBracket | 'all';
  label: string;
  shipmentCount: number;
  itemCount: number;
  avgPickTotalSec: number;
  avgPickPerItemSec: number;
  medianPickPerItemSec: number;
  p90PickPerItemSec: number;
  avgPackTotalSec: number;
  avgPackPerItemSec: number;
  medianPackPerItemSec: number;
  p90PackPerItemSec: number;
  avgTotalPerItemSec: number;
  medianTotalPerItemSec: number;
  pickSavingsPctVsSingle: number;
  packSavingsPctVsSingle: number;
  totalSavingsPctVsSingle: number;
}

export interface DailyStat {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "Po 12.5."
  totalShipments: number;
  totalItems: number;
  avgPickPerItemSec: number;
  avgPackPerItemSec: number;
  avgTotalPerItemSec: number;
  bracketBreakdown: Record<ItemBracket, {
    shipments: number;
    items: number;
    avgPickPerItemSec: number;
    avgPackPerItemSec: number;
    avgTotalPerItemSec: number;
  }>;
}

export interface FilterState {
  datePreset: 'today' | '7days' | '14days' | '30days' | 'all' | 'custom';
  dateFrom: string;
  dateTo: string;
  bracket: 'all' | ItemBracket;
  searchBox: string;
  searchQuery: string;
  excludeOutliers: boolean; // filter duration > 1800s (30 mins)
  unit: 'sec' | 'min';
}
