import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { MovementRecord, ItemBracket } from '../types.js';

export interface ParseResult {
  records: MovementRecord[];
  errors: string[];
  totalRowsFound: number;
  detectedColumns: Record<string, string>;
  sheetsFound?: string[];
}

// Clean and normalize strings for fuzzy header matching
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseCzechNumber(val: any, defaultVal: number = 0): number {
  if (val === null || val === undefined || val === '') return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  const cleaned = String(val).trim().replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? defaultVal : n;
}

// Match column aliases
function findColumnKey(headers: string[], candidates: string[]): string | null {
  const normalizedHeaders = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));
  for (const candidate of candidates) {
    const normCand = normalizeHeader(candidate);
    const found = normalizedHeaders.find(h => h.norm === normCand || h.norm.includes(normCand));
    if (found) return found.raw;
  }
  return null;
}

export function formatLocalIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${year}-${month}-${day}T${hours}:${mins}:${secs}`;
}

/**
 * Strips leading day-of-week names commonly found in Czech and European spreadsheets
 * e.g. "Pondělí 15. 7. 2024", "Út 16.07.2024", "Po 1. 7. 2024"
 */
function cleanDateStr(str: string): string {
  if (!str) return '';
  return str
    .replace(/^(pond[eě]l[ií]|[uú]ter[yý]|st[rř]eda|[cč]tvrtek|p[aá]tek|sobota|ned[eě]le|po|[uú]t|st|[cč]t|p[aá]|so|ne|mon|tue|wed|thu|fri|sat|sun)[,.:\s\-_/]+/i, '')
    .trim();
}

/**
 * Combines a separate date object/string with a separate time object/string (e.g. "15.07.2024" + "08:32:00")
 */
export function combineDateAndTime(dateVal: any, timeVal: any): Date | null {
  const d = parseDateTime(dateVal);
  if (!d) return parseDateTime(timeVal);
  if (!timeVal) return d;

  const tStr = String(timeVal).trim();
  const tMatch = tStr.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\s*(am|pm|dop\.|odp\.))?/i);
  if (tMatch) {
    let hours = parseInt(tMatch[1], 10);
    const mins = parseInt(tMatch[2], 10);
    const secs = parseInt(tMatch[3] || '0', 10);
    const ampm = (tMatch[4] || '').toLowerCase();
    if ((ampm === 'pm' || ampm === 'odp.') && hours < 12) hours += 12;
    if ((ampm === 'am' || ampm === 'dop.') && hours === 12) hours = 0;
    d.setHours(hours, mins, secs, 0);
  }
  return d;
}

// Parse dates in various Czech / European / ISO / Excel formats with zero timezone shifts
export function parseDateTime(val: any): Date | null {
  if (val === null || val === undefined || val === '') return null;

  // 1. If SheetJS already parsed into a Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    // Reading UTC components gives the exact literal date and time typed into Excel:
    return new Date(
      val.getUTCFullYear(),
      val.getUTCMonth(),
      val.getUTCDate(),
      val.getUTCHours(),
      val.getUTCMinutes(),
      val.getUTCSeconds()
    );
  }

  // 2. If Excel numeric serial date (e.g. 45600.354166)
  if (typeof val === 'number' || (typeof val === 'string' && /^\d{5}(?:\.\d+)?$/.test(String(val).trim()))) {
    const serial = Number(val);
    if (serial > 30000 && serial < 65000) {
      // 25569 days between 1900-01-01 and 1970-01-01
      const totalMs = Math.round((serial - 25569) * 86400 * 1000);
      const tempUtc = new Date(totalMs);
      return new Date(
        tempUtc.getUTCFullYear(),
        tempUtc.getUTCMonth(),
        tempUtc.getUTCDate(),
        tempUtc.getUTCHours(),
        tempUtc.getUTCMinutes(),
        tempUtc.getUTCSeconds()
      );
    }
  }

  let str = String(val).trim();
  if (!str) return null;

  // Strip leading day names ("Pondělí 15. 7. 2024", "Út 16.7.2024", etc.)
  str = cleanDateStr(str);

  // 3. Czech / European format: "D. M. YYYY", "DD. MM. YYYY", "D.M.YYYY", "DD/MM/YYYY", "DD-MM-YYYY"
  // Handles spaces after dot and optional time with optional am/pm/dop./odp.
  const czechMatch = str.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?:[,\s,T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?(?:\s*(am|pm|dop\.|odp\.))?$/i);
  if (czechMatch) {
    const day = parseInt(czechMatch[1], 10);
    const month = parseInt(czechMatch[2], 10) - 1;
    let year = parseInt(czechMatch[3], 10);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    let hours = parseInt(czechMatch[4] || '0', 10);
    const mins = parseInt(czechMatch[5] || '0', 10);
    const secs = parseInt(czechMatch[6] || '0', 10);
    const ampm = (czechMatch[7] || '').toLowerCase();
    if ((ampm === 'pm' || ampm === 'odp.') && hours < 12) hours += 12;
    if ((ampm === 'am' || ampm === 'dop.') && hours === 12) hours = 0;
    const d = new Date(year, month, day, hours, mins, secs);
    if (!isNaN(d.getTime())) return d;
  }

  // 4. ISO format: "YYYY-MM-DD HH:mm:ss" or "YYYY/MM/DD" or "YYYY-MM-DDTHH:mm:ss"
  const isoMatch = str.match(/^(\d{4})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})(?:[,\s,T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?(?:\s*(am|pm))?$/i);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    let hours = parseInt(isoMatch[4] || '0', 10);
    const mins = parseInt(isoMatch[5] || '0', 10);
    const secs = parseInt(isoMatch[6] || '0', 10);
    const ampm = (isoMatch[7] || '').toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    const d = new Date(year, month, day, hours, mins, secs);
    if (!isNaN(d.getTime())) return d;
  }

  // 5. Fallback generic Date parse only if it doesn't look like European D.M.YYYY (to avoid month/day swapping)
  if (!/^\d{1,2}\.\s*\d{1,2}\./.test(str)) {
    const directDate = new Date(str);
    if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 1990) {
      return directDate;
    }
  }

  return null;
}

export function determineBracket(itemCount: number): ItemBracket {
  if (itemCount <= 1) return '1';
  if (itemCount === 2) return '2';
  if (itemCount === 3) return '3';
  if (itemCount === 4) return '4';
  if (itemCount === 5) return '5';
  return '6+';
}

/**
 * Specifically processes multi-sheet workbook with "Boxes" and "Box scans" linked via box_id.
 * Merges across all matching sheets (e.g. Boxes Po, Boxes Út, Scans Po, Scans Út)
 */
export function processBoxesAndScansWorkbook(workbook: XLSX.WorkBook): ParseResult | null {
  const sheetNames = workbook.SheetNames;

  // Find all sheets that match boxes and scans
  const boxesSheetNames = sheetNames.filter(s => {
    const n = normalizeHeader(s);
    return (n.includes('box') && !n.includes('scan')) || n.includes('prepravk');
  });

  const scansSheetNames = sheetNames.filter(s => {
    const n = normalizeHeader(s);
    return n.includes('scan') || n.includes('sken');
  });

  // If both sheet types are identified, load and concatenate all of them!
  if (boxesSheetNames.length > 0 && scansSheetNames.length > 0) {
    let allBoxesRows: any[] = [];
    for (const bName of boxesSheetNames) {
      const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[bName], { defval: '' });
      allBoxesRows = allBoxesRows.concat(rows);
    }

    let allScansRows: any[] = [];
    for (const sName of scansSheetNames) {
      const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sName], { defval: '' });
      allScansRows = allScansRows.concat(rows);
    }

    if (allBoxesRows.length > 0 || allScansRows.length > 0) {
      return linkBoxesAndScans(allBoxesRows, allScansRows, [...boxesSheetNames, ...scansSheetNames]);
    }
  }

  // Fallback heuristic: check if any sheet has picking_start and another has scan_timestamp
  const fallbackBoxSheet = sheetNames.find(s => {
    const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[s], { defval: '', header: 1 });
    const headers = (rows[0] || []).map((h: any) => normalizeHeader(String(h)));
    return headers.includes('picking_start') || headers.includes('first_pack_scan');
  });

  const fallbackScanSheet = sheetNames.find(s => {
    if (s === fallbackBoxSheet) return false;
    const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[s], { defval: '', header: 1 });
    const headers = (rows[0] || []).map((h: any) => normalizeHeader(String(h)));
    return headers.includes('scan_timestamp') || headers.includes('order_id');
  });

  if (fallbackBoxSheet && fallbackScanSheet) {
    const bRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[fallbackBoxSheet], { defval: '' });
    const sRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[fallbackScanSheet], { defval: '' });
    return linkBoxesAndScans(bRows, sRows, [fallbackBoxSheet, fallbackScanSheet]);
  }

  return null;
}

export function linkBoxesAndScans(boxesRows: any[], scansRows: any[], sheetNames: string[] = ['Boxes', 'Box scans']): ParseResult {
  const errors: string[] = [];

  // Parse Boxes
  interface BoxInfo {
    box_id: string;
    box_code: string;
    orders: number;
    units: number;
    picking_start: Date;
    picking_end: Date;
    first_pack_scan?: Date | null;
    last_pack_scan?: Date | null;
    pack_minutes: number;
    sec_per_scan: number;
    wait_pick_to_pack_min: number;
    packer: string;
    pick_duration_s: number;
    pick_per_unit_s: number;
  }

  const bHeaders = Object.keys(boxesRows[0] || {});
  const bColId = findColumnKey(bHeaders, ['box_id', 'box id', 'boxid', 'id_boxu', 'id boxu', 'prepravka_id', 'box', 'prepravka']);
  const bColCode = findColumnKey(bHeaders, ['box_code', 'box code', 'sberny_box', 'sberny box', 'box', 'kod_boxu']);
  const bColOrders = findColumnKey(bHeaders, ['orders', 'order_count', 'pocet_objednavek', 'pocet objednavek', 'objednavky']);
  const bColUnits = findColumnKey(bHeaders, ['units', 'total_units', 'pocet_kusu', 'pocet kusu', 'celkem_kusu', 'items', 'qty']);
  const bColPickStart = findColumnKey(bHeaders, ['picking_start', 'picking start', 'pick_start', 'pick start', 'zacatek_pickovani', 'zacatek pickovani', 'start_pick', 'datum', 'date', 'cas_zahajeni', 'start', 'zahajeni', 'time', 'cas']);
  const bColPickEnd = findColumnKey(bHeaders, ['picking_end', 'picking end', 'pick_end', 'pick end', 'konec_pickovani', 'konec pickovani', 'end_pick', 'konec', 'dokonceni']);
  const bColFirstPack = findColumnKey(bHeaders, ['first_pack_scan', 'first pack scan', 'pack_start', 'zacatek_baleni', 'zacatek baleni', 'start_pack', 'scan_timestamp', 'prvni_sken']);
  const bColLastPack = findColumnKey(bHeaders, ['last_pack_scan', 'last pack scan', 'pack_end', 'konec_baleni', 'konec baleni', 'end_pack', 'posledni_sken']);
  const bColPackMin = findColumnKey(bHeaders, ['pack_minutes', 'pack minutes', 'doba_baleni', 'cas_baleni', 'pack_duration']);
  const bColSecPerScan = findColumnKey(bHeaders, ['sec_per_scan', 'sec per scan', 's_na_sken', 'sekundy_na_sken', 'scan_sec']);
  const bColWait = findColumnKey(bHeaders, ['wait_pick_to_pack_min', 'wait_pick_to_pack', 'wait_min', 'cekani_min', 'buffer_min']);
  const bColPacker = findColumnKey(bHeaders, ['packer', 'balic', 'bali', 'user', 'operator', 'pracovnik']);

  const sHeaders = Object.keys(scansRows[0] || {});
  const sColBoxId = findColumnKey(sHeaders, ['box_id', 'box id', 'boxid', 'id_boxu', 'box', 'prepravka']);
  const sColOrder = findColumnKey(sHeaders, ['order_id', 'order id', 'obsah_objednavek', 'obsah objednavek', 'objednavka', 'order', 'cislo_objednavky']);
  const sColEan = findColumnKey(sHeaders, ['ean', 'ean_produktu', 'ean produktu', 'barcode', 'barkod', 'sku', 'kod_produktu']);
  const sColQty = findColumnKey(sHeaders, ['qty', 'pocet_ks', 'pocet ks', 'quantity', 'kusy', 'ks', 'mnozstvi']);
  const sColTime = findColumnKey(sHeaders, ['scan_timestamp', 'scan timestamp', 'timestamp', 'cas', 'time', 'datum_a_cas', 'date', 'datum', 'cas_skenu', 'created_at']);
  const sColPacker = findColumnKey(sHeaders, ['packer', 'balic', 'bali', 'operator']);

  // Pre-scan earliest timestamps by box to recover box date if picking_start is missing in Boxes sheet
  const boxFirstScanTime = new Map<string, Date>();
  for (const sRow of scansRows) {
    const sBoxId = String((sColBoxId ? sRow[sColBoxId] : (sRow.box_id || sRow['Box ID'])) || '').trim();
    const sTime = parseDateTime(sColTime ? sRow[sColTime] : (sRow.scan_timestamp || sRow.timestamp || sRow.cas));
    if (sBoxId && sTime) {
      const existing = boxFirstScanTime.get(sBoxId);
      if (!existing || sTime.getTime() < existing.getTime()) {
        boxFirstScanTime.set(sBoxId, sTime);
      }
    }
  }

  const boxesMap = new Map<string, BoxInfo>();

  for (const row of boxesRows) {
    const boxId = String((bColId ? row[bColId] : (row.box_id || row['Box ID'] || row['box id'])) || '').trim();
    if (!boxId) continue;

    const boxCode = String((bColCode ? row[bColCode] : (row.box_code || row['Box Code'] || row.sberny_box)) || boxId).trim();
    const orders = Math.max(1, Number((bColOrders ? row[bColOrders] : row.orders) || 1));
    const units = Math.max(1, Number((bColUnits ? row[bColUnits] : row.units) || orders));
    let pickStart = parseDateTime(bColPickStart ? row[bColPickStart] : (row.picking_start || row.pick_start));
    let pickEnd = parseDateTime(bColPickEnd ? row[bColPickEnd] : (row.picking_end || row.pick_end));
    const firstPack = parseDateTime(bColFirstPack ? row[bColFirstPack] : row.first_pack_scan);
    const lastPack = parseDateTime(bColLastPack ? row[bColLastPack] : row.last_pack_scan);
    const packMinutes = parseCzechNumber(bColPackMin ? row[bColPackMin] : row.pack_minutes, 0);
    const secPerScan = parseCzechNumber(bColSecPerScan ? row[bColSecPerScan] : row.sec_per_scan, 0);
    const waitPickToPackMin = parseCzechNumber(bColWait ? row[bColWait] : row.wait_pick_to_pack_min, 0);
    const packer = String((bColPacker ? row[bColPacker] : row.packer) || '').trim();

    // If pick start wasn't found on box, inherit from the box's scans!
    if (!pickStart && boxFirstScanTime.has(boxId)) {
      const scanDate = boxFirstScanTime.get(boxId)!;
      pickStart = new Date(scanDate.getTime() - 45 * 60 * 1000);
      pickEnd = new Date(pickStart.getTime() + 15 * 60 * 1000);
    }

    const defaultDate = boxFirstScanTime.size > 0
      ? Array.from(boxFirstScanTime.values())[0]
      : new Date();

    const finalPickStart = pickStart || defaultDate;
    const finalPickEnd = pickEnd || new Date(finalPickStart.getTime() + 15 * 60 * 1000);

    const pickDurationSec = Math.max(1, Math.round((finalPickEnd.getTime() - finalPickStart.getTime()) / 1000));
    const pickPerUnitSec = units > 0 ? pickDurationSec / units : 0;

    boxesMap.set(boxId, {
      box_id: boxId,
      box_code: boxCode,
      orders,
      units,
      picking_start: finalPickStart,
      picking_end: finalPickEnd,
      first_pack_scan: firstPack,
      last_pack_scan: lastPack,
      pack_minutes: packMinutes,
      sec_per_scan: secPerScan,
      wait_pick_to_pack_min: waitPickToPackMin,
      packer,
      pick_duration_s: pickDurationSec,
      pick_per_unit_s: pickPerUnitSec,
    });
  }

  // Parse Box Scans and group by (box_id, order_id)
  interface OrderScanGroup {
    box_id: string;
    box_code: string;
    order_id: string;
    packer: string;
    scans: {
      ean: string;
      qty: number;
      time: Date;
    }[];
  }

  const orderGroups = new Map<string, OrderScanGroup>();

  for (const scanRow of scansRows) {
    const boxId = String((sColBoxId ? scanRow[sColBoxId] : (scanRow.box_id || scanRow['Box ID'])) || '').trim();
    const orderId = String((sColOrder ? scanRow[sColOrder] : (scanRow.order_id || scanRow['Order ID'] || scanRow.obsah_objednavek)) || '').trim();
    const ean = String((sColEan ? scanRow[sColEan] : (scanRow.ean || scanRow.ean_produktu)) || 'N/A').trim();
    const qty = Math.max(1, Number((sColQty ? scanRow[sColQty] : (scanRow.qty || scanRow.pocet_ks)) || 1));
    let scanTime = parseDateTime(sColTime ? scanRow[sColTime] : (scanRow.scan_timestamp || scanRow.timestamp || scanRow.cas));
    if (!scanTime && boxId && boxesMap.has(boxId)) {
      scanTime = boxesMap.get(boxId)!.picking_start;
    }
    const packer = String((sColPacker ? scanRow[sColPacker] : scanRow.packer) || '').trim();

    if (!orderId) continue;

    const groupKey = `${boxId}___${orderId}`;
    if (!orderGroups.has(groupKey)) {
      orderGroups.set(groupKey, {
        box_id: boxId,
        box_code: String(scanRow.box_code || (boxesMap.get(boxId)?.box_code || `BOX-${boxId}`)).trim(),
        order_id: orderId,
        packer,
        scans: [],
      });
    }

    if (scanTime) {
      orderGroups.get(groupKey)!.scans.push({ ean, qty, time: scanTime });
    }
  }

  // If scans sheet had data, build records linked to boxes
  const records: MovementRecord[] = [];

  if (orderGroups.size > 0) {
    // Also build a chronological scan order per box to attribute time between scans
    const boxAllScans = new Map<string, { time: Date; order_id: string }[]>();
    for (const group of orderGroups.values()) {
      if (!boxAllScans.has(group.box_id)) {
        boxAllScans.set(group.box_id, []);
      }
      for (const s of group.scans) {
        boxAllScans.get(group.box_id)!.push({ time: s.time, order_id: group.order_id });
      }
    }
    // Sort box scans chronologically
    for (const scans of boxAllScans.values()) {
      scans.sort((a, b) => a.time.getTime() - b.time.getTime());
    }

    // Precalculate SKU overlaps per box_id
    const boxSynergyInfo = new Map<string, { uniqueEansCount: number; totalUnits: number; sharedSkusCount: number }>();
    for (const group of orderGroups.values()) {
      if (!boxSynergyInfo.has(group.box_id)) {
        boxSynergyInfo.set(group.box_id, { uniqueEansCount: 0, totalUnits: 0, sharedSkusCount: 0 });
      }
    }
    // Track unique EANs and multi-order shared EANs
    const boxEanToOrders = new Map<string, Map<string, Set<string>>>();
    for (const group of orderGroups.values()) {
      if (!boxEanToOrders.has(group.box_id)) {
        boxEanToOrders.set(group.box_id, new Map());
      }
      const eMap = boxEanToOrders.get(group.box_id)!;
      for (const s of group.scans) {
        if (!eMap.has(s.ean)) {
          eMap.set(s.ean, new Set());
        }
        eMap.get(s.ean)!.add(group.order_id);
      }
    }
    for (const [bId, eMap] of boxEanToOrders.entries()) {
      let shared = 0;
      for (const orderSet of eMap.values()) {
        if (orderSet.size > 1) shared++;
      }
      const bUnits = (boxesMap.get(bId)?.units) || 0;
      boxSynergyInfo.set(bId, {
        uniqueEansCount: eMap.size,
        totalUnits: bUnits,
        sharedSkusCount: shared,
      });
    }

    for (const group of orderGroups.values()) {
      const box = boxesMap.get(group.box_id) || {
        box_id: group.box_id,
        box_code: group.box_code || `BOX-${group.box_id}`,
        orders: 1,
        units: 1,
        picking_start: new Date(),
        picking_end: new Date(),
        pack_minutes: 1,
        sec_per_scan: 9,
        wait_pick_to_pack_min: 60,
        packer: group.packer,
        pick_duration_s: 30,
        pick_per_unit_s: 30,
      };

      const sortedOrderScans = [...group.scans].sort((a, b) => a.time.getTime() - b.time.getTime());
      const totalOrderUnits = sortedOrderScans.reduce((sum, s) => sum + s.qty, 0) || 1;
      const bracket = determineBracket(totalOrderUnits);

      // Picking time for this order
      const orderPickSec = Math.max(1, Math.round(totalOrderUnits * box.pick_per_unit_s));
      const pickPerItem = Number((orderPickSec / totalOrderUnits).toFixed(2));

      // Packing time for this order
      const firstScanTime = sortedOrderScans[0]?.time || box.first_pack_scan || new Date();
      const lastScanTime = sortedOrderScans[sortedOrderScans.length - 1]?.time || firstScanTime;

      let orderPackSec = 0;
      const defaultSecPerScan = box.sec_per_scan > 0 ? box.sec_per_scan : 9;

      if (totalOrderUnits === 1) {
        // Single unit order: packing duration is the unit packing time (sec_per_scan)
        orderPackSec = Math.max(2, Math.round(defaultSecPerScan));
      } else {
        // Multi-unit order: time from first scan to last scan, plus base setup/carton scan
        const scanSpanSec = Math.max(1, Math.round((lastScanTime.getTime() - firstScanTime.getTime()) / 1000));
        orderPackSec = scanSpanSec + Math.round(defaultSecPerScan);
      }

      const packPerItem = Number((orderPackSec / totalOrderUnits).toFixed(2));
      const totalPerItem = Number((pickPerItem + packPerItem).toFixed(2));

      const primaryEan = sortedOrderScans[0]?.ean || 'N/A';
      const eanDisplay = totalOrderUnits > 1
        ? `${primaryEan} (+${totalOrderUnits - 1})`
        : primaryEan;

      records.push({
        box_id: box.box_id,
        sberny_box: box.box_code || group.box_code,
        obsah_objednavek: group.order_id,
        pocet_produktu: totalOrderUnits,
        ean_produktu: eanDisplay,
        pocet_ks: totalOrderUnits,
        zacatek_pickovani: formatLocalIso(box.picking_start),
        konec_pickovani: formatLocalIso(box.picking_end),
        zacatek_baleni: formatLocalIso(firstScanTime),
        konec_baleni: formatLocalIso(lastScanTime),
        pick_duration_s: orderPickSec,
        pack_duration_s: orderPackSec,
        pick_per_item_s: pickPerItem,
        pack_per_item_s: packPerItem,
        total_per_item_s: totalPerItem,
        bracket,
        packer: group.packer || box.packer,
        sec_per_scan: box.sec_per_scan,
        wait_pick_to_pack_min: box.wait_pick_to_pack_min,
        box_unique_eans: boxSynergyInfo.get(box.box_id)?.uniqueEansCount,
        box_total_units: box.units,
        box_shared_skus_count: boxSynergyInfo.get(box.box_id)?.sharedSkusCount,
        created_at: formatLocalIso(firstScanTime),
      });
    }
  } else if (boxesMap.size > 0) {
    // Only Boxes sheet was provided without scans
    let fakeOrderSeq = 8385000;
    for (const box of boxesMap.values()) {
      const avgUnitsPerOrder = Math.max(1, Math.round(box.units / box.orders));
      const bracket = determineBracket(avgUnitsPerOrder);
      const pickPerItem = Number(box.pick_per_unit_s.toFixed(2));
      const packPerItem = box.sec_per_scan > 0
        ? Number(box.sec_per_scan.toFixed(2))
        : Number(((box.pack_minutes * 60) / box.units).toFixed(2));
      const totalPerItem = Number((pickPerItem + packPerItem).toFixed(2));

      records.push({
        box_id: box.box_id,
        sberny_box: box.box_code,
        obsah_objednavek: `OBJ-${fakeOrderSeq++}`,
        pocet_produktu: avgUnitsPerOrder,
        ean_produktu: 'BOX_AGGREGATE',
        pocet_ks: box.units,
        zacatek_pickovani: formatLocalIso(box.picking_start),
        konec_pickovani: formatLocalIso(box.picking_end),
        zacatek_baleni: formatLocalIso(box.first_pack_scan || box.picking_end),
        konec_baleni: formatLocalIso(box.last_pack_scan || box.picking_end),
        pick_duration_s: box.pick_duration_s,
        pack_duration_s: Math.round(box.pack_minutes * 60) || Math.round(box.units * packPerItem),
        pick_per_item_s: pickPerItem,
        pack_per_item_s: packPerItem,
        total_per_item_s: totalPerItem,
        bracket,
        packer: box.packer,
        sec_per_scan: box.sec_per_scan,
        wait_pick_to_pack_min: box.wait_pick_to_pack_min,
        created_at: formatLocalIso(box.picking_start),
      });
    }
  }

  // Sort descending by date
  records.sort((a, b) => new Date(b.zacatek_pickovani).getTime() - new Date(a.zacatek_pickovani).getTime());

  return {
    records,
    errors,
    totalRowsFound: scansRows.length || boxesRows.length,
    sheetsFound: sheetNames,
    detectedColumns: {
      'Záložka Boxů': sheetNames[0] || 'Boxes',
      'Záložka Skenů': sheetNames[1] || 'Box scans',
      'Vazební klíč': 'box_id',
      'Počet nalezených boxů': String(boxesMap.size),
      'Počet vyhodnocených objednávek': String(records.length),
    },
  };
}

/**
 * Universal clipboard parser that can detect:
 * 1. "Boxes" table format
 * 2. "Box scans" table format
 * 3. Generic standard movements table
 */
export function parseClipboardText(rawText: string): ParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { records: [], errors: ['Vložený text je prázdný.'], totalRowsFound: 0, detectedColumns: {} };
  }

  const parsed = Papa.parse(trimmed, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const rows = parsed.data as any[];
  if (!rows || rows.length === 0) {
    return { records: [], errors: ['Nebyly nalezeny žádné řádky k parsování.'], totalRowsFound: 0, detectedColumns: {} };
  }

  const headers = Object.keys(rows[0] || {}).map(h => normalizeHeader(h));

  // Check if pasted text is Boxes format
  if (headers.includes('picking_start') && (headers.includes('first_pack_scan') || headers.includes('pack_minutes') || headers.includes('sec_per_scan'))) {
    return linkBoxesAndScans(rows, [], ['Schránka (Boxes)']);
  }

  // Check if pasted text is Box Scans format
  if (headers.includes('order_id') && headers.includes('scan_timestamp') && headers.includes('ean')) {
    // Generate synthetic box records if only scans are pasted
    const fakeBoxes: any[] = [];
    const boxIds = new Set<string>();
    for (const r of rows) {
      const bId = String(r.box_id || 'DEFAULT_BOX');
      if (!boxIds.has(bId)) {
        boxIds.add(bId);
        fakeBoxes.push({
          box_id: bId,
          box_code: r.box_code || bId,
          orders: 1,
          units: 1,
          picking_start: r.scan_timestamp,
          picking_end: r.scan_timestamp,
          first_pack_scan: r.scan_timestamp,
          last_pack_scan: r.scan_timestamp,
          sec_per_scan: 8.8,
          packer: r.packer,
        });
      }
    }
    return linkBoxesAndScans(fakeBoxes, rows, ['Schránka (Box scans)']);
  }

  return processParsedRows(rows);
}

export function parseFileContent(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });

          // 1. Try multi-sheet Boxes + Box scans join first
          const multiResult = processBoxesAndScansWorkbook(workbook);
          if (multiResult && multiResult.records.length > 0) {
            return resolve(multiResult);
          }

          // 2. Iterate through ALL sheets in the workbook!
          // Warehouse files often contain separate sheets for each day (e.g. Pondělí, Úterý, Středa, Čtvrtek, Pátek)
          const allRecords: MovementRecord[] = [];
          const processedSheets: string[] = [];
          const combinedErrors: string[] = [];
          let detectedColumns: Record<string, string> = {};

          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet) continue;
            const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            if (!jsonRows || jsonRows.length === 0) continue;

            const res = processParsedRows(jsonRows, sheetName);
            if (res.records.length > 0) {
              allRecords.push(...res.records);
              processedSheets.push(sheetName);
              if (Object.keys(detectedColumns).length === 0) {
                detectedColumns = { ...res.detectedColumns };
              }
            } else if (res.errors.length > 0 && combinedErrors.length < 5) {
              combinedErrors.push(`[${sheetName}] ${res.errors[0]}`);
            }
          }

          if (allRecords.length > 0) {
            // Sort chronologically descending
            allRecords.sort((a, b) => new Date(b.zacatek_pickovani).getTime() - new Date(a.zacatek_pickovani).getTime());
            return resolve({
              records: allRecords,
              errors: combinedErrors.slice(0, 10),
              totalRowsFound: allRecords.length,
              sheetsFound: processedSheets,
              detectedColumns: {
                ...detectedColumns,
                'Zpracované listy': `${processedSheets.join(', ')} (${processedSheets.length} listů)`,
                'Celkem načteno objednávek': String(allRecords.length),
              },
            });
          }

          // Fallback to first sheet errors if no records were found anywhere
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          resolve(processParsedRows(jsonRows, firstSheetName));
        } catch (err: any) {
          reject(new Error(`Chyba při čtení Excel souboru: ${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Chyba při načítání souboru.'));
      reader.readAsArrayBuffer(file);
    } else {
      // CSV or TSV
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
          resolve(processParsedRows(results.data as any[]));
        },
        error: (err) => {
          reject(new Error(`Chyba při parsování CSV: ${err.message}`));
        },
      });
    }
  });
}

