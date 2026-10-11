import React from 'react';
import { Package, CheckCircle2, Box, TrendingDown, Clock, ArrowDownRight, Layers, Barcode, Boxes, Shuffle } from 'lucide-react';
import { BracketStat, PeriodSummary } from '../types.js';
import { formatTimeValue } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface KpiCardsProps {
  bracketStats: BracketStat[];
  periodSummary?: PeriodSummary;
  unit: 'sec' | 'min';
  isSvj?: boolean;
  svjSorting?: any;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ bracketStats, periodSummary, unit, isSvj: propIsSvj, svjSorting }) => {
  const { lang, t } = useLanguage();

  const allStat = bracketStats.find(s => s.bracket === 'all') || bracketStats[0];
  const singleStat = bracketStats.find(s => s.bracket === '1');
  const multiStat = bracketStats.find(s => s.bracket === '6+') || bracketStats.find(s => s.bracket === '5');

  // Detekce SVJ skladu nebo přítomnosti procesu sortování (striktně respektujeme propIsSvj)
  const isSvj = propIsSvj !== undefined
    ? propIsSvj
    : Boolean((allStat?.avgSortPerItemSec && allStat.avgSortPerItemSec > 0) || periodSummary?.hasSorting);

  const totalShipments = periodSummary ? periodSummary.totalOrders : (allStat?.shipmentCount || 0);
  const totalItems = periodSummary ? periodSummary.totalUnits : (allStat?.itemCount || 0);
  const avgItemsPerShipment = periodSummary
    ? periodSummary.avgUnitsPerOrder
    : (allStat && allStat.shipmentCount > 0 ? (allStat.itemCount / allStat.shipmentCount).toFixed(2) : '0');

  // Hodnoty sortingu (pouze pokud je sklad SVJ)
  const medianSortVal = isSvj
    ? ((allStat?.medianSortPerItemSec && allStat.medianSortPerItemSec > 0)
        ? allStat.medianSortPerItemSec
        : (periodSummary?.medianSortPerItemSec || svjSorting?.medianSortPerItemSec || 0))
    : 0;

  const avgSortVal = isSvj
    ? ((allStat?.avgSortPerItemSec && allStat.avgSortPerItemSec > 0)
        ? allStat.avgSortPerItemSec
        : (periodSummary?.avgSortPerItemSec || svjSorting?.avgSortPerItemSec || 0))
    : 0;

  // Celkový čas na 1 ks: SVJ má Pick + Sort + Pack, Ruse má Pick + Pack
  const medianPickVal = allStat?.medianPickPerItemSec || 0;
  const avgPickVal = allStat?.avgPickPerItemSec || 0;
  const medianPackVal = allStat?.medianPackPerItemSec || 0;
  const avgPackVal = allStat?.avgPackPerItemSec || 0;

  const medianTotalVal = isSvj
    ? Number((medianPickVal + medianSortVal + medianPackVal).toFixed(1))
    : Number((medianPickVal + medianPackVal).toFixed(1));

  const avgTotalVal = isSvj
    ? Number((avgPickVal + avgSortVal + avgPackVal).toFixed(1))
    : Number((avgPickVal + avgPackVal).toFixed(1));

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${isSvj ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3.5 sm:gap-4`}>
      {/* 1. Objem zásilek & produktů */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t.kpi.shipmentsCount}
          </span>
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Package className="w-4 h-4 text-blue-400" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {totalShipments.toLocaleString('cs-CZ')}
            </span>
            <span className="text-xs text-slate-400">{lang === 'cs' ? 'zásilek' : 'orders'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{lang === 'cs' ? 'Celkem kusů:' : 'Total items:'}</span>
            <span className="text-slate-200 font-semibold font-mono">
              {totalItems.toLocaleString('cs-CZ')} {lang === 'cs' ? 'ks' : 'units'}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs text-slate-400">
            <span>{lang === 'cs' ? 'Průměrně na zásilku:' : 'Average per order:'}</span>
            <span className="text-indigo-400 font-medium font-mono">{avgItemsPerShipment} {lang === 'cs' ? 'ks' : 'units'}</span>
          </div>
          {periodSummary && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>{lang === 'cs' ? 'Medián v 1 boxu:' : 'Median / box:'}</span>
              <span className="text-indigo-300 font-semibold font-mono">{periodSummary.medianOrdersPerBox} {lang === 'cs' ? 'obj.' : 'orders'}</span>
            </div>
          )}
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-colors" />
      </div>

      {/* 2. Doba pickování na 1 produkt (Medián na 1. místě, Průměr na 2. místě) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {lang === 'cs' ? 'Doba pickování (1 ks)' : 'Picking Time / Unit'}
          </span>
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Box className="w-4 h-4 text-indigo-400" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {formatTimeValue(allStat?.medianPickPerItemSec || 0, unit)}
            </span>
            <span className="text-xs text-indigo-400 font-semibold">{lang === 'cs' ? 'medián / ks' : 'median / unit'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{lang === 'cs' ? 'Aritmetický průměr (Ø):' : 'Arithmetic mean (Ø):'}</span>
            <span className="text-slate-200 font-medium font-mono">
              {formatTimeValue(allStat?.avgPickPerItemSec || 0, unit)}
            </span>
          </div>
          {multiStat && singleStat && multiStat.pickSavingsPctVsSingle > 0 && (
            <div className="mt-1 flex items-center space-x-1 text-emerald-400 text-xs font-medium">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>{lang === 'cs' ? `Úspora u 5+ ks: -${multiStat.pickSavingsPctVsSingle}% na kus` : `Savings on 5+ items: -${multiStat.pickSavingsPctVsSingle}% per unit`}</span>
            </div>
          )}
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-500/5 rounded-full blur-xl group-hover:bg-indigo-500/10 transition-colors" />
      </div>

      {/* 3. POUZE PRO SVJ: Doba sortování na 1 produkt (Medián na 1. místě, Průměr na 2. místě) */}
      {isSvj && (
        <div className="bg-slate-900/80 border border-purple-500/30 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
              {lang === 'cs' ? 'Doba sortování (1 ks)' : 'Sorting Time / Unit'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center">
              <Shuffle className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-purple-300 tracking-tight font-mono">
                {formatTimeValue(medianSortVal, unit)}
              </span>
              <span className="text-xs text-purple-400 font-semibold">{lang === 'cs' ? 'medián / ks' : 'median / unit'}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
              <span>{lang === 'cs' ? 'Aritmetický průměr (Ø):' : 'Arithmetic mean (Ø):'}</span>
              <span className="text-slate-200 font-medium font-mono">
                {formatTimeValue(avgSortVal, unit)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
              <span className="text-purple-300/80">{lang === 'cs' ? 'Třídění ze sběrného boxu' : 'Batch tote sortation'}</span>
              {multiStat && singleStat && multiStat.sortSavingsPctVsSingle !== undefined && multiStat.sortSavingsPctVsSingle !== 0 && (
                <span className="text-purple-400 font-mono font-medium">
                  {multiStat.sortSavingsPctVsSingle > 0 ? `-${multiStat.sortSavingsPctVsSingle}%` : `+${Math.abs(multiStat.sortSavingsPctVsSingle)}%`}
                </span>
              )}
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-purple-500/10 rounded-full blur-xl group-hover:bg-purple-500/20 transition-colors" />
        </div>
      )}

      {/* 4. Doba balení na 1 produkt (Medián na 1. místě, Průměr na 2. místě) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {lang === 'cs' ? 'Doba balení (1 ks)' : 'Packing Time / Unit'}
          </span>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {formatTimeValue(allStat?.medianPackPerItemSec || 0, unit)}
            </span>
            <span className="text-xs text-emerald-400 font-semibold">{lang === 'cs' ? 'medián / ks' : 'median / unit'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{lang === 'cs' ? 'Aritmetický průměr (Ø):' : 'Arithmetic mean (Ø):'}</span>
            <span className="text-slate-200 font-medium font-mono">
              {formatTimeValue(allStat?.avgPackPerItemSec || 0, unit)}
            </span>
          </div>
          {multiStat && singleStat && multiStat.packSavingsPctVsSingle > 0 && (
            <div className="mt-1 flex items-center space-x-1 text-emerald-400 text-xs font-medium">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>{lang === 'cs' ? `Úspora u 5+ ks: -${multiStat.packSavingsPctVsSingle}% na kus` : `Savings on 5+ items: -${multiStat.packSavingsPctVsSingle}% per unit`}</span>
            </div>
          )}
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-colors" />
      </div>

      {/* 5. Celkový čas na 1 produkt: Pick + Sort + Balení (SVJ) resp. Pick + Balení (Ruse) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {isSvj
              ? (lang === 'cs' ? 'Celkem: Pick + Sort + Balení (1 ks)' : 'Total: Pick + Sort + Pack (1 pc)')
              : t.kpi.totalTimePerItem}
          </span>
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {formatTimeValue(medianTotalVal, unit)}
            </span>
            <span className="text-xs text-purple-400 font-semibold">{lang === 'cs' ? 'medián / ks' : 'median / unit'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{lang === 'cs' ? 'Aritmetický průměr (Ø):' : 'Arithmetic mean (Ø):'}</span>
            <span className="text-slate-200 font-medium font-mono">
              {formatTimeValue(avgTotalVal, unit)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
            <span className="text-slate-500">
              {isSvj
                ? (lang === 'cs' ? 'Součet 3 procesů' : 'Sum of 3 stages')
                : (lang === 'cs' ? 'Součet 2 procesů' : 'Sum of 2 stages')}
            </span>
            {multiStat && singleStat && multiStat.totalSavingsPctVsSingle > 0 ? (
              <span className="text-purple-300 font-semibold">
                -{multiStat.totalSavingsPctVsSingle}% na ks
              </span>
            ) : null}
          </div>
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition-colors" />
      </div>
    </div>
  );
};
