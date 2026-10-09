import React from 'react';
import {
  Boxes,
  ArrowRight,
  Clock,
  Shuffle,
  Hourglass,
  Layers,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  UserCheck,
} from 'lucide-react';
import { MovementRecord } from '../types.js';
import { computeSvjSortingStatistics, formatTimeValue, SvjSortingOverview } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface SvjSortingSectionProps {
  records: MovementRecord[];
  unit: 'sec' | 'min';
  cachedStats?: SvjSortingOverview | null;
}

export const SvjSortingSection: React.FC<SvjSortingSectionProps> = ({ records, unit, cachedStats }) => {
  const { lang } = useLanguage();
  const isCs = lang === 'cs';

  const stats = cachedStats || computeSvjSortingStatistics(records);

  return (
    <div className="bg-slate-900/80 border border-indigo-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden backdrop-blur-md space-y-6">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Shuffle className="w-5 h-5" />
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white">
              {isCs ? 'Proces sortingu a meziskladové buffery (Sklad SVJ)' : 'Sorting Process & In-Between Buffers (SVJ Warehouse)'}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {isCs ? 'Operace navíc' : 'Additional Stage'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 pl-10.5">
            {isCs
              ? 'Sklad SVJ provádí mezi pickováním a ručním balením krok sortingu (přetřídění sběrných boxů do zakázek).'
              : 'SVJ warehouse executes an intermediate sorting stage between picking and manual packing.'}
          </p>
        </div>
      </div>

      {/* 4 Metric cards for Sorting */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Objem sortingu */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">{isCs ? 'Vysortováno' : 'Units Sorted'}</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">
            {stats.totalUnitsSorted.toLocaleString('cs-CZ')} <span className="text-xs font-normal text-slate-400">{isCs ? 'ks' : 'units'}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {isCs ? `V ${stats.totalBoxesSorted} sběrných boxech (${stats.totalOrdersSorted} objednávek)` : `Across ${stats.totalBoxesSorted} totes (${stats.totalOrdersSorted} orders)`}
          </div>
        </div>

        {/* 2. Doba sortingu na 1 kus */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">{isCs ? 'Doba sortingu / ks' : 'Sort Time / Item'}</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-400 font-mono">
            {formatTimeValue(stats.avgSortPerItemSec, unit)}
          </div>
          <div className="mt-1 text-xs text-slate-400 flex items-center justify-between">
            <span>{isCs ? 'Medián na kus:' : 'Median per item:'}</span>
            <span className="text-slate-200 font-mono font-medium">{formatTimeValue(stats.medianSortPerItemSec, unit)}</span>
          </div>
        </div>

        {/* 3. Buffer po pickování */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">{isCs ? 'Čekání po picku (Buffer 1)' : 'Wait After Pick (Buffer 1)'}</span>
            <Hourglass className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400 font-mono">
            {stats.avgWaitAfterPickMin} <span className="text-xs font-normal text-slate-400">min</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {isCs ? 'Mezi koncem picku a začátkem sortingu' : 'Between pick end and sort start'}
          </div>
        </div>

        {/* 4. Buffer před balením */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider">{isCs ? 'Čekání před balením (Buffer 2)' : 'Wait Before Pack (Buffer 2)'}</span>
            <Hourglass className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            {stats.avgWaitSortToPackMin} <span className="text-xs font-normal text-slate-400">min</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {isCs ? 'Mezi koncem sortingu a ručním zabalením' : 'Between sort end and manual packing'}
          </div>
        </div>
      </div>

      {/* Process Flow Visualization for SVJ */}
      <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          {isCs ? 'Procesní tok zakázky ve skladu SVJ:' : 'Order Process Flow in SVJ Warehouse:'}
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          {/* Step 1: Picking */}
          <div className="flex-1 bg-blue-950/30 border border-blue-500/20 rounded-xl p-3">
            <div className="font-bold text-blue-300 flex items-center space-x-1.5">
              <span>1. Vypickování</span>
            </div>
            <div className="text-slate-400 text-[11px] mt-1">
              {isCs ? 'Sběrné boxy na zónách' : 'Collection totes'}
            </div>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-600 hidden lg:block shrink-0" />

          {/* Buffer 1 */}
          <div className="px-3 py-2 bg-amber-950/20 border border-amber-500/20 rounded-xl text-center">
            <div className="text-[10px] uppercase font-bold text-amber-400">{isCs ? 'Buffer 1' : 'Buffer 1'}</div>
            <div className="font-mono text-amber-300 text-xs font-semibold">~{stats.avgWaitAfterPickMin} min</div>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-600 hidden lg:block shrink-0" />

          {/* Step 2: Sorting */}
          <div className="flex-1 bg-purple-950/30 border border-purple-500/30 rounded-xl p-3 ring-1 ring-purple-500/20">
            <div className="font-bold text-purple-300 flex items-center space-x-1.5">
              <Shuffle className="w-3.5 h-3.5" />
              <span>2. Sorting (Třídění)</span>
            </div>
            <div className="text-purple-200/80 text-[11px] mt-1 font-mono">
              ~{stats.avgSortPerItemSec} s / kus
            </div>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-600 hidden lg:block shrink-0" />

          {/* Buffer 2 */}
          <div className="px-3 py-2 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-center">
            <div className="text-[10px] uppercase font-bold text-emerald-400">{isCs ? 'Buffer 2' : 'Buffer 2'}</div>
            <div className="font-mono text-emerald-300 text-xs font-semibold">~{stats.avgWaitSortToPackMin} min</div>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-600 hidden lg:block shrink-0" />

          {/* Step 3: Packing */}
          <div className="flex-1 bg-teal-950/30 border border-teal-500/20 rounded-xl p-3">
            <div className="font-bold text-teal-300 flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>3. Ruční balení</span>
            </div>
            <div className="text-slate-400 text-[11px] mt-1">
              {stats.uniqueStations.join(', ') || '(javi stations)'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
