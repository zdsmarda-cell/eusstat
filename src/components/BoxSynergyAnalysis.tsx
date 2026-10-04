import React from 'react';
import { Zap, CheckCircle2, Box, Package, TrendingDown, Info, BarChart3, ArrowRight, PieChart } from 'lucide-react';
import { BoxSynergyStat, HypothesisAnalysis } from '../types.js';
import { formatTimeValue } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface BoxSynergyAnalysisProps {
  synergyData: {
    boxStats: BoxSynergyStat[];
    hypothesis: HypothesisAnalysis;
  };
  unit: 'sec' | 'min';
}

export const BoxSynergyAnalysis: React.FC<BoxSynergyAnalysisProps> = ({ synergyData, unit }) => {
  const { lang, t } = useLanguage();
  const { boxStats, hypothesis } = synergyData;
  const { highOverlapBoxes: high, mediumOverlapBoxes: med, lowOverlapBoxes: low, bracketComparisons } = hypothesis;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {t.synergy.title}
              </h2>
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                {t.synergy.verifiedTag} ({boxStats.length} {t.synergy.boxesCount})
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2 max-w-4xl">
            {t.synergy.subtitle}
          </p>
        </div>
      </div>

      {/* Hypothesis Conclusion Callout Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-blue-950/30 to-purple-950/40 border border-emerald-500/30 space-y-3">
        <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
          <CheckCircle2 className="w-4 h-4" />
          <span>{t.synergy.hypothesisBannerTitle}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
          {/* Trend 1: Picking */}
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Box className="w-4 h-4 text-indigo-400" />
                <span>{t.synergy.trend1Title}</span>
              </span>
              <span className="text-emerald-400 font-bold font-mono">
                +{hypothesis.pickingSpeedupPct}% {t.synergy.trend1Speedup}
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              {t.synergy.trend1Desc} ({lang === 'cs' ? 'z' : 'from'}{' '}
              <strong className="text-slate-200">{formatTimeValue(low.avgPickPerUnitSec, unit)}</strong>{' '}
              {lang === 'cs' ? 'na pouhých' : 'down to'}{' '}
              <strong className="text-emerald-300">{formatTimeValue(high.avgPickPerUnitSec, unit)}</strong>).
            </p>
          </div>

          {/* Trend 2: Packing (comparable categories) */}
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <Package className="w-4 h-4 text-amber-400" />
                <span>{t.synergy.trend2Title}</span>
              </span>
              <span className="text-emerald-400 font-bold font-mono">
                +{hypothesis.packingSpeedupPct}% {t.synergy.trend2Speedup}
              </span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              {t.synergy.trend2Desc} ({lang === 'cs' ? 'z' : 'from'}{' '}
              <strong className="text-rose-300">{formatTimeValue(low.avgPackPerUnitSec, unit)}</strong>{' '}
              {lang === 'cs' ? 'na' : 'down to'}{' '}
              <strong className="text-emerald-300">{formatTimeValue(high.avgPackPerUnitSec, unit)}</strong> {lang === 'cs' ? 'na kus' : 'per unit'}).
            </p>
          </div>
        </div>
      </div>

      {/* NEW: Sample Distribution Overview Bar */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="font-bold text-white flex items-center gap-1.5">
            <PieChart className="w-4 h-4 text-indigo-400" />
            {t.synergy.sampleDistributionTitle}:
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            {lang === 'cs' ? 'Celkem analyzováno' : 'Total analyzed'}: <strong className="text-white">{boxStats.length}</strong> {t.synergy.boxesCount} ({((high.totalUnits || 0) + (med.totalUnits || 0) + (low.totalUnits || 0)).toLocaleString()} {lang === 'cs' ? 'kusů' : 'units'})
          </span>
        </div>

        {/* Stacked visual distribution bar */}
        <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800 shadow-inner">
          <div
            style={{ width: `${Math.max(3, high.sharePct || 0)}%` }}
            className="h-full bg-emerald-500 transition-all hover:brightness-110"
            title={`${t.synergy.highOverlapTitle}: ${high.sharePct}%`}
          />
          <div
            style={{ width: `${Math.max(3, med.sharePct || 0)}%` }}
            className="h-full bg-indigo-500 transition-all hover:brightness-110"
            title={`${t.synergy.medOverlapTitle}: ${med.sharePct}%`}
          />
          <div
            style={{ width: `${Math.max(3, low.sharePct || 0)}%` }}
            className="h-full bg-rose-500 transition-all hover:brightness-110"
            title={`${t.synergy.lowOverlapTitle}: ${low.sharePct}%`}
          />
        </div>

        {/* Legend with percentages */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
          <div className="flex items-center space-x-2 bg-emerald-950/20 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-slate-300 truncate">{t.synergy.highOverlapTitle}:</span>
            <strong className="text-emerald-400 font-mono ml-auto font-bold">{high.sharePct}%</strong>
            <span className="text-slate-500 text-[10px]">({high.unitSharePct}% {lang === 'cs' ? 'ks' : 'units'})</span>
          </div>

          <div className="flex items-center space-x-2 bg-indigo-950/20 border border-indigo-500/20 px-3 py-1.5 rounded-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shrink-0" />
            <span className="text-slate-300 truncate">{t.synergy.medOverlapTitle}:</span>
            <strong className="text-indigo-400 font-mono ml-auto font-bold">{med.sharePct}%</strong>
            <span className="text-slate-500 text-[10px]">({med.unitSharePct}% {lang === 'cs' ? 'ks' : 'units'})</span>
          </div>

          <div className="flex items-center space-x-2 bg-rose-950/20 border border-rose-500/20 px-3 py-1.5 rounded-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0" />
            <span className="text-slate-300 truncate">{t.synergy.lowOverlapTitle}:</span>
            <strong className="text-rose-400 font-mono ml-auto font-bold">{low.sharePct}%</strong>
            <span className="text-slate-500 text-[10px]">({low.unitSharePct}% {lang === 'cs' ? 'ks' : 'units'})</span>
          </div>
        </div>
      </div>

      {/* 3 Categories Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: High overlap */}
        <div className="bg-slate-950/60 border border-emerald-500/30 rounded-2xl p-4 space-y-3 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold text-emerald-400 px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              {t.synergy.highOverlapTitle}
            </span>
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-emerald-400">
                {high.sharePct}% <span className="text-[10px] text-slate-400 font-normal">{t.synergy.sampleShareWord}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {high.count} {t.synergy.boxesCount} • {(high.totalUnits || 0).toLocaleString()} {lang === 'cs' ? 'ks' : 'units'}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {/* Share badge */}
            <div className="flex justify-between items-center text-slate-400 bg-emerald-950/20 px-2.5 py-1.5 rounded-lg border border-emerald-500/20">
              <span className="text-slate-300 font-medium">{lang === 'cs' ? 'Zastoupení ve vzorku:' : 'Share of sample:'}</span>
              <strong className="text-emerald-300 font-mono">
                {high.sharePct}% {t.synergy.sampleShareOfBoxes} <span className="text-slate-400 font-normal text-[10px]">({high.unitSharePct}% {t.synergy.sampleShareOfUnits})</span>
              </strong>
            </div>

            <div className="flex justify-between items-center text-slate-400">
              <span>{t.synergy.avgUnitsPerEan}:</span>
              <strong className="text-white font-mono text-sm">{high.avgUnitsPerEan} ks/SKU</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-indigo-300">{t.synergy.pickPerUnit}:</span>
              <strong className="text-indigo-200 font-mono">{formatTimeValue(high.avgPickPerUnitSec, unit)}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-emerald-300">{t.synergy.packPerUnit}:</span>
              <strong className="text-emerald-200 font-mono">{formatTimeValue(high.avgPackPerUnitSec, unit)}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800">
              <span className="text-purple-300 font-semibold">{t.synergy.totalPerUnit}:</span>
              <strong className="text-purple-200 font-mono font-bold">
                {formatTimeValue(high.avgPickPerUnitSec + high.avgPackPerUnitSec, unit)}
              </strong>
            </div>
          </div>
          <div className="text-[10px] text-emerald-400/90 pt-2 border-t border-slate-800">
            {t.synergy.highOverlapNote}
          </div>
        </div>

        {/* Card 2: Medium overlap */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold text-indigo-400 px-2.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20">
              {t.synergy.medOverlapTitle}
            </span>
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-indigo-400">
                {med.sharePct}% <span className="text-[10px] text-slate-400 font-normal">{t.synergy.sampleShareWord}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {med.count} {t.synergy.boxesCount} • {(med.totalUnits || 0).toLocaleString()} {lang === 'cs' ? 'ks' : 'units'}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {/* Share badge */}
            <div className="flex justify-between items-center text-slate-400 bg-indigo-950/20 px-2.5 py-1.5 rounded-lg border border-indigo-500/20">
              <span className="text-slate-300 font-medium">{lang === 'cs' ? 'Zastoupení ve vzorku:' : 'Share of sample:'}</span>
              <strong className="text-indigo-300 font-mono">
                {med.sharePct}% {t.synergy.sampleShareOfBoxes} <span className="text-slate-400 font-normal text-[10px]">({med.unitSharePct}% {t.synergy.sampleShareOfUnits})</span>
              </strong>
            </div>

            <div className="flex justify-between items-center text-slate-400">
              <span>{t.synergy.avgUnitsPerEan}:</span>
              <strong className="text-white font-mono text-sm">{med.avgUnitsPerEan} ks/SKU</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-indigo-300">{t.synergy.pickPerUnit}:</span>
              <strong className="text-indigo-200 font-mono">{formatTimeValue(med.avgPickPerUnitSec, unit)}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-emerald-300">{t.synergy.packPerUnit}:</span>
              <strong className="text-emerald-200 font-mono">{formatTimeValue(med.avgPackPerUnitSec, unit)}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800">
              <span className="text-purple-300 font-semibold">{t.synergy.totalPerUnit}:</span>
              <strong className="text-purple-200 font-mono font-bold">
                {formatTimeValue(med.avgPickPerUnitSec + med.avgPackPerUnitSec, unit)}
              </strong>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-800">
            {t.synergy.medOverlapNote}
          </div>
        </div>

        {/* Card 3: Low overlap / High diversity */}
        <div className="bg-slate-950/60 border border-rose-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold text-rose-400 px-2.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20">
              {t.synergy.lowOverlapTitle}
            </span>
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-rose-400">
                {low.sharePct}% <span className="text-[10px] text-slate-400 font-normal">{t.synergy.sampleShareWord}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {low.count} {t.synergy.boxesCount} • {(low.totalUnits || 0).toLocaleString()} {lang === 'cs' ? 'ks' : 'units'}
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {/* Share badge */}
            <div className="flex justify-between items-center text-slate-400 bg-rose-950/20 px-2.5 py-1.5 rounded-lg border border-rose-500/20">
              <span className="text-slate-300 font-medium">{lang === 'cs' ? 'Zastoupení ve vzorku:' : 'Share of sample:'}</span>
              <strong className="text-rose-300 font-mono">
                {low.sharePct}% {t.synergy.sampleShareOfBoxes} <span className="text-slate-400 font-normal text-[10px]">({low.unitSharePct}% {t.synergy.sampleShareOfUnits})</span>
              </strong>
            </div>

            <div className="flex justify-between items-center text-slate-400">
              <span>{t.synergy.avgUnitsPerEan}:</span>
              <strong className="text-white font-mono text-sm">{low.avgUnitsPerEan} ks/SKU</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-indigo-300">{t.synergy.pickPerUnit}:</span>
              <strong className="text-indigo-200 font-mono">{formatTimeValue(low.avgPickPerUnitSec, unit)}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span className="text-emerald-300">{t.synergy.packPerUnit}:</span>
              <strong className="text-emerald-200 font-mono">{formatTimeValue(low.avgPackPerUnitSec, unit)}</strong>
            </div>
            <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800">
              <span className="text-purple-300 font-semibold">{t.synergy.totalPerUnit}:</span>
              <strong className="text-purple-200 font-mono font-bold">
                {formatTimeValue(low.avgPickPerUnitSec + low.avgPackPerUnitSec, unit)}
              </strong>
            </div>
          </div>
          <div className="text-[10px] text-rose-400/90 pt-2 border-t border-slate-800">
            {t.synergy.lowOverlapNote}
          </div>
        </div>
      </div>

      {/* NEW: Comprehensive Category-by-Category Comparison Table across all categories (1 to 6+ ks) */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span>{t.synergy.tableTitle}</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t.synergy.tableSubtitle}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                <th className="py-3 px-3 font-semibold">{t.synergy.colCategory}</th>
                <th className="py-3 px-2 font-semibold text-right text-slate-400">{t.synergy.colOrdersHigh}</th>
                <th className="py-3 px-2 font-semibold text-right text-slate-400">{t.synergy.colOrdersLow}</th>

                {/* Pick comparison */}
                <th className="py-3 px-2.5 font-semibold text-right text-indigo-300 border-l border-slate-800">
                  {t.synergy.colPickComp}
                </th>
                <th className="py-3 px-2.5 font-semibold text-right text-indigo-400">
                  {t.synergy.colPickSavings}
                </th>

                {/* Pack comparison */}
                <th className="py-3 px-2.5 font-semibold text-right text-emerald-300 border-l border-slate-800">
                  {t.synergy.colPackComp}
                </th>
                <th className="py-3 px-2.5 font-semibold text-right text-emerald-400">
                  {t.synergy.colPackSavings}
                </th>

                {/* Total per unit */}
                <th className="py-3 px-2.5 font-semibold text-right text-purple-300 border-l border-slate-800">
                  {t.synergy.colTotalComp}
                </th>
                <th className="py-3 px-3 font-semibold text-right text-emerald-300 bg-emerald-950/30 font-bold">
                  {t.synergy.colTotalSavings}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 font-mono text-[11px]">
              {bracketComparisons.map((row) => {
                const isAll = row.bracket === 'all';
                const bracketLabel = isAll
                  ? (lang === 'cs' ? 'Celkem za všechny kategorie' : 'All categories total')
                  : row.bracket === '6+'
                  ? (lang === 'cs' ? '6+ kusů' : '6+ items')
                  : `${row.bracket} ${lang === 'cs' ? (row.bracket === '1' ? 'kus' : 'kusy') : (row.bracket === '1' ? 'item' : 'items')}`;

                return (
                  <tr
                    key={row.bracket}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isAll ? 'bg-slate-950/80 font-bold font-sans border-t-2 border-slate-700' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-medium text-white flex items-center space-x-1.5 font-sans">
                      <span className={isAll ? 'text-amber-300 font-bold' : ''}>{bracketLabel}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-300 font-sans">
                      <span className="text-emerald-400 font-medium">{row.highOrders}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-300 font-sans">
                      <span className="text-rose-400 font-medium">{row.lowOrders}</span>
                    </td>

                    {/* Pick */}
                    <td className="py-2.5 px-2.5 text-right border-l border-slate-800">
                      <span className="text-emerald-300 font-bold">{formatTimeValue(row.highPickSec, unit)}</span>
                      <span className="text-slate-500 mx-1">vs</span>
                      <span className="text-slate-400">{formatTimeValue(row.lowPickSec, unit)}</span>
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      {row.pickSavingsPct > 0 ? (
                        <span className="inline-flex items-center text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          <TrendingDown className="w-2.5 h-2.5 mr-0.5" />
                          -{row.pickSavingsPct}%
                        </span>
                      ) : (
                        <span className="text-slate-500">0%</span>
                      )}
                    </td>

                    {/* Pack */}
                    <td className="py-2.5 px-2.5 text-right border-l border-slate-800">
                      <span className="text-emerald-300 font-bold">{formatTimeValue(row.highPackSec, unit)}</span>
                      <span className="text-slate-500 mx-1">vs</span>
                      <span className="text-slate-400">{formatTimeValue(row.lowPackSec, unit)}</span>
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      {row.packSavingsPct > 0 ? (
                        <span className="inline-flex items-center text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          <TrendingDown className="w-2.5 h-2.5 mr-0.5" />
                          -{row.packSavingsPct}%
                        </span>
                      ) : (
                        <span className="text-slate-500">0%</span>
                      )}
                    </td>

                    {/* Total */}
                    <td className="py-2.5 px-2.5 text-right border-l border-slate-800">
                      <span className="text-purple-300 font-bold">{formatTimeValue(row.highTotalSec, unit)}</span>
                      <span className="text-slate-500 mx-1">vs</span>
                      <span className="text-slate-400">{formatTimeValue(row.lowTotalSec, unit)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right bg-emerald-950/30">
                      {row.totalSavingsPct > 0 ? (
                        <span className="inline-flex items-center text-emerald-300 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <TrendingDown className="w-3 h-3 mr-0.5" />
                          -{row.totalSavingsPct}%
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Methodology note */}
        <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-start space-x-2.5 text-xs text-slate-400">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            {t.synergy.methodologyNote}
          </p>
        </div>
      </div>
    </div>
  );
};
