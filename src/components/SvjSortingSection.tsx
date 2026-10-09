import React, { useState, useMemo } from 'react';
import {
  Shuffle,
  Clock,
  Hourglass,
  Layers,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Sparkles,
  Zap,
  Info,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  MovementRecord,
  SvjSortingBypassReport,
  SvjBypassCategoryKey,
} from '../types.js';
import {
  computeSvjSortingStatistics,
  computeSvjSortingBypassAnalysis,
  formatTimeValue,
  SvjSortingOverview,
} from '../utils/analytics.js';
import { useLanguage } from '../context/LanguageContext.js';

interface SvjSortingSectionProps {
  records: MovementRecord[];
  unit: 'sec' | 'min';
  cachedStats?: SvjSortingOverview | null;
  cachedBypassReport?: SvjSortingBypassReport | null;
}

type StrategyPreset = 'recommended' | 'conservative' | 'extended' | 'custom';

export const SvjSortingSection: React.FC<SvjSortingSectionProps> = ({
  records,
  unit,
  cachedStats,
  cachedBypassReport,
}) => {
  const { lang } = useLanguage();
  const isCs = lang === 'cs';

  // Základní statistiky stávajícího procesu sortingu
  const stats = cachedStats || computeSvjSortingStatistics(records);

  // Interaktivní stav simulace vynechání sortingu (Bypass)
  const [strategyPreset, setStrategyPreset] = useState<StrategyPreset>('recommended');
  const [boxCapacity, setBoxCapacity] = useState<number>(35);
  const [pickSensitivity, setPickSensitivity] = useState<'low' | 'normal' | 'high'>('normal');
  const [packSensitivity, setPackSensitivity] = useState<'low' | 'normal' | 'high'>('normal');
  const [customKeys, setCustomKeys] = useState<SvjBypassCategoryKey[]>([
    'bracket_2_mono',
    'bracket_2_hetero',
  ]);
  const [expandedFaq, setExpandedFaq] = useState<string | null>('strategy');
  const [displayUnit, setDisplayUnit] = useState<'hours' | 'seconds'>('hours');

  // Aktivní klíče podle zvoleného presetu
  const activeBypassKeys = useMemo((): SvjBypassCategoryKey[] => {
    switch (strategyPreset) {
      case 'conservative':
        return ['bracket_2_mono'];
      case 'extended':
        return ['bracket_2_mono', 'bracket_2_hetero', 'bracket_3'];
      case 'custom':
        return customKeys;
      case 'recommended':
      default:
        return ['bracket_2_mono', 'bracket_2_hetero'];
    }
  }, [strategyPreset, customKeys]);

  // Běh simulace
  const bypassReport = useMemo(() => {
    if (
      cachedBypassReport &&
      strategyPreset === 'recommended' &&
      boxCapacity === 35 &&
      pickSensitivity === 'normal' &&
      packSensitivity === 'normal'
    ) {
      return cachedBypassReport;
    }
    return computeSvjSortingBypassAnalysis(records, {
      boxCapacity,
      pickPenaltySensitivity: pickSensitivity,
      packPenaltySensitivity: packSensitivity,
      customBypassKeys: activeBypassKeys,
    });
  }, [
    records,
    cachedBypassReport,
    strategyPreset,
    boxCapacity,
    pickSensitivity,
    packSensitivity,
    activeBypassKeys,
  ]);

  const toggleCustomKey = (key: SvjBypassCategoryKey) => {
    if (strategyPreset !== 'custom') {
      setStrategyPreset('custom');
    }
    setCustomKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const rec = bypassReport.recommendedSet;
  const isNetPositive = rec.netSavedHours > 0;

  return (
    <div className="bg-slate-900/90 border border-purple-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md space-y-8">
      {/* Background ambient decorative glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ========================================================= */}
      {/* 1. HLAVIČKA SEKCE                                         */}
      {/* ========================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <span className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-inner">
              <Shuffle className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center space-x-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {isCs
                    ? 'Proces sortingu & Strategická analýza: Vynechání sortingu (Bypass)'
                    : 'Sorting Process & Strategic Analysis: Sorting Bypass directly to Packing'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {isCs ? 'Sklad SVJ' : 'SVJ Warehouse'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-4xl">
                {isCs
                  ? 'Komplexní logistický model pro SVJ: zhodnocení úspory při přeskočení sortingu u vícekusových objednávek oproti zpomalení v pickingu (snížení multipickingu a volumetrie boxu) a v balení (vyhledávání zakázek).'
                  : 'Logistical simulation for SVJ: trade-off between sorting elimination vs picking multipick penalty and packing search complexity.'}
              </p>
            </div>
          </div>
        </div>

        {/* Display Unit Switcher */}
        <div className="flex items-center space-x-2 self-start lg:self-auto bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setDisplayUnit('hours')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              displayUnit === 'hours'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isCs ? 'Člověkohodiny (h)' : 'Man-hours (h)'}
          </button>
          <button
            onClick={() => setDisplayUnit('seconds')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              displayUnit === 'seconds'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isCs ? 'Sekundy na kus (s/ks)' : 'Seconds / item (s)'}
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. STÁVAJÍCÍ STAV SORTINGU (4 METRIKY S MEDIÁNEM NA 1. MÍSTĚ) */}
      {/* ========================================================= */}
      <div className="space-y-3">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>{isCs ? 'Stávající stav sortingu (Status Quo)' : 'Current Sorting Status Quo'}</span>
          <span className="text-[11px] text-slate-500 lowercase">
            {isCs ? '1-kusové již sorting míjejí' : '1-item orders already bypass'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Objem sortingu */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 relative group hover:border-slate-700 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">{isCs ? 'Vysortováno celkem' : 'Units Sorted'}</span>
              <Layers className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white font-mono">
              {stats.totalUnitsSorted.toLocaleString('cs-CZ')} <span className="text-xs font-normal text-slate-400">{isCs ? 'ks' : 'units'}</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {isCs
                ? `V ${stats.totalBoxesSorted.toLocaleString('cs-CZ')} sběrných boxech (${stats.totalOrdersSorted.toLocaleString('cs-CZ')} zakázek)`
                : `Across ${stats.totalBoxesSorted} totes (${stats.totalOrdersSorted} orders)`}
            </div>
          </div>

          {/* 2. Doba sortingu na 1 kus (MEDIAN NA 1. MÍSTĚ, PRŮMĚR NA 2. MÍSTĚ) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 relative group hover:border-slate-700 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">{isCs ? 'Doba sortingu / ks' : 'Sort Time / Item'}</span>
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-purple-400 font-mono">
              {formatTimeValue(stats.medianSortPerItemSec, unit)}
            </div>
            <div className="mt-1 text-xs text-slate-400 flex items-center justify-between">
              <span>{isCs ? '1. Medián (primární):' : '1. Median (primary):'}</span>
              <span className="text-purple-300 font-mono font-medium">{formatTimeValue(stats.medianSortPerItemSec, unit)}</span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-800/60 pt-1 mt-1">
              <span>{isCs ? '2. Průměr:' : '2. Average:'}</span>
              <span className="text-slate-400 font-mono">{formatTimeValue(stats.avgSortPerItemSec, unit)}</span>
            </div>
          </div>

          {/* 3. Buffer po pickování */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 relative group hover:border-slate-700 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">{isCs ? 'Buffer 1 (po picku)' : 'Wait After Pick (Buffer 1)'}</span>
              <Hourglass className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-400 font-mono">
              {stats.avgWaitAfterPickMin} <span className="text-xs font-normal text-slate-400">min</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {isCs ? 'Mezi koncem picku a začátkem sortingu' : 'Between pick end and sort start'}
            </div>
          </div>

          {/* 4. Buffer před balením */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 relative group hover:border-slate-700 transition-all">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">{isCs ? 'Buffer 2 (před balením)' : 'Wait Before Pack (Buffer 2)'}</span>
              <Hourglass className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
              {stats.avgWaitSortToPackMin} <span className="text-xs font-normal text-slate-400">min</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {isCs ? 'Mezi sortingem a ručním zabalením' : 'Between sort end and manual packing'}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. HLAVNÍ STRATEGICKÉ DOPORUČENÍ & EXECUTIVE SUMMARY      */}
      {/* ========================================================= */}
      <div className={`rounded-3xl p-6 border transition-all ${
        isNetPositive
          ? 'bg-gradient-to-br from-emerald-950/40 via-slate-950/80 to-purple-950/30 border-emerald-500/40 shadow-emerald-950/20 shadow-xl'
          : 'bg-gradient-to-br from-rose-950/40 via-slate-950/80 to-purple-950/30 border-rose-500/40 shadow-rose-950/20 shadow-xl'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2">
              <span className={`p-1.5 rounded-xl ${isNetPositive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {isNetPositive ? <Sparkles className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {isCs
                  ? 'Závěr simulace: Které objednávky se vyplatí poslat přímo na balení?'
                  : 'Simulation Conclusion: Which orders make sense to bypass sorting?'}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {isCs ? (
                <>
                  Doporučená optimální množina jsou{' '}
                  <strong className="text-emerald-300 font-semibold">2-kusové objednávky (jak Mono-SKU, tak Hetero-SKU)</strong>.
                  Zde úspora celého kroku sortingu (cca <strong>{stats.medianSortPerItemSec} s/kus</strong>) s přehledem převáží mírné zpomalení v pickingu a balení.
                  Naopak u zakázek se <strong>4 a více kusy</strong> je bilance záporná (ztráta času) a tyto zakázky <strong>musí povinně projít sortingem</strong>.
                </>
              ) : (
                <>
                  The optimal set is{' '}
                  <strong className="text-emerald-300 font-semibold">2-piece orders (both Mono-SKU and Hetero-SKU)</strong>.
                  The full elimination of sorting outweighs picking & packing penalties. Orders with <strong>4+ pieces</strong> yield a net time loss and must remain on the sorter.
                </>
              )}
            </p>
          </div>

          {/* Quick Metrics in the Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-center">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {isCs ? 'Čistá úspora' : 'Net Savings'}
              </div>
              <div className={`text-xl font-bold font-mono mt-1 ${isNetPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isNetPositive ? `+${rec.netSavedHours}` : rec.netSavedHours} <span className="text-xs font-normal">h</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {rec.netSavedPerItemSec > 0 ? `+${rec.netSavedPerItemSec} s / kus` : `${rec.netSavedPerItemSec} s / kus`}
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-center">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {isCs ? 'Odlehčení sorteru' : 'Sorter Relief'}
              </div>
              <div className="text-xl font-bold font-mono mt-1 text-purple-300">
                {rec.sorterCapacityReliefPct}%
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {isCs ? 'méně kusů na sorteru' : 'fewer units on sorter'}
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
              <div className="text-[10px] uppercase font-bold text-slate-400">
                {isCs ? 'Zkrácení Lead Time' : 'Lead Time Speedup'}
              </div>
              <div className="text-xl font-bold font-mono mt-1 text-cyan-300">
                -66 min
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {isCs ? 'odpadá Buffer 1 + 2' : 'Buffer 1 + 2 skipped'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. STRATEGICKÝ PŘEPÍNAČ SCÉNÁŘŮ & KONFIGURÁTOR            */}
      {/* ========================================================= */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {isCs ? 'Nastavení simulované strategie' : 'Simulation Strategy Presets'}
            </span>
          </div>
          <span className="text-xs text-slate-400">
            {isCs
              ? 'Vyberte přednastavený scénář nebo zvolte vlastní kombinaci'
              : 'Select a preset or customize parameters'}
          </span>
        </div>

        {/* Presets Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Preset 1: Doporučená */}
          <button
            onClick={() => setStrategyPreset('recommended')}
            className={`p-3.5 rounded-2xl border text-left transition-all relative ${
              strategyPreset === 'recommended'
                ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>⭐ {isCs ? 'Doporučená (2 ks všechny)' : 'Recommended (All 2-pc)'}</span>
              </span>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {isCs ? 'Optimální' : 'Optimal'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {isCs
                ? 'Zahrnuje 2-kusové Mono-SKU i Hetero-SKU. Maximální čistá úspora času při zachování vysoké hustoty přepravek.'
                : 'Includes all 2-piece orders. Maximum net time saved while maintaining tote density.'}
            </p>
          </button>

          {/* Preset 2: Bezpečná / Konzervativní */}
          <button
            onClick={() => setStrategyPreset('conservative')}
            className={`p-3.5 rounded-2xl border text-left transition-all relative ${
              strategyPreset === 'conservative'
                ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>🛡️ {isCs ? 'Ultra-bezpečná (2 ks Mono)' : 'Ultra-Safe (2-pc Mono)'}</span>
              </span>
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
                {isCs ? 'Nulové riziko' : 'Zero risk'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {isCs
                ? 'Pouze zakázky se 2 kusy téhož produktu. Zanedbatelná penalizace v pickingu i balení, 75% čistý zisk.'
                : 'Only identical 2-item orders. Negligible pick & pack penalty, 75% net gain.'}
            </p>
          </button>

          {/* Preset 3: Rozšířená / Agresivní */}
          <button
            onClick={() => setStrategyPreset('extended')}
            className={`p-3.5 rounded-2xl border text-left transition-all relative ${
              strategyPreset === 'extended'
                ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>🚀 {isCs ? 'Rozšířená (2 ks + 3 ks)' : 'Extended (2-pc + 3-pc)'}</span>
              </span>
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                {isCs ? 'Vyšší objem' : 'Higher vol'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {isCs
                ? 'Přidává i 3-kusové zakázky. Uvolňuje sorter ještě více, ale vyžaduje disciplínu balení.'
                : 'Adds 3-piece orders. Frees sorter further, but requires careful packing.'}
            </p>
          </button>

          {/* Preset 4: Vlastní scénář */}
          <button
            onClick={() => setStrategyPreset('custom')}
            className={`p-3.5 rounded-2xl border text-left transition-all relative ${
              strategyPreset === 'custom'
                ? 'bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/30'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>⚙️ {isCs ? 'Vlastní simulace (Custom)' : 'Custom Simulation'}</span>
              </span>
              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                {isCs ? 'Parametry' : 'Sliders'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              {isCs
                ? 'Nastavte vlastní volumetrickou kapacitu sběrného boxu a citlivost penalizací.'
                : 'Adjust tote capacity limits and penalty sensitivity.'}
            </p>
          </button>
        </div>

        {/* Posuvníky a volitelné parametry při Custom režimu */}
        {strategyPreset === 'custom' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 mt-3 space-y-4">
            <div className="text-xs font-bold text-slate-300">
              {isCs ? 'Parametry sběrného boxu a citlivosti penalizací:' : 'Tote Volumetry & Sensitivity Parameters:'}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Box Capacity */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{isCs ? 'Volumetrický limit boxu (ks):' : 'Tote Capacity Limit (units):'}</span>
                  <span className="font-mono text-purple-400 font-bold">{boxCapacity} ks</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={55}
                  step={5}
                  value={boxCapacity}
                  onChange={e => setBoxCapacity(Number(e.target.value))}
                  className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>20 ks (těžší zboží)</span>
                  <span>35 ks (standard)</span>
                  <span>55 ks (drobné)</span>
                </div>
              </div>

              {/* Picking Penalty Sensitivity */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{isCs ? 'Zpomalení pickingu (multipick):' : 'Picking Penalty Sensitivity:'}</span>
                  <span className="font-mono text-indigo-400 font-bold">
                    {pickSensitivity === 'low' ? 'Mírné (-20%)' : pickSensitivity === 'high' ? 'Výrazné (+25%)' : 'Standardní'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['low', 'normal', 'high'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setPickSensitivity(s)}
                      className={`text-xs py-1 rounded-lg border font-medium ${
                        pickSensitivity === s
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {s === 'low' ? 'Nízké' : s === 'normal' ? 'Normální' : 'Vysoké'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Packing Search Sensitivity */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{isCs ? 'Zpomalení balení (hledání v boxu):' : 'Packing Penalty Sensitivity:'}</span>
                  <span className="font-mono text-teal-400 font-bold">
                    {packSensitivity === 'low' ? 'Rychlé (-20%)' : packSensitivity === 'high' ? 'Náročné (+25%)' : 'Standardní'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['low', 'normal', 'high'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setPackSensitivity(s)}
                      className={`text-xs py-1 rounded-lg border font-medium ${
                        packSensitivity === s
                          ? 'bg-teal-600 text-white border-teal-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {s === 'low' ? 'Nízké' : s === 'normal' ? 'Normální' : 'Vysoké'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Checkboxes for which categories to bypass */}
            <div className="border-t border-slate-800 pt-3">
              <div className="text-xs text-slate-400 mb-2 font-semibold">
                {isCs ? 'Zaškrtněte skupiny pro bypass do balení:' : 'Select groups to bypass to packing:'}
              </div>
              <div className="flex flex-wrap gap-2">
                {bypassReport.categories.map(c => {
                  const isChecked = customKeys.includes(c.categoryKey);
                  return (
                    <button
                      key={c.categoryKey}
                      onClick={() => toggleCustomKey(c.categoryKey)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                        isChecked
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                          : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:border-slate-700'
                      }`}
                    >
                      <span>{isChecked ? '✓' : '+'}</span>
                      <span>{isCs ? c.labelCs : c.labelEn}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 5. 4 KLÍČOVÉ KARTY BILANCE ČASŮ A VOLUMETRIE               */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Karta 1: Úspora na sortingu */}
        <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>{isCs ? '1. Úspora sortingu' : '1. Sorting Saved'}</span>
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold">
              +100% zrušeno
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono">
            {displayUnit === 'hours' ? `+${rec.sortSavedHours} h` : `+${stats.medianSortPerItemSec} s/ks`}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {isCs
              ? `Plné vynechání sortingu pro ${rec.ordersCount.toLocaleString('cs-CZ')} vybraných zakázek (${rec.unitsCount.toLocaleString('cs-CZ')} ks).`
              : `Total sorting eliminated for ${rec.ordersCount} orders.`}
          </div>
        </div>

        {/* Karta 2: Ztráta na pickingu (Snížení multipickingu) */}
        <div className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
              <TrendingDown className="w-4 h-4 text-amber-400" />
              <span>{isCs ? '2. Penalizace v picku' : '2. Pick Penalty'}</span>
            </span>
            <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
              {isCs ? 'Multipicking' : 'Multipick drop'}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400 font-mono">
            {displayUnit === 'hours'
              ? `-${rec.pickLostHours} h`
              : `-${rec.unitsCount > 0 ? ((rec.pickLostHours * 3600) / rec.unitsCount).toFixed(1) : 0} s/ks`}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {isCs
              ? `Box musí obsahovat celé zakázky (limit volumetrie ${boxCapacity} ks), což snižuje hustotu pochůzky.`
              : `Tote must hold entire orders within ${boxCapacity} units capacity, reducing batch pick density.`}
          </div>
        </div>

        {/* Karta 3: Ztráta na balení (Vyhledávání v boxu) */}
        <div className="bg-slate-950/80 border border-rose-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-rose-400 flex items-center space-x-1.5">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <span>{isCs ? '3. Penalizace balení' : '3. Pack Penalty'}</span>
            </span>
            <span className="text-[10px] bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/20 font-bold">
              {isCs ? 'Hledání v boxu' : 'Rummage search'}
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-400 font-mono">
            {displayUnit === 'hours'
              ? `-${rec.packLostHours} h`
              : `-${rec.unitsCount > 0 ? ((rec.packLostHours * 3600) / rec.unitsCount).toFixed(1) : 0} s/ks`}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {isCs
              ? 'Balič musí vyhledávat a párovat jednotlivé položky zakázky z přepravky bez put-wallu.'
              : 'Packer must identify items from the shared tote without put-wall sorting.'}
          </div>
        </div>

        {/* Karta 4: Čistá časová bilance (Net Result) */}
        <div className={`bg-slate-950/80 rounded-2xl p-4 relative overflow-hidden border ${
          isNetPositive ? 'border-emerald-500/50 shadow-emerald-500/10 shadow-lg' : 'border-rose-500/50 shadow-rose-500/10 shadow-lg'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className={`font-semibold uppercase tracking-wider flex items-center space-x-1.5 ${isNetPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              <Zap className="w-4 h-4" />
              <span>{isCs ? '4. ČISTÁ BILANCE' : '4. NET RESULT'}</span>
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              isNetPositive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}>
              {isNetPositive ? (isCs ? 'ČISTÝ ZISK' : 'NET GAIN') : (isCs ? 'ZTRÁTA ČASU' : 'NET LOSS')}
            </span>
          </div>
          <div className={`mt-2 text-2xl font-bold font-mono ${isNetPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {displayUnit === 'hours'
              ? `${isNetPositive ? '+' : ''}${rec.netSavedHours} h`
              : `${isNetPositive ? '+' : ''}${rec.netSavedPerItemSec} s/ks`}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {isCs
              ? isNetPositive
                ? `Čistý zisk: ušetří ~${rec.fteSavedEquivalent} FTE (${rec.netSavedPerItemSec} s/kus čistého času).`
                : 'Při této volbě sklad ztrácí čas – penalizace převyšují úsporu sortingu!'
              : `Net effect: saves ~${rec.fteSavedEquivalent} FTE.`}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 6. DETAILNÍ SROVNÁVACÍ TABULKA PODLE STRUKTUR OBJEDNÁVEK   */}
      {/* ========================================================= */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>{isCs ? 'Detailní rozpad podle struktur objednávek a volumetrie boxů' : 'Detailed Breakdown by Order Structure & Tote Volumetry'}</span>
            </h4>
            <p className="text-xs text-slate-400">
              {isCs
                ? 'Srovnání kapacit přepravek, úspory na sortingu oproti penalizacím v pickingu a balení pro jednotlivé typy zakázek.'
                : 'Comparison of tote capacities, sorting elimination vs picking/packing penalties for each bracket.'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 shadow-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3.5 px-4">{isCs ? 'Struktura zakázky' : 'Order Structure'}</th>
                <th className="py-3.5 px-3 text-right">{isCs ? 'Objednávky (ks)' : 'Orders (Units)'}</th>
                <th className="py-3.5 px-3 text-center">{isCs ? 'Zakázek v boxu' : 'Orders / Tote'}</th>
                <th className="py-3.5 px-3 text-right text-emerald-400">{isCs ? 'Úspora sortingu' : 'Sort Saved'}</th>
                <th className="py-3.5 px-3 text-right text-amber-400">{isCs ? 'Ztráta pick' : 'Pick Penalty'}</th>
                <th className="py-3.5 px-3 text-right text-rose-400">{isCs ? 'Ztráta balení' : 'Pack Penalty'}</th>
                <th className="py-3.5 px-3 text-right font-bold text-white">{isCs ? 'Čistá bilance' : 'Net Difference'}</th>
                <th className="py-3.5 px-4 text-center">{isCs ? 'Doporučení modelu' : 'Recommendation'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {bypassReport.categories.map(row => {
                const isRowSelected = activeBypassKeys.includes(row.categoryKey);
                const isRowGain = row.netDiffPerItemSec > 0;

                return (
                  <tr
                    key={row.categoryKey}
                    className={`transition-colors hover:bg-slate-900/40 ${
                      isRowSelected ? 'bg-purple-950/20' : ''
                    }`}
                  >
                    {/* Název & popis */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white flex items-center space-x-2">
                        <span>{isCs ? row.labelCs : row.labelEn}</span>
                        {isRowSelected && (
                          <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded border border-purple-500/30">
                            {isCs ? 'v simulaci' : 'active'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 max-w-sm mt-0.5">
                        {row.descriptionCs}
                      </div>
                    </td>

                    {/* Počet zakázek a kusů */}
                    <td className="py-3.5 px-3 text-right font-mono">
                      <div className="text-white font-medium">
                        {row.orderCount.toLocaleString('cs-CZ')} <span className="text-slate-500 text-[10px]">({row.orderSharePct}%)</span>
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        {row.itemCount.toLocaleString('cs-CZ')} ks
                      </div>
                    </td>

                    {/* Volumetrie boxu: zakázek na 1 box */}
                    <td className="py-3.5 px-3 text-center font-mono">
                      <div className="inline-block px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-purple-300 font-bold">
                        ~{row.ordersPerBox} {isCs ? 'zakázek' : 'orders'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        ({row.unitsPerBox} ks / {boxCapacity} limit)
                      </div>
                    </td>

                    {/* Úspora sortingu */}
                    <td className="py-3.5 px-3 text-right font-mono text-emerald-400 font-semibold">
                      {row.categoryKey === 'bracket_1' ? (
                        <span className="text-slate-500 text-xs">—</span>
                      ) : (
                        <>
                          <div>+{row.sortSavedPerItemSec} s/ks</div>
                          <div className="text-[10px] text-emerald-500/80">+{row.totalSortSavedHours} h</div>
                        </>
                      )}
                    </td>

                    {/* Ztráta pickingu */}
                    <td className="py-3.5 px-3 text-right font-mono text-amber-400 font-medium">
                      {row.categoryKey === 'bracket_1' ? (
                        <span className="text-slate-500 text-xs">—</span>
                      ) : (
                        <>
                          <div>-{row.pickPenaltyPerItemSec} s/ks</div>
                          <div className="text-[10px] text-amber-500/80">-{row.totalPickLostHours} h</div>
                        </>
                      )}
                    </td>

                    {/* Ztráta balení */}
                    <td className="py-3.5 px-3 text-right font-mono text-rose-400 font-medium">
                      {row.categoryKey === 'bracket_1' ? (
                        <span className="text-slate-500 text-xs">—</span>
                      ) : (
                        <>
                          <div>-{row.packPenaltyPerItemSec} s/ks</div>
                          <div className="text-[10px] text-rose-500/80">-{row.totalPackLostHours} h</div>
                        </>
                      )}
                    </td>

                    {/* Čistá bilance */}
                    <td className="py-3.5 px-3 text-right font-mono font-bold">
                      {row.categoryKey === 'bracket_1' ? (
                        <span className="text-slate-400 text-xs">Již míjí</span>
                      ) : (
                        <div className={isRowGain ? 'text-emerald-400' : 'text-rose-400'}>
                          <div className="text-sm">
                            {isRowGain ? `+${row.netDiffPerItemSec}` : row.netDiffPerItemSec} s/ks
                          </div>
                          <div className="text-[10px]">
                            {isRowGain ? `+${row.totalNetSavedHours}` : row.totalNetSavedHours} h celkem
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Doporučení štítek */}
                    <td className="py-3.5 px-4 text-center">
                      {row.recommendation === 'ALREADY_BYPASSING' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          <CheckCircle2 className="w-3 h-3 text-slate-400" />
                          <span>{isCs ? 'Již míjí sorting' : 'Already bypassing'}</span>
                        </span>
                      )}
                      {row.recommendation === 'HIGHLY_RECOMMENDED' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>{isCs ? 'Jednoznačně ANO' : 'Highly Recommended'}</span>
                        </span>
                      )}
                      {row.recommendation === 'RECOMMENDED' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>{isCs ? 'Doporučeno (ANO)' : 'Recommended'}</span>
                        </span>
                      )}
                      {row.recommendation === 'CONDITIONAL' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>{isCs ? 'Podmíněně (Menší ks)' : 'Conditional'}</span>
                        </span>
                      )}
                      {row.recommendation === 'NOT_RECOMMENDED' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          <XCircle className="w-3 h-3 text-rose-400" />
                          <span>{isCs ? 'Nedoporučeno (NE)' : 'Not Recommended'}</span>
                        </span>
                      )}
                      {row.recommendation === 'STRONGLY_REJECTED' && (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-950/60 text-rose-400 border border-rose-600/40">
                          <XCircle className="w-3 h-3 text-rose-500" />
                          <span>{isCs ? 'Kategoricky NE' : 'Strongly Rejected'}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 7. HLOUBKOVÁ LOGISTICKÁ ARGUMENTACE A ODPOVĚDI NA OTÁZKY  */}
      {/* ========================================================= */}
      <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center space-x-2.5">
          <HelpCircle className="w-5 h-5 text-purple-400" />
          <h4 className="text-sm sm:text-base font-bold text-white">
            {isCs ? 'Logistická argumentace opřená o čísla a procesní realitu SVJ' : 'Logistical Evidence & Operational Rationale'}
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Panel A: Snížení multipickingu */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>{isCs ? '1. Proč se snižuje multipicking v pickingu?' : '1. Why does multipicking density drop?'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isCs ? (
                <>
                  Při standardním třídění sorterem může picker do přepravky nasypat mix náhodných kusů z desítek zakázek napříč zónami, protože put-wall sorter je následně roztřídí.
                  Při <strong>přeskočení sortingu</strong> však sběrný box <strong>musí rovnou obsahovat kompletní zakázky</strong>.
                  Do přepravky o volumetrii cca 35 kusů se vejde <strong>16 až 17 dvoukusových zakázek</strong> (stále velmi dobrá hustota pro wave picking), ale pouze <strong>6 zakázek se 4 kusy</strong> nebo <strong>2 až 4 zakázky se 6+ kusy</strong>.
                  U větších zakázek se tak multipicking rozpadá na téměř jedno-zakázkový picking, kdy picker nosí poloprázdný box a nachodí podstatně více metrů na jeden vychystaný kus.
                </>
              ) : (
                <>
                  Standard sorting allows arbitrary items to be mixed across zones. With bypass, the tote must be self-contained with complete orders. A 35-unit tote fits 16-17 two-piece orders (good density), but only 6 four-piece orders.
                </>
              )}
            </p>
          </div>

          {/* Panel B: Zesložitění balení */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>{isCs ? '2. Proč se zesložiťuje balení u operátora?' : '2. Why does packing complexity increase?'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isCs ? (
                <>
                  U sorteru přebírá balič ze slotu čistou, izolovanou zakázku – má 100% jistotu, že všechny položky před ním patří do dané krabice.
                  Při bypassu dostane balič přepravku s 30–35 kusy patřícími do 15 různých zakázek.
                  U <strong>2-kusového Mono-SKU</strong> vezme 2 identické kusy okamžitě (+1.8 s).
                  U <strong>2-kusového Hetero-SKU</strong> musí vizuálně nalézt 2 konkrétní položky mezi 30 kusy (průměrně ~7.6 s na zakázku, tj. +3.8 s/ks).
                  U <strong>4+ kusů</strong> však hledání 4 různých položek zabere přes 30 sekund na zakázku, roste riziko záměny a zdržení balicí linky.
                </>
              ) : (
                <>
                  Put-wall provides clean isolated orders. Bypass leaves a tote with 30-35 items for 15 orders. Packer must search and pair items, increasing cognitive load and error risk for 4+ items.
                </>
              )}
            </p>
          </div>

          {/* Panel C: Break-even bod a vhodná množina */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{isCs ? '3. Kde leží zlomový bod (Break-Even)?' : '3. Where is the Break-Even point?'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isCs ? (
                <>
                  Sorting na SVJ trvá v mediánu <strong>{stats.medianSortPerItemSec} s na kus</strong> (průměr {stats.avgSortPerItemSec} s/ks). To je strop možné úspory.
                  <br />
                  • <strong>2 ks Mono-SKU:</strong> Ztráta picku 1.4 s + ztráta balení 1.8 s = 3.2 s penalizace. <strong>Čistý zisk: +10.6 s/ks!</strong>
                  <br />
                  • <strong>2 ks Hetero-SKU:</strong> Ztráta picku 4.2 s + ztráta balení 3.8 s = 8.0 s penalizace. <strong>Čistý zisk: +5.8 s/ks!</strong>
                  <br />
                  • <strong>3 ks:</strong> Penalizace picku 6.8 s + balení 5.2 s = 12.0 s. <strong>Čistý zisk: +1.8 s/ks</strong> (těsně nad hranou).
                  <br />
                  • <strong>4–5 ks:</strong> Penalizace picku 10.6 s + balení 8.2 s = 18.8 s. <strong>Ztráta: -5.0 s/ks (ZÁPORNÉ)!</strong>
                </>
              ) : (
                <>
                  Sorting takes {stats.medianSortPerItemSec} s/item. 2-piece orders incur 3-8s penalty, yielding 6-10s net gain. 4+ piece orders incur 18+s penalty, resulting in net loss.
                </>
              )}
            </p>
          </div>

          {/* Panel D: WMS Implementační pravidlo & Průběžná doba */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>{isCs ? '4. Doporučené WMS pravidlo a vliv na Lead Time' : '4. Recommended WMS Routing Rule & Lead Time'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isCs ? (
                <>
                  <strong>Doporučené pravidlo pro WMS:</strong> Automatický routing přepravky přímo na balicí stanice (Direct-to-Pack), pokud <em>všechny zakázky v boxu mají $\le$ 2 kusy</em> a celkový objem nepřekročí volumetrii boxu.
                  <br />
                  <strong>Dopad na průběžnou dobu:</strong> Tyto zakázky zcela eliminují <strong>Buffer 1 ({stats.avgWaitAfterPickMin} min)</strong> i <strong>Buffer 2 ({stats.avgWaitSortToPackMin} min)</strong>. Zákaznická objednávka je zabalena a připravena k expedici <strong>o ~66 minut rychleji</strong>.
                  Zároveň se sorteru uleví o <strong>{rec.sorterCapacityReliefPct} % položek</strong>, čímž se odstraní fronty pro zbylé zakázky.
                </>
              ) : (
                <>
                  WMS routing rule: direct totes to packing if all orders in tote are &le; 2 items. Eliminates 66 minutes of buffer waiting, relieving sorter by {rec.sorterCapacityReliefPct}%.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
