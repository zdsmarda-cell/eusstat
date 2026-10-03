import React, { useState } from 'react';
import { LineChart, Calendar, TrendingUp, Info } from 'lucide-react';
import { DailyStat, ItemBracket } from '../types.js';
import { formatTimeValue } from '../utils/analytics.js';

interface DailyTrendChartProps {
  dailyStats: DailyStat[];
  unit: 'sec' | 'min';
}

type ChartMode = 'process' | 'brackets' | 'volume';

export const DailyTrendChart: React.FC<DailyTrendChartProps> = ({ dailyStats, unit }) => {
  const [chartMode, setChartMode] = useState<ChartMode>('process');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (dailyStats.length === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center text-slate-500 text-sm">
        Žádná denní data pro zobrazení grafu v tomto období.
      </div>
    );
  }

  // Chart layout dimensions
  const svgWidth = 900;
  const svgHeight = 280;
  const padding = { top: 25, right: 30, bottom: 45, left: 55 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  // Max calculations
  let maxY = 1;
  if (chartMode === 'process') {
    maxY = Math.max(
      ...dailyStats.map(d => Math.max(d.avgTotalPerItemSec, d.avgPickPerItemSec, d.avgPackPerItemSec)),
      10
    );
  } else if (chartMode === 'brackets') {
    maxY = Math.max(
      ...dailyStats.flatMap(d => [
        d.bracketBreakdown['1'].avgTotalPerItemSec,
        d.bracketBreakdown['2'].avgTotalPerItemSec,
        d.bracketBreakdown['3'].avgTotalPerItemSec,
        d.bracketBreakdown['4'].avgTotalPerItemSec,
        d.bracketBreakdown['5+'].avgTotalPerItemSec,
      ]),
      10
    );
  } else {
    // volume
    maxY = Math.max(...dailyStats.map(d => Math.max(d.totalShipments, d.totalItems)), 10);
  }

  maxY = Math.ceil(maxY * 1.15); // Add headroom

  // Coordinate helpers
  const getX = (index: number) => {
    if (dailyStats.length <= 1) return padding.left + graphWidth / 2;
    return padding.left + (index / (dailyStats.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    return padding.top + graphHeight - (val / maxY) * graphHeight;
  };

  // Generate SVG path for a line
  const makePath = (getVal: (d: DailyStat) => number) => {
    return dailyStats
      .map((d, i) => {
        const x = getX(i);
        const y = getY(getVal(d));
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  // Generate area fill path
  const makeAreaPath = (getVal: (d: DailyStat) => number) => {
    const line = makePath(getVal);
    const lastX = getX(dailyStats.length - 1);
    const firstX = getX(0);
    const bottomY = padding.top + graphHeight;
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  // Ticks for Y axis
  const yTicksCount = 5;
  const yTicks = Array.from({ length: yTicksCount }, (_, i) => {
    const val = (maxY / (yTicksCount - 1)) * i;
    return { val, y: getY(val) };
  });

  const hoveredDay = hoveredIndex !== null ? dailyStats[hoveredIndex] : null;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-5">
      {/* Chart Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <TrendingUp className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Vývoj přes jednotlivé dny
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Sledujte denní trend doby na 1 produkt, stabilitu pickování vs balení nebo objem expedice.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs self-start md:self-auto">
          <button
            onClick={() => setChartMode('process')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              chartMode === 'process'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pick vs Balení na 1 ks
          </button>
          <button
            onClick={() => setChartMode('brackets')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              chartMode === 'brackets'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dle kusovosti (1ks vs 5+ks)
          </button>
          <button
            onClick={() => setChartMode('volume')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              chartMode === 'volume'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Objem (ks a zásilky)
          </button>
        </div>
      </div>

      {/* Legend & Details */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
        {chartMode === 'process' ? (
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5 text-purple-300 font-semibold">
              <span className="w-3 h-1 bg-purple-500 rounded" />
              <span>Celkem na 1 ks</span>
            </span>
            <span className="flex items-center space-x-1.5 text-indigo-300 font-medium">
              <span className="w-3 h-1 bg-indigo-500 rounded" />
              <span>Pickování na 1 ks</span>
            </span>
            <span className="flex items-center space-x-1.5 text-emerald-300 font-medium">
              <span className="w-3 h-1 bg-emerald-500 rounded" />
              <span>Balení na 1 ks</span>
            </span>
          </div>
        ) : chartMode === 'brackets' ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center space-x-1.5 text-blue-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>1 ks</span>
            </span>
            <span className="flex items-center space-x-1.5 text-emerald-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>2 ks</span>
            </span>
            <span className="flex items-center space-x-1.5 text-amber-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>3 ks</span>
            </span>
            <span className="flex items-center space-x-1.5 text-purple-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>4 ks</span>
            </span>
            <span className="flex items-center space-x-1.5 text-rose-400 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>5+ kusů</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5 text-blue-400 font-medium">
              <span className="w-3 h-3 rounded bg-blue-500" />
              <span>Počet kusů</span>
            </span>
            <span className="flex items-center space-x-1.5 text-emerald-400 font-medium">
              <span className="w-3 h-3 rounded bg-emerald-500" />
              <span>Počet zásilek</span>
            </span>
          </div>
        )}

        <div className="text-slate-400 text-xs flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          <span>Celkem dnů v grafu: <strong className="text-white font-mono">{dailyStats.length}</strong></span>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative bg-slate-950/70 border border-slate-800 rounded-2xl p-2 sm:p-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto max-h-[360px] select-none"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Grid lines & Y labels */}
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={t.y}
                x2={svgWidth - padding.right}
                y2={t.y}
                stroke="#1e293b"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padding.left - 10}
                y={t.y + 4}
                textAnchor="end"
                className="text-[10px] fill-slate-500 font-mono"
              >
                {chartMode === 'volume'
                  ? Math.round(t.val)
                  : formatTimeValue(t.val, unit)}
              </text>
            </g>
          ))}

          {/* Mode 1: Process (Pick vs Baleni vs Celkem) */}
          {chartMode === 'process' && (
            <>
              {/* Total area gradient */}
              <defs>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={makeAreaPath(d => d.avgTotalPerItemSec)}
                fill="url(#totalGradient)"
              />

              {/* Total line */}
              <path
                d={makePath(d => d.avgTotalPerItemSec)}
                fill="none"
                stroke="#a855f7"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Pick line */}
              <path
                d={makePath(d => d.avgPickPerItemSec)}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Pack line */}
              <path
                d={makePath(d => d.avgPackPerItemSec)}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Mode 2: Brackets */}
          {chartMode === 'brackets' && (
            <>
              {(['1', '2', '3', '4', '5+'] as ItemBracket[]).map(b => {
                const colorMap: Record<ItemBracket, string> = {
                  '1': '#3b82f6',
                  '2': '#10b981',
                  '3': '#f59e0b',
                  '4': '#a855f7',
                  '5+': '#f43f5e',
                };
                return (
                  <path
                    key={b}
                    d={makePath(d => d.bracketBreakdown[b].avgTotalPerItemSec || 0)}
                    fill="none"
                    stroke={colorMap[b]}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                );
              })}
            </>
          )}

          {/* Mode 3: Volume (bars or lines) */}
          {chartMode === 'volume' && (
            <>
              {dailyStats.map((d, i) => {
                const x = getX(i);
                const barWidth = Math.max(6, Math.min(24, (graphWidth / dailyStats.length) * 0.4));
                const itemBarH = (d.totalItems / maxY) * graphHeight;
                const shipBarH = (d.totalShipments / maxY) * graphHeight;
                const bottomY = padding.top + graphHeight;

                return (
                  <g key={d.date}>
                    {/* Items bar */}
                    <rect
                      x={x - barWidth - 1}
                      y={bottomY - itemBarH}
                      width={barWidth}
                      height={itemBarH}
                      fill="#3b82f6"
                      rx="3"
                      opacity="0.85"
                    />
                    {/* Shipments bar */}
                    <rect
                      x={x + 1}
                      y={bottomY - shipBarH}
                      width={barWidth}
                      height={shipBarH}
                      fill="#10b981"
                      rx="3"
                      opacity="0.85"
                    />
                  </g>
                );
              })}
            </>
          )}

          {/* X axis line */}
          <line
            x1={padding.left}
            y1={padding.top + graphHeight}
            x2={svgWidth - padding.right}
            y2={padding.top + graphHeight}
            stroke="#334155"
            strokeWidth="1.5"
          />

          {/* X Axis Labels & interactive hit areas */}
          {dailyStats.map((d, i) => {
            const x = getX(i);
            const isHovered = hoveredIndex === i;
            const showLabel =
              dailyStats.length <= 14 ||
              i % Math.ceil(dailyStats.length / 10) === 0 ||
              i === dailyStats.length - 1;

            return (
              <g key={d.date}>
                {/* Vertical cursor on hover */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={padding.top + graphHeight}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    strokeWidth="1.5"
                  />
                )}

                {/* Point on hovered line */}
                {isHovered && chartMode === 'process' && (
                  <>
                    <circle cx={x} cy={getY(d.avgTotalPerItemSec)} r="5" fill="#a855f7" />
                    <circle cx={x} cy={getY(d.avgPickPerItemSec)} r="4" fill="#6366f1" />
                    <circle cx={x} cy={getY(d.avgPackPerItemSec)} r="4" fill="#10b981" />
                  </>
                )}

                {/* Date label */}
                {showLabel && (
                  <text
                    x={x}
                    y={svgHeight - 14}
                    textAnchor="middle"
                    className={`text-[10px] font-mono ${
                      isHovered ? 'fill-white font-bold' : 'fill-slate-400'
                    }`}
                  >
                    {d.dayLabel}
                  </text>
                )}

                {/* Invisible hover trigger */}
                <rect
                  x={x - (graphWidth / dailyStats.length) / 2}
                  y={padding.top}
                  width={graphWidth / dailyStats.length}
                  height={graphHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                />
              </g>
            );
          })}
        </svg>

        {/* Hover Floating Details Card */}
        {hoveredDay && (
          <div className="mt-3 p-3.5 bg-slate-900 border border-slate-700 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white text-sm">{hoveredDay.dayLabel}</span>
              <span className="text-slate-400">({hoveredDay.date})</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 font-mono">
              <div>
                <span className="text-slate-400 mr-1.5">Zásilek:</span>
                <strong className="text-white">{hoveredDay.totalShipments}</strong>
              </div>
              <div>
                <span className="text-slate-400 mr-1.5">Kusů:</span>
                <strong className="text-white">{hoveredDay.totalItems}</strong>
              </div>
              <div className="h-4 w-px bg-slate-800" />
              <div>
                <span className="text-indigo-400 mr-1.5">Pick na 1 ks:</span>
                <strong className="text-indigo-200">{formatTimeValue(hoveredDay.avgPickPerItemSec, unit)}</strong>
              </div>
              <div>
                <span className="text-emerald-400 mr-1.5">Balení na 1 ks:</span>
                <strong className="text-emerald-200">{formatTimeValue(hoveredDay.avgPackPerItemSec, unit)}</strong>
              </div>
              <div>
                <span className="text-purple-400 mr-1.5">Celkem na 1 ks:</span>
                <strong className="text-purple-200">{formatTimeValue(hoveredDay.avgTotalPerItemSec, unit)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
