import React from 'react';
import {
  CalendarRange,
  PackageCheck,
  Barcode,
  Layers,
  ShoppingBag,
  Boxes,
  ArrowRight,
  TrendingUp,
  Info,
  Clock,
} from 'lucide-react';
import { PeriodSummary } from '../types.js';
import { useLanguage } from '../context/LanguageContext.js';

interface PeriodExecutiveSummaryProps {
  summary: PeriodSummary;
  totalFilteredRecords: number;
  totalAllRecords: number;
}

export const PeriodExecutiveSummary: React.FC<PeriodExecutiveSummaryProps> = ({
  summary,
  totalFilteredRecords,
  totalAllRecords,
}) => {
  const { lang } = useLanguage();
  const isCs = lang === 'cs';

  const hasDateRange = Boolean(summary.dateFrom && summary.dateTo);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/20 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
      {/* Background ambient glow */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 left-10 w-60 h-60 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header section with title and date badge */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 text-white">
              <CalendarRange className="w-4 h-4" />
            </div>
            <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
              {isCs ? 'Sumární info za zkoumané období' : 'Executive Period Summary'}
            </h2>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
              {isCs ? 'Klíčová bilance' : 'Key Metrics'}
            </span>
          </div>
          <p className="text-xs text-slate-400 pl-10.5">
            {isCs
              ? 'Přehled objemu expedovaných objednávek, sortimentní šíře (SKU) a hustoty konsolidace do balicích boxů'
              : 'Overview of dispatched orders, SKU diversity, item volume, and consolidation density into packing crates'}
          </p>
        </div>

        {/* Date range badge & active filter indicator */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {hasDateRange ? (
            <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs text-slate-200 shadow-sm">
              <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-semibold text-white font-mono">{summary.dateFrom}</span>
              <span className="text-slate-400">–</span>
              <span className="font-semibold text-white font-mono">{summary.dateTo}</span>
              <span className="text-slate-500 font-mono text-[11px]">
                ({summary.daysCount} {isCs ? (summary.daysCount === 1 ? 'den' : summary.daysCount < 5 ? 'dny' : 'dní') : 'days'})
              </span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-400">
              {isCs ? 'Celý dostupný dataset' : 'Entire dataset'}
            </div>
          )}

          {totalFilteredRecords < totalAllRecords && (
            <span className="px-2.5 py-1 rounded-xl text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
              {isCs ? `Filtr aktivní (${totalFilteredRecords.toLocaleString('cs-CZ')} záznamů)` : `Filtered (${totalFilteredRecords.toLocaleString()} rows)`}
            </span>
          )}
        </div>
      </div>

      {/* 5 Prominent Core Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-5 relative z-10">
        {/* 1. Objednávky celkem */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/40 rounded-2xl p-4 transition-all duration-200 group relative">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isCs ? 'Objednávky celkem' : 'Total Orders'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
              <PackageCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {summary.totalOrders.toLocaleString('cs-CZ')}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 flex items-center space-x-1">
              <span>{isCs ? 'Unikátních zásilek' : 'Unique shipments'}</span>
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isCs ? 'Expedováno' : 'Dispatched'}</span>
            <span className="text-blue-400 font-semibold font-mono">100 %</span>
          </div>
        </div>

        {/* 2. Unikátní SKU */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-purple-500/40 rounded-2xl p-4 transition-all duration-200 group relative">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isCs ? 'Zpracováno SKU' : 'Processed SKUs'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
              <Barcode className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-white font-mono tracking-tight">
              {summary.totalSkus.toLocaleString('cs-CZ')}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 flex items-center space-x-1">
              <span>{isCs ? 'Různých EAN kódů' : 'Distinct product EANs'}</span>
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isCs ? 'Šíře sortimentu' : 'Assortment breadth'}</span>
            <span className="text-purple-400 font-semibold font-mono">
              {(summary.totalSkus / Math.max(1, summary.totalOrders)).toFixed(2)} SKU/obj.
            </span>
          </div>
        </div>

        {/* 3. Kusů celkem */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-4 transition-all duration-200 group relative">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isCs ? 'Kusů celkem' : 'Total Units'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
              {summary.totalUnits.toLocaleString('cs-CZ')}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 flex items-center space-x-1">
              <span>{isCs ? 'Fyzických kusů (ks)' : 'Physical items picked'}</span>
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isCs ? 'Denní průměr' : 'Daily average'}</span>
            <span className="text-emerald-400 font-semibold font-mono">
              {Math.round(summary.totalUnits / Math.max(1, summary.daysCount)).toLocaleString('cs-CZ')} {isCs ? 'ks/den' : 'units/day'}
            </span>
          </div>
        </div>

        {/* 4. Průměrně ks na 1 zásilku */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-4 transition-all duration-200 group relative">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isCs ? 'Průměr ks / zásilka' : 'Avg Units / Order'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-amber-400 font-mono tracking-tight">
              {summary.avgUnitsPerOrder}
              <span className="text-xs font-normal text-slate-400 ml-1">{isCs ? 'ks' : 'units'}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 flex items-center space-x-1">
              <span>{isCs ? 'Velikost nákupního košíku' : 'Order basket size'}</span>
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isCs ? 'Struktura zásilek' : 'Structure'}</span>
            <span className="text-amber-400 font-semibold font-mono">
              {summary.avgUnitsPerOrder <= 2.0 ? (isCs ? 'spíše 1-2 ks' : '1-2 items dom.') : (isCs ? 'multi-položkové' : 'multi-item dom.')}
            </span>
          </div>
        </div>

        {/* 5. Medián počtu objednávek v 1 boxu */}
        <div className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-4 transition-all duration-200 group relative">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isCs ? 'Medián obj. v 1 boxu' : 'Median Orders / Box'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
              <Boxes className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="text-2xl font-black text-indigo-400 font-mono tracking-tight">
              {summary.medianOrdersPerBox}
              <span className="text-xs font-normal text-slate-400 ml-1">{isCs ? 'obj.' : 'orders'}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 flex items-center space-x-1">
              <span>{isCs ? 'Ve sběrném boxu na balení' : 'In packing collection crate'}</span>
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isCs ? 'Průměr / box' : 'Mean / box'}</span>
            <span className="text-indigo-400 font-semibold font-mono">
              {summary.avgOrdersPerBox} {isCs ? 'obj.' : 'ord.'}
            </span>
          </div>
        </div>
      </div>

      {/* Consolidation Context Footnote bar */}
      <div className="mt-4 pt-3.5 border-t border-slate-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center space-x-2">
          <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>
            {isCs
              ? `Celkem ${summary.totalBoxesCount.toLocaleString('cs-CZ')} sběrných boxů. V jednom boxu bylo sdruženo od ${summary.minOrdersPerBox} do ${summary.maxOrdersPerBox} objednávek.`
              : `Total ${summary.totalBoxesCount.toLocaleString()} collection crates. Crates held between ${summary.minOrdersPerBox} and ${summary.maxOrdersPerBox} orders.`}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono self-end sm:self-auto">
          {isCs
            ? `Objemová hustota: ~${Math.round(summary.totalUnits / Math.max(1, summary.totalBoxesCount))} ks zboží na 1 balicí box`
            : `Volume density: ~${Math.round(summary.totalUnits / Math.max(1, summary.totalBoxesCount))} units per collection crate`}
        </div>
      </div>
    </div>
  );
};
