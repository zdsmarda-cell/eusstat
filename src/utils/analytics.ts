import { MovementRecord, BracketStat, DailyStat, ItemBracket } from '../types.js';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function computeBracketStatistics(records: MovementRecord[]): BracketStat[] {
  const brackets: (ItemBracket | 'all')[] = ['all', '1', '2', '3', '4', '5+'];

  const statsMap = new Map<ItemBracket | 'all', BracketStat>();

  for (const b of brackets) {
    const subset = b === 'all' ? records : records.filter(r => r.bracket === b);

    if (subset.length === 0) {
      statsMap.set(b, {
        bracket: b,
        label: getBracketLabel(b),
        shipmentCount: 0,
        itemCount: 0,
        avgPickTotalSec: 0,
        avgPickPerItemSec: 0,
        medianPickPerItemSec: 0,
        p90PickPerItemSec: 0,
        avgPackTotalSec: 0,
        avgPackPerItemSec: 0,
        medianPackPerItemSec: 0,
        p90PackPerItemSec: 0,
        avgTotalPerItemSec: 0,
        medianTotalPerItemSec: 0,
        pickSavingsPctVsSingle: 0,
        packSavingsPctVsSingle: 0,
        totalSavingsPctVsSingle: 0,
      });
      continue;
    }

    const shipmentCount = subset.length;
    const totalItems = subset.reduce((acc, r) => acc + (r.pocet_produktu || 1), 0);

    const pickTotals = subset.map(r => r.pick_duration_s);
    const packTotals = subset.map(r => r.pack_duration_s);

    const pickPerItems = subset.map(r => r.pick_per_item_s);
    const packPerItems = subset.map(r => r.pack_per_item_s);
    const totalPerItems = subset.map(r => r.total_per_item_s);

    const sumPickDuration = subset.reduce((acc, r) => acc + r.pick_duration_s, 0);
    const sumPackDuration = subset.reduce((acc, r) => acc + r.pack_duration_s, 0);

    const avgPickTotalSec = sumPickDuration / shipmentCount;
    const avgPackTotalSec = sumPackDuration / shipmentCount;

    // Weighted average per item: Total Pick Time / Total Items
    const avgPickPerItemSec = totalItems > 0 ? sumPickDuration / totalItems : 0;
    const avgPackPerItemSec = totalItems > 0 ? sumPackDuration / totalItems : 0;
    const avgTotalPerItemSec = avgPickPerItemSec + avgPackPerItemSec;

    statsMap.set(b, {
      bracket: b,
      label: getBracketLabel(b),
      shipmentCount,
      itemCount: totalItems,
      avgPickTotalSec: Number(avgPickTotalSec.toFixed(1)),
      avgPickPerItemSec: Number(avgPickPerItemSec.toFixed(1)),
      medianPickPerItemSec: Number(median(pickPerItems).toFixed(1)),
      p90PickPerItemSec: Number(percentile(pickPerItems, 90).toFixed(1)),
      avgPackTotalSec: Number(avgPackTotalSec.toFixed(1)),
      avgPackPerItemSec: Number(avgPackPerItemSec.toFixed(1)),
      medianPackPerItemSec: Number(median(packPerItems).toFixed(1)),
      p90PackPerItemSec: Number(percentile(packPerItems, 90).toFixed(1)),
      avgTotalPerItemSec: Number(avgTotalPerItemSec.toFixed(1)),
      medianTotalPerItemSec: Number(median(totalPerItems).toFixed(1)),
      pickSavingsPctVsSingle: 0,
      packSavingsPctVsSingle: 0,
      totalSavingsPctVsSingle: 0,
    });
  }

  // Calculate savings compared to single-item (1 ks) baseline
  const single = statsMap.get('1');
  if (single && single.avgTotalPerItemSec > 0) {
    for (const b of ['2', '3', '4', '5+'] as ItemBracket[]) {
      const s = statsMap.get(b);
      if (s && s.avgTotalPerItemSec > 0) {
        s.pickSavingsPctVsSingle = Number((((single.avgPickPerItemSec - s.avgPickPerItemSec) / single.avgPickPerItemSec) * 100).toFixed(1));
        s.packSavingsPctVsSingle = Number((((single.avgPackPerItemSec - s.avgPackPerItemSec) / single.avgPackPerItemSec) * 100).toFixed(1));
        s.totalSavingsPctVsSingle = Number((((single.avgTotalPerItemSec - s.avgTotalPerItemSec) / single.avgTotalPerItemSec) * 100).toFixed(1));
      }
    }
  }

  return brackets.map(b => statsMap.get(b)!);
}

