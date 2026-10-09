import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Layers,
  Package,
  Clock,
  BarChart3,
  TrendingUp,
  LineChart as LineChartIcon,
  PieChart,
  Sparkles,
  Info,
  CheckCircle2
} from 'lucide-react';
import { DailyStat, MovementRecord, DayOfWeekStat, DailyPerformanceReport } from '../types.js';
import { computeDailyPerformanceReport, formatTimeValue } from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface DailyTrendChartProps {
  dailyStats: DailyStat[];
  records?: MovementRecord[];
  unit: 'sec' | 'min';
  cachedReport?: DailyPerformanceReport | null;
}

type ViewTab = 'dow' | 'calendar' | 'chart';

export const DailyTrendChart: React.FC<DailyTrendChartProps> = ({
  dailyStats,
  records = [],
  unit,
  cachedReport,
}) => {
  const { lang, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<ViewTab>('dow');
  const [hoveredChartIndex, setHoveredChartIndex] = useState<number | null>(null);

  // Use precomputed report if provided or compute from records
  const report = useMemo(() => {
    if (cachedReport) return cachedReport;
    return computeDailyPerformanceReport(records);
  }, [cachedReport, records]);

  const { dayOfWeekStats, dailyStats: enrichedDailyStats, overallPareto } = report;

  // Totals across DOW for summary row
  const dowTotals = useMemo(() => {
    const totalOrders = dayOfWeekStats.reduce((s, d) => s + d.totalOrders, 0);
    const totalUnits = dayOfWeekStats.reduce((s, d) => s + d.totalUnits, 0);
    const sumPick = dayOfWeekStats.reduce((s, d) => s + d.avgPickPerItemSec * d.totalUnits, 0);
    const sumPack = dayOfWeekStats.reduce((s, d) => s + d.avgPackPerItemSec * d.totalUnits, 0);

    const avgPickPerItemSec = totalUnits > 0 ? Number((sumPick / totalUnits).toFixed(1)) : 0;
    const avgPackPerItemSec = totalUnits > 0 ? Number((sumPack / totalUnits).toFixed(1)) : 0;
    const avgTotalPerItemSec = Number((avgPickPerItemSec + avgPackPerItemSec).toFixed(1));

    const avgPickPerOrderSec = totalOrders > 0 ? Number((sumPick / totalOrders).toFixed(1)) : 0;
    const avgPackPerOrderSec = totalOrders > 0 ? Number((sumPack / totalOrders).toFixed(1)) : 0;
    const avgTotalPerOrderSec = Number((avgPickPerOrderSec + avgPackPerOrderSec).toFixed(1));

    return {
      totalOrders,
      totalUnits,
      avgPickPerItemSec,
      avgPackPerItemSec,
      avgTotalPerItemSec,
      avgPickPerOrderSec,
      avgPackPerOrderSec,
      avgTotalPerOrderSec,
    };
  }, [dayOfWeekStats]);

  // SVG Chart Layout Helpers
  const svgWidth = 900;
  const svgHeight = 260;
  const padding = { top: 20, right: 30, bottom: 40, left: 55 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  const maxChartY = useMemo(() => {
    if (enrichedDailyStats.length === 0) return 20;
    const maxVal = Math.max(
      ...enrichedDailyStats.map(d => Math.max(d.avgTotalPerItemSec, d.avgPickPerItemSec, d.avgPackPerItemSec)),
      10
    );
    return Math.ceil(maxVal * 1.2);
  }, [enrichedDailyStats]);

  const getX = (index: number) => {
    if (enrichedDailyStats.length <= 1) return padding.left + graphWidth / 2;
    return padding.left + (index / (enrichedDailyStats.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    return padding.top + graphHeight - (val / maxChartY) * graphHeight;
  };

  const makePath = (getVal: (d: DailyStat) => number) => {
    return enrichedDailyStats
      .map((d, i) => {
        const x = getX(i);
        const y = getY(getVal(d));
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-6">
      {/* Header and View Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                {t.trend.title}
              </h2>
              <span className="text-[11px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                Pondělí – Neděle & Pareto 80/20
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2 max-w-4xl">
            {t.trend.subtitle}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs self-start lg:self-auto">
          <button
            onClick={() => setActiveTab('dow')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
              activeTab === 'dow'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{t.trend.tabDayOfWeek}</span>
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{t.trend.tabCalendarDays}</span>
          </button>
          <button
            onClick={() => setActiveTab('chart')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
              activeTab === 'chart'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LineChartIcon className="w-3.5 h-3.5" />
            <span>{t.trend.tabChart}</span>
          </button>
        </div>
      </div>

      {/* Pareto 80/20 Top KPI Cards for the Whole Period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 80% Volume Drivers */}
        <div className="bg-gradient-to-br from-emerald-950/40 via-slate-950/80 to-slate-900/60 border border-emerald-500/30 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <PieChart className="w-4 h-4" />
              <span>{t.trend.paretoTopTitle}</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold font-mono text-[11px]">
              {overallPareto.top80UnitsPct}% kusů
            </span>
          </div>
          <div className="flex items-baseline space-x-2 font-mono">
            <span className="text-2xl font-extrabold text-white">
              {overallPareto.top80ProductsCount} SKU
            </span>
            <span className="text-xs text-slate-400">
              ({overallPareto.top80ProductsSharePct}% sortimentu)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Těchto <strong>{overallPareto.top80ProductsCount} produktů</strong> generuje {overallPareto.top80Units.toLocaleString('cs-CZ')} ks ({overallPareto.top80UnitsPct} % expedice).
          </p>
        </div>

        {/* Card 2: Remaining 20% Volume (Long-tail) */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold text-[11px] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>{t.trend.paretoTailTitle}</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold font-mono text-[11px]">
              {overallPareto.remaining20UnitsPct}% kusů
            </span>
          </div>
          <div className="flex items-baseline space-x-2 font-mono">
            <span className="text-2xl font-extrabold text-white">
              {overallPareto.remaining20ProductsCount} SKU
            </span>
            <span className="text-xs text-slate-400">
              ({overallPareto.remaining20ProductsSharePct}% sortimentu)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Zbylých <strong>{overallPareto.remaining20ProductsCount} produktů</strong> tvoří dlouhý chvost ({overallPareto.remaining20Units.toLocaleString('cs-CZ')} ks).
          </p>
        </div>

        {/* Card 3: Total SKUs in period & Top Products */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold text-[11px] flex items-center gap-1.5">
              <Package className="w-4 h-4 text-indigo-400" />
              <span>Top produkty v období</span>
            </span>
            <span className="text-xs text-indigo-400 font-mono font-bold">
              {overallPareto.totalUniqueProducts} SKU celkem
            </span>
          </div>
          <div className="space-y-1 text-xs pt-0.5">
            {overallPareto.topProducts.slice(0, 2).map((tp, idx) => (
              <div key={tp.ean} className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-300 font-sans truncate max-w-[130px]">
                  #{idx + 1} {tp.ean}
                </span>
                <span className="text-emerald-400 font-bold">
                  {tp.units} ks ({tp.sharePct}%)
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">
            Nejčastěji vyskladňované zboží v expedici.
          </p>
        </div>

        {/* Card 4: Average Period Performance */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold text-[11px] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Průměrná rychlost skladu</span>
            </span>
          </div>
          <div className="flex items-baseline space-x-2 font-mono">
            <span className="text-2xl font-extrabold text-white">
              {formatTimeValue(dowTotals.avgTotalPerItemSec, unit)}
            </span>
            <span className="text-xs text-slate-400">na 1 kus</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-snug">
            Pickování: <strong className="text-indigo-300 font-mono">{formatTimeValue(dowTotals.avgPickPerItemSec, unit)}</strong> • Balení: <strong className="text-emerald-300 font-mono">{formatTimeValue(dowTotals.avgPackPerItemSec, unit)}</strong>
          </p>
        </div>
      </div>

      {/* VIEW 1: DAY OF WEEK TABLE (Pondělí až Neděle) - User's Primary Requirement */}
      {activeTab === 'dow' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Přehled výkonnosti podle dnů v týdnu (Pondělí až Neděle) s Pareto 80/20
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Agregace skladové zátěže a produktového profilu pro dny v týdnu
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-3.5 font-semibold text-white">Den v týdnu</th>
                  <th className="py-3 px-3 font-semibold text-right">Zpracované objednávky</th>
                  <th className="py-3 px-3 font-semibold text-right">Zpracované kusy</th>

                  {/* Picking times */}
                  <th className="py-3 px-3 font-semibold text-right text-indigo-300 border-l border-slate-800">
                    Pickování / 1 ks
                  </th>
                  <th className="py-3 px-3 font-semibold text-right text-indigo-300/80">
                    Pickování / obj.
                  </th>

                  {/* Packing times */}
                  <th className="py-3 px-3 font-semibold text-right text-emerald-300 border-l border-slate-800">
                    Balení / 1 ks
                  </th>
                  <th className="py-3 px-3 font-semibold text-right text-emerald-300/80">
                    Balení / obj.
                  </th>

                  {/* Total Fulfillment Time */}
                  <th className="py-3 px-3 font-semibold text-right text-purple-200 font-bold bg-purple-950/20 border-l border-slate-800">
                    Celkem / 1 ks
                  </th>

                  {/* Pareto Analysis */}
                  <th className="py-3 px-3 font-semibold text-right text-emerald-300 bg-emerald-950/20 border-l border-slate-800">
                    80 % objemu (SKU)
                  </th>
                  <th className="py-3 px-3 font-semibold text-right text-amber-300 bg-amber-950/20">
                    Zbylých 20 % (SKU)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 font-mono text-[11px]">
                {dayOfWeekStats.map((dow) => {
                  const isWeekend = dow.dayIndex === 5 || dow.dayIndex === 6;
                  const dayName = lang === 'cs' ? dow.dayNameCs : dow.dayNameEn;

                  return (
                    <tr
                      key={dow.dayIndex}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isWeekend ? 'bg-slate-950/30' : ''
                      }`}
                    >
                      <td className="py-3 px-3.5 font-medium text-white flex items-center space-x-2 font-sans">
                        <span className="w-2 h-2 rounded-full bg-indigo-500/70" />
                        <span className="font-bold text-slate-100">{dayName}</span>
                      </td>

                      {/* Orders */}
                      <td className="py-3 px-3 text-right text-slate-300 font-sans">
                        <span>{dow.totalOrders.toLocaleString('cs-CZ')}</span>
                        {dowTotals.totalOrders > 0 && (
                          <span className="text-[10px] text-slate-500 ml-1 font-mono">
                            ({Math.round((dow.totalOrders / dowTotals.totalOrders) * 100)}%)
                          </span>
                        )}
                      </td>

                      {/* Units */}
                      <td className="py-3 px-3 text-right text-slate-300 font-sans">
                        <span className="font-semibold text-white">{dow.totalUnits.toLocaleString('cs-CZ')}</span>
                        {dowTotals.totalUnits > 0 && (
                          <span className="text-[10px] text-indigo-400 ml-1 font-mono">
                            ({Math.round((dow.totalUnits / dowTotals.totalUnits) * 100)}%)
                          </span>
                        )}
                      </td>

                      {/* Pick times */}
                      <td className="py-3 px-3 text-right text-indigo-300 font-semibold border-l border-slate-800">
                        {formatTimeValue(dow.avgPickPerItemSec, unit)}
                      </td>
                      <td className="py-3 px-3 text-right text-indigo-300/70">
                        {formatTimeValue(dow.avgPickPerOrderSec, unit)}
                      </td>

                      {/* Pack times */}
                      <td className="py-3 px-3 text-right text-emerald-300 font-semibold border-l border-slate-800">
                        {formatTimeValue(dow.avgPackPerItemSec, unit)}
                      </td>
                      <td className="py-3 px-3 text-right text-emerald-300/70">
                        {formatTimeValue(dow.avgPackPerOrderSec, unit)}
                      </td>

                      {/* Total */}
                      <td className="py-3 px-3 text-right text-purple-200 font-bold bg-purple-950/20 border-l border-slate-800">
                        {formatTimeValue(dow.avgTotalPerItemSec, unit)}
                      </td>

                      {/* Pareto 80% */}
                      <td className="py-3 px-3 text-right text-emerald-300 bg-emerald-950/20 border-l border-slate-800">
                        <span className="font-bold">{dow.pareto.top80ProductsCount} SKU</span>
                        <span className="text-[10px] text-emerald-400/80 ml-1 font-sans">
                          ({dow.pareto.top80ProductsSharePct}%)
                        </span>
                      </td>

                      {/* Pareto 20% */}
                      <td className="py-3 px-3 text-right text-amber-300 bg-amber-950/20">
                        <span className="font-bold">{dow.pareto.remaining20ProductsCount} SKU</span>
                        <span className="text-[10px] text-amber-400/80 ml-1 font-sans">
                          ({dow.pareto.remaining20ProductsSharePct}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* Summary / Total Row */}
                <tr className="bg-slate-950/90 border-t-2 border-slate-700 font-bold text-xs">
                  <td className="py-3.5 px-3.5 text-indigo-300 font-sans">
                    {t.trend.totalRow}
                  </td>
                  <td className="py-3.5 px-3 text-right text-white font-sans">
                    {dowTotals.totalOrders.toLocaleString('cs-CZ')} obj.
                  </td>
                  <td className="py-3.5 px-3 text-right text-emerald-300 font-sans">
                    {dowTotals.totalUnits.toLocaleString('cs-CZ')} ks
                  </td>

                  {/* Pick avg */}
                  <td className="py-3.5 px-3 text-right text-indigo-300 border-l border-slate-800">
                    {formatTimeValue(dowTotals.avgPickPerItemSec, unit)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-indigo-400/80">
                    {formatTimeValue(dowTotals.avgPickPerOrderSec, unit)}
                  </td>

                  {/* Pack avg */}
                  <td className="py-3.5 px-3 text-right text-emerald-300 border-l border-slate-800">
                    {formatTimeValue(dowTotals.avgPackPerItemSec, unit)}
                  </td>
                  <td className="py-3.5 px-3 text-right text-emerald-400/80">
                    {formatTimeValue(dowTotals.avgPackPerOrderSec, unit)}
                  </td>

                  {/* Total avg */}
                  <td className="py-3.5 px-3 text-right text-purple-200 bg-purple-950/40 border-l border-slate-800">
                    {formatTimeValue(dowTotals.avgTotalPerItemSec, unit)}
                  </td>

                  {/* Overall Pareto */}
                  <td className="py-3.5 px-3 text-right text-emerald-300 bg-emerald-950/30 border-l border-slate-800">
                    {overallPareto.top80ProductsCount} SKU ({overallPareto.top80ProductsSharePct}%)
                  </td>
                  <td className="py-3.5 px-3 text-right text-amber-300 bg-amber-950/30">
                    {overallPareto.remaining20ProductsCount} SKU ({overallPareto.remaining20ProductsSharePct}%)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: CALENDAR DAYS TABLE (Detail po dnech) */}
      {activeTab === 'calendar' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Rozpis podle jednotlivých kalendářních dnů s Pareto 80/20
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Chronologický vývoj po jednotlivých datech
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-3.5 font-semibold text-white">Datum</th>
                  <th className="py-3 px-3 font-semibold text-right">Objednávky</th>
                  <th className="py-3 px-3 font-semibold text-right">Kusy</th>

                  {/* Pick */}
                  <th className="py-3 px-3 font-semibold text-right text-indigo-300 border-l border-slate-800">
                    Pick / 1 ks
                  </th>
                  <th className="py-3 px-3 font-semibold text-right text-indigo-300/80">
                    Pick / obj.
                  </th>

                  {/* Pack */}
                  <th className="py-3 px-3 font-semibold text-right text-emerald-300 border-l border-slate-800">
                    Balení / 1 ks
                  </th>
                  <th className="py-3 px-3 font-semibold text-right text-emerald-300/80">
                    Balení / obj.
                  </th>

                  {/* Total */}
                  <th className="py-3 px-3 font-semibold text-right text-purple-200 font-bold bg-purple-950/30 border-l border-slate-800">
                    Celkem / 1 ks
                  </th>

                  {/* Pareto */}
                  <th className="py-3 px-3 font-semibold text-right text-emerald-300 bg-emerald-950/20 border-l border-slate-800">
                    80 % objemu (SKU)
                  </th>
                  <th className="py-3 px-3 font-semibold text-right text-amber-300 bg-amber-950/20">
                    Zbylých 20 % (SKU)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 font-mono text-[11px]">
                {enrichedDailyStats.map((d) => (
                  <tr key={d.date} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3.5 font-medium text-white flex items-center space-x-2 font-sans">
                      <span className="font-bold text-slate-200">{d.dayLabel}</span>
                      <span className="text-slate-500 text-[10px] font-mono">({d.date})</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-sans">
                      {d.totalShipments}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white font-sans font-semibold">
                      {d.totalItems}
                    </td>

                    {/* Pick */}
                    <td className="py-2.5 px-3 text-right text-indigo-300 font-semibold border-l border-slate-800">
                      {formatTimeValue(d.avgPickPerItemSec, unit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-indigo-300/70">
                      {formatTimeValue(d.avgPickPerOrderSec, unit)}
                    </td>

                    {/* Pack */}
                    <td className="py-2.5 px-3 text-right text-emerald-300 font-semibold border-l border-slate-800">
                      {formatTimeValue(d.avgPackPerItemSec, unit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-300/70">
                      {formatTimeValue(d.avgPackPerOrderSec, unit)}
                    </td>

                    {/* Total */}
                    <td className="py-2.5 px-3 text-right text-purple-200 font-bold bg-purple-950/20 border-l border-slate-800">
                      {formatTimeValue(d.avgTotalPerItemSec, unit)}
                    </td>

                    {/* Pareto 80 */}
                    <td className="py-2.5 px-3 text-right text-emerald-300 bg-emerald-950/20 border-l border-slate-800">
                      <span className="font-bold">{d.pareto.top80ProductsCount} SKU</span>
                      <span className="text-[10px] text-emerald-400/80 ml-1 font-sans">
                        ({d.pareto.top80Units} ks)
                      </span>
                    </td>

                    {/* Pareto 20 */}
                    <td className="py-2.5 px-3 text-right text-amber-300 bg-amber-950/20">
                      <span className="font-bold">{d.pareto.remaining20ProductsCount} SKU</span>
                      <span className="text-[10px] text-amber-400/80 ml-1 font-sans">
                        ({d.pareto.remaining20Units} ks)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: OPTIONAL VISUAL TIMELINE CHART */}
      {activeTab === 'chart' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <LineChartIcon className="w-4 h-4 text-indigo-400" />
              <span>Vizuální časová osa: Průměrný čas na 1 kus (Pick, Pack a Celkem)</span>
            </h3>
            <div className="flex items-center space-x-4 text-xs font-medium">
              <span className="flex items-center space-x-1.5 text-indigo-400">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>{t.trend.legendPick}</span>
              </span>
              <span className="flex items-center space-x-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>{t.trend.legendPack}</span>
              </span>
              <span className="flex items-center space-x-1.5 text-purple-400">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>{t.trend.legendTotal}</span>
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[700px]">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto select-none">
                {/* Y-axis gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                  const val = Math.round(maxChartY * (1 - pct));
                  const y = padding.top + pct * graphHeight;
                  return (
                    <g key={idx}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={svgWidth - padding.right}
                        y2={y}
                        stroke="#334155"
                        strokeDasharray="3 3"
                        strokeOpacity={0.4}
                      />
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        fill="#94a3b8"
                        fontSize="10"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {formatTimeValue(val, unit)}
                      </text>
                    </g>
                  );
                })}

                {/* X-axis labels */}
                {enrichedDailyStats.map((d, i) => {
                  const x = getX(i);
                  const isHovered = hoveredChartIndex === i;
                  return (
                    <g key={d.date}>
                      <line
                        x1={x}
                        y1={padding.top + graphHeight}
                        x2={x}
                        y2={padding.top + graphHeight + 6}
                        stroke="#475569"
                      />
                      <text
                        x={x}
                        y={padding.top + graphHeight + 20}
                        fill={isHovered ? '#6366f1' : '#94a3b8'}
                        fontSize="10"
                        fontWeight={isHovered ? 'bold' : 'normal'}
                        textAnchor="middle"
                      >
                        {d.dayLabel}
                      </text>
                    </g>
                  );
                })}

                {/* Lines */}
                <path
                  d={makePath(d => d.avgPickPerItemSec)}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d={makePath(d => d.avgPackPerItemSec)}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d={makePath(d => d.avgTotalPerItemSec)}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="3"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                />

                {/* Interactive Points */}
                {enrichedDailyStats.map((d, i) => {
                  const x = getX(i);
                  const isHovered = hoveredChartIndex === i;
                  return (
                    <g
                      key={`pt-${d.date}`}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredChartIndex(i)}
                      onMouseLeave={() => setHoveredChartIndex(null)}
                    >
                      <circle
                        cx={x}
                        cy={getY(d.avgTotalPerItemSec)}
                        r={isHovered ? 6 : 4}
                        fill="#a855f7"
                        stroke="#0f172a"
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
