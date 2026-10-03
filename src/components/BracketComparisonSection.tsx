import React, { useState } from 'react';
import { BarChart3, TrendingDown, ArrowRight, Zap, Info, Percent, HelpCircle } from 'lucide-react';
import { BracketStat, ItemBracket } from '../types.js';
import { formatTimeValue, getBracketBadgeColor } from '../utils/analytics.js';

interface BracketComparisonProps {
  bracketStats: BracketStat[];
  unit: 'sec' | 'min';
}

export const BracketComparisonSection: React.FC<BracketComparisonProps> = ({ bracketStats, unit }) => {
  const [metricTab, setMetricTab] = useState<'perItem' | 'totalOrder' | 'savings'>('perItem');

  const detailedBrackets = bracketStats.filter(s => s.bracket !== 'all');
  const allStat = bracketStats.find(s => s.bracket === 'all');
  const singleStat = bracketStats.find(s => s.bracket === '1');

  // Find max value for chart scaling
  const maxPerItem = Math.max(
    ...detailedBrackets.map(s => s.avgPickPerItemSec + s.avgPackPerItemSec),
    1
  );

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Srovnání dle kusovosti zásilky (1, 2, 3, 4, 5+ kusů)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Klíčová metrika: Rozdíl v délce trvání pickování a balení přepočtené <strong>na 1 produkt</strong> v závislosti na velikosti objednávky.
          </p>
        </div>

        {/* View switch */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs self-start md:self-auto">
          <button
            onClick={() => setMetricTab('perItem')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              metricTab === 'perItem'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Čas na 1 kus (klíčové)
          </button>
          <button
            onClick={() => setMetricTab('totalOrder')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              metricTab === 'totalOrder'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Celkový čas na zásilku
          </button>
          <button
            onClick={() => setMetricTab('savings')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              metricTab === 'savings'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Úspora vs 1 kus (%)
          </button>
        </div>
      </div>

      {/* Visual Comparison Cards & Bars */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
        {detailedBrackets.map((stat) => {
          const colors = getBracketBadgeColor(stat.bracket);
          const pickHeightPct = (stat.avgPickPerItemSec / maxPerItem) * 100;
          const packHeightPct = (stat.avgPackPerItemSec / maxPerItem) * 100;
          const isBase = stat.bracket === '1';

          return (
            <div
              key={stat.bracket}
              className={`relative bg-slate-950/60 border rounded-2xl p-4 flex flex-col justify-between transition-all hover:border-slate-600 ${
                isBase ? 'border-blue-500/40 bg-blue-950/10' : 'border-slate-800'
              }`}
            >
              {/* Card top */}
              <div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}>
                    {stat.bracket === '5+' ? '5 a více kusů' : `${stat.bracket} ${stat.bracket === '1' ? 'kus' : stat.bracket === '2' || stat.bracket === '3' || stat.bracket === '4' ? 'kusy' : 'kusů'}`}
                  </span>
                  {isBase ? (
                    <span className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">
                      Reference
                    </span>
                  ) : stat.totalSavingsPctVsSingle > 0 ? (
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center">
                      <TrendingDown className="w-3 h-3 mr-0.5" />
                      -{stat.totalSavingsPctVsSingle}%
                    </span>
                  ) : null}
                </div>

                <div className="mt-3">
                  <div className="text-[11px] text-slate-400">Celkový čas / 1 ks:</div>
                  <div className="text-xl font-extrabold text-white font-mono">
                    {formatTimeValue(stat.avgTotalPerItemSec, unit)}
                  </div>
                </div>

                {/* Sub details */}
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      Pick na 1 ks:
                    </span>
                    <span className="font-mono font-medium text-slate-200">
                      {formatTimeValue(stat.avgPickPerItemSec, unit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Balení na 1 ks:
                    </span>
                    <span className="font-mono font-medium text-slate-200">
                      {formatTimeValue(stat.avgPackPerItemSec, unit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-slate-400 text-[11px]">
                    <span>Počet zásilek:</span>
                    <span className="font-mono text-slate-300 font-semibold">{stat.shipmentCount}</span>
                  </div>
                </div>
              </div>

              {/* Mini visual stacked bar representation */}
              <div className="mt-4 pt-3 border-t border-slate-800/60">
                <div className="text-[10px] text-slate-500 mb-1 flex justify-between">
                  <span>Poměr Pick / Balení</span>
                  <span className="font-mono">{formatTimeValue(stat.avgPickPerItemSec + stat.avgPackPerItemSec, unit)}</span>
                </div>
                <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${Math.round((stat.avgPickPerItemSec / (stat.avgPickPerItemSec + stat.avgPackPerItemSec || 1)) * 100)}%` }}
                    className="bg-indigo-500 h-full"
                    title={`Pick: ${formatTimeValue(stat.avgPickPerItemSec, unit)}`}
                  />
                  <div
                    style={{ width: `${Math.round((stat.avgPackPerItemSec / (stat.avgPickPerItemSec + stat.avgPackPerItemSec || 1)) * 100)}%` }}
                    className="bg-emerald-500 h-full"
                    title={`Balení: ${formatTimeValue(stat.avgPackPerItemSec, unit)}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Bar Comparison Chart */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-2 border-b border-slate-800/60">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">
              {metricTab === 'perItem'
                ? 'Porovnání doby na 1 produkt (Pickování vs Balení)'
                : metricTab === 'totalOrder'
                ? 'Porovnání celkové doby vyřízení celé zásilky'
                : 'Úspora času na 1 kus oproti 1-kusové zásilce'}
            </h3>
          </div>
          {/* Legend */}
          <div className="flex items-center space-x-4 text-xs">
            <span className="flex items-center space-x-1.5 text-indigo-300">
              <span className="w-3 h-3 rounded bg-indigo-500" />
              <span>Pickování (čas)</span>
            </span>
            <span className="flex items-center space-x-1.5 text-emerald-300">
              <span className="w-3 h-3 rounded bg-emerald-500" />
              <span>Balení (čas)</span>
            </span>
          </div>
        </div>

        {/* Chart body */}
        <div className="mt-6 space-y-4">
          {detailedBrackets.map((stat) => {
            const pickVal = metricTab === 'perItem' ? stat.avgPickPerItemSec : stat.avgPickTotalSec;
            const packVal = metricTab === 'perItem' ? stat.avgPackPerItemSec : stat.avgPackTotalSec;
            const maxVal = metricTab === 'perItem'
              ? maxPerItem
              : Math.max(...detailedBrackets.map(s => s.avgPickTotalSec + s.avgPackTotalSec), 1);

            const pickWidth = `${Math.min(100, Math.max(2, (pickVal / maxVal) * 100))}%`;
            const packWidth = `${Math.min(100, Math.max(2, (packVal / maxVal) * 100))}%`;

            return (
              <div key={stat.bracket} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="w-20 font-bold text-slate-200">
                      {stat.bracket === '5+' ? '5+ kusů' : `${stat.bracket} ${stat.bracket === '1' ? 'kus' : 'kusy'}`}
                    </span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      ({stat.shipmentCount} zásilek / {stat.itemCount} ks)
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 font-mono font-semibold text-white">
                    <span className="text-indigo-400">Pick: {formatTimeValue(pickVal, unit)}</span>
                    <span className="text-slate-600">+</span>
                    <span className="text-emerald-400">Balení: {formatTimeValue(packVal, unit)}</span>
                    <span className="text-slate-600">=</span>
                    <span className="text-purple-300 font-bold">
                      {formatTimeValue(pickVal + packVal, unit)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-5 w-full bg-slate-900 rounded-lg p-0.5 flex space-x-1 overflow-hidden border border-slate-800">
                  <div
                    style={{ width: pickWidth }}
                    className="h-full bg-gradient-to-r from-indigo-600 to-indigo-500 rounded flex items-center justify-end pr-1.5 text-[10px] font-mono text-white/90 transition-all duration-500"
                  >
                    {pickVal > 5 && formatTimeValue(pickVal, unit)}
                  </div>
                  <div
                    style={{ width: packWidth }}
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-500 rounded flex items-center justify-end pr-1.5 text-[10px] font-mono text-white/90 transition-all duration-500"
                  >
                    {packVal > 5 && formatTimeValue(packVal, unit)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comprehensive Breakdown Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <th className="py-3 px-4 font-semibold">Kategorie zásilky</th>
              <th className="py-3 px-3 font-semibold text-right">Zásilky</th>
              <th className="py-3 px-3 font-semibold text-right">Kusy celkem</th>
              <th className="py-3 px-3 font-semibold text-right text-indigo-300">Pick celkem (průměr)</th>
              <th className="py-3 px-3 font-semibold text-right text-indigo-300 bg-indigo-950/20">
                Pick na 1 ks (průměr / medián)
              </th>
              <th className="py-3 px-3 font-semibold text-right text-emerald-300">Balení celkem (průměr)</th>
              <th className="py-3 px-3 font-semibold text-right text-emerald-300 bg-emerald-950/20">
                Balení na 1 ks (průměr / medián)
              </th>
              <th className="py-3 px-3 font-semibold text-right text-purple-300">Celkem na 1 ks</th>
              <th className="py-3 px-4 font-semibold text-right text-emerald-400">Úspora na 1 ks vs 1ks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            {bracketStats.map((stat) => {
              const isAll = stat.bracket === 'all';
              const isSingle = stat.bracket === '1';

              return (
                <tr
                  key={stat.bracket}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isAll ? 'bg-slate-950/70 font-semibold' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-white flex items-center space-x-2">
                    <span className="font-semibold">{stat.label}</span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    {stat.shipmentCount.toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    {stat.itemCount.toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-indigo-300">
                    {formatTimeValue(stat.avgPickTotalSec, unit)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-indigo-200 bg-indigo-950/20">
                    <span>{formatTimeValue(stat.avgPickPerItemSec, unit)}</span>
                    <span className="text-[10px] text-slate-400 font-normal ml-1">
                      ({formatTimeValue(stat.medianPickPerItemSec, unit)})
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-300">
                    {formatTimeValue(stat.avgPackTotalSec, unit)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-200 bg-emerald-950/20">
                    <span>{formatTimeValue(stat.avgPackPerItemSec, unit)}</span>
                    <span className="text-[10px] text-slate-400 font-normal ml-1">
                      ({formatTimeValue(stat.medianPackPerItemSec, unit)})
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-purple-200">
                    {formatTimeValue(stat.avgTotalPerItemSec, unit)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {isSingle ? (
                      <span className="text-slate-500 font-normal">Reference (0%)</span>
                    ) : isAll ? (
                      <span className="text-slate-500">-</span>
                    ) : stat.totalSavingsPctVsSingle > 0 ? (
                      <span className="inline-flex items-center text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <TrendingDown className="w-3 h-3 mr-1" />
                        -{stat.totalSavingsPctVsSingle}%
                      </span>
                    ) : (
                      <span className="text-slate-400">0%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Box with Fulfillment Operational Insights */}
      {singleStat && (
        <div className="bg-gradient-to-r from-indigo-950/40 via-blue-950/30 to-purple-950/40 border border-indigo-500/20 rounded-2xl p-4 flex items-start space-x-3">
          <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 space-y-1">
            <span className="font-semibold text-white block">
              Manažerské shrnutí úspor z rozsahu:
            </span>
            <p>
              U 1-kusových zásilek tvoří velkou část celkového času příprava, chůze a balení obálky/krabice (v průměru{' '}
              <strong className="text-white">{formatTimeValue(singleStat.avgTotalPerItemSec, unit)}</strong> na produkt).
              U vícekusových zásilek se fixní čas chůze a balení rozpočítává mezi více produktů, což přináší až{' '}
              <strong className="text-emerald-300">
                {bracketStats.find(s => s.bracket === '5+')?.totalSavingsPctVsSingle || 0}% úsporu
              </strong>{' '}
              času na jeden expedovaný kus!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