export function processParsedRows(rows: any[], sheetName?: string): ParseResult {
  if (!rows || rows.length === 0) {
    return { records: [], errors: ['Soubor neobsahuje žádná data.'], totalRowsFound: 0, detectedColumns: {} };
  }

  const headers = Object.keys(rows[0] || {});

  const colBox = findColumnKey(headers, ['sberny_box', 'box_code', 'box', 'tote', 'sberny box', 'prepravka', 'container']);
  const colBoxId = findColumnKey(headers, ['box_id', 'box id']);
  const colOrder = findColumnKey(headers, ['obsah_objednavek', 'order_id', 'obsah objednavek', 'objednavka', 'order', 'cislo_objednavky']);
  const colTotalItems = findColumnKey(headers, ['pocet_produktu', 'units', 'pocet produktu', 'celkem_kusu', 'celkem_produktu', 'items_count', 'total_items', 'total_qty', 'pocet kusu celkem']);
  const colEan = findColumnKey(headers, ['ean_produktu', 'ean', 'ean produktu', 'barcode', 'barkod', 'kod_produktu', 'sku']);
  const colQty = findColumnKey(headers, ['pocet_ks', 'qty', 'pocet ks', 'ks', 'quantity', 'kusy']);

  // Date & Time Columns (flexible matching across all standard ERP/WMS naming conventions)
  const colDate = findColumnKey(headers, ['datum', 'date', 'den', 'day', 'datum_operace', 'datum_pohybu', 'created_at', 'vytvoreno']);
  const colTime = findColumnKey(headers, ['cas', 'time', 'cas_operace', 'cas_skenu', 'cas_zahajeni', 'cas_od', 'od']);
  const colPickStart = findColumnKey(headers, ['zacatek_pickovani', 'picking_start', 'zacatek pickovani', 'pick_start', 'start_pick', 'zacatek picku', 'pick_od', 'cas_pick', 'cas_zahajeni_picku']);
  const colPickEnd = findColumnKey(headers, ['konec_pickovani', 'picking_end', 'konec pickovani', 'pick_end', 'end_pick', 'konec picku', 'pick_do', 'cas_ukonceni_picku']);
  const colPackStart = findColumnKey(headers, ['zacatek_baleni', 'first_pack_scan', 'zacatek baleni', 'pack_start', 'packing_start', 'start_pack', 'scan_timestamp', 'pack_od', 'cas_baleni', 'cas_zahajeni_baleni']);
  const colPackEnd = findColumnKey(headers, ['konec_baleni', 'last_pack_scan', 'konec baleni', 'pack_end', 'packing_end', 'end_pack', 'pack_do', 'cas_ukonceni_baleni']);
  const colPickDuration = findColumnKey(headers, ['pick_duration_s', 'pick_duration', 'doba_pickovani', 'doba_picku', 'cas_pickovani_s', 'pick_s']);
  const colPackDuration = findColumnKey(headers, ['pack_duration_s', 'pack_duration', 'doba_baleni', 'doba_baleni_s', 'cas_baleni_s', 'pack_s']);
  const colPacker = findColumnKey(headers, ['packer', 'bali', 'balic', 'user', 'operator']);
  const colSecPerScan = findColumnKey(headers, ['sec_per_scan', 's_na_sken']);
  const colWaitPickToPack = findColumnKey(headers, ['wait_pick_to_pack_min', 'wait_min']);

  const detectedColumns: Record<string, string> = {
    'Sběrný box / kód': colBox || 'Nenalezeno',
    'Číslo objednávky': colOrder || 'Nenalezeno',
    'Počet produktů celkem': colTotalItems || '(Vypočítá se ze součtu kusů)',
    'EAN produktu': colEan || 'Nenalezeno',
    'Počet kusů': colQty || '1 (výchozí)',
    'Začátek pickování / Datum': colPickStart || colDate || 'Nenalezeno',
    'Začátek balení': colPackStart || colDate || 'Nenalezeno',
  };
  if (sheetName) {
    detectedColumns['Název listu'] = sheetName;
  }

  const errors: string[] = [];

  // Pre-aggregate order item counts if total items column isn't provided
  const orderQuantities: Record<string, number> = {};
  if (!colTotalItems && colOrder) {
    for (const row of rows) {
      const order = String(row[colOrder] || '').trim();
      const qty = colQty ? Number(row[colQty]) || 1 : 1;
      if (order) {
        orderQuantities[order] = (orderQuantities[order] || 0) + qty;
      }
    }
  }

  const records: MovementRecord[] = [];
  let rowIndex = 0;

  for (const row of rows) {
    rowIndex++;
    const boxId = colBoxId ? String(row[colBoxId] || '').trim() : undefined;
    const sberny_box = colBox ? String(row[colBox] || '').trim() : (boxId || `BOX-${sheetName ? sheetName + '-' : ''}${rowIndex}`);
    const obsah_objednavek = colOrder ? String(row[colOrder] || '').trim() : `OBJ-${sheetName ? sheetName + '-' : ''}${rowIndex}`;
    const ean_produktu = colEan ? String(row[colEan] || '').trim() : 'N/A';
    const pocet_ks = colQty ? Math.max(1, Number(row[colQty]) || 1) : 1;

    let totalItems = 1;
    if (colTotalItems && row[colTotalItems]) {
      totalItems = Math.max(1, Number(row[colTotalItems]) || 1);
    } else if (colOrder && orderQuantities[obsah_objednavek]) {
      totalItems = orderQuantities[obsah_objednavek];
    } else {
      totalItems = pocet_ks;
    }

    // 1. Resolve Pick Start
    let pickStart: Date | null = null;
    if (colPickStart && row[colPickStart]) {
      pickStart = parseDateTime(row[colPickStart]);
    }
    if (!pickStart && colDate && row[colDate]) {
      pickStart = combineDateAndTime(row[colDate], colTime ? row[colTime] : null);
    }
    if (!pickStart && colPackStart && row[colPackStart]) {
      const p = parseDateTime(row[colPackStart]);
      if (p) pickStart = new Date(p.getTime() - 10 * 60 * 1000);
    }

    // 2. Resolve Pack Start
    let packStart: Date | null = null;
    if (colPackStart && row[colPackStart]) {
      packStart = parseDateTime(row[colPackStart]);
    }
    if (!packStart && colDate && row[colDate]) {
      packStart = combineDateAndTime(row[colDate], colTime ? row[colTime] : null);
    }
    if (!packStart && pickStart) {
      packStart = new Date(pickStart.getTime() + 15 * 60 * 1000);
    }

    // If neither was found, skip this unidentifiable row
    if (!pickStart && !packStart) {
      if (errors.length < 5) {
        errors.push(`Řádek ${rowIndex}: Chybí platné datum nebo čas operace.`);
      }
      continue;
    }

    if (!pickStart) pickStart = new Date(packStart!.getTime() - 10 * 60 * 1000);
    if (!packStart) packStart = new Date(pickStart.getTime() + 10 * 60 * 1000);

    // 3. Resolve Pick End
    let pickEnd = colPickEnd ? parseDateTime(row[colPickEnd]) : null;
    const explicitPickDuration = colPickDuration ? parseCzechNumber(row[colPickDuration], 0) : 0;
    if (!pickEnd) {
      const durSec = explicitPickDuration > 0 ? explicitPickDuration : Math.max(15, totalItems * 14);
      pickEnd = new Date(pickStart.getTime() + durSec * 1000);
    }

    // 4. Resolve Pack End
    let packEnd = colPackEnd ? parseDateTime(row[colPackEnd]) : null;
    const explicitPackDuration = colPackDuration ? parseCzechNumber(row[colPackDuration], 0) : 0;
    if (!packEnd) {
      const durSec = explicitPackDuration > 0 ? explicitPackDuration : Math.max(12, totalItems * 10);
      packEnd = new Date(packStart.getTime() + durSec * 1000);
    }

    const actualPackEnd = packEnd.getTime() >= packStart.getTime() ? packEnd : packStart;
    const pickDurationSec = explicitPickDuration > 0
      ? explicitPickDuration
      : Math.max(1, Math.round((pickEnd.getTime() - pickStart.getTime()) / 1000));
    const packDurationSec = explicitPackDuration > 0
      ? explicitPackDuration
      : Math.max(1, Math.round((actualPackEnd.getTime() - packStart.getTime()) / 1000));

    const pickPerItem = Number((pickDurationSec / totalItems).toFixed(2));
    const packPerItem = Number((packDurationSec / totalItems).toFixed(2));
    const totalPerItem = Number(((pickDurationSec + packDurationSec) / totalItems).toFixed(2));

    records.push({
      box_id: boxId,
      sberny_box: sberny_box || 'BOX-UNKNOWN',
      obsah_objednavek: obsah_objednavek || `OBJ-${rowIndex}`,
      pocet_produktu: totalItems,
      ean_produktu: ean_produktu || 'EAN-UNKNOWN',
      pocet_ks,
      zacatek_pickovani: formatLocalIso(pickStart),
      konec_pickovani: formatLocalIso(pickEnd),
      zacatek_baleni: formatLocalIso(packStart),
      konec_baleni: formatLocalIso(actualPackEnd),
      pick_duration_s: pickDurationSec,
      pack_duration_s: packDurationSec,
      pick_per_item_s: pickPerItem,
      pack_per_item_s: packPerItem,
      total_per_item_s: totalPerItem,
      bracket: determineBracket(totalItems),
      packer: colPacker ? String(row[colPacker] || '') : undefined,
      sec_per_scan: colSecPerScan ? parseCzechNumber(row[colSecPerScan]) : undefined,
      wait_pick_to_pack_min: colWaitPickToPack ? parseCzechNumber(row[colWaitPickToPack]) : undefined,
    });
  }

  return {
    records,
    errors,
    totalRowsFound: rows.length,
    detectedColumns,
  };
}

