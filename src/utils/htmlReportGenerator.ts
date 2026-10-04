import { MovementRecord, FilterState, ItemBracket } from '../types.js';
import {
  computeBracketStatistics,
  computeDailyPerformanceReport,
  computeBoxSynergyAndHypothesis,
  runMultipickSlotSimulation,
  computePeriodSummary,
  formatTimeValue,
  formatDurationHuman,
  getBracketLabel,
} from './analytics.js';

export interface HtmlReportData {
  records: MovementRecord[];
  filter: FilterState;
  unit: 'sec' | 'min';
  lang: 'cs' | 'en';
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
  const { records, filter, unit, lang } = data;
  const isCs = lang === 'cs';

  const bracketStats = computeBracketStatistics(records);
  const synergyData = computeBoxSynergyAndHypothesis(records);
  const dailyReport = computeDailyPerformanceReport(records);
  const simulation = runMultipickSlotSimulation(records);
  const periodSummary = computePeriodSummary(records);

  const totalOrders = records.length;
  const totalUnits = records.reduce((sum, r) => sum + (r.pocet_produktu || 1), 0);
  const totalPickSec = records.reduce((sum, r) => sum + r.pick_duration_s, 0);
  const totalPackSec = records.reduce((sum, r) => sum + r.pack_duration_s, 0);
  const avgPickPerItem = totalUnits > 0 ? totalPickSec / totalUnits : 0;
  const avgPackPerItem = totalUnits > 0 ? totalPackSec / totalUnits : 0;
  const avgTotalPerItem = avgPickPerItem + avgPackPerItem;

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
  const simDetailed = simulation.bracketResults.filter(b => b.bracket !== 'all');
  const simAll = simulation.bracketResults.find(b => b.bracket === 'all') || simulation.bracketResults[simulation.bracketResults.length - 1];

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
        <span class="brand-badge">${isCs ? 'Kompletní Offline Export' : 'Full Offline Report'}</span>
      </div>
      <div class="report-subtitle">
        ${isCs ? 'Analytický a optimalizační report expedice skladu v identickém rozsahu jako v aplikaci' : 'Warehouse fulfillment & optimization report in full live dashboard scope'} • 
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
  </section>

  <!-- KPI Overview -->
  <section>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-card-title">${isCs ? 'Celkem vyřízených zásilek' : 'Total shipments'}</div>
        <div class="kpi-card-value">${totalOrders.toLocaleString('cs-CZ')}</div>
        <div class="kpi-card-sub">${totalUnits.toLocaleString('cs-CZ')} ${isCs ? 'expedovaných kusů' : 'shipped items'}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-card-title">${isCs ? 'Průměrný čas na 1 kus (Celkem)' : 'Avg Total per Item'}</div>
        <div class="kpi-card-value" style="color: #818cf8;">${formatTimeValue(avgTotalPerItem, unit)}</div>
        <div class="kpi-card-sub">${isCs ? 'Pickování' : 'Picking'} + ${isCs ? 'Balení' : 'Packing'}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-card-title">${isCs ? 'Průměrný čas pickování (1 ks)' : 'Avg Picking per Item'}</div>
        <div class="kpi-card-value" style="color: #60a5fa;">${formatTimeValue(avgPickPerItem, unit)}</div>
        <div class="kpi-card-sub">${formatDurationHuman(totalPickSec)} ${isCs ? 'čistého času picku' : 'total pick time'}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-card-title">${isCs ? 'Průměrný čas balení (1 ks)' : 'Avg Packing per Item'}</div>
        <div class="kpi-card-value" style="color: #34d399;">${formatTimeValue(avgPackPerItem, unit)}</div>
        <div class="kpi-card-sub">${formatDurationHuman(totalPackSec)} ${isCs ? 'čistého času balení' : 'total pack time'}</div>
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
      ${bracketStats.map(b => `
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
          <th class="text-right">${isCs ? 'Balení / 1ks (Průměr)' : 'Pack / item (Avg)'}</th>
          <th class="text-right">${isCs ? 'Celkem / 1ks (Průměr)' : 'Total / item (Avg)'}</th>
          <th class="text-right">${isCs ? 'Medián / 1ks' : 'Median / item'}</th>
          <th class="text-right">${isCs ? 'Čas na objednávku' : 'Time per Order'}</th>
        </tr>
      </thead>
      <tbody>
        ${bracketStats.map(b => `
          <tr>
            <td><strong>${escapeHtml(getBracketLabel(b.bracket))}</strong></td>
            <td class="text-right font-mono">${b.shipmentCount.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono">${b.shipmentSharePct}%</td>
            <td class="text-right font-mono">${b.itemCount.toLocaleString('cs-CZ')}</td>
            <td class="text-right font-mono" style="color: #60a5fa;">${formatTimeValue(b.avgPickPerItemSec, unit)}</td>
            <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(b.avgPackPerItemSec, unit)}</td>
            <td class="text-right font-mono" style="color: #a5b4fc; font-weight: 700;">${formatTimeValue(b.avgTotalPerItemSec, unit)}</td>
            <td class="text-right font-mono">${formatTimeValue(b.medianTotalPerItemSec, unit)}</td>
            <td class="text-right font-mono" style="font-weight: 700;">${formatTimeValue(b.avgPickTotalSec + b.avgPackTotalSec, unit)}</td>
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
        <span class="font-mono" style="color: #94a3b8;">${synergyData.boxStats.length} ${isCs ? 'boxů' : 'totes'} (${((high.totalUnits || 0) + (med.totalUnits || 0) + (low.totalUnits || 0)).toLocaleString('cs-CZ')} ${isCs ? 'kusů' : 'units'})</span>
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
        ${bracketComparisons.map(b => `
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
        ${dailyReport.dayOfWeekStats.map(d => `
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
          ${dailyReport.dailyStats.slice(0, 15).map(ds => `
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
        ${simDetailed.map(b => `
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
      ${simDetailed.map(b => {
        const maxTime = Math.max(...simDetailed.map(x => x.baselineTotalSec));
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
 * Triggers a browser download of the generated HTML report.
 */
export function downloadHtmlReport(data: HtmlReportData): void {
  const htmlContent = generateHtmlReport(data);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `skladovy_report_pick_pack_${dateStr}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
