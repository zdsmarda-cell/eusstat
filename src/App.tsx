import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MovementRecord, DbStatus, FilterState, ItemBracket, WarehouseId } from './types.js';
import { Header } from './components/Header.js';
import { FilterBar } from './components/FilterBar.js';
import { KpiCards } from './components/KpiCards.js';
import { BracketComparisonSection } from './components/BracketComparisonSection.js';
import { BoxSynergyAnalysis } from './components/BoxSynergyAnalysis.js';
import { DailyTrendChart } from './components/DailyTrendChart.js';
import { MultipickSimulationSection } from './components/MultipickSimulationSection.js';
import { ImportModal } from './components/ImportModal.js';
import { DbSettingsModal } from './components/DbSettingsModal.js';
import { LoginForm } from './components/LoginForm.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LanguageProvider, useLanguage } from './context/LanguageContext.js';
import {
  computeBracketStatistics,
  computeDailyStatistics,
  computeBoxSynergyAndHypothesis,
  computePeriodSummary,
} from './utils/analytics.js';
import { PeriodExecutiveSummary } from './components/PeriodExecutiveSummary.js';
import { WarehouseComparisonSummary } from './components/WarehouseComparisonSummary.js';
import { SvjSortingSection } from './components/SvjSortingSection.js';
import { downloadHtmlReport } from './utils/htmlReportGenerator.js';
import { apiUrl, authFetch } from './config/api.js';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Database,
  FileCode,
  Download,
  Building2,
  Shuffle,
  Scale,
  PlusCircle,
  ChevronDown,
} from 'lucide-react';

export type WarehouseTab = 'ruse' | 'svj' | 'summary';

interface CachedAnalyticsSummary {
  warehouse: 'ruse' | 'svj' | 'all';
  recordCount: number;
  ruseCount: number;
  svjCount: number;
  bracketStats: any[];
  dailyStats: any[];
  dailyReport?: any;
  synergyData: any;
  periodSummary: any;
  comparison: any;
  svjSorting?: any;
  svjBypassAnalysis?: any;
  simulation?: any;
  source?: 'cache' | 'computed';
  updatedAt?: string;
}

