import { MovementRecord } from '../types.js';

export function generateSampleSvjData(daysBack: number = 14, totalBoxesCount: number = 40): MovementRecord[] {
  const records: MovementRecord[] = [];
  const now = new Date();

  const boxCodes = [
    '0140933', '0148037', '0157350', '0157345',
    '0183524', '0157823', '0144202', '0165910',
    '0149811', '0172340', '0139982', '0188201',
  ];

  const packers = [
    { name: 'nikolas.lakatos@fhb.sk', station: '(javi)' },
    { name: 'attila.stojka@fhb.sk', station: '(javi-4)' },
    { name: 'paulina.sabinova@fhb.sk', station: '(javi)' },
    { name: 'erika.stojkova@fhb.sk', station: '(javi-13)' },
    { name: 'zdenko.kovac@fhb.sk', station: '(javi-2)' },
  ];

  const sampleProducts = [
    'NBC001490', 'NBC028765', 'NBC028816', 'NBC042323',
    'NBC043054', 'NBC048705', 'NBC049603', 'NBC052428',
    'NBC054237', 'NBC054289', 'NBC054513', 'NBC057528',
    'NBC057553', 'NBC058737', 'NBC053020', 'NBC033562',
    'NBC034994', 'NBC046717', 'NBC049659', 'NBC052867',
  ];

  let orderSeq = 4406312850;

  for (let bIdx = 0; bIdx < totalBoxesCount; bIdx++) {
    const boxCode = boxCodes[bIdx % boxCodes.length] + (bIdx >= boxCodes.length ? `_${Math.floor(bIdx / boxCodes.length)}` : '');
    const dayOffset = Math.floor(Math.random() * daysBack);
    const baseDate = new Date(now.getTime() - dayOffset * 24 * 3600 * 1000);

    // Working hours: 06:00 to 16:30
    const startHour = 6 + Math.floor(Math.random() * 8);
    const startMinute = Math.floor(Math.random() * 50);
    baseDate.setHours(startHour, startMinute, 0, 0);

    // Box characteristics
    // Number of orders in this collection box: 4 to 16 orders
    const ordersInBox = 4 + Math.floor(Math.random() * 11);
    // Number of total units in this box (mostly single items, plus some multi-items)
    const extraUnits = Math.floor(Math.random() * 6);
    const totalUnits = ordersInBox + extraUnits;

    // 1. Picking Stage
    const pickDurationMin = Number((2.5 + (totalUnits * 0.35) + Math.random() * 2).toFixed(1));
    const pickDurationSec = Math.round(pickDurationMin * 60);
    const pickStartDate = new Date(baseDate);
    const pickEndDate = new Date(pickStartDate.getTime() + pickDurationSec * 1000);

    // 2. Buffer 1 (Wait after picking before sorting)
    const waitAfterPickMin = Number((35 + Math.random() * 20).toFixed(1)); // ~35 - 55 min
    const sortStartDate = new Date(pickEndDate.getTime() + waitAfterPickMin * 60 * 1000);

    // 3. Sorting Stage
    // Duration: fast automated/semi-automated sorting (~2 - 6 seconds per item)
    const sortSecPerItem = Number((4.5 + Math.random() * 4).toFixed(1));
    const sortDurationSec = Math.round(totalUnits * sortSecPerItem);
    const sortEndDate = new Date(sortStartDate.getTime() + sortDurationSec * 1000);

    // 4. Buffer 2 (Wait after sorting before manual packing)
    const waitSortToPackMin = Number((15 + Math.random() * 25).toFixed(1)); // ~15 - 40 min

    // Box SKUs
    const boxProducts = [
      sampleProducts[(bIdx * 3) % sampleProducts.length],
      sampleProducts[(bIdx * 3 + 1) % sampleProducts.length],
      sampleProducts[(bIdx * 3 + 2) % sampleProducts.length],
    ];

    // Create individual orders inside this box
    for (let oIdx = 0; oIdx < ordersInBox; oIdx++) {
      const orderUid = String(orderSeq++);
      const packerInfo = packers[(bIdx + oIdx) % packers.length];

      // Item count distribution for this order
      let orderUnits = 1;
      const roll = Math.random();
      if (roll > 0.85) orderUnits = 3 + Math.floor(Math.random() * 3); // 3-5 items
      else if (roll > 0.65) orderUnits = 2; // 2 items
      else orderUnits = 1; // 1 item (65% singles)

      const bracket = orderUnits === 1 ? '1' : orderUnits === 2 ? '2' : orderUnits === 3 ? '3' : orderUnits === 4 ? '4' : orderUnits === 5 ? '5' : '6+';
      const assignedSku = boxProducts[oIdx % boxProducts.length];

      // Manual Packing Duration
      // Base open/verification: ~12-25s + ~6s per additional item
      const packDurationSec = Math.round(14 + (orderUnits * 7.5) + (Math.random() * 8));
      const packStartDate = new Date(sortEndDate.getTime() + (waitSortToPackMin * 60 * 1000) + (oIdx * 45 * 1000));
      const packEndDate = new Date(packStartDate.getTime() + packDurationSec * 1000);

      // Allocated durations per item
      const orderPickSec = Number(((pickDurationSec / totalUnits) * orderUnits).toFixed(1));
      const pickPerItemSec = Number((orderPickSec / orderUnits).toFixed(1));

      const orderSortSec = Number((orderUnits * sortSecPerItem).toFixed(1));
      const sortPerItemSec = sortSecPerItem;

      const packPerItemSec = Number((packDurationSec / orderUnits).toFixed(1));
      const totalPerItemSec = Number((pickPerItemSec + sortPerItemSec + packPerItemSec).toFixed(1));

      const waitPickToPackMin = Number(((packStartDate.getTime() - pickEndDate.getTime()) / (60 * 1000)).toFixed(1));

      records.push({
        warehouse: 'svj',
        sberny_box: boxCode,
        cycle_no: 1,
        obsah_objednavek: orderUid,
        pocet_produktu: orderUnits,
        ean_produktu: assignedSku,
        pocet_ks: orderUnits,
        zacatek_pickovani: pickStartDate.toISOString(),
        konec_pickovani: pickEndDate.toISOString(),
        zacatek_sortingu: sortStartDate.toISOString(),
        konec_sortingu: sortEndDate.toISOString(),
        zacatek_baleni: packStartDate.toISOString(),
        konec_baleni: packEndDate.toISOString(),
        pick_duration_s: orderPickSec,
        sort_duration_s: orderSortSec,
        pack_duration_s: packDurationSec,
        pick_per_item_s: pickPerItemSec,
        sort_per_item_s: sortPerItemSec,
        pack_per_item_s: packPerItemSec,
        total_per_item_s: totalPerItemSec,
        bracket,
        packer: packerInfo.name,
        station: packerInfo.station,
        wait_after_picking_min: waitAfterPickMin,
        wait_sort_to_pack_min: waitSortToPackMin,
        wait_pick_to_pack_min: waitPickToPackMin,
        box_unique_eans: boxProducts.length,
        box_total_units: totalUnits,
        box_shared_skus_count: Math.max(0, boxProducts.length - 1),
        units_sorted: orderUnits,
        box_units_sorted: totalUnits,
        is_sorted: true,
        is_packed: true,
      });
    }
  }

  return records;
}

