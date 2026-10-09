export type ItemBracket = '1' | '2' | '3' | '4' | '5' | '6+';

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

export type WarehouseId = 'ruse' | 'svj';

export interface MovementRecord {
  id?: string | number;
  warehouse?: WarehouseId; // 'ruse' | 'svj'
  box_id?: string | number;
  sberny_box: string; // box_code e.g. L1Z2-TR-0252 or 0140933
  cycle_no?: number;
  obsah_objednavek: string; // order_id / order_uid e.g. 4406312851
  pocet_produktu: number; // total units in order
  ean_produktu: string; // ean or sample ean
  pocet_ks: number; // units of this ean
  zacatek_pickovani: string; // ISO string
  konec_pickovani: string;   // ISO string
  zacatek_sortingu?: string;  // ISO string (SVJ)
  konec_sortingu?: string;    // ISO string (SVJ)
  zacatek_baleni: string;      // ISO string
  konec_baleni: string;        // ISO string
  pick_duration_s: number;
  sort_duration_s?: number;    // SVJ sorting duration in seconds
  pack_duration_s: number;     // manual packing duration in seconds
  pick_per_item_s: number;
  sort_per_item_s?: number;    // SVJ sorting per item in seconds
  pack_per_item_s: number;
  total_per_item_s: number;
  bracket: ItemBracket;
  packer?: string;
  station?: string;            // pack station e.g. (javi-4)
  sec_per_scan?: number;
  wait_after_picking_min?: number; // wait between picking and sorting in minutes (SVJ)
  wait_sort_to_pack_min?: number;  // wait between sorting and packing in minutes (SVJ)
  wait_pick_to_pack_min?: number;  // total buffer time between picking and packing in minutes
  box_unique_eans?: number; // count of unique EANs in the parent box
  box_total_units?: number; // total units in the parent box
  box_shared_skus_count?: number; // count of SKUs that appear in >1 order in this box
  units_sorted?: number; // count of sorted units for this order (SVJ)
  box_units_sorted?: number; // total units_sorted in parent box (SVJ)
  is_sorted?: boolean; // flag if order was sorted
  is_packed?: boolean; // flag if order was packed
  created_at?: string;
}

export interface BoxSynergyStat {
  box_id: string;
  box_code: string;
  packer?: string;
  total_orders: number;
  total_units: number;
  unique_eans: number;
  units_per_ean_ratio: number; // e.g. 84 units / 9 EANs = 9.3 units/SKU
  shared_skus_count: number; // SKUs appearing in multiple orders
  overlap_percentage: number; // % of units from shared SKUs
  category: 'high_overlap' | 'medium_overlap' | 'low_overlap'; // high multipick vs diverse
  avg_pick_per_unit_s: number;
  avg_pack_per_unit_s: number;
  single_item_orders_count: number;
  multi_item_orders_count: number;
  single_item_avg_pack_per_unit_s: number;
  multi_item_avg_pack_per_unit_s: number;
}

export interface SynergyCategoryStat {
  bracket: ItemBracket | 'all';
  label: string;
  orderCount: number;
  itemCount: number;
  avgPickPerUnitSec: number;
  avgPackPerUnitSec: number;
  avgTotalPerUnitSec: number;
}

export interface BoxOverlapTierStats {
  count: number;
  sharePct: number;             // % podíl boxů ve zkoumaném vzorku
  totalUnits: number;           // celkový počet kusů v této kategorii
  unitSharePct: number;         // % podíl kusů ve zkoumaném vzorku
  totalOrders: number;          // celkový počet objednávek v této kategorii
  orderSharePct: number;        // % podíl objednávek ve zkoumaném vzorku
  avgUnitsPerEan: number;
  avgPickPerUnitSec: number;
  avgPackPerUnitSec: number;
  singleItemPackPerUnitSec: number;
  multiItemPackPerUnitSec: number;
  categories: Record<ItemBracket | 'all', SynergyCategoryStat>;
}

export interface HypothesisBracketComparison {
  bracket: ItemBracket | 'all';
  label: string;
  highPickSec: number;
  lowPickSec: number;
  pickSavingsPct: number;
  highPackSec: number;
  lowPackSec: number;
  packSavingsPct: number;
  highTotalSec: number;
  lowTotalSec: number;
  totalSavingsPct: number;
  highOrders: number;
  lowOrders: number;
}

export interface HypothesisAnalysis {
  highOverlapBoxes: BoxOverlapTierStats;
  mediumOverlapBoxes: BoxOverlapTierStats;
  lowOverlapBoxes: BoxOverlapTierStats;
  pickingSpeedupPct: number; // how much faster picking is in high overlap vs low overlap
  packingSpeedupPct: number; // how much faster packing is in high overlap vs low overlap for comparable categories
  packingSlowdownInDiverseMultiItemPct: number; // how much slower packing is when multi-item orders have diverse products
  bracketComparisons: HypothesisBracketComparison[];
}

