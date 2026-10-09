import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  TrendingDown,
  Layers,
  Clock,
  Box,
  Package,
  Sliders,
  CheckCircle2,
  Info,
  ArrowRight,
  ShieldAlert,
  BarChart3
} from 'lucide-react';
import { MovementRecord, SimulationBracketResult, MultipickSimulationReport } from '../types.js';
import { runMultipickSlotSimulation, formatTimeValue } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface MultipickSimulationSectionProps {
  records: MovementRecord[];
  unit: 'sec' | 'min';
  cachedSimulation?: MultipickSimulationReport | null;
}

function formatHoursOrMins(seconds: number): string {
  if (seconds <= 0) return '0 min';
  const hours = seconds / 3600;
  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export const MultipickSimulationSection: React.FC<MultipickSimulationSectionProps> = ({
  records,
  unit,
  cachedSimulation,
}) => {
  const { lang, t } = useLanguage();

  // Initial simulation report to detect real limits
  const initialReport = useMemo(() => {
    if (cachedSimulation) return cachedSimulation;
    return runMultipickSlotSimulation(records);
  }, [cachedSimulation, records]);

  // Capacity limit override state
  const [capacityOverride, setCapacityOverride] = useState<number>(initialReport.boxCapacityLimit);
  const [displayUnit, setDisplayUnit] = useState<'hours' | 'tableUnit'>('hours');

  // Re-run simulation when capacity limit changes
  const report = useMemo(() => {
    return runMultipickSlotSimulation(records, capacityOverride);
  }, [records, capacityOverride]);

  const detailedBrackets = report.bracketResults.filter(b => b.bracket !== 'all');
  const allResult = report.bracketResults.find(b => b.bracket === 'all') || report.bracketResults[report.bracketResults.length - 1];

  const formatTimeSlot = (sec: number) => {
    if (displayUnit === 'hours') {
      return formatHoursOrMins(sec);
    }
    return formatTimeValue(sec, unit);
  };

  return (
    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-6 relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/30 shadow-inner">
              <Sparkles className="w-5 h-5 text-indigo-300" />
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {t.simulation.title}
                </h2>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider">
                  {t.simulation.potentialTag}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-4xl">
                {t.simulation.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Display Unit Switcher */}
        <div className="flex items-center space-x-3 self-start lg:self-auto">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setDisplayUnit('hours')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                displayUnit === 'hours' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.simulation.switchHours}
            </button>
            <button
              onClick={() => setDisplayUnit('tableUnit')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                displayUnit === 'tableUnit' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.simulation.switchUnit} ({unit === 'min' ? (lang === 'cs' ? 'minuty' : 'minutes') : (lang === 'cs' ? 'sekundy' : 'seconds')})
            </button>
          </div>
        </div>
      </div>

      {/* Box Capacity Constraint Control Bar */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center space-x-3">
          <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Sliders className="w-4 h-4" />
          </span>
          <div className="text-xs space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white">{t.simulation.boxLimitLabel}:</span>
              <span className="font-mono font-bold text-amber-300 text-sm px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20">
                {t.simulation.boxLimitMax} {capacityOverride} {t.simulation.boxLimitUnit}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {t.simulation.derivedFromData} = <strong className="text-slate-200">{report.maxObservedUnitsInBox} {lang === 'cs' ? 'ks' : 'units'}</strong>, {t.simulation.p95Word} = <strong className="text-slate-200">{report.p95ObservedUnitsInBox} {lang === 'cs' ? 'ks' : 'units'}</strong>, {t.simulation.avgWord} = <strong className="text-slate-200">{report.avgObservedUnitsInBox} {lang === 'cs' ? 'ks' : 'units'}</strong>.
            </p>
            {report.volumetricSummary && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-400">
                <span className="text-indigo-400 font-semibold flex items-center gap-1">
                  <Box className="w-3.5 h-3.5" />
                  {lang === 'cs' ? 'Objemová aproximace dle EAN:' : 'Volumetric SKU approximation:'}
                </span>
                <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                  {lang === 'cs' ? 'Drobný' : 'Small'}: <strong className="text-emerald-400">{report.volumetricSummary.smallSkusCount} SKU</strong> (~60-100 ks)
                </span>
                <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                  {lang === 'cs' ? 'Střední' : 'Medium'}: <strong className="text-sky-400">{report.volumetricSummary.mediumSkusCount} SKU</strong> (~25-50 ks)
                </span>
                <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                  {lang === 'cs' ? 'Objemný' : 'Bulky'}: <strong className="text-amber-400">{report.volumetricSummary.bulkySkusCount} SKU</strong> (~8-20 ks)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Interactive capacity slider */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <span className="text-[11px] text-slate-400 shrink-0">{t.simulation.adjustLimit}:</span>
          <input
            type="range"
            min={15}
            max={Math.max(60, Math.min(90, Math.round(report.maxObservedUnitsInBox * 1.3)))}
            value={capacityOverride}
            onChange={(e) => setCapacityOverride(Number(e.target.value))}
            className="w-36 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono font-bold text-white min-w-[3rem] text-right">
            {capacityOverride} {lang === 'cs' ? 'ks' : 'units'}
          </span>
          <button
            onClick={() => setCapacityOverride(initialReport.boxCapacityLimit)}
            className="text-[10px] text-slate-400 hover:text-indigo-300 underline underline-offset-2 shrink-0 cursor-pointer"
          >
            {t.simulation.resetLimit}
          </button>
        </div>
      </div>

      {/* Main KPI Summary Cards (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Saved Hours */}
        <div className="bg-gradient-to-br from-emerald-950/40 to-slate-950/70 border border-emerald-500/30 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4" />
              <span>{t.simulation.card1Title}</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold font-mono text-[11px]">
              -{report.overallSavingsPct}%
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            -{formatHoursOrMins(report.totalSavedSeconds)}
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            {t.simulation.card1Pick}: <strong className="text-indigo-300 font-mono">-{formatHoursOrMins(allResult?.pickSavingsSec || 0)}</strong> • {t.simulation.card1Pack}: <strong className="text-emerald-300 font-mono">-{formatHoursOrMins(allResult?.packSavingsSec || 0)}</strong>
          </p>
        </div>

        {/* Card 2: Current vs Optimized Time */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold text-[11px] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>{t.simulation.card2Title}</span>
            </span>
          </div>
          <div className="flex items-baseline space-x-2 font-mono">
            <span className="text-lg text-slate-400 line-through">
              {formatHoursOrMins(allResult?.baselineTotalSec || 0)}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-2xl font-extrabold text-emerald-300">
              {formatHoursOrMins(allResult?.optimizedTotalSec || 0)}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {t.simulation.card2Desc} <strong className="text-white font-mono">{report.totalSavedHours} {t.simulation.manHours}</strong>.
          </p>
        </div>

        {/* Card 3: Multipicking Rate Boost */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold text-[11px] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>{t.simulation.card3Title}</span>
            </span>
            <span className="text-purple-400 font-bold font-mono text-[11px]">
              +{report.simulatedMultipickRatioPct - report.baselineMultipickRatioPct}%
            </span>
          </div>
          <div className="flex items-baseline space-x-2 font-mono">
            <span className="text-lg text-slate-400">{report.baselineMultipickRatioPct}%</span>
            <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-2xl font-extrabold text-purple-300">
              {report.simulatedMultipickRatioPct}%
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {t.simulation.card3Desc}
          </p>
        </div>

        {/* Card 4: Constraints & Windows Analyzed */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold text-[11px] flex items-center gap-1.5">
              <Box className="w-4 h-4 text-amber-400" />
              <span>{t.simulation.card4Title}</span>
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {report.totalTwoHourSlots} <span className="text-xs font-normal text-slate-400">{t.simulation.slotsWord}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {t.simulation.simulatedBoxesDesc}: <strong className="text-slate-200 font-mono">{report.totalBoxesSimulated}</strong>, {lang === 'cs' ? 'původně' : 'previously'} {report.totalBoxesCurrent}).
          </p>
        </div>
      </div>

      {/* Comprehensive Savings Breakdown Table by Category (1, 2, 3, 4, 5, 6+ ks and Celkem) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <span>{t.simulation.breakdownTitle}</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              {t.simulation.breakdownSubtitle} {capacityOverride} {t.simulation.boxLimitUnit}.
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                <th className="py-3 px-3 font-semibold">{t.simulation.colCategory}</th>
                <th className="py-3 px-2 font-semibold text-right">{t.simulation.colOrders}</th>
                <th className="py-3 px-2 font-semibold text-right">{t.simulation.colItems}</th>

                {/* Stávající stav */}
                <th className="py-3 px-2.5 font-semibold text-right text-indigo-300 border-l border-slate-800">
                  {t.simulation.colCurrentPick}
                </th>
                <th className="py-3 px-2.5 font-semibold text-right text-emerald-300">
                  {t.simulation.colCurrentPack}
                </th>
                <th className="py-3 px-2.5 font-semibold text-right text-purple-300">
                  {t.simulation.colCurrentTotal}
                </th>

                {/* Optimalizovaný stav */}
                <th className="py-3 px-2.5 font-semibold text-right text-indigo-300 bg-indigo-950/20 border-l border-slate-800">
                  {t.simulation.colMultiPick}
                </th>
                <th className="py-3 px-2.5 font-semibold text-right text-emerald-300 bg-emerald-950/20">
                  {t.simulation.colMultiPack}
                </th>
                <th className="py-3 px-2.5 font-semibold text-right text-purple-200 font-bold bg-purple-950/20">
                  {t.simulation.colMultiTotal}
                </th>

                {/* Úspora */}
                <th className="py-3 px-2.5 font-semibold text-right text-indigo-400 border-l border-slate-800">
                  {t.simulation.colSavingsPick}
                </th>
                <th className="py-3 px-2.5 font-semibold text-right text-emerald-400">
                  {t.simulation.colSavingsPack}
                </th>
                <th className="py-3 px-3 font-semibold text-right text-emerald-300 bg-emerald-950/30 font-bold">
                  {t.simulation.colTotalSavings}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 font-mono text-[11px]">
              {report.bracketResults.map((stat) => {
                const isAll = stat.bracket === 'all';
                const bracketDisplay = isAll
                  ? t.simulation.allCategoriesLabel
                  : stat.bracket === '6+'
                  ? (lang === 'cs' ? '6+ kusů' : '6+ items')
                  : `${stat.bracket} ${lang === 'cs' ? (stat.bracket === '1' ? 'kus' : 'kusy') : (stat.bracket === '1' ? 'item' : 'items')}`;

                return (
                  <tr
                    key={stat.bracket}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isAll ? 'bg-slate-950/80 font-bold font-sans border-t-2 border-slate-700' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-medium text-white flex items-center space-x-1.5 font-sans">
                      <span className={isAll ? 'text-indigo-300 font-bold' : ''}>{bracketDisplay}</span>
                    </td>
                    <td className="py-3 px-2 text-right text-slate-300 font-sans">
                      <span>{stat.orderCount.toLocaleString('cs-CZ')}</span>
                      {!isAll && (
                        <span className="text-[10px] text-amber-300/80 ml-1 font-mono">
                          ({stat.orderSharePct}%)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right text-slate-300 font-sans">
                      <span>{stat.itemCount.toLocaleString('cs-CZ')}</span>
                      {!isAll && (
                        <span className="text-[10px] text-indigo-300/80 ml-1 font-mono">
                          ({stat.itemSharePct}%)
                        </span>
                      )}
                    </td>

                    {/* Stávající časy */}
                    <td className="py-3 px-2.5 text-right text-indigo-300/90 border-l border-slate-800">
                      {formatTimeSlot(stat.baselinePickSec)}
                    </td>
                    <td className="py-3 px-2.5 text-right text-emerald-300/90">
                      {formatTimeSlot(stat.baselinePackSec)}
                    </td>
                    <td className="py-3 px-2.5 text-right text-purple-300/90 font-semibold">
                      {formatTimeSlot(stat.baselineTotalSec)}
                    </td>

                    {/* Optimalizované časy */}
                    <td className="py-3 px-2.5 text-right text-indigo-200 bg-indigo-950/20 border-l border-slate-800 font-semibold">
                      {formatTimeSlot(stat.optimizedPickSec)}
                    </td>
                    <td className="py-3 px-2.5 text-right text-emerald-200 bg-emerald-950/20 font-semibold">
                      {formatTimeSlot(stat.optimizedPackSec)}
                    </td>
                    <td className="py-3 px-2.5 text-right text-purple-200 font-bold bg-purple-950/20">
                      {formatTimeSlot(stat.optimizedTotalSec)}
                    </td>

                    {/* Úspory */}
                    <td className="py-3 px-2.5 text-right text-indigo-400 border-l border-slate-800">
                      <span>-{formatTimeSlot(stat.pickSavingsSec)}</span>
                      <span className="text-[10px] text-indigo-300/70 ml-1 font-sans">
                        (-{stat.pickSavingsPct}%)
                      </span>
                    </td>
                    <td className="py-3 px-2.5 text-right text-emerald-400">
                      <span>-{formatTimeSlot(stat.packSavingsSec)}</span>
                      <span className="text-[10px] text-emerald-300/70 ml-1 font-sans">
                        (-{stat.packSavingsPct}%)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-300 bg-emerald-950/30 font-bold">
                      <div className="inline-flex items-center gap-1 text-emerald-300">
                        <TrendingDown className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span>-{formatTimeSlot(stat.totalSavingsSec)}</span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
                          -{stat.totalSavingsPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Category Comparison Progress Bars */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <TrendingDown className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              {t.simulation.chartTitle}
            </h4>
          </div>
          <div className="flex items-center space-x-4 text-xs font-medium">
            <span className="flex items-center space-x-1.5 text-slate-400">
              <span className="w-3 h-2 rounded bg-slate-700" />
              <span>{t.simulation.chartLegendCurrent}</span>
            </span>
            <span className="flex items-center space-x-1.5 text-emerald-400">
              <span className="w-3 h-2 rounded bg-emerald-500" />
              <span>{t.simulation.chartLegendOptimized}</span>
            </span>
          </div>
        </div>

        <div className="space-y-4 pt-1">
          {detailedBrackets.map((stat) => {
            const maxVal = stat.baselineTotalSec || 1;
            const optPct = Math.round((stat.optimizedTotalSec / maxVal) * 100);
            const savedPct = 100 - optPct;
            const bracketLabel = stat.bracket === '6+'
              ? (lang === 'cs' ? '6+ kusů' : '6+ items')
              : `${stat.bracket} ${lang === 'cs' ? (stat.bracket === '1' ? 'kus' : 'kusy') : (stat.bracket === '1' ? 'item' : 'items')}`;

            return (
              <div key={stat.bracket} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-200 w-24">
                      {bracketLabel}
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      ({stat.orderCount} {lang === 'cs' ? 'obj.' : 'orders'} • {stat.itemCount} {lang === 'cs' ? 'ks' : 'units'})
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 font-mono text-[11px]">
                    <span className="text-slate-400 line-through">
                      {formatHoursOrMins(stat.baselineTotalSec)}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className="text-emerald-300 font-bold">
                      {formatHoursOrMins(stat.optimizedTotalSec)}
                    </span>
                    <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      -{stat.totalSavingsPct}%
                    </span>
                  </div>
                </div>

                {/* Comparative bar */}
                <div className="h-4 w-full bg-slate-900 rounded-lg overflow-hidden flex border border-slate-800">
                  <div
                    style={{ width: `${optPct}%` }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-l flex items-center justify-end pr-2 text-[9px] font-mono text-white font-bold"
                  >
                    {optPct}% {t.simulation.chartTime}
                  </div>
                  <div
                    style={{ width: `${savedPct}%` }}
                    className="h-full bg-emerald-950/40 border-l border-emerald-500/30 flex items-center justify-center text-[9px] font-mono text-emerald-400 font-bold"
                  >
                    {t.simulation.chartSaved} {savedPct}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Explanatory Conclusion Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/30 via-indigo-950/30 to-purple-950/30 border border-indigo-500/20 space-y-3">
        <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
          <Info className="w-4 h-4" />
          <span>{t.simulation.howItWorksTitle}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t.simulation.pill1Title}</span>
            </span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              {t.simulation.pill1Desc}
            </p>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.simulation.pill2Title} ({capacityOverride} {lang === 'cs' ? 'ks' : 'units'})</span>
            </span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              {t.simulation.pill2Desc}
            </p>
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-1">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.simulation.pill3Title}</span>
            </span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              {t.simulation.pill3Desc}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