export function downloadSampleCsv(): void {
  const headers = [
    'box_id',
    'box_code',
    'order_id',
    'ean',
    'qty',
    'pocet_produktu',
    'picking_start',
    'picking_end',
    'first_pack_scan',
    'last_pack_scan',
    'packer',
    'sec_per_scan',
    'wait_pick_to_pack_min',
  ];

  const rows = [
    // Pondělí 2024-07-01
    ['150020', 'L1Z2-TR-0252', '8385399', 'PND01079', '1', '2', '2024-07-01 08:23:38', '2024-07-01 08:33:07', '2024-07-01 10:47:01', '2024-07-01 10:47:10', 'P028', '8.81', '133.91'],
    ['150020', 'L1Z2-TR-0252', '8385399', 'WMS0000615', '1', '2', '2024-07-01 08:23:38', '2024-07-01 08:33:07', '2024-07-01 10:47:01', '2024-07-01 10:47:10', 'P028', '8.81', '133.91'],
    // Úterý 2024-07-02
    ['150021', 'L1Z3-TR-0001', '8385400', 'PND02241', '1', '1', '2024-07-02 08:07:48', '2024-07-02 08:07:58', '2024-07-02 09:54:20', '2024-07-02 09:54:20', 'P017', '9.60', '106.37'],
    ['150021', 'L1Z3-TR-0001', '8385401', 'WMS0001842', '1', '3', '2024-07-02 08:07:48', '2024-07-02 08:07:58', '2024-07-02 09:54:30', '2024-07-02 09:54:55', 'P017', '9.60', '106.37'],
    ['150021', 'L1Z3-TR-0001', '8385401', 'PND03310', '2', '3', '2024-07-02 08:07:48', '2024-07-02 08:07:58', '2024-07-02 09:54:30', '2024-07-02 09:54:55', 'P017', '9.60', '106.37'],
    // Středa 2024-07-03
    ['150022', 'L2Z1-TR-0089', '8385402', 'PND04455', '2', '2', '2024-07-03 09:15:10', '2024-07-03 09:22:30', '2024-07-03 11:05:00', '2024-07-03 11:05:22', 'P034', '8.50', '102.50'],
    // Čtvrtek 2024-07-04
    ['150023', 'L1Z4-TR-0210', '8385403', 'WMS0003011', '1', '1', '2024-07-04 07:45:20', '2024-07-04 07:49:10', '2024-07-04 08:50:00', '2024-07-04 08:50:11', 'P009', '7.90', '60.80'],
    // Pátek 2024-07-05
    ['150024', 'L3Z2-TR-0155', '8385404', 'PND05599', '3', '3', '2024-07-05 10:10:00', '2024-07-05 10:18:40', '2024-07-05 11:45:10', '2024-07-05 11:45:45', 'P042', '9.10', '86.50'],
  ];

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'vzor_sklad_tyden_po_pa.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSampleExcel(): void {
  // Create workbook with the 2 actual sheets: "Boxes" and "Box scans"!
  const workbook = XLSX.utils.book_new();

  const boxesData = [
    // Pondělí 2024-07-01
    {
      box_id: 150020,
      box_code: 'L1Z2-TR-0252',
      orders: 12,
      units: 84,
      picking_start: '2024-07-01 08:23:38',
      picking_end: '2024-07-01 08:33:07',
      first_pack_scan: '2024-07-01 10:47:01',
      last_pack_scan: '2024-07-01 10:59:13',
      pack_minutes: 12.19,
      sec_per_scan: 8.81,
      wait_pick_to_pack_min: 133.91,
      packer: 'P028',
    },
    // Úterý 2024-07-02
    {
      box_id: 150021,
      box_code: 'L1Z3-TR-0001',
      orders: 3,
      units: 6,
      picking_start: '2024-07-02 08:07:48',
      picking_end: '2024-07-02 08:07:58',
      first_pack_scan: '2024-07-02 09:54:20',
      last_pack_scan: '2024-07-02 09:55:08',
      pack_minutes: 0.8,
      sec_per_scan: 9.6,
      wait_pick_to_pack_min: 106.37,
      packer: 'P017',
    },
    // Středa 2024-07-03
    {
      box_id: 150022,
      box_code: 'L2Z1-TR-0089',
      orders: 5,
      units: 14,
      picking_start: '2024-07-03 09:15:10',
      picking_end: '2024-07-03 09:22:30',
      first_pack_scan: '2024-07-03 11:05:00',
      last_pack_scan: '2024-07-03 11:07:15',
      pack_minutes: 2.25,
      sec_per_scan: 8.5,
      wait_pick_to_pack_min: 102.5,
      packer: 'P034',
    },
    // Čtvrtek 2024-07-04
    {
      box_id: 150023,
      box_code: 'L1Z4-TR-0210',
      orders: 4,
      units: 10,
      picking_start: '2024-07-04 07:45:20',
      picking_end: '2024-07-04 07:49:10',
      first_pack_scan: '2024-07-04 08:50:00',
      last_pack_scan: '2024-07-04 08:51:30',
      pack_minutes: 1.5,
      sec_per_scan: 7.9,
      wait_pick_to_pack_min: 60.8,
      packer: 'P009',
    },
    // Pátek 2024-07-05
    {
      box_id: 150024,
      box_code: 'L3Z2-TR-0155',
      orders: 6,
      units: 18,
      picking_start: '2024-07-05 10:10:00',
      picking_end: '2024-07-05 10:18:40',
      first_pack_scan: '2024-07-05 11:45:10',
      last_pack_scan: '2024-07-05 11:48:20',
      pack_minutes: 3.16,
      sec_per_scan: 9.1,
      wait_pick_to_pack_min: 86.5,
      packer: 'P042',
    },
  ];

  const boxScansData = [
    // Pondělí
    {
      box_id: 150020,
      box_code: 'L1Z2-TR-0252',
      order_id: 8385399,
      ean: 'PND01079',
      qty: 1,
      scan_timestamp: '2024-07-01 10:47:01',
      packer: 'P028',
    },
    {
      box_id: 150020,
      box_code: 'L1Z2-TR-0252',
      order_id: 8385399,
      ean: 'WMS0000615',
      qty: 1,
      scan_timestamp: '2024-07-01 10:47:10',
      packer: 'P028',
    },
    // Úterý
    {
      box_id: 150021,
      box_code: 'L1Z3-TR-0001',
      order_id: 8385400,
      ean: 'PND02241',
      qty: 1,
      scan_timestamp: '2024-07-02 09:54:20',
      packer: 'P017',
    },
    {
      box_id: 150021,
      box_code: 'L1Z3-TR-0001',
      order_id: 8385401,
      ean: 'WMS0001842',
      qty: 1,
      scan_timestamp: '2024-07-02 09:54:30',
      packer: 'P017',
    },
    {
      box_id: 150021,
      box_code: 'L1Z3-TR-0001',
      order_id: 8385401,
      ean: 'PND03310',
      qty: 2,
      scan_timestamp: '2024-07-02 09:54:55',
      packer: 'P017',
    },
    // Středa
    {
      box_id: 150022,
      box_code: 'L2Z1-TR-0089',
      order_id: 8385402,
      ean: 'PND04455',
      qty: 2,
      scan_timestamp: '2024-07-03 11:05:22',
      packer: 'P034',
    },
    // Čtvrtek
    {
      box_id: 150023,
      box_code: 'L1Z4-TR-0210',
      order_id: 8385403,
      ean: 'WMS0003011',
      qty: 1,
      scan_timestamp: '2024-07-04 08:50:11',
      packer: 'P009',
    },
    // Pátek
    {
      box_id: 150024,
      box_code: 'L3Z2-TR-0155',
      order_id: 8385404,
      ean: 'PND05599',
      qty: 3,
      scan_timestamp: '2024-07-05 11:45:45',
      packer: 'P042',
    },
  ];

  const wsBoxes = XLSX.utils.json_to_sheet(boxesData);
  const wsScans = XLSX.utils.json_to_sheet(boxScansData);

  XLSX.utils.book_append_sheet(workbook, wsBoxes, 'Boxes');
  XLSX.utils.book_append_sheet(workbook, wsScans, 'Box scans');

  XLSX.writeFile(workbook, 'vzor_sklad_tyden_po_pa.xlsx');
}
