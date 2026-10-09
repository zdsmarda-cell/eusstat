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
} from 'lucide-react';
import { MovementRecord, WarehouseComparisonReport } from '../types.js';
import { computeWarehouseComparison, formatTimeValue } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface WarehouseComparisonSummaryProps {
  ruseRecords: MovementRecord[];
  svjRecords: MovementRecord[];
  unit: 'sec' | 'min';
}

export const WarehouseComparisonSummary: React.FC<WarehouseComparisonSummaryProps> = ({
  ruseRecords,
  svjRecords,
  unit,
}) => {
  const { lang } = useLanguage();
  const isCs = lang === 'cs';

  const report: WarehouseComparisonReport = computeWarehouseComparison(ruseRecords, svjRecords);

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

          {/* 2. Doba pickování na 1 kus */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Doba pickování (1 ks)' : 'Picking Time / Item'}</span>
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse</span>
                <span className="text-xl font-bold text-white font-mono">{formatTimeValue(report.ruseAvgPickPerItemSec, unit)}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ</span>
                <span className="text-xl font-bold text-purple-400 font-mono">{formatTimeValue(report.svjAvgPickPerItemSec, unit)}</span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">{isCs ? 'Rozdíl (SVJ vs Ruse):' : 'Difference:'}</span>
              {formatDelta(report.ruseAvgPickPerItemSec, report.svjAvgPickPerItemSec, 's')}
            </div>
          </div>

          {/* 3. Doba ručního balení na 1 kus */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold uppercase tracking-wider">{isCs ? 'Ruční balení (1 ks)' : 'Manual Packing / Item'}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[11px] font-semibold text-blue-400 block">Ruse</span>
                <span className="text-xl font-bold text-white font-mono">{formatTimeValue(report.ruseAvgPackPerItemSec, unit)}</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-purple-400 block">SVJ</span>
                <span className="text-xl font-bold text-emerald-400 font-mono">{formatTimeValue(report.svjAvgPackPerItemSec, unit)}</span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-400">{isCs ? 'Rozdíl v balení:' : 'Pack difference:'}</span>
              {formatDelta(report.ruseAvgPackPerItemSec, report.svjAvgPackPerItemSec, 's')}
            </div>
          </div>

          {/* 4. Sorting v SVJ (Operace navíc) */}
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
                <span className="text-xl font-bold text-purple-400 font-mono">{formatTimeValue(report.svjAvgSortPerItemSec, unit)}</span>
                <span className="text-[11px] text-purple-300/80 block">{isCs ? 'Před ručním balením' : 'Before packing'}</span>
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
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-blue-400">{isCs ? 'Pick Ruse / ks' : 'Ruse Pick / item'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-purple-400">{isCs ? 'Pick SVJ / ks' : 'SVJ Pick / item'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-emerald-400">{isCs ? 'Pack Ruse / ks' : 'Ruse Pack / item'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-teal-400">{isCs ? 'Pack SVJ (Ruční)' : 'SVJ Manual Pack'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right text-purple-300">{isCs ? 'Sorting SVJ' : 'SVJ Sort'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right">{isCs ? 'Rozdíl Pick' : 'Pick Diff'}</th>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-right">{isCs ? 'Rozdíl Pack' : 'Pack Diff'}</th>
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
                    <td className="py-3 px-3.5 text-right text-blue-300">{formatTimeValue(row.ruseAvgPickPerItemSec, unit)}</td>
                    <td className="py-3 px-3.5 text-right text-purple-300">{formatTimeValue(row.svjAvgPickPerItemSec, unit)}</td>
                    <td className="py-3 px-3.5 text-right text-emerald-300">{formatTimeValue(row.ruseAvgPackPerItemSec, unit)}</td>
                    <td className="py-3 px-3.5 text-right text-teal-300">{formatTimeValue(row.svjAvgPackPerItemSec, unit)}</td>
                    <td className="py-3 px-3.5 text-right text-purple-400">
                      {row.svjAvgSortPerItemSec > 0 ? formatTimeValue(row.svjAvgSortPerItemSec, unit) : '–'}
                    </td>
                    <td className="py-3 px-3.5 text-right font-semibold">
                      <span className={row.pickDiffPct > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                        {row.pickDiffPct > 0 ? '+' : ''}{row.pickDiffPct}%
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-right font-semibold">
                      <span className={row.packDiffPct > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                        {row.packDiffPct > 0 ? '+' : ''}{row.packDiffPct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
