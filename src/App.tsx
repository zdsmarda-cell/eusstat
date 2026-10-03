import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MovementRecord, DbStatus, FilterState, ItemBracket } from './types.js';
import { Header } from './components/Header.js';
import { FilterBar } from './components/FilterBar.js';
import { KpiCards } from './components/KpiCards.js';
import { BracketComparisonSection } from './components/BracketComparisonSection.js';
import { BoxSynergyAnalysis } from './components/BoxSynergyAnalysis.js';
import { DailyTrendChart } from './components/DailyTrendChart.js';
import { MovementsTable } from './components/MovementsTable.js';
import { MultipickSimulationSection } from './components/MultipickSimulationSection.js';
import { ImportModal } from './components/ImportModal.js';
import { DbSettingsModal } from './components/DbSettingsModal.js';
import { LoginForm } from './components/LoginForm.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LanguageProvider, useLanguage } from './context/LanguageContext.js';
import { computeBracketStatistics, computeDailyStatistics, computeBoxSynergyAndHypothesis } from './utils/analytics.js';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Database } from 'lucide-react';

function Dashboard() {
  const { lang, t } = useLanguage();

  const [records, setRecords] = useState<MovementRecord[]>([]);
  const [dbStatus, setDbStatus] = useState<DbStatus>({
    connected: false,
    type: 'memory',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDbSettingsModalOpen, setIsDbSettingsModalOpen] = useState(false);
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

  // Fetch initial data and DB status
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statusRes, movementsRes] = await Promise.all([
        fetch('/api/db/status'),
        fetch('/api/movements?limit=10000'),
      ]);

      let statusData: DbStatus = { connected: false, type: 'memory' };
      let movementsData: { records: MovementRecord[] } = { records: [] };

      if (statusRes.ok) {
        const text = await statusRes.text();
        try {
          statusData = JSON.parse(text);
        } catch {
          // ignore
        }
      }

      if (movementsRes.ok) {
        const text = await movementsRes.text();
        try {
          movementsData = JSON.parse(text);
        } catch {
          // ignore
        }
      }

      setDbStatus(statusData);
      setRecords(movementsData.records || []);
    } catch (err: any) {
      console.error('Chyba při stahování dat:', err);
      showToast(lang === 'cs' ? 'Nepodařilo se navázat spojení se serverem.' : 'Failed to connect to server.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Seed sample data
  const handleLoadSampleData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/movements/seed-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 420, days: 14 }),
      });
      const data = await res.json();
      await fetchData();
      showToast(data.message || (lang === 'cs' ? 'Ukázková data skladu byla úspěšně vygenerována.' : 'Warehouse sample data generated successfully.'), 'success');
    } catch (err: any) {
      showToast(lang === 'cs' ? 'Chyba při generování vzorových dat.' : 'Error generating sample data.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Import handler with safe batching / chunking to prevent proxy payload/timeout errors
  const handleImportComplete = async (
    newRecords: MovementRecord[],
    onProgress?: (saved: number, total: number) => void
  ) => {
    const BATCH_SIZE = 350;
    const total = newRecords.length;
    let saved = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = newRecords.slice(i, i + BATCH_SIZE);
      const res = await fetch('/api/movements/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: batch }),
      });

      const responseText = await res.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          `Server returned invalid response (${res.status}): ${responseText.slice(0, 100)}`
        );
      }

      if (!res.ok) {
        throw new Error(data?.error || `Error saving records (${res.status})`);
      }

      saved += batch.length;
      if (onProgress) {
        onProgress(Math.min(saved, total), total);
      }
    }

    await fetchData();
    showToast(lang === 'cs' ? `Úspěšně importováno ${total} záznamů!` : `Successfully imported ${total} records!`, 'success');
  };

  // Filter calculations
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Outlier filter (> 1800s / 30 min)
    if (filter.excludeOutliers) {
      result = result.filter(r => r.pick_duration_s <= 1800 && r.pack_duration_s <= 1800);
    }

    // Bracket filter
    if (filter.bracket !== 'all') {
      result = result.filter(r => r.bracket === filter.bracket);
    }

    // Search Box
    if (filter.searchBox.trim()) {
      const b = filter.searchBox.trim().toLowerCase();
      result = result.filter(r => r.sberny_box.toLowerCase().includes(b));
    }

    // Search Query (order or EAN)
    if (filter.searchQuery.trim()) {
      const q = filter.searchQuery.trim().toLowerCase();
      result = result.filter(
        r =>
          r.obsah_objednavek.toLowerCase().includes(q) ||
          r.ean_produktu.toLowerCase().includes(q) ||
          r.sberny_box.toLowerCase().includes(q)
      );
    }

    // Date filtering based on preset or custom
    if (filter.datePreset !== 'all' && result.length > 0) {
      const now = new Date();
      let thresholdTime: number | null = null;

      if (filter.datePreset === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        result = result.filter(r => new Date(r.zacatek_pickovani).getTime() >= todayStart);
      } else if (filter.datePreset === '7days') {
        thresholdTime = now.getTime() - 7 * 24 * 3600 * 1000;
        result = result.filter(r => new Date(r.zacatek_pickovani).getTime() >= thresholdTime!);
      } else if (filter.datePreset === '14days') {
        thresholdTime = now.getTime() - 14 * 24 * 3600 * 1000;
        result = result.filter(r => new Date(r.zacatek_pickovani).getTime() >= thresholdTime!);
      } else if (filter.datePreset === '30days') {
        thresholdTime = now.getTime() - 30 * 24 * 3600 * 1000;
        result = result.filter(r => new Date(r.zacatek_pickovani).getTime() >= thresholdTime!);
      } else if (filter.datePreset === 'custom') {
        if (filter.dateFrom) {
          const fromTime = new Date(`${filter.dateFrom}T00:00:00`).getTime();
          result = result.filter(r => new Date(r.zacatek_pickovani).getTime() >= fromTime);
        }
        if (filter.dateTo) {
          const toTime = new Date(`${filter.dateTo}T23:59:59`).getTime();
          result = result.filter(r => new Date(r.konec_baleni).getTime() <= toTime);
        }
      }
    }

    return result;
  }, [records, filter]);

  // Compute stats on filtered dataset
  const bracketStats = useMemo(() => {
    return computeBracketStatistics(filteredRecords);
  }, [filteredRecords]);

  const dailyStats = useMemo(() => {
    return computeDailyStatistics(filteredRecords);
  }, [filteredRecords]);

  const synergyData = useMemo(() => {
    return computeBoxSynergyAndHypothesis(filteredRecords);
  }, [filteredRecords]);

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
        onLoadSampleData={handleLoadSampleData}
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
                  {lang === 'cs' ? 'Aplikace běží v lokálním režimu.' : 'Application is running in local memory mode.'}
                </span>
                <span className="text-slate-400 ml-1.5">
                  {lang === 'cs'
                    ? 'Pro synchronizaci s vaší externí MariaDB klikněte na nastavení.'
                    : 'Click settings to configure connection to your external MariaDB.'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsDbSettingsModalOpen(true)}
              className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl font-semibold transition-colors self-start sm:self-auto"
            >
              {t.header.dbSettingsBtn}
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <FilterBar
          filter={filter}
          onChange={setFilter}
          onReset={() => setFilter(initialFilter)}
          totalFilteredCount={filteredRecords.length}
          totalAllCount={records.length}
        />

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-xs text-slate-400 font-medium">
              {lang === 'cs' ? 'Načítám skladová data a počítám statistiky...' : 'Loading warehouse data & computing analytics...'}
            </p>
          </div>
        ) : records.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white">
              {lang === 'cs' ? 'V databázi zatím nejsou žádné pohyby' : 'No movement records in database'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {lang === 'cs'
                ? 'Můžete nahrát váš soubor se záznamy o pickování a balení (CSV, Excel) nebo jedním kliknutím vygenerovat vzorový dataset pro vyzkoušení všech funkcí a grafů.'
                : 'Upload your picking & packing movement records (CSV, Excel) or generate a 14-day sample dataset with one click.'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleLoadSampleData}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition-all"
              >
                {lang === 'cs' ? 'Načíst vzorová data (14 dní)' : 'Generate Sample Data (14 days)'}
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all"
              >
                {t.header.importBtn}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <KpiCards bracketStats={bracketStats} unit={filter.unit} />

            {/* Core Section: Bracket Comparison (1, 2, 3, 4, 5, 6+ ks) */}
            <BracketComparisonSection bracketStats={bracketStats} unit={filter.unit} />

            {/* Multipicking & Product Matches Analysis in Boxes */}
            <BoxSynergyAnalysis synergyData={synergyData} unit={filter.unit} />

            {/* Daily Performance Table & Pareto Analysis (Vývoj přes dny a dny v týdnu) */}
            <DailyTrendChart dailyStats={dailyStats} records={filteredRecords} unit={filter.unit} />

            {/* Detailed Movements Table */}
            <MovementsTable records={filteredRecords} unit={filter.unit} />

            {/* Zhodnocení: Simulace optimalizace a přeskupení do 2h slotů (Multipicking) */}
            <MultipickSimulationSection records={filteredRecords} unit={filter.unit} />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>Warehouse Pick & Pack Performance Analytics • {lang === 'cs' ? 'Optimalizováno pro MariaDB a fulfillment expedici' : 'Optimized for MariaDB and high-throughput fulfillment'}</p>
      </footer>

      {/* Modals */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleImportComplete}
        dbStatus={dbStatus}
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
