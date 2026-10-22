import {
  MovementRecord,
  FilterState,
  ItemBracket,
  BracketStat,
  DailyPerformanceReport,
  MultipickSimulationReport,
  SimulationBracketResult,
  PeriodSummary,
  WarehouseComparisonReport,
  WarehouseComparisonBracket,
} from '../types.js';
import {
  computeBracketStatistics,
  computeDailyPerformanceReport,
  computeBoxSynergyAndHypothesis,
  runMultipickSlotSimulation,
  computePeriodSummary,
  computeWarehouseComparison,
  formatTimeValue,
  formatDurationHuman,
  getBracketLabel,
} from './analytics.js';

export interface HtmlReportData {
  records: MovementRecord[];
  ruseRecords?: MovementRecord[];
  svjRecords?: MovementRecord[];
  filter: FilterState;
  unit: 'sec' | 'min';
  lang: 'cs' | 'en';
  warehouse?: string;
  cachedAnalytics?: any;
  comparisonReport?: WarehouseComparisonReport | null;
  ruseAnalytics?: any;
  svjAnalytics?: any;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatHoursOrMins(seconds: number): string {
  if (seconds <= 0) return '0 min';
  const hours = seconds / 3600;
  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

export function generateHtmlReport(data: HtmlReportData): string {
  const { records, filter, unit, lang, warehouse, cachedAnalytics } = data;
  const isCs = lang === 'cs';

  // Pokud je aktivní záložka srovnání skladů (summary / all), generujeme speciální srovnávací report Ruse vs SVJ
  if (warehouse === 'summary' || warehouse === 'all' || (cachedAnalytics?.warehouse === 'all' && warehouse !== 'ruse' && warehouse !== 'svj')) {
    return generateComparisonHtmlReport(data);
  }

  // VŽDY prioritně používáme data přímo z databázové mezipaměti / serveru, pokud jsou k dispozici
  const bracketStats: BracketStat[] = cachedAnalytics?.bracketStats?.length
    ? cachedAnalytics.bracketStats
    : computeBracketStatistics(records);
  const synergyData: any = cachedAnalytics?.synergyData
    ? cachedAnalytics.synergyData
    : computeBoxSynergyAndHypothesis(records);
  const dailyReport: DailyPerformanceReport = cachedAnalytics?.dailyReport
    ? cachedAnalytics.dailyReport
    : computeDailyPerformanceReport(records);
  const simulation: MultipickSimulationReport = cachedAnalytics?.simulation
    ? cachedAnalytics.simulation
    : runMultipickSlotSimulation(records);
  const periodSummary: PeriodSummary = cachedAnalytics?.periodSummary
    ? cachedAnalytics.periodSummary
    : computePeriodSummary(records);
  const svjSorting = cachedAnalytics?.svjSorting || null;
  const svjBypassAnalysis = cachedAnalytics?.svjBypassAnalysis || null;

  const allStat = bracketStats.find((b: BracketStat) => b.bracket === 'all') || bracketStats[0];

  const hasSorting = warehouse === 'svj' || Boolean(svjSorting || (allStat?.avgSortPerItemSec && allStat.avgSortPerItemSec > 0) || periodSummary?.hasSorting);
  const avgSortPerItem = allStat?.avgSortPerItemSec || svjSorting?.avgSortPerItemSec || periodSummary?.avgSortPerItemSec || 0;
  const medianSortPerItem = allStat?.medianSortPerItemSec || svjSorting?.medianSortPerItemSec || periodSummary?.medianSortPerItemSec || 0;

  const totalOrders = periodSummary?.totalOrders || cachedAnalytics?.recordCount || allStat?.shipmentCount || records.length;
  const totalUnits = periodSummary?.totalUnits || cachedAnalytics?.totalUnits || allStat?.itemCount || records.reduce((sum, r) => sum + (r.pocet_produktu || 1), 0);
  const totalSortSec = Math.round(avgSortPerItem * (svjSorting?.totalUnitsSorted || totalUnits));
  const avgPickPerItem = allStat?.avgPickPerItemSec || (records.length > 0 ? records.reduce((sum, r) => sum + r.pick_duration_s, 0) / Math.max(1, totalUnits) : 0);
  const avgPackPerItem = allStat?.avgPackPerItemSec || (records.length > 0 ? records.reduce((sum, r) => sum + r.pack_duration_s, 0) / Math.max(1, totalUnits) : 0);
  const totalPickSec = Math.round(avgPickPerItem * totalUnits);
  const totalPackSec = Math.round(avgPackPerItem * totalUnits);

  const medianPickPerItem = allStat?.medianPickPerItemSec || avgPickPerItem;
  const medianPackPerItem = allStat?.medianPackPerItemSec || avgPackPerItem;
  const avgTotalPerItem = hasSorting
    ? Number((avgPickPerItem + avgSortPerItem + avgPackPerItem).toFixed(1))
    : Number((avgPickPerItem + avgPackPerItem).toFixed(1));

  const medianTotalPerItem = hasSorting
    ? Number((medianPickPerItem + medianSortPerItem + medianPackPerItem).toFixed(1))
    : Number((medianPickPerItem + medianPackPerItem).toFixed(1));

  const warehouseTitle = warehouse === 'ruse'
    ? (isCs ? 'Sklad Ruse' : 'Ruse Warehouse')
    : warehouse === 'svj'
    ? (isCs ? 'Sklad SVJ' : 'SVJ Warehouse')
    : (isCs ? 'Všechny sklady (Souhrn)' : 'All Warehouses (Summary)');

  const generatedDate = new Date();
  const formattedGenDate = generatedDate.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const periodLabelMap: Record<string, string> = {
    all: isCs ? 'Celé období' : 'All time',
    '30days': isCs ? 'Posledních 30 dní' : 'Last 30 days',
    '14days': isCs ? 'Posledních 14 dní' : 'Last 14 days',
    '7days': isCs ? 'Posledních 7 dní' : 'Last 7 days',
    today: isCs ? 'Dnes' : 'Today',
    custom: isCs
      ? `Vlastní (${filter.dateFrom || '–'} až ${filter.dateTo || '–'})`
      : `Custom (${filter.dateFrom || '–'} to ${filter.dateTo || '–'})`,
  };

  const bracketLabelMap: Record<string, string> = {
    all: isCs ? 'Všechny velikosti zásilek' : 'All shipment sizes',
    '1': isCs ? '1 kus (Single-item)' : '1 item',
    '2': isCs ? '2 kusy' : '2 items',
    '3': isCs ? '3 kusy' : '3 items',
    '4': isCs ? '4 kusy' : '4 items',
    '5': isCs ? '5 kusů' : '5 items',
    '6+': isCs ? '6 a více kusů (Multi-item)' : '6+ items',
  };

  const { highOverlapBoxes: high, mediumOverlapBoxes: med, lowOverlapBoxes: low, bracketComparisons } = synergyData.hypothesis;
  const simDetailed: SimulationBracketResult[] = simulation.bracketResults.filter((b: SimulationBracketResult) => b.bracket !== 'all');
  const simAll: SimulationBracketResult = simulation.bracketResults.find((b: SimulationBracketResult) => b.bracket === 'all') || simulation.bracketResults[simulation.bracketResults.length - 1];

  return `<!DOCTYPE html>
<html lang="${isCs ? 'cs' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isCs ? 'Skladový Report: Analýza Pick & Pack Expedice' : 'Warehouse Pick & Pack Performance Report'}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #0f172a;
      --card-border: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #4f46e5;
      --accent-light: #6366f1;
      --cyan: #06b6d4;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #ef4444;
      --purple: #8b5cf6;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 1240px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    /* Header styling */
    .report-header {
      background: linear-gradient(135deg, rgba(30, 27, 75, 0.8), rgba(15, 23, 42, 0.95));
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 24px 28px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }

    .brand-title {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-badge {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 20px;
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.3);
      letter-spacing: 0.5px;
    }

    .report-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .btn-print {
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: white;
      border: none;
      padding: 9px 18px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }

    .btn-print:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    /* Filter Metadata Bar */
    .filter-meta-bar {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 16px 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 16px;
      font-size: 12px;
    }

    .filter-label {
      color: var(--text-muted);
      font-weight: 500;
    }

    .meta-tag {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid #334155;
      padding: 4px 10px;
      border-radius: 8px;
      color: #cbd5e1;
      font-weight: 600;
    }

    .meta-tag strong {
      color: #ffffff;
    }

    /* Section Headings */
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .section-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 16px;
    }

    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .kpi-card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .kpi-card-value {
      font-size: 26px;
      font-weight: 800;
      color: #ffffff;
      margin-top: 6px;
      letter-spacing: -0.5px;
    }

    .kpi-card-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Cards & Tables */
    .content-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
      margin-top: 12px;
    }

    th {
      background: rgba(15, 23, 42, 0.9);
      color: #94a3b8;
      font-weight: 600;
      padding: 10px 12px;
      border-bottom: 2px solid #334155;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }

    td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.6);
      color: #e2e8f0;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

    /* Bracket Comparison Cards */
    .bracket-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }

    .bracket-tile {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 14px;
      text-align: center;
    }

    .bracket-tile-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
      margin-bottom: 8px;
    }

    .bracket-tile-val {
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
    }

    .bracket-tile-label {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Distribution bar */
    .distribution-bar {
      width: 100%;
      height: 12px;
      background: #1e293b;
      border-radius: 9999px;
      display: flex;
      overflow: hidden;
      margin: 10px 0;
      border: 1px solid #334155;
    }

    .dist-bar-seg {
      height: 100%;
      transition: width 0.3s;
    }

    /* 3 Category Cards */
    .category-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin: 16px 0;
    }

    .category-card {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Simulation 4 KPI Grid */
    .sim-kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin: 18px 0;
    }

    .sim-kpi-card {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 18px 20px;
    }

    .sim-kpi-card-highlight {
      background: linear-gradient(135deg, rgba(6, 78, 59, 0.3), rgba(15, 23, 42, 0.9));
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    /* Volumetric banner */
    .volumetric-banner {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 14px 18px;
      margin-bottom: 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
    }

    /* Visual comparison chart bar */
    .vis-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 12px;
    }
    .vis-label { width: 90px; font-weight: 600; color: #cbd5e1; }
    .vis-bar-wrapper { flex: 1; height: 16px; background: #1e293b; border-radius: 8px; overflow: hidden; display: flex; }
    .vis-bar-fill-base { height: 100%; background: #64748b; }
    .vis-bar-fill-opt { height: 100%; background: #10b981; }
    .vis-val { width: 90px; text-align: right; font-family: monospace; font-weight: 700; }

    .footer {
      text-align: center;
      font-size: 12px;
      color: #64748b;
      padding: 24px 0 12px;
      border-top: 1px solid var(--card-border);
    }

    /* Print media optimization */
    @media print {
      body {
        background: #ffffff !important;
        color: #0f172a !important;
        padding: 0 !important;
      }
      .btn-print { display: none !important; }
      .container { max-width: 100% !important; gap: 16px !important; }
      .report-header, .filter-meta-bar, .content-box, .kpi-card, .category-card, .sim-kpi-card {
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        box-shadow: none !important;
        color: #0f172a !important;
      }
      .brand-title, .section-title, .kpi-card-value, .bracket-tile-val, strong {
        color: #0f172a !important;
      }
      th {
        background: #f1f5f9 !important;
        color: #475569 !important;
        border-bottom: 2px solid #94a3b8 !important;
      }
      td {
        color: #1e293b !important;
        border-bottom: 1px solid #e2e8f0 !important;
      }
      .meta-tag, .bracket-tile {
        background: #f8fafc !important;
        border: 1px solid #cbd5e1 !important;
        color: #1e293b !important;
      }
    }
  </style>
</head>
<body>

<div class="container">
  <!-- Report Header -->
  <header class="report-header">
    <div>
      <div class="brand-title">
        <span>Warehouse Pick &amp; Pack Analytics</span>
        <span class="brand-badge">${escapeHtml(warehouseTitle)}</span>
        <span class="brand-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.3);">${isCs ? 'Databázový Export' : 'Database Export'}</span>
      </div>
      <div class="report-subtitle">
        ${isCs ? 'Analytický a optimalizační report expedice skladu načtený přímo z databáze' : 'Warehouse fulfillment & optimization report loaded directly from database'} • 
        ${isCs ? 'Vygenerováno' : 'Generated'}: <strong>${escapeHtml(formattedGenDate)}</strong>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn-print" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        <span>${isCs ? 'Tisknout / Uložit PDF' : 'Print / Save PDF'}</span>
      </button>
    </div>
  </header>

  <!-- Filter & Metadata Info -->
  <div class="filter-meta-bar">
    <span class="filter-label">${isCs ? 'Aplikované filtry:' : 'Active filters:'}</span>
    <span class="meta-tag" style="background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.4); color: #a5b4fc;">${isCs ? 'Sklad' : 'Warehouse'}: <strong>${escapeHtml(warehouseTitle)}</strong></span>
    <span class="meta-tag">${isCs ? 'Období' : 'Period'}: <strong>${escapeHtml(periodLabelMap[filter.datePreset] || filter.datePreset)}</strong></span>
    <span class="meta-tag">${isCs ? 'Velikost' : 'Size'}: <strong>${escapeHtml(bracketLabelMap[filter.bracket] || filter.bracket)}</strong></span>
    <span class="meta-tag">${isCs ? 'Jednotka' : 'Unit'}: <strong>${unit === 'sec' ? (isCs ? 'Sekundy (s)' : 'Seconds') : (isCs ? 'Minuty (min)' : 'Minutes')}</strong></span>
    <span class="meta-tag">${isCs ? 'Odlehlé hodnoty' : 'Outliers'}: <strong>${filter.excludeOutliers ? (isCs ? 'Vynechány (>30 min)' : 'Excluded (>30 min)') : (isCs ? 'Zahrnuty' : 'Included')}</strong></span>
    ${filter.searchBox ? `<span class="meta-tag">${isCs ? 'Box' : 'Box'}: <strong>${escapeHtml(filter.searchBox)}</strong></span>` : ''}
    ${filter.searchQuery ? `<span class="meta-tag">${isCs ? 'Hledání' : 'Query'}: <strong>${escapeHtml(filter.searchQuery)}</strong></span>` : ''}
    <span class="meta-tag" style="margin-left: auto;">${isCs ? 'Zahrnuto záznamů' : 'Records count'}: <strong>${totalOrders.toLocaleString('cs-CZ')}</strong> (${totalUnits.toLocaleString('cs-CZ')} ${isCs ? 'ks' : 'units'})</span>
  </div>

  <!-- Executive Period Summary (Zkoumané období, objednávky, SKU, kusy, průměr ks/zásilku, medián obj./box) -->
  <section class="content-box" style="background: linear-gradient(135deg, rgba(30, 27, 75, 0.45), rgba(15, 23, 42, 0.95)); border: 1px solid rgba(99, 102, 241, 0.35);">
    <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 12px;">
      <div>
        <div style="font-size: 16px; font-weight: 800; color: #ffffff;">
          ${isCs ? 'Sumární info za zkoumané období' : 'Executive Period Summary'}
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
          ${isCs ? 'Klíčová bilance objemu zakázek, sortimentní šíře (SKU) a hustoty konsolidace do balicích boxů' : 'Overview of dispatched orders, SKU diversity, item volume, and crate consolidation density'}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; background: rgba(15, 23, 42, 0.8); border: 1px solid #334155; padding: 6px 12px; border-radius: 10px;">
        <span>📅 ${escapeHtml(periodSummary.dateFrom || '–')} – ${escapeHtml(periodSummary.dateTo || '–')}</span>
        <span style="color: var(--text-muted);">(${periodSummary.daysCount} ${isCs ? (periodSummary.daysCount === 1 ? 'den' : periodSummary.daysCount < 5 ? 'dny' : 'dní') : 'days'})</span>
      </div>
    </div>

    <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
      <div class="kpi-card" style="border-color: rgba(59, 130, 246, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Objednávky celkem' : 'Total Orders'}</div>
        <div class="kpi-card-value" style="color: #60a5fa;">${periodSummary.totalOrders.toLocaleString('cs-CZ')}</div>
        <div class="kpi-card-sub">${isCs ? 'Vyexpedovaných zásilek' : 'Dispatched shipments'}</div>
      </div>

      <div class="kpi-card" style="border-color: rgba(168, 85, 247, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Zpracováno SKU' : 'Processed SKUs'}</div>
        <div class="kpi-card-value" style="color: #c084fc;">${periodSummary.totalSkus.toLocaleString('cs-CZ')}</div>
        <div class="kpi-card-sub">${isCs ? 'Unikátních EAN položek' : 'Unique product EANs'}</div>
      </div>

      <div class="kpi-card" style="border-color: rgba(16, 185, 129, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Zpracovaných kusů (ks)' : 'Total Units'}</div>
        <div class="kpi-card-value" style="color: #34d399;">${periodSummary.totalUnits.toLocaleString('cs-CZ')}</div>
        <div class="kpi-card-sub">${Math.round(periodSummary.totalUnits / Math.max(1, periodSummary.daysCount)).toLocaleString('cs-CZ')} ${isCs ? 'ks / den' : 'units / day'}</div>
      </div>

      <div class="kpi-card" style="border-color: rgba(245, 158, 11, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Průměr ks / zásilka' : 'Avg Units / Order'}</div>
        <div class="kpi-card-value" style="color: #fbbf24;">${periodSummary.avgUnitsPerOrder} <span style="font-size: 14px; font-weight: 500; color: var(--text-muted);">${isCs ? 'ks' : 'units'}</span></div>
        <div class="kpi-card-sub">${isCs ? 'Průměrná velikost košíku' : 'Average order basket'}</div>
      </div>

      <div class="kpi-card" style="border-color: rgba(99, 102, 241, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Medián obj. v 1 boxu' : 'Median Orders / Box'}</div>
        <div class="kpi-card-value" style="color: #818cf8;">${periodSummary.medianOrdersPerBox} <span style="font-size: 14px; font-weight: 500; color: var(--text-muted);">${isCs ? 'obj.' : 'orders'}</span></div>
        <div class="kpi-card-sub">${isCs ? `Průměr: ${periodSummary.avgOrdersPerBox} obj. (${periodSummary.totalBoxesCount} boxů)` : `Mean: ${periodSummary.avgOrdersPerBox} (${periodSummary.totalBoxesCount} crates)`}</div>
      </div>
    </div>

    ${hasSorting ? `
    <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(168, 85, 247, 0.3);">
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; background: rgba(168, 85, 247, 0.25); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); text-transform: uppercase;">
            ${isCs ? 'SVJ Procesní rozpad na 1 ks' : 'SVJ Fulfillment Breakdown'}
          </span>
          <span style="font-size: 12px; font-weight: 600; color: #e2e8f0;">
            ${isCs ? 'Celkový čas na 1 ks = Pickování + Sortování + Balení' : 'Total Time = Picking + Sorting + Packing'}
          </span>
        </div>
        <span style="font-size: 11px; color: #c084fc; font-family: monospace;">
          ${isCs ? 'Včetně mezioperačního sortingu ze sběrných boxů' : 'Including batch tote sorting'}
        </span>
      </div>

      <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin-bottom: 10px;">
        <div class="kpi-card" style="padding: 12px 14px; border-color: rgba(99, 102, 241, 0.3);">
          <div class="kpi-card-title" style="color: #a5b4fc;">${isCs ? '1. Pickování' : '1. Picking'}</div>
          <div class="kpi-card-value" style="font-size: 20px; color: #ffffff;">${formatTimeValue(medianPickPerItem, unit)} <span style="font-size: 11px; color: #818cf8;">${isCs ? 'medián' : 'med'}</span></div>
          <div class="kpi-card-sub">${isCs ? 'Průměr (Ø):' : 'Mean (Ø):'} ${formatTimeValue(avgPickPerItem, unit)}</div>
        </div>

        <div class="kpi-card" style="padding: 12px 14px; border-color: rgba(168, 85, 247, 0.4); background: rgba(88, 28, 135, 0.2);">
          <div class="kpi-card-title" style="color: #c084fc;">${isCs ? '2. Sortování' : '2. Sorting'}</div>
          <div class="kpi-card-value" style="font-size: 20px; color: #c084fc;">${formatTimeValue(medianSortPerItem, unit)} <span style="font-size: 11px; color: #e9d5ff;">${isCs ? 'medián' : 'med'}</span></div>
          <div class="kpi-card-sub">${isCs ? 'Průměr (Ø):' : 'Mean (Ø):'} ${formatTimeValue(avgSortPerItem, unit)}</div>
        </div>

        <div class="kpi-card" style="padding: 12px 14px; border-color: rgba(16, 185, 129, 0.3);">
          <div class="kpi-card-title" style="color: #6ee7b7;">${isCs ? '3. Ruční balení' : '3. Packing'}</div>
          <div class="kpi-card-value" style="font-size: 20px; color: #ffffff;">${formatTimeValue(medianPackPerItem, unit)} <span style="font-size: 11px; color: #34d399;">${isCs ? 'medián' : 'med'}</span></div>
          <div class="kpi-card-sub">${isCs ? 'Průměr (Ø):' : 'Mean (Ø):'} ${formatTimeValue(avgPackPerItem, unit)}</div>
        </div>

        <div class="kpi-card" style="padding: 12px 14px; border-color: rgba(168, 85, 247, 0.5); background: linear-gradient(135deg, rgba(88, 28, 135, 0.3), rgba(30, 27, 75, 0.5));">
          <div class="kpi-card-title" style="color: #e9d5ff;">${isCs ? 'Celkem na 1 kus' : 'Total / Item'}</div>
          <div class="kpi-card-value" style="font-size: 20px; color: #e9d5ff;">${formatTimeValue(medianTotalPerItem, unit)} <span style="font-size: 11px; color: #c084fc;">${isCs ? 'medián' : 'med'}</span></div>
          <div class="kpi-card-sub">${isCs ? 'Průměr (Ø):' : 'Mean (Ø):'} ${formatTimeValue(avgTotalPerItem, unit)}</div>
        </div>
      </div>

      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid #334155; padding: 8px 14px; border-radius: 10px; font-family: monospace; font-size: 11px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px;">
        <span style="color: var(--text-muted); font-family: sans-serif; font-weight: 600;">${isCs ? 'Vzorec pro 1 kus:' : 'Formula per item:'}</span>
        <div>
          <span style="color: #a5b4fc;">Pick (${formatTimeValue(medianPickPerItem, unit)} / Ø ${formatTimeValue(avgPickPerItem, unit)})</span>
          <span style="color: #c084fc; font-weight: bold;"> + </span>
          <span style="color: #c084fc;">Sort (${formatTimeValue(medianSortPerItem, unit)} / Ø ${formatTimeValue(avgSortPerItem, unit)})</span>
          <span style="color: #c084fc; font-weight: bold;"> + </span>
          <span style="color: #6ee7b7;">Pack (${formatTimeValue(medianPackPerItem, unit)} / Ø ${formatTimeValue(avgPackPerItem, unit)})</span>
          <span style="color: #c084fc; font-weight: bold;"> = </span>
          <strong style="color: #e9d5ff; background: rgba(168, 85, 247, 0.25); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(168, 85, 247, 0.35);">${isCs ? 'Celkem' : 'Total'}: ${formatTimeValue(medianTotalPerItem, unit)} (Ø ${formatTimeValue(avgTotalPerItem, unit)})</strong>
        </div>
      </div>
    </div>
    ` : ''}
  </section>

  <!-- KPI Overview -->
  <section>
    <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
      <div class="kpi-card">
        <div class="kpi-card-title">${isCs ? 'Celkem vyřízených zásilek' : 'Total shipments'}</div>
        <div class="kpi-card-value">${totalOrders.toLocaleString('cs-CZ')}</div>
        <div class="kpi-card-sub">${totalUnits.toLocaleString('cs-CZ')} ${isCs ? 'expedovaných kusů' : 'shipped items'}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-card-title">${isCs ? 'Doba pickování na 1 produkt' : 'Picking Time per Item'}</div>
        <div class="kpi-card-value" style="color: #60a5fa;">${formatTimeValue(medianPickPerItem, unit)} <span style="font-size: 12px; color: #818cf8;">${isCs ? 'medián' : 'med'}</span></div>
        <div class="kpi-card-sub">${isCs ? `Průměr (Ø): ${formatTimeValue(avgPickPerItem, unit)}` : `Mean (Ø): ${formatTimeValue(avgPickPerItem, unit)}`} • ${formatDurationHuman(totalPickSec)}</div>
      </div>

      ${hasSorting ? `
      <div class="kpi-card" style="border-color: rgba(168, 85, 247, 0.4);">
        <div class="kpi-card-title" style="color: #c084fc;">${isCs ? 'Doba sortování na 1 produkt' : 'Sorting Time per Item'}</div>
        <div class="kpi-card-value" style="color: #c084fc;">${formatTimeValue(medianSortPerItem, unit)} <span style="font-size: 12px; color: #e9d5ff;">${isCs ? 'medián' : 'med'}</span></div>
        <div class="kpi-card-sub">${isCs ? `Průměr (Ø): ${formatTimeValue(avgSortPerItem, unit)}` : `Mean (Ø): ${formatTimeValue(avgSortPerItem, unit)}`} • ${formatDurationHuman(totalSortSec)}</div>
      </div>
      ` : ''}

      <div class="kpi-card">
        <div class="kpi-card-title">${isCs ? 'Doba balení na 1 produkt' : 'Packing Time per Item'}</div>
        <div class="kpi-card-value" style="color: #34d399;">${formatTimeValue(medianPackPerItem, unit)} <span style="font-size: 12px; color: #34d399;">${isCs ? 'medián' : 'med'}</span></div>
        <div class="kpi-card-sub">${isCs ? `Průměr (Ø): ${formatTimeValue(avgPackPerItem, unit)}` : `Mean (Ø): ${formatTimeValue(avgPackPerItem, unit)}`} • ${formatDurationHuman(totalPackSec)}</div>
      </div>

      <div class="kpi-card" style="border-color: rgba(99, 102, 241, 0.4);">
        <div class="kpi-card-title" style="color: #a5b4fc;">${hasSorting ? (isCs ? 'Celkový čas na 1 ks (Pick + Sort + Balení)' : 'Total Time per Item (Pick + Sort + Pack)') : (isCs ? 'Celkový čas na 1 produkt (Pick + Balení)' : 'Total Time per Item')}</div>
        <div class="kpi-card-value" style="color: #818cf8;">${formatTimeValue(medianTotalPerItem, unit)} <span style="font-size: 12px; color: #a5b4fc;">${isCs ? 'medián' : 'med'}</span></div>
        <div class="kpi-card-sub">${isCs ? `Průměr (Ø): ${formatTimeValue(avgTotalPerItem, unit)}` : `Mean (Ø): ${formatTimeValue(avgTotalPerItem, unit)}`} • ${hasSorting ? (isCs ? 'Součet 3 procesů' : '3 stages') : (isCs ? 'Součet 2 procesů' : '2 stages')}</div>
      </div>
    </div>
  </section>

  <!-- 1. Srovnání náročnosti podle počtu kusů (1, 2, 3, 4, 5, 6+ ks) -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '1. Náročnost operací podle počtu kusů v objednávce (1, 2, 3, 4, 5, 6+ ks)' : '1. Order Size Complexity Comparison (1, 2, 3, 4, 5, 6+ items)'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs ? 'Srovnání průměrných časů na 1 kus, rozptylu (medián / P90) a celkového objemu práce pro jednotlivé velikostní kategorie.' : 'Comparison of pick & pack times per item across shipment size brackets.'}
    </div>

    <!-- Quick Bracket summary tiles -->
    <div class="bracket-cards-grid">
      ${bracketStats.map((b: BracketStat) => `
        <div class="bracket-tile">
          <div class="bracket-tile-badge">${escapeHtml(getBracketLabel(b.bracket))}</div>
          <div class="bracket-tile-val">${formatTimeValue(b.avgTotalPerItemSec, unit)}</div>
          <div class="bracket-tile-label">${isCs ? 'na 1 kus celkem' : 'total per unit'}</div>
          <div style="font-size: 11px; margin-top: 6px; color: #94a3b8;">
            ${b.shipmentCount.toLocaleString('cs-CZ')} ${isCs ? 'zásilek' : 'shipments'} (${b.shipmentSharePct}%)
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Detailed Bracket Table -->
    <table>
      <thead>
        <tr>
          <th>${isCs ? 'Kategorie zásilky' : 'Bracket'}</th>
          <th class="text-right">${isCs ? 'Zásilek' : 'Shipments'}</th>
          <th class="text-right">${isCs ? 'Podíl (%)' : 'Share (%)'}</th>
          <th class="text-right">${isCs ? 'Kusů celkem' : 'Total Items'}</th>
          <th class="text-right">${isCs ? 'Pick / 1ks (Průměr)' : 'Pick / item (Avg)'}</th>
          ${hasSorting ? `<th class="text-right" style="color: #c084fc;">${isCs ? 'Sort / 1ks (Průměr)' : 'Sort / item (Avg)'}</th>` : ''}
          <th class="text-right">${isCs ? 'Balení / 1ks (Průměr)' : 'Pack / item (Avg)'}</th>
          <th class="text-right">${isCs ? 'Celkem / 1ks (Průměr)' : 'Total / item (Avg)'}</th>
          <th class="text-right">${isCs ? 'Medián / 1ks' : 'Median / item'}</th>
          <th class="text-right">${isCs ? 'Čas na objednávku' : 'Time per Order'}</th>
        </tr>
      </thead>
      <tbody>
        ${bracketStats.map((b: BracketStat) => `
          <tr>
            <td><strong>${escapeHtml(getBracketLabel(b.bracket))}</strong></td>
            <td class="text-right font-mono">${b.shipmentCount.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono">${b.shipmentSharePct}%</td>
            <td class="text-right font-mono">${b.itemCount.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono" style="color: #60a5fa;">${formatTimeValue(b.avgPickPerItemSec, unit)}</td>
            ${hasSorting ? `<td class="text-right font-mono" style="color: #c084fc;">${formatTimeValue(b.avgSortPerItemSec || 0, unit)}</td>` : ''}
            <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(b.avgPackPerItemSec, unit)}</td>
            <td class="text-right font-mono" style="color: #a5b4fc; font-weight: 700;">${formatTimeValue(b.avgTotalPerItemSec, unit)}</td>
            <td class="text-right font-mono">${formatTimeValue(b.medianTotalPerItemSec, unit)}</td>
            <td class="text-right font-mono" style="font-weight: 700;">${formatTimeValue(b.avgPickTotalSec + (b.avgSortTotalSec || 0) + b.avgPackTotalSec, unit)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </section>

  <!-- 2. Multipicking & Synergie sběrných boxů -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '2. Analýza shody produktů v boxech (Multipicking & Synergie)' : '2. Product Matches in Boxes & Multipicking Synergy'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs ? 'Ověření vlivu shody produktů (stejných EANů) ve sběrném boxu na rychlost pickování a balení se zobrazením procentuálního zastoupení ve vzorku.' : 'Verification of SKU overlap in collection totes on pick and pack speed with exact sample share.'}
    </div>

    <!-- Sample percentage distribution bar -->
    <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #334155; border-radius: 14px; padding: 14px 18px; margin-bottom: 18px;">
      <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #ffffff; margin-bottom: 6px;">
        <span>${isCs ? 'Zastoupení kategorií ve zkoumaném vzorku' : 'Category distribution in sample'}:</span>
        <span class="font-mono" style="color: #94a3b8;">${(synergyData.totalBoxesCount || ((high.count || 0) + (med.count || 0) + (low.count || 0)) || synergyData.boxStats.length).toLocaleString('cs-CZ')} ${isCs ? 'boxů' : 'totes'} (${((high.totalUnits || 0) + (med.totalUnits || 0) + (low.totalUnits || 0)).toLocaleString('cs-CZ')} ${isCs ? 'kusů' : 'units'})</span>
      </div>
      <div class="distribution-bar">
        <div class="dist-bar-seg" style="width: ${Math.max(3, high.sharePct)}%; background: #10b981;" title="High: ${high.sharePct}%"></div>
        <div class="dist-bar-seg" style="width: ${Math.max(3, med.sharePct)}%; background: #6366f1;" title="Medium: ${med.sharePct}%"></div>
        <div class="dist-bar-seg" style="width: ${Math.max(3, low.sharePct)}%; background: #ef4444;" title="Low: ${low.sharePct}%"></div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px; color: #cbd5e1; margin-top: 8px;">
        <span><strong style="color: #34d399;">● ${isCs ? 'Vysoká shoda' : 'High Overlap'}:</strong> ${high.sharePct}% ${isCs ? 'boxů' : 'totes'} (${high.unitSharePct}% ${isCs ? 'kusů' : 'units'})</span>
        <span><strong style="color: #818cf8;">● ${isCs ? 'Střední shoda' : 'Medium Overlap'}:</strong> ${med.sharePct}% ${isCs ? 'boxů' : 'totes'} (${med.unitSharePct}% ${isCs ? 'kusů' : 'units'})</span>
        <span><strong style="color: #f87171;">● ${isCs ? 'Vysoká diverzita' : 'High Diversity'}:</strong> ${low.sharePct}% ${isCs ? 'boxů' : 'totes'} (${low.unitSharePct}% ${isCs ? 'kusů' : 'units'})</span>
      </div>
    </div>

    <!-- 3 Category Cards -->
    <div class="category-cards-grid">
      <!-- High Overlap -->
      <div class="category-card" style="border-color: rgba(16, 185, 129, 0.4);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <span style="font-weight: 700; font-size: 13px; color: #34d399;">${isCs ? 'Vysoká shoda (Silný multipick)' : 'High Overlap'}</span>
          <span class="font-mono" style="font-weight: 700; color: #34d399; font-size: 13px;">${high.sharePct}% ${isCs ? 'vzorku' : 'of sample'}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; font-family: monospace;">${high.count} ${isCs ? 'boxů' : 'totes'} • ${(high.totalUnits || 0).toLocaleString('cs-CZ')} ${isCs ? 'ks' : 'units'}</div>
        <div style="font-size: 12px; line-height: 1.8; margin-top: 6px;">
          <div>${isCs ? 'Průměr kusů na 1 EAN' : 'Avg units per EAN'}: <strong>${high.avgUnitsPerEan} ks/SKU</strong></div>
          <div>${isCs ? 'Pickování na 1 ks' : 'Picking per unit'}: <strong style="color: #60a5fa;">${formatTimeValue(high.avgPickPerUnitSec, unit)}</strong></div>
          <div>${isCs ? 'Balení na 1 ks' : 'Packing per unit'}: <strong style="color: #34d399;">${formatTimeValue(high.avgPackPerUnitSec, unit)}</strong></div>
          <div style="border-top: 1px solid #334155; padding-top: 4px; font-weight: 700;">${isCs ? 'Celkem na 1 ks' : 'Total per unit'}: <span style="color: #a5b4fc;">${formatTimeValue(high.avgPickPerUnitSec + high.avgPackPerUnitSec, unit)}</span></div>
        </div>
      </div>

      <!-- Medium Overlap -->
      <div class="category-card" style="border-color: rgba(99, 102, 241, 0.4);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <span style="font-weight: 700; font-size: 13px; color: #818cf8;">${isCs ? 'Střední shoda (Běžný mix)' : 'Medium Overlap'}</span>
          <span class="font-mono" style="font-weight: 700; color: #818cf8; font-size: 13px;">${med.sharePct}% ${isCs ? 'vzorku' : 'of sample'}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; font-family: monospace;">${med.count} ${isCs ? 'boxů' : 'totes'} • ${(med.totalUnits || 0).toLocaleString('cs-CZ')} ${isCs ? 'ks' : 'units'}</div>
        <div style="font-size: 12px; line-height: 1.8; margin-top: 6px;">
          <div>${isCs ? 'Průměr kusů na 1 EAN' : 'Avg units per EAN'}: <strong>${med.avgUnitsPerEan} ks/SKU</strong></div>
          <div>${isCs ? 'Pickování na 1 ks' : 'Picking per unit'}: <strong style="color: #60a5fa;">${formatTimeValue(med.avgPickPerUnitSec, unit)}</strong></div>
          <div>${isCs ? 'Balení na 1 ks' : 'Packing per unit'}: <strong style="color: #34d399;">${formatTimeValue(med.avgPackPerUnitSec, unit)}</strong></div>
          <div style="border-top: 1px solid #334155; padding-top: 4px; font-weight: 700;">${isCs ? 'Celkem na 1 ks' : 'Total per unit'}: <span style="color: #a5b4fc;">${formatTimeValue(med.avgPickPerUnitSec + med.avgPackPerUnitSec, unit)}</span></div>
        </div>
      </div>

      <!-- Low Overlap -->
      <div class="category-card" style="border-color: rgba(239, 68, 68, 0.4);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <span style="font-weight: 700; font-size: 13px; color: #f87171;">${isCs ? 'Vysoká diverzita (Každý kus jiný)' : 'High Diversity'}</span>
          <span class="font-mono" style="font-weight: 700; color: #f87171; font-size: 13px;">${low.sharePct}% ${isCs ? 'vzorku' : 'of sample'}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; font-family: monospace;">${low.count} ${isCs ? 'boxů' : 'totes'} • ${(low.totalUnits || 0).toLocaleString('cs-CZ')} ${isCs ? 'ks' : 'units'}</div>
        <div style="font-size: 12px; line-height: 1.8; margin-top: 6px;">
          <div>${isCs ? 'Průměr kusů na 1 EAN' : 'Avg units per EAN'}: <strong>${low.avgUnitsPerEan} ks/SKU</strong></div>
          <div>${isCs ? 'Pickování na 1 ks' : 'Picking per unit'}: <strong style="color: #60a5fa;">${formatTimeValue(low.avgPickPerUnitSec, unit)}</strong></div>
          <div>${isCs ? 'Balení na 1 ks' : 'Packing per unit'}: <strong style="color: #34d399;">${formatTimeValue(low.avgPackPerUnitSec, unit)}</strong></div>
          <div style="border-top: 1px solid #334155; padding-top: 4px; font-weight: 700;">${isCs ? 'Celkem na 1 ks' : 'Total per unit'}: <span style="color: #a5b4fc;">${formatTimeValue(low.avgPickPerUnitSec + low.avgPackPerUnitSec, unit)}</span></div>
        </div>
      </div>
    </div>

    <!-- Category by category comparison table (1 až 6+ ks) -->
    <div style="font-weight: 700; font-size: 13px; color: #ffffff; margin: 18px 0 6px;">
      ${isCs ? 'Srovnání vlivu konsolidace boxů napříč všemi kategoriemi (Vysoká shoda vs. Diverzita):' : 'Consolidation Impact Across All Brackets (High Overlap vs Diversity):'}
    </div>
    <table>
      <thead>
        <tr>
          <th>${isCs ? 'Kategorie' : 'Category'}</th>
          <th class="text-right">${isCs ? 'Objednávky (Shoda / Diverzita)' : 'Orders (High / Low)'}</th>
          <th class="text-right">${isCs ? 'Pick / 1ks (Shoda)' : 'Pick / Item (High)'}</th>
          <th class="text-right">${isCs ? 'Pick / 1ks (Diverzita)' : 'Pick / Item (Low)'}</th>
          <th class="text-right">${isCs ? 'Úspora Pick' : 'Pick Savings'}</th>
          <th class="text-right">${isCs ? 'Balení / 1ks (Shoda)' : 'Pack / Item (High)'}</th>
          <th class="text-right">${isCs ? 'Balení / 1ks (Diverzita)' : 'Pack / Item (Low)'}</th>
          <th class="text-right">${isCs ? 'Úspora Balení' : 'Pack Savings'}</th>
          <th class="text-right">${isCs ? 'Celková úspora / 1ks' : 'Total Savings'}</th>
        </tr>
      </thead>
      <tbody>
        ${bracketComparisons.map((b: any) => `
          <tr ${b.bracket === 'all' ? 'style="font-weight: 700; background: rgba(99, 102, 241, 0.1); border-top: 2px solid #6366f1;"' : ''}>
            <td><strong>${escapeHtml(b.label)}</strong></td>
            <td class="text-right font-mono">${b.highOrders.toLocaleString('cs-CZ')} / ${b.lowOrders.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(b.highPickSec, unit)}</td>
            <td class="text-right font-mono" style="color: #f87171;">${formatTimeValue(b.lowPickSec, unit)}</td>
            <td class="text-right font-mono" style="color: #34d399; font-weight: 700;">${b.pickSavingsPct > 0 ? `-${b.pickSavingsPct}%` : '–'}</td>
            <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(b.highPackSec, unit)}</td>
            <td class="text-right font-mono" style="color: #f87171;">${formatTimeValue(b.lowPackSec, unit)}</td>
            <td class="text-right font-mono" style="color: #34d399; font-weight: 700;">${b.packSavingsPct > 0 ? `-${b.packSavingsPct}%` : '–'}</td>
            <td class="text-right font-mono" style="color: #34d399; font-weight: 800; font-size: 13px;">${b.totalSavingsPct > 0 ? `-${b.totalSavingsPct}%` : '–'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </section>

  <!-- 3. Analýza dnů v týdnu & Časový vývoj + Pareto -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '3. Vývoj výkonnosti v čase a Pareto analýza produktů (80/20)' : '3. Daily Performance & Product Pareto Analysis (80/20)'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs ? 'Detailní rozpis výkonnosti podle dnů v týdnu a jednotlivých kalendářních dnů včetně koncentrace 80 % expedovaného objemu.' : 'Breakdown by days of the week, calendar days, and 80/20 SKU volume concentration.'}
    </div>

    <!-- Pareto 80/20 Summary Card -->
    <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid #334155; border-radius: 16px; padding: 16px 20px; margin-bottom: 18px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px;">
      <div>
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600;">${isCs ? '80 % expedovaného objemu skladu' : '80% of Shipped Volume'}</div>
        <div style="font-size: 20px; font-weight: 800; color: #10b981; margin-top: 4px;">
          ${dailyReport.overallPareto.top80ProductsCount.toLocaleString('cs-CZ')} SKU <span style="font-size: 13px; font-weight: normal; color: #94a3b8;">(${dailyReport.overallPareto.top80ProductsSharePct}% ${isCs ? 'sortimentu' : 'of SKUs'})</span>
        </div>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
          ${dailyReport.overallPareto.top80Units.toLocaleString('cs-CZ')} ${isCs ? 'kusů generuje 80 % veškeré produkce' : 'units generated by top core SKUs'}
        </div>
      </div>
      <div>
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600;">${isCs ? 'Zbylých 20 % objemu (Dlouhý chvost)' : 'Remaining 20% Volume (Long Tail)'}</div>
        <div style="font-size: 20px; font-weight: 800; color: #f59e0b; margin-top: 4px;">
          ${dailyReport.overallPareto.remaining20ProductsCount.toLocaleString('cs-CZ')} SKU <span style="font-size: 13px; font-weight: normal; color: #94a3b8;">(${dailyReport.overallPareto.remaining20ProductsSharePct}% ${isCs ? 'sortimentu' : 'of SKUs'})</span>
        </div>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
          ${dailyReport.overallPareto.remaining20Units.toLocaleString('cs-CZ')} ${isCs ? 'kusů v nízkoobrátkových položkách' : 'units across long tail items'}
        </div>
      </div>
      <div>
        <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600;">${isCs ? 'Celkem unikátních SKU' : 'Total Unique SKUs'}</div>
        <div style="font-size: 20px; font-weight: 800; color: #ffffff; margin-top: 4px;">
          ${dailyReport.overallPareto.totalUniqueProducts.toLocaleString('cs-CZ')} SKU
        </div>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
          ${dailyReport.overallPareto.totalUnits.toLocaleString('cs-CZ')} ${isCs ? 'celkem zpracovaných kusů' : 'total processed units'}
        </div>
      </div>
    </div>

    <!-- Dny v týdnu -->
    <div style="font-weight: 700; font-size: 13px; color: #ffffff; margin-bottom: 6px;">
      ${isCs ? 'Souhrn podle dnů v týdnu (Pondělí až Neděle):' : 'Day of Week Performance (Monday to Sunday):'}
    </div>
    <table>
      <thead>
        <tr>
          <th>${isCs ? 'Den v týdnu' : 'Day of Week'}</th>
          <th class="text-right">${isCs ? 'Zásilek' : 'Orders'}</th>
          <th class="text-right">${isCs ? 'Kusů' : 'Units'}</th>
          <th class="text-right">${isCs ? 'Pick / 1ks' : 'Pick / Item'}</th>
          <th class="text-right">${isCs ? 'Balení / 1ks' : 'Pack / Item'}</th>
          <th class="text-right">${isCs ? 'Celkem / 1ks' : 'Total / Item'}</th>
          <th class="text-right">${isCs ? 'Celkem na zakázku' : 'Total / Order'}</th>
        </tr>
      </thead>
      <tbody>
        ${dailyReport.dayOfWeekStats.map((d: any) => `
          <tr>
            <td><strong>${isCs ? d.dayNameCs : d.dayNameEn}</strong></td>
            <td class="text-right font-mono">${d.totalOrders.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono">${d.totalUnits.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono" style="color: #60a5fa;">${formatTimeValue(d.avgPickPerItemSec, unit)}</td>
            <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(d.avgPackPerItemSec, unit)}</td>
            <td class="text-right font-mono" style="color: #a5b4fc; font-weight: 700;">${formatTimeValue(d.avgTotalPerItemSec, unit)}</td>
            <td class="text-right font-mono" style="font-weight: 700;">${formatTimeValue(d.avgTotalPerOrderSec, unit)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Kalendářní dny -->
    ${dailyReport.dailyStats.length > 0 ? `
      <div style="font-weight: 700; font-size: 13px; color: #ffffff; margin: 20px 0 6px;">
        ${isCs ? 'Jednotlivé kalendářní dny (vytížení a průměrné časy):' : 'Calendar Days Breakdown:'}
      </div>
      <table>
        <thead>
          <tr>
            <th>${isCs ? 'Datum' : 'Date'}</th>
            <th class="text-right">${isCs ? 'Zásilek' : 'Shipments'}</th>
            <th class="text-right">${isCs ? 'Kusů' : 'Units'}</th>
            <th class="text-right">${isCs ? 'Pick / 1ks' : 'Pick / Item'}</th>
            <th class="text-right">${isCs ? 'Balení / 1ks' : 'Pack / Item'}</th>
            <th class="text-right">${isCs ? 'Celkem / 1ks' : 'Total / Item'}</th>
            <th class="text-right">${isCs ? '80 % objemu (Top SKU)' : '80% Volume (Top SKUs)'}</th>
          </tr>
        </thead>
        <tbody>
          ${dailyReport.dailyStats.slice(0, 15).map((ds: any) => `
            <tr>
              <td><strong>${escapeHtml(ds.dayLabel || ds.date)}</strong></td>
              <td class="text-right font-mono">${ds.totalShipments.toLocaleString('cs-CZ')}</td>
              <td class="text-right font-mono">${ds.totalItems.toLocaleString('cs-CZ')}</td>
              <td class="text-right font-mono" style="color: #60a5fa;">${formatTimeValue(ds.avgPickPerItemSec, unit)}</td>
              <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(ds.avgPackPerItemSec, unit)}</td>
              <td class="text-right font-mono" style="color: #a5b4fc; font-weight: 700;">${formatTimeValue(ds.avgTotalPerItemSec, unit)}</td>
              <td class="text-right font-mono" style="color: #10b981;">${ds.pareto.top80ProductsCount} SKU (${ds.pareto.top80Units} ks)</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
  </section>

  <!-- 4. Kompletní simulace optimalizace: Přeskupení do sběrných boxů (Multipicking ve 2h slotech) -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '4. Simulace optimalizace: Přeskupení do sběrných boxů (Multipicking ve 2h slotech)' : '4. Optimization Simulation: 2-Hour Batching (Multipicking)'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs ? 'Vyhodnocení, kolik času ušetří sklad při inteligentním shlukování objednávek se shodnými produkty do stejných sběrných boxů v rámci 2hodinových časových oken, se striktním dodržením fyzické kapacity boxu a objemů produktů.' : 'Complete evaluation of operational savings from intelligent 2-hour order clustering adhering to volume and box limits.'}
    </div>

    <!-- Volumetric SKU Profile Header -->
    <div class="volumetric-banner">
      <div>
        <div style="font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px;">
          <span>${isCs ? 'Objemový limit sběrného boxu:' : 'Tote Capacity Limit:'}</span>
          <span class="font-mono" style="color: #fbbf24; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 8px; border-radius: 6px;">
            max ${simulation.boxCapacityLimit} ${isCs ? 'kusů / box' : 'units / tote'}
          </span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
          ${isCs ? 'Odvozeno z reálných dat várek' : 'Derived from wave data'}: max ${simulation.maxObservedUnitsInBox} ks, 95. percentil ${simulation.p95ObservedUnitsInBox} ks, průměr = ${simulation.avgObservedUnitsInBox} ks.
        </div>
      </div>
      ${simulation.volumetricSummary ? `
        <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px;">
          <span style="background: #1e293b; padding: 4px 10px; border-radius: 8px; border: 1px solid #334155;">
            ${isCs ? 'Drobný sortiment' : 'Small'}: <strong style="color: #34d399;">${simulation.volumetricSummary.smallSkusCount} SKU</strong> (~60-100 ks)
          </span>
          <span style="background: #1e293b; padding: 4px 10px; border-radius: 8px; border: 1px solid #334155;">
            ${isCs ? 'Střední sortiment' : 'Medium'}: <strong style="color: #38bdf8;">${simulation.volumetricSummary.mediumSkusCount} SKU</strong> (~25-50 ks)
          </span>
          <span style="background: #1e293b; padding: 4px 10px; border-radius: 8px; border: 1px solid #334155;">
            ${isCs ? 'Objemný sortiment' : 'Bulky'}: <strong style="color: #fbbf24;">${simulation.volumetricSummary.bulkySkusCount} SKU</strong> (~8-20 ks)
          </span>
        </div>
      ` : ''}
    </div>

    <!-- 4 Main KPI Cards matching the Application View -->
    <div class="sim-kpi-grid">
      <!-- Card 1: Total Saved Hours -->
      <div class="sim-kpi-card sim-kpi-card-highlight">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #34d399;">${isCs ? 'Celková úspora času' : 'Total Saved Time'}</span>
          <span class="font-mono" style="font-size: 11px; font-weight: 800; color: #34d399; background: rgba(16, 185, 129, 0.2); padding: 2px 6px; border-radius: 6px;">
            -${simulation.overallSavingsPct}%
          </span>
        </div>
        <div class="font-mono" style="font-size: 26px; font-weight: 800; color: #ffffff; margin-top: 6px;">
          -${formatHoursOrMins(simulation.totalSavedSeconds)}
        </div>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px;">
          ${isCs ? 'Pickování' : 'Picking'}: <strong style="color: #818cf8;">-${formatHoursOrMins(simAll?.pickSavingsSec || 0)}</strong> • ${isCs ? 'Balení' : 'Packing'}: <strong style="color: #34d399;">-${formatHoursOrMins(simAll?.packSavingsSec || 0)}</strong>
        </div>
      </div>

      <!-- Card 2: Total Labor Reduction -->
      <div class="sim-kpi-card">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 600; color: #94a3b8;">${isCs ? 'Celková pracnost skladu' : 'Total Labor Hours'}</div>
        <div class="font-mono" style="display: flex; align-items: baseline; gap: 8px; margin-top: 6px;">
          <span style="font-size: 16px; color: #94a3b8; text-decoration: line-through;">${formatHoursOrMins(simAll?.baselineTotalSec || 0)}</span>
          <span style="color: #94a3b8;">→</span>
          <span style="font-size: 24px; font-weight: 800; color: #34d399;">${formatHoursOrMins(simAll?.optimizedTotalSec || 0)}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
          ${isCs ? 'Snížení zátěže operátorů o' : 'Operator workload reduction by'} <strong style="color: #ffffff;">${simulation.totalSavedHours} ${isCs ? 'člověko-hodin' : 'man-hours'}</strong>.
        </div>
      </div>

      <!-- Card 3: Multipicking Rate Boost -->
      <div class="sim-kpi-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 600; color: #94a3b8;">${isCs ? 'Míra multipickingu' : 'Multipicking Rate'}</span>
          <span class="font-mono" style="font-size: 11px; font-weight: 700; color: #c084fc;">
            +${simulation.simulatedMultipickRatioPct - simulation.baselineMultipickRatioPct}%
          </span>
        </div>
        <div class="font-mono" style="display: flex; align-items: baseline; gap: 8px; margin-top: 6px;">
          <span style="font-size: 16px; color: #94a3b8;">${simulation.baselineMultipickRatioPct}%</span>
          <span style="color: #c084fc;">→</span>
          <span style="font-size: 24px; font-weight: 800; color: #c084fc;">${simulation.simulatedMultipickRatioPct}%</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
          ${isCs ? 'Podíl kusů vychystaných v konsolidovaných dávkách více objednávek najednou.' : 'Share of items picked in multi-order consolidation waves.'}
        </div>
      </div>

      <!-- Card 4: Constraints & Windows Analyzed -->
      <div class="sim-kpi-card">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 600; color: #94a3b8;">${isCs ? 'Časová okna & Boxy' : 'Time Slots & Totes'}</div>
        <div class="font-mono" style="font-size: 26px; font-weight: 800; color: #ffffff; margin-top: 6px;">
          ${simulation.totalTwoHourSlots} <span style="font-size: 13px; font-weight: normal; color: #94a3b8;">${isCs ? 'slotů (2h)' : 'slots (2h)'}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
          ${isCs ? 'Simulováno boxů' : 'Simulated totes'}: <strong style="color: #ffffff;">${simulation.totalBoxesSimulated}</strong> (${isCs ? 'aktuálně v datech' : 'currently in data'} ${simulation.totalBoxesCurrent}).
        </div>
      </div>
    </div>

    <!-- Complete Category-by-Category Savings Table (1, 2, 3, 4, 5, 6+ ks and Celkem) -->
    <div style="font-weight: 700; font-size: 13px; color: #ffffff; margin: 24px 0 6px;">
      ${isCs ? 'Rozvržení úspor pro všechny kategorie zásilek (1 až 6+ kusů):' : 'Savings Breakdown Across All Order Brackets (1 to 6+ items):'}
    </div>
    <table>
      <thead>
        <tr>
          <th>${isCs ? 'Kategorie' : 'Category'}</th>
          <th class="text-right">${isCs ? 'Zásilky' : 'Orders'}</th>
          <th class="text-right">${isCs ? 'Kusy' : 'Items'}</th>
          <th class="text-right" style="color: #60a5fa; border-left: 1px solid #334155;">${isCs ? 'Stávající: Pick' : 'Current Pick'}</th>
          <th class="text-right" style="color: #34d399;">${isCs ? 'Stávající: Balení' : 'Current Pack'}</th>
          <th class="text-right" style="color: #a5b4fc;">${isCs ? 'Stávající: Celkem' : 'Current Total'}</th>
          <th class="text-right" style="color: #60a5fa; background: rgba(99, 102, 241, 0.1); border-left: 1px solid #334155;">${isCs ? 'Multipick: Pick' : 'Optimized Pick'}</th>
          <th class="text-right" style="color: #34d399; background: rgba(16, 185, 129, 0.1);">${isCs ? 'Multipick: Balení' : 'Optimized Pack'}</th>
          <th class="text-right" style="color: #c084fc; background: rgba(168, 85, 247, 0.1); font-weight: 700;">${isCs ? 'Multipick: Celkem' : 'Optimized Total'}</th>
          <th class="text-right" style="color: #34d399; font-weight: 700; border-left: 1px solid #334155;">${isCs ? 'Úspora Pick' : 'Pick Save'}</th>
          <th class="text-right" style="color: #34d399; font-weight: 700;">${isCs ? 'Úspora Balení' : 'Pack Save'}</th>
          <th class="text-right" style="color: #34d399; font-weight: 800; font-size: 13px;">${isCs ? 'Celková úspora' : 'Total Savings'}</th>
        </tr>
      </thead>
      <tbody>
        ${simDetailed.map((b: SimulationBracketResult) => `
          <tr>
            <td><strong>${escapeHtml(b.label)}</strong></td>
            <td class="text-right font-mono">${b.orderCount.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono">${b.itemCount.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono" style="color: #60a5fa; border-left: 1px solid #334155;">${formatHoursOrMins(b.baselinePickSec)}</td>
            <td class="text-right font-mono" style="color: #34d399;">${formatHoursOrMins(b.baselinePackSec)}</td>
            <td class="text-right font-mono" style="color: #a5b4fc; font-weight: 600;">${formatHoursOrMins(b.baselineTotalSec)}</td>
            <td class="text-right font-mono" style="color: #60a5fa; background: rgba(99, 102, 241, 0.05); border-left: 1px solid #334155;">${formatHoursOrMins(b.optimizedPickSec)}</td>
            <td class="text-right font-mono" style="color: #34d399; background: rgba(16, 185, 129, 0.05);">${formatHoursOrMins(b.optimizedPackSec)}</td>
            <td class="text-right font-mono" style="color: #c084fc; background: rgba(168, 85, 247, 0.05); font-weight: 700;">${formatHoursOrMins(b.optimizedTotalSec)}</td>
            <td class="text-right font-mono" style="color: #34d399; border-left: 1px solid #334155;">-${b.pickSavingsPct}%</td>
            <td class="text-right font-mono" style="color: #34d399;">-${b.packSavingsPct}%</td>
            <td class="text-right font-mono" style="color: #34d399; font-weight: 800; font-size: 13px;">
              -${b.totalSavingsPct}% <span style="font-size: 11px; font-weight: normal; color: #a5b4fc;">(-${formatHoursOrMins(b.totalSavingsSec)})</span>
            </td>
          </tr>
        `).join('')}
        ${simAll ? `
          <tr style="font-weight: 800; background: rgba(99, 102, 241, 0.15); border-top: 2px solid #6366f1; border-bottom: 2px solid #6366f1;">
            <td><strong style="color: #ffffff;">${isCs ? 'Celkem za všechny kategorie' : 'Total Across All Brackets'}</strong></td>
            <td class="text-right font-mono">${simAll.orderCount.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono">${simAll.itemCount.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono" style="color: #60a5fa; border-left: 1px solid #334155;">${formatHoursOrMins(simAll.baselinePickSec)}</td>
            <td class="text-right font-mono" style="color: #34d399;">${formatHoursOrMins(simAll.baselinePackSec)}</td>
            <td class="text-right font-mono" style="color: #a5b4fc;">${formatHoursOrMins(simAll.baselineTotalSec)}</td>
            <td class="text-right font-mono" style="color: #60a5fa; border-left: 1px solid #334155;">${formatHoursOrMins(simAll.optimizedPickSec)}</td>
            <td class="text-right font-mono" style="color: #34d399;">${formatHoursOrMins(simAll.optimizedPackSec)}</td>
            <td class="text-right font-mono" style="color: #c084fc;">${formatHoursOrMins(simAll.optimizedTotalSec)}</td>
            <td class="text-right font-mono" style="color: #34d399; border-left: 1px solid #334155;">-${simAll.pickSavingsPct}%</td>
            <td class="text-right font-mono" style="color: #34d399;">-${simAll.packSavingsPct}%</td>
            <td class="text-right font-mono" style="color: #34d399; font-size: 14px;">
              -${simAll.totalSavingsPct}% <span style="font-size: 11px; font-weight: normal; color: #a5b4fc;">(-${formatHoursOrMins(simAll.totalSavingsSec)})</span>
            </td>
          </tr>
        ` : ''}
      </tbody>
    </table>

    <!-- Visual Bars Comparison -->
    <div style="font-weight: 700; font-size: 13px; color: #ffffff; margin: 24px 0 10px;">
      ${isCs ? 'Grafické srovnání úspor: Původní čas vs. Po optimalizaci multipickingu:' : 'Visual Comparison: Baseline Duration vs Optimized Multipicking:'}
    </div>
    <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid #334155; border-radius: 16px; padding: 18px 20px;">
      ${simDetailed.map((b: SimulationBracketResult) => {
        const maxTime = Math.max(...simDetailed.map((x: SimulationBracketResult) => x.baselineTotalSec));
        const baseWidth = maxTime > 0 ? (b.baselineTotalSec / maxTime) * 100 : 0;
        const optWidth = maxTime > 0 ? (b.optimizedTotalSec / maxTime) * 100 : 0;
        return `
          <div style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: #cbd5e1; margin-bottom: 4px;">
              <span><strong>${escapeHtml(b.label)}</strong></span>
              <span class="font-mono"><strong style="color: #94a3b8;">${formatHoursOrMins(b.baselineTotalSec)}</strong> → <strong style="color: #34d399;">${formatHoursOrMins(b.optimizedTotalSec)}</strong> (-${b.totalSavingsPct}%)</span>
            </div>
            <div style="width: 100%; height: 10px; background: #1e293b; border-radius: 6px; overflow: hidden; margin-bottom: 3px;">
              <div style="width: ${baseWidth}%; height: 100%; background: #64748b;"></div>
            </div>
            <div style="width: 100%; height: 10px; background: #1e293b; border-radius: 6px; overflow: hidden;">
              <div style="width: ${optWidth}%; height: 100%; background: #10b981;"></div>
            </div>
          </div>
        `;
      }).join('')}
      <div style="display: flex; gap: 20px; font-size: 11px; color: #94a3b8; margin-top: 10px; border-top: 1px solid #334155; padding-top: 8px;">
        <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; background: #64748b; border-radius: 2px; display: inline-block;"></span> ${isCs ? 'Stávající čas' : 'Baseline time'}</span>
        <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; background: #10b981; border-radius: 2px; display: inline-block;"></span> ${isCs ? 'Optimalizovaný čas' : 'Optimized time'}</span>
      </div>
    </div>

    <!-- Recommendations / Principles -->
    <div style="margin-top: 24px; background: rgba(15, 23, 42, 0.7); border: 1px solid #334155; border-radius: 16px; padding: 20px;">
      <div style="font-weight: 700; font-size: 13px; color: #ffffff; margin-bottom: 12px;">
        ${isCs ? 'Jak tento model funguje v praxi fulfillmentu skladu:' : 'How This Optimization Model Works in Practice:'}
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; font-size: 12px; color: #cbd5e1; line-height: 1.6;">
        <div style="background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 12px; padding: 14px;">
          <strong style="color: #818cf8; display: block; margin-bottom: 4px;">1. 2hodinové časové sloty</strong>
          ${isCs ? 'Objednávky se neakumulují celý den (což by zpozdilo expedici), ale v plynulých 2h vlnách. Picker tak dostává dávky se zvýšeným průnikem shodných SKU v daném okně.' : 'Orders are clustered in rolling 2-hour waves to preserve SLA while maximizing SKU overlap.'}
        </div>
        <div style="background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 12px; padding: 14px;">
          <strong style="color: #fbbf24; display: block; margin-bottom: 4px;">2. Fyzický limit a objem boxu</strong>
          ${isCs ? 'Algoritmus nepřetěžuje přepravky. Každý EAN má aproximovaný prostorový objem a přepravka se automaticky uzavře při dosažení cílové kapacity (typicky 25 až 50 ks).' : 'Boxes strictly adhere to SKU physical volume fractions and safety ergonomic item limits.'}
        </div>
        <div style="background: rgba(30, 41, 59, 0.4); border: 1px solid #334155; border-radius: 12px; padding: 14px;">
          <strong style="color: #34d399; display: block; margin-bottom: 4px;">3. Úspora balení i pickování</strong>
          ${isCs ? 'Vychystání na 1 zastavení v regálu eliminuje kroky. Balič navíc díky menší diverzitě zboží v přepravce netráví čas přebíráním položek.' : 'Concentrated SKUs eliminate aisle backtracking for pickers and searching delays for packers.'}
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <p>Warehouse Pick &amp; Pack Analytics • ${isCs ? 'Tento soubor je kompletní samostatný offline HTML report se všemi daty, tabulkami i grafy pro tisk, archivaci a sdílení.' : 'Complete standalone offline report containing all operational analytics and tables.'}</p>
  </footer>
</div>

</body>
</html>`;
}

/**
 * Generuje kompletní samostatný srovnávací HTML report mezi skladem Ruse a SVJ.
 * Odpovídá 1:1 zobrazení v aplikaci na záložce "Srovnání skladů".
 */
function generateComparisonHtmlReport(data: HtmlReportData): string {
  const { filter, unit, lang } = data;
  const isCs = lang === 'cs';

  const ruseRecs = data.ruseRecords && data.ruseRecords.length > 0
    ? data.ruseRecords
    : data.records.filter(r => (r.warehouse || 'ruse') === 'ruse');
  const svjRecs = data.svjRecords && data.svjRecords.length > 0
    ? data.svjRecords
    : data.records.filter(r => r.warehouse === 'svj');

  let report: WarehouseComparisonReport = (data.comparisonReport && data.comparisonReport.ruseTotalOrders > 0 && data.comparisonReport.svjTotalOrders > 0)
    ? data.comparisonReport
    : (data.cachedAnalytics?.comparison && data.cachedAnalytics.comparison.ruseTotalOrders > 0 && data.cachedAnalytics.comparison.svjTotalOrders > 0)
    ? data.cachedAnalytics.comparison
    : computeWarehouseComparison(ruseRecs, svjRecs);

  const formatDeltaHtml = (valRuse: number, valSvj: number, unitLabel: string = 's') => {
    const diff = valSvj - valRuse;
    const pct = valRuse > 0 ? ((diff / valRuse) * 100).toFixed(1) : '0';
    const isHigher = diff > 0;
    const isNeutral = Math.abs(diff) < 0.05;

    if (isNeutral) {
      return `<span style="color: #94a3b8; font-family: monospace;">0 %</span>`;
    }

    const color = isHigher ? '#fbbf24' : '#34d399';
    const sign = isHigher ? '+' : '';
    return `<span style="color: ${color}; font-family: monospace; font-weight: 600;">${sign}${diff.toFixed(1)} ${unitLabel} (${sign}${pct} %)</span>`;
  };

  const generatedDate = new Date();
  const formattedGenDate = generatedDate.toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const periodLabelMap: Record<string, string> = {
    all: isCs ? 'Celé období' : 'All time',
    '30days': isCs ? 'Posledních 30 dní' : 'Last 30 days',
    '14days': isCs ? 'Posledních 14 dní' : 'Last 14 days',
    '7days': isCs ? 'Posledních 7 dní' : 'Last 7 days',
    today: isCs ? 'Dnes' : 'Today',
    custom: isCs
      ? `Vlastní (${filter.dateFrom || '–'} až ${filter.dateTo || '–'})`
      : `Custom (${filter.dateFrom || '–'} to ${filter.dateTo || '–'})`,
  };

  const bracketLabelMap: Record<string, string> = {
    all: isCs ? 'Všechny velikosti zásilek' : 'All shipment sizes',
    '1': isCs ? '1 kus (Single-item)' : '1 item',
    '2': isCs ? '2 kusy' : '2 items',
    '3': isCs ? '3 kusy' : '3 items',
    '4': isCs ? '4 kusy' : '4 items',
    '5': isCs ? '5 kusů' : '5 items',
    '6+': isCs ? '6 a více kusů (Multi-item)' : '6+ items',
  };

  return `<!DOCTYPE html>
<html lang="${isCs ? 'cs' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isCs ? 'Srovnávací Report Skladů: Ruse vs SVJ' : 'Cross-Warehouse Comparison: Ruse vs SVJ'}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #0f172a;
      --card-border: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --blue: #3b82f6;
      --blue-light: #60a5fa;
      --purple: #a855f7;
      --purple-light: #c084fc;
      --cyan: #06b6d4;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #ef4444;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 1280px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .report-header {
      background: linear-gradient(135deg, rgba(30, 27, 75, 0.8), rgba(15, 23, 42, 0.95));
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 24px 28px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .brand-badge {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 20px;
      letter-spacing: 0.5px;
    }
    .report-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .btn-print {
      display: flex;
      align-items: center;
      gap: 8px;
      background-color: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-print:hover { background-color: #334155; }
    .filter-meta-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      font-size: 12px;
    }
    .meta-tag {
      background: #1e293b;
      padding: 4px 10px;
      border-radius: 6px;
      color: var(--text-muted);
      border: 1px solid #334155;
    }
    .meta-tag strong { color: var(--text); }
    .content-box {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .section-title {
      font-size: 16px;
      font-weight: 800;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .section-subtitle {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 18px;
    }
    .kpi-grid {
      display: grid;
      gap: 14px;
    }
    .kpi-card {
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 16px;
    }
    .kpi-card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th {
      background: rgba(15, 23, 42, 0.9);
      padding: 12px 14px;
      text-align: left;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 10px;
      border-bottom: 1px solid var(--card-border);
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(30, 41, 59, 0.6);
      color: var(--text);
    }
    tr:hover td { background-color: rgba(30, 41, 59, 0.3); }
    .text-right { text-align: right; }
    .footer {
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
      padding: 20px 0 10px;
      border-top: 1px solid var(--card-border);
    }
    @media print {
      body { background: #fff !important; color: #000 !important; padding: 0 !important; }
      .container { max-width: 100% !important; gap: 16px !important; }
      .btn-print { display: none !important; }
      .report-header, .content-box, .kpi-card, .filter-meta-bar {
        background: #fff !important;
        border: 1px solid #ccc !important;
        color: #000 !important;
        box-shadow: none !important;
      }
      .brand-title, .section-title, th, td { color: #000 !important; }
    }
  </style>
</head>
<body>

<div class="container">
  <!-- Header -->
  <header class="report-header">
    <div>
      <div class="brand-title">
        <span>Warehouse Pick &amp; Pack Analytics</span>
        <span class="brand-badge" style="background: rgba(99, 102, 241, 0.25); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4);">
          ${isCs ? 'Srovnávací Report Skladů: Ruse vs SVJ' : 'Cross-Warehouse: Ruse vs SVJ'}
        </span>
        <span class="brand-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">
          ${isCs ? 'Databázový Export' : 'Database Export'}
        </span>
      </div>
      <div class="report-subtitle">
        ${isCs ? 'Globální porovnání klíčových ukazatelů výkonnosti (KPI), rychlostí operací na 1 kus, vlivu sortingu v SVJ a průchodnosti zakázek.' : 'Comparative analysis of key KPIs, operational cycle times per item, sorting impact in SVJ, and order throughput.'} • 
        ${isCs ? 'Vygenerováno' : 'Generated'}: <strong>${escapeHtml(formattedGenDate)}</strong>
      </div>
    </div>
    <div class="header-actions">
      <div style="display: flex; gap: 8px;">
        <span class="brand-badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);">
          Ruse: <strong>${report.ruseTotalOrders.toLocaleString('cs-CZ')}</strong> obj. (${report.ruseTotalUnits.toLocaleString('cs-CZ')} ks)
        </span>
        <span class="brand-badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">
          SVJ: <strong>${report.svjTotalOrders.toLocaleString('cs-CZ')}</strong> obj. (${report.svjTotalUnits.toLocaleString('cs-CZ')} ks)
        </span>
      </div>
      <button class="btn-print" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        <span>${isCs ? 'Tisknout / Uložit PDF' : 'Print / Save PDF'}</span>
      </button>
    </div>
  </header>

  <!-- Filter & Metadata Info -->
  <div class="filter-meta-bar">
    <span style="font-weight: 700; color: #cbd5e1;">${isCs ? 'Aplikované filtry:' : 'Active filters:'}</span>
    <span class="meta-tag" style="background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.4); color: #a5b4fc;">
      ${isCs ? 'Režim' : 'Mode'}: <strong>${isCs ? 'Srovnání skladů (Ruse vs SVJ)' : 'Cross-Warehouse Comparison'}</strong>
    </span>
    <span class="meta-tag">${isCs ? 'Období' : 'Period'}: <strong>${escapeHtml(periodLabelMap[filter.datePreset] || filter.datePreset)}</strong></span>
    <span class="meta-tag">${isCs ? 'Velikost' : 'Size'}: <strong>${escapeHtml(bracketLabelMap[filter.bracket] || filter.bracket)}</strong></span>
    <span class="meta-tag">${isCs ? 'Jednotka' : 'Unit'}: <strong>${unit === 'sec' ? (isCs ? 'Sekundy (s)' : 'Seconds') : (isCs ? 'Minuty (min)' : 'Minutes')}</strong></span>
    <span class="meta-tag">${isCs ? 'Odlehlé hodnoty' : 'Outliers'}: <strong>${filter.excludeOutliers ? (isCs ? 'Vynechány (>30 min)' : 'Excluded (>30 min)') : (isCs ? 'Zahrnuty' : 'Included')}</strong></span>
    <span class="meta-tag" style="margin-left: auto;">
      ${isCs ? 'Objednávky celkem' : 'Total Orders'}: <strong>${(report.ruseTotalOrders + report.svjTotalOrders).toLocaleString('cs-CZ')}</strong> (${(report.ruseTotalUnits + report.svjTotalUnits).toLocaleString('cs-CZ')} ks)
    </span>
  </div>

  <!-- 1. Executive Cross-KPI Metric Comparison Grid (8 karet) -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '1. Klíčové ukazatele výkonnosti (Cross-Warehouse KPIs)' : '1. Key Cross-Warehouse KPIs'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs ? 'Přímé srovnání objemů, mediánových a průměrných rychlostí operací na 1 kus a vlivu třídění zakázek.' : 'Direct comparison of volume, median and mean operation speeds per unit, and sorting impact.'}
    </div>

    <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
      <!-- 1. Objednávky & Kusy -->
      <div class="kpi-card" style="border-color: rgba(59, 130, 246, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Objem objednávek a kusů' : 'Orders & Units'}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 8px;">
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #60a5fa; display: block;">Ruse</span>
            <div style="font-size: 20px; font-weight: 800; color: #ffffff; font-family: monospace;">${report.ruseTotalOrders.toLocaleString('cs-CZ')}</div>
            <span style="font-size: 11px; color: var(--text-muted);">${report.ruseTotalUnits.toLocaleString('cs-CZ')} ks</span>
          </div>
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #c084fc; display: block;">SVJ</span>
            <div style="font-size: 20px; font-weight: 800; color: #ffffff; font-family: monospace;">${report.svjTotalOrders.toLocaleString('cs-CZ')}</div>
            <span style="font-size: 11px; color: var(--text-muted);">${report.svjTotalUnits.toLocaleString('cs-CZ')} ks</span>
          </div>
        </div>
        <div style="font-size: 11px; display: flex; justify-content: space-between; color: var(--text-muted);">
          <span>${isCs ? 'Průměr ks / zásilka:' : 'Avg items / order:'}</span>
          <span style="color: #ffffff; font-family: monospace;">Ruse: <strong>${report.ruseAvgUnitsPerOrder}</strong> vs SVJ: <strong>${report.svjAvgUnitsPerOrder}</strong></span>
        </div>
      </div>

      <!-- 2. Doba pickování na 1 kus -->
      <div class="kpi-card" style="border-color: rgba(99, 102, 241, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Doba pickování (1 ks)' : 'Picking Time / Item'}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 8px;">
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #60a5fa; display: block;">Ruse (Medián)</span>
            <div style="font-size: 20px; font-weight: 800; color: #ffffff; font-family: monospace;">${formatTimeValue(report.ruseMedianPickPerItemSec, unit)}</div>
            <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">Ø ${formatTimeValue(report.ruseAvgPickPerItemSec, unit)}</span>
          </div>
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #c084fc; display: block;">SVJ (Medián)</span>
            <div style="font-size: 20px; font-weight: 800; color: #c084fc; font-family: monospace;">${formatTimeValue(report.svjMedianPickPerItemSec, unit)}</div>
            <span style="font-size: 11px; color: #e9d5ff; font-family: monospace;">Ø ${formatTimeValue(report.svjAvgPickPerItemSec, unit)}</span>
          </div>
        </div>
        <div style="font-size: 11px; display: flex; justify-content: space-between; color: var(--text-muted);">
          <span>${isCs ? 'Rozdíl mediánů:' : 'Median diff:'}</span>
          ${formatDeltaHtml(report.ruseMedianPickPerItemSec, report.svjMedianPickPerItemSec, 's')}
        </div>
        <div style="font-size: 10px; display: flex; justify-content: space-between; color: #64748b; margin-top: 2px;">
          <span>${isCs ? 'Rozdíl průměrů (Ø):' : 'Mean diff (Ø):'}</span>
          ${formatDeltaHtml(report.ruseAvgPickPerItemSec, report.svjAvgPickPerItemSec, 's')}
        </div>
      </div>

      <!-- 3. Ruční balení na 1 kus -->
      <div class="kpi-card" style="border-color: rgba(16, 185, 129, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Ruční balení (1 ks)' : 'Manual Packing / Item'}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 8px;">
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #60a5fa; display: block;">Ruse (Medián)</span>
            <div style="font-size: 20px; font-weight: 800; color: #ffffff; font-family: monospace;">${formatTimeValue(report.ruseMedianPackPerItemSec, unit)}</div>
            <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">Ø ${formatTimeValue(report.ruseAvgPackPerItemSec, unit)}</span>
          </div>
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #34d399; display: block;">SVJ (Medián)</span>
            <div style="font-size: 20px; font-weight: 800; color: #34d399; font-family: monospace;">${formatTimeValue(report.svjMedianPackPerItemSec, unit)}</div>
            <span style="font-size: 11px; color: #a7f3d0; font-family: monospace;">Ø ${formatTimeValue(report.svjAvgPackPerItemSec, unit)}</span>
          </div>
        </div>
        <div style="font-size: 11px; display: flex; justify-content: space-between; color: var(--text-muted);">
          <span>${isCs ? 'Rozdíl mediánů:' : 'Median pack diff:'}</span>
          ${formatDeltaHtml(report.ruseMedianPackPerItemSec, report.svjMedianPackPerItemSec, 's')}
        </div>
        <div style="font-size: 10px; display: flex; justify-content: space-between; color: #64748b; margin-top: 2px;">
          <span>${isCs ? 'Rozdíl průměrů (Ø):' : 'Mean pack diff (Ø):'}</span>
          ${formatDeltaHtml(report.ruseAvgPackPerItemSec, report.svjAvgPackPerItemSec, 's')}
        </div>
      </div>

      <!-- 4. Sorting v SVJ -->
      <div class="kpi-card" style="border-color: rgba(168, 85, 247, 0.4); background: rgba(88, 28, 135, 0.15);">
        <div class="kpi-card-title" style="color: #c084fc;">${isCs ? 'Sorting v SVJ (Operace navíc)' : 'SVJ Sorting Stage'}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 8px;">
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #94a3b8; display: block;">Ruse</span>
            <div style="font-size: 18px; font-weight: 700; color: #64748b; font-family: monospace;">${isCs ? 'Neprovádí se' : 'None'}</div>
            <span style="font-size: 11px; color: #64748b;">${isCs ? 'Přímé balení' : 'Direct pack'}</span>
          </div>
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #c084fc; display: block;">SVJ Sorting</span>
            <div style="font-size: 20px; font-weight: 800; color: #c084fc; font-family: monospace;">${formatTimeValue(report.svjMedianSortPerItemSec, unit)}</div>
            <span style="font-size: 11px; color: #e9d5ff; font-family: monospace;">Ø ${formatTimeValue(report.svjAvgSortPerItemSec, unit)}</span>
          </div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted);">
          ${isCs ? 'V SVJ jsou zakázky před balením přetříděny ze sběrného boxu.' : 'In SVJ, orders are pre-sorted from the collection tote before packing.'}
        </div>
      </div>

      <!-- 5. Medián objednávek v 1 boxu -->
      <div class="kpi-card" style="border-color: rgba(245, 158, 11, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Medián objednávek v 1 boxu' : 'Median Orders / Box'}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 8px;">
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #60a5fa; display: block;">Ruse</span>
            <div style="font-size: 20px; font-weight: 800; color: #ffffff; font-family: monospace;">${report.ruseMedianOrdersPerBox} obj.</div>
          </div>
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #c084fc; display: block;">SVJ</span>
            <div style="font-size: 20px; font-weight: 800; color: #ffffff; font-family: monospace;">${report.svjMedianOrdersPerBox} obj.</div>
          </div>
        </div>
        <div style="font-size: 11px; display: flex; justify-content: space-between; color: var(--text-muted);">
          <span>${isCs ? 'Hustota konsolidace:' : 'Consolidation density:'}</span>
          <span style="color: #cbd5e1; font-weight: 600;">
            ${report.svjMedianOrdersPerBox > report.ruseMedianOrdersPerBox ? (isCs ? 'Vyšší v SVJ' : 'Higher in SVJ') : (isCs ? 'Vyšší v Ruse' : 'Higher in Ruse')}
          </span>
        </div>
      </div>

      <!-- 6. Celková doba zakázky ve skladu -->
      <div class="kpi-card" style="border-color: rgba(6, 182, 212, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Celková doba zakázky ve skladu' : 'Total Order Lead Time'}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 8px;">
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #60a5fa; display: block;">Ruse</span>
            <div style="font-size: 20px; font-weight: 800; color: #ffffff; font-family: monospace;">~${report.ruseAvgTotalLeadTimeMin} min</div>
            <span style="font-size: 10px; color: var(--text-muted);">Pick + Buffer + Pack</span>
          </div>
          <div>
            <span style="font-size: 11px; font-weight: 600; color: #22d3ee; display: block;">SVJ</span>
            <div style="font-size: 20px; font-weight: 800; color: #22d3ee; font-family: monospace;">~${report.svjAvgTotalLeadTimeMin} min</div>
            <span style="font-size: 10px; color: var(--text-muted);">Pick + Buf1 + Sort + Buf2 + Pack</span>
          </div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted);">
          ${isCs ? `SVJ má 2 meziskladové fronty: ~${report.svjAvgWaitPickToSortMin} min a ~${report.svjAvgWaitSortToPackMin} min` : `SVJ has 2 queue buffers: ~${report.svjAvgWaitPickToSortMin} min and ~${report.svjAvgWaitSortToPackMin} min`}
        </div>
      </div>

      <!-- 7. Sortiment SKU & Pareto 80 % -->
      <div class="kpi-card" style="border-color: rgba(245, 158, 11, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Sortiment SKU & Pareto 80 %' : 'SKU Profile & Pareto 80%'}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 8px;">
          <div>
            <span style="font-size: 10px; font-weight: 600; color: #60a5fa; display: block;">Ruse</span>
            <div style="font-size: 16px; font-weight: 800; color: #ffffff; font-family: monospace;">${report.ruseTotalSkus.toLocaleString('cs-CZ')}</div>
            <span style="font-size: 10px; color: #fbbf24;">80%: ${report.ruseTop80SkusCount}</span>
          </div>
          <div>
            <span style="font-size: 10px; font-weight: 600; color: #c084fc; display: block;">SVJ</span>
            <div style="font-size: 16px; font-weight: 800; color: #ffffff; font-family: monospace;">${report.svjTotalSkus.toLocaleString('cs-CZ')}</div>
            <span style="font-size: 10px; color: #fbbf24;">80%: ${report.svjTop80SkusCount}</span>
          </div>
          <div>
            <span style="font-size: 10px; font-weight: 600; color: #34d399; display: block;">${isCs ? 'Celkem' : 'Total'}</span>
            <div style="font-size: 16px; font-weight: 800; color: #34d399; font-family: monospace;">${(report.totalCombinedSkus || (report.ruseTotalSkus + report.svjTotalSkus)).toLocaleString('cs-CZ')}</div>
            <span style="font-size: 10px; color: #fbbf24;">80%: ${(report.totalCombinedTop80SkusCount || (report.ruseTop80SkusCount + report.svjTop80SkusCount))}</span>
          </div>
        </div>
        <div style="font-size: 11px; display: flex; justify-content: space-between; color: var(--text-muted);">
          <span>${isCs ? 'Koncentrace sortimentu:' : 'Catalog concentration:'}</span>
          <span style="color: #cbd5e1; font-weight: 600;">
            ${report.ruseTop80SkusSharePct < report.svjTop80SkusSharePct
              ? (isCs ? 'Užší portfolio v Ruse' : 'Narrower in Ruse')
              : (isCs ? 'Užší portfolio v SVJ' : 'Narrower in SVJ')}
          </span>
        </div>
      </div>

      <!-- 8. Potenciál Multipickingu -->
      <div class="kpi-card" style="border-color: rgba(16, 185, 129, 0.3);">
        <div class="kpi-card-title">${isCs ? 'Potenciál Multipickingu' : 'Multipick Potential'}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 8px;">
          <div>
            <span style="font-size: 10px; font-weight: 600; color: #60a5fa; display: block;">Ruse</span>
            <div style="font-size: 16px; font-weight: 800; color: #34d399; font-family: monospace;">~${report.ruseMultipickSavedHours} h</div>
            <span style="font-size: 10px; color: var(--text-muted);">(${report.ruseMultipickSavingsPct} %)</span>
          </div>
          <div>
            <span style="font-size: 10px; font-weight: 600; color: #c084fc; display: block;">SVJ</span>
            <div style="font-size: 16px; font-weight: 800; color: #34d399; font-family: monospace;">~${report.svjMultipickSavedHours} h</div>
            <span style="font-size: 10px; color: var(--text-muted);">(${report.svjMultipickSavingsPct} %)</span>
          </div>
          <div>
            <span style="font-size: 10px; font-weight: 600; color: #34d399; display: block;">${isCs ? 'Celkem' : 'Total'}</span>
            <div style="font-size: 16px; font-weight: 800; color: #34d399; font-family: monospace;">~${(report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1)))} h</div>
            <span style="font-size: 10px; color: var(--text-muted);">(${report.totalCombinedMultipickSavingsPct !== undefined ? report.totalCombinedMultipickSavingsPct : Math.round((report.ruseMultipickSavingsPct + report.svjMultipickSavingsPct) / 2)} %)</span>
          </div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted);">
          ${isCs
            ? `2h sloty: Ruse (${report.ruseBaselineMultipickRatioPct}% → ${report.ruseSimulatedMultipickRatioPct}%), SVJ (${report.svjBaselineMultipickRatioPct}% → ${report.svjSimulatedMultipickRatioPct}%)`
            : `2h waves: Ruse (${report.ruseBaselineMultipickRatioPct}% → ${report.ruseSimulatedMultipickRatioPct}%), SVJ (${report.svjBaselineMultipickRatioPct}% → ${report.svjSimulatedMultipickRatioPct}%)`}
        </div>
      </div>
    </div>
  </section>

  <!-- 2. Detailní srovnávací tabulka podle velikosti zakázky (1, 2, 3, 4, 5, 6+ ks) -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '2. Srovnání podle velikosti zakázky (1, 2, 3, 4, 5, 6+ ks)' : '2. Comparison by Order Size Brackets (1, 2, 3, 4, 5, 6+ items)'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs
        ? 'Detailní rozpad časů pickování a ručního balení na 1 kus pro jednotlivé koše zakázek mezi skladem Ruse a SVJ.'
        : 'Detailed breakdown of picking and packing time per item across shipment size brackets.'}
    </div>

    <div style="overflow-x: auto;">
      <table>
        <thead>
          <tr>
            <th>${isCs ? 'Kategorie (Bracket)' : 'Bracket'}</th>
            <th class="text-right">${isCs ? 'Obj. Ruse' : 'Ruse Orders'}</th>
            <th class="text-right">${isCs ? 'Obj. SVJ' : 'SVJ Orders'}</th>
            <th class="text-right" style="color: #60a5fa;">${isCs ? 'Pick Ruse (Medián / Ø)' : 'Ruse Pick (Med / Ø)'}</th>
            <th class="text-right" style="color: #c084fc;">${isCs ? 'Pick SVJ (Medián / Ø)' : 'SVJ Pick (Med / Ø)'}</th>
            <th class="text-right" style="color: #34d399;">${isCs ? 'Pack Ruse (Medián / Ø)' : 'Ruse Pack (Med / Ø)'}</th>
            <th class="text-right" style="color: #2dd4bf;">${isCs ? 'Pack SVJ (Medián / Ø)' : 'SVJ Pack (Med / Ø)'}</th>
            <th class="text-right" style="color: #c084fc;">${isCs ? 'Sorting SVJ (Medián / Ø)' : 'SVJ Sort (Med / Ø)'}</th>
            <th class="text-right">${isCs ? 'Rozdíl Pick (Med / Ø)' : 'Pick Diff (Med / Ø)'}</th>
            <th class="text-right">${isCs ? 'Rozdíl Pack (Med / Ø)' : 'Pack Diff (Med / Ø)'}</th>
          </tr>
        </thead>
        <tbody style="font-family: monospace;">
          ${report.bracketComparisons.map((row) => {
            const isAll = row.bracket === 'all';
            return `
              <tr style="${isAll ? 'background: rgba(49, 46, 129, 0.25); font-weight: bold; border-top: 2px solid rgba(99, 102, 241, 0.4);' : ''}">
                <td style="font-family: sans-serif; font-weight: 700; color: #ffffff;">${escapeHtml(row.label)}</td>
                <td class="text-right" style="color: #cbd5e1;">${row.ruseOrders.toLocaleString('cs-CZ')}</td>
                <td class="text-right" style="color: #cbd5e1;">${row.svjOrders.toLocaleString('cs-CZ')}</td>
                <td class="text-right" style="color: #60a5fa;">
                  <div style="font-weight: 800; color: #ffffff;">${formatTimeValue(row.ruseMedianPickPerItemSec, unit)}</div>
                  <div style="font-size: 10px; color: var(--text-muted); font-weight: normal;">Ø ${formatTimeValue(row.ruseAvgPickPerItemSec, unit)}</div>
                </td>
                <td class="text-right" style="color: #c084fc;">
                  <div style="font-weight: 800; color: #c084fc;">${formatTimeValue(row.svjMedianPickPerItemSec, unit)}</div>
                  <div style="font-size: 10px; color: #e9d5ff; font-weight: normal;">Ø ${formatTimeValue(row.svjAvgPickPerItemSec, unit)}</div>
                </td>
                <td class="text-right" style="color: #34d399;">
                  <div style="font-weight: 800; color: #34d399;">${formatTimeValue(row.ruseMedianPackPerItemSec, unit)}</div>
                  <div style="font-size: 10px; color: var(--text-muted); font-weight: normal;">Ø ${formatTimeValue(row.ruseAvgPackPerItemSec, unit)}</div>
                </td>
                <td class="text-right" style="color: #2dd4bf;">
                  <div style="font-weight: 800; color: #2dd4bf;">${formatTimeValue(row.svjMedianPackPerItemSec, unit)}</div>
                  <div style="font-size: 10px; color: #99f6e4; font-weight: normal;">Ø ${formatTimeValue(row.svjAvgPackPerItemSec, unit)}</div>
                </td>
                <td class="text-right" style="color: #c084fc;">
                  ${row.svjMedianSortPerItemSec > 0 ? `
                    <div style="font-weight: 800; color: #c084fc;">${formatTimeValue(row.svjMedianSortPerItemSec, unit)}</div>
                    <div style="font-size: 10px; color: #e9d5ff; font-weight: normal;">Ø ${formatTimeValue(row.svjAvgSortPerItemSec, unit)}</div>
                  ` : '–'}
                </td>
                <td class="text-right">
                  <div style="font-weight: 700; color: ${row.pickMedianDiffPct > 0 ? '#fbbf24' : '#34d399'};">
                    ${row.pickMedianDiffPct > 0 ? '+' : ''}${row.pickMedianDiffPct}%
                  </div>
                  <div style="font-size: 10px; font-weight: normal; color: ${row.pickDiffPct > 0 ? '#f59e0b' : '#10b981'};">
                    Ø ${row.pickDiffPct > 0 ? '+' : ''}${row.pickDiffPct}%
                  </div>
                </td>
                <td class="text-right">
                  <div style="font-weight: 700; color: ${row.packMedianDiffPct > 0 ? '#fbbf24' : '#34d399'};">
                    ${row.packMedianDiffPct > 0 ? '+' : ''}${row.packMedianDiffPct}%
                  </div>
                  <div style="font-size: 10px; font-weight: normal; color: ${row.packDiffPct > 0 ? '#f59e0b' : '#10b981'};">
                    Ø ${row.packDiffPct > 0 ? '+' : ''}${row.packDiffPct}%
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  </section>

  <!-- 3. Srovnání potenciálu optimalizace Multipickingu (2h časové sloty) -->
  <section class="content-box" style="border-color: rgba(16, 185, 129, 0.35);">
    <div class="section-title">
      <span>${isCs ? '3. Srovnání optimalizace z multipickingu (přeskupení do 2h slotů)' : '3. Multipicking Optimization Potential (2-hour Slot Simulation)'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs
        ? 'Porovnání potenciálních časových úspor při shlukování stejných SKU do společných sběrných boxů přes 2h vlnové sloty.'
        : 'Comparison of potential time and labor savings when batching shared SKUs into 2-hour collection waves.'}
    </div>

    <div class="kpi-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">
      <!-- Ruse Multipicking Card -->
      <div class="kpi-card" style="border-color: rgba(59, 130, 246, 0.3);">
        <div class="kpi-card-title" style="color: #60a5fa;">
          <span>${isCs ? 'Sklad Ruse — Multipicking' : 'Ruse Warehouse — Multipicking'}</span>
          <span style="color: #34d399; font-family: monospace;">~${report.ruseMultipickSavedHours} h (${report.ruseMultipickSavingsPct} %)</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: monospace; margin: 10px 0;">
          <div style="background: rgba(30, 41, 59, 0.6); padding: 8px; border-radius: 8px; border: 1px solid #334155;">
            <span style="font-size: 10px; color: var(--text-muted); font-family: sans-serif; display: block;">${isCs ? 'Stávající multipick:' : 'Baseline multipick:'}</span>
            <span style="font-size: 14px; font-weight: 700; color: #ffffff;">${report.ruseBaselineMultipickRatioPct} %</span>
          </div>
          <div style="background: rgba(30, 41, 59, 0.6); padding: 8px; border-radius: 8px; border: 1px solid #334155;">
            <span style="font-size: 10px; color: #34d399; font-family: sans-serif; display: block;">${isCs ? 'Simulovaný multipick:' : 'Simulated multipick:'}</span>
            <span style="font-size: 14px; font-weight: 700; color: #34d399;">${report.ruseSimulatedMultipickRatioPct} %</span>
          </div>
        </div>
        <p style="font-size: 11px; color: var(--text-muted);">
          ${isCs
            ? `V Ruse umožňuje přeskupení do 2h slotů ušetřit ~${report.ruseMultipickSavedHours} hodin práce pickování díky přímému sběru stejných položek do boxu.`
            : `In Ruse, wave clustering into 2h slots can save ~${report.ruseMultipickSavedHours} hours of picking labor.`}
        </p>
      </div>

      <!-- SVJ Multipicking Card -->
      <div class="kpi-card" style="border-color: rgba(168, 85, 247, 0.3);">
        <div class="kpi-card-title" style="color: #c084fc;">
          <span>${isCs ? 'Sklad SVJ — Multipicking' : 'SVJ Warehouse — Multipicking'}</span>
          <span style="color: #34d399; font-family: monospace;">~${report.svjMultipickSavedHours} h (${report.svjMultipickSavingsPct} %)</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: monospace; margin: 10px 0;">
          <div style="background: rgba(30, 41, 59, 0.6); padding: 8px; border-radius: 8px; border: 1px solid #334155;">
            <span style="font-size: 10px; color: var(--text-muted); font-family: sans-serif; display: block;">${isCs ? 'Stávající multipick:' : 'Baseline multipick:'}</span>
            <span style="font-size: 14px; font-weight: 700; color: #ffffff;">${report.svjBaselineMultipickRatioPct} %</span>
          </div>
          <div style="background: rgba(30, 41, 59, 0.6); padding: 8px; border-radius: 8px; border: 1px solid #334155;">
            <span style="font-size: 10px; color: #34d399; font-family: sans-serif; display: block;">${isCs ? 'Simulovaný multipick:' : 'Simulated multipick:'}</span>
            <span style="font-size: 14px; font-weight: 700; color: #34d399;">${report.svjSimulatedMultipickRatioPct} %</span>
          </div>
        </div>
        <p style="font-size: 11px; color: var(--text-muted);">
          ${isCs
            ? `V SVJ je potenciál úspory ~${report.svjMultipickSavedHours} hodin. Vzhledem k následnému sortingu je synergický efekt v pickování maximalizován.`
            : `In SVJ, the savings potential is ~${report.svjMultipickSavedHours} hours with automated downstream sorting.`}
        </p>
      </div>

      <!-- Combined Card -->
      <div class="kpi-card" style="border-color: rgba(16, 185, 129, 0.4); background: rgba(6, 78, 59, 0.15);">
        <div class="kpi-card-title" style="color: #34d399;">
          <span>${isCs ? 'Celková úspora (oba sklady)' : 'Combined Savings (Both Sites)'}</span>
          <span style="color: #34d399; font-family: monospace; font-size: 14px;">
            ~${(report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1)))} h
          </span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: monospace; margin: 10px 0;">
          <div style="background: rgba(30, 41, 59, 0.6); padding: 8px; border-radius: 8px; border: 1px solid #334155;">
            <span style="font-size: 10px; color: var(--text-muted); font-family: sans-serif; display: block;">${isCs ? 'Průměrná úspora času:' : 'Avg time savings:'}</span>
            <span style="font-size: 14px; font-weight: 700; color: #34d399;">
              ${report.totalCombinedMultipickSavingsPct !== undefined ? report.totalCombinedMultipickSavingsPct : Math.round((report.ruseMultipickSavingsPct + report.svjMultipickSavingsPct) / 2)} %
            </span>
          </div>
          <div style="background: rgba(30, 41, 59, 0.6); padding: 8px; border-radius: 8px; border: 1px solid #334155;">
            <span style="font-size: 10px; color: var(--text-muted); font-family: sans-serif; display: block;">${isCs ? 'Cílový multipick:' : 'Target multipick:'}</span>
            <span style="font-size: 14px; font-weight: 700; color: #ffffff;">75–80 % multi</span>
          </div>
        </div>
        <p style="font-size: 11px; color: var(--text-muted);">
          ${isCs
            ? `Celkový potenciál obou provozů činí ~${(report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1)))} hodin ušetřeného personálního času při zavedení 2h vlnových oken.`
            : `Total potential across both operations amounts to ~${(report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1)))} labor hours saved.`}
        </p>
      </div>
    </div>
  </section>

  <!-- 4. Sortiment SKU & Analýza Pareto (80/20) za dané období -->
  <section class="content-box" style="border-color: rgba(245, 158, 11, 0.35);">
    <div class="section-title">
      <span>${isCs ? '4. Sortiment SKU & Analýza Pareto (80/20) za dané období' : '4. SKU Assortment & Pareto (80/20) Analysis'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs
        ? 'Srovnání celkového počtu unikátních položek (SKU), podílu klíčových 80 % sortimentu tvořících drtivou většinu expedice a long-tail produktů.'
        : 'Comparison of total distinct SKUs, core 80% volume items driving the fulfillment volume, and long-tail products.'}
    </div>

    <div style="overflow-x: auto; margin-bottom: 16px;">
      <table>
        <thead>
          <tr>
            <th>${isCs ? 'Metrika sortimentu' : 'Assortment Metric'}</th>
            <th class="text-right" style="color: #60a5fa;">${isCs ? 'Sklad Ruse' : 'Ruse Warehouse'}</th>
            <th class="text-right" style="color: #c084fc;">${isCs ? 'Sklad SVJ' : 'SVJ Warehouse'}</th>
            <th class="text-right" style="color: #34d399;">${isCs ? 'Celkem oba sklady' : 'Combined Total'}</th>
          </tr>
        </thead>
        <tbody style="font-family: monospace;">
          <tr>
            <td style="font-family: sans-serif; font-weight: 700; color: #ffffff;">${isCs ? 'Celkový počet unikátních SKU za období' : 'Total unique SKUs in period'}</td>
            <td class="text-right" style="color: #60a5fa; font-weight: 700;">${report.ruseTotalSkus.toLocaleString('cs-CZ')} SKU</td>
            <td class="text-right" style="color: #c084fc; font-weight: 700;">${report.svjTotalSkus.toLocaleString('cs-CZ')} SKU</td>
            <td class="text-right" style="color: #34d399; font-weight: 700;">${(report.totalCombinedSkus || (report.ruseTotalSkus + report.svjTotalSkus)).toLocaleString('cs-CZ')} SKU</td>
          </tr>
          <tr style="background: rgba(245, 158, 11, 0.1);">
            <td style="font-family: sans-serif; font-weight: 700; color: #fde68a;">${isCs ? 'Počet SKU tvořících 80 % veškerého objemu' : 'SKUs driving 80% of volume'}</td>
            <td class="text-right" style="color: #fbbf24; font-weight: 700;">${report.ruseTop80SkusCount.toLocaleString('cs-CZ')} SKU</td>
            <td class="text-right" style="color: #fbbf24; font-weight: 700;">${report.svjTop80SkusCount.toLocaleString('cs-CZ')} SKU</td>
            <td class="text-right" style="color: #fbbf24; font-weight: 700;">${(report.totalCombinedTop80SkusCount || (report.ruseTop80SkusCount + report.svjTop80SkusCount)).toLocaleString('cs-CZ')} SKU</td>
          </tr>
          <tr>
            <td style="font-family: sans-serif; color: var(--text-muted);">${isCs ? 'Podíl 80 % SKU na celkovém sortimentu (%)' : 'Share of 80% SKUs on assortment (%)'}</td>
            <td class="text-right" style="color: #cbd5e1;">${report.ruseTop80SkusSharePct} %</td>
            <td class="text-right" style="color: #cbd5e1;">${report.svjTop80SkusSharePct} %</td>
            <td class="text-right" style="color: #34d399; font-weight: 700;">${report.totalCombinedTop80SkusSharePct || Math.round(((report.ruseTop80SkusCount + report.svjTop80SkusCount) / Math.max(1, report.ruseTotalSkus + report.svjTotalSkus)) * 100)} %</td>
          </tr>
          <tr>
            <td style="font-family: sans-serif; color: var(--text-muted);">${isCs ? 'Zbývajících 20 % objemu (Long tail SKU)' : 'Remaining 20% volume (Long-tail)'}</td>
            <td class="text-right" style="color: #64748b;">${Math.max(0, report.ruseTotalSkus - report.ruseTop80SkusCount).toLocaleString('cs-CZ')} SKU</td>
            <td class="text-right" style="color: #64748b;">${Math.max(0, report.svjTotalSkus - report.svjTop80SkusCount).toLocaleString('cs-CZ')} SKU</td>
            <td class="text-right" style="color: #64748b;">${Math.max(0, (report.totalCombinedSkus || (report.ruseTotalSkus + report.svjTotalSkus)) - (report.totalCombinedTop80SkusCount || (report.ruseTop80SkusCount + report.svjTop80SkusCount))).toLocaleString('cs-CZ')} SKU</td>
          </tr>
          <tr>
            <td style="font-family: sans-serif; color: var(--text-muted);">${isCs ? 'Průměrný počet kusů na 1 SKU za období' : 'Avg units per SKU in period'}</td>
            <td class="text-right" style="color: #cbd5e1;">${(report.ruseTotalUnits / Math.max(1, report.ruseTotalSkus)).toFixed(1)} ks/SKU</td>
            <td class="text-right" style="color: #cbd5e1;">${(report.svjTotalUnits / Math.max(1, report.svjTotalSkus)).toFixed(1)} ks/SKU</td>
            <td class="text-right" style="color: #34d399; font-weight: 700;">${((report.ruseTotalUnits + report.svjTotalUnits) / Math.max(1, report.totalCombinedSkus || (report.ruseTotalSkus + report.svjTotalSkus))).toFixed(1)} ks/SKU</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TOP 5 Products for Ruse & SVJ -->
    ${((report.ruseTopProducts && report.ruseTopProducts.length > 0) || (report.svjTopProducts && report.svjTopProducts.length > 0)) ? `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-top: 14px; margin-bottom: 14px;">
        ${(report.ruseTopProducts && report.ruseTopProducts.length > 0) ? `
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 14px; padding: 14px;">
            <span style="font-size: 11px; font-weight: 800; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
              ${isCs ? 'Sklad Ruse — TOP 5 nejexpedovanějších SKU' : 'Ruse — TOP 5 Dispatched SKUs'}
            </span>
            <div style="display: flex; flex-direction: column; gap: 6px; font-family: monospace; font-size: 11px;">
              ${report.ruseTopProducts.map((p: any, i: number) => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.7); border: 1px solid #334155; border-radius: 8px; padding: 6px 10px;">
                  <span><span style="color: #64748b; font-family: sans-serif; font-size: 10px;">#${i + 1}</span> <strong style="color: #ffffff;">${escapeHtml(p.ean)}</strong></span>
                  <span><strong style="color: #60a5fa;">${p.units.toLocaleString('cs-CZ')} ks</strong> <span style="color: var(--text-muted); font-size: 10px;">(${p.sharePct} %)</span></span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${(report.svjTopProducts && report.svjTopProducts.length > 0) ? `
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 14px; padding: 14px;">
            <span style="font-size: 11px; font-weight: 800; color: #c084fc; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
              ${isCs ? 'Sklad SVJ — TOP 5 nejexpedovanějších SKU' : 'SVJ — TOP 5 Dispatched SKUs'}
            </span>
            <div style="display: flex; flex-direction: column; gap: 6px; font-family: monospace; font-size: 11px;">
              ${report.svjTopProducts.map((p: any, i: number) => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(30, 41, 59, 0.7); border: 1px solid #334155; border-radius: 8px; padding: 6px 10px;">
                  <span><span style="color: #64748b; font-family: sans-serif; font-size: 10px;">#${i + 1}</span> <strong style="color: #ffffff;">${escapeHtml(p.ean)}</strong></span>
                  <span><strong style="color: #c084fc;">${p.units.toLocaleString('cs-CZ')} ks</strong> <span style="color: var(--text-muted); font-size: 10px;">(${p.sharePct} %)</span></span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- Recommendations ABC -->
    <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 14px 18px; font-size: 12px; color: #fde68a; line-height: 1.6;">
      <strong>${isCs ? 'Strategické doporučení pro skladování (ABC Analýza):' : 'Warehouse Storage Recommendation (ABC Analysis):'}</strong>{' '}
      ${isCs
        ? `Položky tvořící 80 % objemu (${report.ruseTop80SkusCount} SKU v Ruse a ${report.svjTop80SkusCount} SKU v SVJ) doporučujeme umístit do "Zlaté zóny" (A-lokací) v nejnižších regálech nejblíže konsolidačnímu uzlu a sorteru. To zkrátí trasu pickera o dalších 25–35 % při sběru objednávek.`
        : `The 80% volume items (${report.ruseTop80SkusCount} SKUs in Ruse and ${report.svjTop80SkusCount} SKUs in SVJ) should be designated as Grade-A fast-movers located near packing and sorting nodes to reduce picker walking distance by 25–35%.`}
    </div>
  </section>

  <!-- 5. Porovnání procesního řetězce (Architektura toku Ruse vs SVJ) -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '5. Porovnání procesního řetězce (Architektura toku Ruse vs SVJ)' : '5. Process Flow Architecture (Ruse vs SVJ)'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs ? 'Porovnání fází expedice a meziskladových časových front.' : 'Comparison of fulfillment stages and staging queues.'}
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
      <!-- Ruse Flow -->
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 16px; padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 12px;">
          <h4 style="font-size: 13px; font-weight: 800; color: #60a5fa;">${isCs ? 'Architektura toku: Sklad Ruse' : 'Process Flow: Ruse Warehouse'}</h4>
          <span style="font-size: 11px; color: #60a5fa; font-weight: 700;">${isCs ? '2 hlavní operace' : '2 stages'}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
          <div style="background: rgba(30, 58, 138, 0.25); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #93c5fd; display: block;">1. Sběrné pickování (Batch Picking)</strong>
              <span style="font-size: 11px; color: var(--text-muted);">${isCs ? 'Sdružené pickování položek do sběrného boxu' : 'Batch picking into tote'}</span>
            </div>
            <span style="font-family: monospace; font-weight: 800; color: #ffffff;">${formatTimeValue(report.ruseAvgPickPerItemSec, unit)} / ks</span>
          </div>

          <div style="background: rgba(15, 23, 42, 0.6); border: 1px dashed #334155; border-radius: 8px; padding: 8px; text-align: center; font-size: 11px; color: var(--text-muted);">
            ${isCs ? `Meziskladový buffer přepravek: průměrně ~${report.ruseAvgWaitPickToPackMin} min` : `Tote buffer: avg ~${report.ruseAvgWaitPickToPackMin} min`}
          </div>

          <div style="background: rgba(6, 78, 59, 0.25); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #6ee7b7; display: block;">2. Balení ze sběrného boxu (Packing)</strong>
              <span style="font-size: 11px; color: var(--text-muted);">${isCs ? 'Přímé dohledání položek a balení ze sběrného boxu' : 'Direct packing from collection tote'}</span>
            </div>
            <span style="font-family: monospace; font-weight: 800; color: #ffffff;">${formatTimeValue(report.ruseAvgPackPerItemSec, unit)} / ks</span>
          </div>
        </div>
      </div>

      <!-- SVJ Flow -->
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 16px; padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 12px;">
          <h4 style="font-size: 13px; font-weight: 800; color: #c084fc;">${isCs ? 'Architektura toku: Sklad SVJ' : 'Process Flow: SVJ Warehouse'}</h4>
          <span style="font-size: 11px; color: #c084fc; font-weight: 700;">${isCs ? '3 operace (+ Sorting)' : '3 stages (+ Sorting)'}</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
          <div style="background: rgba(30, 58, 138, 0.25); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #93c5fd; display: block;">1. Sběrné pickování (Picking)</strong>
              <span style="font-size: 11px; color: var(--text-muted);">${isCs ? 'Sběr do přepravky podle cyklů' : 'Cycle picking into tote'}</span>
            </div>
            <span style="font-family: monospace; font-weight: 800; color: #ffffff;">${formatTimeValue(report.svjAvgPickPerItemSec, unit)} / ks</span>
          </div>

          <div style="background: rgba(15, 23, 42, 0.6); border: 1px dashed #334155; border-radius: 8px; padding: 8px; text-align: center; font-size: 11px; color: var(--text-muted);">
            ${isCs ? `Buffer 1 (před sortingem): průměrně ~${report.svjAvgWaitPickToSortMin} min` : `Buffer 1 (pre-sort): avg ~${report.svjAvgWaitPickToSortMin} min`}
          </div>

          <div style="background: rgba(88, 28, 135, 0.25); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #c084fc; display: block;">2. Sorting (Třídění)</strong>
              <span style="font-size: 11px; color: var(--text-muted);">${isCs ? 'Přetřídění sběrného boxu do slotů objednávek' : 'Sorting crate into order slots'}</span>
            </div>
            <span style="font-family: monospace; font-weight: 800; color: #c084fc;">${formatTimeValue(report.svjAvgSortPerItemSec, unit)} / ks</span>
          </div>

          <div style="background: rgba(15, 23, 42, 0.6); border: 1px dashed #334155; border-radius: 8px; padding: 8px; text-align: center; font-size: 11px; color: var(--text-muted);">
            ${isCs ? `Buffer 2 (před ručním balením): průměrně ~${report.svjAvgWaitSortToPackMin} min` : `Buffer 2 (pre-pack): avg ~${report.svjAvgWaitSortToPackMin} min`}
          </div>

          <div style="background: rgba(13, 148, 136, 0.25); border: 1px solid rgba(20, 184, 166, 0.3); border-radius: 10px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: #5eead4; display: block;">3. Ruční balení (Manual Packing)</strong>
              <span style="font-size: 11px; color: var(--text-muted);">${isCs ? 'Zabalení z vytříděného slotu (stanice javi)' : 'Packing from sorted slot (station javi)'}</span>
            </div>
            <span style="font-family: monospace; font-weight: 800; color: #ffffff;">${formatTimeValue(report.svjAvgPackPerItemSec, unit)} / ks</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 6. Závěrečná syntéza a manažerská doporučení -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '6. Strategická manažerská doporučení a závěry' : '6. Strategic Management Recommendations'}</span>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; font-size: 12px; line-height: 1.6; margin-top: 14px;">
      <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid #334155; border-radius: 12px; padding: 16px;">
        <strong style="color: #60a5fa; display: block; margin-bottom: 6px; font-size: 13px;">
          ${isCs ? '1. Vliv meziskladového sortingu' : '1. Sorting Overhead Impact'}
        </strong>
        ${isCs
          ? 'Proces sortingu v SVJ přidává k celkovému času na 1 kus v průměru ' + formatTimeValue(report.svjAvgSortPerItemSec, unit) + ' (medián ' + formatTimeValue(report.svjMedianSortPerItemSec, unit) + '). Tento krok je vysoce efektivní pro vícekusé objednávky, u 1kusových zásilek je však vhodné uvažovat o přímém bypassu (přímé balení).'
          : 'Sorting adds an average overhead per unit of ' + formatTimeValue(report.svjAvgSortPerItemSec, unit) + '. It improves packing efficiency for multi-item orders, but single-item orders should bypass the sort station.'}
      </div>

      <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid #334155; border-radius: 12px; padding: 16px;">
        <strong style="color: #34d399; display: block; margin-bottom: 6px; font-size: 13px;">
          ${isCs ? '2. Přínos 2h multipickingu' : '2. 2-Hour Wave Multipick Gain'}
        </strong>
        ${isCs
          ? 'Při shlukování objednávek do 2h slotů vzniká na obou skladech celková úspora ~' + (report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1))) + ' hodin práce pickování. Doporučujeme plošnou implementaci vlnového řízení do WMS.'
          : 'Clustering orders into 2-hour waves creates a total saving of ~' + (report.totalCombinedMultipickSavedHours !== undefined ? report.totalCombinedMultipickSavedHours : Number((report.ruseMultipickSavedHours + report.svjMultipickSavedHours).toFixed(1))) + ' hours across both operations.'}
      </div>

      <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid #334155; border-radius: 12px; padding: 16px;">
        <strong style="color: #fbbf24; display: block; margin-bottom: 6px; font-size: 13px;">
          ${isCs ? '3. Vyrovnání front bufferů' : '3. Staging Queue Balancing'}
        </strong>
        ${isCs
          ? 'V SVJ dosahuje meziskladová fronta před sortingem ~' + report.svjAvgWaitPickToSortMin + ' min a před balením ~' + report.svjAvgWaitSortToPackMin + ' min. Dynamická alokace operátorů mezi sorting a balení zkrátí celkový lead time objednávky o 30–45 %.'
          : 'In SVJ, queue buffer times indicate opportunity for dynamic operator reallocation between sorting and packing stations.'}
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <p>Warehouse Pick &amp; Pack Analytics • ${isCs ? 'Srovnávací report skladů Ruse a SVJ vygenerovaný přímo z databázové mezipaměti.' : 'Cross-warehouse comparison report generated directly from database analytics.'}</p>
  </footer>
</div>

</body>
</html>`;
}

/**
 * Triggers a browser download of the generated HTML report.
 */
export function downloadHtmlReport(data: HtmlReportData): void {
  const htmlContent = generateHtmlReport(data);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  const whSlug = data.warehouse === 'summary'
    ? '_srovnani_skladu_ruse_svj'
    : data.warehouse
    ? `_${data.warehouse}`
    : '';
  link.href = url;
  link.setAttribute('download', `skladovy_report${whSlug}_${dateStr}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
