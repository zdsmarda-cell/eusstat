import React from 'react';
import { Calendar, Filter, Search, Clock, SlidersHorizontal, RotateCcw, FileCode, Loader2 } from 'lucide-react';
import { FilterState, ItemBracket } from '../types.js';
import { useLanguage } from '../context/LanguageContext.js';

interface FilterBarProps {
  filter: FilterState;
  onChange: (filter: FilterState) => void;
  onReset: () => void;
  onExportHtml?: () => void;
  totalFilteredCount: number;
  totalAllCount: number;
  isFiltering?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filter,
  onChange,
  onReset,
  onExportHtml,
  totalFilteredCount,
  totalAllCount,
  isFiltering = false,
}) => {
  const { lang, t } = useLanguage();

  const brackets: { id: 'all' | ItemBracket; label: string }[] = [
    { id: 'all', label: lang === 'cs' ? 'Všechny zásilky' : 'All sizes' },
    { id: '1', label: lang === 'cs' ? '1 kus' : '1 item' },
    { id: '2', label: lang === 'cs' ? '2 kusy' : '2 items' },
    { id: '3', label: lang === 'cs' ? '3 kusy' : '3 items' },
    { id: '4', label: lang === 'cs' ? '4 kusy' : '4 items' },
    { id: '5', label: lang === 'cs' ? '5 kusů' : '5 items' },
    { id: '6+', label: lang === 'cs' ? '6 a více kusů' : '6+ items' },
  ];

  const presets: { id: FilterState['datePreset']; label: string }[] = [
    { id: 'all', label: t.filter.all },
    { id: '30days', label: t.filter.days30 },
    { id: '14days', label: t.filter.days14 },
    { id: '7days', label: t.filter.days7 },
    { id: 'today', label: t.filter.today },
    { id: 'custom', label: t.filter.custom },
  ];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm space-y-4">
      {/* Top row: Presets & Bracket selection */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          <span className="text-xs text-slate-400 px-2 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t.filter.periodLabel}:</span>
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
              <span>{t.filter.timeUnit}:</span>
            </span>
            <button
              onClick={() => onChange({ ...filter, unit: 'sec' })}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filter.unit === 'sec'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.filter.seconds}
            </button>
            <button
              onClick={() => onChange({ ...filter, unit: 'min' })}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                filter.unit === 'min'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.filter.minutes}
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
            <span>{t.filter.excludeOutliers}</span>
          </button>
        </div>
      </div>

      {/* Middle row: Brackets (1, 2, 3, 4, 5+ ks) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-300 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <span>{t.filter.orderSize}:</span>
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

        {/* Counter of active rows & HTML export */}
        <div className="flex items-center space-x-2.5 text-xs text-slate-400">
          {isFiltering && (
            <span className="flex items-center text-xs text-indigo-400 font-medium space-x-1.5 animate-pulse bg-indigo-950/60 border border-indigo-500/30 px-2 py-0.5 rounded-lg">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>{lang === 'cs' ? 'Přepočítávám...' : 'Updating...'}</span>
            </span>
          )}
          <span>
            {t.filter.showingCount} <strong className="text-white font-mono">{totalFilteredCount.toLocaleString('cs-CZ')}</strong> {t.filter.ofCount} {totalAllCount.toLocaleString('cs-CZ')} {t.filter.recordsWord}
          </span>
          <button
            onClick={onReset}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title={t.filter.resetFilters}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {onExportHtml && (
            <button
              onClick={onExportHtml}
              disabled={totalFilteredCount === 0}
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
              title={lang === 'cs' ? 'Uložit aktuálně zobrazené výstupy jako samostatný HTML soubor k prohlížení a odeslání dalším uživatelům' : 'Save current dashboard views as standalone HTML report'}
            >
              <FileCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>{lang === 'cs' ? 'Uložit HTML' : 'Export HTML'}</span>
            </button>
          )}
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
            placeholder={t.filter.searchQueryPlaceholder}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="relative w-48">
          <input
            type="text"
            value={filter.searchBox}
            onChange={(e) => onChange({ ...filter, searchBox: e.target.value })}
            placeholder={t.filter.searchBoxPlaceholder}
            className="w-full px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {filter.datePreset === 'custom' && (
          <div className="flex items-center space-x-2 text-xs text-slate-300">
            <span className="text-slate-400">{t.filter.from}:</span>
            <input
              type="date"
              value={filter.dateFrom}
              onChange={(e) => onChange({ ...filter, dateFrom: e.target.value })}
              className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
            />
            <span className="text-slate-400">{t.filter.to}:</span>
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
