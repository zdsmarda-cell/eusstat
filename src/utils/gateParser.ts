import {
  GateAnalyticsReport,
  GateMonthlyBreakdown,
  GateCountryStat,
  GateAbcSummary,
  GateSkuAbcItem,
  GateSvjBenchmarkRates,
  GateVolumetricSummary,
  GateVolumetricClassStat,
  ItemBracket,
  MovementRecord,
  BracketStat,
} from '../types.js';

const COUNTRY_NAMES: Record<string, { cs: string; en: string }> = {
  SK: { cs: 'Slovensko (SK)', en: 'Slovakia (SK)' },
  CZ: { cs: 'Česká republika (CZ)', en: 'Czechia (CZ)' },
  HU: { cs: 'Maďarsko (HU)', en: 'Hungary (HU)' },
  RO: { cs: 'Rumunsko (RO)', en: 'Romania (RO)' },
  PL: { cs: 'Polsko (PL)', en: 'Poland (PL)' },
  HR: { cs: 'Chorvatsko (HR)', en: 'Croatia (HR)' },
  SI: { cs: 'Slovinsko (SI)', en: 'Slovenia (SI)' },
  BG: { cs: 'Bulharsko (BG)', en: 'Bulgaria (BG)' },
  AT: { cs: 'Rakousko (AT)', en: 'Austria (AT)' },
  DE: { cs: 'Německo (DE)', en: 'Germany (DE)' },
  IT: { cs: 'Itálie (IT)', en: 'Italy (IT)' },
  GR: { cs: 'Řecko (GR)', en: 'Greece (GR)' },
};

const MONTH_NAMES_CS = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec',
];

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getMonthLabels(ym: string): { cs: string; en: string } {
  const parts = ym.split('-');
  if (parts.length !== 2) return { cs: ym, en: ym };
  const year = parts[0];
  const mIdx = parseInt(parts[1], 10) - 1;
  if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return { cs: ym, en: ym };
  return {
    cs: `${MONTH_NAMES_CS[mIdx]} ${year}`,
    en: `${MONTH_NAMES_EN[mIdx]} ${year}`,
  };
}

export function getDefaultSvjBenchmarkRates(svjBracketStats?: BracketStat[]): GateSvjBenchmarkRates {
  const defaultPick: Record<ItemBracket, number> = {
    '1': 31.5,
    '2': 27.8,
    '3': 25.4,
    '4': 23.6,
    '5': 22.1,
    '6+': 19.8,
  };
  const defaultSort: Record<ItemBracket, number> = {
    '1': 0, // 1-kusové v SVJ standardně míjí sorting
    '2': 13.6,
    '3': 13.4,
    '4': 13.2,
    '5': 13.0,
    '6+': 12.6,
  };
  const defaultPack: Record<ItemBracket, number> = {
    '1': 16.5,
    '2': 15.2,
    '3': 14.4,
    '4': 13.8,
    '5': 13.2,
    '6+': 12.5,
  };

  if (svjBracketStats && svjBracketStats.length > 0) {
    const allStat = svjBracketStats.find(b => b.bracket === 'all');
    const fallbackSort = allStat?.medianSortPerItemSec || allStat?.avgSortPerItemSec || 13.5;

    for (const b of ['1', '2', '3', '4', '5', '6+'] as ItemBracket[]) {
      const found = svjBracketStats.find(s => s.bracket === b);
      if (found && found.shipmentCount > 0) {
        if (found.medianPickPerItemSec > 0) defaultPick[b] = found.medianPickPerItemSec;
        else if (found.avgPickPerItemSec > 0) defaultPick[b] = found.avgPickPerItemSec;

        if (b === '1') {
          defaultSort[b] = 0;
        } else if (found.medianSortPerItemSec && found.medianSortPerItemSec > 0) {
          defaultSort[b] = found.medianSortPerItemSec;
        } else if (found.avgSortPerItemSec && found.avgSortPerItemSec > 0) {
          defaultSort[b] = found.avgSortPerItemSec;
        } else {
          defaultSort[b] = fallbackSort;
        }

        if (found.medianPackPerItemSec > 0) defaultPack[b] = found.medianPackPerItemSec;
        else if (found.avgPackPerItemSec > 0) defaultPack[b] = found.avgPackPerItemSec;
      }
    }

    return {
      source: 'svj_db',
      useMedian: true,
      bypassSingleItemSort: true,
      monthlyFteHoursNorm: 160,
      palletPickSecPerUnit: defaultPick['6+'] || 19.8,
      replenishTriggerPct: 30,
      pickSecByBracket: defaultPick,
      sortSecByBracket: defaultSort,
      packSecByBracket: defaultPack,
    };
  }

  return {
    source: 'svj_default',
    useMedian: true,
    bypassSingleItemSort: true,
    monthlyFteHoursNorm: 160,
    palletPickSecPerUnit: defaultPick['6+'] || 19.8,
    replenishTriggerPct: 30,
    pickSecByBracket: defaultPick,
    sortSecByBracket: defaultSort,
    packSecByBracket: defaultPack,
  };
}

export interface ReplenishFteOptions {
  coverageMonthsTarget?: number;
  replenishTriggerPct?: number;
  palletPickSecPerUnit?: number;
  activeSkusCount?: number;
  avgMonthlyUnitsTotal?: number;
  includeReplenishInTotal?: boolean;
}

export function computeMonthlyFteFromBrackets(
  brackets: GateMonthlyBreakdown['brackets'],
  rates: GateSvjBenchmarkRates,
  replenishOpts?: ReplenishFteOptions
): GateMonthlyBreakdown['fte'] {
  const normHours = Math.max(40, rates.monthlyFteHoursNorm || 160);
  let pickSec = 0;
  let sortSec = 0;
  let packSec = 0;
  let monthUnits = 0;

  for (const b of ['1', '2', '3', '4', '5', '6+'] as ItemBracket[]) {
    const units = brackets[b]?.units || 0;
    if (units <= 0) continue;
    monthUnits += units;
    const pRate = rates.pickSecByBracket[b] ?? 25;
    const sRate = (b === '1' && rates.bypassSingleItemSort) ? 0 : (rates.sortSecByBracket[b] ?? 13.5);
    const pkRate = rates.packSecByBracket[b] ?? 15;

    pickSec += units * pRate;
    sortSec += units * sRate;
    packSec += units * pkRate;
  }

  // Průběžné doskladňování: vždy když 3měsíční zásoba klesne pod 30 % (triggerPct),
  // doskladní se zpět na 100 % (dávka = 70 % z 3M zásoby = 2,1 průměrného měsíce výdeje).
  // Čas doskladnění se počítá jako z paletového pickingu (výchozí dle SVJ 6+ / paletového pickingu).
  const coverageMonths = Math.max(1, replenishOpts?.coverageMonthsTarget ?? 3);
  const triggerPct = Math.min(90, Math.max(5, replenishOpts?.replenishTriggerPct ?? rates.replenishTriggerPct ?? 30));
  const batchFraction = Math.max(0.1, (100 - triggerPct) / 100); // 0.70 při 30% prahu
  const batchMonthsEquivalent = coverageMonths * batchFraction; // 3 * 0.70 = 2.1 průměrného měsíce na 1 cyklus doskladnění
  const palletPickSecRate = Math.max(
    0,
    replenishOpts?.palletPickSecPerUnit ?? rates.palletPickSecPerUnit ?? rates.pickSecByBracket['6+'] ?? 19.8
  );

  const replenishUnits = monthUnits;
  const avgMonthUnits = replenishOpts?.avgMonthlyUnitsTotal && replenishOpts.avgMonthlyUnitsTotal > 0
    ? replenishOpts.avgMonthlyUnitsTotal
    : monthUnits;
  const activeSkus = replenishOpts?.activeSkusCount && replenishOpts.activeSkusCount > 0
    ? replenishOpts.activeSkusCount
    : 10000;
  const seasonFactor = avgMonthUnits > 0 ? monthUnits / avgMonthUnits : 1;
  const replenishCycles = Math.max(
    0,
    Math.round((activeSkus / Math.max(0.1, batchMonthsEquivalent)) * seasonFactor)
  );

  const replenishSec = replenishUnits * palletPickSecRate;
  const replenishHours = Number((replenishSec / 3600).toFixed(1));
  const replenishFte = Number((replenishHours / normHours).toFixed(2));

  const pickHours = Number((pickSec / 3600).toFixed(1));
  const sortHours = Number((sortSec / 3600).toFixed(1));
  const packHours = Number((packSec / 3600).toFixed(1));
  const baseTotalHours = Number((pickHours + sortHours + packHours).toFixed(1));
  const totalHoursWithReplenish = Number((baseTotalHours + replenishHours).toFixed(1));

  const pickFte = Number((pickHours / normHours).toFixed(2));
  const sortFte = Number((sortHours / normHours).toFixed(2));
  const packFte = Number((packHours / normHours).toFixed(2));
  const baseTotalFte = Number((pickFte + sortFte + packFte).toFixed(2));
  const totalFteWithReplenish = Number((baseTotalFte + replenishFte).toFixed(2));

  const includeReplenish = replenishOpts?.includeReplenishInTotal !== false;

  return {
    pickHours,
    sortHours,
    packHours,
    replenishHours,
    totalHours: includeReplenish ? totalHoursWithReplenish : baseTotalHours,
    totalHoursWithReplenish,
    pickFte,
    sortFte,
    packFte,
    replenishFte,
    totalFte: includeReplenish ? totalFteWithReplenish : baseTotalFte,
    totalFteWithReplenish,
    replenishUnits,
    replenishCycles,
  };
}

/**
 * Rychlé parsování datumu z CSV skladu Gate:
 * Podporuje formáty:
 * - "27.08.2025 18:28" / "01.09.2025" / "1.9.2025 7:00"
 * - "2025-08-27 18:28:00" / "2025-09-01"
 */
