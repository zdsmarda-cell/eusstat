import React, { useState, useEffect } from 'react';
import { X, Database, CheckCircle2, AlertCircle, RefreshCw, KeyRound, Server, HardDrive, ShieldCheck, HelpCircle } from 'lucide-react';
import { MariaDbConfig, DbStatus } from '../types.js';

interface DbSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionUpdated: () => void;
}

export const DbSettingsModal: React.FC<DbSettingsModalProps> = ({
  isOpen,
  onClose,
  onConnectionUpdated,
}) => {
  const [config, setConfig] = useState<MariaDbConfig>({
    host: '',
    port: 3306,
    user: '',
    password: '',
    database: '',
    ssl: false,
  });

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<DbStatus | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/db/config')
        .then(res => res.json())
        .then(data => {
          setConfig(prev => ({
            ...prev,
            host: data.host || '',
            port: data.port || 3306,
            user: data.user || '',
            database: data.database || '',
            ssl: Boolean(data.ssl),
          }));
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/db/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data: DbStatus = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        connected: false,
        type: 'memory',
        lastError: err.message || 'Chyba při komunikaci se serverem',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/db/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setTestResult(data.status);
      onConnectionUpdated();
      onClose();
    } catch (err: any) {
      alert(`Chyba při ukládání: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Nastavení externí MariaDB
              </h3>
              <p className="text-xs text-slate-400">
                Připojení k vaší relační databázi pro ukládání a načítání skladových pohybů
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form fields */}
        <div className="mt-5 space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-slate-400" />
                <span>Hostitel / Server IP:</span>
              </label>
              <input
                type="text"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="např. mariadb.mojedomena.cz nebo IP"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Port:</label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: Number(e.target.value) || 3306 })}
                placeholder="3306"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span>Název databáze:</span>
            </label>
            <input
              type="text"
              value={config.database}
              onChange={(e) => setConfig({ ...config, database: e.target.value })}
              placeholder="např. warehouse_db"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Uživatelské jméno:</label>
              <input
                type="text"
                value={config.user}
                onChange={(e) => setConfig({ ...config, user: e.target.value })}
                placeholder="db_user"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                <span>Heslo:</span>
              </label>
              <input
                type="password"
                value={config.password || ''}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* SSL Checkbox */}
          <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 font-medium">Použít šifrované SSL spojení</span>
            </div>
            <input
              type="checkbox"
              checked={config.ssl}
              onChange={(e) => setConfig({ ...config, ssl: e.target.checked })}
              className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
            />
          </div>

          {/* Test connection result banner */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start space-x-2.5 ${
                testResult.connected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {testResult.connected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold">
                  {testResult.connected
                    ? `Připojení k MariaDB je aktivní!`
                    : `Připojení se nezdařilo`}
                </div>
                {testResult.connected ? (
                  <p className="text-[11px] text-emerald-400/90 font-mono">
                    Verze: {testResult.version} • Odezva: {testResult.latencyMs}ms • Záznamů v tabulce: {testResult.totalRows}
                  </p>
                ) : (
                  <p className="text-[11px] text-rose-400/90">
                    {testResult.lastError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Help toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Jak povolit vzdálené připojení k MariaDB serveru?</span>
            </button>

            {showHelp && (
              <div className="mt-2 p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400 space-y-1.5 font-mono">
                <p className="text-slate-300 font-semibold font-sans">
                  Tip pro povolení přístupu na MariaDB:
                </p>
                <p>1. Zkontrolujte v <code className="text-indigo-300">/etc/mysql/mariadb.conf.d/50-server.cnf</code> direktivu: <code className="text-amber-300">bind-address = 0.0.0.0</code></p>
                <p>2. Vytvořte uživatele s právy pro vzdálený přístup:</p>
                <pre className="bg-slate-900 p-2 rounded text-emerald-400 overflow-x-auto">
{`GRANT ALL PRIVILEGES ON sklad_db.* TO 'sklad_user'@'%' IDENTIFIED BY 'vaseHeslo';
FLUSH PRIVILEGES;`}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !config.host}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>Otestovat spojení</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Zavřít
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-all"
            >
              {isSaving ? 'Ukládám...' : 'Uložit konfiguraci'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
