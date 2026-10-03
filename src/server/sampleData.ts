import { MovementRecord } from '../types.js';

export function generateSampleWarehouseData(daysBack: number = 14, totalRecords: number = 420): MovementRecord[] {
  const records: MovementRecord[] = [];
  const now = new Date();
  
  const sampleEans = [
    'PND01079', 'WMS0000615', 'PND02241', 'WMS0001842',
    'PND03310', 'WMS0002190', 'PND04455', 'WMS0003011',
    'PND05599', 'WMS0004120', 'PND06712', 'WMS0005510',
    '8594001230012', '8594001230029', '8594001230036', '8594001230043',
  ];

  const boxCodes = [
    'L1Z2-TR-0252', 'L1Z3-TR-0001', 'L1Z1-TR-0118', 'L2Z4-TR-0305',
    'L1Z2-TR-0412', 'L2Z1-TR-0089', 'L3Z2-TR-0155', 'L1Z4-TR-0210',
  ];

  const packers = ['P028', 'P017', 'P034', 'P009', 'P042', 'P015'];

  let orderSequence = 8385399;
  let boxIdSequence = 150020;

  for (let i = 0; i < totalRecords; i++) {
    // Distribute across daysBack days
    const dayOffset = Math.floor(Math.random() * daysBack);
    const date = new Date(now.getTime() - dayOffset * 24 * 3600 * 1000);
    
    // Shift working hours: 07:00 to 17:30
    const hour = 7 + Math.floor(Math.random() * 10);
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);
    date.setHours(hour, minute, second, 0);

    // Distribution of brackets:
    // 34% 1-item, 24% 2-items, 15% 3-items, 11% 4-items, 8% 5-items, 8% 6+ items
    const roll = Math.random();
    let itemCount: number;
    let bracket: '1' | '2' | '3' | '4' | '5' | '6+';

    if (roll < 0.34) {
      itemCount = 1;
      bracket = '1';
    } else if (roll < 0.58) {
      itemCount = 2;
      bracket = '2';
    } else if (roll < 0.73) {
      itemCount = 3;
      bracket = '3';
    } else if (roll < 0.84) {
      itemCount = 4;
      bracket = '4';
    } else if (roll < 0.92) {
      itemCount = 5;
      bracket = '5';
    } else {
      itemCount = 6 + Math.floor(Math.random() * 6); // 6 to 11 items
      bracket = '6+';
    }

    // Box grouping: group every ~6 orders into a single physical collection box
    const ordersPerBox = 6;
    const boxIndex = Math.floor(i / ordersPerBox);
    const currentBoxId = boxIdSequence + boxIndex;
    const randomBoxCode = boxCodes[boxIndex % boxCodes.length];

    // 1 in 3 boxes is High Overlap (concentrated identical/similar SKUs)
    // 1 in 3 is Medium Overlap
    // 1 in 3 is Low Overlap / High Diversity (many unique products in the same tote)
    const boxTier = boxIndex % 3; // 0 = high, 1 = medium, 2 = low
    const isHighMultipickBox = (boxTier === 0);
    const isMediumMultipickBox = (boxTier === 1);
    const isLowMultipickBox = (boxTier === 2);

    // EAN assignment based on box consolidation
    let randomEan: string;
    if (isHighMultipickBox) {
      // High overlap: almost all orders in this box share 1 or 2 specific EANs
      const coreEan = sampleEans[boxIndex % sampleEans.length];
      randomEan = Math.random() < 0.85 ? coreEan : sampleEans[(boxIndex + 1) % sampleEans.length];
    } else if (isMediumMultipickBox) {
      // Medium overlap: 2-3 shared EANs
      const coreEan = sampleEans[(boxIndex * 2) % sampleEans.length];
      randomEan = Math.random() < 0.5 ? coreEan : sampleEans[(boxIndex * 2 + 1) % sampleEans.length];
    } else {
      // Low overlap (High diversity): each order has an entirely different EAN
      randomEan = sampleEans[(i * 3 + (i % 7)) % sampleEans.length];
    }

    // Realistic warehouse timings:
    // 1. Picking:
    // High overlap amortizes travel time and picker stays at the same bin location.
    // Low overlap requires traveling to a different aisle/bin for each item.
    let basePickWalkSec: number;
    let pickTimePerUnitSec: number;
    if (isHighMultipickBox) {
      basePickWalkSec = 7 + Math.random() * 6; // 7-13s
      pickTimePerUnitSec = 6 + Math.random() * 4; // 6-10s
    } else if (isMediumMultipickBox) {
      basePickWalkSec = 14 + Math.random() * 8; // 14-22s
      pickTimePerUnitSec = 9 + Math.random() * 5; // 9-14s
    } else {
      basePickWalkSec = 24 + Math.random() * 14; // 24-38s
      pickTimePerUnitSec = 13 + Math.random() * 7; // 13-20s
    }

    const rawPickDuration = basePickWalkSec + (itemCount * pickTimePerUnitSec);
    const pickDurationSec = Math.max(8, Math.round(rawPickDuration * (Math.random() < 0.04 ? 1.2 : 1.0)));

    // 2. Packing:
    // High overlap: items in tote are uniform/standardized, no rummaging or confusion -> fast packing.
    // Low overlap: tote is chaotic with unique items, packer must search, check codes, sort -> slow packing.
    let basePackSetupSec: number;
    let secPerScan: number;

    if (isHighMultipickBox) {
      basePackSetupSec = 8 + Math.random() * 5; // 8-13s fast handling
      secPerScan = 5 + Math.random() * 2.5; // 5-7.5s scan
    } else if (isMediumMultipickBox) {
      basePackSetupSec = 14 + Math.random() * 7; // 14-21s
      secPerScan = 7 + Math.random() * 3; // 7-10s
    } else {
      // High diversity: searching through mixed tote adds significant search time per order
      basePackSetupSec = 22 + Math.random() * 12; // 22-34s search & sort
      secPerScan = 9 + Math.random() * 4; // 9-13s
    }

    const rawPackDuration = basePackSetupSec + (itemCount * secPerScan);
    const packDurationSec = Math.max(6, Math.round(rawPackDuration));

    const pickStartTime = new Date(date);
    const pickEndTime = new Date(pickStartTime.getTime() + pickDurationSec * 1000);

    // Buffer between picking and packing (wait_pick_to_pack_min): 60 to 180 mins typical in tote buffer
    const waitPickToPackMin = Number((60 + Math.random() * 120).toFixed(2));
    const packStartTime = new Date(pickEndTime.getTime() + waitPickToPackMin * 60 * 1000);
    const packEndTime = new Date(packStartTime.getTime() + packDurationSec * 1000);

    const pickPerItem = Number((pickDurationSec / itemCount).toFixed(2));
    const packPerItem = Number((packDurationSec / itemCount).toFixed(2));
    const totalPerItem = Number(((pickDurationSec + packDurationSec) / itemCount).toFixed(2));

    const orderId = String(orderSequence++);
    const randomPacker = packers[Math.floor(Math.random() * packers.length)];

    records.push({
      id: i + 1,
      box_id: currentBoxId,
      sberny_box: randomBoxCode,
      obsah_objednavek: orderId,
      pocet_produktu: itemCount,
      ean_produktu: itemCount > 1 ? `${randomEan} (+${itemCount - 1})` : randomEan,
      pocet_ks: itemCount,
      zacatek_pickovani: pickStartTime.toISOString(),
      konec_pickovani: pickEndTime.toISOString(),
      zacatek_baleni: packStartTime.toISOString(),
      konec_baleni: packEndTime.toISOString(),
      pick_duration_s: pickDurationSec,
      pack_duration_s: packDurationSec,
      pick_per_item_s: pickPerItem,
      pack_per_item_s: packPerItem,
      total_per_item_s: totalPerItem,
      bracket,
      packer: randomPacker,
      sec_per_scan: secPerScan,
      wait_pick_to_pack_min: waitPickToPackMin,
      box_unique_eans: isHighMultipickBox ? 3 : isMediumMultipickBox ? 6 : 14,
      box_total_units: isHighMultipickBox ? 48 : isMediumMultipickBox ? 36 : 24,
      box_shared_skus_count: isHighMultipickBox ? 5 : isMediumMultipickBox ? 2 : 0,
      created_at: pickStartTime.toISOString(),
    });
  }

  // Sort descending by date
  records.sort((a, b) => new Date(b.zacatek_pickovani).getTime() - new Date(a.zacatek_pickovani).getTime());
  return records;
}
