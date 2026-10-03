import React, { useState } from 'react';
import { BarChart3, TrendingDown, ArrowRight, Zap, Info, Percent, HelpCircle, Package, Clock } from 'lucide-react';
import { BracketStat, ItemBracket } from '../types.js';
import { formatTimeValue, getBracketBadgeColor } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface BracketComparisonProps {
  bracketStats: BracketStat[];
  unit: 'sec' | 'min';
}

export const BracketComparisonSection: React.FC<BracketComparisonProps> = ({ bracketStats, unit }) => {
  const { lang, t } = useLanguage();
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
              {t.brackets.sectionTitle}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {t.brackets.sectionSubtitle}
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
            {t.brackets.tabPerItem}
          </button>
          <button
            onClick={() => setMetricTab('totalOrder')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              metricTab === 'totalOrder'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.brackets.tabTotalOrder}
          </button>
          <button
            onClick={() => setMetricTab('savings')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              metricTab === 'savings'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.brackets.tabSavings}
          </button>
        </div>
      </div>

      {/* Visual Comparison Cards (6 Columns) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {detailedBrackets.map((stat) => {
          const colors = getBracketBadgeColor(stat.bracket);
          const isBase = stat.bracket === '1';

          const primaryValue = metricTab === 'perItem'
            ? stat.avgTotalPerItemSec
            : (stat.avgPickTotalSec + stat.avgPackTotalSec);

          const bracketLabel = stat.bracket === '6+'
            ? (lang === 'cs' ? '6+ kusů' : '6+ items')
            : `${stat.bracket} ${lang === 'cs' ? (stat.bracket === '1' ? 'kus' : stat.bracket === '2' || stat.bracket === '3' || stat.bracket === '4' ? 'kusy' : 'kusů') : (stat.bracket === '1' ? 'item' : 'items')}`;

          return (
            <div
              key={stat.bracket}
              className={`relative bg-slate-950/60 border rounded-2xl p-3.5 flex flex-col justify-between transition-all hover:border-slate-600 ${
                isBase ? 'border-blue-500/40 bg-blue-950/10' : 'border-slate-800'
              }`}
            >
              {/* Card top */}
              <div>
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}>
                    {bracketLabel}
                  </span>
                  {isBase ? (
                    <span className="text-[9px] text-blue-400 font-semibold uppercase tracking-wider">
                      {t.brackets.singleBase}
                    </span>
                  ) : stat.totalSavingsPctVsSingle > 0 ? (
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center">
                      <TrendingDown className="w-2.5 h-2.5 mr-0.5" />
                      -{stat.totalSavingsPctVsSingle}%
                    </span>
                  ) : null}
                </div>

                {/* Percentage representation badge */}
                <div className="mt-1.5 flex items-center justify-between bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-800 text-[10px]">
                  <span className="text-amber-300 font-bold" title="Procentuální podíl na všech zásilkách v daném období">
                    {stat.shipmentSharePct}% {t.brackets.orderShare}
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-indigo-300 font-bold" title="Procentuální podíl na celkovém objemu kusů v daném období">
                    {stat.itemSharePct}% {t.brackets.itemShare}
                  </span>
                </div>

                <div className="mt-2.5">
                  <div className="text-[10px] text-slate-400">
                    {metricTab === 'perItem' ? (lang === 'cs' ? 'Celkem / 1 ks:' : 'Total / unit:') : (lang === 'cs' ? 'Celá objednávka:' : 'Full order:')}
                  </div>
                  <div className="text-lg font-extrabold text-white font-mono">
                    {formatTimeValue(primaryValue, unit)}
                  </div>
                </div>

                {/* Sub details: Order Total vs Per Item */}
                <div className="mt-2.5 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-300">{t.brackets.pickPerItem}:</span>
                    <span className="font-mono text-slate-200 font-medium">
                      {formatTimeValue(stat.avgPickPerItemSec, unit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-300">{t.brackets.packPerItem}:</span>
                    <span className="font-mono text-slate-200 font-medium">
                      {formatTimeValue(stat.avgPackPerItemSec, unit)}
                    </span>
                  </div>
                  <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-slate-400 text-[10px]">
                    <span>{t.brackets.wholeOrderTotal}:</span>
                    <span className="font-mono text-slate-300 font-semibold">
                      {formatTimeValue(stat.avgPickTotalSec + stat.avgPackTotalSec, unit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span>{t.brackets.ordersInPeriod} ({stat.shipmentSharePct}%):</span>
                    <span className="font-mono text-amber-300 font-semibold">{stat.shipmentCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 text-[10px]">
                    <span>{t.brackets.itemsInPeriod} ({stat.itemSharePct}%):</span>
                    <span className="font-mono text-indigo-300 font-semibold">{stat.itemCount} {lang === 'cs' ? 'ks' : 'pcs'}</span>
                  </div>
                </div>
              </div>

              {/* Mini visual ratio bar */}
              <div className="mt-3 pt-2 border-t border-slate-800/60">
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden flex">
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
                ? t.brackets.chartTitlePerItem
                : metricTab === 'totalOrder'
                ? t.brackets.chartTitleTotal
                : t.brackets.chartTitleSavings}
            </h3>
          </div>
          {/* Legend */}
          <div className="flex items-center space-x-4 text-xs">
            <span className="flex items-center space-x-1.5 text-indigo-300">
              <span className="w-3 h-3 rounded bg-indigo-500" />
              <span>{t.brackets.legendPick}</span>
            </span>
            <span className="flex items-center space-x-1.5 text-emerald-300">
              <span className="w-3 h-3 rounded bg-emerald-500" />
              <span>{t.brackets.legendPack}</span>
            </span>
          </div>
        </div>

        {/* Chart body */}
        <div className="mt-5 space-y-3.5">
          {detailedBrackets.map((stat) => {
            const pickVal = metricTab === 'perItem' ? stat.avgPickPerItemSec : stat.avgPickTotalSec;
            const packVal = metricTab === 'perItem' ? stat.avgPackPerItemSec : stat.avgPackTotalSec;
            const maxVal = metricTab === 'perItem'
              ? maxPerItem
              : Math.max(...detailedBrackets.map(s => s.avgPickTotalSec + s.avgPackTotalSec), 1);

            const pickWidth = `${Math.min(100, Math.max(2, (pickVal / maxVal) * 100))}%`;
            const packWidth = `${Math.min(100, Math.max(2, (packVal / maxVal) * 100))}%`;

            const rowBracketLabel = stat.bracket === '6+'
              ? (lang === 'cs' ? '6+ kusů' : '6+ items')
              : `${stat.bracket} ${lang === 'cs' ? (stat.bracket === '1' ? 'kus' : 'kusy') : (stat.bracket === '1' ? 'item' : 'items')}`;

            return (
              <div key={stat.bracket} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="w-20 font-bold text-slate-200">
                      {rowBracketLabel}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      ({stat.shipmentCount} {lang === 'cs' ? 'obj.' : 'orders'} / <span className="text-amber-300 font-semibold">{stat.shipmentSharePct}%</span> • {stat.itemCount} {lang === 'cs' ? 'ks' : 'units'} / <span className="text-indigo-300 font-semibold">{stat.itemSharePct}%</span>)
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 font-mono font-semibold text-white">
                    <span className="text-indigo-400">Pick: {formatTimeValue(pickVal, unit)}</span>
                    <span className="text-slate-600">+</span>
                    <span className="text-emerald-400">{lang === 'cs' ? 'Balení:' : 'Pack:'} {formatTimeValue(packVal, unit)}</span>
                    <span className="text-slate-600">=</span>
                    <span className="text-purple-300 font-bold">
                      {formatTimeValue(pickVal + packVal, unit)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-4.5 w-full bg-slate-900 rounded-lg p-0.5 flex space-x-1 overflow-hidden border border-slate-800">
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

      {/* Comprehensive Breakdown Table: Order Total vs Per Item */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <th className="py-3 px-3 font-semibold">{t.brackets.tableCategory}</th>
              <th className="py-3 px-2.5 font-semibold text-right text-amber-300">{t.brackets.tableShipments}</th>
              <th className="py-3 px-2.5 font-semibold text-right text-indigo-300">{t.brackets.tableItems}</th>
              {/* Order total columns */}
              <th className="py-3 px-2.5 font-semibold text-right text-indigo-300 border-l border-slate-800">
                {t.brackets.tableOrderPick}
              </th>
              <th className="py-3 px-2.5 font-semibold text-right text-emerald-300">
                {t.brackets.tableOrderPack}
              </th>
              <th className="py-3 px-2.5 font-semibold text-right text-purple-300">
                {t.brackets.tableOrderTotal}
              </th>
              {/* Per item columns */}
              <th className="py-3 px-2.5 font-semibold text-right text-indigo-300 bg-indigo-950/20 border-l border-slate-800">
                {t.brackets.tableUnitPick}
              </th>
              <th className="py-3 px-2.5 font-semibold text-right text-emerald-300 bg-emerald-950/20">
                {t.brackets.tableUnitPack}
              </th>
              <th className="py-3 px-2.5 font-semibold text-right text-purple-200 font-bold bg-purple-950/20">
                {t.brackets.tableUnitTotal}
              </th>
              <th className="py-3 px-3 font-semibold text-right text-emerald-400 border-l border-slate-800">
                {t.brackets.tableSavings}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 font-mono text-[11px]">
            {bracketStats.map((stat) => {
              const isAll = stat.bracket === 'all';
              const isSingle = stat.bracket === '1';

              return (
                <tr
                  key={stat.bracket}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isAll ? 'bg-slate-950/70 font-semibold font-sans' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-medium text-white flex items-center space-x-1.5 font-sans">
                    <span>{stat.label}</span>
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-sans">
                    <span className="text-white font-medium">{stat.shipmentCount.toLocaleString('cs-CZ')}</span>
                    <span className="text-[10px] text-amber-300 font-mono ml-1 font-semibold">
                      ({stat.shipmentSharePct} %)
                    </span>
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-sans">
                    <span className="text-white font-medium">{stat.itemCount.toLocaleString('cs-CZ')}</span>
                    <span className="text-[10px] text-indigo-300 font-mono ml-1 font-semibold">
                      ({stat.itemSharePct} %)
                    </span>
                  </td>
                  {/* Order level times */}
                  <td className="py-2.5 px-2.5 text-right text-indigo-300 border-l border-slate-800">
                    {formatTimeValue(stat.avgPickTotalSec, unit)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right text-emerald-300">
                    {formatTimeValue(stat.avgPackTotalSec, unit)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-bold text-purple-300">
                    {formatTimeValue(stat.avgPickTotalSec + stat.avgPackTotalSec, unit)}
                  </td>
                  {/* Unit rate times */}
                  <td className="py-2.5 px-2.5 text-right font-bold text-indigo-200 bg-indigo-950/20 border-l border-slate-800">
                    <span>{formatTimeValue(stat.avgPickPerItemSec, unit)}</span>
                    <span className="text-[10px] text-slate-400 font-normal ml-1">
                      ({formatTimeValue(stat.medianPickPerItemSec, unit)})
                    </span>
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-bold text-emerald-200 bg-emerald-950/20">
                    <span>{formatTimeValue(stat.avgPackPerItemSec, unit)}</span>
                    <span className="text-[10px] text-slate-400 font-normal ml-1">
                      ({formatTimeValue(stat.medianPackPerItemSec, unit)})
                    </span>
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-bold text-purple-200 bg-purple-950/20">
                    {formatTimeValue(stat.avgTotalPerItemSec, unit)}
                  </td>
                  {/* Savings */}
                  <td className="py-2.5 px-3 text-right border-l border-slate-800">
                    {isSingle ? (
                      <span className="text-slate-500 font-normal">{lang === 'cs' ? 'Základ (0%)' : 'Base (0%)'}</span>
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
    </div>
  );
};
