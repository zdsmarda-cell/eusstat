import React from 'react';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Layers,
  Package,
  Boxes,
  Clock,
  Shuffle,
  Hourglass,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  BarChart3,
  Scale,
  Minus,
  Sparkles,
  Tag,
  Zap,
} from 'lucide-react';
import { MovementRecord, WarehouseComparisonReport } from '../types.js';
import { computeWarehouseComparison, formatTimeValue } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface WarehouseComparisonSummaryProps {
  ruseRecords: MovementRecord[];
  svjRecords: MovementRecord[];
  unit: 'sec' | 'min';
  cachedReport?: WarehouseComparisonReport | null;
}

export const WarehouseComparisonSummary: React.FC<WarehouseComparisonSummaryProps> = ({
  ruseRecords,
  svjRecords,
  unit,
  cachedReport,
}) => {
  const { lang } = useLanguage();
  const isCs = lang === 'cs';

  const report: WarehouseComparisonReport = cachedReport || computeWarehouseComparison(ruseRecords, svjRecords);

  const formatDelta = (valRuse: number, valSvj: number, unitLabel: string = '') => {
    const diff = valSvj - valRuse;
    const pct = valRuse > 0 ? ((diff / valRuse) * 100).toFixed(1) : '0';
    const isHigher = diff > 0;
    const isNeutral = Math.abs(diff) < 0.05;

    if (isNeutral) {
      return (
        <span className="text-slate-400 font-mono text-xs flex items-center">
          <Minus className="w-3 h-3 mr-0.5" /> 0 %
        </span>
      );
    }

    return (
      <span
        className={`font-mono text-xs font-semibold flex items-center ${
          isHigher ? 'text-amber-400' : 'text-emerald-400'
        }`}
      >
        {isHigher ? '+' : ''}{diff.toFixed(1)} {unitLabel} ({isHigher ? '+' : ''}{pct} %)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Executive Comparison Header Banner */}
      <div className="bg-gradient-to-r from-blue-950/50 via-slate-900/90 to-purple-950/50 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <Scale className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-black text-white tracking-tight">
                {isCs ? 'Srovnávací přehled skladů: Ruse vs SVJ' : 'Cross-Warehouse Comparison: Ruse vs SVJ'}
              </h2>
            </div>
            <p className="text-xs text-slate-400 pl-11.5">
              {isCs
                ? 'Globální porovnání klíčových ukazatelů výkonnosti (KPI), rychlostí operací na 1 kus, vlivu sortingu v SVJ a průchodnosti zakázek.'
                : 'Comparative analysis of key KPIs, operational cycle times per item, sorting impact in SVJ, and order throughput.'}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <div className="px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs text-blue-300 font-bold flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Sklad Ruse ({report.ruseTotalOrders.toLocaleString('cs-CZ')} obj.)</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-xs text-purple-300 font-bold flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>Sklad SVJ ({report.svjTotalOrders.toLocaleString('cs-CZ')} obj.)</span>
            </div>
          </div>
        </div>

        {/* 6 Key Cross-KPI Metric Comparison Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-5">
          {/* 1. Objednávky & Kusy */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Objem objednávek a kusů' : 'Orders & Units'}</span>
              <Package className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse</span>
                <span className="text-xl font-bold text-white font-mono">{report.ruseTotalOrders.toLocaleString('cs-CZ')}</span>
                <span className="text-[11px] text-slate-400 block">{report.ruseTotalUnits.toLocaleString('cs-CZ')} ks</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ</span>
                <span className="text-xl font-bold text-white font-mono">{report.svjTotalOrders.toLocaleString('cs-CZ')}</span>
                <span className="text-[11px] text-slate-400 block">{report.svjTotalUnits.toLocaleString('cs-CZ')} ks</span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">{isCs ? 'Průměr ks / zásilka:' : 'Avg items / order:'}</span>
              <span className="font-mono text-slate-200">
                Ruse: <strong>{report.ruseAvgUnitsPerOrder}</strong> vs SVJ: <strong>{report.svjAvgUnitsPerOrder}</strong>
              </span>
            </div>
          </div>

          {/* 2. Doba pickování na 1 kus (Medián na 1. místě, Průměr na 2. místě) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Doba pickování (1 ks)' : 'Picking Time / Item'}</span>
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse (Medián)</span>
                <span className="text-xl font-bold text-white font-mono">{formatTimeValue(report.ruseMedianPickPerItemSec, unit)}</span>
                <span className="text-[11px] text-slate-400 block font-mono">Ø {formatTimeValue(report.ruseAvgPickPerItemSec, unit)}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ (Medián)</span>
                <span className="text-xl font-bold text-purple-400 font-mono">{formatTimeValue(report.svjMedianPickPerItemSec, unit)}</span>
                <span className="text-[11px] text-purple-300/80 block font-mono">Ø {formatTimeValue(report.svjAvgPickPerItemSec, unit)}</span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">{isCs ? 'Rozdíl mediánů:' : 'Median diff:'}</span>
              {formatDelta(report.ruseMedianPickPerItemSec, report.svjMedianPickPerItemSec, 's')}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>{isCs ? 'Rozdíl průměrů (Ø):' : 'Mean diff (Ø):'}</span>
              {formatDelta(report.ruseAvgPickPerItemSec, report.svjAvgPickPerItemSec, 's')}
            </div>
          </div>

          {/* 3. Doba ručního balení na 1 kus (Medián na 1. místě, Průměr na 2. místě) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Ruční balení (1 ks)' : 'Manual Packing / Item'}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse (Medián)</span>
                <span className="text-xl font-bold text-white font-mono">{formatTimeValue(report.ruseMedianPackPerItemSec, unit)}</span>
                <span className="text-[11px] text-slate-400 block font-mono">Ø {formatTimeValue(report.ruseAvgPackPerItemSec, unit)}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ (Medián)</span>
                <span className="text-xl font-bold text-emerald-400 font-mono">{formatTimeValue(report.svjMedianPackPerItemSec, unit)}</span>
                <span className="text-[11px] text-emerald-300/80 block font-mono">Ø {formatTimeValue(report.svjAvgPackPerItemSec, unit)}</span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">{isCs ? 'Rozdíl mediánů:' : 'Median pack diff:'}</span>
              {formatDelta(report.ruseMedianPackPerItemSec, report.svjMedianPackPerItemSec, 's')}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>{isCs ? 'Rozdíl průměrů (Ø):' : 'Mean pack diff (Ø):'}</span>
              {formatDelta(report.ruseAvgPackPerItemSec, report.svjAvgPackPerItemSec, 's')}
            </div>
          </div>

          {/* 4. Sorting v SVJ (Operace navíc - Medián na 1. místě, Průměr na 2. místě) */}
          <div className="bg-slate-950/70 border border-purple-500/30 rounded-2xl p-4.5 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider text-purple-300">{isCs ? 'Sorting v SVJ (Operace navíc)' : 'SVJ Sorting Stage'}</span>
              <Shuffle className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 block">Ruse</span>
                <span className="text-lg font-bold text-slate-500 font-mono">{isCs ? 'Neprovádí se' : 'None'}</span>
                <span className="text-[11px] text-slate-500 block">{isCs ? 'Přímé balení' : 'Direct pack'}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ Sorting</span>
                <span className="text-xl font-bold text-purple-400 font-mono">{formatTimeValue(report.svjMedianSortPerItemSec, unit)}</span>
                <span className="text-[11px] text-purple-300/80 block font-mono">Ø {formatTimeValue(report.svjAvgSortPerItemSec, unit)}</span>
              </div>
            </div>
            <div className="mt-2.5 text-xs text-slate-400">
              {isCs ? 'V SVJ jsou zakázky před balením přetříděny ze sběrného boxu.' : 'In SVJ, orders are pre-sorted from the collection tote before packing.'}
            </div>
          </div>

          {/* 5. Medián objednávek v boxu */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Medián objednávek v 1 boxu' : 'Median Orders / Box'}</span>
              <Boxes className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse</span>
                <span className="text-xl font-bold text-white font-mono">{report.ruseMedianOrdersPerBox} obj.</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ</span>
                <span className="text-xl font-bold text-white font-mono">{report.svjMedianOrdersPerBox} obj.</span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">{isCs ? 'Hustota konsolidace:' : 'Consolidation density:'}</span>
              <span className="font-mono text-slate-300">
                {report.svjMedianOrdersPerBox > report.ruseMedianOrdersPerBox ? (isCs ? 'Vyšší v SVJ' : 'Higher in SVJ') : (isCs ? 'Vyšší v Ruse' : 'Higher in Ruse')}
              </span>
            </div>
          </div>

          {/* 6. Celkový lead time zakázky (Včetně bufferů) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Celková doba zakázky ve skladu' : 'Total Order Lead Time'}</span>
              <Hourglass className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse</span>
                <span className="text-xl font-bold text-white font-mono">~{report.ruseAvgTotalLeadTimeMin} min</span>
                <span className="text-[11px] text-slate-400 block">Pick + Buffer + Pack</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ</span>
                <span className="text-xl font-bold text-cyan-400 font-mono">~{report.svjAvgTotalLeadTimeMin} min</span>
                <span className="text-[11px] text-slate-400 block">Pick + Buf1 + Sort + Buf2 + Pack</span>
              </div>
            </div>
            <div className="mt-2.5 text-xs text-slate-400">
              {isCs ? `SVJ má 2 meziskladové fronty: ~${report.svjAvgWaitPickToSortMin} min a ~${report.svjAvgWaitSortToPackMin} min` : `SVJ has 2 queue buffers: ~${report.svjAvgWaitPickToSortMin} min and ~${report.svjAvgWaitSortToPackMin} min`}
            </div>
          </div>

          {/* 7. Profil SKU & Pareto 80/20 */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Sortiment SKU & Pareto 80 %' : 'SKU Profile & Pareto 80%'}</span>
              <Tag className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2.5 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse</span>
                <span className="text-lg font-bold text-white font-mono">{report.ruseTotalSkus.toLocaleString('cs-CZ')} SKU</span>
                <span className="text-[10px] text-amber-300 font-semibold block mt-0.5">
                  80%: {report.ruseTop80SkusCount.toLocaleString('cs-CZ')}
                </span>
                <span className="text-[10px] text-slate-400 block">({report.ruseTop80SkusSharePct}%)</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ</span>
                <span className="text-lg font-bold text-white font-mono">{report.svjTotalSkus.toLocaleString('cs-CZ')} SKU</span>
                <span className="text-[10px] text-amber-300 font-semibold block mt-0.5">
                  80%: {report.svjTop80SkusCount.toLocaleString('cs-CZ')}
                </span>
                <span className="text-[10px] text-slate-400 block">({report.svjTop80SkusSharePct}%)</span>
              </div>
              <div className="border-l border-slate-800 pl-2">
                <span className="text-[11px] font-semibold text-emerald-400 block">{isCs ? 'Celkem' : 'Total'}</span>
                <span className="text-lg font-bold text-emerald-300 font-mono">
                  {(report.totalCombinedSkus || (report.ruseTotalSkus + report.svjTotalSkus)).toLocaleString('cs-CZ')} SKU
                </span>
                <span className="text-[10px] text-amber-300 font-semibold block mt-0.5">
                  80%: {(report.totalCombinedTop80SkusCount || (report.ruseTop80SkusCount + report.svjTop80SkusCount)).toLocaleString('cs-CZ')}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  ({report.totalCombinedTop80SkusSharePct || Math.round(((report.ruseTop80SkusCount + report.svjTop80SkusCount) / Math.max(1, report.ruseTotalSkus + report.svjTotalSkus)) * 100)}%)
                </span>
              </div>
            </div>
            <div className="mt-2.5 text-xs text-slate-400 flex items-center justify-between">
              <span>{isCs ? 'Koncentrace sortimentu (Pareto):' : 'Catalog concentration:'}</span>
              <span className="font-mono text-slate-300 font-semibold">
                {report.ruseTop80SkusSharePct < report.svjTop80SkusSharePct
                  ? (isCs ? 'Užší portfolio v Ruse' : 'Narrower in Ruse')
                  : (isCs ? 'Užší portfolio v SVJ' : 'Narrower in SVJ')}
              </span>
            </div>
          </div>

          {/* 8. Multipicking - Potenciál optimalizace */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Potenciál Multipickingu' : 'Multipick Potential'}</span>
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2.5 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse úspora</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {report.ruseMultipickSavedHours > 0 ? `~${report.ruseMultipickSavedHours} h` : '0 h'}
                </span>
                <span className="text-[10px] text-slate-300 block font-mono">
                  ({report.ruseMultipickSavingsPct} %)
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ úspora</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {report.svjMultipickSavedHours > 0 ? `~${report.svjMultipickSavedHours} h` : '0 h'}
                </span>
                <span className="text-[10px] text-slate-300 block font-mono">
                  ({report.svjMultipickSavingsPct} %)
                </span>
              </div>
              <div className="border-l border-slate-800 pl-2">
                <span className="text-[11px] font-semibold text-emerald-400 block">{isCs ? 'Celkem oba' : 'Combined'}</span>
                <span className="text-lg font-bold text-emerald-300 font-mono">
                  ~{(report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1)))} h
                </span>
                <span className="text-[10px] text-slate-300 block font-mono">
                  ({report.totalCombinedMultipickSavingsPct !== undefined ? report.totalCombinedMultipickSavingsPct : Math.round((report.ruseMultipickSavingsPct + report.svjMultipickSavingsPct) / 2)} %)
                </span>
              </div>
            </div>
            <div className="mt-2.5 text-xs text-slate-400">
              {isCs
                ? `Simulace 2h slotů zvýší multipick: Ruse (${report.ruseBaselineMultipickRatioPct}% → ${report.ruseSimulatedMultipickRatioPct}%), SVJ (${report.svjBaselineMultipickRatioPct}% → ${report.svjSimulatedMultipickRatioPct}%)`
                : `2h slots increase multipick ratio: Ruse (${report.ruseBaselineMultipickRatioPct}% → ${report.ruseSimulatedMultipickRatioPct}%), SVJ (${report.svjBaselineMultipickRatioPct}% → ${report.svjSimulatedMultipickRatioPct}%)`}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Bracket-by-Bracket Side-by-Side Comparison (1, 2, 3, 4, 5, 6+ ks) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <span>{isCs ? 'Srovnání podle velikosti zakázky (1, 2, 3, 4, 5, 6+ ks)' : 'Comparison by Order Size Brackets (1, 2, 3, 4, 5, 6+ items)'}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isCs
              ? 'Detailní rozpad časů pickování a ručního balení na 1 kus pro jednotlivé koše zakázek mezi skladem Ruse a SVJ.'
              : 'Detailed breakdown of picking and packing time per item across shipment size brackets.'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider">{isCs ? 'Kategorie (Bracket)' : 'Bracket'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right">{isCs ? 'Obj. Ruse' : 'Ruse Orders'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right">{isCs ? 'Obj. SVJ' : 'SVJ Orders'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-blue-400">{isCs ? 'Pick Ruse (Medián / Ø)' : 'Ruse Pick (Med / Ø)'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-purple-400">{isCs ? 'Pick SVJ (Medián / Ø)' : 'SVJ Pick (Med / Ø)'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-emerald-400">{isCs ? 'Pack Ruse (Medián / Ø)' : 'Ruse Pack (Med / Ø)'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-teal-400">{isCs ? 'Pack SVJ (Medián / Ø)' : 'SVJ Pack (Med / Ø)'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-purple-300">{isCs ? 'Sorting SVJ (Medián / Ø)' : 'SVJ Sort (Med / Ø)'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right">{isCs ? 'Rozdíl Pick (Med / Ø)' : 'Pick Diff (Med / Ø)'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right">{isCs ? 'Rozdíl Pack (Med / Ø)' : 'Pack Diff (Med / Ø)'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {report.bracketComparisons.map((row) => {
                const isAll = row.bracket === 'all';
                return (
                  <tr
                    key={row.bracket}
                    className={`hover:bg-slate-800/30 transition-colors ${
                      isAll ? 'bg-indigo-950/20 font-bold border-t-2 border-indigo-500/30' : ''
                    }`}
                  >
                    <td className="py-3 px-3.5 font-sans font-semibold text-white flex items-center space-x-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isAll ? 'bg-indigo-400' : 'bg-slate-500'}`} />
                      <span>{row.label}</span>
                    </td>
                    <td className="py-3 px-3.5 text-right text-slate-300">{row.ruseOrders.toLocaleString('cs-CZ')}</td>
                    <td className="py-3 px-3.5 text-right text-slate-300">{row.svjOrders.toLocaleString('cs-CZ')}</td>
                    <td className="py-3 px-3.5 text-right text-blue-300">
                      <div className="font-bold text-white">{formatTimeValue(row.ruseMedianPickPerItemSec, unit)}</div>
                      <div className="text-[10px] text-slate-400 font-normal">Ø {formatTimeValue(row.ruseAvgPickPerItemSec, unit)}</div>
                    </td>
                    <td className="py-3 px-3.5 text-right text-purple-300">
                      <div className="font-bold text-purple-300">{formatTimeValue(row.svjMedianPickPerItemSec, unit)}</div>
                      <div className="text-[10px] text-purple-400/80 font-normal">Ø {formatTimeValue(row.svjAvgPickPerItemSec, unit)}</div>
                    </td>
                    <td className="py-3 px-3.5 text-right text-emerald-300">
                      <div className="font-bold text-emerald-300">{formatTimeValue(row.ruseMedianPackPerItemSec, unit)}</div>
                      <div className="text-[10px] text-slate-400 font-normal">Ø {formatTimeValue(row.ruseAvgPackPerItemSec, unit)}</div>
                    </td>
                    <td className="py-3 px-3.5 text-right text-teal-300">
                      <div className="font-bold text-teal-300">{formatTimeValue(row.svjMedianPackPerItemSec, unit)}</div>
                      <div className="text-[10px] text-teal-400/80 font-normal">Ø {formatTimeValue(row.svjAvgPackPerItemSec, unit)}</div>
                    </td>
                    <td className="py-3 px-3.5 text-right text-purple-400">
                      {row.svjMedianSortPerItemSec > 0 ? (
                        <>
                          <div className="font-bold text-purple-300">{formatTimeValue(row.svjMedianSortPerItemSec, unit)}</div>
                          <div className="text-[10px] text-purple-400/80 font-normal">Ø {formatTimeValue(row.svjAvgSortPerItemSec, unit)}</div>
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="py-3 px-3.5 text-right font-semibold">
                      <div className={row.pickMedianDiffPct > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                        {row.pickMedianDiffPct > 0 ? '+' : ''}{row.pickMedianDiffPct}%
                      </div>
                      <div className={`text-[10px] font-normal ${row.pickDiffPct > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        Ø {row.pickDiffPct > 0 ? '+' : ''}{row.pickDiffPct}%
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-right font-semibold">
                      <div className={row.packMedianDiffPct > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                        {row.packMedianDiffPct > 0 ? '+' : ''}{row.packMedianDiffPct}%
                      </div>
                      <div className={`text-[10px] font-normal ${row.packDiffPct > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        Ø {row.packDiffPct > 0 ? '+' : ''}{row.packDiffPct}%
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2b: Srovnání potenciálu optimalizace Multipickingu (2h časové sloty) */}
      <div className="bg-slate-900/80 border border-emerald-500/30 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Zap className="w-5 h-5 text-emerald-400" />
              <span>{isCs ? 'Srovnání optimalizace z multipickingu (přeskupení do 2h slotů)' : 'Multipicking Optimization Potential (2-hour Slot Simulation)'}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {isCs
                ? 'Porovnání potenciálních časových úspor při shlukování stejných SKU do společných sběrných boxů přes 2h vlnové sloty.'
                : 'Comparison of potential time and labor savings when batching shared SKUs into 2-hour collection waves.'}
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs rounded-xl self-start sm:self-auto">
            {isCs ? 'Model úspor' : 'Savings Model'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Ruse Multipicking Card */}
          <div className="p-4 bg-slate-950/70 border border-blue-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-400 flex items-center space-x-1.5">
                <Building2 className="w-4 h-4" />
                <span>{isCs ? 'Sklad Ruse — Multipicking' : 'Ruse Warehouse — Multipicking'}</span>
              </span>
              <span className="font-mono text-emerald-400 font-bold">
                ~{report.ruseMultipickSavedHours} h úspora ({report.ruseMultipickSavingsPct} %)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono">
              <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">{isCs ? 'Stávající multipick:' : 'Baseline multipick:'}</span>
                <span className="text-sm font-bold text-white">{report.ruseBaselineMultipickRatioPct} %</span>
              </div>
              <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[10px] text-emerald-400 block font-sans">{isCs ? 'Simulovaný multipick:' : 'Simulated multipick:'}</span>
                <span className="text-sm font-bold text-emerald-400">{report.ruseSimulatedMultipickRatioPct} %</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              {isCs
                ? `V Ruse umožňuje přeskupení do 2h slotů ušetřit ~${report.ruseMultipickSavedHours} hodin práce pickování díky přímému sběru stejných položek do boxu.`
                : `In Ruse, wave clustering into 2h slots can save ~${report.ruseMultipickSavedHours} hours of picking labor.`}
            </p>
          </div>

          {/* SVJ Multipicking Card */}
          <div className="p-4 bg-slate-950/70 border border-purple-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-400 flex items-center space-x-1.5">
                <Shuffle className="w-4 h-4" />
                <span>{isCs ? 'Sklad SVJ — Multipicking' : 'SVJ Warehouse — Multipicking'}</span>
              </span>
              <span className="font-mono text-emerald-400 font-bold">
                ~{report.svjMultipickSavedHours} h úspora ({report.svjMultipickSavingsPct} %)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono">
              <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">{isCs ? 'Stávající multipick:' : 'Baseline multipick:'}</span>
                <span className="text-sm font-bold text-white">{report.svjBaselineMultipickRatioPct} %</span>
              </div>
              <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[10px] text-emerald-400 block font-sans">{isCs ? 'Simulovaný multipick:' : 'Simulated multipick:'}</span>
                <span className="text-sm font-bold text-emerald-400">{report.svjSimulatedMultipickRatioPct} %</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              {isCs
                ? `V SVJ je potenciál úspory ~${report.svjMultipickSavedHours} hodin. Vzhledem k následnému sortingu je synergický efekt v pickování maximalizován.`
                : `In SVJ, the savings potential is ~${report.svjMultipickSavedHours} hours with automated downstream sorting.`}
            </p>
          </div>

          {/* Combined Total Savings Card */}
          <div className="p-4 bg-slate-950/70 border border-emerald-500/40 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-400 flex items-center space-x-1.5">
                <Scale className="w-4 h-4" />
                <span>{isCs ? 'Celková úspora (oba sklady)' : 'Combined Savings (Both Sites)'}</span>
              </span>
              <span className="font-mono text-emerald-300 font-bold">
                ~{(report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1)))} h
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono">
              <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">{isCs ? 'Průměrná úspora času:' : 'Avg time savings:'}</span>
                <span className="text-sm font-bold text-emerald-400">
                  {report.totalCombinedMultipickSavingsPct !== undefined ? report.totalCombinedMultipickSavingsPct : Math.round((report.ruseMultipickSavingsPct + report.svjMultipickSavingsPct) / 2)} %
                </span>
              </div>
              <div className="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">{isCs ? 'Simulovaný cíl:' : 'Simulated goal:'}</span>
                <span className="text-sm font-bold text-white">75–80 % multi</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              {isCs
                ? `Celkový potenciál obou provozů činí ~${(report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1)))} hodin ušetřeného personálního času při zavedení 2h vlnových oken.`
                : `Total potential across both operations amounts to ~${(report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1)))} labor hours saved with 2h wave dispatching.`}
            </p>
          </div>
        </div>
      </div>

      {/* Section 2c: Detailní analýza sortimentu SKU & Pareto 80/20 za dané období */}
      <div className="bg-slate-900/80 border border-amber-500/30 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Tag className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-white">
                {isCs ? 'Sortiment SKU & Analýza Pareto (80/20) za dané období' : 'SKU Assortment & Pareto (80/20) Analysis for Period'}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 pl-10.5">
              {isCs
                ? 'Srovnání celkového počtu unikátních položek (SKU), podílu klíčových 80 % sortimentu tvořících drtivou většinu expedice a long-tail produktů.'
                : 'Comparison of total distinct SKUs, core 80% volume items driving the fulfillment volume, and long-tail products.'}
            </p>
          </div>
          <span className="px-3 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl self-start sm:self-auto">
            {isCs ? 'Pareto 80/20 bilance' : 'Pareto 80/20 Balance'}
          </span>
        </div>

        {/* Srovnávací tabulka SKU parametrů */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                <th className="py-3 px-4 font-bold uppercase tracking-wider">{isCs ? 'Metrika sortimentu' : 'Assortment Metric'}</th>
                <th className="py-3 px-4 font-bold uppercase tracking-wider text-right text-blue-400">{isCs ? 'Sklad Ruse' : 'Ruse Warehouse'}</th>
                <th className="py-3 px-4 font-bold uppercase tracking-wider text-right text-purple-400">{isCs ? 'Sklad SVJ' : 'SVJ Warehouse'}</th>
                <th className="py-3 px-4 font-bold uppercase tracking-wider text-right text-emerald-400">{isCs ? 'Celkem oba sklady' : 'Combined Total'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-4 font-sans font-semibold text-white">
                  {isCs ? 'Celkový počet unikátních SKU za období' : 'Total unique SKUs in period'}
                </td>
                <td className="py-3 px-4 text-right text-blue-300 font-bold">{report.ruseTotalSkus.toLocaleString('cs-CZ')} SKU</td>
                <td className="py-3 px-4 text-right text-purple-300 font-bold">{report.svjTotalSkus.toLocaleString('cs-CZ')} SKU</td>
                <td className="py-3 px-4 text-right text-emerald-300 font-bold">
                  {(report.totalCombinedSkus || (report.ruseTotalSkus + report.svjTotalSkus)).toLocaleString('cs-CZ')} SKU
                </td>
              </tr>
              <tr className="hover:bg-slate-800/30 bg-amber-950/15">
                <td className="py-3 px-4 font-sans font-semibold text-amber-200">
                  {isCs ? 'Počet SKU dělající 80 % veškerého objemu' : 'SKU count generating 80% of volume'}
                </td>
                <td className="py-3 px-4 text-right text-amber-300 font-bold">
                  {report.ruseTop80SkusCount.toLocaleString('cs-CZ')} SKU
                </td>
                <td className="py-3 px-4 text-right text-amber-300 font-bold">
                  {report.svjTop80SkusCount.toLocaleString('cs-CZ')} SKU
                </td>
                <td className="py-3 px-4 text-right text-amber-300 font-bold">
                  {(report.totalCombinedTop80SkusCount || (report.ruseTop80SkusCount + report.svjTop80SkusCount)).toLocaleString('cs-CZ')} SKU
                </td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-4 font-sans text-slate-300">
                  {isCs ? 'Podíl 80 % SKU na celkovém sortimentu (%)' : 'Share of 80% SKUs on total assortment (%)'}
                </td>
                <td className="py-3 px-4 text-right text-slate-200">{report.ruseTop80SkusSharePct} %</td>
                <td className="py-3 px-4 text-right text-slate-200">{report.svjTop80SkusSharePct} %</td>
                <td className="py-3 px-4 text-right text-emerald-400 font-semibold">
                  {report.totalCombinedTop80SkusSharePct || Math.round(((report.ruseTop80SkusCount + report.svjTop80SkusCount) / Math.max(1, report.ruseTotalSkus + report.svjTotalSkus)) * 100)} %
                </td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-4 font-sans text-slate-300">
                  {isCs ? 'Zbývajících 20 % objemu (Long tail SKU)' : 'Remaining 20% volume (Long-tail SKUs)'}
                </td>
                <td className="py-3 px-4 text-right text-slate-400">
                  {Math.max(0, report.ruseTotalSkus - report.ruseTop80SkusCount).toLocaleString('cs-CZ')} SKU
                </td>
                <td className="py-3 px-4 text-right text-slate-400">
                  {Math.max(0, report.svjTotalSkus - report.svjTop80SkusCount).toLocaleString('cs-CZ')} SKU
                </td>
                <td className="py-3 px-4 text-right text-slate-400">
                  {Math.max(0, (report.totalCombinedSkus || (report.ruseTotalSkus + report.svjTotalSkus)) - (report.totalCombinedTop80SkusCount || (report.ruseTop80SkusCount + report.svjTop80SkusCount))).toLocaleString('cs-CZ')} SKU
                </td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-3 px-4 font-sans text-slate-300">
                  {isCs ? 'Průměrný počet kusů na 1 SKU za období' : 'Avg units per SKU in period'}
                </td>
                <td className="py-3 px-4 text-right text-slate-200">
                  {(report.ruseTotalUnits / Math.max(1, report.ruseTotalSkus)).toFixed(1)} ks/SKU
                </td>
                <td className="py-3 px-4 text-right text-slate-200">
                  {(report.svjTotalUnits / Math.max(1, report.svjTotalSkus)).toFixed(1)} ks/SKU
                </td>
                <td className="py-3 px-4 text-right text-emerald-400 font-semibold">
                  {((report.ruseTotalUnits + report.svjTotalUnits) / Math.max(1, report.totalCombinedSkus || (report.ruseTotalSkus + report.svjTotalSkus))).toFixed(1)} ks/SKU
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Top 5 Products Comparison */}
        {(report.ruseTopProducts && report.ruseTopProducts.length > 0 || report.svjTopProducts && report.svjTopProducts.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Ruse Top 5 */}
            {report.ruseTopProducts && report.ruseTopProducts.length > 0 && (
              <div className="p-4 bg-slate-950/60 border border-blue-500/20 rounded-2xl space-y-2.5">
                <span className="text-xs font-bold text-blue-400 block uppercase tracking-wider">
                  {isCs ? 'Sklad Ruse — TOP 5 nejexpedovanějších SKU' : 'Ruse — TOP 5 Dispatched SKUs'}
                </span>
                <div className="space-y-1.5 text-xs font-mono">
                  {report.ruseTopProducts.map((p, i) => (
                    <div key={p.ean} className="flex items-center justify-between p-2 bg-slate-900/80 rounded-xl border border-slate-800">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500 font-sans text-[11px]">#{i + 1}</span>
                        <span className="text-white font-semibold">{p.ean}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-blue-300 font-bold">{p.units.toLocaleString('cs-CZ')} ks</span>
                        <span className="text-slate-400 text-[11px]">({p.sharePct} %)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SVJ Top 5 */}
            {report.svjTopProducts && report.svjTopProducts.length > 0 && (
              <div className="p-4 bg-slate-950/60 border border-purple-500/20 rounded-2xl space-y-2.5">
                <span className="text-xs font-bold text-purple-400 block uppercase tracking-wider">
                  {isCs ? 'Sklad SVJ — TOP 5 nejexpedovanějších SKU' : 'SVJ — TOP 5 Dispatched SKUs'}
                </span>
                <div className="space-y-1.5 text-xs font-mono">
                  {report.svjTopProducts.map((p, i) => (
                    <div key={p.ean} className="flex items-center justify-between p-2 bg-slate-900/80 rounded-xl border border-slate-800">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-500 font-sans text-[11px]">#{i + 1}</span>
                        <span className="text-white font-semibold">{p.ean}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-purple-300 font-bold">{p.units.toLocaleString('cs-CZ')} ks</span>
                        <span className="text-slate-400 text-[11px]">({p.sharePct} %)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="p-3.5 bg-amber-950/20 border border-amber-500/25 rounded-2xl text-xs text-amber-200/90 leading-relaxed">
          <strong>{isCs ? 'Strategické doporučení pro skladování (ABC Analýza):' : 'Warehouse Storage Recommendation (ABC Analysis):'}</strong>{' '}
          {isCs
            ? `Položky tvořící 80 % objemu (${report.ruseTop80SkusCount} SKU v Ruse a ${report.svjTop80SkusCount} SKU v SVJ) doporučujeme umístit do "Zlaté zóny" (A-lokací) v nejnižších regálech nejblíže konsolidačnímu uzlu a sorteru. To zkrátí trasu pickera o dalších 25–35 % při sběru objednávek.`
            : `The 80% volume items (${report.ruseTop80SkusCount} SKUs in Ruse and ${report.svjTop80SkusCount} SKUs in SVJ) should be designated as Grade-A fast-movers located near packing and sorting nodes to reduce picker walking distance by 25–35%.`}
        </div>
      </div>

      {/* Section 3: Process Architecture Flow Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ruse Flow */}
        <div className="bg-slate-900/80 border border-blue-500/30 rounded-3xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <h4 className="font-bold text-white text-sm">{isCs ? 'Architektura toku: Sklad Ruse' : 'Process Flow: Ruse Warehouse'}</h4>
            </div>
            <span className="text-xs text-blue-400 font-semibold">{isCs ? '2 hlavní operace' : '2 stages'}</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-blue-950/20 border border-blue-500/20 rounded-xl flex items-center justify-between">
              <div>
                <strong className="text-blue-300 block">1. Sběrné pickování (Batch/Wave Picking)</strong>
                <span className="text-slate-400 text-[11px]">Sdružené pickování položek do sběrného boxu</span>
              </div>
              <span className="font-mono text-white font-bold">{formatTimeValue(report.ruseAvgPickPerItemSec, unit)} / ks</span>
            </div>

            <div className="p-2 bg-slate-950/50 rounded-xl border border-dashed border-slate-800 text-center text-slate-400 text-[11px]">
              {isCs ? `Meziskladový buffer přepravek: průměrně ~${report.ruseAvgWaitPickToPackMin} min` : `Tote buffer: avg ~${report.ruseAvgWaitPickToPackMin} min`}
            </div>

            <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl flex items-center justify-between">
              <div>
                <strong className="text-emerald-300 block">2. Balení ze sběrného boxu (Packing)</strong>
                <span className="text-slate-400 text-[11px]">Přímé dohledání položek a balení ze sběrného boxu</span>
              </div>
              <span className="font-mono text-white font-bold">{formatTimeValue(report.ruseAvgPackPerItemSec, unit)} / ks</span>
            </div>
          </div>
        </div>

        {/* SVJ Flow */}
        <div className="bg-slate-900/80 border border-purple-500/30 rounded-3xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-purple-500" />
              <h4 className="font-bold text-white text-sm">{isCs ? 'Architektura toku: Sklad SVJ' : 'Process Flow: SVJ Warehouse'}</h4>
            </div>
            <span className="text-xs text-purple-400 font-semibold">{isCs ? '3 operace (+ Sorting)' : '3 stages (+ Sorting)'}</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-blue-950/20 border border-blue-500/20 rounded-xl flex items-center justify-between">
              <div>
                <strong className="text-blue-300 block">1. Sběrné pickování (Picking)</strong>
                <span className="text-slate-400 text-[11px]">Sběr do přepravky podle cyklů</span>
              </div>
              <span className="font-mono text-white font-bold">{formatTimeValue(report.svjAvgPickPerItemSec, unit)} / ks</span>
            </div>

            <div className="p-2 bg-slate-950/50 rounded-xl border border-dashed border-slate-800 text-center text-slate-400 text-[11px]">
              {isCs ? `Buffer 1 (před sortingem): průměrně ~${report.svjAvgWaitPickToSortMin} min` : `Buffer 1 (pre-sort): avg ~${report.svjAvgWaitPickToSortMin} min`}
            </div>

            <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl flex items-center justify-between">
              <div>
                <strong className="text-purple-300 block">2. Sorting (Třídění)</strong>
                <span className="text-slate-400 text-[11px]">Přetřídění sběrného boxu do slotů objednávek</span>
              </div>
              <span className="font-mono text-purple-300 font-bold">{formatTimeValue(report.svjAvgSortPerItemSec, unit)} / ks</span>
            </div>

            <div className="p-2 bg-slate-950/50 rounded-xl border border-dashed border-slate-800 text-center text-slate-400 text-[11px]">
              {isCs ? `Buffer 2 (před ručním balením): průměrně ~${report.svjAvgWaitSortToPackMin} min` : `Buffer 2 (pre-pack): avg ~${report.svjAvgWaitSortToPackMin} min`}
            </div>

            <div className="p-3 bg-teal-950/20 border border-teal-500/20 rounded-xl flex items-center justify-between">
              <div>
                <strong className="text-teal-300 block">3. Ruční balení (Manual Packing)</strong>
                <span className="text-slate-400 text-[11px]">Zabalení z vytříděného slotu (stanice javi)</span>
              </div>
              <span className="font-mono text-white font-bold">{formatTimeValue(report.svjAvgPackPerItemSec, unit)} / ks</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
