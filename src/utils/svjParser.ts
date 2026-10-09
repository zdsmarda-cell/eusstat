import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { MovementRecord, ItemBracket, SvjTriFileParseResult } from '../types.js';
import { parseDateTime, formatLocalIso } from './fileParser.js';

export type SvjFileType = 'picking' | 'sorting' | 'packing' | 'unknown';

function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Automaticky detekuje typ SVJ souboru podle hlaviček sloupců
 */
export function detectSvjFileType(headers: string[]): SvjFileType {
  const norm = headers.map(h => normalizeHeader(h));

  // 1. Picking file check (box, pick_start, product_codes, order_uids)
  const hasPickStart = norm.some(h => h.includes('pick_start') || h.includes('pickstart') || h.includes('zacatek_pick'));
  const hasOrderUids = norm.some(h => h.includes('order_uids') || h.includes('orderuids') || h.includes('orders') || h.includes('product_codes'));
  if (hasPickStart || (norm.includes('box') && hasOrderUids)) {
    return 'picking';
  }

  // 2. Sorting file check (sort_start, units_sorted, wait_after_picking_min)
  const hasSortStart = norm.some(h => h.includes('sort_start') || h.includes('sortstart') || h.includes('zacatek_sort'));
  const hasSortUnits = norm.some(h => h.includes('units_sorted') || h.includes('sort_min') || h.includes('sorters') || h.includes('wait_after_picking'));
  if (hasSortStart || hasSortUnits) {
    return 'sorting';
  }

  // 3. Packing file check (order_uid, pack_open, packed, pack_sec, station, packer)
  const hasPackOpen = norm.some(h => h.includes('pack_open') || h.includes('packed') || h.includes('pack_sec'));
  const hasPackerStation = norm.some(h => h.includes('station') || h.includes('packer') || h.includes('times_opened'));
  const hasOrderUid = norm.some(h => h === 'order_uid' || h === 'orderuid');
  if (hasPackOpen || (hasOrderUid && hasPackerStation)) {
    return 'packing';
  }

  return 'unknown';
}

function findKey(row: any, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const normCand = normalizeHeader(cand);
    const found = keys.find(k => normalizeHeader(k) === normCand || normalizeHeader(k).includes(normCand));
    if (found) return found;
  }
  return null;
}