function Dashboard() {
  const { lang, t } = useLanguage();
  const isCs = lang === 'cs';

  const [records, setRecords] = useState<MovementRecord[]>([]);
  const [activeTab, setActiveTab] = useState<WarehouseTab>('ruse');
  const [dbStatus, setDbStatus] = useState<DbStatus>({
    connected: false,
    type: 'memory',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [serverAnalytics, setServerAnalytics] = useState<Record<string, CachedAnalyticsSummary>>({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDbSettingsModalOpen, setIsDbSettingsModalOpen] = useState(false);
  const [isSampleMenuOpen, setIsSampleMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  const initialFilter: FilterState = {
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
    bracket: 'all',
    searchBox: '',
    searchQuery: '',
    excludeOutliers: false,
    unit: 'sec',
  };

  const [filter, setFilter] = useState<FilterState>(initialFilter);

  // Fetch summary analytics from server / DB helper table cache with active filters
  const fetchAnalyticsSummary = useCallback(async (
    warehouse: 'ruse' | 'svj' | 'all' = 'all',
    forceRefresh: boolean = false,
    customFilter?: FilterState
  ) => {
    try {
      const activeF = customFilter || filter;
      const params = new URLSearchParams({
        warehouse,
        excludeOutliers: activeF.excludeOutliers ? 'true' : 'false',
        datePreset: activeF.datePreset,
        dateFrom: activeF.dateFrom || '',
        dateTo: activeF.dateTo || '',
        bracket: activeF.bracket,
        box: activeF.searchBox || '',
        query: activeF.searchQuery || '',
      });
      if (forceRefresh) params.append('forceRefresh', 'true');

      const res = await authFetch(apiUrl(`/api/analytics/summary?${params.toString()}`));
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setServerAnalytics(prev => ({ ...prev, [warehouse]: data }));
          return data;
        }
      }
    } catch (err) {
      console.warn('Nelze načíst souhrn z databázové mezipaměti:', err);
    }
    return null;
  }, [filter]);

  // Fetch initial data, cached DB analytics and DB status
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statusRes, summaryRes, movementsRes] = await Promise.all([
        authFetch(apiUrl('/api/db/status')),
        authFetch(apiUrl('/api/analytics/summary?warehouse=all')),
        authFetch(apiUrl('/api/movements?limit=1000')),
      ]);

      let statusData: DbStatus = { connected: false, type: 'memory' };
      let movementsData: { records: MovementRecord[] } = { records: [] };

      if (statusRes.ok) {
        try {
          statusData = await statusRes.json();
        } catch {
          // ignore
        }
      }

      if (summaryRes.ok) {
        try {
          const sumData = await summaryRes.json();
          if (sumData.success) {
            setServerAnalytics(prev => ({
              ...prev,
              all: sumData,
              ...(sumData.warehouse === 'all' ? { ruse: { ...sumData, warehouse: 'ruse' }, svj: { ...sumData, warehouse: 'svj' } } : {}),
            }));
          }
        } catch {
          // ignore
        }
      }

      if (movementsRes.ok) {
        try {
          movementsData = await movementsRes.json();
        } catch {
          // ignore
        }
      }

      setDbStatus(statusData);
      setRecords(movementsData.records || []);
    } catch (err: any) {
      console.error('Chyba při stahování dat:', err);
      showToast(isCs ? 'Nepodařilo se navázat spojení se serverem.' : 'Failed to connect to server.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [isCs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Split records by warehouse
  const ruseRecords = useMemo(() => {
    return records.filter(r => (r.warehouse || 'ruse') === 'ruse');
  }, [records]);

  const svjRecords = useMemo(() => {
    return records.filter(r => r.warehouse === 'svj');
  }, [records]);

  // Universal record filter
  const filterRecord = useCallback((r: MovementRecord) => {
    // Outlier filter (> 1800s / 30 min)
    if (filter.excludeOutliers) {
      if (r.pick_duration_s > 1800 || r.pack_duration_s > 1800) return false;
    }

    // Bracket filter
    if (filter.bracket !== 'all' && r.bracket !== filter.bracket) {
      return false;
    }

    // Search Box
    if (filter.searchBox.trim()) {
      const b = filter.searchBox.trim().toLowerCase();
      if (!r.sberny_box.toLowerCase().includes(b)) return false;
    }

    // Search Query (order or EAN)
    if (filter.searchQuery.trim()) {
      const q = filter.searchQuery.trim().toLowerCase();
      const matchesOrder = r.obsah_objednavek.toLowerCase().includes(q);
      const matchesEan = r.ean_produktu.toLowerCase().includes(q);
      const matchesBox = r.sberny_box.toLowerCase().includes(q);
      if (!matchesOrder && !matchesEan && !matchesBox) return false;
    }

    // Date filtering based on preset or custom
    if (filter.datePreset !== 'all') {
      const now = new Date();
      if (filter.datePreset === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        if (new Date(r.zacatek_pickovani).getTime() < todayStart) return false;
      } else if (filter.datePreset === '7days') {
        const threshold = now.getTime() - 7 * 24 * 3600 * 1000;
        if (new Date(r.zacatek_pickovani).getTime() < threshold) return false;
      } else if (filter.datePreset === '14days') {
        const threshold = now.getTime() - 14 * 24 * 3600 * 1000;
        if (new Date(r.zacatek_pickovani).getTime() < threshold) return false;
      } else if (filter.datePreset === '30days') {
        const threshold = now.getTime() - 30 * 24 * 3600 * 1000;
        if (new Date(r.zacatek_pickovani).getTime() < threshold) return false;
      } else if (filter.datePreset === 'custom') {
        if (filter.dateFrom) {
          const fromTime = new Date(`${filter.dateFrom}T00:00:00`).getTime();
          if (new Date(r.zacatek_pickovani).getTime() < fromTime) return false;
        }
        if (filter.dateTo) {
          const toTime = new Date(`${filter.dateTo}T23:59:59`).getTime();
          if (new Date(r.konec_baleni).getTime() > toTime) return false;
        }
      }
    }

    return true;
  }, [filter]);

  const filteredRuseRecords = useMemo(() => ruseRecords.filter(filterRecord), [ruseRecords, filterRecord]);
  const filteredSvjRecords = useMemo(() => svjRecords.filter(filterRecord), [svjRecords, filterRecord]);

  // Active dataset depending on current tab
  const activeTabRecords = useMemo(() => {
    if (activeTab === 'ruse') return filteredRuseRecords;
    if (activeTab === 'svj') return filteredSvjRecords;
    return [...filteredRuseRecords, ...filteredSvjRecords];
  }, [activeTab, filteredRuseRecords, filteredSvjRecords]);

  const activeAllWarehouseRecords = useMemo(() => {
    if (activeTab === 'ruse') return ruseRecords;
    if (activeTab === 'svj') return svjRecords;
    return records;
  }, [activeTab, ruseRecords, svjRecords, records]);

  // Tab switching handler with spinner
  const handleTabChange = useCallback(async (tab: WarehouseTab) => {
    if (tab === activeTab) return;
    setIsTabSwitching(true);
    try {
      const targetWh = tab === 'summary' ? 'all' : tab;
      await fetchAnalyticsSummary(targetWh as any, false, filter);
      setActiveTab(tab);
    } finally {
      setTimeout(() => {
        setIsTabSwitching(false);
      }, 70);
    }
  }, [activeTab, filter, fetchAnalyticsSummary]);

  // Filter change handler with spinner – načítá filtrovaná data přímo ze serveru / DB
  const handleFilterChange = useCallback((newFilter: FilterState) => {
    setIsFiltering(true);
    setFilter(newFilter);
    const targetWh = activeTab === 'summary' ? 'all' : activeTab;
    fetchAnalyticsSummary(targetWh as any, false, newFilter)
      .finally(() => {
        setIsFiltering(false);
      });
  }, [activeTab, fetchAnalyticsSummary]);

  const currentServerAnalytics = serverAnalytics[activeTab === 'summary' ? 'all' : activeTab] || serverAnalytics.all;

  // Compute or read stats for active tab dataset – VŽDY preferujeme data přímo z databáze
  const bracketStats = useMemo(() => {
    if (currentServerAnalytics?.bracketStats?.length) {
      return currentServerAnalytics.bracketStats;
    }
    return computeBracketStatistics(activeTabRecords);
  }, [currentServerAnalytics, activeTabRecords]);

  const dailyStats = useMemo(() => {
    if (currentServerAnalytics?.dailyStats?.length) {
      return currentServerAnalytics.dailyStats;
    }
    return computeDailyStatistics(activeTabRecords);
  }, [currentServerAnalytics, activeTabRecords]);

  const synergyData = useMemo(() => {
    if (currentServerAnalytics?.synergyData) {
      return currentServerAnalytics.synergyData;
    }
    return computeBoxSynergyAndHypothesis(activeTabRecords);
  }, [currentServerAnalytics, activeTabRecords]);

  // Sumární bilance za zkoumané období – načtena z DB
  const periodSummary = useMemo(() => {
    if (currentServerAnalytics?.periodSummary) {
      return currentServerAnalytics.periodSummary;
    }
    return computePeriodSummary(activeTabRecords);
  }, [currentServerAnalytics, activeTabRecords]);

  // Export HTML report
  const handleExportHtml = () => {
    if (activeTabRecords.length === 0) {
      showToast(
        isCs ? 'Není k dispozici žádný záznam k exportu.' : 'No records available to export.',
        'error'
      );
      return;
    }
    try {
      downloadHtmlReport({
        records: activeTabRecords,
        filter,
        unit: filter.unit,
        lang,
      });
      showToast(
        isCs
          ? `Kompletní HTML report (${activeTabRecords.length.toLocaleString('cs-CZ')} záznamů) byl úspěšně vygenerován a stažen!`
          : `Complete HTML report (${activeTabRecords.length.toLocaleString()} records) generated & downloaded!`,
        'success'
      );
    } catch (err: any) {
      console.error('Chyba při exportu HTML:', err);
      showToast(isCs ? 'Chyba při generování HTML reportu.' : 'Error generating HTML report.', 'error');
    }
  };

  // Seed sample data for Ruse, SVJ, or both
  const handleLoadSampleData = async (target: 'ruse' | 'svj' | 'both' = 'both') => {
    setIsLoading(true);
    setIsSampleMenuOpen(false);
    try {
      if (target === 'both') {
        const [ruseRes, svjRes] = await Promise.all([
          authFetch(apiUrl('/api/movements/seed-sample'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 420, days: 14 }),
          }),
          authFetch(apiUrl('/api/movements/seed-svj'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ boxes: 35, days: 14, clearOnlyThis: true }),
          }),
        ]);
        const ruseData = await ruseRes.json();
        const svjData = await svjRes.json();
        await fetchData();
        showToast(
          isCs
            ? `Úspěšně vygenerována vzorová data pro oba sklady (Ruse: ${ruseData.importedCount || 420}, SVJ: ${svjData.importedCount || 333} záznamů)!`
            : `Sample data generated for both warehouses (Ruse & SVJ)!`,
          'success'
        );
      } else if (target === 'ruse') {
        const res = await authFetch(apiUrl('/api/movements/seed-sample'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: 420, days: 14 }),
        });
        const data = await res.json();
        await fetchData();
        showToast(data.message || (isCs ? 'Ukázková data pro sklad Ruse byla vygenerována.' : 'Ruse warehouse data generated.'), 'success');
      } else if (target === 'svj') {
        const res = await authFetch(apiUrl('/api/movements/seed-svj'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boxes: 35, days: 14, clearOnlyThis: true }),
        });
        const data = await res.json();
        await fetchData();
        showToast(data.message || (isCs ? 'Ukázková data pro sklad SVJ (se sortingem) byla vygenerována.' : 'SVJ warehouse data generated.'), 'success');
      }
    } catch (err: any) {
      showToast(isCs ? 'Chyba při generování vzorových dat.' : 'Error generating sample data.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Import handler with warehouse scope preservation
  const handleImportComplete = async (
    newRecords: MovementRecord[],
    onProgress?: (saved: number, total: number) => void,
    replaceExisting: boolean = true,
    targetWarehouse: WarehouseId = 'ruse'
  ) => {
    // If replacing existing, clear only old records of that warehouse
    if (replaceExisting) {
      try {
        await authFetch(apiUrl(`/api/movements?warehouse=${targetWarehouse}`), { method: 'DELETE' });
      } catch {
        // ignore
      }
    }

    // Optimal batch size 10 000 záznamů pro bleskurychlý import bez timeoutu
    const BATCH_SIZE = 10000;
    const total = newRecords.length;
    let saved = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = newRecords.slice(i, i + BATCH_SIZE);

      let success = false;
      let lastErr: any = null;

      // Robustní retry mechanismus pro případ síťového výkyvu
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await authFetch(apiUrl('/api/movements/import'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: batch }),
          });

          if (!res.ok) {
            const responseText = await res.text();
            let errMsg = `Chyba serveru (${res.status})`;
            try {
              const data = JSON.parse(responseText);
              if (data?.error) errMsg = data.error;
            } catch {
              // ignore
            }
            throw new Error(errMsg);
          }

          success = true;
          break;
        } catch (err: any) {
          lastErr = err;
          if (attempt < 3) {
            // Pauza před opakováním
            await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }

      if (!success) {
        throw new Error(lastErr?.message || (isCs ? 'Chyba při odesílání dávky do databáze' : 'Error sending batch to database'));
      }

      saved += batch.length;
      if (onProgress) {
        onProgress(Math.min(saved, total), total);
      }
    }

    // Zajistit uložení dat na serveru
    try {
      await authFetch(apiUrl('/api/movements/flush'), { method: 'POST' });
    } catch {
      // ignore
    }

    // Aktualizovat lokální stav okamžitě bez nutnosti stahovat 300k záznamů zpět přes síť
    setRecords(prev => {
      if (replaceExisting) {
        const others = prev.filter(r => (r.warehouse || 'ruse') !== targetWarehouse);
        return [...newRecords, ...others];
      }
      return [...newRecords, ...prev];
    });

    // Aktualizovat stav DB
    try {
      const statusRes = await authFetch(apiUrl('/api/db/status'));
      if (statusRes.ok) {
        const sData = await statusRes.json();
        setDbStatus(sData);
      }
    } catch {
      // ignore
    }

    showToast(
      isCs
        ? `Úspěšně importováno všech ${total.toLocaleString('cs-CZ')} záznamů pro sklad ${targetWarehouse.toUpperCase()}!`
        : `Successfully imported all ${total.toLocaleString()} records for ${targetWarehouse.toUpperCase()}!`,
      'success'
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold flex items-center space-x-2.5 backdrop-blur-md ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : toastMessage.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : 'bg-indigo-950/90 border-indigo-500/40 text-indigo-200'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Top Header */}
      <Header
        dbStatus={dbStatus}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenDbSettings={() => setIsDbSettingsModalOpen(true)}
        onLoadSampleData={() => handleLoadSampleData('both')}
        onExportHtml={handleExportHtml}
        isLoading={isLoading}
        totalRecordsCount={records.length}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* MariaDB Info notification banner when in local mode */}
        {!dbStatus.connected && (
          <div className="p-3.5 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900/60 border border-amber-500/25 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Database className="w-4 h-4" />
              </span>
              <div>
                <span className="font-bold text-amber-300">
                  {isCs ? 'Aplikace běží v lokálním režimu.' : 'Application is running in local memory mode.'}
                </span>
                <span className="text-slate-400 ml-1.5">
                  {isCs
                    ? 'Pro synchronizaci s vaší externí MariaDB klikněte na nastavení.'
                    : 'Click settings to configure connection to your external MariaDB.'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsDbSettingsModalOpen(true)}
              className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl font-semibold transition-colors self-start sm:self-auto cursor-pointer"
            >
              {t.header.dbSettingsBtn}
            </button>
          </div>
        )}

        {/* ========================================================
            TOP WAREHOUSE NAVIGATION TABS (Ruse vs SVJ vs Summary)
            ======================================================== */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-2 sm:p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xl backdrop-blur-xl">
          {/* Tabs Group */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Tab 1: Sklad Ruse */}
            <button
              onClick={() => handleTabChange('ruse')}
              className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'ruse'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 ring-2 ring-blue-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Building2 className={`w-4 h-4 ${activeTab === 'ruse' ? 'text-blue-200' : 'text-blue-400'}`} />
              <span>{isCs ? 'Sklad Ruse' : 'Ruse Warehouse'}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                  activeTab === 'ruse' ? 'bg-blue-700/80 text-blue-100' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {(serverAnalytics.all?.ruseCount ?? ruseRecords.length).toLocaleString('cs-CZ')}
              </span>
            </button>

            {/* Tab 2: Sklad SVJ */}
            <button
              onClick={() => handleTabChange('svj')}
              className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'svj'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25 ring-2 ring-purple-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Shuffle className={`w-4 h-4 ${activeTab === 'svj' ? 'text-purple-200' : 'text-purple-400'}`} />
              <span>{isCs ? 'Sklad SVJ' : 'SVJ Warehouse'}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                  activeTab === 'svj' ? 'bg-purple-700/80 text-purple-100' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {(serverAnalytics.all?.svjCount ?? svjRecords.length).toLocaleString('cs-CZ')}
              </span>
              <span
                className={`hidden lg:inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${
                  activeTab === 'svj'
                    ? 'bg-purple-700/60 text-purple-100 border-purple-400/50'
                    : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                }`}
              >
                {isCs ? '+ Sorting' : '+ Sorting'}
              </span>
            </button>

            {/* Tab 3: Srovnání skladů (Summary) */}
            <button
              onClick={() => handleTabChange('summary')}
              className={`flex items-center space-x-2.5 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'summary'
                  ? 'bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 text-white shadow-lg shadow-indigo-500/25 ring-2 ring-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Scale className={`w-4 h-4 ${activeTab === 'summary' ? 'text-cyan-200' : 'text-cyan-400'}`} />
              <span>{isCs ? 'Srovnání skladů (Summary)' : 'Cross-Warehouse Summary'}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${
                  activeTab === 'summary' ? 'bg-indigo-700/80 text-cyan-200' : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                }`}
              >
                KPI
              </span>
            </button>
          </div>

          {/* Quick Tab Actions / Sample Generator */}
          <div className="flex items-center gap-2 self-start md:self-auto relative">
            {/* Sample data generator dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsSampleMenuOpen(!isSampleMenuOpen)}
                disabled={isLoading}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-800 hover:text-white border border-slate-700/70 rounded-xl transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isCs ? 'Vzorky dat' : 'Sample Data'}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isSampleMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-60 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    onClick={() => handleLoadSampleData('both')}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>{isCs ? 'Oba sklady (Ruse + SVJ)' : 'Both (Ruse + SVJ)'}</span>
                    <span className="text-[10px] text-indigo-400 font-mono">Doporučeno</span>
                  </button>
                  <button
                    onClick={() => handleLoadSampleData('ruse')}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>{isCs ? 'Jen sklad Ruse (14 dní)' : 'Ruse Only (14 days)'}</span>
                    <span className="text-[10px] text-blue-400 font-mono">420 obj.</span>
                  </button>
                  <button
                    onClick={() => handleLoadSampleData('svj')}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>{isCs ? 'Jen sklad SVJ (se sortingem)' : 'SVJ Only (with sorting)'}</span>
                    <span className="text-[10px] text-purple-400 font-mono">35 boxů</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Import Button into Current Warehouse */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-md transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{isCs ? 'Importovat data' : 'Import Data'}</span>
            </button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <FilterBar
          filter={filter}
          onChange={handleFilterChange}
          onReset={() => handleFilterChange(initialFilter)}
          onExportHtml={handleExportHtml}
          totalFilteredCount={currentServerAnalytics?.recordCount ?? activeTabRecords.length}
          totalAllCount={serverAnalytics.all?.recordCount ?? currentServerAnalytics?.recordCount ?? activeAllWarehouseRecords.length}
          isFiltering={isFiltering}
        />

        {/* PROMINENT LOADING SPINNER ("kolečko") - Shown on initial load & tab switching */}
        {isLoading || isTabSwitching ? (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-16 text-center max-w-md mx-auto space-y-4 shadow-2xl my-8 animate-in fade-in duration-150">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin relative z-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                {isCs ? 'Načítám z mezipaměti databáze...' : 'Loading from database cache...'}
              </h3>
              <p className="text-xs text-slate-400">
                {isCs
                  ? 'Čtu předpočítané statistiky a metriky skladu bez zpoždění.'
                  : 'Reading precalculated warehouse metrics and statistics.'}
              </p>
            </div>
          </div>
        ) : activeTab === 'summary' ? (
          /* ========================================================
             CROSS-WAREHOUSE SUMMARY TAB (Ruse vs SVJ KPI Comparison)
             ======================================================== */
          <div className="space-y-6">
            {/* Warning callout if one warehouse is missing data (pouze v lokálním vývojovém režimu) */}
            {dbStatus.type !== 'mariadb' && (ruseRecords.length === 0 || svjRecords.length === 0) && (
              <div className="p-4 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900 border border-indigo-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-white block">
                    {isCs ? 'Pro kompletní srovnání vygenerujte data pro oba sklady' : 'Generate data for both warehouses for full comparison'}
                  </span>
                  <span className="text-slate-400">
                    {isCs
                      ? `Ruse má ${ruseRecords.length} záznamů, SVJ má ${svjRecords.length} záznamů. Klikněte pro automatické vygenerování vzorků.`
                      : `Ruse has ${ruseRecords.length} records, SVJ has ${svjRecords.length} records. Click to generate sample datasets.`}
                  </span>
                </div>
                <button
                  onClick={() => handleLoadSampleData('both')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-md self-start sm:self-auto cursor-pointer"
                >
                  {isCs ? 'Vygenerovat data pro oba sklady' : 'Generate Both Datasets'}
                </button>
              </div>
            )}

            {/* Comprehensive Cross-Warehouse Comparison View */}
            <WarehouseComparisonSummary
              ruseRecords={filteredRuseRecords}
              svjRecords={filteredSvjRecords}
              unit={filter.unit}
              cachedReport={currentServerAnalytics?.comparison || serverAnalytics.all?.comparison || serverAnalytics.summary?.comparison}
            />
          </div>
        ) : activeTabRecords.length === 0 && (currentServerAnalytics?.recordCount ?? 0) === 0 ? (
          /* ========================================================
             EMPTY STATE FOR INDIVIDUAL WAREHOUSE
             ======================================================== */
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4">
            <div
              className={`w-14 h-14 rounded-2xl border flex items-center justify-center mx-auto ${
                activeTab === 'ruse'
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
              }`}
            >
              {activeTab === 'ruse' ? <Building2 className="w-7 h-7" /> : <Shuffle className="w-7 h-7" />}
            </div>
            <h3 className="text-lg font-bold text-white">
              {isCs
                ? `V databázi zatím nejsou žádné pohyby pro sklad ${activeTab === 'ruse' ? 'Ruse' : 'SVJ'}`
                : `No movements in database for ${activeTab === 'ruse' ? 'Ruse' : 'SVJ'} warehouse`}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {activeTab === 'ruse'
                ? isCs
                  ? 'Sklad Ruse používá přímé sběrné pickování a balení. Nahrajte soubor s pohyby přes tlačítko Import dat.'
                  : 'Ruse warehouse uses wave picking and direct manual packing. Upload your file via Import Data.'
                : isCs
                ? 'Sklad SVJ má navíc proces mezioperačního sortingu a ruční balení (3 soubory). Nahrajte soubory přes tlačítko Import dat.'
                : 'SVJ warehouse includes sorting and manual packing (3 files). Upload files via Import Data.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {dbStatus.type !== 'mariadb' && (
                <button
                  onClick={() => handleLoadSampleData(activeTab as 'ruse' | 'svj')}
                  className={`px-4 py-2 text-white text-xs font-semibold rounded-xl shadow-lg transition-all cursor-pointer ${
                    activeTab === 'ruse'
                      ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
                      : 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/20'
                  }`}
                >
                  {isCs
                    ? `Načíst vzorová data pro sklad ${activeTab === 'ruse' ? 'Ruse' : 'SVJ'}`
                    : `Generate sample data for ${activeTab.toUpperCase()}`}
                </button>
              )}
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                {activeTab === 'svj'
                  ? isCs ? 'Nahrát 3 soubory SVJ' : 'Upload 3 SVJ files'
                  : isCs ? 'Nahrát soubor Ruse' : 'Upload Ruse file'}
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================
             WAREHOUSE DATA DASHBOARD (Ruse or SVJ)
             ======================================================== */
          <>
            {/* Warehouse Context Banner */}
            <div
              className={`p-3.5 border rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs ${
                activeTab === 'ruse'
                  ? 'bg-gradient-to-r from-blue-950/30 via-slate-900/60 to-slate-900 border-blue-500/25'
                  : 'bg-gradient-to-r from-purple-950/30 via-slate-900/60 to-slate-900 border-purple-500/25'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2 rounded-xl border ${
                    activeTab === 'ruse'
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  }`}
                >
                  {activeTab === 'ruse' ? <Building2 className="w-4 h-4" /> : <Shuffle className="w-4 h-4" />}
                </div>
                <div>
                  <span className="font-bold text-white block">
                    {activeTab === 'ruse'
                      ? isCs ? 'Sklad Ruse — Standardní přímá expedice' : 'Ruse Warehouse — Direct Fulfillment'
                      : isCs ? 'Sklad SVJ — Tříděná expedice (Sorting + Ruční balení)' : 'SVJ Warehouse — Sorted Fulfillment (Sorting + Manual Packing)'}
                  </span>
                  <span className="text-slate-400">
                    {activeTab === 'ruse'
                      ? isCs
                        ? `Zafiltrováno ${(currentServerAnalytics?.recordCount ?? activeTabRecords.length).toLocaleString('cs-CZ')} ze ${(serverAnalytics.all?.ruseCount ?? currentServerAnalytics?.recordCount ?? ruseRecords.length).toLocaleString('cs-CZ')} záznamů z databáze.`
                        : `${(currentServerAnalytics?.recordCount ?? activeTabRecords.length).toLocaleString()} of ${(serverAnalytics.all?.ruseCount ?? currentServerAnalytics?.recordCount ?? ruseRecords.length).toLocaleString()} database records filtered.`
                      : isCs
                      ? `Zafiltrováno ${(currentServerAnalytics?.recordCount ?? activeTabRecords.length).toLocaleString('cs-CZ')} ze ${(serverAnalytics.all?.svjCount ?? currentServerAnalytics?.recordCount ?? svjRecords.length).toLocaleString('cs-CZ')} záznamů z databáze.`
                      : `${(currentServerAnalytics?.recordCount ?? activeTabRecords.length).toLocaleString()} of ${(serverAnalytics.all?.svjCount ?? currentServerAnalytics?.recordCount ?? svjRecords.length).toLocaleString()} database records filtered.`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportHtml}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl font-semibold transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isCs ? 'HTML report' : 'HTML Report'}</span>
                </button>
              </div>
            </div>

            {/* 1. Sumární přehled za zkoumané období (Objednávky, SKU, Kusy, Průměr ks/zásilku, Medián obj./box) */}
            <PeriodExecutiveSummary
              summary={periodSummary}
              totalFilteredRecords={currentServerAnalytics?.recordCount ?? activeTabRecords.length}
              totalAllRecords={serverAnalytics.all?.recordCount ?? currentServerAnalytics?.recordCount ?? activeAllWarehouseRecords.length}
            />

            {/* 2. KPI Cards */}
            <KpiCards bracketStats={bracketStats} periodSummary={periodSummary} unit={filter.unit} />

            {/* 3. POUZE PRO SKLAD SVJ: Sekce pro činnost sortingu a meziskladové buffery */}
            {activeTab === 'svj' && (
              <SvjSortingSection
                records={activeTabRecords}
                unit={filter.unit}
                cachedStats={currentServerAnalytics?.svjSorting || serverAnalytics.svj?.svjSorting}
                cachedBypassReport={currentServerAnalytics?.svjBypassAnalysis || serverAnalytics.svj?.svjBypassAnalysis}
              />
            )}

            {/* 4. Core Section: Bracket Comparison (1, 2, 3, 4, 5, 6+ ks) */}
            <BracketComparisonSection bracketStats={bracketStats} unit={filter.unit} />

            {/* 5. Multipicking & Product Matches Analysis in Boxes */}
            <BoxSynergyAnalysis synergyData={synergyData} unit={filter.unit} />

            {/* 6. Daily Performance Table & Pareto Analysis (Vývoj přes dny a dny v týdnu) */}
            <DailyTrendChart
              dailyStats={dailyStats}
              records={activeTabRecords}
              cachedReport={currentServerAnalytics?.dailyReport}
              unit={filter.unit}
            />

            {/* 7. Zhodnocení: Simulace optimalizace a přeskupení do 2h slotů (Multipicking) */}
            <MultipickSimulationSection
              records={activeTabRecords}
              cachedSimulation={currentServerAnalytics?.simulation}
              unit={filter.unit}
            />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>Warehouse Pick & Pack Performance Analytics • {isCs ? 'Optimalizováno pro sklady Ruse & SVJ s MariaDB' : 'Optimized for Ruse & SVJ warehouses with MariaDB'}</p>
      </footer>

      {/* Modals */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
        dbStatus={dbStatus}
        initialWarehouse={activeTab === 'summary' ? 'ruse' : activeTab}
      />

      <DbSettingsModal
        isOpen={isDbSettingsModalOpen}
        onClose={() => setIsDbSettingsModalOpen(false)}
        onConnectionUpdated={fetchData}
      />
    </div>
  );
}

function AppGate() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <LoginForm />;
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppGate />
      </LanguageProvider>
    </AuthProvider>
  );
}