export interface BracketStat {
  bracket: ItemBracket | 'all';
  label: string;
  shipmentCount: number;
  itemCount: number;
  shipmentSharePct: number; // % share of total shipments in period
  itemSharePct: number;     // % share of total items in period
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

export interface SimulationBracketResult {
  bracket: ItemBracket | 'all';
  label: string;
  orderCount: number;
  itemCount: number;
  orderSharePct: number;
  itemSharePct: number;

  // Baseline (current algorithm)
  baselinePickSec: number;
  baselinePackSec: number;
  baselineTotalSec: number;
  baselinePickPerItemSec: number;
  baselinePackPerItemSec: number;
  baselineTotalPerItemSec: number;

  // Optimized (2-hour slot multipicking clustering)
  optimizedPickSec: number;
  optimizedPackSec: number;
  optimizedTotalSec: number;
  optimizedPickPerItemSec: number;
  optimizedPackPerItemSec: number;
  optimizedTotalPerItemSec: number;

  // Savings
  pickSavingsSec: number;
  pickSavingsPct: number;
  packSavingsSec: number;
  packSavingsPct: number;
  totalSavingsSec: number;
  totalSavingsPct: number;
}

export interface SkuVolumeProfile {
  ean: string;
  totalUnitsObserved: number;
  maxUnitsInSingleOrder: number;
  maxUnitsInSingleBoxSession: number;
  estimatedFullBoxCapacity: number;
  unitVolumeFraction: number;
  category: 'small' | 'medium' | 'bulky';
}

export interface VolumetricAnalysisSummary {
  totalSkusAnalyzed: number;
  avgEstimatedCapacityPerSku: number;
  smallSkusCount: number;
  mediumSkusCount: number;
  bulkySkusCount: number;
}

export interface MultipickSimulationReport {
  boxCapacityLimit: number;
  maxObservedUnitsInBox: number;
  p95ObservedUnitsInBox: number;
  avgObservedUnitsInBox: number;
  totalBoxesCurrent: number;
  totalBoxesSimulated: number;
  totalTwoHourSlots: number;
  bracketResults: SimulationBracketResult[];
  totalSavedSeconds: number;
  totalSavedHours: number;
  totalBaselineHours: number;
  totalOptimizedHours: number;
  overallSavingsPct: number;
  baselineMultipickRatioPct: number;
  simulatedMultipickRatioPct: number;
  volumetricSummary?: VolumetricAnalysisSummary;
}



export interface PeriodSummary {
  dateFrom: string;
  dateTo: string;
  daysCount: number;
  totalOrders: number;
  totalSkus: number;
  totalUnits: number;
  top80SkusCount?: number;
  top80SkusSharePct?: number;
  avgUnitsPerOrder: number;
  medianOrdersPerBox: number;
  avgOrdersPerBox: number;
  totalBoxesCount: number;
  minOrdersPerBox: number;
  maxOrdersPerBox: number;
}

export interface ProductParetoData {
  totalUniqueProducts: number;
  totalUnits: number;
  top80ProductsCount: number;
  top80ProductsSharePct: number;
  top80Units: number;
  top80UnitsPct: number;
  remaining20ProductsCount: number;
  remaining20ProductsSharePct: number;
  remaining20Units: number;
  remaining20UnitsPct: number;
  topProducts: {
    ean: string;
    units: number;
    sharePct: number;
  }[];
}

export interface DayOfWeekStat {
  dayIndex: number; // 0 = Pondělí, 1 = Úterý, ... 6 = Neděle
  dayNameCs: string;
  dayNameEn: string;
  dayShortCs: string;
  dayShortEn: string;
  totalOrders: number;
  totalUnits: number;
  avgPickPerItemSec: number;
  avgPackPerItemSec: number;
  avgTotalPerItemSec: number;
  avgPickPerOrderSec: number;
  avgPackPerOrderSec: number;
  avgTotalPerOrderSec: number;
  pareto: ProductParetoData;
}

export interface DailyStat {
  date: string; // YYYY-MM-DD
  dayLabel: string; // e.g. "Po 12.5."
  dayOfWeekIndex: number; // 0 = Po, 6 = Ne
  totalShipments: number;
  totalItems: number;
  avgPickPerItemSec: number;
  avgPackPerItemSec: number;
  avgTotalPerItemSec: number;
  avgPickPerOrderSec: number;
  avgPackPerOrderSec: number;
  avgTotalPerOrderSec: number;
  pareto: ProductParetoData;
  bracketBreakdown: Record<ItemBracket, {
    shipments: number;
    items: number;
    avgPickPerItemSec: number;
    avgPackPerItemSec: number;
    avgTotalPerItemSec: number;
  }>;
}

export interface DailyPerformanceReport {
  dayOfWeekStats: DayOfWeekStat[];
  dailyStats: DailyStat[];
  overallPareto: ProductParetoData;
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

export interface SvjTriFileParseResult {
  records: MovementRecord[];
  pickingRowsCount: number;
  sortingRowsCount: number;
  packingRowsCount: number;
  uniqueOrdersPicked: number;
  uniqueOrdersSorted: number;
  uniqueOrdersPacked: number;
  totalUnitsSorted?: number;
  matchedCompleteOrders: number;
  droppedUnsortedOrders: number;
  droppedUnpackedOrders: number;
  errors: string[];
}

export interface WarehouseComparisonBracket {
  bracket: ItemBracket | 'all';
  label: string;
  ruseOrders: number;
  svjOrders: number;
  // Mediány (na 1. místě)
  ruseMedianPickPerItemSec: number;
  svjMedianPickPerItemSec: number;
  ruseMedianPackPerItemSec: number;
  svjMedianPackPerItemSec: number;
  svjMedianSortPerItemSec: number;
  ruseMedianTotalPerItemSec: number;
  svjMedianTotalPerItemSec: number;
  // Aritmetické průměry (na 2. místě)
  ruseAvgPickPerItemSec: number;
  svjAvgPickPerItemSec: number;
  ruseAvgPackPerItemSec: number;
  svjAvgPackPerItemSec: number;
  svjAvgSortPerItemSec: number;
  ruseTotalPerItemSec: number;
  svjTotalPerItemSec: number;
  pickDiffPct: number;
  packDiffPct: number;
  pickMedianDiffPct: number;
  packMedianDiffPct: number;
}

export interface WarehouseComparisonReport {
  periodDays: number;
  ruseTotalOrders: number;
  svjTotalOrders: number;
  ruseTotalUnits: number;
  svjTotalUnits: number;
  ruseTotalSkus: number;
  svjTotalSkus: number;
  ruseTop80SkusCount: number;
  ruseTop80SkusSharePct: number;
  svjTop80SkusCount: number;
  svjTop80SkusSharePct: number;
  ruseAvgUnitsPerOrder: number;
  svjAvgUnitsPerOrder: number;
  ruseMedianOrdersPerBox: number;
  svjMedianOrdersPerBox: number;

