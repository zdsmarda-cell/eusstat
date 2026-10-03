import React from 'react';
import { Package, CheckCircle2, Box, TrendingDown, Clock, ArrowDownRight, Layers } from 'lucide-react';
import { BracketStat } from '../types.js';
import { formatTimeValue } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface KpiCardsProps {
  bracketStats: BracketStat[];
  unit: 'sec' | 'min';
}

export const KpiCards: React.FC<KpiCardsProps> = ({ bracketStats, unit }) => {
  const { lang, t } = useLanguage();

  const allStat = bracketStats.find(s => s.bracket === 'all') || bracketStats[0];
  const singleStat = bracketStats.find(s => s.bracket === '1');
  const multiStat = bracketStats.find(s => s.bracket === '6+') || bracketStats.find(s => s.bracket === '5');

  const avgItemsPerShipment = allStat && allStat.shipmentCount > 0
    ? (allStat.itemCount / allStat.shipmentCount).toFixed(2)
    : '0';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              {allStat?.shipmentCount.toLocaleString('cs-CZ')}
            </span>
            <span className="text-xs text-slate-400">{lang === 'cs' ? 'zásilek' : 'orders'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{lang === 'cs' ? 'Celkem kusů:' : 'Total items:'}</span>
            <span className="text-slate-200 font-semibold font-mono">
              {allStat?.itemCount.toLocaleString('cs-CZ')} {lang === 'cs' ? 'ks' : 'units'}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs text-slate-400">
            <span>{lang === 'cs' ? 'Průměrně na zásilku:' : 'Average per order:'}</span>
            <span className="text-indigo-400 font-medium font-mono">{avgItemsPerShipment} {lang === 'cs' ? 'ks' : 'units'}</span>
          </div>
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-colors" />
      </div>

      {/* 2. Doba pickování na 1 produkt */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t.kpi.avgPickTime}
          </span>
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Box className="w-4 h-4 text-indigo-400" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {formatTimeValue(allStat?.avgPickPerItemSec || 0, unit)}
            </span>
            <span className="text-xs text-slate-400">/ {lang === 'cs' ? 'ks' : 'unit'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{t.kpi.medianPick}:</span>
            <span className="text-slate-200 font-medium font-mono">
              {formatTimeValue(allStat?.medianPickPerItemSec || 0, unit)}
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

      {/* 3. Doba balení na 1 produkt */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t.kpi.avgPackTime}
          </span>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {formatTimeValue(allStat?.avgPackPerItemSec || 0, unit)}
            </span>
            <span className="text-xs text-slate-400">/ {lang === 'cs' ? 'ks' : 'unit'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{t.kpi.medianPack}:</span>
            <span className="text-slate-200 font-medium font-mono">
              {formatTimeValue(allStat?.medianPackPerItemSec || 0, unit)}
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

      {/* 4. Celkový čas (Pick + Pack) na 1 produkt */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden group hover:border-slate-700 transition-all">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {t.kpi.totalTimePerItem}
          </span>
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-white tracking-tight font-mono">
              {formatTimeValue(allStat?.avgTotalPerItemSec || 0, unit)}
            </span>
            <span className="text-xs text-slate-400">/ {lang === 'cs' ? 'ks' : 'unit'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{lang === 'cs' ? 'Pick + Balení dohromady' : 'Combined Pick + Pack'}</span>
          </div>
          {multiStat && singleStat && multiStat.totalSavingsPctVsSingle > 0 && (
            <div className="mt-1 flex items-center space-x-1 text-purple-300 text-xs font-semibold">
              <ArrowDownRight className="w-3.5 h-3.5" />
              <span>{lang === 'cs' ? `Celkem ušetřeno: -${multiStat.totalSavingsPctVsSingle}% na kus` : `Total saved: -${multiStat.totalSavingsPctVsSingle}% per unit`}</span>
            </div>
          )}
        </div>
        <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition-colors" />
      </div>
    </div>
  );
};
