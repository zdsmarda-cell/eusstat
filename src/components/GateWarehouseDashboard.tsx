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
import {
  computeMonthlyFteFromBrackets,
  getDefaultSvjBenchmarkRates,
  recomputeGateVolumetryFromSummary,
} from '../utils/gateParser.js';
import { useLanguage } from '../context/LanguageContext.js';

interface GateWarehouseDashboardProps {
  report: GateAnalyticsReport | null;
  svjBracketStats?: BracketStat[];
  onOpenImport: () => void;
  onLoadSampleGate: () => void;
  onExportHtml?: () => void;
  isLoading?: boolean;
}

export const GateWarehouseDashboard: React.FC<GateWarehouseDashboardProps> = ({
  report,
  svjBracketStats,
  onOpenImport,
  onLoadSampleGate,
  onExportHtml,
  isLoading,
}) => {
  const { lang } = useLanguage();
  const isCs = lang === 'cs';

  // 1. Stav zobrazení v sekci Měsíční struktura zásilek
  const [bracketViewMode, setBracketViewMode] = useState<'pct' | 'orders' | 'units'>('pct');
  const [showDetailed5And6, setShowDetailed5And6] = useState<boolean>(false);

  // 2. Stav zobrazení v sekci Cílové země
  const [selectedCountryMonth, setSelectedCountryMonth] = useState<string>('all');

  // 3. Stav v sekci ABC analýza & 3měsíční zásoba vs. nadzásoba + Volumetrie boxů a palet
  const DEFAULT_CUSTOMER_STOCK_UNITS = 4_500_000;
  const [coverageMonthsTarget, setCoverageMonthsTarget] = useState<number>(3);
  const [boxMaxFillPct, setBoxMaxFillPct] = useState<number>(80);       // Box 60x40x22 cm (max 80 % využitelných = 42,24 l)
  const [palletMaxFillPct, setPalletMaxFillPct] = useState<number>(80); // Paleta 120x80x180 cm (max 80 % využitelných = 1 382,4 l)
  const [replenishTriggerPct, setReplenishTriggerPct] = useState<number>(30); // Pokles pod 30 % -> doskladnění na 100 % (dávka 70 %)
  const [customPalletPickSec, setCustomPalletPickSec] = useState<number | null>(null);
  const [boxMoveSecPerBox, setBoxMoveSecPerBox] = useState<number>(60); // Čas přemístění vypickovaného boxu na skladovou pozici (výchozí 60 s)
  const [includeReplenishInFte, setIncludeReplenishInFte] = useState<boolean>(true);
  const [customTotalStockUnits, setCustomTotalStockUnits] = useState<number | null>(null);
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

  // Aktuální SVJ normočasy (sekundy na 1 ks podle velikosti objednávky 1..6+) + čas paletového pickingu a přesunu boxu pro doskladnění
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

    // Čas paletového pickingu pro průběžné doskladňování (výchozí dle nejvyšší objemové kategorie 6+ v SVJ)
    const defaultPalletPickSec = pickSecByBracket['6+'] || 19.8;
    const palletPickSecPerUnit =
      customPalletPickSec !== null ? customPalletPickSec : defaultPalletPickSec;

    return {
      source: svjBracketStats && svjBracketStats.length > 0 ? 'svj_db' : base.source,
      useMedian: useMedianSvj,
      bypassSingleItemSort: bypassSingleSort,
      monthlyFteHoursNorm: monthlyFteHours,
      palletPickSecPerUnit,
      boxMoveSecPerBox,
      replenishTriggerPct,
      pickSecByBracket,
      sortSecByBracket,
      packSecByBracket,
    };
  }, [
    svjBracketStats,
    liveSvjRates,
    report?.svjBenchmark,
    useMedianSvj,
    bypassSingleSort,
    monthlyFteHours,
    customRateOverrides,
    customPalletPickSec,
    boxMoveSecPerBox,
    replenishTriggerPct,
  ]);

  // Dynamický přepočet ABC analýzy + průběžného doskladňování (paletový picking + přesun boxu 60 s) + Volumetrie boxů a palet
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
      replenishBatchUnits: 0,
      avgSkuBatchUnits: 0,
      boxesPerWave: 0,
      annualReplenishCycles: 0,
      monthlyReplenishCycles: 0,
      annualReplenishedBoxes: 0,
      monthlyReplenishedBoxes: 0,
      annualReplenishUnits: 0,
      excessCoveredWaves: 0,
      replenishPickHoursYear: 0,
      replenishBoxMoveHoursYear: 0,
      replenishHoursYear: 0,
      replenishHoursMonthAvg: 0,
      replenishFteMonthly: 0,
      boxesFor3M: 0,
      boxVolumeM3: 0,
      palletsForExcess: 0,
      palletVolumeM3: 0,
      monoSkuPallets: 0,
      mixedSkuPallets: 0,
    };
    const base = report?.abcAnalysis;
    const palletPickSec = activeSvjRates.palletPickSecPerUnit ?? 19.8;
    const batchFraction = Math.max(0.1, (100 - replenishTriggerPct) / 100); // 0.70 při 30 %
    const batchMonthsEquivalent = Number((coverageMonthsTarget * batchFraction).toFixed(2)); // 3 * 0.70 = 2.1 měs.

    if (!base) {
      return {
        stockSource: 'estimated_from_velocity' as const,
        hasExplicitStockFile: false,
        totalCatalogSkus: 0,
        activeSkusCount: 0,
        deadStockSkusCount: 0,
        deadStockUnits: 0,
        zeroStockCatalogSkusCount: 0,
        shortageUnitsTotal: 0,
        shortageSkusCount: 0,
        totalAnnualIssuedUnits: 0,
        avgMonthlyIssuedUnits: 0,
        threeMonthDemandUnits: 0,
        totalStockUnits: DEFAULT_CUSTOMER_STOCK_UNITS,
        coveredThreeMonthUnits: 0,
        coveredThreeMonthSkusCount: 0,
        excessReplenishUnits: 0,
        excessReplenishSkusCount: 0,
        skuScaleFactor: 1,
        batchFractionPct: Math.round(batchFraction * 100),
        batchMonthsEquivalent,
        cyclesPerSkuPerYear: 0,
        netCyclesAfterInitialFill: 0,
        totalReplenishBatchUnits: 0,
        avgUnitsPerReplenishTask: 0,
        totalBoxesPerWave: 0,
        totalAnnualReplenishCycles: 0,
        avgMonthlyReplenishCycles: 0,
        totalAnnualReplenishedBoxes: 0,
        avgMonthlyReplenishedBoxes: 0,
        excessCoveredWaves: 0,
        totalReplenishPickHoursYear: 0,
        totalReplenishBoxMoveHoursYear: 0,
        totalReplenishHoursYear: 0,
        avgMonthlyReplenishHours: 0,
        avgMonthlyReplenishFte: 0,
        palletPickSecPerUnit: palletPickSec,
        boxMoveSecPerBox,
        volumetry: null,
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

    const monthsCount = Math.max(1, report?.monthsCount || 12);
    const normHours = Math.max(40, monthlyFteHours || 160);
    // Počet cyklů doskladnění na 1 SKU za celé období (např. 12 / 2,1 = 5,71x ročně)
    const cyclesPerSkuPerYear = Number((monthsCount / Math.max(0.1, batchMonthsEquivalent)).toFixed(2));
    const netCyclesAfterInitialFill = Math.max(0, Number((cyclesPerSkuPerYear - 1).toFixed(2)));

    // Pokud byl nahrán explicitní stock.csv (3. soubor), použijeme reálnou zásobu z něj (~4.5M ks)
    const defaultTotalStock =
      base.hasExplicitStockFile && base.totalStockUnits > 0
        ? base.totalStockUnits
        : DEFAULT_CUSTOMER_STOCK_UNITS;
    const targetTotalStock = Math.max(
      0,
      customTotalStockUnits !== null ? customTotalStockUnits : defaultTotalStock
    );

    const deadSkus =
      customDeadSkusCount !== null ? customDeadSkusCount : base.deadStockSkusCount;

    const totalAnnualIssued = base.totalAnnualIssuedUnits || report?.totalUnits || 0;
    // Potřeba na N průměrných měsíců (výchozí 3 měsíce) přímo z reálných měsíčních výdejů v CSV (např. 3 * 92k = 276k ks)
    const threeMonthDemandUnits = Math.round((totalAnnualIssued / monthsCount) * coverageMonthsTarget);
    const targetA = Math.round(((base.classBreakdown?.A?.annualUnits || 0) / monthsCount) * coverageMonthsTarget);
    const targetB = Math.round(((base.classBreakdown?.B?.annualUnits || 0) / monthsCount) * coverageMonthsTarget);
    const targetC = Math.max(0, threeMonthDemandUnits - targetA - targetB);

    const defaultDeadUnits = base.hasExplicitStockFile
      ? Math.min(Math.max(0, targetTotalStock - threeMonthDemandUnits), base.deadStockUnits)
      : base.deadStockUnits >= 100_000
      ? Math.round(base.deadStockUnits * (targetTotalStock / DEFAULT_CUSTOMER_STOCK_UNITS))
      : Math.round(targetTotalStock * 0.08); // ~360 000 ks při 4,5M ks

    const deadUnits = Math.min(
      targetTotalStock,
      Math.max(0, customDeadUnitsCount !== null ? customDeadUnitsCount : defaultDeadUnits)
    );

    const activeTargetStock = Math.max(0, targetTotalStock - deadUnits);

    const baseA = base.classBreakdown?.A || emptyClass;
    const baseB = base.classBreakdown?.B || emptyClass;
    const baseC = base.classBreakdown?.C || emptyClass;

    // Protože soubor skladové zásoby (stock.csv) je snímkem jen k 1 dni v roce a v průběhu roku
    // se točí sezónní SKU, aproximujeme potřebnou zásobu v každé třídě A, B, C tak, aby 3měsíční
    // zásoba v oběhu vždy přesně odpovídala reálným měsíčním výdejům (coverageMonthsTarget * Ø měsíční výdej).
    let stockA = baseA.currentStockUnits;
    let stockB = baseB.currentStockUnits;
    let stockC = baseC.currentStockUnits;

    if (activeTargetStock >= threeMonthDemandUnits) {
      const totalActiveExcess = activeTargetStock - threeMonthDemandUnits;
      const rawExcA = Math.max(0, baseA.currentStockUnits - targetA);
      const rawExcB = Math.max(0, baseB.currentStockUnits - targetB);
      const rawExcC = Math.max(0, baseC.currentStockUnits - targetC);
      const rawExcSum = rawExcA + rawExcB + rawExcC;

      const shareA = rawExcSum > 0 ? rawExcA / rawExcSum : 0.52;
      const shareB = rawExcSum > 0 ? rawExcB / rawExcSum : 0.28;

      const excA = Math.round(totalActiveExcess * shareA);
      const excB = Math.round(totalActiveExcess * shareB);
      const excC = Math.max(0, totalActiveExcess - excA - excB);

      stockA = targetA + excA;
      stockB = targetB + excB;
      stockC = targetC + excC;
    } else if (threeMonthDemandUnits > 0) {
      const ratio = activeTargetStock / threeMonthDemandUnits;
      stockA = Math.round(targetA * ratio);
      stockB = Math.round(targetB * ratio);
      stockC = Math.max(0, activeTargetStock - stockA - stockB);
    }

    const baseActiveStockSum =
      baseA.currentStockUnits + baseB.currentStockUnits + baseC.currentStockUnits;
    const skuScaleFactor =
      baseActiveStockSum > 0 ? activeTargetStock / baseActiveStockSum : 1;

    // Přepočet volumetrie (boxy 60x40x22 cm s 1 SKU/box & palety 120x80x180 cm se sdílenou konsolidací)
    const volumetry = recomputeGateVolumetryFromSummary(
      base,
      boxMaxFillPct,
      palletMaxFillPct,
      coverageMonthsTarget,
      skuScaleFactor,
      { A: targetA, B: targetB, C: targetC },
      { A: stockA, B: stockB, C: stockC, DEAD: deadUnits }
    );

    const buildClass = (
      clsKey: 'A' | 'B' | 'C',
      baseCls: typeof baseA,
      targetUnits: number,
      stockUnits: number
    ) => {
      const coveredUnits = Math.min(stockUnits, targetUnits);
      const excessUnits = Math.max(0, stockUnits - coveredUnits);
      const excessSkusCount =
        excessUnits > 0
          ? Math.min(
              baseCls.skusCount,
              Math.max(
                1,
                baseCls.excessUnits > 0 && Math.abs(excessUnits - baseCls.excessUnits) < baseCls.excessUnits * 0.1
                  ? baseCls.excessSkusCount
                  : stockUnits > targetUnits * 1.35
                  ? Math.round(baseCls.skusCount * 0.92)
                  : baseCls.excessSkusCount || Math.round(baseCls.skusCount * 0.75)
              )
            )
          : 0;

      const vCls = volumetry.byClass[clsKey];
      const activeBoxSkus = vCls.boxSkusCount || baseCls.skusCount;
      const extraMultiBoxes = Math.max(0, vCls.boxesNeeded - activeBoxSkus);
      // Počet boxů (beden) přemístěných na pozici v 1 vlně doskladnění (30 % -> 100 %)
      const boxesPerWave = activeBoxSkus + Math.round(extraMultiBoxes * batchFraction);

      // 1 dávka doskladnění (z 30 % na 100 % = 70 % cílové 3M zásoby v picku)
      const replenishBatchUnits = Math.round(coveredUnits * batchFraction);
      const avgSkuBatchUnits =
        baseCls.skusCount > 0 ? Math.max(1, Math.round(replenishBatchUnits / baseCls.skusCount)) : 0;
      const annualReplenishCycles = Math.round(baseCls.skusCount * cyclesPerSkuPerYear);
      const monthlyReplenishCycles = Math.round(annualReplenishCycles / monthsCount);
      const annualReplenishedBoxes = Math.round(boxesPerWave * cyclesPerSkuPerYear);
      const monthlyReplenishedBoxes = Math.round(annualReplenishedBoxes / monthsCount);
      const annualReplenishUnits = baseCls.annualUnits;
      const excessCoveredWaves =
        replenishBatchUnits > 0 ? Number((excessUnits / replenishBatchUnits).toFixed(2)) : 0;

      // Čas doskladňování = paletový picking kusů (s/ks) + přemístění vypickovaného boxu na pozici (s/box)
      const replenishPickHoursYear = Number(((annualReplenishUnits * palletPickSec) / 3600).toFixed(1));
      const replenishBoxMoveHoursYear = Number(((annualReplenishedBoxes * boxMoveSecPerBox) / 3600).toFixed(1));
      const replenishHoursYear = Number((replenishPickHoursYear + replenishBoxMoveHoursYear).toFixed(1));
      const replenishHoursMonthAvg = Number((replenishHoursYear / monthsCount).toFixed(1));
      const replenishFteMonthly = Number((replenishHoursMonthAvg / normHours).toFixed(2));

      return {
        ...baseCls,
        threeMonthTargetUnits: targetUnits,
        currentStockUnits: stockUnits,
        coveredThreeMonthUnits: coveredUnits,
        excessUnits,
        excessSkusCount,
        replenishBatchUnits,
        avgSkuBatchUnits,
        boxesPerWave,
        annualReplenishCycles,
        monthlyReplenishCycles,
        annualReplenishedBoxes,
        monthlyReplenishedBoxes,
        annualReplenishUnits,
        excessCoveredWaves,
        replenishPickHoursYear,
        replenishBoxMoveHoursYear,
        replenishHoursYear,
        replenishHoursMonthAvg,
        replenishFteMonthly,
        boxesFor3M: vCls.boxesNeeded,
        boxVolumeM3: vCls.boxGoodsVolumeM3,
        palletsForExcess: vCls.palletsNeeded,
        palletVolumeM3: vCls.palletGoodsVolumeM3,
        monoSkuPallets: vCls.monoSkuPalletsCount,
        mixedSkuPallets: vCls.mixedSkuPalletsCount,
      };
    };

    const classA = buildClass('A', baseA, targetA, stockA);
    const classB = buildClass('B', baseB, targetB, stockB);
    const classC = buildClass('C', baseC, targetC, stockC);
    const totalCatSkus = base.activeSkusCount + deadSkus;
    const vDead = volumetry.byClass.DEAD;

    const classDEAD = {
      ...emptyClass,
      ...(base.classBreakdown?.DEAD || {}),
      skusCount: deadSkus,
      skuSharePct: totalCatSkus > 0 ? Number(((deadSkus / totalCatSkus) * 100).toFixed(1)) : 0,
      currentStockUnits: deadUnits,
      excessUnits: deadUnits,
      excessSkusCount: deadSkus,
      boxesFor3M: 0,
      boxVolumeM3: 0,
      palletsForExcess: vDead.palletsNeeded,
      palletVolumeM3: vDead.palletGoodsVolumeM3,
      monoSkuPallets: vDead.monoSkuPalletsCount,
      mixedSkuPallets: vDead.mixedSkuPalletsCount,
    };

    const coveredThreeMonthUnits =
      classA.coveredThreeMonthUnits + classB.coveredThreeMonthUnits + classC.coveredThreeMonthUnits;
    const coveredThreeMonthSkusCount =
      (volumetry.byClass.A.boxSkusCount || 0) +
      (volumetry.byClass.B.boxSkusCount || 0) +
      (volumetry.byClass.C.boxSkusCount || 0) ||
      base.coveredThreeMonthSkusCount ||
      base.activeSkusCount;
    const excessReplenishUnits =
      classA.excessUnits + classB.excessUnits + classC.excessUnits;
    const excessReplenishSkusCount =
      classA.excessSkusCount + classB.excessSkusCount + classC.excessSkusCount;
    const totalStockUnits =
      classA.currentStockUnits + classB.currentStockUnits + classC.currentStockUnits + deadUnits;

    const totalReplenishBatchUnits =
      classA.replenishBatchUnits + classB.replenishBatchUnits + classC.replenishBatchUnits;
    const avgUnitsPerReplenishTask =
      base.activeSkusCount > 0 ? Math.max(1, Math.round(totalReplenishBatchUnits / base.activeSkusCount)) : 0;
    const totalBoxesPerWave =
      classA.boxesPerWave + classB.boxesPerWave + classC.boxesPerWave;
    const totalAnnualReplenishCycles =
      classA.annualReplenishCycles + classB.annualReplenishCycles + classC.annualReplenishCycles;
    const avgMonthlyReplenishCycles = Math.round(totalAnnualReplenishCycles / monthsCount);
    const totalAnnualReplenishedBoxes =
      classA.annualReplenishedBoxes + classB.annualReplenishedBoxes + classC.annualReplenishedBoxes;
    const avgMonthlyReplenishedBoxes = Math.round(totalAnnualReplenishedBoxes / monthsCount);
    const excessCoveredWaves =
      totalReplenishBatchUnits > 0
        ? Number((excessReplenishUnits / totalReplenishBatchUnits).toFixed(2))
        : 0;
    const totalReplenishPickHoursYear = Number(
      (classA.replenishPickHoursYear + classB.replenishPickHoursYear + classC.replenishPickHoursYear).toFixed(1)
    );
    const totalReplenishBoxMoveHoursYear = Number(
      (classA.replenishBoxMoveHoursYear + classB.replenishBoxMoveHoursYear + classC.replenishBoxMoveHoursYear).toFixed(1)
    );
    const totalReplenishHoursYear = Number(
      (totalReplenishPickHoursYear + totalReplenishBoxMoveHoursYear).toFixed(1)
    );
    const avgMonthlyReplenishHours = Number((totalReplenishHoursYear / monthsCount).toFixed(1));
    const avgMonthlyReplenishFte = Number((avgMonthlyReplenishHours / normHours).toFixed(2));

    return {
      ...base,
      totalCatalogSkus: totalCatSkus,
      deadStockSkusCount: deadSkus,
      deadStockUnits: deadUnits,
      totalStockUnits,
      threeMonthDemandUnits,
      coveredThreeMonthUnits,
      coveredThreeMonthSkusCount,
      excessReplenishUnits,
      excessReplenishSkusCount,
      skuScaleFactor,
      batchFractionPct: Math.round(batchFraction * 100),
      batchMonthsEquivalent,
      cyclesPerSkuPerYear,
      netCyclesAfterInitialFill,
      totalReplenishBatchUnits,
      avgUnitsPerReplenishTask,
      totalBoxesPerWave,
      totalAnnualReplenishCycles,
      avgMonthlyReplenishCycles,
      totalAnnualReplenishedBoxes,
      avgMonthlyReplenishedBoxes,
      excessCoveredWaves,
      totalReplenishPickHoursYear,
      totalReplenishBoxMoveHoursYear,
      totalReplenishHoursYear,
      avgMonthlyReplenishHours,
      avgMonthlyReplenishFte,
      palletPickSecPerUnit: palletPickSec,
      boxMoveSecPerBox,
      volumetry,
      classBreakdown: {
        A: classA,
        B: classB,
        C: classC,
        DEAD: classDEAD,
      },
    };
  }, [
    report?.abcAnalysis,
    report?.monthsCount,
    report?.totalUnits,
    coverageMonthsTarget,
    boxMaxFillPct,
    palletMaxFillPct,
    replenishTriggerPct,
    activeSvjRates.palletPickSecPerUnit,
    boxMoveSecPerBox,
    monthlyFteHours,
    customTotalStockUnits,
    customDeadSkusCount,
    customDeadUnitsCount,
  ]);

  // Dynamický přepočet měsíčních FTE podle zvolených SVJ časů, paletového pickingu + přesunu boxu a fondu pracovní doby
  const enrichedMonths = useMemo(() => {
    const months = report?.monthlyBreakdown || [];
    const avgMonthlyUnitsTotal =
      months.length > 0
        ? months.reduce((s, x) => s + x.totalUnits, 0) / months.length
        : 0;
    const globalActiveSkus = report?.totalActiveSkus || 18450;

    return months.map(m => ({
      ...m,
      fte: computeMonthlyFteFromBrackets(m.brackets, activeSvjRates, {
        coverageMonthsTarget,
        replenishTriggerPct,
        palletPickSecPerUnit: activeSvjRates.palletPickSecPerUnit,
        boxMoveSecPerBox,
        boxesPerWave: dynamicAbc.totalBoxesPerWave || globalActiveSkus,
        activeSkusCount: globalActiveSkus,
        avgMonthlyUnitsTotal,
        includeReplenishInTotal: includeReplenishInFte,
      }),
    }));
  }, [
    report?.monthlyBreakdown,
    report?.totalActiveSkus,
    activeSvjRates,
    coverageMonthsTarget,
    replenishTriggerPct,
    boxMoveSecPerBox,
    dynamicAbc.totalBoxesPerWave,
    includeReplenishInFte,
  ]);

  // Souhrn FTE za celý rok / průměrný měsíc / špičkový měsíc (včetně průběžného doskladňování a přesunu boxů)
  const fteSummary = useMemo(() => {
    if (enrichedMonths.length === 0) {
      return {
        avgPickFte: 0,
        avgSortFte: 0,
        avgPackFte: 0,
        avgReplenishFte: 0,
        avgBaseTotalFte: 0,
        avgTotalFte: 0,
        peakTotalFte: 0,
        peakMonthLabel: '-',
        totalYearHours: 0,
        totalPickHours: 0,
        totalSortHours: 0,
        totalPackHours: 0,
        totalReplenishHours: 0,
        totalReplenishPickHours: 0,
        totalReplenishBoxMoveHours: 0,
        totalReplenishCycles: 0,
        totalReplenishBoxMoves: 0,
      };
    }
    const n = enrichedMonths.length;
    const totalPickHours = Number(enrichedMonths.reduce((s, m) => s + m.fte.pickHours, 0).toFixed(1));
    const totalSortHours = Number(enrichedMonths.reduce((s, m) => s + m.fte.sortHours, 0).toFixed(1));
    const totalPackHours = Number(enrichedMonths.reduce((s, m) => s + m.fte.packHours, 0).toFixed(1));
    const totalReplenishHours = Number(
      enrichedMonths.reduce((s, m) => s + (m.fte.replenishHours || 0), 0).toFixed(1)
    );
    const totalReplenishPickHours = Number(
      enrichedMonths.reduce((s, m) => s + (m.fte.replenishPickHours || 0), 0).toFixed(1)
    );
    const totalReplenishBoxMoveHours = Number(
      enrichedMonths.reduce((s, m) => s + (m.fte.replenishBoxMoveHours || 0), 0).toFixed(1)
    );
    const totalReplenishCycles = enrichedMonths.reduce(
      (s, m) => s + (m.fte.replenishCycles || 0),
      0
    );
    const totalReplenishBoxMoves = enrichedMonths.reduce(
      (s, m) => s + (m.fte.replenishBoxMoves || 0),
      0
    );
    const totalYearHours = Number(
      (
        totalPickHours +
        totalSortHours +
        totalPackHours +
        (includeReplenishInFte ? totalReplenishHours : 0)
      ).toFixed(1)
    );

    const avgPickFte = Number((enrichedMonths.reduce((s, m) => s + m.fte.pickFte, 0) / n).toFixed(2));
    const avgSortFte = Number((enrichedMonths.reduce((s, m) => s + m.fte.sortFte, 0) / n).toFixed(2));
    const avgPackFte = Number((enrichedMonths.reduce((s, m) => s + m.fte.packFte, 0) / n).toFixed(2));
    const avgReplenishFte = Number(
      (enrichedMonths.reduce((s, m) => s + (m.fte.replenishFte || 0), 0) / n).toFixed(2)
    );
    const avgBaseTotalFte = Number((avgPickFte + avgSortFte + avgPackFte).toFixed(2));
    const avgTotalFte = Number(
      (avgBaseTotalFte + (includeReplenishInFte ? avgReplenishFte : 0)).toFixed(2)
    );

    let peakM = enrichedMonths[0];
    for (const m of enrichedMonths) {
      if (m.fte.totalFte > peakM.fte.totalFte) peakM = m;
    }

    return {
      avgPickFte,
      avgSortFte,
      avgPackFte,
      avgReplenishFte,
      avgBaseTotalFte,
      avgTotalFte,
      peakTotalFte: peakM.fte.totalFte,
      peakMonthLabel: isCs ? peakM.monthLabelCs : peakM.monthLabelEn,
      totalYearHours,
      totalPickHours,
      totalSortHours,
      totalPackHours,
      totalReplenishHours,
      totalReplenishPickHours,
      totalReplenishBoxMoveHours,
      totalReplenishCycles,
      totalReplenishBoxMoves,
    };
  }, [enrichedMonths, isCs, includeReplenishInFte]);

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

        <div className="flex flex-wrap items-center gap-2">
          {onExportHtml && (
            <button
              onClick={onExportHtml}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 rounded-xl font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title={isCs ? 'Uložit aktuálně zobrazený report skladu Gate s nastavenými přepínači jako HTML' : 'Save current Gate report with active switches as HTML'}
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{isCs ? 'Uložit jako HTML' : 'Save as HTML'}</span>
            </button>
          )}
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

        {/* 4. Celková skladová zásoba, 3měs. krytí & Nadzásoba */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">{isCs ? 'Celková skladová zásoba' : 'Total Warehouse Stock'}</span>
            <Archive className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-300 font-mono tabular-nums">
            {dynamicAbc.totalStockUnits.toLocaleString('cs-CZ')} <span className="text-xs font-normal text-slate-400">ks</span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{isCs ? `Zásoba ${coverageMonthsTarget}M / Nadzásoba:` : `${coverageMonthsTarget}M / Excess:`}</span>
            <span className="font-mono tabular-nums text-slate-200">
              <span className="text-emerald-400">{(dynamicAbc.coveredThreeMonthUnits / 1_000_000).toFixed(2)}M</span> /{' '}
              <span className="text-amber-300">{((dynamicAbc.excessReplenishUnits + dynamicAbc.deadStockUnits) / 1_000_000).toFixed(2)}M ks</span>
            </span>
          </div>
        </div>

        {/* 5. Potřeba pracovníků (FTE dle SVJ + průběžné doskladňování) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">{isCs ? 'Potřeba lidí (FTE vč. doskl.)' : 'Required Staff (FTE incl. Repl.)'}</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-cyan-300 font-mono tabular-nums">
            {fteSummary.avgTotalFte} <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{isCs ? 'Z toho doskl. / Špička:' : 'Replenish / Peak:'}</span>
            <span className="font-mono tabular-nums text-amber-300 font-semibold">
              {fteSummary.avgReplenishFte} / {fteSummary.peakTotalFte} FTE
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

        {/* Metodické vysvětlení + Kalibrační panel celkové zásoby (4,5M ks) a ležáků */}
        <div className="bg-slate-950/80 border border-purple-500/25 rounded-2xl p-4 space-y-4 text-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-start gap-2.5 text-slate-300">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {isCs ? (
                  <>
                    <strong className="text-white">Jak se počítá 3měsíční zásoba, nadzásoba a bezobraty:</strong> Průměrný měsíční výdej činí{' '}
                    <strong className="text-emerald-300 font-mono">
                      {Math.round(dynamicAbc.totalAnnualIssuedUnits / Math.max(1, report.monthsCount)).toLocaleString('cs-CZ')} ks/měs.
                    </strong>{' '}
                    ({dynamicAbc.totalAnnualIssuedUnits.toLocaleString('cs-CZ')} ks za {report.monthsCount} měs.). Protože soubor{' '}
                    <code className="text-purple-300">stock.csv</code> zachycuje stav skladu k 1 dni v roce a v průběhu roku se točí i sezónní SKU, je potřebná{' '}
                    <strong className="text-emerald-300">
                      {coverageMonthsTarget}měsíční aktivní zásoba aproximována přímo dle reálných měsíčních výdejů ({coverageMonthsTarget} × Ø měsíční výdej ={' '}
                      {dynamicAbc.coveredThreeMonthUnits.toLocaleString('cs-CZ')} ks)
                    </strong>
                    . Z celkové skladové zásoby{' '}
                    <strong className="text-purple-300 font-mono">{dynamicAbc.totalStockUnits.toLocaleString('cs-CZ')} ks</strong> pak zbývajících{' '}
                    <strong className="text-amber-300">{dynamicAbc.excessReplenishUnits.toLocaleString('cs-CZ')} ks</strong> tvoří nadzásobu na dokladnění a{' '}
                    <strong className="text-rose-300">{dynamicAbc.deadStockUnits.toLocaleString('cs-CZ')} ks</strong> ležáky s nulovým výdejem za rok.
                  </>
                ) : (
                  <>
                    <strong className="text-white">How Total Warehouse Stock & Excess Are Calculated:</strong> The uploaded CSVs contain outbound issues ({report.totalUnits.toLocaleString()} pcs across {report.monthsCount} months). Total physical stock is calibrated to <strong className="text-purple-300 font-mono">{dynamicAbc.totalStockUnits.toLocaleString()} pcs</strong> (editable below). Subtracting the {coverageMonthsTarget}-month demand ({dynamicAbc.coveredThreeMonthUnits.toLocaleString()} pcs) yields the excess replenishment buffer and dead stock.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {[3_500_000, 4_500_000, 5_000_000].map(preset => (
                <button
                  key={preset}
                  onClick={() => setCustomTotalStockUnits(preset)}
                  className={`px-2.5 py-1 rounded-lg font-mono tabular-nums font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    dynamicAbc.totalStockUnits === preset
                      ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {(preset / 1_000_000).toFixed(1).replace('.', ',')}M ks
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-slate-200 font-semibold block">
                {isCs ? 'Celková skladová zásoba skladem (ks):' : 'Total Physical Warehouse Stock (pcs):'}
              </label>
              <input
                type="number"
                min={0}
                step={50000}
                value={dynamicAbc.totalStockUnits}
                onChange={e => setCustomTotalStockUnits(Math.max(0, parseInt(e.target.value || '0', 10)))}
                className="w-full bg-slate-900 border border-purple-500/50 rounded-lg px-3 py-1.5 text-purple-200 font-bold font-mono tabular-nums focus:outline-none focus:border-purple-400"
              />
              <div className="text-[11px] text-slate-500">
                {isCs ? 'Výchozí: 4 500 000 ks dle informace zákazníka' : 'Default: 4,500,000 pcs per customer input'}
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
              <div className="text-[11px] text-slate-500">
                {isCs ? 'Položky na skladě, které nebyly v order_items.csv ani jednou vydány' : 'SKUs in stock with zero shipments'}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium block">
                {isCs ? 'Množina 2 – Počet kusů v SKU bez výdeje (ks):' : 'Zero-movement stock units (pcs):'}
              </label>
              <input
                type="number"
                min={0}
                step={10000}
                value={dynamicAbc.deadStockUnits}
                onChange={e => setCustomDeadUnitsCount(Math.max(0, parseInt(e.target.value || '0', 10)))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono tabular-nums focus:outline-none focus:border-purple-500"
              />
              <div className="text-[11px] text-slate-500">
                {isCs ? 'Kusy vázané v neobrátkových položkách (ležácích)' : 'Units tied up in dead stock'}
              </div>
            </div>
          </div>

          {/* Vizuální pruh rozpadu celkové zásoby 4,5M ks */}
          <div className="space-y-1.5 pt-1">
            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono tabular-nums text-slate-300 gap-2">
              <span className="font-sans font-bold text-white">
                {isCs ? 'Bilance celkové skladové zásoby:' : 'Total Stock Balance:'}{' '}
                <span className="font-mono text-purple-300">{dynamicAbc.totalStockUnits.toLocaleString('cs-CZ')} ks (100 %)</span>
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-emerald-400">
                  ● {isCs ? `${coverageMonthsTarget}měs. aktivní zásoba:` : `${coverageMonthsTarget}M Active:`}{' '}
                  {dynamicAbc.coveredThreeMonthUnits.toLocaleString('cs-CZ')} ks (
                  {dynamicAbc.totalStockUnits > 0
                    ? ((dynamicAbc.coveredThreeMonthUnits / dynamicAbc.totalStockUnits) * 100).toFixed(1)
                    : '0.0'}{' '}
                  %)
                </span>
                <span className="text-amber-300">
                  ● {isCs ? 'Nadzásoba na dokladnění:' : 'Excess Buffer:'}{' '}
                  {dynamicAbc.excessReplenishUnits.toLocaleString('cs-CZ')} ks (
                  {dynamicAbc.totalStockUnits > 0
                    ? ((dynamicAbc.excessReplenishUnits / dynamicAbc.totalStockUnits) * 100).toFixed(1)
                    : '0.0'}{' '}
                  %)
                </span>
                <span className="text-rose-400">
                  ● {isCs ? '0 výdej za rok (Ležáky):' : 'Zero-movement:'}{' '}
                  {dynamicAbc.deadStockUnits.toLocaleString('cs-CZ')} ks (
                  {dynamicAbc.totalStockUnits > 0
                    ? ((dynamicAbc.deadStockUnits / dynamicAbc.totalStockUnits) * 100).toFixed(1)
                    : '0.0'}{' '}
                  %)
                </span>
              </div>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${
                    dynamicAbc.totalStockUnits > 0
                      ? Math.min(100, (dynamicAbc.coveredThreeMonthUnits / dynamicAbc.totalStockUnits) * 100)
                      : 0
                  }%`,
                }}
              />
              <div
                className="h-full bg-amber-500 transition-all"
                style={{
                  width: `${
                    dynamicAbc.totalStockUnits > 0
                      ? Math.min(100, (dynamicAbc.excessReplenishUnits / dynamicAbc.totalStockUnits) * 100)
                      : 0
                  }%`,
                }}
              />
              <div
                className="h-full bg-rose-500 transition-all"
                style={{
                  width: `${
                    dynamicAbc.totalStockUnits > 0
                      ? Math.min(100, (dynamicAbc.deadStockUnits / dynamicAbc.totalStockUnits) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* 4 Hlavní pilíře zásob: Celková zásoba (4.5M) = 1. Zásoba na 3M + 2. Nadzásoba na dokladnění + 3. Množina 2 (0 výdej) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Pilíř 0: Celková skladová zásoba */}
          <div className="bg-slate-950/80 border border-purple-500/40 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-purple-300 font-semibold">
              <span>{isCs ? 'CELKOVÁ SKLADOVÁ ZÁSOBA' : 'TOTAL WAREHOUSE STOCK'}</span>
              <Archive className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold text-purple-300 font-mono tabular-nums">
              {dynamicAbc.totalStockUnits.toLocaleString('cs-CZ')} <span className="text-sm font-normal text-slate-400">ks</span>
            </div>
            <div className="text-xs text-slate-300 font-mono tabular-nums">
              {isCs
                ? `Celkem v ${dynamicAbc.totalCatalogSkus.toLocaleString('cs-CZ')} SKU (Ø ${(dynamicAbc.totalStockUnits / Math.max(1, dynamicAbc.totalAnnualIssuedUnits / Math.max(1, report.monthsCount))).toFixed(1)} měs. zásoby)`
                : `Across ${dynamicAbc.totalCatalogSkus.toLocaleString()} catalog SKUs`}
            </div>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              {isCs
                ? `Součet veškerého zboží na skladě = ${coverageMonthsTarget}měsíční aktivní zásoba (${dynamicAbc.coveredThreeMonthUnits.toLocaleString('cs-CZ')} ks) + celková nadzásoba a ležáky (${(dynamicAbc.excessReplenishUnits + dynamicAbc.deadStockUnits).toLocaleString('cs-CZ')} ks).`
                : 'Total physical stock across active picking locations, reserve replenishment buffer, and dead stock.'}
            </p>
          </div>

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
                ? `Rozloženo v ${dynamicAbc.coveredThreeMonthSkusCount.toLocaleString('cs-CZ')} aktivních SKU (${dynamicAbc.totalStockUnits > 0 ? ((dynamicAbc.coveredThreeMonthUnits / dynamicAbc.totalStockUnits) * 100).toFixed(1) : '0'} % skladu)`
                : `Across ${dynamicAbc.coveredThreeMonthSkusCount.toLocaleString()} active SKUs`}
            </div>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              {isCs
                ? `Množství přesně pokrývající ${coverageMonthsTarget} průměrné měsíce odbytu dle reálných výdejů z CSV (Ø měsíční výdej je ${Math.round(dynamicAbc.totalAnnualIssuedUnits / Math.max(1, report.monthsCount)).toLocaleString('cs-CZ')} ks/měs.).`
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
                ? `V ${dynamicAbc.excessReplenishSkusCount.toLocaleString('cs-CZ')} SKU (Ø ${Math.round(dynamicAbc.excessReplenishUnits / Math.max(1, dynamicAbc.excessReplenishSkusCount)).toLocaleString('cs-CZ')} ks / SKU)`
                : `Across ${dynamicAbc.excessReplenishSkusCount.toLocaleString()} SKUs`}
            </div>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              {isCs
                ? `Zásoba obrátkových položek převyšující ${coverageMonthsTarget} průměrné měsíce (${dynamicAbc.totalStockUnits > 0 ? ((dynamicAbc.excessReplenishUnits / dynamicAbc.totalStockUnits) * 100).toFixed(1) : '0'} % skladu). Určeno do rezervní zóny na dokladnění.`
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
                ? `Celkem ${dynamicAbc.deadStockSkusCount.toLocaleString('cs-CZ')} SKU s 0 ks výdejem (${dynamicAbc.classBreakdown.DEAD.skuSharePct} % SKU)`
                : `${dynamicAbc.deadStockSkusCount.toLocaleString()} SKUs with 0 units shipped`}
            </div>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
              {isCs
                ? 'Položky, které neměly za poslední rok žádný výdej ze skladu. Kandidáti na uvolnění lokací, výprodej nebo konsolidaci mimo hlavní sklad.'
                : 'SKUs with zero warehouse issues over the past year. Candidates for clearance or off-site consolidation.'}
            </p>
          </div>
        </div>

        {/* ========================================================= */}
        {/* VOLUMETRIE SKLADU: BOXY (60×40×22 CM) & PALETY (120×80×180 CM) */}
        {/* ========================================================= */}
        {dynamicAbc.volumetry && (
          <div className="bg-slate-950/90 border border-cyan-500/35 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm sm:text-base">
                  <Boxes className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    {isCs
                      ? `Volumetrie skladu: Potřeba boxů (60×40×22 cm) pro ${coverageMonthsTarget}M zásobu & Palet (120×80×180 cm) pro nadzásobu a bezobraty`
                      : `Warehouse Volumetry: Boxes (60×40×22 cm) for ${coverageMonthsTarget}M Stock & Pallets (120×80×180 cm) for Excess & Dead Stock`}
                  </span>
                </div>
                <p className="text-xs text-slate-400 max-w-4xl leading-relaxed">
                  {isCs
                    ? `1 box má rozměr 60×40×22 cm (${(dynamicAbc.volumetry.boxGrossVolumeM3 * 1000).toFixed(1)} l / ${dynamicAbc.volumetry.boxGrossVolumeM3} m³), využitelných je ${boxMaxFillPct} % (${(dynamicAbc.volumetry.boxUsableVolumeM3 * 1000).toFixed(2)} l). V každém boxu smí být max. 1 SKU (žádné mísení produktů – i 1 ks SKU zabere celý box). Nadzásoba a bezobraty jsou uloženy na paletách 120×80×180 cm (${dynamicAbc.volumetry.palletGrossVolumeM3} m³), využitelných ${palletMaxFillPct} % (${dynamicAbc.volumetry.palletUsableVolumeM3} m³). Na paletě jsou povolené produktové mixy: každé SKU je drženo pohromadě na co nejmenším počtu palet (např. 40 ks není rozeseto na 40 paletách) a neúplné palety jsou konsolidovány společně s dalšími SKU až do ${palletMaxFillPct}% kapacity.`
                    : `Boxes (60×40×22 cm = 0.0528 m³, ${boxMaxFillPct}% usable) hold max 1 SKU per box (no mixing). Excess & dead stock use pallets (120×80×180 cm = 1.728 m³, ${palletMaxFillPct}% usable) keeping each SKU consolidated on the minimum number of pallets while sharing remaining space with other SKUs.`}
                </p>
              </div>

              {/* Konfigurace využitelného objemu boxu (výchozí 80 %) a palety (výchozí 80 %) */}
              <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto text-xs">
                <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-cyan-500/30">
                  <span className="text-slate-300 font-medium">
                    {isCs ? 'Max. využití boxu:' : 'Max box fill:'}
                  </span>
                  {[70, 80, 90].map(pct => (
                    <button
                      key={pct}
                      onClick={() => setBoxMaxFillPct(pct)}
                      className={`px-2 py-0.5 rounded-md font-mono font-bold transition-colors cursor-pointer ${
                        boxMaxFillPct === pct
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {pct} %
                    </button>
                  ))}
                  <input
                    type="number"
                    min={30}
                    max={100}
                    step={5}
                    value={boxMaxFillPct}
                    onChange={e => setBoxMaxFillPct(Math.min(100, Math.max(30, parseInt(e.target.value || '80', 10))))}
                    className="w-14 bg-slate-950 border border-cyan-500/50 rounded px-1.5 py-0.5 text-right font-mono font-bold text-cyan-300 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-indigo-500/30">
                  <span className="text-slate-300 font-medium">
                    {isCs ? 'Max. využití palety:' : 'Max pallet fill:'}
                  </span>
                  {[70, 80, 90].map(pct => (
                    <button
                      key={pct}
                      onClick={() => setPalletMaxFillPct(pct)}
                      className={`px-2 py-0.5 rounded-md font-mono font-bold transition-colors cursor-pointer ${
                        palletMaxFillPct === pct
                          ? 'bg-indigo-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {pct} %
                    </button>
                  ))}
                  <input
                    type="number"
                    min={30}
                    max={100}
                    step={5}
                    value={palletMaxFillPct}
                    onChange={e => setPalletMaxFillPct(Math.min(100, Math.max(30, parseInt(e.target.value || '80', 10))))}
                    className="w-14 bg-slate-950 border border-indigo-500/50 rounded px-1.5 py-0.5 text-right font-mono font-bold text-indigo-300 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 4 Hlavní KPI karty volumetrie: 1. Boxy pro 3M zásobu, 2. Palety pro nadzásobu, 3. Palety pro bezobraty, 4. Celkem palet (Mono-SKU vs. Mix) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
              {/* 1. Potřeba boxů pro 3měsíční zásobu */}
              <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold">
                  <span>
                    {isCs
                      ? `1. POTŘEBA BOXŮ (${coverageMonthsTarget}M ZÁSOBA)`
                      : `1. BOXES NEEDED (${coverageMonthsTarget}M STOCK)`}
                  </span>
                  <span className="font-mono text-[10px] bg-cyan-500/15 text-cyan-300 px-1.5 py-0.5 rounded">
                    60×40×22 cm ({boxMaxFillPct} %)
                  </span>
                </div>
                <div className="text-2xl font-bold text-cyan-300 font-mono tabular-nums">
                  {dynamicAbc.volumetry.totalBoxesNeeded.toLocaleString('cs-CZ')}{' '}
                  <span className="text-xs font-normal text-slate-400">{isCs ? 'boxů' : 'boxes'}</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono tabular-nums">
                  {isCs
                    ? `Objem zboží: ${dynamicAbc.volumetry.totalBoxGoodsVolumeM3.toLocaleString('cs-CZ')} m³ • Ø ${dynamicAbc.volumetry.avgUnitsPerBox} ks/box`
                    : `Goods vol: ${dynamicAbc.volumetry.totalBoxGoodsVolumeM3.toLocaleString()} m³ • Avg ${dynamicAbc.volumetry.avgUnitsPerBox} pcs/box`}
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  {isCs
                    ? `1 SKU / box (bez mixu): Ø vyplnění ${dynamicAbc.volumetry.avgBoxFillOfUsablePct} % z využitelné kapacity (${dynamicAbc.volumetry.avgBoxFillOfGrossPct} % z hrubého boxu)`
                    : `Max 1 SKU/box: Avg ${dynamicAbc.volumetry.avgBoxFillOfUsablePct}% of usable capacity`}
                </div>
              </div>

              {/* 2. Palety pro nadzásobu na dokladnění (A + B + C) */}
              <div className="bg-slate-900/90 border border-amber-500/35 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-amber-300 font-semibold">
                  <span>
                    {isCs ? '2. PALETY PRO NADZÁSOBU (A+B+C)' : '2. PALLETS FOR EXCESS STOCK'}
                  </span>
                  <span className="font-mono text-[10px] bg-amber-500/15 text-amber-300 px-1.5 py-0.5 rounded">
                    120×80×180 cm
                  </span>
                </div>
                <div className="text-2xl font-bold text-amber-300 font-mono tabular-nums">
                  {dynamicAbc.volumetry.excessPalletsNeeded.toLocaleString('cs-CZ')}{' '}
                  <span className="text-xs font-normal text-slate-400">{isCs ? 'palet' : 'pallets'}</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono tabular-nums">
                  {isCs
                    ? `Pro ${dynamicAbc.excessReplenishUnits.toLocaleString('cs-CZ')} ks nadzásoby v ${dynamicAbc.excessReplenishSkusCount.toLocaleString('cs-CZ')} SKU`
                    : `For ${dynamicAbc.excessReplenishUnits.toLocaleString()} excess pcs across ${dynamicAbc.excessReplenishSkusCount.toLocaleString()} SKUs`}
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  {isCs
                    ? `A: ${dynamicAbc.classBreakdown.A.palletsForExcess.toLocaleString('cs-CZ')} pal. • B: ${dynamicAbc.classBreakdown.B.palletsForExcess.toLocaleString('cs-CZ')} pal. • C: ${dynamicAbc.classBreakdown.C.palletsForExcess.toLocaleString('cs-CZ')} pal.`
                    : `A: ${dynamicAbc.classBreakdown.A.palletsForExcess} • B: ${dynamicAbc.classBreakdown.B.palletsForExcess} • C: ${dynamicAbc.classBreakdown.C.palletsForExcess} pallets`}
                </div>
              </div>

              {/* 3. Palety pro bezobraty (Množina 2 – 0 výdej za rok) */}
              <div className="bg-slate-900/90 border border-rose-500/35 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-rose-300 font-semibold">
                  <span>
                    {isCs ? '3. PALETY PRO BEZOBRATY (0 VÝDEJ)' : '3. PALLETS FOR DEAD STOCK'}
                  </span>
                  <span className="font-mono text-[10px] bg-rose-500/15 text-rose-300 px-1.5 py-0.5 rounded">
                    {palletMaxFillPct} % = {dynamicAbc.volumetry.palletUsableVolumeM3} m³
                  </span>
                </div>
                <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums">
                  {dynamicAbc.volumetry.deadStockPalletsNeeded.toLocaleString('cs-CZ')}{' '}
                  <span className="text-xs font-normal text-slate-400">{isCs ? 'palet' : 'pallets'}</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono tabular-nums">
                  {isCs
                    ? `Pro ${dynamicAbc.deadStockUnits.toLocaleString('cs-CZ')} ks ležáků v ${dynamicAbc.deadStockSkusCount.toLocaleString('cs-CZ')} SKU (${dynamicAbc.classBreakdown.DEAD.palletVolumeM3.toLocaleString('cs-CZ')} m³)`
                    : `For ${dynamicAbc.deadStockUnits.toLocaleString()} dead stock pcs (${dynamicAbc.classBreakdown.DEAD.palletVolumeM3} m³)`}
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  {isCs
                    ? `Z toho ${dynamicAbc.classBreakdown.DEAD.monoSkuPallets.toLocaleString('cs-CZ')} čistých 1-SKU palet a ${dynamicAbc.classBreakdown.DEAD.mixedSkuPallets.toLocaleString('cs-CZ')} mix palet`
                    : `${dynamicAbc.classBreakdown.DEAD.monoSkuPallets} mono-SKU & ${dynamicAbc.classBreakdown.DEAD.mixedSkuPallets} mixed pallets`}
                </div>
              </div>

              {/* 4. Celková potřeba palet & No-Split SKU struktura */}
              <div className="bg-slate-900/90 border border-indigo-500/45 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold">
                  <span>
                    {isCs ? '4. CELKEM PALET (NADZÁSOBA + LEŽÁKY)' : '4. TOTAL PALLETS NEEDED'}
                  </span>
                  <span className="font-mono text-[10px] bg-indigo-500/20 text-indigo-200 px-1.5 py-0.5 rounded">
                    No-Split SKU
                  </span>
                </div>
                <div className="text-2xl font-bold text-indigo-300 font-mono tabular-nums">
                  {dynamicAbc.volumetry.totalPalletsNeeded.toLocaleString('cs-CZ')}{' '}
                  <span className="text-xs font-normal text-slate-400">{isCs ? 'palet celkem' : 'total pallets'}</span>
                </div>
                <div className="text-[11px] text-slate-200 font-mono tabular-nums font-semibold">
                  {isCs
                    ? `${dynamicAbc.volumetry.monoSkuPalletsCount.toLocaleString('cs-CZ')}× 1-SKU paleta • ${dynamicAbc.volumetry.mixedSkuPalletsCount.toLocaleString('cs-CZ')}× mix paleta`
                    : `${dynamicAbc.volumetry.monoSkuPalletsCount.toLocaleString()} mono-SKU • ${dynamicAbc.volumetry.mixedSkuPalletsCount.toLocaleString()} mixed`}
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  {isCs
                    ? `Ø ${dynamicAbc.volumetry.avgUnitsPerPallet.toLocaleString('cs-CZ')} ks/pal. (Ø ${dynamicAbc.volumetry.avgSkusPerPallet} SKU/pal., využití ${dynamicAbc.volumetry.avgPalletFillOfUsablePct} % z ${palletMaxFillPct}% stropu)`
                    : `Avg ${dynamicAbc.volumetry.avgUnitsPerPallet} pcs/pallet (${dynamicAbc.volumetry.avgPalletFillOfUsablePct}% of usable cap)`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* MODEL PRŮBĚŽNÉHO DOSKLADŇOVÁNÍ (POKLES POD 30 % -> 100 %) */}
        {/* ========================================================= */}
        <div className="bg-slate-950/90 border border-amber-500/35 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm sm:text-base">
                <Shuffle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {isCs
                    ? `Průběžné doskladňování ${coverageMonthsTarget}měsíční zásoby (pokles pod ${replenishTriggerPct} % → doplnění na 100 %: paletový picking + přesun boxu na pozici)`
                    : `Continuous Replenishment of ${coverageMonthsTarget}M Stock (Drop Below ${replenishTriggerPct}% → Refill to 100%: Pallet Pick + Box Putaway)`}
                </span>
              </div>
              <p className="text-xs text-slate-400 max-w-4xl leading-relaxed">
                {isCs
                  ? `Kdykoliv zásoba položky v pickovací zóně (${coverageMonthsTarget} průměrné měsíce = 100 %) klesne pod ${replenishTriggerPct} %, spustí se doskladnění z nadzásoby zpět na 100 %. Jedna doskladňovací dávka činí ${dynamicAbc.batchFractionPct} % z ${coverageMonthsTarget}měsíční zásoby (= ${dynamicAbc.batchMonthsEquivalent} průměrného měsíce odbytu). Časová náročnost a potřeba lidí (FTE) zahrnuje jak čas paletového pickingu (${activeSvjRates.palletPickSecPerUnit} s/ks), tak čas přemístění vypickovaného boxu na skladovou pozici (${boxMoveSecPerBox} s/box).`
                  : `Whenever a SKU's ${coverageMonthsTarget}-month active stock drops below ${replenishTriggerPct}%, it is replenished back to 100% (a ${dynamicAbc.batchFractionPct}% refill batch). Workforce FTE includes both pallet picking (${activeSvjRates.palletPickSecPerUnit} s/pc) and moving the picked box to its storage location (${boxMoveSecPerBox} s/box).`}
              </p>
            </div>

            {/* Nastavení prahu doskladnění (default 30 %), času paletového pickingu a sliceru pro přesun boxu (default 60 s) */}
            <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto text-xs">
              <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                <span className="text-slate-400 font-medium">
                  {isCs ? 'Práh doskladnění:' : 'Reorder point:'}
                </span>
                {[20, 30, 40].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setReplenishTriggerPct(pct)}
                    className={`px-2 py-0.5 rounded-md font-mono font-bold transition-colors cursor-pointer ${
                      replenishTriggerPct === pct
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {pct} % → 100 %
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-amber-500/30">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-300 font-medium">
                  {isCs ? 'Paletový picking (s/ks):' : 'Pallet pick (s/pc):'}
                </span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={activeSvjRates.palletPickSecPerUnit ?? 19.8}
                  onChange={e => {
                    const val = Math.max(0.5, parseFloat(e.target.value || '0'));
                    setCustomPalletPickSec(val);
                  }}
                  className="w-16 bg-slate-950 border border-amber-500/50 rounded px-2 py-0.5 text-right font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400"
                />
                {customPalletPickSec !== null && (
                  <button
                    onClick={() => setCustomPalletPickSec(null)}
                    className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                    title={isCs ? 'Vrátit na výchozí čas SVJ 6+ / paletového pickingu' : 'Reset to default SVJ 6+ pallet pick rate'}
                  >
                    {isCs ? 'Dle SVJ' : 'Reset'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* SLICER PRO POČET SEKUND NA PŘEMÍSTĚNÍ VYPICKOVANÉHO BOXU NA SKLADOVOU POZICI (DEFAULT 60 S) */}
          <div className="bg-slate-900/95 border border-cyan-500/35 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
            <div className="space-y-0.5">
              <div className="font-bold text-cyan-300 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {isCs
                    ? 'Čas na přemístění vypickovaného boxu na skladovou pozici (s/box):'
                    : 'Time to move picked replenishment box to storage location (s/box):'}
                </span>
                <span className="font-mono text-sm px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/40">
                  {boxMoveSecPerBox} s / box
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {isCs
                  ? `Každý doskladněný box (celkem ~${dynamicAbc.annualReplenishedBoxes.toLocaleString('cs-CZ')} boxů/rok, Ø ${dynamicAbc.avgMonthlyReplenishedBoxes.toLocaleString('cs-CZ')} boxů/měs.) vyžaduje po paletovém vypickování přesun a založení do regálové pozice.`
                  : `Each replenished box (~${dynamicAbc.annualReplenishedBoxes.toLocaleString()} boxes/year) requires putaway transport to its picking slot after pallet picking.`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-mono">0 s</span>
                <input
                  type="range"
                  min={0}
                  max={180}
                  step={5}
                  value={boxMoveSecPerBox}
                  onChange={e => setBoxMoveSecPerBox(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  className="w-36 sm:w-48 accent-cyan-400 cursor-pointer"
                />
                <span className="text-[11px] text-slate-400 font-mono">180 s</span>
              </div>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {[30, 60, 90, 120].map(sec => (
                  <button
                    key={sec}
                    onClick={() => setBoxMoveSecPerBox(sec)}
                    className={`px-2 py-0.5 rounded font-mono font-bold transition-colors cursor-pointer ${
                      boxMoveSecPerBox === sec
                        ? 'bg-cyan-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={600}
                  step={5}
                  value={boxMoveSecPerBox}
                  onChange={e => setBoxMoveSecPerBox(Math.max(0, parseInt(e.target.value || '0', 10)))}
                  className="w-16 bg-slate-950 border border-cyan-500/50 rounded px-2 py-0.5 text-right font-mono font-bold text-cyan-300 focus:outline-none"
                />
                <span className="text-slate-400 font-mono">s</span>
              </div>
            </div>
          </div>

          {/* 4 KPI karty průběžného doskladňování (30 % -> 100 %) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {/* 1. Velikost 1 dávky doskladnění (70 % ze 3M zásoby) */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1.5">
              <div className="text-xs text-amber-300 font-semibold">
                {isCs
                  ? `1. DÁVKA DOSKLADNĚNÍ (${replenishTriggerPct} % → 100 %)`
                  : `1. REFILL BATCH (${replenishTriggerPct}% → 100%)`}
              </div>
              <div className="text-xl font-bold text-white font-mono tabular-nums">
                {dynamicAbc.totalReplenishBatchUnits.toLocaleString('cs-CZ')}{' '}
                <span className="text-xs font-normal text-slate-400">
                  ks ({dynamicAbc.batchFractionPct} % z {coverageMonthsTarget}M)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {isCs
                  ? `Ø ${dynamicAbc.avgUnitsPerReplenishTask.toLocaleString('cs-CZ')} ks / 1 doskladnění SKU (= ${dynamicAbc.batchMonthsEquivalent} měs. odbytu)`
                  : `Avg ${dynamicAbc.avgUnitsPerReplenishTask.toLocaleString()} pcs per SKU refill (${dynamicAbc.batchMonthsEquivalent}M demand)`}
              </div>
            </div>

            {/* 2. Frekvence, cykly a počet přesunutých boxů za rok / měsíc */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1.5">
              <div className="text-xs text-teal-300 font-semibold">
                {isCs ? '2. CYKLY & PŘESUNUTÉ BOXY' : '2. CYCLES & MOVED BOXES'}
              </div>
              <div className="text-xl font-bold text-teal-300 font-mono tabular-nums">
                {dynamicAbc.annualReplenishedBoxes.toLocaleString('cs-CZ')}{' '}
                <span className="text-xs font-normal text-slate-400">
                  {isCs ? 'boxů / rok' : 'boxes / year'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {isCs
                  ? `Ø ${dynamicAbc.avgMonthlyReplenishedBoxes.toLocaleString('cs-CZ')} boxů/měs. (${dynamicAbc.totalAnnualReplenishCycles.toLocaleString('cs-CZ')} úkolů/rok, ${dynamicAbc.cyclesPerSkuPerYear}×/SKU)`
                  : `Avg ${dynamicAbc.avgMonthlyReplenishedBoxes.toLocaleString()} boxes/mo (${dynamicAbc.totalAnnualReplenishCycles.toLocaleString()} tasks/yr)`}
              </div>
            </div>

            {/* 3. Čas paletového pickingu + přesunu boxu na průběžné doskladňování */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1.5">
              <div className="text-xs text-purple-300 font-semibold">
                {isCs ? '3. ČAS DOSKLADNĚNÍ (PICK + PŘESUN)' : '3. REPLENISHMENT TIME (PICK + MOVE)'}
              </div>
              <div className="text-xl font-bold text-purple-300 font-mono tabular-nums">
                {dynamicAbc.totalReplenishHoursYear.toLocaleString('cs-CZ')}{' '}
                <span className="text-xs font-normal text-slate-400">{isCs ? 'hod / rok' : 'h / year'}</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {isCs
                  ? `Palet. pick: ${dynamicAbc.replenishPickHoursYear.toLocaleString('cs-CZ')} h + Přesun boxů (${boxMoveSecPerBox}s): ${dynamicAbc.replenishBoxMoveHoursYear.toLocaleString('cs-CZ')} h`
                  : `Pallet pick: ${dynamicAbc.replenishPickHoursYear.toLocaleString()} h + Box move (${boxMoveSecPerBox}s): ${dynamicAbc.replenishBoxMoveHoursYear.toLocaleString()} h`}
              </div>
            </div>

            {/* 4. Potřeba pracovníků (FTE) na průběžné doskladňování */}
            <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-4 space-y-1.5">
              <div className="text-xs text-amber-400 font-semibold">
                {isCs ? '4. POTŘEBA LIDÍ NA DOSKLADŇOVÁNÍ' : '4. REPLENISHMENT STAFF (FTE)'}
              </div>
              <div className="text-xl font-bold text-amber-300 font-mono tabular-nums">
                {dynamicAbc.avgMonthlyReplenishFte}{' '}
                <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                {isCs
                  ? `Ø ${dynamicAbc.avgMonthlyReplenishHours.toLocaleString('cs-CZ')} h/měs. při fondu ${monthlyFteHours} h/FTE (vč. přesunu boxů)`
                  : `Avg ${dynamicAbc.avgMonthlyReplenishHours.toLocaleString()} h/mo at ${monthlyFteHours} h/FTE norm`}
              </div>
            </div>
          </div>
        </div>

        {/* Souhrnná tabulka ABC kategorií (A, B, C, DEAD) vč. boxů, palet a průběžného doskladňování 30 % -> 100 % */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3 px-4">{isCs ? 'Kategorie ABC' : 'ABC Class'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Počet SKU' : 'SKUs Count'}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Roční výdej (ks)' : 'Annual Issue'}</th>
                <th className="py-3 px-3 text-right text-emerald-300">{isCs ? `Zásoba ${coverageMonthsTarget}M (ks)` : `${coverageMonthsTarget}M Stock`}</th>
                <th className="py-3 px-3 text-right text-cyan-300">{isCs ? `Boxy ${coverageMonthsTarget}M (60×40×22)` : `Boxes (${coverageMonthsTarget}M)`}</th>
                <th className="py-3 px-3 text-right">{isCs ? 'Celková zásoba (ks)' : 'Total Stock'}</th>
                <th className="py-3 px-3 text-right text-amber-300">{isCs ? 'Nadzásoba / Ležáky' : 'Excess / Dead'}</th>
                <th className="py-3 px-3 text-right text-indigo-300">{isCs ? 'Palety (120×80×180)' : 'Pallets Needed'}</th>
                <th className="py-3 px-3 text-right text-teal-300">{isCs ? `1 dávka ${replenishTriggerPct}%→100%` : `1 Batch ${replenishTriggerPct}%→100%`}</th>
                <th className="py-3 px-3 text-right text-purple-300">{isCs ? 'Doskladnění (hod/rok)' : 'Replenish (h/yr)'}</th>
                <th className="py-3 px-4 text-right text-amber-400 font-bold">{isCs ? 'FTE Doskladnění' : 'Replenish FTE'}</th>
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
                const isDead = row.key === 'DEAD';
                return (
                  <tr key={row.key} className="hover:bg-slate-800/40 transition-colors">
                    <td className={`py-3 px-4 font-sans font-bold ${row.color}`}>
                      {isCs ? row.labelCs : row.labelEn}
                    </td>
                    <td className="py-3 px-3 text-right text-white font-semibold">
                      {c.skusCount.toLocaleString('cs-CZ')}
                      <span className="block text-[10px] text-slate-400 font-normal">{c.skuSharePct} % SKU</span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-200">
                      {c.annualUnits.toLocaleString('cs-CZ')}
                      <span className="block text-[10px] text-slate-400">{c.unitSharePct} %</span>
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-300 font-semibold">
                      {c.coveredThreeMonthUnits.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3 text-right bg-cyan-950/15">
                      {isDead ? (
                        <span className="text-slate-600">0 boxů</span>
                      ) : (
                        <>
                          <span className="font-bold text-cyan-300">{c.boxesFor3M.toLocaleString('cs-CZ')} boxů</span>
                          <span className="block text-[10px] text-slate-400">{c.boxVolumeM3.toLocaleString('cs-CZ')} m³</span>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-white">
                      {c.currentStockUnits.toLocaleString('cs-CZ')}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-bold text-amber-400">{c.excessUnits.toLocaleString('cs-CZ')} ks</span>
                      <span className="block text-[10px] text-amber-300/80">{c.excessSkusCount.toLocaleString('cs-CZ')} SKU</span>
                    </td>
                    <td className="py-3 px-3 text-right bg-indigo-950/15">
                      <span className="font-bold text-indigo-300">{c.palletsForExcess.toLocaleString('cs-CZ')} pal.</span>
                      <span className="block text-[10px] text-slate-400">
                        {c.monoSkuPallets.toLocaleString('cs-CZ')}× 1-SKU / {c.mixedSkuPallets.toLocaleString('cs-CZ')}× mix
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-teal-300">
                      {isDead ? (
                        <span className="text-slate-600">-</span>
                      ) : (
                        <>
                          <span className="font-bold">{c.replenishBatchUnits.toLocaleString('cs-CZ')} ks</span>
                          <span className="block text-[10px] text-slate-400">Ø {c.avgSkuBatchUnits} ks/SKU</span>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-purple-300">
                      {isDead ? (
                        <span className="text-slate-600">0 h</span>
                      ) : (
                        <>
                          <span className="font-bold">{c.replenishHoursYear.toLocaleString('cs-CZ')} h</span>
                          <span className="block text-[10px] text-slate-400">
                            {c.replenishPickHoursYear ?? c.replenishHoursYear}h pick + {c.replenishBoxMoveHoursYear ?? 0}h přesun
                          </span>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-amber-300 bg-amber-950/15">
                      {isDead ? <span className="text-slate-600">0 FTE</span> : `${c.replenishFteMonthly} FTE`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-950/90 border-t-2 border-slate-700 font-mono tabular-nums font-bold text-white">
              <tr>
                <td className="py-3.5 px-4 font-sans">{isCs ? 'CELKEM KATALOG (A + B + C + Ležáky)' : 'TOTAL CATALOG'}</td>
                <td className="py-3.5 px-3 text-right">{dynamicAbc.totalCatalogSkus.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right">{dynamicAbc.totalAnnualIssuedUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right text-emerald-400">{dynamicAbc.coveredThreeMonthUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right text-cyan-300 bg-cyan-950/20">
                  {(dynamicAbc.volumetry?.totalBoxesNeeded || 0).toLocaleString('cs-CZ')} boxů
                  <span className="block text-[10px] text-cyan-200/80 font-normal">
                    {(dynamicAbc.volumetry?.totalBoxGoodsVolumeM3 || 0).toLocaleString('cs-CZ')} m³
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right">{dynamicAbc.totalStockUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-3 text-right text-amber-400">
                  {(dynamicAbc.excessReplenishUnits + dynamicAbc.deadStockUnits).toLocaleString('cs-CZ')} ks
                  <span className="block text-[10px] text-amber-300 font-normal">
                    {(dynamicAbc.excessReplenishSkusCount + dynamicAbc.deadStockSkusCount).toLocaleString('cs-CZ')} SKU
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right text-indigo-300 bg-indigo-950/20">
                  {(dynamicAbc.volumetry?.totalPalletsNeeded || 0).toLocaleString('cs-CZ')} palet
                  <span className="block text-[10px] text-indigo-200/80 font-normal">
                    {(dynamicAbc.volumetry?.monoSkuPalletsCount || 0).toLocaleString('cs-CZ')}× 1-SKU / {(dynamicAbc.volumetry?.mixedSkuPalletsCount || 0).toLocaleString('cs-CZ')}× mix
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right text-teal-300">
                  {dynamicAbc.totalReplenishBatchUnits.toLocaleString('cs-CZ')} ks
                </td>
                <td className="py-3.5 px-3 text-right text-purple-300">
                  {dynamicAbc.totalReplenishHoursYear.toLocaleString('cs-CZ')} h
                </td>
                <td className="py-3.5 px-4 text-right text-amber-300 bg-amber-950/20">
                  Ø {dynamicAbc.avgMonthlyReplenishFte} FTE
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Detailní náhled na konkrétní SKU (Nadzásoby / Top A / Ležáky) */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-300">
              {isCs ? 'Detailní rozpis konkrétních SKU (včetně volumetrie boxů a palet):' : 'Detailed SKU Breakdown (including box & pallet volumetry):'}
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
                  <th className="py-2.5 px-3">Article / Kat.</th>
                  <th className="py-2.5 px-3 text-center">ABC</th>
                  <th className="py-2.5 px-3 text-right">{isCs ? 'Objem / ks (m³)' : 'Unit Vol (m³)'}</th>
                  <th className="py-2.5 px-3 text-right">{isCs ? 'Roční výdej' : 'Annual Issue'}</th>
                  <th className="py-2.5 px-3 text-right text-emerald-300">{isCs ? `Zásoba ${coverageMonthsTarget}M` : `${coverageMonthsTarget}M Stock`}</th>
                  <th className="py-2.5 px-3 text-right text-cyan-300">{isCs ? `Boxy ${coverageMonthsTarget}M (1 SKU/box)` : 'Boxes Needed'}</th>
                  <th className="py-2.5 px-3 text-right">{isCs ? 'Celková zásoba' : 'Total Stock'}</th>
                  <th className="py-2.5 px-3 text-right text-amber-300">{isCs ? 'Nadzásoba' : 'Excess Buffer'}</th>
                  <th className="py-2.5 px-4 text-right text-indigo-300">{isCs ? 'Objem nadzásoby / Palety' : 'Excess Vol / Pallets'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                {(activeSkuTableTab === 'excess'
                  ? report.abcAnalysis.topExcessSkus
                  : activeSkuTableTab === 'active'
                  ? report.abcAnalysis.topActiveSkus
                  : report.abcAnalysis.sampleDeadSkus
                ).slice(0, 15).map(item => {
                  const targetUnits = item.abcClass === 'DEAD' ? 0 : Math.max(1, Math.round(item.avgMonthlyUnits * coverageMonthsTarget));
                  const stockUnits = item.abcClass === 'DEAD'
                    ? (dynamicAbc.hasExplicitStockFile ? item.currentStockUnits : Math.max(1, Math.round(dynamicAbc.deadStockUnits / Math.max(1, dynamicAbc.deadStockSkusCount))))
                    : Math.max(targetUnits, Math.round(item.currentStockUnits * (customTotalStockUnits === null ? 1 : dynamicAbc.skuScaleFactor)));
                  const coveredUnits = item.abcClass === 'DEAD' ? 0 : targetUnits;
                  const excessUnits = Math.max(0, stockUnits - coveredUnits);
                  const unitVol = item.unitVolumeM3 || dynamicAbc.volumetry?.avgUnitVolumeM3 || 0.00385;
                  const boxUsableVol = 0.60 * 0.40 * 0.22 * (boxMaxFillPct / 100);
                  const palletUsableVol = 1.20 * 0.80 * 1.80 * (palletMaxFillPct / 100);
                  const boxesForSku = coveredUnits > 0 ? Math.max(1, Math.ceil((coveredUnits * unitVol) / boxUsableVol)) : 0;
                  const excessVolM3 = excessUnits * unitVol;
                  const exactPalletShare = excessUnits > 0 ? Number((excessVolM3 / palletUsableVol).toFixed(2)) : 0;
                  return (
                    <tr key={item.sku} className="hover:bg-slate-800/40">
                      <td className="py-2 px-4 font-bold text-white">{item.sku}</td>
                      <td className="py-2 px-3 text-slate-400">
                        {item.articleCode}
                        {item.category && <span className="ml-1.5 text-[10px] text-slate-500">({item.category})</span>}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={
                          item.abcClass === 'A' ? 'text-emerald-400 font-bold' :
                          item.abcClass === 'B' ? 'text-blue-400 font-bold' :
                          item.abcClass === 'C' ? 'text-amber-400 font-bold' : 'text-rose-400 font-bold'
                        }>
                          {item.abcClass}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">{unitVol.toFixed(6)}</td>
                      <td className="py-2 px-3 text-right text-slate-200">{item.annualUnits.toLocaleString('cs-CZ')} ks</td>
                      <td className="py-2 px-3 text-right text-emerald-300">{coveredUnits.toLocaleString('cs-CZ')} ks</td>
                      <td className="py-2 px-3 text-right text-cyan-300 font-bold">
                        {boxesForSku > 0 ? `${boxesForSku.toLocaleString('cs-CZ')} boxů` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right text-white">{stockUnits.toLocaleString('cs-CZ')} ks</td>
                      <td className="py-2 px-3 text-right font-bold text-amber-300">{excessUnits.toLocaleString('cs-CZ')} ks</td>
                      <td className="py-2 px-4 text-right text-indigo-300">
                        {excessUnits > 0 ? `${excessVolM3.toFixed(3)} m³ (${exactPalletShare} pal.)` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* SEKCE 4: PŘEPOČET VÝKONU V MĚSÍCÍCH NA LIDI (FTE DLE SVJ + DOSKLADŇOVÁNÍ) */}
      {/* ========================================================= */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <span>
                {isCs
                  ? '4. Přepočet výkonu v jednotlivých měsících na pracovníky (FTE) podle časů SVJ a paletového doskladňování'
                  : '4. Monthly Workforce (FTE) Simulation Using SVJ Picking, Sorting, Packing & Pallet Replenishment Rates'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-4xl">
              {isCs
                ? `Model aplikuje reálné časy ze skladu SVJ (pro každou velikostní kategorii zásilek 1, 2, 3, 4, 5, 6+ ks) na měsíční strukturu objednávek skladu Gate a připočítává potřebu pracovníků na průběžné doskladňování (${replenishTriggerPct} % → 100 %) časy z paletového pickingu (${activeSvjRates.palletPickSecPerUnit} s/ks).`
                : 'Applies SVJ per-item cycle times by order bracket onto Gate monthly volume and includes continuous replenishment (30% → 100%) using pallet picking times.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto text-xs">
            <button
              onClick={() => setShowRateEditor(!showRateEditor)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 hover:border-cyan-500/50 font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>{showRateEditor ? (isCs ? 'Skrýt normočasy SVJ' : 'Hide SVJ Rates') : (isCs ? 'Zobrazit / upravit časy SVJ & Doskladnění' : 'View / Edit SVJ & Replenish Rates')}</span>
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

            {/* Započítat průběžné doskladňování (30 % -> 100 %) do celkového FTE */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">{isCs ? 'Průběžné doskladňování:' : 'Continuous replenishment:'}</span>
              <button
                onClick={() => setIncludeReplenishInFte(!includeReplenishInFte)}
                className={`px-2.5 py-1 rounded-lg border font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                  includeReplenishInFte
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {includeReplenishInFte
                  ? (isCs
                      ? `Započteno (${replenishTriggerPct}%→100%, pick ${activeSvjRates.palletPickSecPerUnit}s/ks + přesun ${boxMoveSecPerBox}s/box)`
                      : `Included (${replenishTriggerPct}%→100%, ${activeSvjRates.palletPickSecPerUnit}s/pc + ${boxMoveSecPerBox}s/box)`)
                  : (isCs ? 'Nezapočteno do CELKEM FTE' : 'Excluded from Total FTE')}
              </button>
            </div>

            {/* Slicer pro čas přesunu vypickovaného boxu na skladovou pozici (default 60 s) */}
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-lg border border-cyan-500/30">
              <span className="text-cyan-300 font-medium">
                {isCs ? 'Přesun boxu na pozici:' : 'Box move to slot:'}
              </span>
              <input
                type="range"
                min={0}
                max={180}
                step={5}
                value={boxMoveSecPerBox}
                onChange={e => setBoxMoveSecPerBox(Math.max(0, parseInt(e.target.value || '0', 10)))}
                className="w-24 accent-cyan-400 cursor-pointer"
              />
              <input
                type="number"
                min={0}
                max={600}
                step={5}
                value={boxMoveSecPerBox}
                onChange={e => setBoxMoveSecPerBox(Math.max(0, parseInt(e.target.value || '0', 10)))}
                className="w-14 bg-slate-950 border border-cyan-500/40 rounded px-1.5 py-0.5 text-right font-mono font-bold text-cyan-300"
              />
              <span className="text-slate-400 font-mono">s/box</span>
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

        {/* Volitelný editor normočasů SVJ podle velikostní kategorie zásilky + paletového pickingu pro doskladnění */}
        {showRateEditor && (
          <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300">
                {isCs
                  ? 'Použité normočasy ze skladu SVJ (sekundy na 1 kus podle velikosti objednávky) a čas paletového pickingu pro doskladnění:'
                  : 'Applied SVJ Benchmark Times (seconds per unit by order bracket) & Pallet Picking Replenishment Rate:'}
              </span>
              <button
                onClick={() => {
                  setCustomRateOverrides({});
                  setCustomPalletPickSec(null);
                  setBoxMoveSecPerBox(60);
                }}
                className="text-slate-400 hover:text-white underline cursor-pointer"
              >
                {isCs ? 'Obnovit výchozí časy SVJ (vč. 60 s/box)' : 'Reset to SVJ defaults (incl. 60s/box)'}
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
                  <tr className="bg-amber-950/15">
                    <td className="py-2 px-3 font-sans font-semibold text-amber-300">
                      {isCs
                        ? `4. Doskladňování ${replenishTriggerPct}%→100% (Paletový picking, s/ks)`
                        : `4. Replenishment ${replenishTriggerPct}%→100% (Pallet Pick, s/pc)`}
                    </td>
                    <td colSpan={6} className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-sans text-slate-400">
                          {isCs
                            ? 'Jednotný čas paletového / velkoobjemového pickingu (výchozí dle SVJ 6+):'
                            : 'Uniform pallet / bulk picking rate (default from SVJ 6+):'}
                        </span>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={activeSvjRates.palletPickSecPerUnit ?? 19.8}
                          onChange={e => {
                            const val = Math.max(0.5, parseFloat(e.target.value || '0'));
                            setCustomPalletPickSec(val);
                          }}
                          className="w-20 bg-slate-900 border border-amber-500/50 rounded px-1.5 py-0.5 text-right text-amber-300 font-bold"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr className="bg-cyan-950/15">
                    <td className="py-2 px-3 font-sans font-semibold text-cyan-300">
                      {isCs
                        ? '5. Přemístění vypickovaného boxu na skladovou pozici (s/box)'
                        : '5. Move picked box to storage location (s/box)'}
                    </td>
                    <td colSpan={6} className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className="font-sans text-slate-400">
                          {isCs
                            ? 'Čas přesunu a založení 1 doskladňovaného boxu na pozici (výchozí 60 s):'
                            : 'Putaway move time per replenished box (default 60 s):'}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={180}
                          step={5}
                          value={boxMoveSecPerBox}
                          onChange={e => setBoxMoveSecPerBox(Math.max(0, parseInt(e.target.value || '0', 10)))}
                          className="w-28 accent-cyan-400 cursor-pointer"
                        />
                        <input
                          type="number"
                          step="5"
                          min="0"
                          max="600"
                          value={boxMoveSecPerBox}
                          onChange={e => setBoxMoveSecPerBox(Math.max(0, parseInt(e.target.value || '0', 10)))}
                          className="w-20 bg-slate-900 border border-cyan-500/50 rounded px-1.5 py-0.5 text-right text-cyan-300 font-bold"
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5 Karet průměrné roční potřeby FTE podle činností (vč. průběžného doskladňování) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
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

          <div className="bg-slate-950/80 border border-amber-500/35 rounded-xl p-4">
            <div className="text-xs text-amber-300 font-semibold">
              {isCs ? `4. DOSKLADŇOVÁNÍ (${replenishTriggerPct}%→100%)` : `4. REPLENISHMENT (${replenishTriggerPct}%→100%)`}
            </div>
            <div className="mt-1.5 text-2xl font-bold text-amber-300 font-mono tabular-nums">
              {fteSummary.avgReplenishFte} <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
            </div>
            <div className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
              {isCs
                ? `${fteSummary.totalReplenishHours.toLocaleString('cs-CZ')} h/rok (${fteSummary.totalReplenishPickHours.toLocaleString('cs-CZ')}h pick + ${fteSummary.totalReplenishBoxMoveHours.toLocaleString('cs-CZ')}h přesun boxů)`
                : `Total ${fteSummary.totalReplenishHours.toLocaleString()} h/yr (${fteSummary.totalReplenishPickHours}h pick + ${fteSummary.totalReplenishBoxMoveHours}h box move)`}
            </div>
          </div>

          <div className="bg-slate-950/80 border border-cyan-500/40 rounded-xl p-4">
            <div className="text-xs text-cyan-300 font-semibold">
              {isCs
                ? includeReplenishInFte
                  ? 'CELKEM PRACOVNÍKŮ (vč. doskl.)'
                  : 'CELKEM PRACOVNÍKŮ (bez doskl.)'
                : 'TOTAL STAFF (FTE)'}
            </div>
            <div className="mt-1.5 text-2xl font-bold text-cyan-300 font-mono tabular-nums">
              {fteSummary.avgTotalFte} <span className="text-xs font-normal text-slate-400">FTE / měs.</span>
            </div>
            <div className="mt-1 text-xs text-amber-300 font-mono tabular-nums">
              {isCs ? `Špička: ${fteSummary.peakTotalFte} FTE (${fteSummary.peakMonthLabel})` : `Peak: ${fteSummary.peakTotalFte} FTE`}
            </div>
          </div>
        </div>

        {/* Měsíční tabulka přepočtu výkonu na hodiny a FTE pracovníky (včetně doskladňování paletovým pickingem) */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold">
              <tr>
                <th className="py-3 px-4">{isCs ? 'Měsíc' : 'Month'}</th>
                <th className="py-3 px-2.5 text-right">{isCs ? 'Objednávky' : 'Orders'}</th>
                <th className="py-3 px-2.5 text-right">{isCs ? 'Kusy celkem' : 'Total Units'}</th>
                <th className="py-3 px-2.5 text-right text-indigo-300">{isCs ? 'Picking (hod)' : 'Pick (h)'}</th>
                <th className="py-3 px-2.5 text-right text-indigo-400 font-bold">{isCs ? 'FTE Pick' : 'Pick FTE'}</th>
                <th className="py-3 px-2.5 text-right text-purple-300">{isCs ? 'Sorting (hod)' : 'Sort (h)'}</th>
                <th className="py-3 px-2.5 text-right text-purple-400 font-bold">{isCs ? 'FTE Sort' : 'Sort FTE'}</th>
                <th className="py-3 px-2.5 text-right text-emerald-300">{isCs ? 'Packing (hod)' : 'Pack (h)'}</th>
                <th className="py-3 px-2.5 text-right text-emerald-400 font-bold">{isCs ? 'FTE Pack' : 'Pack FTE'}</th>
                <th className="py-3 px-2.5 text-right text-amber-300">{isCs ? 'Cykly doskl.' : 'Refill Cycles'}</th>
                <th className="py-3 px-2.5 text-right text-amber-300">{isCs ? 'Doskl. (hod)' : 'Repl. (h)'}</th>
                <th className="py-3 px-2.5 text-right text-amber-400 font-bold">{isCs ? 'FTE Doskl.' : 'Repl. FTE'}</th>
                <th className="py-3 px-2.5 text-right text-slate-200">{isCs ? 'Celkem hodin' : 'Total Hours'}</th>
                <th className="py-3 px-4 text-right text-cyan-300 font-bold">{isCs ? 'CELKEM FTE (lidí)' : 'TOTAL FTE'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {enrichedMonths.map(m => (
                <tr key={m.month} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-sans font-semibold text-white whitespace-nowrap">
                    {isCs ? m.monthLabelCs : m.monthLabelEn}
                  </td>
                  <td className="py-3 px-2.5 text-right text-slate-300">
                    {m.totalOrders.toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-3 px-2.5 text-right text-slate-300">
                    {m.totalUnits.toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-3 px-2.5 text-right text-slate-400">
                    {m.fte.pickHours.toLocaleString('cs-CZ')} h
                  </td>
                  <td className="py-3 px-2.5 text-right font-bold text-indigo-300 bg-indigo-950/15">
                    {m.fte.pickFte} FTE
                  </td>
                  <td className="py-3 px-2.5 text-right text-slate-400">
                    {m.fte.sortHours.toLocaleString('cs-CZ')} h
                  </td>
                  <td className="py-3 px-2.5 text-right font-bold text-purple-300 bg-purple-950/15">
                    {m.fte.sortFte} FTE
                  </td>
                  <td className="py-3 px-2.5 text-right text-slate-400">
                    {m.fte.packHours.toLocaleString('cs-CZ')} h
                  </td>
                  <td className="py-3 px-2.5 text-right font-bold text-emerald-300 bg-emerald-950/15">
                    {m.fte.packFte} FTE
                  </td>
                  <td className="py-3 px-2.5 text-right text-amber-200/80">
                    {(m.fte.replenishCycles || 0).toLocaleString('cs-CZ')}×
                  </td>
                  <td className="py-3 px-2.5 text-right text-slate-400">
                    {(m.fte.replenishHours || 0).toLocaleString('cs-CZ')} h
                  </td>
                  <td className="py-3 px-2.5 text-right font-bold text-amber-300 bg-amber-950/15">
                    {m.fte.replenishFte || 0} FTE
                  </td>
                  <td className="py-3 px-2.5 text-right text-white font-semibold">
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
                <td className="py-3.5 px-2.5 text-right">{report.totalOrders.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-2.5 text-right">{report.totalUnits.toLocaleString('cs-CZ')}</td>
                <td className="py-3.5 px-2.5 text-right text-slate-300">{fteSummary.totalPickHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-2.5 text-right text-indigo-300">Ø {fteSummary.avgPickFte} FTE</td>
                <td className="py-3.5 px-2.5 text-right text-slate-300">{fteSummary.totalSortHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-2.5 text-right text-purple-300">Ø {fteSummary.avgSortFte} FTE</td>
                <td className="py-3.5 px-2.5 text-right text-slate-300">{fteSummary.totalPackHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-2.5 text-right text-emerald-300">Ø {fteSummary.avgPackFte} FTE</td>
                <td className="py-3.5 px-2.5 text-right text-amber-200">{fteSummary.totalReplenishCycles.toLocaleString('cs-CZ')}×</td>
                <td className="py-3.5 px-2.5 text-right text-slate-300">{fteSummary.totalReplenishHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-2.5 text-right text-amber-300">Ø {fteSummary.avgReplenishFte} FTE</td>
                <td className="py-3.5 px-2.5 text-right text-white">{fteSummary.totalYearHours.toLocaleString('cs-CZ')} h</td>
                <td className="py-3.5 px-4 text-right text-cyan-300 text-sm">Ø {fteSummary.avgTotalFte} FTE</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
};
