import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Globe,
  Layers,
  Package,
  Users,
  Boxes,
  BarChart3,
  Sliders,
  UploadCloud,
  Download,
  CheckCircle2,
  AlertTriangle,
  Archive,
  Clock,
  Shuffle,
  TrendingUp,
  Info,
} from 'lucide-react';
import {
  GateAnalyticsReport,
  BracketStat,
  ItemBracket,
  GateSvjBenchmarkRates,
} from '../types.js';
import { computeMonthlyFteFromBrackets, getDefaultSvjBenchmarkRates } from '../utils/gateParser.js';
import { useLanguage } from '../context/LanguageContext.js';

interface GateWarehouseDashboardProps {
  report: GateAnalyticsReport | null;
  svjBracketStats?: BracketStat[];
  onOpenImport: () => void;
  onLoadSampleGate: () => void;
  isLoading?: boolean;
}

export const GateWarehouseDashboard: React.FC<GateWarehouseDashboardProps> = ({
  report,
  svjBracketStats,
  onOpenImport,
  onLoadSampleGate,
  isLoading,
}) => {
  const { lang } = useLanguage();
  const isCs = lang === 'cs';

  // 1. Stav zobrazení v sekci Měsíční struktura zásilek
  const [bracketViewMode, setBracketViewMode] = useState<'pct' | 'orders' | 'units'>('pct');
  const [showDetailed5And6, setShowDetailed5And6] = useState<boolean>(false);

  // 2. Stav zobrazení v sekci Cílové země
  const [selectedCountryMonth, setSelectedCountryMonth] = useState<string>('all');

  // 3. Stav v sekci ABC analýza & 3měsíční zásoba vs. nadzásoba
  const [coverageMonthsTarget, setCoverageMonthsTarget] = useState<number>(3);
  const [stockMultiplier, setStockMultiplier] = useState<number>(1.0);
  const [customDeadSkusCount, setCustomDeadSkusCount] = useState<number | null>(null);
  const [customDeadUnitsCount, setCustomDeadUnitsCount] = useState<number | null>(null);
  const [activeSkuTableTab, setActiveSkuTableTab] = useState<'excess' | 'active' | 'dead'>('excess');

  // 4. Stav v sekci Přepočet výkonu na FTE podle časů SVJ
  const liveSvjRates = useMemo(() => {
    return getDefaultSvjBenchmarkRates(
      svjBracketStats && svjBracketStats.length > 0 ? svjBracketStats : undefined
    );
  }, [svjBracketStats]);

  const [useMedianSvj, setUseMedianSvj] = useState<boolean>(true);
  const [bypassSingleSort, setBypassSingleSort] = useState<boolean>(true);
  const [monthlyFteHours, setMonthlyFteHours] = useState<number>(160);
  const [showRateEditor, setShowRateEditor] = useState<boolean>(false);
  const [customRateOverrides, setCustomRateOverrides] = useState<{
    pick?: Partial<Record<ItemBracket, number>>;
    sort?: Partial<Record<ItemBracket, number>>;
    pack?: Partial<Record<ItemBracket, number>>;
  }>({});

  // Aktuální SVJ normočasy (sekundy na 1 ks podle velikosti objednávky 1..6+)
  const activeSvjRates: GateSvjBenchmarkRates = useMemo(() => {
    const base =
      svjBracketStats && svjBracketStats.length > 0
        ? liveSvjRates
        : (report?.svjBenchmark || liveSvjRates);
    const pickSecByBracket: Record<ItemBracket, number> = { ...base.pickSecByBracket };
    const sortSecByBracket: Record<ItemBracket, number> = { ...base.sortSecByBracket };
    const packSecByBracket: Record<ItemBracket, number> = { ...base.packSecByBracket };

    if (svjBracketStats && svjBracketStats.length > 0) {
      const allStat = svjBracketStats.find(s => s.bracket === 'all');
      const fallbackSort = useMedianSvj
        ? (allStat?.medianSortPerItemSec || allStat?.avgSortPerItemSec || 13.5)
        : (allStat?.avgSortPerItemSec || allStat?.medianSortPerItemSec || 13.5);

      for (const b of ['1', '2', '3', '4', '5', '6+'] as ItemBracket[]) {
        const st = svjBracketStats.find(s => s.bracket === b);
        if (st && st.shipmentCount > 0) {
          pickSecByBracket[b] = useMedianSvj
            ? (st.medianPickPerItemSec || st.avgPickPerItemSec || pickSecByBracket[b])
            : (st.avgPickPerItemSec || st.medianPickPerItemSec || pickSecByBracket[b]);
          packSecByBracket[b] = useMedianSvj
            ? (st.medianPackPerItemSec || st.avgPackPerItemSec || packSecByBracket[b])
            : (st.avgPackPerItemSec || st.medianPackPerItemSec || packSecByBracket[b]);
          if (b === '1' && bypassSingleSort) {
            sortSecByBracket[b] = 0;
          } else {
            const sVal = useMedianSvj
              ? (st.medianSortPerItemSec || st.avgSortPerItemSec || fallbackSort)
              : (st.avgSortPerItemSec || st.medianSortPerItemSec || fallbackSort);
            sortSecByBracket[b] = sVal;
          }
        }
      }
    } else if (!useMedianSvj) {
      // Průměr bývá o ~12 % vyšší než medián kvůli odlehlým hodnotám
      for (const b of ['1', '2', '3', '4', '5', '6+'] as ItemBracket[]) {
        pickSecByBracket[b] = Number((pickSecByBracket[b] * 1.12).toFixed(1));
        if (b !== '1' || !bypassSingleSort) {
          sortSecByBracket[b] = Number(((sortSecByBracket[b] || 13.5) * 1.10).toFixed(1));
        }
        packSecByBracket[b] = Number((packSecByBracket[b] * 1.11).toFixed(1));
      }
    }

    if (!bypassSingleSort && sortSecByBracket['1'] === 0) {
      sortSecByBracket['1'] = sortSecByBracket['2'] || 13.6;
    }

    // Aplikace případných ručních úprav uživatele
    for (const b of ['1', '2', '3', '4', '5', '6+'] as ItemBracket[]) {
      if (customRateOverrides.pick?.[b] !== undefined) pickSecByBracket[b] = customRateOverrides.pick[b]!;
      if (customRateOverrides.sort?.[b] !== undefined) sortSecByBracket[b] = customRateOverrides.sort[b]!;
      if (customRateOverrides.pack?.[b] !== undefined) packSecByBracket[b] = customRateOverrides.pack[b]!;
    }

    return {
      source: svjBracketStats && svjBracketStats.length > 0 ? 'svj_db' : base.source,
      useMedian: useMedianSvj,
      bypassSingleItemSort: bypassSingleSort,
      monthlyFteHoursNorm: monthlyFteHours,
      pickSecByBracket,
      sortSecByBracket,
      packSecByBracket,
    };
  }, [svjBracketStats, liveSvjRates, report?.svjBenchmark, useMedianSvj, bypassSingleSort, monthlyFteHours, customRateOverrides]);

  // Dynamický přepočet měsíčních FTE podle zvolených SVJ časů a fondu pracovní doby
  const enrichedMonths = useMemo(() => {
    return (report?.monthlyBreakdown || []).map(m => ({
      ...m,
      fte: computeMonthlyFteFromBrackets(m.brackets, activeSvjRates),
    }));
  }, [report?.monthlyBreakdown, activeSvjRates]);

  // Souhrn FTE za celý rok / průměrný měsíc / špičkový měsíc
  const fteSummary = useMemo(() => {
    if (enrichedMonths.length === 0) {
      return {
        avgPickFte: 0,
        avgSortFte: 0,
        avgPackFte: 0,
        avgTotalFte: 0,
        peakTotalFte: 0,
        peakMonthLabel: '-',
        totalYearHours: 0,
        totalPickHours: 0,
        totalSortHours: 0,
        totalPackHours: 0,
      };
    }
    const n = enrichedMonths.length;
    const totalPickHours = Number(enrichedMonths.reduce((s, m) => s + m.fte.pickHours, 0).toFixed(1));
    const totalSortHours = Number(enrichedMonths.reduce((s, m) => s + m.fte.sortHours, 0).toFixed(1));
    const totalPackHours = Number(enrichedMonths.reduce((s, m) => s + m.fte.packHours, 0).toFixed(1));
    const totalYearHours = Number((totalPickHours + totalSortHours + totalPackHours).toFixed(1));

    const avgPickFte = Number((enrichedMonths.reduce((s, m) => s + m.fte.pickFte, 0) / n).toFixed(2));
    const avgSortFte = Number((enrichedMonths.reduce((s, m) => s + m.fte.sortFte, 0) / n).toFixed(2));
    const avgPackFte = Number((enrichedMonths.reduce((s, m) => s + m.fte.packFte, 0) / n).toFixed(2));
    const avgTotalFte = Number((avgPickFte + avgSortFte + avgPackFte).toFixed(2));

    let peakM = enrichedMonths[0];
    for (const m of enrichedMonths) {
      if (m.fte.totalFte > peakM.fte.totalFte) peakM = m;
    }

    return {
      avgPickFte,
      avgSortFte,
      avgPackFte,
      avgTotalFte,
      peakTotalFte: peakM.fte.totalFte,
      peakMonthLabel: isCs ? peakM.monthLabelCs : peakM.monthLabelEn,
      totalYearHours,
      totalPickHours,
      totalSortHours,
      totalPackHours,
    };
  }, [enrichedMonths, isCs]);

  // Dynamický přepočet ABC analýzy při změně počtu cílových měsíců zásoby (default 3 měsíce) nebo koeficientu zásoby
  const dynamicAbc = useMemo(() => {
    const emptyClass = {
      skusCount: 0,
      skuSharePct: 0,
      annualUnits: 0,
      unitSharePct: 0,
      threeMonthTargetUnits: 0,
      currentStockUnits: 0,
      coveredThreeMonthUnits: 0,
      excessUnits: 0,
      excessSkusCount: 0,
    };
    const base = report?.abcAnalysis;
    if (!base) {
      return {
        stockSource: 'estimated_from_velocity' as const,
        totalCatalogSkus: 0,
        activeSkusCount: 0,
        deadStockSkusCount: 0,
        deadStockUnits: 0,
        totalAnnualIssuedUnits: 0,
        avgMonthlyIssuedUnits: 0,
        threeMonthDemandUnits: 0,
        totalStockUnits: 0,
        coveredThreeMonthUnits: 0,
        coveredThreeMonthSkusCount: 0,
        excessReplenishUnits: 0,
        excessReplenishSkusCount: 0,
        classBreakdown: {
          A: emptyClass,
          B: emptyClass,
          C: emptyClass,
          DEAD: emptyClass,
        },
        topActiveSkus: [],
        topExcessSkus: [],
        sampleDeadSkus: [],
      };
    }

    const monthRatio = coverageMonthsTarget / 3;
    const sMult = stockMultiplier;

    const deadSkus = customDeadSkusCount !== null ? customDeadSkusCount : base.deadStockSkusCount;
    const deadUnits = customDeadUnitsCount !== null ? customDeadUnitsCount : Math.round(base.deadStockUnits * sMult);

    const adjustClass = (clsKey: 'A' | 'B' | 'C') => {
      const c = base.classBreakdown?.[clsKey] || emptyClass;
      const targetUnits = Math.round(c.threeMonthTargetUnits * monthRatio);
      const stockUnits = Math.round(c.currentStockUnits * sMult);
      const coveredUnits = Math.min(stockUnits, targetUnits);
      const excessUnits = Math.max(0, stockUnits - targetUnits);
      const excessRatio = c.currentStockUnits > 0 ? excessUnits / Math.max(1, stockUnits) : 0;
      const excessSkusCount = excessUnits > 0
        ? Math.min(c.skusCount, Math.max(1, Math.round(c.excessSkusCount * (sMult / Math.max(0.5, monthRatio * 0.85)))))
        : 0;
      return {
        ...c,
        threeMonthTargetUnits: targetUnits,
        currentStockUnits: stockUnits,
        coveredThreeMonthUnits: coveredUnits,
        excessUnits,
        excessSkusCount: excessRatio > 0 ? excessSkusCount : 0,
      };
    };

    const classA = adjustClass('A');
    const classB = adjustClass('B');
    const classC = adjustClass('C');
    const totalCatSkus = base.activeSkusCount + deadSkus;

    const classDEAD = {
      ...(base.classBreakdown?.DEAD || emptyClass),
      skusCount: deadSkus,
      skuSharePct: totalCatSkus > 0 ? Number(((deadSkus / totalCatSkus) * 100).toFixed(1)) : 0,
      currentStockUnits: deadUnits,
      excessUnits: deadUnits,
      excessSkusCount: deadSkus,
    };

    const threeMonthDemandUnits = classA.threeMonthTargetUnits + classB.threeMonthTargetUnits + classC.threeMonthTargetUnits;
    const coveredThreeMonthUnits = classA.coveredThreeMonthUnits + classB.coveredThreeMonthUnits + classC.coveredThreeMonthUnits;
    const excessReplenishUnits = classA.excessUnits + classB.excessUnits + classC.excessUnits;
    const excessReplenishSkusCount = classA.excessSkusCount + classB.excessSkusCount + classC.excessSkusCount;
    const totalStockUnits = classA.currentStockUnits + classB.currentStockUnits + classC.currentStockUnits + deadUnits;

    return {
      ...base,
      totalCatalogSkus: totalCatSkus,
      deadStockSkusCount: deadSkus,
      deadStockUnits: deadUnits,
      totalStockUnits,
      threeMonthDemandUnits,
      coveredThreeMonthUnits,
      excessReplenishUnits,
      excessReplenishSkusCount,
      classBreakdown: {
        A: classA,
        B: classB,
        C: classC,
        DEAD: classDEAD,
      },
    };
  }, [report?.abcAnalysis, coverageMonthsTarget, stockMultiplier, customDeadSkusCount, customDeadUnitsCount]);

  // Filtrované země podle zvoleného měsíce nebo celého roku
  const displayedCountries = useMemo(() => {
    const baseCountries = report?.countries || [];
    if (selectedCountryMonth === 'all') {
      return baseCountries;
    }
    const foundMonth = enrichedMonths.find(m => m.month === selectedCountryMonth);
    if (!foundMonth) return baseCountries;

    const totOrd = Math.max(1, foundMonth.totalOrders);
    const totUnits = Math.max(1, foundMonth.totalUnits);

    return baseCountries
      .map(c => {
        const mStat = foundMonth.countryBreakdown?.[c.country] || { orders: 0, units: 0 };
        return {
          ...c,
          orders: mStat.orders,
          orderSharePct: Number(((mStat.orders / totOrd) * 100).toFixed(2)),
          units: mStat.units,
          unitSharePct: Number(((mStat.units / totUnits) * 100).toFixed(2)),
          avgUnitsPerOrder: mStat.orders > 0 ? Number((mStat.units / mStat.orders).toFixed(2)) : 0,
        };
      })
      .filter(c => c.orders > 0)
      .sort((a, b) => b.orders - a.orders);
  }, [report?.countries, selectedCountryMonth, enrichedMonths]);

  // Celoroční součty pro patičku měsíční tabulky
  const annualBracketTotals = useMemo(() => {
    const sums = {
      '1': { orders: 0, units: 0 },
      '2': { orders: 0, units: 0 },
      '3': { orders: 0, units: 0 },
      '4': { orders: 0, units: 0 },
      '5+': { orders: 0, units: 0 },
      '5': { orders: 0, units: 0 },
      '6+': { orders: 0, units: 0 },
    };
    for (const m of enrichedMonths) {
      for (const k of ['1', '2', '3', '4', '5+', '5', '6+'] as const) {
        sums[k].orders += m.brackets[k]?.orders || 0;
        sums[k].units += m.brackets[k]?.units || 0;
      }
    }
    const totO = Math.max(1, report?.totalOrders || 0);
    const totU = Math.max(1, report?.totalUnits || 0);
    return {
      '1': { ...sums['1'], orderSharePct: Number(((sums['1'].orders / totO) * 100).toFixed(1)), unitSharePct: Number(((sums['1'].units / totU) * 100).toFixed(1)) },
      '2': { ...sums['2'], orderSharePct: Number(((sums['2'].orders / totO) * 100).toFixed(1)), unitSharePct: Number(((sums['2'].units / totU) * 100).toFixed(1)) },
      '3': { ...sums['3'], orderSharePct: Number(((sums['3'].orders / totO) * 100).toFixed(1)), unitSharePct: Number(((sums['3'].units / totU) * 100).toFixed(1)) },
      '4': { ...sums['4'], orderSharePct: Number(((sums['4'].orders / totO) * 100).toFixed(1)), unitSharePct: Number(((sums['4'].units / totU) * 100).toFixed(1)) },
      '5+': { ...sums['5+'], orderSharePct: Number(((sums['5+'].orders / totO) * 100).toFixed(1)), unitSharePct: Number(((sums['5+'].units / totU) * 100).toFixed(1)) },
      '5': { ...sums['5'], orderSharePct: Number(((sums['5'].orders / totO) * 100).toFixed(1)), unitSharePct: Number(((sums['5'].units / totU) * 100).toFixed(1)) },
      '6+': { ...sums['6+'], orderSharePct: Number(((sums['6+'].orders / totO) * 100).toFixed(1)), unitSharePct: Number(((sums['6+'].units / totU) * 100).toFixed(1)) },
    };
  }, [enrichedMonths, report?.totalOrders, report?.totalUnits]);

  // Pokud ještě nejsou naimportována data skladu Gate, zobrazíme přehlednou úvodní obrazovku
  if (!report || report.totalOrders === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 sm:p-12 max-w-4xl mx-auto space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-slate-800 pb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
            <Boxes className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {isCs
                ? 'Sklad Gate — Celoroční datová analýza, ABC zásoby & přepočet FTE podle SVJ'
                : 'Gate Warehouse — Annual Volume, ABC Inventory & SVJ-Benchmarked FTE Analysis'}
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isCs
                ? 'Pro sklad Gate zatím nejsou nahrány žádné soubory. Nahrajte velkoobjemové CSV soubory (zpracovávané proudově po částech přímo v prohlížeči bez pádu paměti) nebo si jedním kliknutím vygenerujte 12měsíční vzorová data.'
                : 'No data uploaded for Gate warehouse yet. Upload large CSV files (stream-parsed in chunks without memory spikes) or generate a 12-month sample dataset.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-2">
            <div className="font-bold text-emerald-400 flex items-center gap-2">
              <UploadCloud className="w-4 h-4" />
              <span>{isCs ? 'Struktura vstupních CSV souborů (stovky MB)' : 'Input CSV Files Structure'}</span>
            </div>
            <ul className="space-y-1.5 text-slate-300">
              <li>
                <span className="font-semibold text-white">1. Soubor objednávek:</span>{' '}
                <code className="text-[11px] text-emerald-300 bg-slate-900 px-1.5 py-0.5 rounded">
                  order_id, order_created_at, ship_date, packed_at, country, items_qty...
                </code>
              </li>
              <li>
                <span className="font-semibold text-white">2. Soubor obsahu objednávek:</span>{' '}
                <code className="text-[11px] text-emerald-300 bg-slate-900 px-1.5 py-0.5 rounded">
                  order_id, sku, article_code, qty
                </code>
              </li>
              <li>
                <span className="font-semibold text-slate-400">3. Volitelný stav zásob (pro přesnou ABC):</span>{' '}
                <code className="text-[11px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                  sku, stock_qty
                </code>
              </li>
            </ul>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-2">
            <div className="font-bold text-cyan-400 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span>{isCs ? 'Co analýza skladu Gate vyhodnocuje' : 'What Gate Analytics Evaluates'}</span>
            </div>
            <ul className="space-y-1.5 text-slate-300">
              <li>• {isCs ? 'Měsíční % rozložení 1, 2, 3, 4, 5 a více kusových zásilek' : 'Monthly % breakdown of 1, 2, 3, 4, 5+ item orders'}</li>
              <li>• {isCs ? 'Poměrové zastoupení cílových zemí + 80 % Pareto SKU a Ø ks/obj.' : 'Destination country share + 80% Pareto SKUs & avg pcs/order'}</li>
              <li>• {isCs ? 'ABC analýza: zásoba na 3 průměrné měsíce vs. nadzásoba a 0 výdej za rok' : 'ABC analysis: 3-month stock vs. excess buffer & zero-movement SKUs'}</li>
              <li>• {isCs ? 'Přepočet výkonu v měsících na pracovníky (FTE) dle časů Picking, Sorting, Packing z SVJ' : 'Monthly FTE workforce calculation using SVJ Picking, Sorting & Packing times'}</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
          <button
            onClick={onOpenImport}
            disabled={isLoading}
            className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{isCs ? 'Nahrát CSV soubory skladu Gate' : 'Upload Gate CSV Files'}</span>
          </button>

          <button
            onClick={onLoadSampleGate}
            disabled={isLoading}
            className="flex items-center space-x-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
          >
            <Boxes className="w-4 h-4 text-emerald-400" />
            <span>{isCs ? 'Načíst 12měsíční vzorová data Gate' : 'Load 12-Month Sample Gate Data'}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ========================================================= */}
      {/* HORNÍ KONTEXTOVÝ BANNER SKLADU GATE                       */}
      {/* ========================================================= */}
      <div className="p-4 bg-slate-900 border border-teal-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/25">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-white text-sm block">
              {isCs
                ? 'Sklad Gate — Celoroční datová a objemová analýza (Objednávky, Země, 80/20 SKU, ABC zásoby & FTE model dle SVJ)'
                : 'Gate Warehouse — Annual Volume, Country, 80/20 SKU, ABC Inventory & SVJ-Benchmarked FTE Analysis'}
            </span>
            <span className="text-slate-400">
              {isCs
                ? `Zpracováno ${report.totalOrders.toLocaleString('cs-CZ')} objednávek a ${report.totalUnits.toLocaleString('cs-CZ')} ks za ${report.monthsCount} měsíců (${report.dateFrom} až ${report.dateTo}).`
                : `Processed ${report.totalOrders.toLocaleString()} orders and ${report.totalUnits.toLocaleString()} units across ${report.monthsCount} months.`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenImport}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{isCs ? 'Nahrát CSV soubory Gate (Objednávky + Položky)' : 'Upload Gate CSVs'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 5 HLAVNÍCH SUMÁRNÍCH KARET ZA CELÉ OBDOBÍ                 */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Objednávky celkem */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">{isCs ? 'Objednávky celkem' : 'Total Orders'}</span>
            <Package className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono tabular-nums">
            {report.totalOrders.toLocaleString('cs-CZ')}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{isCs ? 'Měsíční průměr:' : 'Monthly avg:'}</span>
            <span className="font-mono tabular-nums text-teal-300 font-semibold">
              {Math.round(report.totalOrders / Math.max(1, report.monthsCount)).toLocaleString('cs-CZ')} {isCs ? 'obj.' : 'ord.'}
            </span>
          </div>
        </div>

        {/* 2. Kusy & Průměr ks na objednávku */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">{isCs ? 'Expedováno kusů' : 'Total Units'}</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {report.totalUnits.toLocaleString('cs-CZ')}
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{isCs ? 'Průměr ks / 1 obj.:' : 'Avg units / order:'}</span>
            <span className="font-mono tabular-nums text-white font-bold">
              {report.avgUnitsPerOrder} {isCs ? 'ks' : 'pcs'}
            </span>
          </div>
        </div>

        {/* 3. Aktivní SKU & 80% produkce */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">{isCs ? '80 % produkce (Pareto)' : '80% Volume SKUs'}</span>
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {report.top80SkusCount.toLocaleString('cs-CZ')} <span className="text-xs font-normal text-slate-400">SKU ({report.top80SkusSharePct} %)</span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{isCs ? 'Použito SKU celkem:' : 'Total active SKUs:'}</span>
            <span className="font-mono tabular-nums text-slate-200 font-semibold">
              {report.totalActiveSkus.toLocaleString('cs-CZ')} SKU
            </span>
          </div>
        </div>

        {/* 4. Nadzásoba na dokladnění & Ležáky */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">{isCs ? `Nadzásoba (nad ${coverageMonthsTarget} měs.)` : `Excess Stock (>${coverageMonthsTarget}m)`}</span>
            <Archive className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-300 font-mono tabular-nums">
            {dynamicAbc.excessReplenishUnits.toLocaleString('cs-CZ')} <span className="text-xs font-normal text-slate-400">ks</span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{isCs ? 'V nadzásobě / 0 výdej:' : 'Excess / Dead SKUs:'}</span>
            <span className="font-mono tabular-nums text-slate-200">
              {dynamicAbc.excessReplenishSkusCount.toLocaleString('cs-CZ')} / <span className="text-rose-400">{dynamicAbc.deadStockSkusCount.toLocaleString('cs-CZ')} SKU</span>
            </span>
          </div>
        </div>

        {/* 5. Potřeba pracovníků (FTE dle SVJ) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">{isCs ? 'Potřeba lidí (FTE dle SVJ)' : 'Required Staff (SVJ FTE)'}</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-cyan-300 font-mono tabular-nums">
            {fteSummary.avgTotalFte} <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{isCs ? 'Špička v roce:' : 'Peak month:'}</span>
            <span className="font-mono tabular-nums text-amber-300 font-semibold">
              {fteSummary.peakTotalFte} FTE ({fteSummary.peakMonthLabel})
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SEKCE 1: ROZLOŽENÍ 1, 2, 3, 4, 5+ KUSOVÝCH ZÁSILEK V MĚSÍCÍCH & 80% SKU */}
      {/* ========================================================= */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              {isCs
                ? '1. Měsíční rozložení 1, 2, 3, 4, 5 a více kusových zásilek & 80/20 Pareto SKU'
                : '1. Monthly Breakdown of 1, 2, 3, 4, 5+ Item Shipments & 80/20 SKU Pareto'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isCs
                ? 'Procentuální a objemové zastoupení velikostních kategorií objednávek po jednotlivých měsících, počet aktivních SKU, počet SKU tvořících 80 % produkce a průměrný počet kusů na objednávku.'
                : 'Monthly percentage distribution of order brackets, active SKUs count, SKUs generating 80% of production, and average items per order.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <button
              onClick={() => setShowDetailed5And6(!showDetailed5And6)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showDetailed5And6
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {showDetailed5And6
                ? (isCs ? 'Rozpad: 1..5, 6+ ks' : 'Split: 1..5, 6+ pcs')
                : (isCs ? 'Rozpad: 1, 2, 3, 4, 5+ ks' : 'Split: 1, 2, 3, 4, 5+ pcs')}
            </button>

            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setBracketViewMode('pct')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  bracketViewMode === 'pct' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isCs ? 'Procenta (%)' : 'Share (%)'}
              </button>
              <button
                onClick={() => setBracketViewMode('orders')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  bracketViewMode === 'orders' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isCs ? 'Počet zásilek' : 'Orders'}
              </button>
              <button
                onClick={() => setBracketViewMode('units')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  bracketViewMode === 'units' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isCs ? 'Počet kusů' : 'Units'}
              </button>
            </div>
          </div>
        </div>

        {/* Vizuální 100% skládaný graf struktury zásilek po měsících */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-300">
              {isCs ? 'Poměrová struktura velikosti zásilek v jednotlivých měsících (% objednávek):' : 'Monthly Order Bracket Share (% of orders):'}
            </span>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block" />1 ks</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />2 ks</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />3 ks</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-purple-500 inline-block" />4 ks</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />5+ ks</span>
            </div>
          </div>

          <div className="space-y-2">
            {enrichedMonths.map(m => {
              const p1 = m.brackets['1']?.orderSharePct || 0;
              const p2 = m.brackets['2']?.orderSharePct || 0;
              const p3 = m.brackets['3']?.orderSharePct || 0;
              const p4 = m.brackets['4']?.orderSharePct || 0;
              const p5p = m.brackets['5+']?.orderSharePct || 0;

              return (
                <div key={m.month} className="grid grid-cols-12 items-center gap-3 text-xs">
                  <div className="col-span-3 sm:col-span-2 font-medium text-slate-300 truncate">
                    {isCs ? m.monthLabelCs : m.monthLabelEn}
                  </div>
                  <div className="col-span-6 sm:col-span-8 h-5 rounded-md overflow-hidden bg-slate-900 flex border border-slate-800/80">
                    <div style={{ width: `${p1}%` }} className="bg-blue-500/85 hover:bg-blue-500 flex items-center justify-center text-[10px] font-mono text-white font-semibold overflow-hidden" title={`1 ks: ${p1}%`}>
                      {p1 >= 8 ? `${p1}%` : ''}
                    </div>
                    <div style={{ width: `${p2}%` }} className="bg-emerald-500/85 hover:bg-emerald-500 flex items-center justify-center text-[10px] font-mono text-slate-950 font-bold overflow-hidden" title={`2 ks: ${p2}%`}>
                      {p2 >= 8 ? `${p2}%` : ''}
                    </div>
                    <div style={{ width: `${p3}%` }} className="bg-amber-500/85 hover:bg-amber-500 flex items-center justify-center text-[10px] font-mono text-slate-950 font-bold overflow-hidden" title={`3 ks: ${p3}%`}>
                      {p3 >= 8 ? `${p3}%` : ''}
                    </div>
                    <div style={{ width: `${p4}%` }} className="bg-purple-500/85 hover:bg-purple-500 flex items-center justify-center text-[10px] font-mono text-white font-semibold overflow-hidden" title={`4 ks: ${p4}%`}>
                      {p4 >= 8 ? `${p4}%` : ''}
                    </div>
                    <div style={{ width: `${Math.max(0, 100 - (p1 + p2 + p3 + p4))}%` }} className="bg-rose-500/85 hover:bg-rose-500 flex items-center justify-center text-[10px] font-mono text-white font-semibold overflow-hidden" title={`5+ ks: ${p5p}%`}>
                      {p5p >= 8 ? `${p5p}%` : ''}
                    </div>
                  </div>
                  <div className="col-span-3 sm:col-span-2 text-right font-mono tabular-nums text-slate-400">
                    <span className="text-white font-semibold">{m.avgUnitsPerOrder}</span> ks/obj.
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Měsíční tabulka */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3 px-3.5">{isCs ? 'Měsíc' : 'Month'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Objednávky' : 'Orders'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Kusy celkem' : 'Total Units'}</th>
                <th className="py-3 px-3 text-right text-teal-300">{isCs ? 'Ø ks / obj.' : 'Avg pcs/ord'}</th>
                <th className="py-3 px-3 text-right text-blue-400">1 ks</th>
                <th className="py-3 px-3 text-right text-emerald-400">2 ks</th>
                <th className="py-3 px-3 text-right text-amber-400">3 ks</th>
                <th className="py-3 px-3 text-right text-purple-400">4 ks</th>
                {!showDetailed5And6 ? (
                  <th className="py-3 px-3 text-right text-rose-400">{isCs ? '5 a více ks' : '5+ pcs'}</th>
                ) : (
                  <>
                    <th className="py-3 px-3 text-right text-fuchsia-400">5 ks</th>
                    <th className="py-3 px-3 text-right text-rose-400">6+ ks</th>
                  </>
                )}
                <th className="py-3 px-3 text-right">{isCs ? 'Použito SKU celkem' : 'Active SKUs'}</th>
                <th className="py-3 px-3.5 text-right text-amber-300">{isCs ? '80 % produkce (SKU)' : 'Top 80% SKUs'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {enrichedMonths.map(m => {
                const renderCell = (key: '1' | '2' | '3' | '4' | '5+' | '5' | '6+') => {
                  const b = m.brackets[key];
                  if (!b) return '0';
                  if (bracketViewMode === 'pct') {
                    return (
                      <div>
                        <span className="font-bold text-slate-100">{b.orderSharePct} %</span>
                        <span className="block text-[10px] text-slate-500">{b.orders.toLocaleString('cs-CZ')} obj.</span>
                      </div>
                    );
                  }
                  if (bracketViewMode === 'orders') {
                    return (
                      <div>
                        <span className="font-bold text-slate-100">{b.orders.toLocaleString('cs-CZ')}</span>
                        <span className="block text-[10px] text-slate-500">{b.orderSharePct} %</span>
                      </div>
                    );
                  }
                  return (
                    <div>
                      <span className="font-bold text-slate-100">{b.units.toLocaleString('cs-CZ')} ks</span>
                      <span className="block text-[10px] text-slate-500">{b.unitSharePct} % ks</span>
                    </div>
                  );
                };

                return (
                  <tr key={m.month} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3.5 font-sans font-semibold text-white whitespace-nowrap">
                      {isCs ? m.monthLabelCs : m.monthLabelEn}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200 font-semibold">
                      {m.totalOrders.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300">
                      {m.totalUnits.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3 text-right text-teal-300 font-bold">
                      {m.avgUnitsPerOrder}
                    </td>
                    <td className="py-3 px-3 text-right">{renderCell('1')}</td>
                    <td className="py-3 px-3 text-right">{renderCell('2')}</td>
                    <td className="py-3 px-3 text-right">{renderCell('3')}</td>
                    <td className="py-3 px-3 text-right">{renderCell('4')}</td>
                    {!showDetailed5And6 ? (
                      <td className="py-3 px-3 text-right">{renderCell('5+')}</td>
                    ) : (
                      <>
                        <td className="py-3 px-3 text-right">{renderCell('5')}</td>
                        <td className="py-3 px-3 text-right">{renderCell('6+')}</td>
                      </>
                    )}
                    <td className="py-3 px-3 text-right text-slate-200">
                      {m.activeSkusCount.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3.5 text-right">
                      <span className="font-bold text-amber-300">{m.top80SkusCount.toLocaleString('cs-CZ')} SKU</span>
                      <span className="block text-[10px] text-slate-400">({m.top80SkusSharePct} % ze SKU)</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-950/90 border-t-2 border-slate-700 font-mono tabular-nums font-bold text-white">
              <tr>
                <td className="py-3.5 px-3.5 font-sans">{isCs ? 'CELKEM / CELÝ ROK' : 'TOTAL / FULL YEAR'}</td>
                <td className="py-3.5 px-3 text-right">{report.totalOrders.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right text-emerald-400">{report.totalUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right text-teal-300">{report.avgUnitsPerOrder}</td>
                <td className="py-3.5 px-3 text-right text-blue-300">{annualBracketTotals['1'].orderSharePct} %</td>
                <td className="py-3.5 px-3 text-right text-emerald-300">{annualBracketTotals['2'].orderSharePct} %</td>
                <td className="py-3.5 px-3 text-right text-amber-300">{annualBracketTotals['3'].orderSharePct} %</td>
                <td className="py-3.5 px-3 text-right text-purple-300">{annualBracketTotals['4'].orderSharePct} %</td>
                {!showDetailed5And6 ? (
                  <td className="py-3.5 px-3 text-right text-rose-300">{annualBracketTotals['5+'].orderSharePct} %</td>
                ) : (
                  <>
                    <td className="py-3.5 px-3 text-right text-fuchsia-300">{annualBracketTotals['5'].orderSharePct} %</td>
                    <td className="py-3.5 px-3 text-right text-rose-300">{annualBracketTotals['6+'].orderSharePct} %</td>
                  </>
                )}
                <td className="py-3.5 px-3 text-right">{report.totalActiveSkus.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3.5 text-right text-amber-300">
                  {report.top80SkusCount.toLocaleString('cs-CZ')} SKU ({report.top80SkusSharePct} %)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SEKCE 2: POMĚROVÉ ZASTOUPENÍ CÍLOVÝCH ZEMÍ (COUNTRY)       */}
      {/* ========================================================= */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-400" />
              <span>
                {isCs
                  ? '2. Poměrové zastoupení jednotlivých cílových zemí doručení'
                  : '2. Target Delivery Country Distribution'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isCs
                ? 'Podíl cílových zemí na celkovém počtu objednávek a expedovaných kusů, průměrná velikost košíku podle státu a logistické parametry (hmotnost, dobírka, PUDO, typ obalu).'
                : 'Share of destination countries across total orders and shipped items, average basket size per country, and carrier metrics.'}
            </p>
          </div>

          {/* Filtr měsíce pro země */}
          <div className="flex items-center gap-2 self-start lg:self-auto text-xs">
            <span className="text-slate-400 font-medium">{isCs ? 'Období:' : 'Period:'}</span>
            <select
              value={selectedCountryMonth}
              onChange={e => setSelectedCountryMonth(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 rounded-xl px-3 py-1.5 font-semibold focus:outline-none focus:border-teal-500"
            >
              <option value="all">{isCs ? 'Celý rok (Všechny měsíce)' : 'Full Year (All months)'}</option>
              {enrichedMonths.map(m => (
                <option key={m.month} value={m.month}>
                  {isCs ? m.monthLabelCs : m.monthLabelEn}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Karty hlavních zemí s poměrovým pruhem */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {displayedCountries.slice(0, 4).map(c => (
            <div key={c.country} className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">{isCs ? c.countryNameCs : c.countryNameEn}</span>
                <span className="font-mono tabular-nums text-sm font-bold text-teal-400">{c.orderSharePct} %</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${Math.min(100, c.orderSharePct)}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums pt-1">
                <span>{c.orders.toLocaleString('cs-CZ')} obj.</span>
                <span>{c.units.toLocaleString('cs-CZ')} ks ({c.avgUnitsPerOrder} ks/obj.)</span>
              </div>
            </div>
          ))}
        </div>

        {/* Detailní tabulka všech cílových zemí */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3 px-4">{isCs ? 'Cílová země' : 'Country'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Objednávky' : 'Orders'}</th>
                <th className="py-3 px-3 text-right text-teal-300">{isCs ? 'Podíl objednávek (%)' : 'Order Share (%)'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Expedováno kusů' : 'Shipped Units'}</th>
                <th className="py-3 px-3 text-right text-emerald-300">{isCs ? 'Podíl kusů (%)' : 'Unit Share (%)'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Ø ks / objednávka' : 'Avg Units / Order'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Ø hmotnost (kg)' : 'Avg Weight (kg)'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Dobírka (COD)' : 'COD Share'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Výdejní místa (PUDO)' : 'PUDO Share'}</th>
                <th className="py-3 px-4 text-right">{isCs ? 'Balení BAG (sáček)' : 'BAG Package'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {displayedCountries.map(c => (
                <tr key={c.country} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-sans font-semibold text-white">
                    {isCs ? c.countryNameCs : c.countryNameEn}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200 font-semibold">
                    {c.orders.toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-3 px-3 text-right text-teal-300 font-bold">
                    {c.orderSharePct} %
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {c.units.toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-300 font-semibold">
                    {c.unitSharePct} %
                  </td>
                  <td className="py-3 px-3 text-right text-white font-bold">
                    {c.avgUnitsPerOrder} ks
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {c.avgWeightKg} kg
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {c.codSharePct} %
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {c.pudoSharePct} %
                  </td>
                  <td className="py-3 px-4 text-right text-slate-300">
                    {c.bagSharePct} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SEKCE 3: ABC ANALÝZA PRODUKTŮ – 3MĚSÍČNÍ ZÁSOBA VS. NADZÁSOBA & LEŽÁKY */}
      {/* ========================================================= */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Archive className="w-5 h-5 text-purple-400" />
              <span>
                {isCs
                  ? `3. ABC analýza produktů: Zásoba na ${coverageMonthsTarget} průměrné měsíce vs. Nadzásoba na dokladnění & Ležáky`
                  : `3. Product ABC Analysis: ${coverageMonthsTarget}-Month Coverage vs. Excess Replenishment & Dead Stock`}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-4xl">
              {isCs
                ? 'Rozdělení celkových skladových zásob na aktivní zásobu kryjící 3 průměrné měsíce prodeje, nadzásobu určenou na případné dokladnění (kolik SKU a s kolika kusy) a druhou množinu položek bez jediného výdeje za poslední rok.'
                : 'Breakdown of total inventory into 3-month operational coverage, excess replenishment buffer (SKUs and units), and zero-movement dead stock.'}
            </p>
          </div>

          {/* Přepínač cílového počtu měsíců krytí (default 3 měsíce) */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto text-xs">
            <span className="text-slate-400 font-medium">{isCs ? 'Cílová zásoba v picku:' : 'Target coverage:'}</span>
            {[2, 3, 4, 6].map(m => (
              <button
                key={m}
                onClick={() => setCoverageMonthsTarget(m)}
                className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  coverageMonthsTarget === m
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {m} {isCs ? (m === 1 ? 'měsíc' : m < 5 ? 'měsíce' : 'měsíců') : 'months'}
              </button>
            ))}
          </div>
        </div>

        {/* Kalibrační lišta celkové zásoby a ležáků */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between text-slate-300 font-medium">
              <span>{isCs ? 'Úroveň celkových zásob vůči modelu:' : 'Inventory level multiplier:'}</span>
              <span className="font-mono tabular-nums text-purple-300 font-bold">{Math.round(stockMultiplier * 100)} %</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={2.0}
              step={0.05}
              value={stockMultiplier}
              onChange={e => setStockMultiplier(Number(e.target.value))}
              className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="text-[11px] text-slate-500">
              {isCs ? 'Upravte objem držené zásoby nebo nahrajte stock.csv v Importu' : 'Adjust total stock multiplier or upload stock.csv'}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-medium block">
              {isCs ? 'Množina 2 – Počet SKU bez výdeje za rok (0 ks výdej):' : 'Zero-movement SKUs count (last year):'}
            </label>
            <input
              type="number"
              min={0}
              value={dynamicAbc.deadStockSkusCount}
              onChange={e => setCustomDeadSkusCount(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono tabular-nums focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-medium block">
              {isCs ? 'Množina 2 – Počet kusů v SKU bez výdeje (ks):' : 'Zero-movement stock units (pcs):'}
            </label>
            <input
              type="number"
              min={0}
              value={dynamicAbc.deadStockUnits}
              onChange={e => setCustomDeadUnitsCount(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono tabular-nums focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* 3 Hlavní pilíře zásob dle zadání */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pilíř 1: Zásoba na 3 průměrné měsíce */}
          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
              <span>{isCs ? `1. ZÁSOBA NA ${coverageMonthsTarget} PRŮMĚRNÉ MĚSÍCE` : `1. ${coverageMonthsTarget}-MONTH ACTIVE STOCK`}</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-white font-mono tabular-nums">
              {dynamicAbc.coveredThreeMonthUnits.toLocaleString('cs-CZ')} <span className="text-sm font-normal text-slate-400">ks</span>
            </div>
            <div className="text-xs text-slate-300 font-mono tabular-nums">
              {isCs
                ? `Rozloženo v ${dynamicAbc.coveredThreeMonthSkusCount.toLocaleString('cs-CZ')} aktivních SKU`
                : `Across ${dynamicAbc.coveredThreeMonthSkusCount.toLocaleString()} active SKUs`}
            </div>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              {isCs
                ? `Množství přesně pokrývající ${coverageMonthsTarget} průměrné měsíce odbytu v primárních pickovacích pozicích (celková ${coverageMonthsTarget}měs. potřeba je ${dynamicAbc.threeMonthDemandUnits.toLocaleString('cs-CZ')} ks).`
                : `Quantity covering ${coverageMonthsTarget} average months of demand in primary picking locations.`}
            </p>
          </div>

          {/* Pilíř 2: Nadzásoba na případné dokladnění */}
          <div className="bg-slate-950/80 border border-amber-500/30 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
              <span>{isCs ? `2. NADZÁSOBA NA DOKLADNĚNÍ (NAD ${coverageMonthsTarget} MĚS.)` : `2. EXCESS REPLENISHMENT BUFFER`}</span>
              <Boxes className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-amber-300 font-mono tabular-nums">
              {dynamicAbc.excessReplenishUnits.toLocaleString('cs-CZ')} <span className="text-sm font-normal text-slate-400">ks</span>
            </div>
            <div className="text-xs text-amber-200/90 font-mono tabular-nums font-semibold">
              {isCs
                ? `V ${dynamicAbc.excessReplenishSkusCount.toLocaleString('cs-CZ')} SKU (průměrně ${Math.round(dynamicAbc.excessReplenishUnits / Math.max(1, dynamicAbc.excessReplenishSkusCount))} ks / SKU)`
                : `Across ${dynamicAbc.excessReplenishSkusCount.toLocaleString()} SKUs`}
            </div>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              {isCs
                ? `Zásoba obrátkových položek převyšující ${coverageMonthsTarget} průměrné měsíce. Může být uložena v rezervní zóně pro postupné dokladnění.`
                : `Active SKU inventory exceeding ${coverageMonthsTarget} average months, suitable for reserve storage and replenishment.`}
            </p>
          </div>

          {/* Pilíř 3: Druhá množina – SKU bez výdeje za poslední rok */}
          <div className="bg-slate-950/80 border border-rose-500/30 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-rose-400 font-semibold">
              <span>{isCs ? '3. DRUHÁ MNOŽINA: NULOVÝ VÝDEJ ZA ROK' : '3. SECOND SET: ZERO ANNUAL MOVEMENT'}</span>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums">
              {dynamicAbc.deadStockUnits.toLocaleString('cs-CZ')} <span className="text-sm font-normal text-slate-400">ks</span>
            </div>
            <div className="text-xs text-rose-200/90 font-mono tabular-nums font-semibold">
              {isCs
                ? `Celkem ${dynamicAbc.deadStockSkusCount.toLocaleString('cs-CZ')} SKU s 0 ks výdejem (${dynamicAbc.classBreakdown.DEAD.skuSharePct} % katalogu)`
                : `${dynamicAbc.deadStockSkusCount.toLocaleString()} SKUs with 0 units shipped`}
            </div>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              {isCs
                ? 'Položky, které neměly za poslední rok žádný výdej ze skladu. Kandidáti na uvolnění lokací, výprodej nebo konsolidaci mimo hlavní sklad.'
                : 'SKUs with zero warehouse issues over the past year. Candidates for clearance or off-site consolidation.'}
            </p>
          </div>
        </div>

        {/* Souhrnná tabulka ABC kategorií (A, B, C, DEAD) */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3 px-4">{isCs ? 'Kategorie ABC' : 'ABC Class'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Počet SKU' : 'SKUs Count'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Podíl SKU' : 'SKU Share'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Roční výdej (ks)' : 'Annual Issue (pcs)'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Podíl výdeje' : 'Volume Share'}</th>
                <th className="py-3 px-3 text-right text-emerald-300">{isCs ? `Zásoba na ${coverageMonthsTarget} měs. (ks)` : `${coverageMonthsTarget}M Coverage (pcs)`}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Celková zásoba (ks)' : 'Total Stock (pcs)'}</th>
                <th className="py-3 px-3 text-right text-amber-300">{isCs ? 'SKU v nadzásobě' : 'Excess SKUs'}</th>
                <th className="py-3 px-4 text-right text-amber-400">{isCs ? 'Nadzásoba na dokladnění (ks)' : 'Excess Buffer (pcs)'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {([
                { key: 'A', labelCs: 'Skupina A (Top 80 % produkce)', labelEn: 'Class A (Top 80% volume)', color: 'text-emerald-400' },
                { key: 'B', labelCs: 'Skupina B (Dalších 15 % produkce)', labelEn: 'Class B (Next 15% volume)', color: 'text-blue-400' },
                { key: 'C', labelCs: 'Skupina C (Posledních 5 % produkce)', labelEn: 'Class C (Bottom 5% volume)', color: 'text-amber-400' },
                { key: 'DEAD', labelCs: 'Množina 2: Nulový výdej za rok (Ležáky)', labelEn: 'Set 2: Zero movement in last year', color: 'text-rose-400' },
              ] as const).map(row => {
                const c = dynamicAbc.classBreakdown[row.key];
                return (
                  <tr key={row.key} className="hover:bg-slate-800/40 transition-colors">
                    <td className={`py-3 px-4 font-sans font-bold ${row.color}`}>
                      {isCs ? row.labelCs : row.labelEn}
                    </td>
                    <td className="py-3 px-3 text-right text-white font-semibold">
                      {c.skusCount.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">
                      {c.skuSharePct} %
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200">
                      {c.annualUnits.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-300 font-semibold">
                      {c.unitSharePct} %
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-300 font-semibold">
                      {c.coveredThreeMonthUnits.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3 text-right text-white">
                      {c.currentStockUnits.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3 text-right text-amber-300">
                      {c.excessSkusCount.toLocaleString('cs-CZ')} SKU
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-amber-400">
                      {c.excessUnits.toLocaleString('cs-CZ')} ks
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-950/90 border-t-2 border-slate-700 font-mono tabular-nums font-bold text-white">
              <tr>
                <td className="py-3.5 px-4 font-sans">{isCs ? 'CELKEM KATALOG (A + B + C + Ležáky)' : 'TOTAL CATALOG'}</td>
                <td className="py-3.5 px-3 text-right">{dynamicAbc.totalCatalogSkus.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right">100 %</td>
                <td className="py-3.5 px-3 text-right">{dynamicAbc.totalAnnualIssuedUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right">100 %</td>
                <td className="py-3.5 px-3 text-right text-emerald-400">{dynamicAbc.coveredThreeMonthUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right">{dynamicAbc.totalStockUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right text-amber-300">
                  {(dynamicAbc.excessReplenishSkusCount + dynamicAbc.deadStockSkusCount).toLocaleString('cs-CZ')} SKU
                </td>
                <td className="py-3.5 px-4 text-right text-amber-400">
                  {(dynamicAbc.excessReplenishUnits + dynamicAbc.deadStockUnits).toLocaleString('cs-CZ')} ks
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Detailní náhled na konkrétní SKU (Nadzásoby / Top A / Ležáky) */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-300">
              {isCs ? 'Detailní rozpis konkrétních SKU:' : 'Detailed SKU Breakdown:'}
            </span>
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setActiveSkuTableTab('excess')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSkuTableTab === 'excess' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isCs ? 'SKU s největší nadzásobou na dokladnění' : 'Top Excess Replenishment SKUs'}
              </button>
              <button
                onClick={() => setActiveSkuTableTab('active')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSkuTableTab === 'active' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isCs ? 'Top A obrátkové SKU' : 'Top Class A SKUs'}
              </button>
              <button
                onClick={() => setActiveSkuTableTab('dead')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeSkuTableTab === 'dead' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isCs ? 'SKU bez výdeje (0 ks za rok)' : 'Zero-Movement Dead SKUs'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0 font-semibold">
                <tr>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-3">Article Code</th>
                  <th className="py-2.5 px-3 text-center">ABC</th>
                  <th className="py-2.5 px-3 text-right">{isCs ? 'Roční výdej' : 'Annual Issue'}</th>
                  <th className="py-2.5 px-3 text-right">{isCs ? 'Ø měsíční výdej' : 'Avg Monthly'}</th>
                  <th className="py-2.5 px-3 text-right text-emerald-300">{isCs ? `Potřeba na ${coverageMonthsTarget} měs.` : `${coverageMonthsTarget}M Target`}</th>
                  <th className="py-2.5 px-3 text-right">{isCs ? 'Celková zásoba' : 'Total Stock'}</th>
                  <th className="py-2.5 px-4 text-right text-amber-300">{isCs ? 'Nadzásoba (dokladnění)' : 'Excess Buffer'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                {(activeSkuTableTab === 'excess'
                  ? report.abcAnalysis.topExcessSkus
                  : activeSkuTableTab === 'active'
                  ? report.abcAnalysis.topActiveSkus
                  : report.abcAnalysis.sampleDeadSkus
                ).slice(0, 15).map(item => {
                  const targetUnits = Math.ceil(item.avgMonthlyUnits * coverageMonthsTarget);
                  const stockUnits = Math.round(item.currentStockUnits * stockMultiplier);
                  const excessUnits = Math.max(0, stockUnits - targetUnits);
                  return (
                    <tr key={item.sku} className="hover:bg-slate-800/40">
                      <td className="py-2 px-4 font-bold text-white">{item.sku}</td>
                      <td className="py-2 px-3 text-slate-400">{item.articleCode}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={
                          item.abcClass === 'A' ? 'text-emerald-400 font-bold' :
                          item.abcClass === 'B' ? 'text-blue-400 font-bold' :
                          item.abcClass === 'C' ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold'
                        }>
                          {item.abcClass}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-200">{item.annualUnits.toLocaleString('cs-CZ')} ks</td>
                      <td className="py-2 px-3 text-right text-slate-400">{item.avgMonthlyUnits} ks</td>
                      <td className="py-2 px-3 text-right text-emerald-300">{targetUnits.toLocaleString('cs-CZ')} ks</td>
                      <td className="py-2 px-3 text-right text-white">{stockUnits.toLocaleString('cs-CZ')} ks</td>
                      <td className="py-2 px-4 text-right font-bold text-amber-300">{excessUnits.toLocaleString('cs-CZ')} ks</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SEKCE 4: PŘEPOČET VÝKONU V MĚSÍCÍCH NA LIDI (FTE DLE SVJ)   */}
      {/* ========================================================= */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <span>
                {isCs
                  ? '4. Přepočet výkonu v jednotlivých měsících na pracovníky (FTE) podle časů SVJ'
                  : '4. Monthly Workforce (FTE) Simulation Using SVJ Picking, Sorting & Packing Rates'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-4xl">
              {isCs
                ? 'Model aplikuje reálné časy ze skladu SVJ (pro každou velikostní kategorii zásilek 1, 2, 3, 4, 5, 6+ ks) na měsíční strukturu objednávek skladu Gate a počítá potřebu hodin a pracovníků (FTE) pro Picking, Sorting a Packing.'
                : 'Applies SVJ per-item cycle times by order bracket onto Gate monthly volume to determine required man-hours and FTE staff for Picking, Sorting, and Packing.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto text-xs">
            <button
              onClick={() => setShowRateEditor(!showRateEditor)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 hover:border-cyan-500/50 font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{showRateEditor ? (isCs ? 'Skrýt normočasy SVJ' : 'Hide SVJ Rates') : (isCs ? 'Zobrazit / upravit časy SVJ' : 'View / Edit SVJ Rates')}</span>
            </button>
          </div>
        </div>

        {/* Ovládací panel parametrů FTE modelu */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            {/* Medián vs Průměr SVJ */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">{isCs ? 'Základna časů SVJ:' : 'SVJ Time Basis:'}</span>
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setUseMedianSvj(true)}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                    useMedianSvj ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isCs ? 'Medián SVJ (primární)' : 'SVJ Median'}
                </button>
                <button
                  onClick={() => setUseMedianSvj(false)}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                    !useMedianSvj ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isCs ? 'Průměr SVJ' : 'SVJ Mean'}
                </button>
              </div>
            </div>

            {/* 1ks mimo sorting */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">{isCs ? '1-kusové zásilky:' : '1-item orders:'}</span>
              <button
                onClick={() => setBypassSingleSort(!bypassSingleSort)}
                className={`px-2.5 py-1 rounded-lg border font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                  bypassSingleSort
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                }`}
              >
                {bypassSingleSort
                  ? (isCs ? 'Míjí sorting (0 s, jako v SVJ)' : 'Bypass sorting (0s)')
                  : (isCs ? 'Prochází sortingem' : 'Include in sorting')}
              </button>
            </div>
          </div>

          {/* Měsíční fond hodin 1 FTE */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">{isCs ? 'Měsíční fond 1 FTE:' : 'Monthly hours / FTE:'}</span>
            {[145, 160, 168].map(h => (
              <button
                key={h}
                onClick={() => setMonthlyFteHours(h)}
                className={`px-2.5 py-1 rounded-lg border font-mono tabular-nums font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                  monthlyFteHours === h
                    ? 'bg-cyan-600 text-white border-cyan-500'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {h} h
              </button>
            ))}
          </div>
        </div>

        {/* Volitelný editor normočasů SVJ podle velikostní kategorie zásilky */}
        {showRateEditor && (
          <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300">
                {isCs
                  ? 'Použité normočasy ze skladu SVJ (sekundy na 1 kus podle velikosti objednávky):'
                  : 'Applied SVJ Benchmark Times (seconds per unit by order bracket):'}
              </span>
              <button
                onClick={() => setCustomRateOverrides({})}
                className="text-slate-400 hover:text-white underline cursor-pointer"
              >
                {isCs ? 'Obnovit výchozí časy SVJ' : 'Reset to SVJ defaults'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono tabular-nums">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="py-2 px-3 font-sans">{isCs ? 'Činnost (s / 1 ks)' : 'Activity (s / item)'}</th>
                    {(['1', '2', '3', '4', '5', '6+'] as ItemBracket[]).map(b => (
                      <th key={b} className="py-2 px-3 text-right">{b} ks</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr>
                    <td className="py-2 px-3 font-sans font-semibold text-indigo-300">1. Picking (s/ks)</td>
                    {(['1', '2', '3', '4', '5', '6+'] as ItemBracket[]).map(b => (
                      <td key={b} className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={activeSvjRates.pickSecByBracket[b]}
                          onChange={e => {
                            const val = Math.max(0, parseFloat(e.target.value || '0'));
                            setCustomRateOverrides(prev => ({
                              ...prev,
                              pick: { ...(prev.pick || {}), [b]: val },
                            }));
                          }}
                          className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right text-white"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans font-semibold text-purple-300">2. Sorting (s/ks)</td>
                    {(['1', '2', '3', '4', '5', '6+'] as ItemBracket[]).map(b => (
                      <td key={b} className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={b === '1' && bypassSingleSort ? 0 : activeSvjRates.sortSecByBracket[b]}
                          disabled={b === '1' && bypassSingleSort}
                          onChange={e => {
                            const val = Math.max(0, parseFloat(e.target.value || '0'));
                            setCustomRateOverrides(prev => ({
                              ...prev,
                              sort: { ...(prev.sort || {}), [b]: val },
                            }));
                          }}
                          className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right text-white disabled:opacity-40"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans font-semibold text-emerald-300">3. Packing (s/ks)</td>
                    {(['1', '2', '3', '4', '5', '6+'] as ItemBracket[]).map(b => (
                      <td key={b} className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={activeSvjRates.packSecByBracket[b]}
                          onChange={e => {
                            const val = Math.max(0, parseFloat(e.target.value || '0'));
                            setCustomRateOverrides(prev => ({
                              ...prev,
                              pack: { ...(prev.pack || {}), [b]: val },
                            }));
                          }}
                          className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right text-white"
                        />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4 Karty průměrné roční potřeby FTE podle činností */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4">
            <div className="text-xs text-indigo-300 font-semibold">{isCs ? '1. PICKING (Vychystávání)' : '1. PICKING FTE'}</div>
            <div className="mt-1.5 text-2xl font-bold text-white font-mono tabular-nums">
              {fteSummary.avgPickFte} <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
            </div>
            <div className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
              {isCs ? `Celkem ${fteSummary.totalPickHours.toLocaleString('cs-CZ')} h za rok` : `Total ${fteSummary.totalPickHours.toLocaleString()} h/year`}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-purple-500/30 rounded-xl p-4">
            <div className="text-xs text-purple-300 font-semibold">{isCs ? '2. SORTING (Třídění)' : '2. SORTING FTE'}</div>
            <div className="mt-1.5 text-2xl font-bold text-purple-300 font-mono tabular-nums">
              {fteSummary.avgSortFte} <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
            </div>
            <div className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
              {isCs ? `Celkem ${fteSummary.totalSortHours.toLocaleString('cs-CZ')} h za rok` : `Total ${fteSummary.totalSortHours.toLocaleString()} h/year`}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-4">
            <div className="text-xs text-emerald-300 font-semibold">{isCs ? '3. PACKING (Balení)' : '3. PACKING FTE'}</div>
            <div className="mt-1.5 text-2xl font-bold text-emerald-300 font-mono tabular-nums">
              {fteSummary.avgPackFte} <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
            </div>
            <div className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
              {isCs ? `Celkem ${fteSummary.totalPackHours.toLocaleString('cs-CZ')} h za rok` : `Total ${fteSummary.totalPackHours.toLocaleString()} h/year`}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-cyan-500/40 rounded-xl p-4">
            <div className="text-xs text-cyan-300 font-semibold">{isCs ? 'CELKEM PRACOVNÍKŮ (FTE)' : 'TOTAL STAFF (FTE)'}</div>
            <div className="mt-1.5 text-2xl font-bold text-cyan-300 font-mono tabular-nums">
              {fteSummary.avgTotalFte} <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
            </div>
            <div className="mt-1 text-xs text-amber-300 font-mono tabular-nums">
              {isCs ? `Špička: ${fteSummary.peakTotalFte} FTE (${fteSummary.peakMonthLabel})` : `Peak: ${fteSummary.peakTotalFte} FTE`}
            </div>
          </div>
        </div>

        {/* Měsíční tabulka přepočtu výkonu na hodiny a FTE pracovníky */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3 px-4">{isCs ? 'Měsíc' : 'Month'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Objednávky' : 'Orders'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Kusy celkem' : 'Total Units'}</th>
                <th className="py-3 px-3 text-right text-indigo-300">{isCs ? 'Picking (hod)' : 'Pick (h)'}</th>
                <th className="py-3 px-3 text-right text-indigo-400 font-bold">{isCs ? 'FTE Picking' : 'Pick FTE'}</th>
                <th className="py-3 px-3 text-right text-purple-300">{isCs ? 'Sorting (hod)' : 'Sort (h)'}</th>
                <th className="py-3 px-3 text-right text-purple-400 font-bold">{isCs ? 'FTE Sorting' : 'Sort FTE'}</th>
                <th className="py-3 px-3 text-right text-emerald-300">{isCs ? 'Packing (hod)' : 'Pack (h)'}</th>
                <th className="py-3 px-3 text-right text-emerald-400 font-bold">{isCs ? 'FTE Packing' : 'Pack FTE'}</th>
                <th className="py-3 px-3 text-right text-slate-200">{isCs ? 'Celkem hodin' : 'Total Hours'}</th>
                <th className="py-3 px-4 text-right text-cyan-300 font-bold">{isCs ? 'CELKEM FTE (lidí)' : 'TOTAL FTE'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {enrichedMonths.map(m => (
                <tr key={m.month} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-sans font-semibold text-white whitespace-nowrap">
                    {isCs ? m.monthLabelCs : m.monthLabelEn}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {m.totalOrders.toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-300">
                    {m.totalUnits.toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-400">
                    {m.fte.pickHours.toLocaleString('cs-CZ')} h
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-indigo-300 bg-indigo-950/15">
                    {m.fte.pickFte} FTE
                  </td>
                  <td className="py-3 px-3 text-right text-slate-400">
                    {m.fte.sortHours.toLocaleString('cs-CZ')} h
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-purple-300 bg-purple-950/15">
                    {m.fte.sortFte} FTE
                  </td>
                  <td className="py-3 px-3 text-right text-slate-400">
                    {m.fte.packHours.toLocaleString('cs-CZ')} h
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-300 bg-emerald-950/15">
                    {m.fte.packFte} FTE
                  </td>
                  <td className="py-3 px-3 text-right text-white font-semibold">
                    {m.fte.totalHours.toLocaleString('cs-CZ')} h
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-cyan-300 bg-cyan-950/20 text-sm">
                    {m.fte.totalFte} FTE
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-950/90 border-t-2 border-slate-700 font-mono tabular-nums font-bold text-white">
              <tr>
                <td className="py-3.5 px-4 font-sans">{isCs ? 'PRŮMĚR MĚSÍC / SOUČET HODIN' : 'MONTHLY AVG / TOTAL HOURS'}</td>
                <td className="py-3.5 px-3 text-right">{report.totalOrders.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right">{report.totalUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right text-slate-300">{fteSummary.totalPickHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-3 text-right text-indigo-300">Ø {fteSummary.avgPickFte} FTE</td>
                <td className="py-3.5 px-3 text-right text-slate-300">{fteSummary.totalSortHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-3 text-right text-purple-300">Ø {fteSummary.avgSortFte} FTE</td>
                <td className="py-3.5 px-3 text-right text-slate-300">{fteSummary.totalPackHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-3 text-right text-emerald-300">Ø {fteSummary.avgPackFte} FTE</td>
                <td className="py-3.5 px-3 text-right text-white">{fteSummary.totalYearHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-4 text-right text-cyan-300 text-sm">Ø {fteSummary.avgTotalFte} FTE</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
};
