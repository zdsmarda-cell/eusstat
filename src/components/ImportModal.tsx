import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, ArrowRight, Loader2, Clipboard, FileText } from 'lucide-react';
import { parseFileContent, parseClipboardText, ParseResult, downloadSampleCsv, downloadSampleExcel } from '../utils/fileParser.js';
import { MovementRecord, DbStatus } from '../types.js';
import { useLanguage } from '../context/LanguageContext.js';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (
    records: MovementRecord[],
    onProgress?: (saved: number, total: number) => void,
    replaceExisting?: boolean
  ) => Promise<void>;
  dbStatus: DbStatus;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  dbStatus,
}) => {
  const { lang, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'file' | 'clipboard'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [clipboardText, setClipboardText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [importProgress, setImportProgress] = useState<{ saved: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setImportError(null);

    try {
      const res = await parseFileContent(selectedFile);
      setParseResult(res);
    } catch (err: any) {
      setImportError(err.message || 'Chyba při čtení souboru.');
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleClipboardParse = () => {
    if (!clipboardText.trim()) {
      setImportError('Vložte nejprve text zkopírovaný z Excelu.');
      return;
    }
    setIsParsing(true);
    setImportError(null);
    try {
      const res = parseClipboardText(clipboardText);
      setParseResult(res);
    } catch (err: any) {
      setImportError(err.message || 'Chyba při zpracování textu.');
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmitImport = async () => {
    if (!parseResult || parseResult.records.length === 0) return;
    setIsImporting(true);
    setImportError(null);
    setImportProgress({ saved: 0, total: parseResult.records.length });

    try {
      await onImportComplete(
        parseResult.records,
        (saved, total) => {
          setImportProgress({ saved, total });
        },
        replaceExisting
      );
      onClose();
    } catch (err: any) {
      setImportError(err.message || 'Nepodařilo se importovat záznamy do databáze.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {t.modals.importTitle}
              </h3>
              <p className="text-xs text-slate-400">
                {t.modals.importSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="mt-4 flex items-center space-x-2 border-b border-slate-800/80 pb-3">
          <button
            onClick={() => setActiveTab('file')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'file'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{t.modals.fileTab}</span>
          </button>
          <button
            onClick={() => setActiveTab('clipboard')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'clipboard'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span>{t.modals.pasteTab}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="mt-4 space-y-4">
          {/* Destination Badge */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs">
            <span className="text-slate-400">{lang === 'cs' ? 'Cílové úložiště pro import:' : 'Import target storage:'}</span>
            <div className="flex items-center space-x-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                  dbStatus.connected
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}
              >
                {dbStatus.connected ? `MariaDB (${dbStatus.database})` : (lang === 'cs' ? 'Lokální paměť' : 'Local Memory')}
              </span>
            </div>
          </div>

          {activeTab === 'file' ? (
            /* Drag & Drop Zone */
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/40 hover:bg-slate-950/70 rounded-2xl p-7 text-center cursor-pointer transition-all group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                accept=".csv,.tsv,.xlsx,.xls"
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-white">
                {file ? file.name : 'Přetáhněte sem soubor nebo klikněte pro výběr'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Atributy: sběrný box, obsah objednávky, počet produktů, EAN, ks, začátek/konec pickování a balení
              </p>
            </div>
          ) : (
            /* Clipboard Paste Area */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Vložte zkopírované řádky z Excelu (označte v Excelu buňky vč. hlavičky a stiskněte Ctrl+C):</span>
              </div>
              <textarea
                value={clipboardText}
                onChange={(e) => setClipboardText(e.target.value)}
                placeholder="Vložte sem zkopírovaná data (Ctrl+V)..."
                rows={6}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleClipboardParse}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition-colors flex items-center space-x-1.5"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Zpracovat vložená data</span>
              </button>
            </div>
          )}

          {/* Sample template download links */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Potřebujete vzorový soubor s přesným formátem?</span>
            <div className="flex items-center space-x-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadSampleCsv();
                }}
                className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Stáhnout vzor CSV</span>
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadSampleExcel();
                }}
                className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Stáhnout vzor Excel</span>
              </button>
            </div>
          </div>

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="flex items-center justify-center space-x-2 py-4 text-xs text-indigo-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Načítám a analyzuji data...</span>
            </div>
          )}

          {/* Live Import Progress */}
          {isImporting && importProgress && (
            <div className="p-4 bg-slate-950 border border-indigo-500/40 rounded-2xl space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-indigo-300 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Ukládám do databáze v dávkách...</span>
                </span>
                <span className="text-white font-mono">
                  {importProgress.saved} / {importProgress.total} ({Math.round((importProgress.saved / Math.max(1, importProgress.total)) * 100)} %)
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(4, Math.round((importProgress.saved / Math.max(1, importProgress.total)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {importError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{importError}</span>
            </div>
          )}

          {/* Parse Results Preview */}
          {parseResult && !isParsing && (
            <div className="space-y-4">
              {/* Summary pill */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-white font-medium">
                    Nalezeno <strong className="text-emerald-400 font-mono">{parseResult.records.length}</strong> platných záznamů
                  </span>
                </div>
                <span className="text-slate-400">
                  z {parseResult.totalRowsFound} řádků
                </span>
              </div>

              {/* Detected columns map */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Mapování nalezených sloupců:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {Object.entries(parseResult.detectedColumns).map(([label, colName]) => (
                    <div key={label} className="bg-slate-900 px-2 py-1.5 rounded-lg border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">{label}</span>
                      <span className="text-slate-200 font-mono font-medium truncate block">
                        {colName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table (first 3 rows) */}
              {parseResult.records.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Náhled dat před uložením:
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-800 text-[11px] font-mono">
                    <table className="w-full text-left bg-slate-950/80">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="p-2">Sběrný box</th>
                          <th className="p-2">Objednávka</th>
                          <th className="p-2 text-center">Ks</th>
                          <th className="p-2 text-right">Pick na 1ks</th>
                          <th className="p-2 text-right">Balení na 1ks</th>
                          <th className="p-2 text-center">Kategorie</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {parseResult.records.slice(0, 3).map((r, i) => (
                          <tr key={i} className="text-slate-300">
                            <td className="p-2 text-white font-medium">{r.sberny_box}</td>
                            <td className="p-2">{r.obsah_objednavek}</td>
                            <td className="p-2 text-center">{r.pocet_produktu}</td>
                            <td className="p-2 text-right text-indigo-300">{r.pick_per_item_s}s</td>
                            <td className="p-2 text-right text-emerald-300">{r.pack_per_item_s}s</td>
                            <td className="p-2 text-center">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-indigo-300">
                                {r.bracket} ks
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
            />
            <span>
              {lang === 'cs'
                ? 'Nahradit stávající data (vymazat předchozí/vzorová data)'
                : 'Replace existing data (clear previous/sample records)'}
            </span>
          </label>

          <div className="flex items-center space-x-3 self-end sm:self-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Zrušit
            </button>
            <button
              onClick={handleSubmitImport}
              disabled={!parseResult || parseResult.records.length === 0 || isImporting}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 disabled:opacity-40 disabled:hover:from-blue-600 disabled:hover:to-indigo-600 transition-all"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Ukládám do databáze...</span>
                </>
              ) : (
                <>
                  <span>Potvrdit a importovat {parseResult?.records.length || 0} záznamů</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