export function computeDailyStatistics(records: MovementRecord[]): DailyStat[] {
  const groups = new Map<string, MovementRecord[]>();

  for (const r of records) {
    const dateStr = r.zacatek_pickovani.substring(0, 10);
    if (!groups.has(dateStr)) {
      groups.set(dateStr, []);
    }
    groups.get(dateStr)!.push(r);
  }

  const sortedDates = Array.from(groups.keys()).sort();

  return sortedDates.map(date => {
    const list = groups.get(date)!;
    const totalShipments = list.length;
    const totalItems = list.reduce((acc, r) => acc + (r.pocet_produktu || 1), 0);

    const sumPick = list.reduce((acc, r) => acc + r.pick_duration_s, 0);
    const sumPack = list.reduce((acc, r) => acc + r.pack_duration_s, 0);

    const avgPickPerItemSec = totalItems > 0 ? Number((sumPick / totalItems).toFixed(1)) : 0;
    const avgPackPerItemSec = totalItems > 0 ? Number((sumPack / totalItems).toFixed(1)) : 0;
    const avgTotalPerItemSec = Number((avgPickPerItemSec + avgPackPerItemSec).toFixed(1));

    // Date label in Czech
    const d = new Date(date + 'T12:00:00');
    const dayNames = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
    const dayLabel = `${dayNames[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;

    const bracketBreakdown: DailyStat['bracketBreakdown'] = {
      '1': { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      '2': { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      '3': { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      '4': { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      '5+': { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
    };

    (['1', '2', '3', '4', '5+'] as ItemBracket[]).forEach(b => {
      const bList = list.filter(r => r.bracket === b);
      if (bList.length > 0) {
        const bItems = bList.reduce((acc, r) => acc + (r.pocet_produktu || 1), 0);
        const bPick = bList.reduce((acc, r) => acc + r.pick_duration_s, 0);
        const bPack = bList.reduce((acc, r) => acc + r.pack_duration_s, 0);
        const pickPer = Number((bPick / bItems).toFixed(1));
        const packPer = Number((bPack / bItems).toFixed(1));
        bracketBreakdown[b] = {
          shipments: bList.length,
          items: bItems,
          avgPickPerItemSec: pickPer,
          avgPackPerItemSec: packPer,
          avgTotalPerItemSec: Number((pickPer + packPer).toFixed(1)),
        };
      }
    });

    return {
      date,
      dayLabel,
      totalShipments,
      totalItems,
      avgPickPerItemSec,
      avgPackPerItemSec,
      avgTotalPerItemSec,
      bracketBreakdown,
    };
  });
}

export function formatTimeValue(seconds: number, unit: 'sec' | 'min'): string {
  if (isNaN(seconds) || seconds <= 0) return '0 s';
  if (unit === 'min') {
    const mins = seconds / 60;
    return `${mins.toFixed(2)} min`;
  }
  return `${seconds.toFixed(1)} s`;
}

export function formatDurationHuman(seconds: number): string {
  if (isNaN(seconds) || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function getBracketLabel(b: ItemBracket | 'all'): string {
  switch (b) {
    case 'all': return 'Všechny zásilky';
    case '1': return '1 kus (Single-item)';
    case '2': return '2 kusy';
    case '3': return '3 kusy';
    case '4': return '4 kusy';
    case '5+': return '5 a více kusů (Multi-item)';
  }
}

export function getBracketBadgeColor(b: ItemBracket | 'all'): { bg: string; text: string; border: string } {
  switch (b) {
    case '1':
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' };
    case '2':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case '3':
      return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' };
    case '4':
      return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' };
    case '5+':
      return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' };
    default:
      return { bg: 'bg-slate-500/10', text: 'text-slate-300', border: 'border-slate-500/30' };
  }
}
