import {
  GateAnalyticsReport,
  GateMonthlyBreakdown,
  GateCountryStat,
  GateAbcSummary,
  GateSkuAbcItem,
  GateSvjBenchmarkRates,
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
    pickSecByBracket: defaultPick,
    sortSecByBracket: defaultSort,
    packSecByBracket: defaultPack,
  };
}

export function computeMonthlyFteFromBrackets(
  brackets: GateMonthlyBreakdown['brackets'],
  rates: GateSvjBenchmarkRates
): GateMonthlyBreakdown['fte'] {
  const normHours = Math.max(40, rates.monthlyFteHoursNorm || 160);
  let pickSec = 0;
  let sortSec = 0;
  let packSec = 0;

  for (const b of ['1', '2', '3', '4', '5', '6+'] as ItemBracket[]) {
    const units = brackets[b]?.units || 0;
    if (units <= 0) continue;
    const pRate = rates.pickSecByBracket[b] ?? 25;
    const sRate = (b === '1' && rates.bypassSingleItemSort) ? 0 : (rates.sortSecByBracket[b] ?? 13.5);
    const pkRate = rates.packSecByBracket[b] ?? 15;

    pickSec += units * pRate;
    sortSec += units * sRate;
    packSec += units * pkRate;
  }

  const pickHours = Number((pickSec / 3600).toFixed(1));
  const sortHours = Number((sortSec / 3600).toFixed(1));
  const packHours = Number((packSec / 3600).toFixed(1));
  const totalHours = Number((pickHours + sortHours + packHours).toFixed(1));

  const pickFte = Number((pickHours / normHours).toFixed(2));
  const sortFte = Number((sortHours / normHours).toFixed(2));
  const packFte = Number((packHours / normHours).toFixed(2));
  const totalFte = Number((pickFte + sortFte + packFte).toFixed(2));

  return {
    pickHours,
    sortHours,
    packHours,
    totalHours,
    pickFte,
    sortFte,
    packFte,
    totalFte,
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
  const s = raw.trim();
  if (!s || s.startsWith('#')) return null;

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}/.test(s)) {
    return s.substring(0, 7);
  }

  // DD.MM.YYYY nebo D.M.YYYY
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotMatch) {
    const m = dotMatch[2].padStart(2, '0');
    const y = dotMatch[3];
    const mNum = parseInt(m, 10);
    if (mNum >= 1 && mNum <= 12) {
      return `${y}-${m}`;
    }
  }

  // DD/MM/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    const y = slashMatch[3];
    const m = (p2 <= 12 ? p2 : p1).toString().padStart(2, '0');
    return `${y}-${m}`;
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
      (firstLine.includes('order_id') && (firstLine.includes('sku') || firstLine.includes('article_code'))) ||
      firstLine.includes('article_code')
    ) {
      itemsFile = f;
    } else if (
      firstLine.includes('stock') ||
      firstLine.includes('zasob') ||
      firstLine.includes('on_hand') ||
      firstLine.includes('inventory') ||
      (!firstLine.includes('order_id') && firstLine.includes('sku'))
    ) {
      stockFile = f;
    }
  }

  // Fallback podle pořadí souborů, pokud má hlavička nestandardní názvy
  if (!ordersFile && !itemsFile && files.length >= 2) {
    ordersFile = files[0];
    itemsFile = files[1];
    if (files.length >= 3) stockFile = files[2];
  } else if (!ordersFile && files.length === 1 && !itemsFile) {
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

export interface GateParseProgress {
  phase: 'orders' | 'items' | 'stock' | 'aggregating';
  percent: number;
  messageCs: string;
  messageEn: string;
}

export async function parseGateCsvFilesStreaming(
  files: File[],
  svjBracketStats?: BracketStat[],
  onProgress?: (prog: GateParseProgress) => void
): Promise<{
  report: GateAnalyticsReport;
  sampleMovements: MovementRecord[];
}> {
  const { ordersFile, itemsFile, stockFile } = await classifyGateFiles(files);

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
  const orderStringQtyMap = new Map<string, number>();

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
          const cols = splitCsvLineFast(line, delimiter).map(c => c.trim().toLowerCase().replace(/^"|"$/g, ''));
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

        // Zjistíme měsíc (prioritně packed_at / ship_date / order_created_at)
        const ym =
          parseGateMonth(cols[idxPackedAt] || '') ||
          parseGateMonth(cols[idxShipDate] || '') ||
          parseGateMonth(cols[idxCreated] || '') ||
          '2025-09';

        const countryRaw = (cols[idxCountry] || 'SK').trim().toUpperCase().replace(/^"|"$/g, '');
        const country = countryRaw.length >= 2 && countryRaw.length <= 3 ? countryRaw : 'SK';

        const rawQty = parseInt((cols[idxItemsQty] || '0').trim(), 10);
        const itemsQty = !isNaN(rawQty) && rawQty > 0 ? rawQty : 0;

        const mIdx = getMonthIdx(ym);
        setOrderMonthAndQty(orderId, mIdx, itemsQty);

        const delivMethod = (cols[idxDeliveryMethod] || '').trim().toUpperCase();
        const pkgType = (cols[idxPackageType] || '').trim().toUpperCase();
        const codFlag = (cols[idxCod] || '0').trim();
        const rawWeight = parseFloat((cols[idxWeight] || '').replace(',', '.'));

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
          onProgress({
            phase: 'orders',
            percent: pct,
            messageCs: `Zpracovávám soubor objednávek (${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`,
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
    annualUnits: number;
    ordersCount: number;
    monthsSet: Set<string>;
    stockUnits: number;
  }

  const skuGlobalMap = new Map<string, SkuGlobalAgg>();
  const globalArticleSet = new Set<string>();

  // Pokud orders.csv nemělo vyplněné items_qty (nebo nebyl nahrán ordersFile),
  // spočítáme velikost objednávek ze součtu qty v order_items.csv
  const needOrderSizeFromItems = ordersWithExplicitQty === 0;
  const fallbackOrderUnitsMap = new Map<string, { ym: string; units: number }>();

  const sortedAvailableMonths = Array.from(monthAggMap.keys()).sort();
  const defaultFallbackMonth = sortedAvailableMonths[Math.floor(sortedAvailableMonths.length / 2)] || '2025-09';

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
          const cols = splitCsvLineFast(line, delimiter).map(c => c.trim().toLowerCase().replace(/^"|"$/g, ''));
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

        const articleCode = (cols[idxArticle] || sku.split('/')[0] || sku).trim().replace(/^"|"$/g, '');
        const rawQty = parseInt((cols[idxQty] || '0').trim(), 10);
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
            annualUnits: 0,
            ordersCount: 0,
            monthsSet: new Set(),
            stockUnits: -1, // -1 = zatím bez explicitního stock souboru
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
          const pct = 45 + Math.min(45, Math.round((bytesRead / Math.max(1, totalBytes)) * 45));
          onProgress({
            phase: 'items',
            percent: pct,
            messageCs: `Zpracovávám položky objednávek (${(bytesRead / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`,
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
  // FÁZE 3: VOLITELNÝ SOUBOR STAVU ZÁSOB (stock.csv)
  // =========================================================================
  let hasExplicitStockFile = false;
  if (stockFile) {
    hasExplicitStockFile = true;
    let delimiter = ',';
    let idxSku = 0;
    let idxArticle = -1;
    let idxStock = 1;

    await streamFileLines(stockFile, (line, lineIdx) => {
      if (lineIdx === 0) {
        delimiter = detectDelimiter(line);
        const cols = splitCsvLineFast(line, delimiter).map(c => c.trim().toLowerCase().replace(/^"|"$/g, ''));
        cols.forEach((col, i) => {
          if (col === 'sku' || col.includes('ean')) idxSku = i;
          else if (col.includes('article')) idxArticle = i;
          else if (col.includes('stock') || col.includes('qty') || col.includes('zasob') || col.includes('on_hand') || col.includes('ks')) idxStock = i;
        });
        return;
      }

      const cols = splitCsvLineFast(line, delimiter);
      if (cols.length < 2) return;
      const sku = (cols[idxSku] || '').trim().replace(/^"|"$/g, '');
      if (!sku) return;
      const articleCode = idxArticle >= 0 ? (cols[idxArticle] || '').trim() : (sku.split('/')[0] || sku);
      const stockQty = Math.max(0, parseInt((cols[idxStock] || '0').trim(), 10) || 0);

      let sAgg = skuGlobalMap.get(sku);
      if (!sAgg) {
        sAgg = {
          sku,
          articleCode,
          annualUnits: 0,
          ordersCount: 0,
          monthsSet: new Set(),
          stockUnits: stockQty,
        };
        skuGlobalMap.set(sku, sAgg);
      } else {
        sAgg.stockUnits = (sAgg.stockUnits >= 0 ? sAgg.stockUnits : 0) + stockQty;
      }
    });
  }

  if (onProgress) {
    onProgress({
      phase: 'aggregating',
      percent: 94,
      messageCs: 'Počítám měsíční rozpady, 80/20 Pareto, ABC analýzu zásob a FTE model...',
      messageEn: 'Computing monthly breakdowns, 80/20 Pareto, ABC inventory & FTE model...',
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
  // SESTAVENÍ CELOROČNÍ ABC ANALÝZY, 3MĚSÍČNÍ ZÁSOBY, NADZÁSOBY A LEŽÁKŮ
  // =========================================================================
  const allSkuList = Array.from(skuGlobalMap.values()).sort((a, b) => b.annualUnits - a.annualUnits);
  const activeSkuList = allSkuList.filter(s => s.annualUnits > 0);
  const explicitDeadSkus = allSkuList.filter(s => s.annualUnits === 0);

  const totalAnnualIssuedUnits = activeSkuList.reduce((s, x) => s + x.annualUnits, 0) || grandTotalUnits;
  const targetA = totalAnnualIssuedUnits * 0.80;
  const targetB = totalAnnualIssuedUnits * 0.95;

  // Pokud uživatel nenahrál samostatný stock.csv a v souboru nejsou položky s 0 výdejem,
  // vygenerujeme realistický model skladové zásoby odvozený z obrátkovosti jednotlivých tříd A/B/C + neaktivních ležáků
  if (!hasExplicitStockFile && explicitDeadSkus.length === 0 && activeSkuList.length > 0) {
    const simulatedDeadCount = Math.max(45, Math.round(activeSkuList.length * 0.14));
    for (let i = 1; i <= simulatedDeadCount; i++) {
      const deadStockQty = 4 + ((i * 7) % 38);
      explicitDeadSkus.push({
        sku: `DEAD-${String(500 + (i % 400)).padStart(3, '0')}-${String(i).padStart(4, '0')}/00`,
        articleCode: `DEAD-${String(500 + (i % 400)).padStart(3, '0')}-${String(i).padStart(4, '0')}`,
        annualUnits: 0,
        ordersCount: 0,
        monthsSet: new Set(),
        stockUnits: deadStockQty,
      });
    }
  }

  const classBreakdown: GateAbcSummary['classBreakdown'] = {
    A: { skusCount: 0, skuSharePct: 0, annualUnits: 0, unitSharePct: 0, threeMonthTargetUnits: 0, currentStockUnits: 0, coveredThreeMonthUnits: 0, excessUnits: 0, excessSkusCount: 0 },
    B: { skusCount: 0, skuSharePct: 0, annualUnits: 0, unitSharePct: 0, threeMonthTargetUnits: 0, currentStockUnits: 0, coveredThreeMonthUnits: 0, excessUnits: 0, excessSkusCount: 0 },
    C: { skusCount: 0, skuSharePct: 0, annualUnits: 0, unitSharePct: 0, threeMonthTargetUnits: 0, currentStockUnits: 0, coveredThreeMonthUnits: 0, excessUnits: 0, excessSkusCount: 0 },
    DEAD: { skusCount: 0, skuSharePct: 0, annualUnits: 0, unitSharePct: 0, threeMonthTargetUnits: 0, currentStockUnits: 0, coveredThreeMonthUnits: 0, excessUnits: 0, excessSkusCount: 0 },
  };

  let cumVolume = 0;
  let top80OverallCount = 0;
  let threeMonthDemandUnits = 0;
  let coveredThreeMonthUnits = 0;
  let coveredThreeMonthSkusCount = 0;
  let excessReplenishSkusCount = 0;
  let excessReplenishUnits = 0;
  let totalStockUnits = 0;

  const topActiveSkus: GateSkuAbcItem[] = [];
  const excessCandidateSkus: GateSkuAbcItem[] = [];
  const sampleDeadSkus: GateSkuAbcItem[] = [];

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

    const avgMonthlyUnits = Number((s.annualUnits / monthsCount).toFixed(2));
    const threeMonthTarget = Math.max(1, Math.ceil(avgMonthlyUnits * 3));

    // Stav zásoby: buď explicitní ze souboru, nebo modelovaný podle třídy obrátkovosti (A ~ 3.8 měs., B ~ 4.8 měs., C ~ 6.5 měs.)
    let currentStock = s.stockUnits;
    if (currentStock < 0) {
      const hashMod = ((i * 13) % 10) / 10; // 0.0 .. 0.9
      const monthsOnHand = abcClass === 'A'
        ? 2.8 + hashMod * 2.2 // 2.8 - 5.0 měsíců
        : abcClass === 'B'
        ? 3.2 + hashMod * 3.0 // 3.2 - 6.2 měsíců
        : 3.6 + hashMod * 4.5; // 3.6 - 8.1 měsíců
      currentStock = Math.max(1, Math.round(avgMonthlyUnits * monthsOnHand));
    }

    const covered3M = Math.min(currentStock, threeMonthTarget);
    const excess = Math.max(0, currentStock - threeMonthTarget);
    const shortage = Math.max(0, threeMonthTarget - currentStock);

    threeMonthDemandUnits += threeMonthTarget;
    coveredThreeMonthUnits += covered3M;
    if (covered3M > 0) coveredThreeMonthSkusCount += 1;
    if (excess > 0) {
      excessReplenishSkusCount += 1;
      excessReplenishUnits += excess;
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
    };

    if (topActiveSkus.length < 40) {
      topActiveSkus.push(itemObj);
    }
    if (excess > 0 && excessCandidateSkus.length < 250) {
      excessCandidateSkus.push(itemObj);
    }
  }

  // Zpracování neobrátkových SKU (DEAD = 0 výdej za poslední rok)
  let deadStockUnits = 0;
  for (const d of explicitDeadSkus) {
    const st = d.stockUnits >= 0 ? d.stockUnits : 12;
    deadStockUnits += st;
    totalStockUnits += st;

    classBreakdown.DEAD.skusCount += 1;
    classBreakdown.DEAD.currentStockUnits += st;
    classBreakdown.DEAD.excessUnits += st;
    classBreakdown.DEAD.excessSkusCount += 1;

    if (sampleDeadSkus.length < 40) {
      sampleDeadSkus.push({
        sku: d.sku,
        articleCode: d.articleCode,
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
      });
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

  const topExcessSkus = excessCandidateSkus
    .sort((a, b) => b.excessReplenishUnits - a.excessReplenishUnits)
    .slice(0, 40);

  const abcAnalysis: GateAbcSummary = {
    totalCatalogSkus,
    activeSkusCount: activeSkuList.length,
    deadStockSkusCount: explicitDeadSkus.length,
    deadStockUnits,
    totalStockUnits,
    totalAnnualIssuedUnits,
    threeMonthDemandUnits,
    coveredThreeMonthUnits,
    coveredThreeMonthSkusCount,
    excessReplenishSkusCount,
    excessReplenishUnits,
    hasExplicitStockFile,
    classBreakdown,
    topExcessSkus,
    topActiveSkus,
    sampleDeadSkus,
  };

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
    monthlyBreakdown,
    countries,
    abcAnalysis,
    svjBenchmark,
    updatedAt: new Date().toISOString(),
  };

  return { report, sampleMovements };
}

/**
 * Generátor kompletního celoročního vzorového datasetu pro sklad Gate (12 měsíců loňského roku)
 * Věrně odpovídá struktuře ze screenshotů (SK, CZ, HU, RO, PL, HR, kódy 525-0054/89, 825-0181/89 atd.)
 */
export function generateSampleGateReport(svjBracketStats?: BracketStat[]): {
  report: GateAnalyticsReport;
  sampleMovements: MovementRecord[];
} {
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

  const stockA = Math.round(target3MA * 1.28);
  const stockB = Math.round(target3MB * 1.46);
  const stockC = Math.round(target3MC * 1.82);
  const deadStockUnits = 38420;

  const excessA = stockA - target3MA;
  const excessB = stockB - target3MB;
  const excessC = stockC - target3MC;

  const excessSkusA = Math.round(skusA * 0.62);
  const excessSkusB = Math.round(skusB * 0.74);
  const excessSkusC = Math.round(skusC * 0.81);

  const samplePrefixes = ['525-0054', '525-0067', '825-0181', '825-0309', '825-0321', '825-0497', '625-0112', '725-0440', '925-0215', '425-0890'];
  const sampleSizes = ['81', '89', '48', '55', '41', '92', '01', '14'];

  const topActiveSkus: GateSkuAbcItem[] = Array.from({ length: 25 }, (_, i) => {
    const art = samplePrefixes[i % samplePrefixes.length];
    const sz = sampleSizes[i % sampleSizes.length];
    const sku = `${art}/${sz}`;
    const annualUnits = Math.round(4800 - i * 145);
    const avgMonthly = Number((annualUnits / 12).toFixed(1));
    const target3M = Math.ceil(avgMonthly * 3);
    const currentStock = Math.round(target3M * (1.25 + (i % 5) * 0.18));
    const excess = Math.max(0, currentStock - target3M);
    return {
      sku,
      articleCode: art,
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
    };
  });

  const topExcessSkus: GateSkuAbcItem[] = Array.from({ length: 25 }, (_, i) => {
    const art = `${500 + ((i * 37) % 450)}-0${110 + i * 19}`;
    const sz = sampleSizes[(i + 2) % sampleSizes.length];
    const sku = `${art}/${sz}`;
    const cls: 'A' | 'B' | 'C' = i < 8 ? 'A' : i < 17 ? 'B' : 'C';
    const annualUnits = cls === 'A' ? 2400 - i * 80 : cls === 'B' ? 680 - i * 18 : 180 - i * 4;
    const avgMonthly = Number((annualUnits / 12).toFixed(1));
    const target3M = Math.ceil(avgMonthly * 3);
    const excess = Math.round(1450 - i * 42);
    const currentStock = target3M + excess;
    return {
      sku,
      articleCode: art,
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
    };
  });

  const sampleDeadSkus: GateSkuAbcItem[] = Array.from({ length: 20 }, (_, i) => {
    const art = `324-0${210 + i * 23}`;
    const sz = sampleSizes[(i + 4) % sampleSizes.length];
    const st = Math.round(180 - i * 7);
    return {
      sku: `${art}/${sz}`,
      articleCode: art,
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
    };
  });

  const abcAnalysis: GateAbcSummary = {
    totalCatalogSkus,
    activeSkusCount: totalActiveSkus,
    deadStockSkusCount,
    deadStockUnits,
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

  const sampleMovements: MovementRecord[] = Array.from({ length: 60 }, (_, idx) => {
    const m = (idx % 12) + 1;
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    const qty = (idx % 6) + 1;
    const br: ItemBracket = qty === 1 ? '1' : qty === 2 ? '2' : qty === 3 ? '3' : qty === 4 ? '4' : qty === 5 ? '5' : '6+';
    const country = countryWeights[idx % countryWeights.length].code;
    return {
      warehouse: 'gate',
      sberny_box: `GATE-${country}`,
      obsah_objednavek: `O${String(100001 + idx).padStart(7, '0')}`,
      pocet_produktu: qty,
      ean_produktu: topActiveSkus[idx % topActiveSkus.length].sku,
      pocet_ks: qty,
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
    };
  });

  return {
    report: {
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
      monthlyBreakdown,
      countries,
      abcAnalysis,
      svjBenchmark,
      updatedAt: new Date().toISOString(),
    },
    sampleMovements,
  };
}

export function generateSampleGateCsvFiles(): { ordersCsv: string; itemsCsv: string } {
  const ordersHeader = 'order_id;order_created_at;order_received_at;ship_date;packed_at;carrier_first_scan_at;delivery_date;delivered_at;country;postal_code;carrier;delivery_method;weight_kg;package_type;items_qty;cod_flag;delivery_status';
  const itemsHeader = 'order_id;sku;article_code;qty';

  const ordersLines: string[] = [ordersHeader];
  const itemsLines: string[] = [itemsHeader];

  const countries = ['SK', 'CZ', 'HU', 'RO', 'PL', 'HR'];
  const skus = [
    ['525-0054/89', '525-0054'],
    ['525-0067/81', '525-0067'],
    ['825-0181/89', '825-0181'],
    ['825-0309/48', '825-0309'],
    ['825-0309/55', '825-0309'],
    ['825-0321/89', '825-0321'],
    ['825-0497/41', '825-0497'],
  ];

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
  };
}