  // Mediány na 1. místě pro klíčové operace
  ruseMedianPickPerItemSec: number;
  svjMedianPickPerItemSec: number;
  ruseMedianPackPerItemSec: number;
  svjMedianPackPerItemSec: number;
  svjMedianSortPerItemSec: number;
  ruseMedianTotalPerItemSec: number;
  svjMedianTotalPerItemSec: number;
  ruseMedianWaitPickToPackMin: number;
  svjMedianWaitPickToSortMin: number;
  svjMedianWaitSortToPackMin: number;
  ruseMedianTotalLeadTimeMin: number;
  svjMedianTotalLeadTimeMin: number;

  // Aritmetické průměry na 2. místě pro klíčové operace
  ruseAvgPickPerItemSec: number;
  svjAvgPickPerItemSec: number;
  ruseAvgPackPerItemSec: number;
  svjAvgPackPerItemSec: number;
  svjAvgSortPerItemSec: number;
  ruseAvgWaitPickToPackMin: number;
  svjAvgWaitPickToSortMin: number;
  svjAvgWaitSortToPackMin: number;
  ruseAvgTotalLeadTimeMin: number;
  svjAvgTotalLeadTimeMin: number;
  bracketComparisons: WarehouseComparisonBracket[];

  // Multipicking potential & optimization comparison
  ruseMultipickSavedHours: number;
  ruseMultipickSavingsPct: number;
  ruseBaselineMultipickRatioPct: number;
  ruseSimulatedMultipickRatioPct: number;

  svjMultipickSavedHours: number;
  svjMultipickSavingsPct: number;
  svjBaselineMultipickRatioPct: number;
  svjSimulatedMultipickRatioPct: number;

  // Celkový souhrn přes všechny sklady za dané období
  totalCombinedSkus?: number;
  totalCombinedTop80SkusCount?: number;
  totalCombinedTop80SkusSharePct?: number;
  totalCombinedMultipickSavedHours?: number;
  totalCombinedMultipickSavingsPct?: number;
  ruseTopProducts?: { ean: string; units: number; sharePct: number }[];
  svjTopProducts?: { ean: string; units: number; sharePct: number }[];
}
