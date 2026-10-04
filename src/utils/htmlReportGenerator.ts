import { MovementRecord, FilterState, ItemBracket } from '../types.js';
import {
  computeBracketStatistics,
  computeDailyPerformanceReport,
  computeBoxSynergyAndHypothesis,
  runMultipickSlotSimulation,
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

export function generateHtmlReport(data: HtmlReportData): string {
  const { records, filter, unit, lang } = data;
  const isCs = lang === 'cs';

  const bracketStats = computeBracketStatistics(records);
  const synergyData = computeBoxSynergyAndHypothesis(records);
  const dailyReport = computeDailyPerformanceReport(records);
  const simulation = runMultipickSlotSimulation(records);

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
      max-width: 1200px;
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
      font-size: 13px;
      text-align: left;
      margin-top: 12px;
    }

    th {
      background: rgba(15, 23, 42, 0.9);
      color: #94a3b8;
      font-weight: 600;
      padding: 12px 14px;
      border-bottom: 2px solid #334155;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }

    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(51, 65, 85, 0.6);
      color: #e2e8f0;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .text-right { text-align: right; }
    .text-center { text-align: center; }

    /* Bracket Comparison Cards */
    .bracket-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
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

    .badge-diff-good {
      color: #34d399;
      font-weight: 600;
    }
    .badge-diff-warn {
      color: #fbbf24;
      font-weight: 600;
    }

    /* Simulation summary card */
    .sim-card {
      background: linear-gradient(135deg, rgba(30, 27, 75, 0.4), rgba(15, 23, 42, 0.8));
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 18px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .sim-metric {
      display: flex;
      flex-direction: column;
    }

    .sim-metric-val {
      font-size: 24px;
      font-weight: 800;
      color: #38bdf8;
    }

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
      .report-header, .filter-meta-bar, .content-box, .kpi-card, .sim-card {
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
        <span class="brand-badge">${isCs ? 'Offline Export' : 'Offline Report'}</span>
      </div>
      <div class="report-subtitle">
        ${isCs ? 'Analytický a optimalizační report expedice skladu' : 'Warehouse fulfillment & optimization report'} • 
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
            <td class="text-right font-mono font-weight-bold">${formatTimeValue(b.avgPickTotalSec + b.avgPackTotalSec, unit)}</td>
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
      ${isCs ? 'Ověření vlivu shody produktů (stejných EANů) ve sběrném boxu na rychlost pickování a balení.' : 'Verification of SKU overlap in collection totes on pick and pack speed.'}
    </div>

    <div class="sim-card">
      <div class="sim-metric">
        <span class="filter-label">${isCs ? 'Zrychlení pickování při vysokém překryvu SKU:' : 'Picking speedup in high SKU overlap totes:'}</span>
        <span class="sim-metric-val" style="color: #34d399;">+${synergyData.hypothesis.pickingSpeedupPct}%</span>
        <span style="font-size: 11px; color: #94a3b8;">${isCs ? 'O tolik rychleji se vychystává 1 kus v boxech s vysokou shodou produktů.' : 'Faster picking per item in totes with shared SKUs.'}</span>
      </div>
      <div class="sim-metric">
        <span class="filter-label">${isCs ? 'Vliv na balení u 1-2 ks objednávek:' : 'Pack speedup for 1-2 item orders:'}</span>
        <span class="sim-metric-val" style="color: #38bdf8;">+${synergyData.hypothesis.packingSpeedupPct}%</span>
        <span style="font-size: 11px; color: #94a3b8;">${isCs ? 'Rychlejší zabalení díky jednoduché identifikaci stejných položek.' : 'Faster packing due to identical single/double SKUs.'}</span>
      </div>
      <div class="sim-metric">
        <span class="filter-label">${isCs ? 'Zpomalení balení u různorodých vícekusů:' : 'Packing slowdown for diverse multi-items:'}</span>
        <span class="sim-metric-val" style="color: #fbbf24;">${synergyData.hypothesis.packingSlowdownInDiverseMultiItemPct}%</span>
        <span style="font-size: 11px; color: #94a3b8;">${isCs ? 'Při míchání mnoha odlišných vícepoložkových objednávek v jednom boxu.' : 'When diverse multi-item orders are mixed in one tote.'}</span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>${isCs ? 'Úroveň překryvu produktů v boxu' : 'Tote Overlap Tier'}</th>
          <th class="text-right">${isCs ? 'Počet boxů' : 'Box Count'}</th>
          <th class="text-right">${isCs ? 'Zásilek' : 'Orders'}</th>
          <th class="text-right">${isCs ? 'Kusů' : 'Items'}</th>
          <th class="text-right">${isCs ? 'Pick / 1ks' : 'Pick / Item'}</th>
          <th class="text-right">${isCs ? 'Balení / 1ks' : 'Pack / Item'}</th>
          <th class="text-right">${isCs ? 'Celkem / 1ks' : 'Total / Item'}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong style="color: #34d399;">${isCs ? 'Vysoký překryv (více stejných EANů na box)' : 'High Overlap (multiple identical SKUs)'}</strong></td>
          <td class="text-right font-mono">${synergyData.hypothesis.highOverlapBoxes.count}</td>
          <td class="text-right font-mono">${(synergyData.hypothesis.highOverlapBoxes.categories['all']?.orderCount || 0).toLocaleString('cs-CZ')}</td>
          <td class="text-right font-mono">${(synergyData.hypothesis.highOverlapBoxes.categories['all']?.itemCount || 0).toLocaleString('cs-CZ')}</td>
          <td class="text-right font-mono" style="color: #60a5fa;">${formatTimeValue(synergyData.hypothesis.highOverlapBoxes.avgPickPerUnitSec, unit)}</td>
          <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(synergyData.hypothesis.highOverlapBoxes.avgPackPerUnitSec, unit)}</td>
          <td class="text-right font-mono" style="font-weight: 700; color: #ffffff;">${formatTimeValue(synergyData.hypothesis.highOverlapBoxes.avgPickPerUnitSec + synergyData.hypothesis.highOverlapBoxes.avgPackPerUnitSec, unit)}</td>
        </tr>
        <tr>
          <td><strong style="color: #fbbf24;">${isCs ? 'Střední překryv (částečná shoda)' : 'Medium Overlap'}</strong></td>
          <td class="text-right font-mono">${synergyData.hypothesis.mediumOverlapBoxes.count}</td>
          <td class="text-right font-mono">${(synergyData.hypothesis.mediumOverlapBoxes.categories['all']?.orderCount || 0).toLocaleString('cs-CZ')}</td>
          <td class="text-right font-mono">${(synergyData.hypothesis.mediumOverlapBoxes.categories['all']?.itemCount || 0).toLocaleString('cs-CZ')}</td>
          <td class="text-right font-mono" style="color: #60a5fa;">${formatTimeValue(synergyData.hypothesis.mediumOverlapBoxes.avgPickPerUnitSec, unit)}</td>
          <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(synergyData.hypothesis.mediumOverlapBoxes.avgPackPerUnitSec, unit)}</td>
          <td class="text-right font-mono" style="font-weight: 700; color: #ffffff;">${formatTimeValue(synergyData.hypothesis.mediumOverlapBoxes.avgPickPerUnitSec + synergyData.hypothesis.mediumOverlapBoxes.avgPackPerUnitSec, unit)}</td>
        </tr>
        <tr>
          <td><strong style="color: #f87171;">${isCs ? 'Nízký překryv (každý kus jiný EAN)' : 'Low Overlap (diverse unique SKUs)'}</strong></td>
          <td class="text-right font-mono">${synergyData.hypothesis.lowOverlapBoxes.count}</td>
          <td class="text-right font-mono">${(synergyData.hypothesis.lowOverlapBoxes.categories['all']?.orderCount || 0).toLocaleString('cs-CZ')}</td>
          <td class="text-right font-mono">${(synergyData.hypothesis.lowOverlapBoxes.categories['all']?.itemCount || 0).toLocaleString('cs-CZ')}</td>
          <td class="text-right font-mono" style="color: #60a5fa;">${formatTimeValue(synergyData.hypothesis.lowOverlapBoxes.avgPickPerUnitSec, unit)}</td>
          <td class="text-right font-mono" style="color: #34d399;">${formatTimeValue(synergyData.hypothesis.lowOverlapBoxes.avgPackPerUnitSec, unit)}</td>
          <td class="text-right font-mono" style="font-weight: 700; color: #ffffff;">${formatTimeValue(synergyData.hypothesis.lowOverlapBoxes.avgPickPerUnitSec + synergyData.hypothesis.lowOverlapBoxes.avgPackPerUnitSec, unit)}</td>
        </tr>
      </tbody>
    </table>
  </section>

  <!-- 3. Analýza dnů v týdnu & Časový vývoj -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '3. Výkonnost podle dnů v týdnu (Pondělí až Neděle)' : '3. Day of Week Performance (Monday to Sunday)'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs ? 'Přehled vytížení a průměrných časů podle jednotlivých pracovních dnů pro plánování směn a kapacit.' : 'Day-of-week workload and throughput distribution for shift planning.'}
    </div>

    <table>
      <thead>
        <tr>
          <th>${isCs ? 'Den v týdnu' : 'Day of Week'}</th>
          <th class="text-right">${isCs ? 'Počet zásilek' : 'Orders'}</th>
          <th class="text-right">${isCs ? 'Počet kusů' : 'Units'}</th>
          <th class="text-right">${isCs ? 'Pick / 1ks' : 'Pick / Item'}</th>
          <th class="text-right">${isCs ? 'Balení / 1ks' : 'Pack / Item'}</th>
          <th class="text-right">${isCs ? 'Celkem / 1ks' : 'Total / Item'}</th>
          <th class="text-right">${isCs ? 'Celkem na objednávku' : 'Total / Order'}</th>
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
            <td class="text-right font-mono font-weight-bold">${formatTimeValue(d.avgTotalPerOrderSec, unit)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </section>

  <!-- 4. Simulace a doporučení optimalizace (2h vlny & Multipicking) -->
  <section class="content-box">
    <div class="section-title">
      <span>${isCs ? '4. Simulace optimalizace: Sdružování do 2h slotů (Multipicking)' : '4. Optimization Simulation: 2-Hour Batching (Multipicking)'}</span>
    </div>
    <div class="section-subtitle">
      ${isCs ? 'Predikce úspor při zavedení sdruženého vychystávání a přesného párování objednávek se stejnými SKU.' : 'Projected savings from 2-hour grouping into dedicated high-synergy waves.'}
    </div>

    <div class="sim-card">
      <div class="sim-metric">
        <span class="filter-label">${isCs ? 'Predikovaná celková úspora času:' : 'Projected Total Time Savings:'}</span>
        <span class="sim-metric-val" style="color: #34d399;">${simulation.totalSavedHours} ${isCs ? 'člověkohodin' : 'man-hours'}</span>
        <span style="font-size: 11px; color: #94a3b8;">${isCs ? 'Odhadovaná kumulativní úspora na analyzovaném objemu' : 'Cumulative savings across analyzed dataset'}</span>
      </div>
      <div class="sim-metric">
        <span class="filter-label">${isCs ? 'Procentuální úspora expedice:' : 'Percentage operational savings:'}</span>
        <span class="sim-metric-val" style="color: #38bdf8;">${simulation.overallSavingsPct}%</span>
        <span style="font-size: 11px; color: #94a3b8;">${isCs ? 'Zkrácení celkového času pickování i balení' : 'Total duration reduction'}</span>
      </div>
      <div class="sim-metric">
        <span class="filter-label">${isCs ? 'Optimální kapacita boxu:' : 'Optimal tote capacity:'}</span>
        <span class="sim-metric-val" style="color: #f59e0b;">${simulation.boxCapacityLimit} ${isCs ? 'kusů / box' : 'units / tote'}</span>
        <span style="font-size: 11px; color: #94a3b8;">${isCs ? 'Doporučená velikost pro maximální efektivitu' : 'Recommended target size'}</span>
      </div>
    </div>

    <!-- Recommendations list -->
    <div style="margin-top: 14px; background: rgba(15, 23, 42, 0.6); border: 1px solid #334155; border-radius: 12px; padding: 16px;">
      <div style="font-weight: 700; font-size: 13px; color: #ffffff; margin-bottom: 8px;">
        ${isCs ? 'Klíčová doporučení pro provoz:' : 'Key Operational Recommendations:'}
      </div>
      <ul style="font-size: 12px; color: #cbd5e1; padding-left: 20px; line-height: 1.8;">
        <li>${isCs ? 'Zavést 2hodinové pickovací vlny: akumulovat objednávky před vygenerováním picklistů namísto okamžitého pickování po jedné.' : 'Introduce 2-hour picking waves: accumulate orders before generating picking waves rather than picking single orders ad-hoc.'}</li>
        <li>${isCs ? 'Dělit sběrné boxy na Single-item (1ks) a Multi-item (2+ ks): nemíchat složité vícekusové objednávky do stejných boxů se single-item zakázkami.' : 'Separate collection totes into Single-item (1 pc) and Multi-item (2+ pcs): avoid mixing complex multi-item orders with single items.'}</li>
        <li>${isCs ? 'Prioritizovat společné SKU ve stejné zóně pro snížení počtu kroků skladníka v regálových uličkách.' : 'Prioritize shared SKUs in the same warehouse zone to minimize picker travel distance.'}</li>
      </ul>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <p>Warehouse Pick &amp; Pack Analytics • ${isCs ? 'Tento report je offline HTML soubor, který můžete kdykoliv otevřít nebo přeposlat dalším kolegům.' : 'This report is a standalone offline HTML document ready to open or forward.'}</p>
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
