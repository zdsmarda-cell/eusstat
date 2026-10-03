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

// Parse dates in various Czech / ISO / Excel formats
function parseDateTime(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;

  const str = String(val).trim();
  if (!str) return null;

  // Try standard ISO parse
  const directDate = new Date(str);
  if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 1990) {
    return directDate;
  }

  // Try Czech format: "DD.MM.YYYY HH:mm:ss" or "D.M.YYYY H:m"
  const czechMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (czechMatch) {
    const day = Number(czechMatch[1]);
    const month = Number(czechMatch[2]) - 1;
    const year = Number(czechMatch[3]);
    const hours = Number(czechMatch[4] || 0);
    const mins = Number(czechMatch[5] || 0);
    const secs = Number(czechMatch[6] || 0);
    const d = new Date(year, month, day, hours, mins, secs);
    if (!isNaN(d.getTime())) return d;
  }

  // Try "YYYY-MM-DD HH:mm:ss"
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+|T)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const hours = Number(isoMatch[4] || 0);
    const mins = Number(isoMatch[5] || 0);
    const secs = Number(isoMatch[6] || 0);
    const d = new Date(year, month, day, hours, mins, secs);
    if (!isNaN(d.getTime())) return d;
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
 */
export function processBoxesAndScansWorkbook(workbook: XLSX.WorkBook): ParseResult | null {
  const sheetNames = workbook.SheetNames;

  // Find sheet names
  const boxesSheetName = sheetNames.find(s => {
    const n = normalizeHeader(s);
    return n.includes('box') && !n.includes('scan');
  }) || sheetNames.find(s => {
    const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[s], { defval: '', header: 1 });
    const headers = (rows[0] || []).map((h: any) => normalizeHeader(String(h)));
    return headers.includes('picking_start') || headers.includes('first_pack_scan');
  });

  const scansSheetName = sheetNames.find(s => {
    const n = normalizeHeader(s);
    return n.includes('scan');
  }) || sheetNames.find(s => {
    if (s === boxesSheetName) return false;
    const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[s], { defval: '', header: 1 });
    const headers = (rows[0] || []).map((h: any) => normalizeHeader(String(h)));
    return headers.includes('scan_timestamp') || headers.includes('order_id');
  });

  // If both sheets are identified, link them via box_id!
  if (boxesSheetName && scansSheetName) {
    const boxesRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[boxesSheetName], { defval: '' });
    const scansRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[scansSheetName], { defval: '' });

    return linkBoxesAndScans(boxesRows, scansRows, [boxesSheetName, scansSheetName]);
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

  const boxesMap = new Map<string, BoxInfo>();

  for (const row of boxesRows) {
    const boxId = String(row.box_id || row['Box ID'] || row['box id'] || '').trim();
    if (!boxId) continue;

    const boxCode = String(row.box_code || row['Box Code'] || row.sberny_box || boxId).trim();
    const orders = Math.max(1, Number(row.orders || 1));
    const units = Math.max(1, Number(row.units || orders));
    const pickStart = parseDateTime(row.picking_start || row.pick_start);
    const pickEnd = parseDateTime(row.picking_end || row.pick_end);
    const firstPack = parseDateTime(row.first_pack_scan);
    const lastPack = parseDateTime(row.last_pack_scan);
    const packMinutes = parseCzechNumber(row.pack_minutes, 0);
    const secPerScan = parseCzechNumber(row.sec_per_scan, 0);
    const waitPickToPackMin = parseCzechNumber(row.wait_pick_to_pack_min, 0);
    const packer = String(row.packer || '').trim();

    const pickDurationSec = (pickStart && pickEnd)
      ? Math.max(1, Math.round((pickEnd.getTime() - pickStart.getTime()) / 1000))
      : 60;
    const pickPerUnitSec = units > 0 ? pickDurationSec / units : 0;

    boxesMap.set(boxId, {
      box_id: boxId,
      box_code: boxCode,
      orders,
      units,
      picking_start: pickStart || new Date(),
      picking_end: pickEnd || new Date(),
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
    const boxId = String(scanRow.box_id || scanRow['Box ID'] || '').trim();
    const orderId = String(scanRow.order_id || scanRow['Order ID'] || scanRow.obsah_objednavek || '').trim();
    const ean = String(scanRow.ean || scanRow.ean_produktu || 'N/A').trim();
    const qty = Math.max(1, Number(scanRow.qty || scanRow.pocet_ks || 1));
    const scanTime = parseDateTime(scanRow.scan_timestamp || scanRow.timestamp || scanRow.cas);
    const packer = String(scanRow.packer || '').trim();

    if (!orderId) continue;

    const groupKey = `${boxId}___${orderId}`;
    if (!orderGroups.has(groupKey)) {
      orderGroups.set(groupKey, {
        box_id: boxId,
        box_code: String(scanRow.box_code || '').trim(),
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
        zacatek_pickovani: box.picking_start.toISOString(),
        konec_pickovani: box.picking_end.toISOString(),
        zacatek_baleni: firstScanTime.toISOString(),
        konec_baleni: lastScanTime.toISOString(),
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
        created_at: firstScanTime.toISOString(),
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
        zacatek_pickovani: box.picking_start.toISOString(),
        konec_pickovani: box.picking_end.toISOString(),
        zacatek_baleni: (box.first_pack_scan || box.picking_end).toISOString(),
        konec_baleni: (box.last_pack_scan || box.picking_end).toISOString(),
        pick_duration_s: box.pick_duration_s,
        pack_duration_s: Math.round(box.pack_minutes * 60) || Math.round(box.units * packPerItem),
        pick_per_item_s: pickPerItem,
        pack_per_item_s: packPerItem,
        total_per_item_s: totalPerItem,
        bracket,
        packer: box.packer,
        sec_per_scan: box.sec_per_scan,
        wait_pick_to_pack_min: box.wait_pick_to_pack_min,
        created_at: box.picking_start.toISOString(),
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

          // Try multi-sheet Boxes + Box scans join first
          const multiResult = processBoxesAndScansWorkbook(workbook);
          if (multiResult && multiResult.records.length > 0) {
            return resolve(multiResult);
          }

          // Otherwise fall back to first sheet standard parser
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          resolve(processParsedRows(jsonRows));
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

export function processParsedRows(rows: any[]): ParseResult {
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
  const colPickStart = findColumnKey(headers, ['zacatek_pickovani', 'picking_start', 'zacatek pickovani', 'pick_start', 'start_pick', 'zacatek picku']);
  const colPickEnd = findColumnKey(headers, ['konec_pickovani', 'picking_end', 'konec pickovani', 'pick_end', 'end_pick', 'konec picku']);
  const colPackStart = findColumnKey(headers, ['zacatek_baleni', 'first_pack_scan', 'zacatek baleni', 'pack_start', 'packing_start', 'start_pack', 'scan_timestamp']);
  const colPackEnd = findColumnKey(headers, ['konec_baleni', 'last_pack_scan', 'konec baleni', 'pack_end', 'packing_end', 'end_pack']);
  const colPacker = findColumnKey(headers, ['packer', 'bali', 'balic']);
  const colSecPerScan = findColumnKey(headers, ['sec_per_scan']);
  const colWaitPickToPack = findColumnKey(headers, ['wait_pick_to_pack_min']);

  const detectedColumns: Record<string, string> = {
    'Sběrný box / kód': colBox || 'Nenalezeno',
    'Číslo objednávky': colOrder || 'Nenalezeno',
    'Počet produktů celkem': colTotalItems || '(Vypočítá se ze součtu kusů)',
    'EAN produktu': colEan || 'Nenalezeno',
    'Počet kusů': colQty || '1 (výchozí)',
    'Začátek pickování': colPickStart || 'Nenalezeno',
    'Konec pickování': colPickEnd || 'Nenalezeno',
    'Začátek balení': colPackStart || 'Nenalezeno',
    'Konec balení': colPackEnd || 'Nenalezeno',
  };

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
    const sberny_box = colBox ? String(row[colBox] || '').trim() : (boxId || `BOX-${rowIndex}`);
    const obsah_objednavek = colOrder ? String(row[colOrder] || '').trim() : `OBJ-${rowIndex}`;
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

    const pickStart = colPickStart ? parseDateTime(row[colPickStart]) : null;
    const pickEnd = colPickEnd ? parseDateTime(row[colPickEnd]) : null;
    const packStart = colPackStart ? parseDateTime(row[colPackStart]) : null;
    const packEnd = colPackEnd ? parseDateTime(row[colPackEnd]) : (packStart || null);

    if (!pickStart || !pickEnd || !packStart) {
      if (errors.length < 5) {
        errors.push(`Řádek ${rowIndex}: Chybí platné datum/čas pro pickování nebo balení.`);
      }
      continue;
    }

    const actualPackEnd = packEnd || packStart;
    const pickDurationSec = Math.max(1, Math.round((pickEnd.getTime() - pickStart.getTime()) / 1000));
    const packDurationSec = Math.max(1, Math.round((actualPackEnd.getTime() - packStart.getTime()) / 1000));

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
      zacatek_pickovani: pickStart.toISOString(),
      konec_pickovani: pickEnd.toISOString(),
      zacatek_baleni: packStart.toISOString(),
      konec_baleni: actualPackEnd.toISOString(),
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
    ['150020', 'L1Z2-TR-0252', '8385399', 'PND01079', '1', '2', '2026-07-01 08:23:38', '2026-07-01 08:33:07', '2026-07-01 10:47:01', '2026-07-01 10:47:10', 'P028', '8.81', '133.91'],
    ['150020', 'L1Z2-TR-0252', '8385399', 'WMS0000615', '1', '2', '2026-07-01 08:23:38', '2026-07-01 08:33:07', '2026-07-01 10:47:01', '2026-07-01 10:47:10', 'P028', '8.81', '133.91'],
    ['150021', 'L1Z3-TR-0001', '8385400', 'PND02241', '1', '1', '2026-07-01 08:07:48', '2026-07-01 08:07:58', '2026-07-01 09:54:20', '2026-07-01 09:54:20', 'P017', '9.6', '106.37'],
    ['150021', 'L1Z3-TR-0001', '8385401', 'WMS0001842', '1', '3', '2026-07-01 08:07:48', '2026-07-01 08:07:58', '2026-07-01 09:54:30', '2026-07-01 09:54:55', 'P017', '9.6', '106.37'],
    ['150021', 'L1Z3-TR-0001', '8385401', 'PND03310', '2', '3', '2026-07-01 08:07:48', '2026-07-01 08:07:58', '2026-07-01 09:54:30', '2026-07-01 09:54:55', 'P017', '9.6', '106.37'],
  ];

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'vzor_sklad_boxes.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSampleExcel(): void {
  // Create workbook with the 2 actual sheets: "Boxes" and "Box scans"!
  const workbook = XLSX.utils.book_new();

  const boxesData = [
    {
      box_id: 150020,
      box_code: 'L1Z2-TR-0252',
      orders: 12,
      units: 84,
      picking_start: '2026-07-01 08:23:38',
      picking_end: '2026-07-01 08:33:07',
      first_pack_scan: '2026-07-01 10:47:01',
      last_pack_scan: '2026-07-01 10:59:13',
      pack_minutes: 12.19,
      sec_per_scan: 8.81,
      wait_pick_to_pack_min: 133.91,
      packer: 'P028',
    },
    {
      box_id: 150021,
      box_code: 'L1Z3-TR-0001',
      orders: 3,
      units: 6,
      picking_start: '2026-07-01 08:07:48',
      picking_end: '2026-07-01 08:07:58',
      first_pack_scan: '2026-07-01 09:54:20',
      last_pack_scan: '2026-07-01 09:55:08',
      pack_minutes: 0.8,
      sec_per_scan: 9.6,
      wait_pick_to_pack_min: 106.37,
      packer: 'P017',
    },
  ];

  const boxScansData = [
    {
      box_id: 150020,
      box_code: 'L1Z2-TR-0252',
      order_id: 8385399,
      ean: 'PND01079',
      qty: 1,
      scan_timestamp: '2026-07-01 10:47:01',
      packer: 'P028',
    },
    {
      box_id: 150020,
      box_code: 'L1Z2-TR-0252',
      order_id: 8385399,
      ean: 'WMS0000615',
      qty: 1,
      scan_timestamp: '2026-07-01 10:47:10',
      packer: 'P028',
    },
    {
      box_id: 150021,
      box_code: 'L1Z3-TR-0001',
      order_id: 8385400,
      ean: 'PND02241',
      qty: 1,
      scan_timestamp: '2026-07-01 09:54:20',
      packer: 'P017',
    },
    {
      box_id: 150021,
      box_code: 'L1Z3-TR-0001',
      order_id: 8385401,
      ean: 'WMS0001842',
      qty: 1,
      scan_timestamp: '2026-07-01 09:54:30',
      packer: 'P017',
    },
    {
      box_id: 150021,
      box_code: 'L1Z3-TR-0001',
      order_id: 8385401,
      ean: 'PND03310',
      qty: 2,
      scan_timestamp: '2026-07-01 09:54:55',
      packer: 'P017',
    },
  ];

  const wsBoxes = XLSX.utils.json_to_sheet(boxesData);
  const wsScans = XLSX.utils.json_to_sheet(boxScansData);

  XLSX.utils.book_append_sheet(workbook, wsBoxes, 'Boxes');
  XLSX.utils.book_append_sheet(workbook, wsScans, 'Box scans');

  XLSX.writeFile(workbook, 'vzor_sklad_dvouzáložkový.xlsx');
}
