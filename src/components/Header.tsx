import React from 'react';
import { Database, UploadCloud, RefreshCw, Sparkles, Download, Layers, ShieldCheck, AlertCircle, Globe, LogOut, User, FileCode } from 'lucide-react';
import { DbStatus } from '../types.js';
import { downloadSampleCsv, downloadSampleExcel } from '../utils/fileParser.js';
import { useLanguage } from '../context/LanguageContext.js';
import { useAuth } from '../context/AuthContext.js';

interface HeaderProps {
  dbStatus: DbStatus;
  onOpenImport: () => void;
  onOpenDbSettings: () => void;
  onLoadSampleData: () => void;
  onExportHtml?: () => void;
  isLoading: boolean;
  totalRecordsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  dbStatus,
  onOpenImport,
  onOpenDbSettings,
  onLoadSampleData,
  onExportHtml,
  isLoading,
  totalRecordsCount,
}) => {
  const { lang, setLang, t } = useLanguage();
  const { username, logout } = useAuth();

  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 p-0.5 shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Layers className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  {t.header.appName}
                </h1>
                <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Pick & Pack
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                {t.header.tagline}
              </p>
            </div>
          </div>

          {/* Center / Right controls */}
          <div className="flex items-center space-x-2 sm:space-x-2.5">
            {/* MariaDB Status pill */}
            <button
              onClick={onOpenDbSettings}
              className={`group flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                dbStatus.connected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
              }`}
              title="Klikněte pro konfiguraci a otestování připojení k MariaDB"
            >
              <Database className="w-3.5 h-3.5" />
              <div className="flex items-center space-x-1.5">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      dbStatus.connected ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      dbStatus.connected ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                </span>
                <span className="font-semibold hidden sm:inline">
                  {dbStatus.connected
                    ? `MariaDB: ${dbStatus.database || t.header.connectedMariaDb}`
                    : t.header.localMode}
                </span>
                {dbStatus.latencyMs !== undefined && (
                  <span className="text-[10px] text-emerald-500/80 font-mono">
                    ({dbStatus.latencyMs}ms)
                  </span>
                )}
              </div>
            </button>

            {/* Language Switcher */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setLang('cs')}
                className={`px-2 py-1 rounded-lg font-bold transition-all ${
                  lang === 'cs'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Přepnout do češtiny"
              >
                CZ
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-2 py-1 rounded-lg font-bold transition-all ${
                  lang === 'en'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Switch to English"
              >
                EN
              </button>
            </div>

            {/* Template download dropdown/btn */}
            <div className="hidden xl:flex items-center space-x-1">
              <button
                onClick={downloadSampleCsv}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors flex items-center space-x-1.5"
                title="Stáhnout vzorový CSV soubor"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>CSV</span>
              </button>
              <button
                onClick={downloadSampleExcel}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors flex items-center space-x-1.5"
                title="Stáhnout vzorový Excel soubor"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Excel</span>
              </button>
            </div>

            {/* Seed Sample Data Button - skryto při připojení k MariaDB / v ostrém provozu */}
            {dbStatus?.type !== 'mariadb' && (
              <button
                onClick={onLoadSampleData}
                disabled={isLoading}
                className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-all"
                title="Vygenerovat ukázková skladová data"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t.header.sampleDataBtn}</span>
              </button>
            )}

            {/* HTML Report Export Button */}
            {onExportHtml && (
              <button
                onClick={onExportHtml}
                disabled={totalRecordsCount === 0 || isLoading}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                title={lang === 'cs' ? 'Uložit výstupy jako samostatný HTML dokument k prohlížení a odeslání' : 'Save outputs as standalone HTML document'}
              >
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span className="hidden md:inline">{lang === 'cs' ? 'Uložit jako HTML' : 'Save as HTML'}</span>
              </button>
            )}

            {/* Import Button */}
            <button
              onClick={onOpenImport}
              className="flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <UploadCloud className="w-4 h-4" />
              <span className="hidden sm:inline">{t.header.importBtn}</span>
            </button>

            {/* User badge & Logout */}
            <div className="flex items-center pl-1 sm:pl-2 border-l border-slate-800 space-x-2">
              <span className="hidden md:flex items-center space-x-1.5 px-2 py-1 bg-slate-800/80 border border-slate-700/60 rounded-lg text-[11px] text-slate-300 font-mono">
                <User className="w-3 h-3 text-indigo-400" />
                <span>{username || 'eusfhb'}</span>
              </span>
              <button
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/30 transition-all"
                title={t.auth.logout}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