/**
 * Generuje 3 ukázkové CSV soubory pro SVJ odpovídající přesným sloupcům ze screenshotů:
 * 1. Picking CSV
 * 2. Sorting CSV
 * 3. Packing CSV
 */
export function generateSampleSvjCsvFiles(): { pickingCsv: string; sortingCsv: string; packingCsv: string } {
  const sampleData = generateSampleSvjData(7, 18);

  // Group by box for picking and sorting
  const boxGroups = new Map<string, MovementRecord[]>();
  for (const r of sampleData) {
    if (!boxGroups.has(r.sberny_box)) {
      boxGroups.set(r.sberny_box, []);
    }
    boxGroups.get(r.sberny_box)!.push(r);
  }

  // 1. Picking CSV: box,cycle_no,pick_start,pick_end,pick_min,units,pickers,products,product_codes,orders,order_uids
  const pickRows: string[] = ['box,cycle_no,pick_start,pick_end,pick_min,units,pickers,products,product_codes,orders,order_uids'];
  // 2. Sorting CSV: box,cycle_no,sort_start,sort_end,sort_min,units_sorted,sorters,wait_after_picking_min
  const sortRows: string[] = ['box,cycle_no,sort_start,sort_end,sort_min,units_sorted,sorters,wait_after_picking_min'];

  for (const [boxCode, recs] of boxGroups.entries()) {
    const first = recs[0];
    const totalUnits = recs.reduce((sum, r) => sum + r.pocet_produktu, 0);
    const orderUids = recs.map(r => r.obsah_objednavek).join(', ');
    const uniqueSkus = Array.from(new Set(recs.map(r => r.ean_produktu)));
    const productCodesStr = uniqueSkus.map(s => `${s} x${Math.ceil(totalUnits / uniqueSkus.length)}`).join(', ');

    const pickSec = recs.reduce((sum, r) => sum + r.pick_duration_s, 0);
    const pickMin = (pickSec / 60).toFixed(1);

    pickRows.push(`"${boxCode}",1,"${first.zacatek_pickovani}","${first.konec_pickovani}",${pickMin},${totalUnits},1,${uniqueSkus.length},"${productCodesStr}",${recs.length},"${orderUids}"`);

    const sortSec = recs.reduce((sum, r) => sum + (r.sort_duration_s || 0), 0);
    const sortMin = (sortSec / 60).toFixed(1);
    sortRows.push(`"${boxCode}",1,"${first.zacatek_sortingu || first.konec_pickovani}","${first.konec_sortingu || first.konec_pickovani}",${sortMin},${totalUnits},1,${first.wait_after_picking_min || 42}`);
  }

  // 3. Packing CSV: order_uid,packer,station,pack_open,packed,pack_sec,pack_min,times_opened,gap_since_prev_packed_sec
  const packRows: string[] = ['order_uid,packer,station,pack_open,packed,pack_sec,pack_min,times_opened,gap_since_prev_packed_sec'];
  for (const r of sampleData) {
    const packSec = r.pack_duration_s;
    const packMin = (packSec / 60).toFixed(1);
    packRows.push(`"${r.obsah_objednavek}","${r.packer || 'nikolas.lakatos@fhb.sk'}","${r.station || '(javi)'}","${r.zacatek_baleni}","${r.konec_baleni}",${packSec},${packMin},1,${Math.floor(Math.random() * 120)}`);
  }

  return {
    pickingCsv: pickRows.join('\n'),
    sortingCsv: sortRows.join('\n'),
    packingCsv: packRows.join('\n'),
  };
}