function parseNumber(val: any, fallback: number = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  const cleaned = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

function getBracket(units: number): ItemBracket {
  if (units <= 1) return '1';
  if (units === 2) return '2';
  if (units === 3) return '3';
  if (units === 4) return '4';
  if (units === 5) return '5';
  return '6+';
}

export interface SvjInputFile {
  name: string;
  data: any[]; // parsed rows as object arrays
  rawType?: SvjFileType;
}

/**
 * Hlavní parser pro 3 soubory skladu SVJ (Picking, Sorting, Packing).
 * Spojuje data podle logiky:
 * 1. Picking -> identifikuje box a seznam order_uids + produkty
 * 2. Sorting -> ověří, zda byl daný box vysortován a jak dlouho
 * 3. Packing -> ověří ruční zabalení objednávky (order_uid)
 *
 * Podmínka pro srovnání:
 * "Pro srovnani pak u baleni je uvedeno jen rucni baleni (takze ne vse vypickovane, musi byt v datech i packed - musi byt ale sorted)."
 */
export function joinSvjTriFiles(files: SvjInputFile[]): SvjTriFileParseResult {
  const errors: string[] = [];

  // 1. Identifikace souborů
  let pickingRows: any[] = [];
  let sortingRows: any[] = [];
  let packingRows: any[] = [];

  for (const f of files) {
    const sample = f.data[0] || {};
    const headers = Object.keys(sample);
    const type = f.rawType || detectSvjFileType(headers);

    if (type === 'picking') {
      pickingRows = f.data;
    } else if (type === 'sorting') {
      sortingRows = f.data;
    } else if (type === 'packing') {
      packingRows = f.data;
    }
  }

  if (pickingRows.length === 0) {
    errors.push('Chybí soubor Picking (nebo v něm nebyly nalezeny sloupce pick_start, order_uids, product_codes).');
  }
  if (sortingRows.length === 0) {
    errors.push('Chybí soubor Sorting (nebo v něm nebyly nalezeny sloupce sort_start, units_sorted, wait_after_picking_min).');
  }
  if (packingRows.length === 0) {
    errors.push('Chybí soubor Packing (Ruční balení se sloupci order_uid, pack_open, packed, pack_sec).');
  }

  if (errors.length > 0 && (pickingRows.length === 0 || packingRows.length === 0)) {
    return {
      records: [],
      pickingRowsCount: pickingRows.length,
      sortingRowsCount: sortingRows.length,
      packingRowsCount: packingRows.length,
      uniqueOrdersPicked: 0,
      uniqueOrdersSorted: 0,
      uniqueOrdersPacked: 0,
      matchedCompleteOrders: 0,
      droppedUnsortedOrders: 0,
      droppedUnpackedOrders: 0,
      errors,
    };
  }

  // 2. Indexace Sorting souboru (podle box_code)
  const sortMap = new Map<string, {
    sort_start: Date;
    sort_end: Date;
    sort_min: number;
    sort_sec: number;
    units_sorted: number;
    sorters: number;
    wait_after_picking_min: number;
  }>();

  for (const row of sortingRows) {
    const boxKey = findKey(row, ['box', 'box_id', 'prepravka']);
    if (!boxKey) continue;
    const boxCode = String(row[boxKey] || '').trim();
    if (!boxCode) continue;

    const kStart = findKey(row, ['sort_start', 'zacatek_sortingu', 'start']);
    const kEnd = findKey(row, ['sort_end', 'konec_sortingu', 'end']);
    const kMin = findKey(row, ['sort_min', 'minuty', 'duration_min']);
    const kUnits = findKey(row, ['units_sorted', 'units', 'kusy', 'pocet_ks']);
    const kSorters = findKey(row, ['sorters', 'operatori', 'pracovnici']);
    const kWait = findKey(row, ['wait_after_picking_min', 'wait_min', 'cekani']);

    const start = parseDateTime(kStart ? row[kStart] : null) || new Date();
    const end = parseDateTime(kEnd ? row[kEnd] : null) || start;
    const minVal = parseNumber(kMin ? row[kMin] : null, 0);
    const secVal = minVal > 0 ? minVal * 60 : Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
    const units = Math.max(1, parseNumber(kUnits ? row[kUnits] : null, 1));
    const sorters = Math.max(1, parseNumber(kSorters ? row[kSorters] : null, 1));
    const waitMin = parseNumber(kWait ? row[kWait] : null, 0);

    sortMap.set(boxCode, {
      sort_start: start,
      sort_end: end,
      sort_min: minVal,
      sort_sec: secVal,
      units_sorted: units,
      sorters,
      wait_after_picking_min: waitMin,
    });
  }

  // 3. Indexace Packing souboru (podle order_uid)
  const packMap = new Map<string, {
    packer: string;
    station: string;
    pack_open: Date;
    packed: Date;
    pack_sec: number;
    pack_min: number;
    times_opened: number;
    gap_since_prev_packed_sec?: number;
  }>();

  for (const row of packingRows) {
    const kOrder = findKey(row, ['order_uid', 'order_id', 'objednavka', 'obsah_objednavek']);
    if (!kOrder) continue;
    const orderUid = String(row[kOrder] || '').trim();
    if (!orderUid) continue;

    const kPacker = findKey(row, ['packer', 'balic', 'user', 'operator', 'email']);
    const kStation = findKey(row, ['station', 'stanice', 'pracoviste']);
    const kOpen = findKey(row, ['pack_open', 'zacatek_baleni', 'open']);
    const kPacked = findKey(row, ['packed', 'konec_baleni', 'close', 'done']);
    const kSec = findKey(row, ['pack_sec', 'sec', 'sekundy', 'duration_s']);
    const kMin = findKey(row, ['pack_min', 'min', 'minuty']);
    const kOpened = findKey(row, ['times_opened', 'otevreno']);
    const kGap = findKey(row, ['gap_since_prev_packed_sec', 'gap_sec', 'pauza']);

    const openDate = parseDateTime(kOpen ? row[kOpen] : null) || new Date();
    const packedDate = parseDateTime(kPacked ? row[kPacked] : null) || openDate;
    let secVal = parseNumber(kSec ? row[kSec] : null, 0);
    const minVal = parseNumber(kMin ? row[kMin] : null, 0);
    if (secVal <= 0 && minVal > 0) secVal = minVal * 60;
    if (secVal <= 0) secVal = Math.max(1, Math.round((packedDate.getTime() - openDate.getTime()) / 1000));

    packMap.set(orderUid, {
      packer: String((kPacker ? row[kPacker] : '') || 'Neznámý balič').trim(),
      station: String((kStation ? row[kStation] : '') || '(javi)').trim(),
      pack_open: openDate,
      packed: packedDate,
      pack_sec: secVal,
      pack_min: Number((secVal / 60).toFixed(2)),
      times_opened: parseNumber(kOpened ? row[kOpened] : null, 1),
      gap_since_prev_packed_sec: kGap ? parseNumber(row[kGap], undefined as any) : undefined,
    });
  }

  // 4. Procházení Picking řádků a spojení s ověřením "musi byt v datech i packed - musi byt ale sorted"
  const records: MovementRecord[] = [];
  let uniqueOrdersPickedCount = 0;
  let uniqueOrdersSortedCount = 0;
  let uniqueOrdersPackedCount = 0;
  let droppedUnsortedCount = 0;
  let droppedUnpackedCount = 0;

  for (const row of pickingRows) {
    const kBox = findKey(row, ['box', 'box_id', 'prepravka', 'sberny_box']);
    const kCycle = findKey(row, ['cycle_no', 'cycle', 'cyklus']);
    const kPickStart = findKey(row, ['pick_start', 'zacatek_pickovani', 'start']);
    const kPickEnd = findKey(row, ['pick_end', 'konec_pickovani', 'end']);
    const kPickMin = findKey(row, ['pick_min', 'pick_duration_min', 'minuty']);
    const kUnits = findKey(row, ['units', 'total_units', 'kusy']);
    const kPickers = findKey(row, ['pickers', 'picker', 'pracovnici']);
    const kProdCodes = findKey(row, ['product_codes', 'ean_produktu', 'products_list', 'polozky']);
    const kOrdersCount = findKey(row, ['orders', 'orders_count', 'pocet_objednavek']);
    const kOrderUids = findKey(row, ['order_uids', 'obsah_objednavek', 'orders_list', 'objednavky']);

    const boxCode = String((kBox ? row[kBox] : '') || 'SVJ_BOX').trim();
    const cycleNo = parseNumber(kCycle ? row[kCycle] : 1, 1);
    const pickStart = parseDateTime(kPickStart ? row[kPickStart] : null) || new Date();
    const pickEnd = parseDateTime(kPickEnd ? row[kPickEnd] : null) || pickStart;

    const totalUnits = Math.max(1, parseNumber(kUnits ? row[kUnits] : null, 1));
    const pickMinVal = parseNumber(kPickMin ? row[kPickMin] : null, 0);
    const boxPickSec = pickMinVal > 0
      ? pickMinVal * 60
      : Math.max(1, Math.round((pickEnd.getTime() - pickStart.getTime()) / 1000));

    // Parsování seznamu order_uids
    const orderUidsRaw = String((kOrderUids ? row[kOrderUids] : '') || '');
    let orderList: string[] = orderUidsRaw
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (orderList.length === 0) {
      // Pokud je přímo 1 objednávka na řádku
      const singleOrder = String(row.order_uid || row.order_id || '').trim();
      if (singleOrder) {
        orderList = [singleOrder];
      }
    }

    const ordersInBox = Math.max(1, orderList.length);
    uniqueOrdersPickedCount += ordersInBox;

    // Parsování seznamu produktů v boxu (např. "NBC001490 x1, NBC028765 x1, NBC052867 x2")
    const prodCodesRaw = String((kProdCodes ? row[kProdCodes] : '') || '');
    const productItems: { ean: string; qty: number }[] = [];
    if (prodCodesRaw) {
      const parts = prodCodesRaw.split(/[,;\n]+/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (!trimmed) continue;
        const match = trimmed.match(/^([a-zA-Z0-9_\-]+)(?:\s*[xX*]\s*(\d+))?/);
        if (match) {
          productItems.push({
            ean: match[1],
            qty: match[2] ? parseInt(match[2], 10) : 1,
          });
        } else {
          productItems.push({ ean: trimmed, qty: 1 });
        }
      }
    }

    const uniqueEansCount = Math.max(1, new Set(productItems.map(p => p.ean)).size);
    const defaultEan = productItems[0]?.ean || 'SVJ_PROD_01';

    // Ověření, zda byl box vysortován
    const sortInfo = sortMap.get(boxCode);
    const isBoxSorted = Boolean(sortInfo);

    if (isBoxSorted) {
      uniqueOrdersSortedCount += ordersInBox;
    } else {
      droppedUnsortedCount += ordersInBox;
    }

    // Nyní procházíme VŠECHNY objednávky v daném boxu – importují se všechny pro měsíční statistiky!
    for (let idx = 0; idx < orderList.length; idx++) {
      const orderUid = orderList[idx];

      // Ověření ručního balení (podmínka: musí projít sortingem i ručním balením)
      const packInfo = packMap.get(orderUid);
      const isOrderPacked = isBoxSorted && Boolean(packInfo);

      if (isOrderPacked) {
        uniqueOrdersPackedCount += 1;
      } else {
        droppedUnpackedCount += 1;
      }

      // Odhad počtu kusů na tuto objednávku
      let orderUnits = 1;
      if (totalUnits === ordersInBox) {
        orderUnits = 1;
      } else if (totalUnits > ordersInBox) {
        // Proporcionální rozdělení
        if (productItems.length > idx && productItems[idx].qty > 1) {
          orderUnits = productItems[idx].qty;
        } else {
          const avg = totalUnits / ordersInBox;
          orderUnits = Math.max(1, Math.round(avg));
        }
      }

      const assignedEan = productItems[idx % Math.max(1, productItems.length)]?.ean || defaultEan;
      const bracket = getBracket(orderUnits);

      // Alokace časů picku
      const orderPickSec = totalUnits > 0
        ? Number(((boxPickSec / totalUnits) * orderUnits).toFixed(1))
        : Number((boxPickSec / ordersInBox).toFixed(1));
      const pickPerItemSec = orderUnits > 0 ? Number((orderPickSec / orderUnits).toFixed(1)) : orderPickSec;

      // Alokace časů sortingu (pouze pokud byl box vysortován)
      const orderSortSec = (isBoxSorted && sortInfo && sortInfo.units_sorted > 0)
        ? Number(((sortInfo.sort_sec / sortInfo.units_sorted) * orderUnits).toFixed(1))
        : 0;
      const sortPerItemSec = (isBoxSorted && orderUnits > 0) ? Number((orderSortSec / orderUnits).toFixed(1)) : 0;

      // Alokace balení (výhradně z ručního balení a po sortingu)
      const orderPackSec = (isOrderPacked && packInfo) ? packInfo.pack_sec : 0;
      const packPerItemSec = (isOrderPacked && packInfo && orderUnits > 0) ? Number((orderPackSec / orderUnits).toFixed(1)) : 0;

      const totalPerItemSec = Number((pickPerItemSec + sortPerItemSec + packPerItemSec).toFixed(1));

      // Čekací doby v procesních bufferech (SVJ)
      const waitAfterPickMin = (isBoxSorted && sortInfo) ? (sortInfo.wait_after_picking_min || 0) : 0;
      const waitSortToPackMin = (isOrderPacked && sortInfo && packInfo)
        ? Math.max(0, Number(((packInfo.pack_open.getTime() - sortInfo.sort_end.getTime()) / (60 * 1000)).toFixed(1)))
        : 0;
      const waitPickToPackMin = (isOrderPacked && packInfo)
        ? Math.max(0, Number(((packInfo.pack_open.getTime() - pickEnd.getTime()) / (60 * 1000)).toFixed(1)))
        : 0;

      records.push({
        warehouse: 'svj',
        sberny_box: boxCode,
        cycle_no: cycleNo,
        obsah_objednavek: orderUid,
        pocet_produktu: orderUnits,
        ean_produktu: assignedEan,
        pocet_ks: orderUnits,
        zacatek_pickovani: formatLocalIso(pickStart),
        konec_pickovani: formatLocalIso(pickEnd),
        zacatek_sortingu: isBoxSorted && sortInfo ? formatLocalIso(sortInfo.sort_start) : '',
        konec_sortingu: isBoxSorted && sortInfo ? formatLocalIso(sortInfo.sort_end) : '',
        zacatek_baleni: isOrderPacked && packInfo ? formatLocalIso(packInfo.pack_open) : '',
        konec_baleni: isOrderPacked && packInfo ? formatLocalIso(packInfo.packed) : '',
        pick_duration_s: orderPickSec,
        sort_duration_s: orderSortSec,
        pack_duration_s: orderPackSec,
        pick_per_item_s: pickPerItemSec,
        sort_per_item_s: sortPerItemSec,
        pack_per_item_s: packPerItemSec,
        total_per_item_s: totalPerItemSec,
        bracket,
        packer: isOrderPacked && packInfo ? packInfo.packer : '',
        station: isOrderPacked && packInfo ? packInfo.station : '',
        wait_after_picking_min: waitAfterPickMin,
        wait_sort_to_pack_min: waitSortToPackMin,
        wait_pick_to_pack_min: waitPickToPackMin,
        box_unique_eans: uniqueEansCount,
        box_total_units: totalUnits,
        box_shared_skus_count: Math.max(0, uniqueEansCount - 1),
        is_sorted: isBoxSorted,
        is_packed: isOrderPacked,
      });
    }
  }

  return {
    records,
    pickingRowsCount: pickingRows.length,
    sortingRowsCount: sortingRows.length,
    packingRowsCount: packingRows.length,
    uniqueOrdersPicked: uniqueOrdersPickedCount,
    uniqueOrdersSorted: uniqueOrdersSortedCount,
    uniqueOrdersPacked: uniqueOrdersPackedCount,
    matchedCompleteOrders: uniqueOrdersPackedCount,
    droppedUnsortedOrders: droppedUnsortedCount,
    droppedUnpackedOrders: droppedUnpackedCount,
    errors,
  };
}

/**
 * Zpracuje 3 textové CSV / Excel soubory najednou
 */
export async function parseSvjTriFilesFromRawFiles(files: File[]): Promise<SvjTriFileParseResult> {
  const parsedInputs: SvjInputFile[] = [];

  for (const f of files) {
    const isExcel = f.name.endsWith('.xlsx') || f.name.endsWith('.xls');
    if (isExcel) {
      const buffer = await f.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      parsedInputs.push({
        name: f.name,
        data: jsonRows,
      });
    } else {
      const text = await f.text();
      const csvRes = Papa.parse(text, { header: true, skipEmptyLines: true });
      parsedInputs.push({
        name: f.name,
        data: csvRes.data,
      });
    }
  }

  return joinSvjTriFiles(parsedInputs);
}
