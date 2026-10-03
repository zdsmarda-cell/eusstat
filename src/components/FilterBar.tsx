import React from 'react';
import { Calendar, Filter, Search, Clock, SlidersHorizontal, RotateCcw } from 'lucide-react';
import { FilterState, ItemBracket } from '../types.js';

interface FilterBarProps {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  onReset: () => void;
  totalFilteredCount: number;
  totalAllCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filter,
  onChange,
  onReset,
  totalFilteredCount,
  totalAllCount,
}) => {
  const brackets: { id: 'all' | ItemBracket; label: string }[] = [
    { id: 'all', label: 'Všechny zásilky' },
    { id: '1', label: '1 kus' },
    { id: '2', label: '2 kusy' },
    { id: '3', label: '3 kusy' },
    { id: '4', label: '4 kusy' },
    { id: '5+', label: '5 a více kusů' },
  ];

  const presets: { id: FilterState['datePreset']; label: string }[] = [
    { id: 'all', label: 'Celé období' },
    { id: '30days', label: 'Posledních 30 dní' },
    { id: '14days', label: '14 dní' },
    { id: '7days', label: '7 dní' },
    { id: 'today', label: 'Dnes' },
    { id: 'custom', label: 'Vlastní' },
  ];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm space-y-4">
      {/* Top row: Presets & Bracket selection */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          <span className="text-xs text-slate-400 px-2 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>Období:</span>
          </span>
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => onChange({ ...filter, datePreset: p.id })}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                filter.datePreset === p.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Units & Outliers toggle */}
        <div className="flex items-center space-x-2">
          {/* Unit switch */}
          <div className="flex items-center bg-slate-950/60 p-1 rounded-xl border border-slate-800/80 text-xs">
            <span className="text-slate-400 px-2 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Jednotky:</span>
            </span>
            <button
              onClick={() => onChange({ ...filter, unit: 'sec' })}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filter.unit === 'sec'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sekundy (s)
            </button>
            <button
              onClick={() => onChange({ ...filter, unit: 'min' })}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filter.unit === 'min'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Minuty (min)
            </button>
          </div>

          {/* Outlier filter */}
          <button
            onClick={() => onChange({ ...filter, excludeOutliers: !filter.excludeOutliers })}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center space-x-1.5 transition-all ${
              filter.excludeOutliers
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-300'
            }`}
            title="Vynechá pauzy a nestandardní operace delší než 30 minut"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Filtrovat extrémy (&gt;30m)</span>
          </button>
        </div>
      </div>

      {/* Middle row: Brackets (1, 2, 3, 4, 5+ ks) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-300 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <span>Kusovost zásilky:</span>
          </span>
          {brackets.map(b => {
            const isActive = filter.bracket === b.id;
            return (
              <button
                key={b.id}
                onClick={() => onChange({ ...filter, bracket: b.id })}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Counter of active rows */}
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span>
            Zobrazeno <strong className="text-white font-mono">{totalFilteredCount}</strong> z {totalAllCount} záznamů
          </span>
          <button
            onClick={onReset}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Resetovat všechny filtry"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom row: Search & Custom Date Picker (when active) */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter.searchQuery}
            onChange={(e) => onChange({ ...filter, searchQuery: e.target.value })}
            placeholder="Hledat číslo objednávky nebo EAN produktu..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="relative w-48">
          <input
            type="text"
            value={filter.searchBox}
            onChange={(e) => onChange({ ...filter, searchBox: e.target.value })}
            placeholder="Filtrovat sběrný box..."
            className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {filter.datePreset === 'custom' && (
          <div className="flex items-center space-x-2 text-xs text-slate-300">
            <span className="text-slate-400">Od:</span>
            <input
              type="date"
              value={filter.dateFrom}
              onChange={(e) => onChange({ ...filter, dateFrom: e.target.value })}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
            />
            <span className="text-slate-400">Do:</span>
            <input
              type="date"
              value={filter.dateTo}
              onChange={(e) => onChange({ ...filter, dateTo: e.target.value })}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
            />
          </div>
        )}
      </div>
    </div>
  );
};