function parseGateMonth(raw: string): string | null {
  if (!raw) return null;
  const s = raw.replace(/^\uFEFF/, '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!s || s.startsWith('#')) return null;

  // ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const mNum = parseInt(isoMatch[2], 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${y}-${String(mNum).padStart(2, '0')}`;
    }
  }

  // DD.MM.YYYY, D.M.YYYY, DD-MM-YYYY
  const dotMatch = s.match(/^(\d{1,2})\s*[.-]\s*(\d{1,2})\s*[.-]\s*(\d{4})/);
  if (dotMatch) {
    const mNum = parseInt(dotMatch[2], 10);
    const y = dotMatch[3];
    if (mNum >= 1 && mNum <= 12) {
      return `${y}-${String(mNum).padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const y = slashMatch[3];
    const mNum = p2 <= 12 ? p2 : p1;
    if (mNum >= 1 && mNum <= 12) {
      return `${y}-${String(mNum).padStart(2, '0')}`;
    }
  }

  return null;
}

function detectDelimiter(headerLine: string): string {
  const semi = (headerLine.match(/;/g) || []).length;
  const tab = (headerLine.match(/\t/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  if (tab >= semi && tab >= comma && tab > 0) return '\t';
  if (semi >= comma && semi > 0) return ';';
  return ',';
}

function splitCsvLineFast(line: string, delimiter: string): string[] {
  if (!line.includes('"')) {
    return line.split(delimiter);
  }
  const res: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      res.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  res.push(cur);
  return res;
}

function extractNumericOrderId(orderId: string): number {
  // Např. "O0101945" -> 101945
  let n = 0;
  let foundDigit = false;
  for (let i = 0; i < orderId.length; i++) {
    const code = orderId.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      foundDigit = true;
      n = n * 10 + (code - 48);
      if (n > 20_000_000) return -1;
    } else if (foundDigit) {
      // Pokud po číslicích následuje písmeno, raději použijeme string Map
      return -1;
    }
  }
  return foundDigit && n >= 0 ? n : -1;
}

export type GateFileRole = 'orders' | 'items' | 'stock';

export async function classifyGateFiles(files: File[]): Promise<{
  ordersFile: File | null;
  itemsFile: File | null;
  stockFile: File | null;
}> {
  let ordersFile: File | null = null;
  let itemsFile: File | null = null;
  let stockFile: File | null = null;

  for (const f of files) {
    const headBlob = f.slice(0, 4096);
    const headText = (await headBlob.text()).toLowerCase();
    const firstLine = headText.split(/\r?\n/)[0] || '';

    if (
      firstLine.includes('country') ||
      firstLine.includes('ship_date') ||
      firstLine.includes('packed_at') ||
      firstLine.includes('order_created_at') ||
      firstLine.includes('items_qty') ||
      firstLine.includes('delivery_status')
    ) {
      ordersFile = f;
    } else if (
      firstLine.includes('qty_on_hand') ||
      firstLine.includes('unit_volume') ||
      firstLine.includes('unit_weight') ||
      firstLine.includes('stock') ||
      firstLine.includes('zasob') ||
      firstLine.includes('on_hand') ||
      firstLine.includes('inventory') ||
      (!firstLine.includes('order_id') && firstLine.includes('sku'))
    ) {
      stockFile = f;
    } else if (
      firstLine.includes('order_id') &&
      (firstLine.includes('sku') || firstLine.includes('article_code') || firstLine.includes('qty'))
    ) {
      itemsFile = f;
    }
  }

  // Fallback podle pořadí souborů, pokud má hlavička nestandardní názvy
  if (!ordersFile && !itemsFile && files.length >= 2) {
    ordersFile = files[0];
    itemsFile = files[1];
    if (files.length >= 3 && !stockFile) stockFile = files[2];
  } else if (!ordersFile && files.length === 1 && !itemsFile && !stockFile) {
    ordersFile = files[0];
  }

  return { ordersFile, itemsFile, stockFile };
}

/**
 * Streamované čtení souboru po 6 MB blocích – bezpečné i pro 500+ MB CSV soubory v prohlížeči
 */
async function streamFileLines(
  file: File,
  onLine: (line: string, lineIndex: number) => void,
  onProgress?: (bytesRead: number, totalBytes: number) => void
): Promise<void> {
  const CHUNK_SIZE = 6 * 1024 * 1024; // 6 MB
  const totalBytes = file.size;
  let offset = 0;
  let leftover = '';
  let lineIndex = 0;
  const decoder = new TextDecoder('utf-8');

  while (offset < totalBytes) {
    const end = Math.min(offset + CHUNK_SIZE, totalBytes);
    const buffer = await file.slice(offset, end).arrayBuffer();
    const chunkText = decoder.decode(buffer, { stream: end < totalBytes });
    const combined = leftover + chunkText;

    let startIdx = 0;
    const len = combined.length;
    for (let i = 0; i < len; i++) {
      const ch = combined.charCodeAt(i);
      if (ch === 10) { // \n
        let line = combined.substring(startIdx, i);
        if (line.length > 0 && line.charCodeAt(line.length - 1) === 13) {
          line = line.substring(0, line.length - 1);
        }
        if (line.length > 0) {
          onLine(line, lineIndex++);
        }
        startIdx = i + 1;
      }
    }

    leftover = combined.substring(startIdx);
    offset = end;

    if (onProgress) {
      onProgress(offset, totalBytes);
    }
    // Umožní překreslení UI progress baru
    await new Promise(r => setTimeout(r, 0));
  }

  if (leftover.trim().length > 0) {
    onLine(leftover.trim(), lineIndex++);
  }
}

export interface GateStreamParseProgress {
  phase: string;
  percent: number;
  bytesProcessed: number;
  totalBytes: number;
  messageCs?: string;
  messageEn?: string;
}

export type GateParseProgress = GateStreamParseProgress;

export interface GateParseResult {
  report: GateAnalyticsReport;
  sampleRecords: MovementRecord[];
  sampleMovements: MovementRecord[];
  ordersFileRows: number;
  itemsFileRows: number;
  stockFileRows: number;
  errors: string[];
}

export async function parseGateCsvFilesStreaming(
  files: File[],
  svjBracketStats?: BracketStat[],
  onProgress?: (prog: GateStreamParseProgress) => void
): Promise<GateParseResult> {
  const errors: string[] = [];
  const { ordersFile, itemsFile, stockFile } = await classifyGateFiles(files);
  const totalBytesAll =
    (ordersFile?.size || 0) + (itemsFile?.size || 0) + (stockFile?.size || 0);

  let ordersFileRows = 0;
  let itemsFileRows = 0;
  let stockFileRows = 0;

  // Kompaktní číselník měsíců (index 1..60 -> 'YYYY-MM')
  const monthIdxToStr: string[] = ['unknown'];
  const monthStrToIdx = new Map<string, number>();
  const getMonthIdx = (ym: string): number => {
    let idx = monthStrToIdx.get(ym);
    if (idx === undefined) {
      idx = monthIdxToStr.length;
      monthIdxToStr.push(ym);
      monthStrToIdx.set(ym, idx);
    }
    return idx;
  };

  // Paměťově úsporné uložení order_id -> monthIdx (pro spárování s order_items.csv)
  // Pro číselné ID typu O0000001 až O20000000 používáme stránkované Uint8Array (1 stránka = 1M ID = 1 MB RAM)
  const orderMonthPages: Uint8Array[] = [];
  const orderItemsCountPages: Uint16Array[] = [];
  const orderStringMonthMap = new Map<string, number>();

  const setOrderMonthAndQty = (orderId: string, mIdx: number, itemsQty: number) => {
    const numId = extractNumericOrderId(orderId);
    if (numId >= 0) {
      const pageIdx = Math.floor(numId / 1_000_000);
      const slot = numId % 1_000_000;
      if (!orderMonthPages[pageIdx]) {
        orderMonthPages[pageIdx] = new Uint8Array(1_000_000);
      }
      orderMonthPages[pageIdx][slot] = mIdx;
      if (itemsQty <= 0) {
        if (!orderItemsCountPages[pageIdx]) {
          orderItemsCountPages[pageIdx] = new Uint16Array(1_000_000);
        }
      }
    } else if (orderStringMonthMap.size < 1_500_000) {
      orderStringMonthMap.set(orderId, mIdx);
    }
  };

  const getOrderMonthIdx = (orderId: string): number => {
    const numId = extractNumericOrderId(orderId);
    if (numId >= 0) {
      const pageIdx = Math.floor(numId / 1_000_000);
      const slot = numId % 1_000_000;
      return orderMonthPages[pageIdx]?.[slot] || 0;
    }
    return orderStringMonthMap.get(orderId) || 0;
  };

  // Měsíční agregátory objednávek
  interface MonthAgg {
    ym: string;
    totalOrders: number;
    totalUnits: number;
    brackets: Record<'1' | '2' | '3' | '4' | '5' | '6+' | '5+', { orders: number; units: number }>;
    countries: Map<string, { orders: number; units: number }>;
    skuUnits: Map<string, number>;
    articleSet: Set<string>;
  }

  const monthAggMap = new Map<string, MonthAgg>();
  const ensureMonthAgg = (ym: string): MonthAgg => {
    let m = monthAggMap.get(ym);
    if (!m) {
      m = {
        ym,
        totalOrders: 0,
        totalUnits: 0,
        brackets: {
          '1': { orders: 0, units: 0 },
          '2': { orders: 0, units: 0 },
          '3': { orders: 0, units: 0 },
          '4': { orders: 0, units: 0 },
          '5': { orders: 0, units: 0 },
          '6+': { orders: 0, units: 0 },
          '5+': { orders: 0, units: 0 },
        },
        countries: new Map(),
        skuUnits: new Map(),
        articleSet: new Set(),
      };
      monthAggMap.set(ym, m);
    }
    return m;
  };

  // Globální agregace zemí
  interface CountryAgg {
    country: string;
    orders: number;
    units: number;
    weightSum: number;
    weightCount: number;
    codCount: number;
    pudoCount: number;
    bagCount: number;
  }
  const countryAggMap = new Map<string, CountryAgg>();

  const sampleMovements: MovementRecord[] = [];
  let ordersWithExplicitQty = 0;

  // =========================================================================
  // FÁZE 1: STREAMOVANÉ ČTENÍ SOUBORU OBJEDNÁVEK (orders.csv)
  // =========================================================================
  if (ordersFile) {
    let delimiter = ',';
    let idxOrderId = 0;
    let idxCreated = 1;
    let idxShipDate = 3;
    let idxPackedAt = 4;
    let idxCountry = 8;
    let idxDeliveryMethod = 11;
    let idxWeight = 12;
    let idxPackageType = 13;
    let idxItemsQty = 14;
    let idxCod = 15;

    await streamFileLines(
      ordersFile,
      (line, lineIdx) => {
        if (lineIdx === 0) {
          delimiter = detectDelimiter(line);
          const cols = splitCsvLineFast(line, delimiter).map(c =>
            c.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/^"|"$/g, '')
          );
          cols.forEach((col, i) => {
            if (col === 'order_id' || col === 'id') idxOrderId = i;
            else if (col.includes('order_created')) idxCreated = i;
            else if (col.includes('ship_date')) idxShipDate = i;
            else if (col.includes('packed_at')) idxPackedAt = i;
            else if (col === 'country' || col.includes('zeme')) idxCountry = i;
            else if (col.includes('delivery_met')) idxDeliveryMethod = i;
            else if (col.includes('weight')) idxWeight = i;
            else if (col.includes('package_type')) idxPackageType = i;
            else if (col.includes('items_qty') || col === 'qty' || col === 'pocet_produktu') idxItemsQty = i;
            else if (col.includes('cod')) idxCod = i;
          });
          return;
        }

        const cols = splitCsvLineFast(line, delimiter);
        if (cols.length < 3) return;

        const orderId = (cols[idxOrderId] || '').trim().replace(/^"|"$/g, '');
        if (!orderId) return;

        ordersFileRows += 1;

        // Zjistíme měsíc (prioritně packed_at / ship_date / order_created_at)
        const ym =
          parseGateMonth(cols[idxPackedAt] || '') ||
          parseGateMonth(cols[idxShipDate] || '') ||
          parseGateMonth(cols[idxCreated] || '') ||
          '2025-09';

        const countryRaw = (cols[idxCountry] || 'SK').trim().toUpperCase().replace(/^"|"$/g, '');
        const country = countryRaw.length >= 2 && countryRaw.length <= 3 ? countryRaw : 'SK';

        const rawQty = parseInt((cols[idxItemsQty] || '0').trim().replace(/^"|"$/g, ''), 10);
        const itemsQty = !isNaN(rawQty) && rawQty > 0 ? rawQty : 0;

        const mIdx = getMonthIdx(ym);
        setOrderMonthAndQty(orderId, mIdx, itemsQty);

        const delivMethod = (cols[idxDeliveryMethod] || '').trim().toUpperCase();
        const pkgType = (cols[idxPackageType] || '').trim().toUpperCase();
        const codFlag = (cols[idxCod] || '0').trim().replace(/^"|"$/g, '');
        const rawWeight = parseFloat((cols[idxWeight] || '').replace(',', '.').replace(/^"|"$/g, ''));

        // Agregace země
        let cAgg = countryAggMap.get(country);
        if (!cAgg) {
          cAgg = {
            country,
            orders: 0,
            units: 0,
            weightSum: 0,
            weightCount: 0,
            codCount: 0,
            pudoCount: 0,
            bagCount: 0,
          };
          countryAggMap.set(country, cAgg);
        }
        cAgg.orders += 1;
        cAgg.units += itemsQty;
        if (!isNaN(rawWeight) && rawWeight > 0 && rawWeight < 150) {
          cAgg.weightSum += rawWeight;
          cAgg.weightCount += 1;
        }
        if (codFlag === '1' || codFlag.toLowerCase() === 'true' || codFlag.toLowerCase() === 'yes') {
          cAgg.codCount += 1;
        }
        if (delivMethod.includes('PUDO') || delivMethod.includes('BOX') || delivMethod.includes('POINT')) {
          cAgg.pudoCount += 1;
        }
        if (pkgType.includes('BAG') || pkgType.includes('ENV')) {
          cAgg.bagCount += 1;
        }

        // Pokud má objednávka rovnou vyplněné items_qty v orders.csv, zařadíme ji do měsíční struktury
        if (itemsQty > 0) {
          ordersWithExplicitQty += 1;
          const mAgg = ensureMonthAgg(ym);
          mAgg.totalOrders += 1;
          mAgg.totalUnits += itemsQty;

          const cMonth = mAgg.countries.get(country) || { orders: 0, units: 0 };
          cMonth.orders += 1;
          cMonth.units += itemsQty;
          mAgg.countries.set(country, cMonth);

          if (itemsQty === 1) {
            mAgg.brackets['1'].orders += 1;
            mAgg.brackets['1'].units += 1;
          } else if (itemsQty === 2) {
            mAgg.brackets['2'].orders += 1;
            mAgg.brackets['2'].units += 2;
          } else if (itemsQty === 3) {
            mAgg.brackets['3'].orders += 1;
            mAgg.brackets['3'].units += 3;
          } else if (itemsQty === 4) {
            mAgg.brackets['4'].orders += 1;
            mAgg.brackets['4'].units += 4;
          } else if (itemsQty === 5) {
            mAgg.brackets['5'].orders += 1;
            mAgg.brackets['5'].units += 5;
            mAgg.brackets['5+'].orders += 1;
            mAgg.brackets['5+'].units += 5;
          } else {
            mAgg.brackets['6+'].orders += 1;
            mAgg.brackets['6+'].units += itemsQty;
            mAgg.brackets['5+'].orders += 1;
            mAgg.brackets['5+'].units += itemsQty;
          }

          if (sampleMovements.length < 150) {
            const br: ItemBracket = itemsQty === 1 ? '1' : itemsQty === 2 ? '2' : itemsQty === 3 ? '3' : itemsQty === 4 ? '4' : itemsQty === 5 ? '5' : '6+';
            sampleMovements.push({
              warehouse: 'gate',
              sberny_box: `GATE-${country}`,
              obsah_objednavek: orderId,
              pocet_produktu: itemsQty,
              ean_produktu: 'GATE-SKU',
              pocet_ks: itemsQty,
              zacatek_pickovani: `${ym}-15T08:00:00.000Z`,
              konec_pickovani: `${ym}-15T08:01:00.000Z`,
              zacatek_baleni: `${ym}-15T09:00:00.000Z`,
              konec_baleni: `${ym}-15T09:01:00.000Z`,
              pick_duration_s: 0,
              pack_duration_s: 0,
              pick_per_item_s: 0,
              pack_per_item_s: 0,
              total_per_item_s: 0,
              bracket: br,
            });
          }
        }
      },
      (bytesRead, totalBytes) => {
        if (onProgress) {
          const pct = Math.min(45, Math.round((bytesRead / Math.max(1, totalBytes)) * 45));
          const msgCs = `Zpracovávám soubor objednávek (${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`;
          onProgress({
            phase: msgCs,
            percent: pct,
            bytesProcessed: bytesRead,
            totalBytes: totalBytesAll || totalBytes,
            messageCs: msgCs,
            messageEn: `Streaming orders file (${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`,
          });
        }
      }
    );
  }

  // =========================================================================
  // FÁZE 2: STREAMOVANÉ ČTENÍ OBSAHU OBJEDNÁVEK (order_items.csv)
  // =========================================================================
  interface SkuGlobalAgg {
    sku: string;
    articleCode: string;
    category: string;
    annualUnits: number;
    ordersCount: number;
    monthsSet: Set<string>;
    stockUnits: number;
    unitVolumeM3: number;
    unitWeightKg: number;
  }

  const DEFAULT_UNIT_VOLUME_M3 = 0.00385; // ~3.85 litru (typický objem kusu dle vzorku 0.003388 - 0.004657 m3)
  const DEFAULT_UNIT_WEIGHT_KG = 0.72;    // ~0.72 kg (typická váha kusu dle vzorku 0.59 - 0.97 kg)

  const skuGlobalMap = new Map<string, SkuGlobalAgg>();
  const globalArticleSet = new Set<string>();

  // Pokud orders.csv nemělo vyplněné items_qty (nebo nebyl nahrán ordersFile),
  // spočítáme velikost objednávek ze součtu qty v order_items.csv
  const needOrderSizeFromItems = ordersWithExplicitQty === 0;
  const fallbackOrderUnitsMap = new Map<string, { ym: string; units: number }>();

  const sortedAvailableMonths = Array.from(monthAggMap.keys()).sort();
  const defaultFallbackMonth = sortedAvailableMonths[Math.floor(sortedAvailableMonths.length / 2)] || '2025-09';
  const ordersBytes = ordersFile?.size || 0;

  if (itemsFile) {
    let delimiter = ',';
    let idxOrderId = 0;
    let idxSku = 1;
    let idxArticle = 2;
    let idxQty = 3;

    await streamFileLines(
      itemsFile,
      (line, lineIdx) => {
        if (lineIdx === 0) {
          delimiter = detectDelimiter(line);
          const cols = splitCsvLineFast(line, delimiter).map(c =>
            c.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/^"|"$/g, '')
          );
          // Hledáme pouze v prvních 6 sloupcích, abychom ignorovali kontingenční tabulky napravo
          for (let i = 0; i < Math.min(cols.length, 6); i++) {
            const col = cols[i];
            if (col === 'order_id' || col === 'id') idxOrderId = i;
            else if (col === 'sku' || col.includes('ean')) idxSku = i;
            else if (col.includes('article')) idxArticle = i;
            else if (col === 'qty' || col.includes('quantity') || col.includes('pocet')) idxQty = i;
          }
          return;
        }

        const cols = splitCsvLineFast(line, delimiter);
        if (cols.length < 2) return;

        const orderId = (cols[idxOrderId] || '').trim().replace(/^"|"$/g, '');
        const sku = (cols[idxSku] || '').trim().replace(/^"|"$/g, '');
        if (!sku) return;

        itemsFileRows += 1;

        const articleCode = (cols[idxArticle] || sku.split('/')[0] || sku).trim().replace(/^"|"$/g, '');
        const rawQty = parseInt((cols[idxQty] || '0').trim().replace(/^"|"$/g, ''), 10);
        const qty = !isNaN(rawQty) && rawQty >= 0 ? rawQty : 1;

        globalArticleSet.add(articleCode);

        // Zjistit měsíc z order_id
        let mIdx = orderId ? getOrderMonthIdx(orderId) : 0;
        let ym = mIdx > 0 ? monthIdxToStr[mIdx] : '';

        if (!ym) {
          // Pokud order_id nebyl nalezen (nebo jde o samostatný soubor), deterministicky přiřadíme existující měsíc
          if (sortedAvailableMonths.length > 0) {
            const hash = orderId.length > 0 ? orderId.charCodeAt(orderId.length - 1) : lineIdx;
            ym = sortedAvailableMonths[hash % sortedAvailableMonths.length];
          } else {
            ym = defaultFallbackMonth;
          }
        }

        // Globální SKU agregace
        let sAgg = skuGlobalMap.get(sku);
        if (!sAgg) {
          sAgg = {
            sku,
            articleCode,
            category: '',
            annualUnits: 0,
            ordersCount: 0,
            monthsSet: new Set(),
            stockUnits: -1, // -1 = zatím bez explicitního stock souboru
            unitVolumeM3: 0,
            unitWeightKg: 0,
          };
          skuGlobalMap.set(sku, sAgg);
        }
        sAgg.annualUnits += qty;
        if (qty > 0) {
          sAgg.ordersCount += 1;
          sAgg.monthsSet.add(ym);

          // Měsíční SKU agregace pro 80/20 Pareto v daném měsíci
          const mAgg = ensureMonthAgg(ym);
          mAgg.skuUnits.set(sku, (mAgg.skuUnits.get(sku) || 0) + qty);
          mAgg.articleSet.add(articleCode);

          if (needOrderSizeFromItems && orderId && fallbackOrderUnitsMap.size < 1_000_000) {
            const cur = fallbackOrderUnitsMap.get(orderId);
            if (!cur) {
              fallbackOrderUnitsMap.set(orderId, { ym, units: qty });
            } else {
              cur.units += qty;
            }
          }
        }
      },
      (bytesRead, totalBytes) => {
        if (onProgress) {
          const pct = 45 + Math.min(40, Math.round((bytesRead / Math.max(1, totalBytes)) * 40));
          const msgCs = `Zpracovávám položky objednávek (${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`;
          onProgress({
            phase: msgCs,
            percent: pct,
            bytesProcessed: ordersBytes + bytesRead,
            totalBytes: totalBytesAll || (ordersBytes + totalBytes),
            messageCs: msgCs,
            messageEn: `Streaming order items (${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`,
          });
        }
      }
    );
  }

  // Pokud orders.csv nemělo items_qty, doplníme velikostní kategorie z fallbackOrderUnitsMap
  if (needOrderSizeFromItems && fallbackOrderUnitsMap.size > 0) {
    for (const [, ord] of fallbackOrderUnitsMap.entries()) {
      const mAgg = ensureMonthAgg(ord.ym);
      const q = Math.max(1, ord.units);
      mAgg.totalOrders += 1;
      mAgg.totalUnits += q;
      if (q === 1) { mAgg.brackets['1'].orders += 1; mAgg.brackets['1'].units += 1; }
      else if (q === 2) { mAgg.brackets['2'].orders += 1; mAgg.brackets['2'].units += 2; }
      else if (q === 3) { mAgg.brackets['3'].orders += 1; mAgg.brackets['3'].units += 3; }
      else if (q === 4) { mAgg.brackets['4'].orders += 1; mAgg.brackets['4'].units += 4; }
      else if (q === 5) {
        mAgg.brackets['5'].orders += 1; mAgg.brackets['5'].units += 5;
        mAgg.brackets['5+'].orders += 1; mAgg.brackets['5+'].units += 5;
      } else {
        mAgg.brackets['6+'].orders += 1; mAgg.brackets['6+'].units += q;
        mAgg.brackets['5+'].orders += 1; mAgg.brackets['5+'].units += q;
      }
    }
  }

  // =========================================================================
  // FÁZE 3: SOUBOR AKTUÁLNÍ SKLADOVÉ ZÁSOBY A VOLUMETRIE (stock.csv)
  // Struktura: sku, article_code, category, qty_on_hand, unit_volume, unit_weight_kg
  // =========================================================================
  let hasExplicitStockFile = false;
  let hasExplicitVolumeData = false;
  let explicitVolumeSum = 0;
  let explicitVolumeCount = 0;
  let explicitWeightSum = 0;
  let explicitWeightCount = 0;
  const itemsBytes = itemsFile?.size || 0;

  if (stockFile) {
    hasExplicitStockFile = true;
    let delimiter = ',';
    let idxSku = 0;
    let idxArticle = 1;
    let idxCategory = 2;
    let idxStock = 3;
    let idxVolume = 4;
    let idxWeight = 5;

    await streamFileLines(
      stockFile,
      (line, lineIdx) => {
        if (lineIdx === 0) {
          delimiter = detectDelimiter(line);
          const cols = splitCsvLineFast(line, delimiter).map(c =>
            c.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/^"|"$/g, '')
          );
          // Resetujeme volitelné indexy a namapujeme přesně podle názvů sloupců
          idxArticle = -1;
          idxCategory = -1;
          idxVolume = -1;
          idxWeight = -1;
          idxStock = 1;
          for (let i = 0; i < Math.min(cols.length, 10); i++) {
            const col = cols[i];
            if (col === 'sku' || col.includes('ean')) idxSku = i;
            else if (col.includes('article')) idxArticle = i;
            else if (col === 'category' || col.includes('kateg')) idxCategory = i;
            else if (
              col.includes('qty_on_hand') ||
              col.includes('on_hand') ||
              col.includes('stock') ||
              col === 'qty' ||
              col.includes('zasob') ||
              col.includes('ks')
            ) {
              idxStock = i;
            } else if (col.includes('volume') || col.includes('objem') || col.includes('m3')) {
              idxVolume = i;
            } else if (col.includes('weight') || col.includes('vaha') || col.includes('hmotnost') || col.includes('kg')) {
              idxWeight = i;
            }
          }
          return;
        }

        const cols = splitCsvLineFast(line, delimiter);
        if (cols.length < 2) return;
        const sku = (cols[idxSku] || '').trim().replace(/^"|"$/g, '');
        if (!sku) return;
        stockFileRows += 1;

        const articleCode =
          idxArticle >= 0 && cols[idxArticle]
            ? cols[idxArticle].trim().replace(/^"|"$/g, '')
            : sku.split('/')[0] || sku;
        const category =
          idxCategory >= 0 && cols[idxCategory]
            ? cols[idxCategory].trim().replace(/^"|"$/g, '')
            : '';

        const rawStockStr = (cols[idxStock] || '0').trim().replace(/^"|"$/g, '').replace(/\s+/g, '');
        const parsedStock = parseInt(rawStockStr, 10);
        const stockQty = !isNaN(parsedStock) && parsedStock >= 0 ? parsedStock : 0;

        let unitVol = 0;
        if (idxVolume >= 0 && cols[idxVolume]) {
          const vStr = cols[idxVolume].trim().replace(/^"|"$/g, '').replace(',', '.');
          const vNum = parseFloat(vStr);
          if (!isNaN(vNum) && vNum > 0 && vNum < 5) {
            unitVol = vNum;
            hasExplicitVolumeData = true;
            explicitVolumeSum += vNum;
            explicitVolumeCount += 1;
          }
        }

        let unitW = 0;
        if (idxWeight >= 0 && cols[idxWeight]) {
          const wStr = cols[idxWeight].trim().replace(/^"|"$/g, '').replace(',', '.');
          // Ochrana proti zkorumpovanému datumu z Excelu (např. "01.Aug")
          if (!/[a-zA-Z]/.test(wStr)) {
            const wNum = parseFloat(wStr);
            if (!isNaN(wNum) && wNum > 0 && wNum < 100) {
              unitW = wNum;
              explicitWeightSum += wNum;
              explicitWeightCount += 1;
            }
          }
        }

        let sAgg = skuGlobalMap.get(sku);
        if (!sAgg) {
          sAgg = {
            sku,
            articleCode,
            category,
            annualUnits: 0,
            ordersCount: 0,
            monthsSet: new Set(),
            stockUnits: stockQty,
            unitVolumeM3: unitVol,
            unitWeightKg: unitW,
          };
          skuGlobalMap.set(sku, sAgg);
        } else {
          sAgg.stockUnits = (sAgg.stockUnits >= 0 ? sAgg.stockUnits : 0) + stockQty;
          if (articleCode && !sAgg.articleCode) sAgg.articleCode = articleCode;
          if (category && !sAgg.category) sAgg.category = category;
          if (unitVol > 0) sAgg.unitVolumeM3 = unitVol;
          if (unitW > 0) sAgg.unitWeightKg = unitW;
        }
      },
      (bytesRead, totalBytes) => {
        if (onProgress) {
          const pct = 85 + Math.min(10, Math.round((bytesRead / Math.max(1, totalBytes)) * 10));
          const msgCs = `Zpracovávám skladovou zásobu a volumetrii (${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`;
          onProgress({
            phase: msgCs,
            percent: pct,
            bytesProcessed: ordersBytes + itemsBytes + bytesRead,
            totalBytes: totalBytesAll || (ordersBytes + itemsBytes + totalBytes),
            messageCs: msgCs,
            messageEn: `Streaming stock & volumetry (${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`,
          });
        }
      }
    );
  }

  const avgUnitVolumeM3 = explicitVolumeCount > 0 ? explicitVolumeSum / explicitVolumeCount : DEFAULT_UNIT_VOLUME_M3;
  const avgUnitWeightKg = explicitWeightCount > 0 ? explicitWeightSum / explicitWeightCount : DEFAULT_UNIT_WEIGHT_KG;

  if (onProgress) {
    const msgCs = 'Počítám měsíční rozpady, 80/20 Pareto, ABC analýzu zásob, volumetrii boxů/palet a FTE model...';
    onProgress({
      phase: msgCs,
      percent: 96,
      bytesProcessed: totalBytesAll,
      totalBytes: totalBytesAll,
      messageCs: msgCs,
      messageEn: 'Computing monthly breakdowns, 80/20 Pareto, ABC inventory, box/pallet volumetry & FTE model...',
    });
  }

  // =========================================================================
  // SESTAVENÍ MĚSÍČNÍCH STATISTIK, PARETA A FTE DLE SVJ
  // =========================================================================
  const svjBenchmark = getDefaultSvjBenchmarkRates(svjBracketStats);
  const sortedMonths = Array.from(monthAggMap.keys()).sort();
  const monthsCount = Math.max(1, sortedMonths.length);

  const monthlyBreakdown: GateMonthlyBreakdown[] = [];
  let grandTotalOrders = 0;
  let grandTotalUnits = 0;

  for (const ym of sortedMonths) {
    const m = monthAggMap.get(ym)!;
    const labels = getMonthLabels(ym);
    const totOrd = m.totalOrders;
    const totUnits = m.totalUnits;
    grandTotalOrders += totOrd;
    grandTotalUnits += totUnits;

    // 80/20 Pareto pro tento měsíc
    const skuEntries = Array.from(m.skuUnits.entries()).sort((a, b) => b[1] - a[1]);
    const activeSkusCount = skuEntries.length;
    const activeArticlesCount = m.articleSet.size;
    const skuUnitsSum = skuEntries.reduce((s, e) => s + e[1], 0);
    const target80 = skuUnitsSum * 0.8;
    let cum = 0;
    let top80SkusCount = 0;
    for (const [, u] of skuEntries) {
      cum += u;
      top80SkusCount += 1;
      if (cum >= target80) break;
    }
    const top80SkusSharePct = activeSkusCount > 0 ? Number(((top80SkusCount / activeSkusCount) * 100).toFixed(1)) : 0;

    const makeBucket = (k: '1' | '2' | '3' | '4' | '5' | '6+' | '5+') => {
      const b = m.brackets[k];
      return {
        orders: b.orders,
        units: b.units,
        orderSharePct: totOrd > 0 ? Number(((b.orders / totOrd) * 100).toFixed(1)) : 0,
        unitSharePct: totUnits > 0 ? Number(((b.units / totUnits) * 100).toFixed(1)) : 0,
      };
    };

    const bracketsObj = {
      '1': makeBucket('1'),
      '2': makeBucket('2'),
      '3': makeBucket('3'),
      '4': makeBucket('4'),
      '5+': makeBucket('5+'),
      '5': makeBucket('5'),
      '6+': makeBucket('6+'),
    };

    const countryBreakdown: Record<string, { orders: number; units: number }> = {};
    for (const [cCode, cVal] of m.countries.entries()) {
      countryBreakdown[cCode] = cVal;
    }

    const fte = computeMonthlyFteFromBrackets(bracketsObj, svjBenchmark);

    monthlyBreakdown.push({
      month: ym,
      monthLabelCs: labels.cs,
      monthLabelEn: labels.en,
      totalOrders: totOrd,
      totalUnits: totUnits,
      avgUnitsPerOrder: totOrd > 0 ? Number((totUnits / totOrd).toFixed(2)) : 0,
      activeSkusCount,
      activeArticlesCount,
      top80SkusCount,
      top80SkusSharePct,
      top80Units: cum,
      remaining20SkusCount: Math.max(0, activeSkusCount - top80SkusCount),
      brackets: bracketsObj,
      countryBreakdown,
      fte,
    });
  }

  // =========================================================================
  // SESTAVENÍ ROZPADU CÍLOVÝCH ZEMÍ (country)
  // =========================================================================
  const countries: GateCountryStat[] = Array.from(countryAggMap.values())
    .sort((a, b) => b.orders - a.orders)
    .map(c => {
      const names = COUNTRY_NAMES[c.country] || { cs: c.country, en: c.country };
      return {
        country: c.country,
        countryNameCs: names.cs,
        countryNameEn: names.en,
        orders: c.orders,
        orderSharePct: grandTotalOrders > 0 ? Number(((c.orders / grandTotalOrders) * 100).toFixed(2)) : 0,
        units: c.units,
        unitSharePct: grandTotalUnits > 0 ? Number(((c.units / grandTotalUnits) * 100).toFixed(2)) : 0,
        avgUnitsPerOrder: c.orders > 0 ? Number((c.units / c.orders).toFixed(2)) : 0,
        avgWeightKg: c.weightCount > 0 ? Number((c.weightSum / c.weightCount).toFixed(2)) : 1.15,
        codSharePct: c.orders > 0 ? Number(((c.codCount / c.orders) * 100).toFixed(1)) : 0,
        pudoSharePct: c.orders > 0 ? Number(((c.pudoCount / c.orders) * 100).toFixed(1)) : 0,
        bagSharePct: c.orders > 0 ? Number(((c.bagCount / c.orders) * 100).toFixed(1)) : 0,
      };
    });

  // =========================================================================
  // SESTAVENÍ CELOROČNÍ ABC ANALÝZY, 3MĚSÍČNÍ ZÁSOBY, NADZÁSOBY, LEŽÁKŮ A VOLUMETRIE
  // =========================================================================
  const allSkuList = Array.from(skuGlobalMap.values()).sort((a, b) => b.annualUnits - a.annualUnits);
  const activeSkuList = allSkuList.filter(s => s.annualUnits > 0);
  // Pokud byl nahrán reálný stock.csv, některá neobrátková SKU mají qty_on_hand = 0 (prázdné katalogové karty).
  // Fyzický bezobrat (DEAD stock na paletách) jsou SKU s 0 výdejem a kladnou zásobou skladem (stockUnits > 0).
  const zeroMovementAll = allSkuList.filter(s => s.annualUnits === 0);
  const zeroStockCatalogSkusCount = hasExplicitStockFile
    ? zeroMovementAll.filter(s => s.stockUnits <= 0).length
    : 0;
  const explicitDeadSkus = hasExplicitStockFile
    ? zeroMovementAll.filter(s => s.stockUnits > 0)
    : zeroMovementAll;

  const totalAnnualIssuedUnits = activeSkuList.reduce((s, x) => s + x.annualUnits, 0) || grandTotalUnits;
  const targetA = totalAnnualIssuedUnits * 0.80;
  const targetB = totalAnnualIssuedUnits * 0.95;

  // Pokud uživatel nenahrál samostatný stock.csv, kalibrujeme celkovou skladovou zásobu
  // na zákazníkem uvedených 4 500 000 ks (4,5M ks zboží skladem).
  const DEFAULT_TOTAL_WAREHOUSE_STOCK = 4_500_000;

  if (!hasExplicitStockFile && explicitDeadSkus.length === 0 && activeSkuList.length > 0) {
    const simulatedDeadCount = Math.max(120, Math.round(activeSkuList.length * 0.14));
    // Rezervujeme cca 8 % z celkové 4.5M zásoby (360 000 ks) pro ležáky bez pohybu za rok
    const targetDeadUnitsTotal = Math.round(DEFAULT_TOTAL_WAREHOUSE_STOCK * 0.08);
    const baseDeadPerSku = Math.max(1, Math.floor(targetDeadUnitsTotal / simulatedDeadCount));
    let deadRemainder = Math.max(0, targetDeadUnitsTotal - baseDeadPerSku * simulatedDeadCount);

    for (let i = 1; i <= simulatedDeadCount; i++) {
      const extra = deadRemainder > 0 ? 1 : 0;
      if (deadRemainder > 0) deadRemainder -= 1;
      const deadStockQty = baseDeadPerSku + extra;
      explicitDeadSkus.push({
        sku: `DEAD-${String(500 + (i % 400)).padStart(3, '0')}-${String(i).padStart(4, '0')}/00`,
        articleCode: `DEAD-${String(500 + (i % 400)).padStart(3, '0')}-${String(i).padStart(4, '0')}`,
        category: 'PAN',
        annualUnits: 0,
        ordersCount: 0,
        monthsSet: new Set(),
        stockUnits: deadStockQty,
        unitVolumeM3: DEFAULT_UNIT_VOLUME_M3,
        unitWeightKg: DEFAULT_UNIT_WEIGHT_KG,
      });
    }
  }

  // Parametry boxu (60x40x22 cm = 0.0528 m3) a palety (120x80x180 cm = 1.728 m3)
  const BOX_GROSS_VOL_M3 = 0.60 * 0.40 * 0.22;     // 0.0528 m3 (52.8 litrů)
  const PALLET_GROSS_VOL_M3 = 1.20 * 0.80 * 1.80;  // 1.728 m3 (1 728 litrů)
  const defaultBoxMaxFillPct = 80;
  const defaultPalletMaxFillPct = 80;
  const boxUsableVolM3 = BOX_GROSS_VOL_M3 * (defaultBoxMaxFillPct / 100);       // 0.04224 m3
  const palletUsableVolM3 = PALLET_GROSS_VOL_M3 * (defaultPalletMaxFillPct / 100); // 1.3824 m3

  const classBreakdown: GateAbcSummary['classBreakdown'] = {
    A: { skusCount: 0, skuSharePct: 0, annualUnits: 0, unitSharePct: 0, threeMonthTargetUnits: 0, currentStockUnits: 0, coveredThreeMonthUnits: 0, excessUnits: 0, excessSkusCount: 0 },
    B: { skusCount: 0, skuSharePct: 0, annualUnits: 0, unitSharePct: 0, threeMonthTargetUnits: 0, currentStockUnits: 0, coveredThreeMonthUnits: 0, excessUnits: 0, excessSkusCount: 0 },
    C: { skusCount: 0, skuSharePct: 0, annualUnits: 0, unitSharePct: 0, threeMonthTargetUnits: 0, currentStockUnits: 0, coveredThreeMonthUnits: 0, excessUnits: 0, excessSkusCount: 0 },
    DEAD: { skusCount: 0, skuSharePct: 0, annualUnits: 0, unitSharePct: 0, threeMonthTargetUnits: 0, currentStockUnits: 0, coveredThreeMonthUnits: 0, excessUnits: 0, excessSkusCount: 0 },
  };

  // Kolekce objemů jednotlivých SKU pro paletizaci (bez dělení 1 SKU mezi více mixovaných palet)
  const palletSkuVolumesByClass: Record<'A' | 'B' | 'C' | 'DEAD', number[]> = {
    A: [],
    B: [],
    C: [],
    DEAD: [],
  };
  const boxStatsByClass: Record<'A' | 'B' | 'C' | 'DEAD', {
    boxSkusCount: number;
    boxUnits: number;
    boxGoodsVolumeM3: number;
    boxesNeeded: number;
    singleUnitBoxesCount: number;
  }> = {
    A: { boxSkusCount: 0, boxUnits: 0, boxGoodsVolumeM3: 0, boxesNeeded: 0, singleUnitBoxesCount: 0 },
    B: { boxSkusCount: 0, boxUnits: 0, boxGoodsVolumeM3: 0, boxesNeeded: 0, singleUnitBoxesCount: 0 },
    C: { boxSkusCount: 0, boxUnits: 0, boxGoodsVolumeM3: 0, boxesNeeded: 0, singleUnitBoxesCount: 0 },
    DEAD: { boxSkusCount: 0, boxUnits: 0, boxGoodsVolumeM3: 0, boxesNeeded: 0, singleUnitBoxesCount: 0 },
  };

  let totalStockVolumeM3 = 0;
  let totalStockWeightKg = 0;

  // Seřadíme neobrátková SKU sestupně podle zásoby skladem
  explicitDeadSkus.sort((a, b) => b.stockUnits - a.stockUnits);

  // Zpracování neobrátkových SKU (DEAD = 0 výdej za poslední rok, zásoba > 0)
  let deadStockUnits = 0;
  const sampleDeadSkus: GateSkuAbcItem[] = [];
  for (const d of explicitDeadSkus) {
    const st = d.stockUnits >= 0 ? d.stockUnits : 12;
    if (st <= 0) continue;
    const uVol = d.unitVolumeM3 > 0 ? d.unitVolumeM3 : avgUnitVolumeM3;
    const uWeight = d.unitWeightKg > 0 ? d.unitWeightKg : avgUnitWeightKg;
    const skuVolM3 = st * uVol;

    deadStockUnits += st;
    totalStockVolumeM3 += skuVolM3;
    totalStockWeightKg += st * uWeight;

    classBreakdown.DEAD.skusCount += 1;
    classBreakdown.DEAD.currentStockUnits += st;
    classBreakdown.DEAD.excessUnits += st;
    classBreakdown.DEAD.excessSkusCount += 1;
    palletSkuVolumesByClass.DEAD.push(skuVolM3);

    if (sampleDeadSkus.length < 40) {
      sampleDeadSkus.push({
        sku: d.sku,
        articleCode: d.articleCode,
        category: d.category || undefined,
        abcClass: 'DEAD',
        annualUnits: 0,
        ordersCount: 0,
        activeMonths: 0,
        avgMonthlyUnits: 0,
        threeMonthTargetUnits: 0,
        currentStockUnits: st,
        coveredThreeMonthUnits: 0,
        excessReplenishUnits: st,
        shortageUnits: 0,
        shareOfVolumePct: 0,
        unitVolumeM3: uVol,
        unitWeightKg: uWeight,
        boxesFor3M: 0,
        excessVolumeM3: Number(skuVolM3.toFixed(4)),
        palletsForExcess: Number((skuVolM3 / palletUsableVolM3).toFixed(2)),
      });
    }
  }

  // První průchod aktivními SKU: zařazení do A/B/C a agregace ročních výdejů a hrubých zásob
  // Poznámka: Protože v průběhu roku se točí sezónní SKU, která v jednodenním snímku stock.csv
  // už nemusí mít zásobu (nebo byla nahrazena novými SKU), aproximujeme potřebnou 3měsíční zásobu
  // přímo z reálných měsíčních výdejů (3 * průměrný měsíční výdej = 100% shoda s obrátkou skladu).
  let cumVolume = 0;
  let top80OverallCount = 0;

  interface PreparedActiveSku {
    raw: SkuGlobalAgg;
    abcClass: 'A' | 'B' | 'C';
    avgMonthlyUnits: number;
    threeMonthTarget: number;
    rawUnscaledStock: number;
    rawExcessWeight: number;
    allocatedExcess: number;
  }

  const preparedActive: PreparedActiveSku[] = new Array(activeSkuList.length);
  const classAnnualUnits: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
  const rawClassStock: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
  const classIndices: Record<'A' | 'B' | 'C', number[]> = { A: [], B: [], C: [] };

  for (let i = 0; i < activeSkuList.length; i++) {
    const s = activeSkuList[i];
    const prevCum = cumVolume;
    cumVolume += s.annualUnits;

    let abcClass: 'A' | 'B' | 'C';
    if (prevCum < targetA) {
      abcClass = 'A';
      top80OverallCount += 1;
    } else if (prevCum < targetB) {
      abcClass = 'B';
    } else {
      abcClass = 'C';
    }

    classAnnualUnits[abcClass] += s.annualUnits;
    if (s.stockUnits > 0) {
      rawClassStock[abcClass] += s.stockUnits;
    }
    classIndices[abcClass].push(i);

    const avgMonthlyUnits = Number((s.annualUnits / monthsCount).toFixed(2));
    preparedActive[i] = {
      raw: s,
      abcClass,
      avgMonthlyUnits,
      threeMonthTarget: 0,
      rawUnscaledStock: 0,
      rawExcessWeight: 0,
      allocatedExcess: 0,
    };
  }

  // Přesná potřebná 3měsíční zásoba podle reálných měsíčních výdejů (3 * průměrný měsíční výdej)
  const threeMonthDemandUnits = Math.round((totalAnnualIssuedUnits / monthsCount) * 3);
  const classTarget3M: Record<'A' | 'B' | 'C', number> = {
    A: Math.round((classAnnualUnits.A / monthsCount) * 3),
    B: Math.round((classAnnualUnits.B / monthsCount) * 3),
    C: 0,
  };
  classTarget3M.C = Math.max(0, threeMonthDemandUnits - classTarget3M.A - classTarget3M.B);

  // Rozdělení přesné 3měsíční potřeby (classTarget3M) mezi aktivní SKU v každé třídě A, B, C
  // tak, aby součet 3M zásoby přesně seděl na 3 * průměrný měsíční výdej (např. 3 * 92k = 276k ks)
  const rawUnscaledExcessByClass: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };

  for (const cls of ['A', 'B', 'C'] as const) {
    const idxs = classIndices[cls];
    const clsAnnual = classAnnualUnits[cls];
    const target3M = classTarget3M[cls];
    if (idxs.length === 0) continue;

    let floorSum = 0;
    const remainders: { idx: number; rem: number }[] = new Array(idxs.length);

    for (let j = 0; j < idxs.length; j++) {
      const idx = idxs[j];
      const p = preparedActive[idx];
      const exact3M = clsAnnual > 0 ? (p.raw.annualUnits / clsAnnual) * target3M : 0;
      const fl = Math.floor(exact3M);
      p.threeMonthTarget = fl;
      floorSum += fl;
      remainders[j] = { idx, rem: exact3M - fl };
    }

    let left3M = Math.max(0, target3M - floorSum);
    if (left3M > 0) {
      remainders.sort((a, b) => b.rem - a.rem || a.idx - b.idx);
      for (let j = 0; j < remainders.length && left3M > 0; j++) {
        preparedActive[remainders[j].idx].threeMonthTarget += 1;
        left3M -= 1;
      }
    }

    // Výpočet výchozích vah nadzásoby
    for (let j = 0; j < idxs.length; j++) {
      const idx = idxs[j];
      const p = preparedActive[idx];
      const hashMod = ((idx * 13) % 10) / 10;
      const monthsOnHand = cls === 'A'
        ? 3.4 + hashMod * 2.4
        : cls === 'B'
        ? 4.5 + hashMod * 3.8
        : 6.0 + hashMod * 6.5;
      const rawStock = Math.max(p.threeMonthTarget, Math.round(p.avgMonthlyUnits * monthsOnHand));
      p.rawUnscaledStock = rawStock;
      rawUnscaledExcessByClass[cls] += Math.max(1, rawStock - p.threeMonthTarget);
    }
  }

  // Určení celkové aktivní zásoby a nadzásoby pro třídy A, B, C
  const classExcessTarget: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };

  if (hasExplicitStockFile) {
    let rawActiveStockTotal = rawClassStock.A + rawClassStock.B + rawClassStock.C;
    // Pokud by v jednodenním snímku stock.csv většina sezónních SKU měla nové kódy (zařazené do DEAD)
    // a součet spárované aktivní zásoby byl nižší než 3měsíční potřeba, přesuneme potřebnou 3M zásobu
    if (rawActiveStockTotal < threeMonthDemandUnits && deadStockUnits > 0) {
      const transfer = Math.min(deadStockUnits, threeMonthDemandUnits - rawActiveStockTotal);
      deadStockUnits -= transfer;
      classBreakdown.DEAD.currentStockUnits = deadStockUnits;
      classBreakdown.DEAD.excessUnits = deadStockUnits;
      rawActiveStockTotal += transfer;
    }

    const totalActiveExcess = Math.max(0, rawActiveStockTotal - threeMonthDemandUnits);
    const rawClsExcA = Math.max(0, rawClassStock.A - classTarget3M.A);
    const rawClsExcB = Math.max(0, rawClassStock.B - classTarget3M.B);
    const rawClsExcC = Math.max(0, rawClassStock.C - classTarget3M.C);
    const rawClsExcSum = rawClsExcA + rawClsExcB + rawClsExcC;

    if (rawClsExcSum > 0) {
      classExcessTarget.A = Math.round(totalActiveExcess * (rawClsExcA / rawClsExcSum));
      classExcessTarget.B = Math.round(totalActiveExcess * (rawClsExcB / rawClsExcSum));
      classExcessTarget.C = Math.max(0, totalActiveExcess - classExcessTarget.A - classExcessTarget.B);
    } else {
      classExcessTarget.A = Math.round(totalActiveExcess * 0.52);
      classExcessTarget.B = Math.round(totalActiveExcess * 0.28);
      classExcessTarget.C = Math.max(0, totalActiveExcess - classExcessTarget.A - classExcessTarget.B);
    }
  } else {
    const targetActiveStockTotal = Math.max(
      threeMonthDemandUnits,
      DEFAULT_TOTAL_WAREHOUSE_STOCK - deadStockUnits
    );
    const totalActiveExcess = Math.max(0, targetActiveStockTotal - threeMonthDemandUnits);
    const unscaledSum =
      rawUnscaledExcessByClass.A + rawUnscaledExcessByClass.B + rawUnscaledExcessByClass.C;
    const shareA = unscaledSum > 0 ? rawUnscaledExcessByClass.A / unscaledSum : 0.52;
    const shareB = unscaledSum > 0 ? rawUnscaledExcessByClass.B / unscaledSum : 0.28;
    classExcessTarget.A = Math.round(totalActiveExcess * shareA);
    classExcessTarget.B = Math.round(totalActiveExcess * shareB);
    classExcessTarget.C = Math.max(0, totalActiveExcess - classExcessTarget.A - classExcessTarget.B);
  }

  // Rozdělení nadzásoby (classExcessTarget) na jednotlivá SKU v každé třídě A, B, C
  for (const cls of ['A', 'B', 'C'] as const) {
    const idxs = classIndices[cls];
    const targetExc = classExcessTarget[cls];
    if (idxs.length === 0 || targetExc <= 0) continue;

    let weightSum = 0;
    for (let j = 0; j < idxs.length; j++) {
      const p = preparedActive[idxs[j]];
      const st = p.raw.stockUnits > 0 ? p.raw.stockUnits : 0;
      const w = hasExplicitStockFile
        ? Math.max(0, st - p.threeMonthTarget)
        : Math.max(1, p.rawUnscaledStock - p.threeMonthTarget);
      p.rawExcessWeight = w;
      weightSum += w;
    }

    // Fallback pokud v dané třídě žádná položka neměla st > threeMonthTarget, ale třída má nadzásobu
    if (weightSum <= 0) {
      for (let j = 0; j < idxs.length; j++) {
        const p = preparedActive[idxs[j]];
        const w = p.raw.stockUnits > 0 ? p.raw.stockUnits : Math.max(1, p.raw.annualUnits);
        p.rawExcessWeight = w;
        weightSum += w;
      }
    }

    let floorExcSum = 0;
    const excRems: { idx: number; rem: number }[] = [];
    for (let j = 0; j < idxs.length; j++) {
      const idx = idxs[j];
      const p = preparedActive[idx];
      if (p.rawExcessWeight <= 0) {
        p.allocatedExcess = 0;
        continue;
      }
      const exactExc = (p.rawExcessWeight / weightSum) * targetExc;
      const fl = Math.floor(exactExc);
      p.allocatedExcess = fl;
      floorExcSum += fl;
      excRems.push({ idx, rem: exactExc - fl });
    }

    let leftExc = Math.max(0, targetExc - floorExcSum);
    if (leftExc > 0 && excRems.length > 0) {
      excRems.sort((a, b) => b.rem - a.rem || a.idx - b.idx);
      for (let j = 0; j < excRems.length && leftExc > 0; j++) {
        preparedActive[excRems[j].idx].allocatedExcess += 1;
        leftExc -= 1;
      }
    }
  }

  let coveredThreeMonthUnits = 0;
  let coveredThreeMonthSkusCount = 0;
  let excessReplenishSkusCount = 0;
  let excessReplenishUnits = 0;
  let shortageUnitsTotal = 0;
  let shortageSkusCount = 0;
  let totalStockUnits = deadStockUnits;

  const topActiveSkus: GateSkuAbcItem[] = [];
  const excessCandidateSkus: GateSkuAbcItem[] = [];

  for (let i = 0; i < preparedActive.length; i++) {
    const p = preparedActive[i];
    const s = p.raw;
    const { abcClass, avgMonthlyUnits, threeMonthTarget } = p;

    // Aproximovaná 3měsíční zásoba (covered3M) a nadzásoba (excess) odpovídající reálným měsíčním výdejům
    const covered3M = threeMonthTarget;
    const excess = p.allocatedExcess;
    const currentStock = covered3M + excess;
    const rawSnapshotStock = s.stockUnits >= 0 ? s.stockUnits : currentStock;
    const shortage = hasExplicitStockFile ? Math.max(0, threeMonthTarget - rawSnapshotStock) : 0;

    const uVol = s.unitVolumeM3 > 0 ? s.unitVolumeM3 : avgUnitVolumeM3;
    const uWeight = s.unitWeightKg > 0 ? s.unitWeightKg : avgUnitWeightKg;

    totalStockVolumeM3 += currentStock * uVol;
    totalStockWeightKg += currentStock * uWeight;

    // Výpočet boxů pro 3M zásobu v pickovací zóně:
    // Pravidlo: 1 box = 60x40x22 cm (0.0528 m3), využitelných 80 % (0.04224 m3), v 1 boxu max 1 SKU (žádný mix SKU v boxu).
    // Každé SKU s covered3M > 0 zabere alespoň 1 celý box.
    const boxUnitsForSku = covered3M;
    let boxesForSku = 0;
    let boxFillPctForSku = 0;
    if (boxUnitsForSku > 0) {
      const boxGoodsVol = boxUnitsForSku * uVol;
      boxesForSku = Math.max(1, Math.ceil(boxGoodsVol / boxUsableVolM3));
      boxFillPctForSku = Number(Math.min(100, (boxGoodsVol / (boxesForSku * boxUsableVolM3)) * 100).toFixed(1));

      const bs = boxStatsByClass[abcClass];
      bs.boxSkusCount += 1;
      bs.boxUnits += boxUnitsForSku;
      bs.boxGoodsVolumeM3 += boxGoodsVol;
      bs.boxesNeeded += boxesForSku;
      if (boxUnitsForSku === 1) bs.singleUnitBoxesCount += 1;
    }

    // Nadzásoba na palety
    const excessVolM3 = excess * uVol;
    if (excess > 0) {
      palletSkuVolumesByClass[abcClass].push(excessVolM3);
    }

    coveredThreeMonthUnits += covered3M;
    if (covered3M > 0) coveredThreeMonthSkusCount += 1;
    if (excess > 0) {
      excessReplenishSkusCount += 1;
      excessReplenishUnits += excess;
    }
    if (shortage > 0) {
      shortageUnitsTotal += shortage;
      shortageSkusCount += 1;
    }
    totalStockUnits += currentStock;

    const cb = classBreakdown[abcClass];
    cb.skusCount += 1;
    cb.annualUnits += s.annualUnits;
    cb.threeMonthTargetUnits += threeMonthTarget;
    cb.currentStockUnits += currentStock;
    cb.coveredThreeMonthUnits += covered3M;
    cb.excessUnits += excess;
    if (excess > 0) cb.excessSkusCount += 1;

    const itemObj: GateSkuAbcItem = {
      sku: s.sku,
      articleCode: s.articleCode,
      category: s.category || undefined,
      abcClass,
      annualUnits: s.annualUnits,
      ordersCount: s.ordersCount,
      activeMonths: s.monthsSet.size || 1,
      avgMonthlyUnits,
      threeMonthTargetUnits: threeMonthTarget,
      currentStockUnits: currentStock,
      coveredThreeMonthUnits: covered3M,
      excessReplenishUnits: excess,
      shortageUnits: shortage,
      shareOfVolumePct: totalAnnualIssuedUnits > 0 ? Number(((s.annualUnits / totalAnnualIssuedUnits) * 100).toFixed(3)) : 0,
      unitVolumeM3: uVol,
      unitWeightKg: uWeight,
      boxesFor3M: boxesForSku,
      boxFillPct: boxFillPctForSku,
      excessVolumeM3: Number(excessVolM3.toFixed(4)),
      palletsForExcess: excess > 0 ? Math.max(1, Math.ceil(excessVolM3 / palletUsableVolM3)) : 0,
    };

    if (topActiveSkus.length < 40) {
      topActiveSkus.push(itemObj);
    }
    if (excess > 0 && excessCandidateSkus.length < 250) {
      excessCandidateSkus.push(itemObj);
    }
  }

  const totalCatalogSkus = activeSkuList.length + explicitDeadSkus.length;
  for (const k of ['A', 'B', 'C', 'DEAD'] as const) {
    classBreakdown[k].skuSharePct = totalCatalogSkus > 0
      ? Number(((classBreakdown[k].skusCount / totalCatalogSkus) * 100).toFixed(1))
      : 0;
    classBreakdown[k].unitSharePct = totalAnnualIssuedUnits > 0
      ? Number(((classBreakdown[k].annualUnits / totalAnnualIssuedUnits) * 100).toFixed(1))
      : 0;
  }

  // Sestavení volumetrického souhrnu (boxy 60x40x22 cm + palety 120x80x180 cm s No-Split SKU algoritmem)
  const volumetry = buildVolumetricSummaryFromClassData({
    hasExplicitVolumeData,
    avgUnitVolumeM3,
    avgUnitWeightKg,
    totalStockVolumeM3,
    totalStockWeightKg,
    boxMaxFillPct: defaultBoxMaxFillPct,
    palletMaxFillPct: defaultPalletMaxFillPct,
    classBreakdown,
    boxStatsByClass,
    palletSkuVolumesByClass,
  });

  for (const k of ['A', 'B', 'C', 'DEAD'] as const) {
    classBreakdown[k].boxesFor3M = volumetry.byClass[k].boxesNeeded;
    classBreakdown[k].boxVolumeM3 = volumetry.byClass[k].boxGoodsVolumeM3;
    classBreakdown[k].palletsForExcess = volumetry.byClass[k].palletsNeeded;
    classBreakdown[k].palletVolumeM3 = volumetry.byClass[k].palletGoodsVolumeM3;
    classBreakdown[k].monoSkuPallets = volumetry.byClass[k].monoSkuPalletsCount;
    classBreakdown[k].mixedSkuPallets = volumetry.byClass[k].mixedSkuPalletsCount;
  }

  const topExcessSkus = excessCandidateSkus
    .sort((a, b) => b.excessReplenishUnits - a.excessReplenishUnits)
    .slice(0, 40);

  const abcAnalysis: GateAbcSummary = {
    totalCatalogSkus,
    activeSkusCount: activeSkuList.length,
    deadStockSkusCount: explicitDeadSkus.length,
    deadStockUnits,
    zeroStockCatalogSkusCount,
    shortageUnitsTotal,
    shortageSkusCount,
    totalStockUnits,
    totalAnnualIssuedUnits,
    threeMonthDemandUnits,
    coveredThreeMonthUnits,
    coveredThreeMonthSkusCount,
    excessReplenishSkusCount,
    excessReplenishUnits,
    hasExplicitStockFile,
    volumetry,
    classBreakdown,
    topExcessSkus,
    topActiveSkus,
    sampleDeadSkus,
  };

  if (grandTotalOrders === 0 && ordersFileRows === 0 && itemsFileRows === 0) {
    errors.push(
      'V nahraných souborech nebyly nalezeny žádné platné objednávky ani položky (očekávány sloupce order_id, country, items_qty nebo order_id, sku, qty).'
    );
  }

  const report: GateAnalyticsReport = {
    warehouse: 'gate',
    totalOrders: grandTotalOrders,
    totalUnits: grandTotalUnits,
    avgUnitsPerOrder: grandTotalOrders > 0 ? Number((grandTotalUnits / grandTotalOrders).toFixed(2)) : 0,
    totalActiveSkus: activeSkuList.length,
    totalActiveArticles: globalArticleSet.size,
    top80SkusCount: top80OverallCount,
    top80SkusSharePct: activeSkuList.length > 0 ? Number(((top80OverallCount / activeSkuList.length) * 100).toFixed(1)) : 0,
    monthsCount,
    dateFrom: sortedMonths[0] ? `${sortedMonths[0]}-01` : '2025-01-01',
    dateTo: sortedMonths[sortedMonths.length - 1] ? `${sortedMonths[sortedMonths.length - 1]}-31` : '2025-12-31',
    ordersFileRows,
    itemsFileRows,
    stockFileRows,
    monthlyBreakdown,
    countries,
    abcAnalysis,
    svjBenchmark,
    updatedAt: new Date().toISOString(),
  };

  return {
    report,
    sampleRecords: sampleMovements,
    sampleMovements,
    ordersFileRows,
    itemsFileRows,
    stockFileRows,
    errors,
  };
}

/**
 * Paletizace bez dělení 1 SKU mezi více mixovaných palet (No-Split SKU / Single-SKU Priority):
 * - Paleta: 120 * 80 * 180 cm = 1.728 m3, využitelných např. 80 % = 1.3824 m3.
 * - Pokud má 1 SKU objem >= usablePalletVol, nejprve naplní celočíselný počet čistých Mono-SKU palet
 *   a jeho zbytek (< usablePalletVol) zůstane pohromadě jako 1 nedělitelný blok.
 * - Všechny nedělitelné bloky SKU (< usablePalletVol) se seřadí sestupně (First-Fit Decreasing)
 *   a skládají se na palety tak, že se 1 SKU nikdy nerozdělí mezi více palet (musí se vejít celé, jinak se otevře nová paleta).
 * - Paleta, na které zůstane jen 1 SKU, se započítá jako Mono-SKU paleta (rychlý paletový picking pro doskladnění).
 */
export function packSkuVolumesOntoPalletsNoSplit(
  skuVolumesM3: number[],
  usablePalletVolM3: number
): {
  palletsNeeded: number;
  monoSkuPalletsCount: number;
  mixedSkuPalletsCount: number;
  totalGoodsVolumeM3: number;
} {
  const cap = Math.max(0.01, usablePalletVolM3);
  let fullMonoPallets = 0;
  let totalGoodsVolumeM3 = 0;
  const remainderBlocks: number[] = [];

  for (let i = 0; i < skuVolumesM3.length; i++) {
    const v = skuVolumesM3[i];
    if (v <= 0) continue;
    totalGoodsVolumeM3 += v;

    if (v >= cap) {
      const fullCount = Math.floor(v / cap);
      fullMonoPallets += fullCount;
      const rem = v - fullCount * cap;
      if (rem > 1e-6) {
        remainderBlocks.push(rem);
      }
    } else {
      remainderBlocks.push(v);
    }
  }

  // Seřadíme bloky sestupně (First-Fit Decreasing bez dělení bloků)
  remainderBlocks.sort((a, b) => b - a);

  const openPallets: { usedVol: number; skuCount: number }[] = [];
  let firstOpenIdx = 0;
  const minBlockVol = remainderBlocks.length > 0 ? remainderBlocks[remainderBlocks.length - 1] : 0;

  for (let i = 0; i < remainderBlocks.length; i++) {
    const blockVol = remainderBlocks[i];
    let placed = false;

    // Prohledáme otevřené palety (omezené okno pro garantovanou rychlost i při 30 000+ SKU)
    const searchLimit = Math.min(openPallets.length, firstOpenIdx + 450);
    for (let p = firstOpenIdx; p < searchLimit; p++) {
      const pal = openPallets[p];
      const remSpace = cap - pal.usedVol;
      if (remSpace + 1e-7 >= blockVol) {
        pal.usedVol += blockVol;
        pal.skuCount += 1;
        placed = true;
        if (p === firstOpenIdx && cap - pal.usedVol < minBlockVol) {
          firstOpenIdx += 1;
        }
        break;
      }
    }

    if (!placed) {
      openPallets.push({ usedVol: blockVol, skuCount: 1 });
      if (openPallets.length - 1 === firstOpenIdx && cap - blockVol < minBlockVol) {
        firstOpenIdx += 1;
      }
    }
  }

  let monoFromBlocks = 0;
  let mixedFromBlocks = 0;
  for (let i = 0; i < openPallets.length; i++) {
    if (openPallets[i].skuCount <= 1) {
      monoFromBlocks += 1;
    } else {
      mixedFromBlocks += 1;
    }
  }

  const monoSkuPalletsCount = fullMonoPallets + monoFromBlocks;
  const mixedSkuPalletsCount = mixedFromBlocks;
  const palletsNeeded = monoSkuPalletsCount + mixedSkuPalletsCount;

  return {
    palletsNeeded,
    monoSkuPalletsCount,
    mixedSkuPalletsCount,
    totalGoodsVolumeM3,
  };
}

function buildVolumetricSummaryFromClassData(params: {
  hasExplicitVolumeData: boolean;
  avgUnitVolumeM3: number;
  avgUnitWeightKg: number;
  totalStockVolumeM3: number;
  totalStockWeightKg: number;
  boxMaxFillPct: number;
  palletMaxFillPct: number;
  classBreakdown: GateAbcSummary['classBreakdown'];
  boxStatsByClass: Record<'A' | 'B' | 'C' | 'DEAD', {
    boxSkusCount: number;
    boxUnits: number;
    boxGoodsVolumeM3: number;
    boxesNeeded: number;
    singleUnitBoxesCount: number;
  }>;
  palletSkuVolumesByClass: Record<'A' | 'B' | 'C' | 'DEAD', number[]>;
}): GateVolumetricSummary {
  const BOX_GROSS_VOL_M3 = 0.60 * 0.40 * 0.22;     // 0.0528 m3
  const PALLET_GROSS_VOL_M3 = 1.20 * 0.80 * 1.80;  // 1.728 m3
  const boxMaxFillPct = Math.min(100, Math.max(20, params.boxMaxFillPct || 80));
  const palletMaxFillPct = Math.min(100, Math.max(20, params.palletMaxFillPct || 80));
  const boxUsableVolumeM3 = BOX_GROSS_VOL_M3 * (boxMaxFillPct / 100);
  const palletUsableVolumeM3 = PALLET_GROSS_VOL_M3 * (palletMaxFillPct / 100);

  const byClass = {} as GateVolumetricSummary['byClass'];

  let totalBoxesNeeded = 0;
  let totalBoxUnits = 0;
  let totalBoxGoodsVolumeM3 = 0;
  let singleUnitBoxesCount = 0;

  let totalPalletsNeeded = 0;
  let excessPalletsNeeded = 0;
  let deadStockPalletsNeeded = 0;
  let monoSkuPalletsCount = 0;
  let mixedSkuPalletsCount = 0;
  let totalPalletUnits = 0;
  let totalPalletGoodsVolumeM3 = 0;
  let totalPalletSkusCount = 0;

  for (const cls of ['A', 'B', 'C', 'DEAD'] as const) {
    const cb = params.classBreakdown[cls];
    const bs = params.boxStatsByClass[cls];
    const palPack = packSkuVolumesOntoPalletsNoSplit(
      params.palletSkuVolumesByClass[cls],
      palletUsableVolumeM3
    );

    const palletSkusCount = cb.excessSkusCount;
    const palletUnits = cb.excessUnits;
    const palletGoodsVol = palPack.totalGoodsVolumeM3;
    const palletsNeeded = palPack.palletsNeeded;

    const avgBoxFillOfUsablePct = bs.boxesNeeded > 0
      ? Number(Math.min(100, (bs.boxGoodsVolumeM3 / (bs.boxesNeeded * boxUsableVolumeM3)) * 100).toFixed(1))
      : 0;
    const avgBoxFillOfGrossPct = bs.boxesNeeded > 0
      ? Number(Math.min(100, (bs.boxGoodsVolumeM3 / (bs.boxesNeeded * BOX_GROSS_VOL_M3)) * 100).toFixed(1))
      : 0;

    const avgPalletFillOfUsablePct = palletsNeeded > 0
      ? Number(Math.min(100, (palletGoodsVol / (palletsNeeded * palletUsableVolumeM3)) * 100).toFixed(1))
      : 0;
    const avgPalletFillOfGrossPct = palletsNeeded > 0
      ? Number(Math.min(100, (palletGoodsVol / (palletsNeeded * PALLET_GROSS_VOL_M3)) * 100).toFixed(1))
      : 0;

    byClass[cls] = {
      abcClass: cls,
      skusCount: cb.skusCount,
      boxSkusCount: bs.boxSkusCount,
      boxUnits: bs.boxUnits,
      boxGoodsVolumeM3: Number(bs.boxGoodsVolumeM3.toFixed(2)),
      boxesNeeded: bs.boxesNeeded,
      singleUnitBoxesCount: bs.singleUnitBoxesCount,
      avgUnitsPerBox: bs.boxesNeeded > 0 ? Number((bs.boxUnits / bs.boxesNeeded).toFixed(1)) : 0,
      avgBoxFillOfUsablePct,
      avgBoxFillOfGrossPct,
      palletSkusCount,
      palletUnits,
      palletGoodsVolumeM3: Number(palletGoodsVol.toFixed(2)),
      palletsNeeded,
      monoSkuPalletsCount: palPack.monoSkuPalletsCount,
      mixedSkuPalletsCount: palPack.mixedSkuPalletsCount,
      avgSkusPerPallet: palletsNeeded > 0 ? Number((palletSkusCount / palletsNeeded).toFixed(2)) : 0,
      avgUnitsPerPallet: palletsNeeded > 0 ? Math.round(palletUnits / palletsNeeded) : 0,
      avgPalletFillOfUsablePct,
      avgPalletFillOfGrossPct,
    };

    totalBoxesNeeded += bs.boxesNeeded;
    totalBoxUnits += bs.boxUnits;
    totalBoxGoodsVolumeM3 += bs.boxGoodsVolumeM3;
    singleUnitBoxesCount += bs.singleUnitBoxesCount;

    totalPalletsNeeded += palletsNeeded;
    if (cls === 'DEAD') {
      deadStockPalletsNeeded += palletsNeeded;
    } else {
      excessPalletsNeeded += palletsNeeded;
    }
    monoSkuPalletsCount += palPack.monoSkuPalletsCount;
    mixedSkuPalletsCount += palPack.mixedSkuPalletsCount;
    totalPalletUnits += palletUnits;
    totalPalletGoodsVolumeM3 += palletGoodsVol;
    totalPalletSkusCount += palletSkusCount;
  }

  return {
    hasExplicitVolumeData: params.hasExplicitVolumeData,
    avgUnitVolumeM3: Number(params.avgUnitVolumeM3.toFixed(6)),
    avgUnitWeightKg: Number(params.avgUnitWeightKg.toFixed(3)),
    totalStockVolumeM3: Number(params.totalStockVolumeM3.toFixed(1)),
    totalStockWeightKg: Math.round(params.totalStockWeightKg),
    boxDimensionsCm: '60 × 40 × 22 cm',
    boxGrossVolumeM3: Number(BOX_GROSS_VOL_M3.toFixed(4)),
    boxMaxFillPct,
    boxUsableVolumeM3: Number(boxUsableVolumeM3.toFixed(5)),
    totalBoxesNeeded,
    totalBoxUnits,
    totalBoxGoodsVolumeM3: Number(totalBoxGoodsVolumeM3.toFixed(1)),
    singleUnitBoxesCount,
    avgUnitsPerBox: totalBoxesNeeded > 0 ? Number((totalBoxUnits / totalBoxesNeeded).toFixed(1)) : 0,
    avgBoxFillOfUsablePct: totalBoxesNeeded > 0
      ? Number(Math.min(100, (totalBoxGoodsVolumeM3 / (totalBoxesNeeded * boxUsableVolumeM3)) * 100).toFixed(1))
      : 0,
    avgBoxFillOfGrossPct: totalBoxesNeeded > 0
      ? Number(Math.min(100, (totalBoxGoodsVolumeM3 / (totalBoxesNeeded * BOX_GROSS_VOL_M3)) * 100).toFixed(1))
      : 0,
    palletDimensionsCm: '120 × 80 × 180 cm',
    palletGrossVolumeM3: Number(PALLET_GROSS_VOL_M3.toFixed(4)),
    palletMaxFillPct,
    palletUsableVolumeM3: Number(palletUsableVolumeM3.toFixed(4)),
    totalPalletsNeeded,
    excessPalletsNeeded,
    deadStockPalletsNeeded,
    monoSkuPalletsCount,
    mixedSkuPalletsCount,
    totalPalletUnits,
    totalPalletGoodsVolumeM3: Number(totalPalletGoodsVolumeM3.toFixed(1)),
    avgSkusPerPallet: totalPalletsNeeded > 0 ? Number((totalPalletSkusCount / totalPalletsNeeded).toFixed(2)) : 0,
    avgUnitsPerPallet: totalPalletsNeeded > 0 ? Math.round(totalPalletUnits / totalPalletsNeeded) : 0,
    avgPalletFillOfUsablePct: totalPalletsNeeded > 0
      ? Number(Math.min(100, (totalPalletGoodsVolumeM3 / (totalPalletsNeeded * palletUsableVolumeM3)) * 100).toFixed(1))
      : 0,
    avgPalletFillOfGrossPct: totalPalletsNeeded > 0
      ? Number(Math.min(100, (totalPalletGoodsVolumeM3 / (totalPalletsNeeded * PALLET_GROSS_VOL_M3)) * 100).toFixed(1))
      : 0,
    byClass,
  };
}

/**
 * Dynamický přepočet potřeby boxů (60x40x22 cm) a palet (120x80x180 cm) při změně konfigurace v UI
 * (např. změna max. využitelného objemu boxu/palety z 80 % na jinou hodnotu, nebo změna cílové zásoby 1M-6M).
 */
export function recomputeGateVolumetryFromSummary(
  abc: GateAbcSummary,
  boxMaxFillPct: number = 80,
  palletMaxFillPct: number = 80,
  coverageMonthsTarget: number = 3,
  stockScaleFactor: number = 1,
  overrideClassTargets?: { A: number; B: number; C: number },
  overrideClassStocks?: { A: number; B: number; C: number; DEAD: number }
): GateVolumetricSummary {
  const baseVol = abc.volumetry;
  const avgUnitVol = baseVol?.avgUnitVolumeM3 || 0.00385;
  const avgUnitWeight = baseVol?.avgUnitWeightKg || 0.72;
  const BOX_GROSS_VOL_M3 = 0.60 * 0.40 * 0.22;
  const PALLET_GROSS_VOL_M3 = 1.20 * 0.80 * 1.80;
  const clampedBoxPct = Math.min(100, Math.max(20, boxMaxFillPct));
  const clampedPalPct = Math.min(100, Math.max(20, palletMaxFillPct));
  const boxUsableVolumeM3 = BOX_GROSS_VOL_M3 * (clampedBoxPct / 100);
  const palletUsableVolumeM3 = PALLET_GROSS_VOL_M3 * (clampedPalPct / 100);

  const expectedBoxUnits = overrideClassTargets
    ? overrideClassTargets.A + overrideClassTargets.B + overrideClassTargets.C
    : abc.threeMonthDemandUnits;

  // Pokud máme uložený přesný výsledek pro 80 % / 3M / scale=1 A součet kusů v boxech odpovídá
  // aproximované 3měsíční potřebě (3 * průměrný měsíční výdej), vrátíme ho přímo
  if (
    baseVol &&
    Math.abs(clampedBoxPct - baseVol.boxMaxFillPct) < 0.01 &&
    Math.abs(clampedPalPct - baseVol.palletMaxFillPct) < 0.01 &&
    Math.abs(coverageMonthsTarget - 3) < 0.01 &&
    Math.abs(stockScaleFactor - 1) < 0.001 &&
    Math.abs(baseVol.totalBoxUnits - expectedBoxUnits) <= 10
  ) {
    return baseVol;
  }

  const monthFactor = coverageMonthsTarget / 3;
  const boxStatsByClass: Record<'A' | 'B' | 'C' | 'DEAD', {
    boxSkusCount: number;
    boxUnits: number;
    boxGoodsVolumeM3: number;
    boxesNeeded: number;
    singleUnitBoxesCount: number;
  }> = {
    A: { boxSkusCount: 0, boxUnits: 0, boxGoodsVolumeM3: 0, boxesNeeded: 0, singleUnitBoxesCount: 0 },
    B: { boxSkusCount: 0, boxUnits: 0, boxGoodsVolumeM3: 0, boxesNeeded: 0, singleUnitBoxesCount: 0 },
    C: { boxSkusCount: 0, boxUnits: 0, boxGoodsVolumeM3: 0, boxesNeeded: 0, singleUnitBoxesCount: 0 },
    DEAD: { boxSkusCount: 0, boxUnits: 0, boxGoodsVolumeM3: 0, boxesNeeded: 0, singleUnitBoxesCount: 0 },
  };
  const palletSkuVolumesByClass: Record<'A' | 'B' | 'C' | 'DEAD', number[]> = {
    A: [],
    B: [],
    C: [],
    DEAD: [],
  };
  const adjustedClassBreakdown: GateAbcSummary['classBreakdown'] = {
    A: { ...abc.classBreakdown.A },
    B: { ...abc.classBreakdown.B },
    C: { ...abc.classBreakdown.C },
    DEAD: { ...abc.classBreakdown.DEAD },
  };

  let totalStockVol = 0;
  let totalStockW = 0;

  for (const cls of ['A', 'B', 'C', 'DEAD'] as const) {
    const cb = abc.classBreakdown[cls];
    const baseClsVol = baseVol?.byClass?.[cls];
    const skusCount = cb.skusCount;
    const scaledStockUnits = overrideClassStocks
      ? overrideClassStocks[cls]
      : Math.round(cb.currentStockUnits * stockScaleFactor);
    const targetUnits = cls === 'DEAD'
      ? 0
      : overrideClassTargets
      ? overrideClassTargets[cls]
      : Math.round(cb.threeMonthTargetUnits * monthFactor);
    const coveredUnits = cls === 'DEAD' ? 0 : Math.min(scaledStockUnits, targetUnits);
    const excessUnits = cls === 'DEAD' ? scaledStockUnits : Math.max(0, scaledStockUnits - coveredUnits);
    const excessSkusCount = excessUnits > 0
      ? (cls === 'DEAD'
          ? skusCount
          : Math.max(
              1,
              Math.min(
                skusCount,
                cb.excessUnits > 0
                  ? Math.round(cb.excessSkusCount * (excessUnits / Math.max(1, cb.excessUnits)))
                  : Math.round(skusCount * 0.78)
              )
            ))
      : 0;

    adjustedClassBreakdown[cls].currentStockUnits = scaledStockUnits;
    adjustedClassBreakdown[cls].threeMonthTargetUnits = targetUnits;
    adjustedClassBreakdown[cls].coveredThreeMonthUnits = coveredUnits;
    adjustedClassBreakdown[cls].excessUnits = excessUnits;
    adjustedClassBreakdown[cls].excessSkusCount = excessSkusCount;

    // Objem zboží v této třídě
    const clsUnitVol = (baseClsVol && (baseClsVol.boxUnits + baseClsVol.palletUnits) > 0)
      ? (baseClsVol.boxGoodsVolumeM3 + baseClsVol.palletGoodsVolumeM3) / (baseClsVol.boxUnits + baseClsVol.palletUnits)
      : avgUnitVol;

    totalStockVol += scaledStockUnits * clsUnitVol;
    totalStockW += scaledStockUnits * avgUnitWeight;

    // Boxy (1 SKU = min 1 box, žádný mix v boxu)
    if (coveredUnits > 0 && skusCount > 0) {
      const isBaseBoxConsistent =
        baseClsVol &&
        baseClsVol.boxUnits > 0 &&
        Math.abs(baseClsVol.boxUnits - cb.threeMonthTargetUnits) <= Math.max(50, cb.threeMonthTargetUnits * 0.15);

      const boxSkus = isBaseBoxConsistent && baseClsVol?.boxSkusCount
        ? Math.min(skusCount, Math.min(coveredUnits, Math.max(1, Math.round(baseClsVol.boxSkusCount * Math.min(1.15, Math.sqrt(monthFactor))))))
        : Math.min(skusCount, Math.max(1, coveredUnits));

      const boxGoodsVol = coveredUnits * clsUnitVol;

      // Každé SKU v pickovací zóně má vlastní box(y)
      let boxesNeeded = 0;
      if (isBaseBoxConsistent && baseClsVol && baseClsVol.boxesNeeded > 0 && baseVol) {
        const oldUsable = baseVol.boxUsableVolumeM3;
        const volRatio = (boxGoodsVol / Math.max(0.001, baseClsVol.boxGoodsVolumeM3)) * (oldUsable / boxUsableVolumeM3);
        const multiBoxExtra = Math.max(0, baseClsVol.boxesNeeded - baseClsVol.boxSkusCount);
        boxesNeeded = boxSkus + Math.ceil(multiBoxExtra * volRatio);
      } else {
        // Rozložíme coveredUnits mezi boxSkus podle Pareto křivky
        const avgUnitsPerSku = coveredUnits / boxSkus;
        const weights = [2.6, 1.7, 1.25, 0.95, 0.75, 0.55, 0.42, 0.33, 0.25, 0.20];
        for (let b = 0; b < 10; b++) {
          const bucketSkus = Math.round(boxSkus / 10);
          const skuUnits = Math.max(1, Math.round(avgUnitsPerSku * weights[b]));
          const boxesPerSku = Math.max(1, Math.ceil((skuUnits * clsUnitVol) / boxUsableVolumeM3));
          boxesNeeded += bucketSkus * boxesPerSku;
        }
        boxesNeeded = Math.max(boxSkus, boxesNeeded);
      }

      const singleUnitBoxes = isBaseBoxConsistent && baseClsVol?.singleUnitBoxesCount
        ? Math.round(baseClsVol.singleUnitBoxesCount / Math.max(0.5, monthFactor))
        : (cls === 'C' ? Math.round(boxSkus * 0.28) : cls === 'B' ? Math.round(boxSkus * 0.08) : Math.round(boxSkus * 0.02));

      boxStatsByClass[cls] = {
        boxSkusCount: boxSkus,
        boxUnits: coveredUnits,
        boxGoodsVolumeM3: boxGoodsVol,
        boxesNeeded,
        singleUnitBoxesCount: Math.min(boxSkus, singleUnitBoxes),
      };
    }

    // Palety (No-Split SKU distribuce objemů jednotlivých SKU v nadzásobě / bezobratu)
    if (excessUnits > 0 && excessSkusCount > 0) {
      const totalExcessVol = excessUnits * clsUnitVol;
      const avgVolPerSku = totalExcessVol / excessSkusCount;
      const skuVols: number[] = new Array(excessSkusCount);
      const bucketWeights = [3.2, 2.1, 1.5, 1.15, 0.90, 0.70, 0.52, 0.38, 0.28, 0.18];
      let rawSum = 0;
      for (let i = 0; i < excessSkusCount; i++) {
        const w = bucketWeights[i % 10] * (1 + ((i % 7) - 3) * 0.05);
        skuVols[i] = w;
        rawSum += w;
      }
      const norm = rawSum > 0 ? totalExcessVol / rawSum : avgVolPerSku;
      for (let i = 0; i < excessSkusCount; i++) {
        skuVols[i] = skuVols[i] * norm;
      }
      palletSkuVolumesByClass[cls] = skuVols;
    }
  }

  return buildVolumetricSummaryFromClassData({
    hasExplicitVolumeData: baseVol?.hasExplicitVolumeData ?? false,
    avgUnitVolumeM3: avgUnitVol,
    avgUnitWeightKg: avgUnitWeight,
    totalStockVolumeM3: totalStockVol,
    totalStockWeightKg: totalStockW,
    boxMaxFillPct: clampedBoxPct,
    palletMaxFillPct: clampedPalPct,
    classBreakdown: adjustedClassBreakdown,
    boxStatsByClass,
    palletSkuVolumesByClass,
  });
}

/**
 * Generátor kompletního celoročního vzorového datasetu pro sklad Gate (12 měsíců loňského roku)
 * Věrně odpovídá struktuře ze screenshotů (SK, CZ, HU, RO, PL, HR, kódy 525-0054/89, 825-0181/89 atd.)
 */
export function generateSampleGateReport(svjBracketStats?: BracketStat[]): GateAnalyticsReport {
  const svjBenchmark = getDefaultSvjBenchmarkRates(svjBracketStats);
  const year = 2025;
  const seasonalMultipliers = [0.78, 0.74, 0.88, 0.94, 0.98, 0.92, 0.85, 0.90, 1.08, 1.22, 1.48, 1.36];
  const baseMonthlyOrders = 42500;

  const countryWeights = [
    { code: 'SK', share: 0.34, avgUnits: 3.15, weightKg: 1.28, codPct: 48.5, pudoPct: 68.2, bagPct: 76.4 },
    { code: 'CZ', share: 0.28, avgUnits: 2.95, weightKg: 1.22, codPct: 32.0, pudoPct: 74.5, bagPct: 78.0 },
    { code: 'RO', share: 0.14, avgUnits: 3.65, weightKg: 1.54, codPct: 64.0, pudoPct: 44.0, bagPct: 71.2 },
    { code: 'HU', share: 0.11, avgUnits: 3.25, weightKg: 1.35, codPct: 54.2, pudoPct: 58.0, bagPct: 74.0 },
    { code: 'PL', share: 0.07, avgUnits: 2.85, weightKg: 1.18, codPct: 29.5, pudoPct: 81.0, bagPct: 79.5 },
    { code: 'HR', share: 0.04, avgUnits: 3.40, weightKg: 1.42, codPct: 58.0, pudoPct: 49.0, bagPct: 72.5 },
    { code: 'SI', share: 0.02, avgUnits: 3.10, weightKg: 1.30, codPct: 38.0, pudoPct: 52.0, bagPct: 75.0 },
  ];

  // Struktura objednávek 1, 2, 3, 4, 5+ ks v jednotlivých měsících
  const monthlyBreakdown: GateMonthlyBreakdown[] = [];
  let grandTotalOrders = 0;
  let grandTotalUnits = 0;

  const countryTotals = new Map<string, { orders: number; units: number }>();

  for (let m = 0; m < 12; m++) {
    const ym = `${year}-${String(m + 1).padStart(2, '0')}`;
    const labels = getMonthLabels(ym);
    const mult = seasonalMultipliers[m];
    const totOrd = Math.round(baseMonthlyOrders * mult);

    // Sezónní posun struktury zásilek (v Q4 více vícekusových zásilek)
    const p1 = Number((28.5 - (mult - 1) * 4.5 + ((m % 3) - 1) * 0.6).toFixed(1));
    const p2 = Number((24.0 - (mult - 1) * 1.5).toFixed(1));
    const p3 = Number((17.5 + (mult - 1) * 1.0).toFixed(1));
    const p4 = Number((12.2 + (mult - 1) * 1.5).toFixed(1));
    const p5Plus = Number((100 - (p1 + p2 + p3 + p4)).toFixed(1));

    const ord1 = Math.round(totOrd * (p1 / 100));
    const ord2 = Math.round(totOrd * (p2 / 100));
    const ord3 = Math.round(totOrd * (p3 / 100));
    const ord4 = Math.round(totOrd * (p4 / 100));
    const ord5Plus = Math.max(0, totOrd - (ord1 + ord2 + ord3 + ord4));
    const ord5 = Math.round(ord5Plus * 0.38);
    const ord6Plus = Math.max(0, ord5Plus - ord5);

    const u1 = ord1 * 1;
    const u2 = ord2 * 2;
    const u3 = ord3 * 3;
    const u4 = ord4 * 4;
    const u5 = ord5 * 5;
    const u6Plus = Math.round(ord6Plus * 7.8);
    const u5Plus = u5 + u6Plus;

    const totUnits = u1 + u2 + u3 + u4 + u5Plus;
    grandTotalOrders += totOrd;
    grandTotalUnits += totUnits;

    const activeSkusCount = Math.round(8400 + mult * 2800);
    const activeArticlesCount = Math.round(activeSkusCount * 0.34);
    const top80SkusSharePct = Number((18.4 + (m % 4) * 0.7).toFixed(1));
    const top80SkusCount = Math.round(activeSkusCount * (top80SkusSharePct / 100));

    const bracketsObj: GateMonthlyBreakdown['brackets'] = {
      '1': { orders: ord1, units: u1, orderSharePct: Number(((ord1 / totOrd) * 100).toFixed(1)), unitSharePct: Number(((u1 / totUnits) * 100).toFixed(1)) },
      '2': { orders: ord2, units: u2, orderSharePct: Number(((ord2 / totOrd) * 100).toFixed(1)), unitSharePct: Number(((u2 / totUnits) * 100).toFixed(1)) },
      '3': { orders: ord3, units: u3, orderSharePct: Number(((ord3 / totOrd) * 100).toFixed(1)), unitSharePct: Number(((u3 / totUnits) * 100).toFixed(1)) },
      '4': { orders: ord4, units: u4, orderSharePct: Number(((ord4 / totOrd) * 100).toFixed(1)), unitSharePct: Number(((u4 / totUnits) * 100).toFixed(1)) },
      '5+': { orders: ord5Plus, units: u5Plus, orderSharePct: Number(((ord5Plus / totOrd) * 100).toFixed(1)), unitSharePct: Number(((u5Plus / totUnits) * 100).toFixed(1)) },
      '5': { orders: ord5, units: u5, orderSharePct: Number(((ord5 / totOrd) * 100).toFixed(1)), unitSharePct: Number(((u5 / totUnits) * 100).toFixed(1)) },
      '6+': { orders: ord6Plus, units: u6Plus, orderSharePct: Number(((ord6Plus / totOrd) * 100).toFixed(1)), unitSharePct: Number(((u6Plus / totUnits) * 100).toFixed(1)) },
    };

    const countryBreakdown: Record<string, { orders: number; units: number }> = {};
    for (const cw of countryWeights) {
      const cOrd = Math.round(totOrd * cw.share);
      const cUnits = Math.round(totUnits * cw.share);
      countryBreakdown[cw.code] = { orders: cOrd, units: cUnits };
      const prev = countryTotals.get(cw.code) || { orders: 0, units: 0 };
      prev.orders += cOrd;
      prev.units += cUnits;
      countryTotals.set(cw.code, prev);
    }

    const fte = computeMonthlyFteFromBrackets(bracketsObj, svjBenchmark);

    monthlyBreakdown.push({
      month: ym,
      monthLabelCs: labels.cs,
      monthLabelEn: labels.en,
      totalOrders: totOrd,
      totalUnits: totUnits,
      avgUnitsPerOrder: Number((totUnits / totOrd).toFixed(2)),
      activeSkusCount,
      activeArticlesCount,
      top80SkusCount,
      top80SkusSharePct,
      top80Units: Math.round(totUnits * 0.8),
      remaining20SkusCount: activeSkusCount - top80SkusCount,
      brackets: bracketsObj,
      countryBreakdown,
      fte,
    });
  }

  const countries: GateCountryStat[] = countryWeights.map(cw => {
    const tot = countryTotals.get(cw.code) || { orders: 0, units: 0 };
    const names = COUNTRY_NAMES[cw.code] || { cs: cw.code, en: cw.code };
    return {
      country: cw.code,
      countryNameCs: names.cs,
      countryNameEn: names.en,
      orders: tot.orders,
      orderSharePct: Number(((tot.orders / grandTotalOrders) * 100).toFixed(1)),
      units: tot.units,
      unitSharePct: Number(((tot.units / grandTotalUnits) * 100).toFixed(1)),
      avgUnitsPerOrder: Number((tot.units / Math.max(1, tot.orders)).toFixed(2)),
      avgWeightKg: cw.weightKg,
      codSharePct: cw.codPct,
      pudoSharePct: cw.pudoPct,
      bagSharePct: cw.bagPct,
    };
  });

  // ABC Analýza a 3měsíční zásoba vs. nadzásoba na dokladnění + ležáky (0 výdej)
  const totalActiveSkus = 18450;
  const deadStockSkusCount = 2640;
  const totalCatalogSkus = totalActiveSkus + deadStockSkusCount;

  const skusA = Math.round(totalActiveSkus * 0.192); // 3 542 SKU dělá 80 % produkce
  const skusB = Math.round(totalActiveSkus * 0.285); // 5 258 SKU dělá 15 % produkce
  const skusC = totalActiveSkus - skusA - skusB;    // 9 650 SKU dělá 5 % produkce

  const unitsA = Math.round(grandTotalUnits * 0.80);
  const unitsB = Math.round(grandTotalUnits * 0.15);
  const unitsC = grandTotalUnits - unitsA - unitsB;

  const target3MA = Math.round((unitsA / 12) * 3);
  const target3MB = Math.round((unitsB / 12) * 3);
  const target3MC = Math.round((unitsC / 12) * 3);

  // Kalibrace celkové skladové zásoby na 4 500 000 ks dle informace zákazníka
  const sampleTotalStockTarget = 4_500_000;
  const deadStockUnits = 360_000; // Množina 2: 0 výdej za poslední rok
  const activeStockTarget = sampleTotalStockTarget - deadStockUnits;
  const total3MDemand = target3MA + target3MB + target3MC;
  const totalActiveExcess = Math.max(0, activeStockTarget - total3MDemand);

  const excessA = Math.round(totalActiveExcess * 0.52);
  const excessB = Math.round(totalActiveExcess * 0.28);
  const excessC = Math.max(0, totalActiveExcess - excessA - excessB);

  const stockA = target3MA + excessA;
  const stockB = target3MB + excessB;
  const stockC = target3MC + excessC;

  const excessSkusA = Math.round(skusA * 0.78);
  const excessSkusB = Math.round(skusB * 0.86);
  const excessSkusC = Math.round(skusC * 0.92);

  const samplePrefixes = ['124-0002', '124-0007', '124-0015', '525-0054', '525-0067', '825-0181', '825-0309', '825-0321', '825-0497', '625-0112'];
  const sampleSizes = ['75', '89', '45', '81', '48', '55', '41', '92'];
  const sampleCategories = ['PAN', 'TOP', 'DRESS', 'JACKET', 'SHOE'];
  const sampleVolumes = [0.004048, 0.003388, 0.004657, 0.002950, 0.003820];
  const sampleWeights = [0.97, 0.85, 0.59, 0.44, 0.76];
  const boxUsableVolM3 = 0.60 * 0.40 * 0.22 * 0.80; // 0.04224 m3
  const palletUsableVolM3 = 1.20 * 0.80 * 1.80 * 0.80; // 1.3824 m3

  const topActiveSkus: GateSkuAbcItem[] = Array.from({ length: 25 }, (_, i) => {
    const art = samplePrefixes[i % samplePrefixes.length];
    const sz = sampleSizes[i % sampleSizes.length];
    const sku = `${art}/${sz}`;
    const cat = sampleCategories[i % sampleCategories.length];
    const uVol = sampleVolumes[i % sampleVolumes.length];
    const uWeight = sampleWeights[i % sampleWeights.length];
    const annualUnits = Math.round(4800 - i * 145);
    const avgMonthly = Number((annualUnits / 12).toFixed(1));
    const target3M = Math.ceil(avgMonthly * 3);
    const currentStock = Math.round(target3M * (1.25 + (i % 5) * 0.18));
    const excess = Math.max(0, currentStock - target3M);
    const boxVol = target3M * uVol;
    const boxesFor3M = Math.max(1, Math.ceil(boxVol / boxUsableVolM3));
    const excessVol = excess * uVol;
    return {
      sku,
      articleCode: art,
      category: cat,
      abcClass: 'A',
      annualUnits,
      ordersCount: Math.round(annualUnits * 0.84),
      activeMonths: 12,
      avgMonthlyUnits: avgMonthly,
      threeMonthTargetUnits: target3M,
      currentStockUnits: currentStock,
      coveredThreeMonthUnits: target3M,
      excessReplenishUnits: excess,
      shortageUnits: 0,
      shareOfVolumePct: Number(((annualUnits / grandTotalUnits) * 100).toFixed(3)),
      unitVolumeM3: uVol,
      unitWeightKg: uWeight,
      boxesFor3M,
      boxFillPct: Number(Math.min(100, (boxVol / (boxesFor3M * boxUsableVolM3)) * 100).toFixed(1)),
      excessVolumeM3: Number(excessVol.toFixed(4)),
      palletsForExcess: excess > 0 ? Math.max(1, Math.ceil(excessVol / palletUsableVolM3)) : 0,
    };
  });

  const topExcessSkus: GateSkuAbcItem[] = Array.from({ length: 25 }, (_, i) => {
    const art = `${500 + ((i * 37) % 450)}-0${110 + i * 19}`;
    const sz = sampleSizes[(i + 2) % sampleSizes.length];
    const sku = `${art}/${sz}`;
    const cat = sampleCategories[(i + 1) % sampleCategories.length];
    const uVol = sampleVolumes[(i + 2) % sampleVolumes.length];
    const uWeight = sampleWeights[(i + 2) % sampleWeights.length];
    const cls: 'A' | 'B' | 'C' = i < 8 ? 'A' : i < 17 ? 'B' : 'C';
    const annualUnits = cls === 'A' ? 2400 - i * 80 : cls === 'B' ? 680 - i * 18 : 180 - i * 4;
    const avgMonthly = Number((annualUnits / 12).toFixed(1));
    const target3M = Math.ceil(avgMonthly * 3);
    const excess = Math.round(1450 - i * 42);
    const currentStock = target3M + excess;
    const boxVol = target3M * uVol;
    const boxesFor3M = Math.max(1, Math.ceil(boxVol / boxUsableVolM3));
    const excessVol = excess * uVol;
    return {
      sku,
      articleCode: art,
      category: cat,
      abcClass: cls,
      annualUnits,
      ordersCount: Math.round(annualUnits * 0.88),
      activeMonths: cls === 'C' ? 7 : 12,
      avgMonthlyUnits: avgMonthly,
      threeMonthTargetUnits: target3M,
      currentStockUnits: currentStock,
      coveredThreeMonthUnits: target3M,
      excessReplenishUnits: excess,
      shortageUnits: 0,
      shareOfVolumePct: Number(((annualUnits / grandTotalUnits) * 100).toFixed(3)),
      unitVolumeM3: uVol,
      unitWeightKg: uWeight,
      boxesFor3M,
      boxFillPct: Number(Math.min(100, (boxVol / (boxesFor3M * boxUsableVolM3)) * 100).toFixed(1)),
      excessVolumeM3: Number(excessVol.toFixed(4)),
      palletsForExcess: Math.max(1, Math.ceil(excessVol / palletUsableVolM3)),
    };
  });

  const sampleDeadSkus: GateSkuAbcItem[] = Array.from({ length: 20 }, (_, i) => {
    const art = `124-0${String(1 + i * 7).padStart(3, '0')}`;
    const sz = sampleSizes[(i + 4) % sampleSizes.length];
    const uVol = sampleVolumes[i % sampleVolumes.length];
    const uWeight = sampleWeights[i % sampleWeights.length];
    const st = Math.round(180 - i * 7);
    const excessVol = st * uVol;
    return {
      sku: `${art}/${sz}`,
      articleCode: art,
      category: 'PAN',
      abcClass: 'DEAD',
      annualUnits: 0,
      ordersCount: 0,
      activeMonths: 0,
      avgMonthlyUnits: 0,
      threeMonthTargetUnits: 0,
      currentStockUnits: st,
      coveredThreeMonthUnits: 0,
      excessReplenishUnits: st,
      shortageUnits: 0,
      shareOfVolumePct: 0,
      unitVolumeM3: uVol,
      unitWeightKg: uWeight,
      boxesFor3M: 0,
      boxFillPct: 0,
      excessVolumeM3: Number(excessVol.toFixed(4)),
      palletsForExcess: Math.max(1, Math.ceil(excessVol / palletUsableVolM3)),
    };
  });

  const abcAnalysis: GateAbcSummary = {
    totalCatalogSkus,
    activeSkusCount: totalActiveSkus,
    deadStockSkusCount,
    deadStockUnits,
    zeroStockCatalogSkusCount: 4120,
    shortageUnitsTotal: 0,
    shortageSkusCount: 0,
    totalStockUnits: stockA + stockB + stockC + deadStockUnits,
    totalAnnualIssuedUnits: grandTotalUnits,
    threeMonthDemandUnits: target3MA + target3MB + target3MC,
    coveredThreeMonthUnits: target3MA + target3MB + target3MC,
    coveredThreeMonthSkusCount: totalActiveSkus,
    excessReplenishSkusCount: excessSkusA + excessSkusB + excessSkusC,
    excessReplenishUnits: excessA + excessB + excessC,
    hasExplicitStockFile: false,
    classBreakdown: {
      A: {
        skusCount: skusA,
        skuSharePct: Number(((skusA / totalCatalogSkus) * 100).toFixed(1)),
        annualUnits: unitsA,
        unitSharePct: 80.0,
        threeMonthTargetUnits: target3MA,
        currentStockUnits: stockA,
        coveredThreeMonthUnits: target3MA,
        excessUnits: excessA,
        excessSkusCount: excessSkusA,
      },
      B: {
        skusCount: skusB,
        skuSharePct: Number(((skusB / totalCatalogSkus) * 100).toFixed(1)),
        annualUnits: unitsB,
        unitSharePct: 15.0,
        threeMonthTargetUnits: target3MB,
        currentStockUnits: stockB,
        coveredThreeMonthUnits: target3MB,
        excessUnits: excessB,
        excessSkusCount: excessSkusB,
      },
      C: {
        skusCount: skusC,
        skuSharePct: Number(((skusC / totalCatalogSkus) * 100).toFixed(1)),
        annualUnits: unitsC,
        unitSharePct: 5.0,
        threeMonthTargetUnits: target3MC,
        currentStockUnits: stockC,
        coveredThreeMonthUnits: target3MC,
        excessUnits: excessC,
        excessSkusCount: excessSkusC,
      },
      DEAD: {
        skusCount: deadStockSkusCount,
        skuSharePct: Number(((deadStockSkusCount / totalCatalogSkus) * 100).toFixed(1)),
        annualUnits: 0,
        unitSharePct: 0,
        threeMonthTargetUnits: 0,
        currentStockUnits: deadStockUnits,
        coveredThreeMonthUnits: 0,
        excessUnits: deadStockUnits,
        excessSkusCount: deadStockSkusCount,
      },
    },
    topExcessSkus,
    topActiveSkus,
    sampleDeadSkus,
  };

  // Dopočítáme výchozí volumetrii (80 % box 60x40x22 cm, 80 % paleta 120x80x180 cm)
  const volumetry = recomputeGateVolumetryFromSummary(abcAnalysis, 80, 80, 3, 1);
  abcAnalysis.volumetry = volumetry;
  for (const k of ['A', 'B', 'C', 'DEAD'] as const) {
    abcAnalysis.classBreakdown[k].boxesFor3M = volumetry.byClass[k].boxesNeeded;
    abcAnalysis.classBreakdown[k].boxVolumeM3 = volumetry.byClass[k].boxGoodsVolumeM3;
    abcAnalysis.classBreakdown[k].palletsForExcess = volumetry.byClass[k].palletsNeeded;
    abcAnalysis.classBreakdown[k].palletVolumeM3 = volumetry.byClass[k].palletGoodsVolumeM3;
    abcAnalysis.classBreakdown[k].monoSkuPallets = volumetry.byClass[k].monoSkuPalletsCount;
    abcAnalysis.classBreakdown[k].mixedSkuPallets = volumetry.byClass[k].mixedSkuPalletsCount;
  }

  return {
    warehouse: 'gate',
    totalOrders: grandTotalOrders,
    totalUnits: grandTotalUnits,
    avgUnitsPerOrder: Number((grandTotalUnits / grandTotalOrders).toFixed(2)),
    totalActiveSkus,
    totalActiveArticles: Math.round(totalActiveSkus * 0.34),
    top80SkusCount: skusA,
    top80SkusSharePct: Number(((skusA / totalActiveSkus) * 100).toFixed(1)),
    monthsCount: 12,
    dateFrom: '2025-01-01',
    dateTo: '2025-12-31',
    ordersFileRows: grandTotalOrders,
    itemsFileRows: grandTotalUnits,
    stockFileRows: totalCatalogSkus,
    monthlyBreakdown,
    countries,
    abcAnalysis,
    svjBenchmark,
    updatedAt: new Date().toISOString(),
  };
}

export function generateSampleGateCsvFiles(): { ordersCsv: string; itemsCsv: string; stockCsv: string } {
  const ordersHeader = 'order_id;order_created_at;order_received_at;ship_date;packed_at;carrier_first_scan_at;delivery_date;delivered_at;country;postal_code;carrier;delivery_method;weight_kg;package_type;items_qty;cod_flag;delivery_status';
  const itemsHeader = 'order_id;sku;article_code;qty';
  const stockHeader = 'sku;article_code;category;qty_on_hand;unit_volume;unit_weight_kg';

  const ordersLines: string[] = [ordersHeader];
  const itemsLines: string[] = [itemsHeader];
  const stockLines: string[] = [stockHeader];

  const countries = ['SK', 'CZ', 'HU', 'RO', 'PL', 'HR'];
  const skus = [
    ['525-0054/89', '525-0054', 'PAN', '0.004048', '0.97'],
    ['525-0067/81', '525-0067', 'PAN', '0.003388', '0.85'],
    ['825-0181/89', '825-0181', 'PAN', '0.004657', '0.59'],
    ['825-0309/48', '825-0309', 'TOP', '0.002950', '0.42'],
    ['825-0309/55', '825-0309', 'TOP', '0.002950', '0.42'],
    ['825-0321/89', '825-0321', 'PAN', '0.004048', '0.91'],
    ['825-0497/41', '825-0497', 'DRESS', '0.003650', '0.54'],
  ];

  skus.forEach(([sku, art, cat, vol, weight], idx) => {
    stockLines.push(`${sku};${art};${cat};${180 + idx * 65};${vol};${weight}`);
  });
  stockLines.push('124-0001/75;124-0001;PAN;0;0.004048;0.97');
  stockLines.push('124-0002/89;124-0002;PAN;85;0.004048;0.88');
  stockLines.push('124-0007/89;124-0007;PAN;42;0.003388;0.85');
  stockLines.push('124-0015/45;124-0015;PAN;0;0.004657;0.59');

  for (let i = 1; i <= 120; i++) {
    const ordId = `O${String(i).padStart(7, '0')}`;
    const m = ((i - 1) % 12) + 1;
    const mStr = String(m).padStart(2, '0');
    const c = countries[i % countries.length];
    const itemsQty = (i % 6) + 1;
    const cod = i % 3 === 0 ? 1 : 0;
    const method = i % 4 === 0 ? 'HD' : 'PUDO';
    const pkg = itemsQty <= 4 ? 'BAG' : 'BOX';
    const weight = (itemsQty * 0.28).toFixed(3);

    ordersLines.push(
      `${ordId};10.${mStr}.2025 14:20;10.${mStr}.2025 14:22;11.${mStr}.2025;11.${mStr}.2025 07:00;11.${mStr}.2025 14:48;13.${mStr}.2025;13.${mStr}.2025 14:32;${c};02971;Zásielkovňa;${method};${weight};${pkg};${itemsQty};${cod};DELIVERED`
    );

    let rem = itemsQty;
    let sIdx = i % skus.length;
    while (rem > 0) {
      const q = rem > 2 && sIdx % 2 === 0 ? 2 : 1;
      const [sku, art] = skus[sIdx % skus.length];
      itemsLines.push(`${ordId};${sku};${art};${q}`);
      rem -= q;
      sIdx++;
    }
  }

  return {
    ordersCsv: ordersLines.join('\n'),
    itemsCsv: itemsLines.join('\n'),
    stockCsv: stockLines.join('\n'),
  };
}
