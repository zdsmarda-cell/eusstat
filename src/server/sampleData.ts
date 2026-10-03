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
    // 38% 1-item, 25% 2-items, 15% 3-items, 10% 4-items, 12% 5+ items
    const roll = Math.random();
    let itemCount: number;
    let bracket: '1' | '2' | '3' | '4' | '5+';

    if (roll < 0.38) {
      itemCount = 1;
      bracket = '1';
    } else if (roll < 0.63) {
      itemCount = 2;
      bracket = '2';
    } else if (roll < 0.78) {
      itemCount = 3;
      bracket = '3';
    } else if (roll < 0.88) {
      itemCount = 4;
      bracket = '4';
    } else {
      itemCount = 5 + Math.floor(Math.random() * 6); // 5 to 10 items
      bracket = '5+';
    }

    // Realistic warehouse timings matching Boxes and Box scans
    // Picking:
    // Base walking travel to aisle: 20 - 40s
    // Scan & pick per unit: 12 - 24s
    const basePickWalkSec = 18 + Math.random() * 20;
    const pickTimePerUnitSec = 12 + Math.random() * 10;
    const rawPickDuration = basePickWalkSec + (itemCount * pickTimePerUnitSec);
    const pickDurationSec = Math.max(8, Math.round(rawPickDuration * (Math.random() < 0.05 ? 1.3 : 1.0)));

    // Packing:
    // Box fold/setup + scan per unit:
    // In actual data: sec_per_scan is ~8.5 - 12s, plus order preparation ~15-25s
    const secPerScan = Number((7.5 + Math.random() * 4).toFixed(2));
    const basePackSetupSec = 18 + Math.random() * 14;
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

    const randomEan = sampleEans[Math.floor(Math.random() * sampleEans.length)];
    const randomBoxCode = boxCodes[Math.floor(Math.random() * boxCodes.length)];
    const currentBoxId = boxIdSequence + Math.floor(i / 6); // several orders per box
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
      created_at: pickStartTime.toISOString(),
    });
  }

  // Sort descending by date
  records.sort((a, b) => new Date(b.zacatek_pickovani).getTime() - new Date(a.zacatek_pickovani).getTime());
  return records;
}
