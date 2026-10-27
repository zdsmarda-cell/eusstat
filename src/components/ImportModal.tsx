import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  ArrowRight,
  Loader2,
  Clipboard,
  Shuffle,
  Package,
  Building2,
  BarChart3,
  Globe,
  Boxes,
} from 'lucide-react';
import { parseFileContent, parseClipboardText, ParseResult, downloadSampleCsv, downloadSampleExcel } from '../utils/fileParser.js';
import { parseSvjTriFilesFromRawFiles } from '../utils/svjParser.js';
import { generateSampleSvjCsvFiles } from '../server/sampleDataSvj.js';
import {
  parseGateCsvFilesStreaming,
  generateSampleGateCsvFiles,
  GateStreamParseProgress,
  GateParseResult,
} from '../utils/gateParser.js';
import { MovementRecord, DbStatus, SvjTriFileParseResult, WarehouseId, GateAnalyticsReport, BracketStat } from '../types.js';
import { useLanguage } from '../context/LanguageContext.js';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (
    records: MovementRecord[],
    onProgress?: (saved: number, total: number) => void,
    replaceExisting?: boolean,
    targetWarehouse?: WarehouseId
  ) => Promise<void>;
  onGateImportComplete?: (
    report: GateAnalyticsReport,
    sampleRecords: MovementRecord[],
    replaceExisting: boolean
  ) => Promise<void>;
  svjBracketStats?: BracketStat[];
  dbStatus: DbStatus;
  initialWarehouse?: WarehouseId;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  onGateImportComplete,
  svjBracketStats,
  initialWarehouse = 'ruse',
}) => {
  const { lang, t } = useLanguage();
  const isCs = lang === 'cs';

  // Warehouse selection
  const [targetWarehouse, setTargetWarehouse] = useState<WarehouseId>(initialWarehouse);

  React.useEffect(() => {
    if (isOpen && initialWarehouse) {
      setTargetWarehouse(initialWarehouse);
    }
  }, [isOpen, initialWarehouse]);

  // Ruse mode states
  const [activeTab, setActiveTab] = useState<'file' | 'clipboard'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [clipboardText, setClipboardText] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // SVJ 3-file mode states
  const [svjFiles, setSvjFiles] = useState<File[]>([]);
  const [svjParseResult, setSvjParseResult] = useState<SvjTriFileParseResult | null>(null);

  // Gate 2-file (or 3-file) streaming mode states
  const [gateFiles, setGateFiles] = useState<File[]>([]);
  const [gateParseResult, setGateParseResult] = useState<GateParseResult | null>(null);
  const [gateStreamProgress, setGateStreamProgress] = useState<GateStreamParseProgress | null>(null);

  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [importProgress, setImportProgress] = useState<{ saved: number; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const svjFileInputRef = useRef<HTMLInputElement>(null);
  const gateFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Single file handler for Ruse
  const handleFileChange = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsParsing(true);
    setImportError(null);

    try {
      const res = await parseFileContent(selectedFile);
      const tagged = res.records.map(r => ({ ...r, warehouse: targetWarehouse }));
      setParseResult({ ...res, records: tagged });
    } catch (err: any) {
      setImportError(err.message || 'Chyba při čtení souboru.');
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  // SVJ 3-file handler
  const handleSvjFilesChange = async (incomingFiles: FileList | File[]) => {
    const fileArray = Array.from(incomingFiles);
    if (fileArray.length === 0) return;

    setSvjFiles(fileArray);
    setIsParsing(true);
    setImportError(null);

    try {
      const res = await parseSvjTriFilesFromRawFiles(fileArray);
      setSvjParseResult(res);
      if (res.errors.length > 0 && res.records.length === 0) {
        setImportError(res.errors.join(' '));
      }
    } catch (err: any) {
      setImportError(err.message || 'Chyba při zpracování SVJ souborů.');
      setSvjParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Gate 2-3 CSV files streaming handler (hundreds of MBs)
  const handleGateFilesChange = async (incomingFiles: FileList | File[]) => {
    const fileArray = Array.from(incomingFiles);
    if (fileArray.length === 0) return;

    setGateFiles(fileArray);
    setIsParsing(true);
    setImportError(null);
    setGateStreamProgress({
      phase: 'Identifikuji CSV soubory skladu Gate...',
      percent: 2,
      bytesProcessed: 0,
      totalBytes: fileArray.reduce((acc, f) => acc + f.size, 0),
    });

    try {
      const res = await parseGateCsvFilesStreaming(
        fileArray,
        svjBracketStats,
        (prog) => setGateStreamProgress({ ...prog })
      );
      setGateParseResult(res);
      if (res.errors.length > 0 && res.report.totalOrders === 0) {
        setImportError(res.errors.join(' '));
      }
    } catch (err: any) {
      setImportError(err.message || 'Chyba při proudovém zpracování CSV souborů Gate.');
      setGateParseResult(null);
    } finally {
      setIsParsing(false);
      setGateStreamProgress(null);
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
      const tagged = res.records.map(r => ({ ...r, warehouse: targetWarehouse }));
      setParseResult({ ...res, records: tagged });
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
      if (targetWarehouse === 'svj') {
        handleSvjFilesChange(e.dataTransfer.files);
      } else if (targetWarehouse === 'gate') {
        handleGateFilesChange(e.dataTransfer.files);
      } else {
        handleFileChange(e.dataTransfer.files[0]);
      }
    }
  };

  const handleSubmitImport = async () => {
    if (targetWarehouse === 'gate') {
      if (!gateParseResult || gateParseResult.report.totalOrders === 0) return;
      setIsImporting(true);
      setImportError(null);
      try {
        if (onGateImportComplete) {
          await onGateImportComplete(
            gateParseResult.report,
            gateParseResult.sampleRecords,
            replaceExisting
          );
        }
        onClose();
      } catch (err: any) {
        setImportError(err.message || 'Nepodařilo se uložit analytiku skladu Gate do databáze.');
      } finally {
        setIsImporting(false);
      }
      return;
    }

    const recordsToImport = targetWarehouse === 'svj'
      ? (svjParseResult ? svjParseResult.records : [])
      : (parseResult ? parseResult.records : []);

    if (recordsToImport.length === 0) return;

    setIsImporting(true);
    setImportError(null);
    setImportProgress({ saved: 0, total: recordsToImport.length });

    try {
      await onImportComplete(
        recordsToImport,
        (saved, total) => {
          setImportProgress({ saved, total });
        },
        replaceExisting,
        targetWarehouse
      );
      onClose();
    } catch (err: any) {
      setImportError(err.message || 'Nepodařilo se importovat záznamy do databáze.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const downloadSvjSampleFiles = () => {
    const samples = generateSampleSvjCsvFiles();

    const triggerDownload = (filename: string, content: string) => {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    triggerDownload('svj_1_picking.csv', samples.pickingCsv);
    setTimeout(() => triggerDownload('svj_2_sorting.csv', samples.sortingCsv), 250);
    setTimeout(() => triggerDownload('svj_3_packing_manual.csv', samples.packingCsv), 500);
  };

  const downloadGateSampleFiles = () => {
    const samples = generateSampleGateCsvFiles();

    const triggerDownload = (filename: string, content: string) => {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    triggerDownload('gate_1_orders.csv', samples.ordersCsv);
    setTimeout(() => triggerDownload('gate_2_order_items.csv', samples.itemsCsv), 250);
    setTimeout(() => triggerDownload('gate_3_stock_inventory.csv', samples.stockCsv), 500);
  };

  const warehouseLabel = targetWarehouse === 'svj' ? 'SVJ' : targetWarehouse === 'gate' ? 'Gate' : 'Ruse';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 overflow-hidden my-8">
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
                {isCs
                  ? 'Vyberte cílový sklad a nahrajte skladové soubory (CSV, Excel – podpora stovek MB).'
                  : 'Select target warehouse and upload operational movement files (supports multi-hundred MB CSVs).'}
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

        {/* Warehouse Target Switcher Tabs */}
        <div className="mt-4 p-1.5 bg-slate-950 border border-slate-800 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => {
              setTargetWarehouse('ruse');
              setImportError(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              targetWarehouse === 'ruse'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>{isCs ? 'Sklad Ruse (1 soubor)' : 'Ruse (1 file)'}</span>
          </button>

          <button
            onClick={() => {
              setTargetWarehouse('svj');
              setImportError(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              targetWarehouse === 'svj'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shuffle className="w-4 h-4" />
            <span>{isCs ? 'Sklad SVJ (3 soubory)' : 'SVJ (3 files)'}</span>
          </button>

          <button
            onClick={() => {
              setTargetWarehouse('gate');
              setImportError(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
              targetWarehouse === 'gate'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>{isCs ? 'Sklad Gate (2 CSV – stovky MB)' : 'Gate (2 CSVs – 100s MB)'}</span>
          </button>
        </div>

        {/* Content based on selected warehouse */}
        {targetWarehouse === 'ruse' ? (
          /* ========================================================
             RUSE WAREHOUSE IMPORT (SINGLE FILE / CLIPBOARD)
             ======================================================== */
          <div className="mt-4 space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-3">
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

            {activeTab === 'file' ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-950/40 hover:bg-slate-950/70 rounded-2xl p-7 text-center cursor-pointer transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                  accept=".csv,.tsv,.xlsx,.xls"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-white">
                  {file ? file.name : (isCs ? 'Přetáhněte sem soubor skladu Ruse nebo klikněte' : 'Drop Ruse file here or click to browse')}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Sloupce: sběrný box, obsah objednávky, počet produktů, EAN, ks, začátek/konec pickování a balení
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={clipboardText}
                  onChange={(e) => setClipboardText(e.target.value)}
                  placeholder="Vložte sem zkopírovaná data z Excelu (Ctrl+V)..."
                  rows={5}
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

            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>{isCs ? 'Vzorový soubor pro sklad Ruse:' : 'Sample format for Ruse:'}</span>
              <div className="flex items-center space-x-3">
                <button onClick={downloadSampleCsv} className="text-blue-400 hover:text-blue-300 font-medium flex items-center space-x-1">
                  <Download className="w-3.5 h-3.5" />
                  <span>{isCs ? 'Stáhnout vzor CSV' : 'Download Sample CSV'}</span>
                </button>
                <span className="text-slate-700">|</span>
                <button onClick={downloadSampleExcel} className="text-blue-400 hover:text-blue-300 font-medium flex items-center space-x-1">
                  <Download className="w-3.5 h-3.5" />
                  <span>{isCs ? 'Stáhnout vzor Excel' : 'Download Sample Excel'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : targetWarehouse === 'svj' ? (
          /* ========================================================
             SVJ WAREHOUSE IMPORT (3-FILES BATCH: PICKING, SORTING, PACKING)
             ======================================================== */
          <div className="mt-4 space-y-4">
            <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/25 text-xs text-purple-200 space-y-1">
              <strong className="font-bold flex items-center space-x-1.5 text-purple-300">
                <Shuffle className="w-4 h-4" />
                <span>{isCs ? 'Import 3 souborů pro sklad SVJ najednou' : 'SVJ Tri-File Import'}</span>
              </strong>
              <p className="text-[11px] text-purple-200/80 leading-relaxed">
                {isCs
                  ? 'Vyberte nebo přetáhněte všechny 3 soubory najednou: 1. Picking (box, order_uids, product_codes), 2. Sorting (box, units_sorted, wait_after_picking_min) a 3. Packing (order_uid, pack_open, packed, pack_sec). Systém automaticky spáruje objednávky, které byly vysortovány a mají ruční balení.'
                  : 'Drop all 3 files at once: Picking, Sorting, and Manual Packing. The system matches orders that were both sorted and packed.'}
              </p>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => svjFileInputRef.current?.click()}
              className="border-2 border-dashed border-purple-500/40 hover:border-purple-400 bg-slate-950/40 hover:bg-slate-950/70 rounded-2xl p-6 text-center cursor-pointer transition-all group"
            >
              <input
                type="file"
                ref={svjFileInputRef}
                onChange={(e) => e.target.files && handleSvjFilesChange(e.target.files)}
                accept=".csv,.tsv,.xlsx,.xls"
                multiple
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/25 text-purple-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="mt-2 text-sm font-semibold text-white">
                {svjFiles.length > 0
                  ? (isCs ? `Vybráno ${svjFiles.length} souborů: ${svjFiles.map(f => f.name).join(', ')}` : `${svjFiles.length} files selected: ${svjFiles.map(f => f.name).join(', ')}`)
                  : (isCs ? 'Přetáhněte sem všechny 3 soubory SVJ najednou (nebo klikněte)' : 'Drop all 3 SVJ files together or click to select')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Picking CSV + Sorting CSV + Packing (Ruční balení) CSV
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className={`p-3 rounded-xl border text-xs ${
                svjParseResult && svjParseResult.pickingRowsCount > 0
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold flex items-center space-x-1.5">
                  <Package className="w-3.5 h-3.5" />
                  <span>1. Picking</span>
                </div>
                <div className="text-[11px] mt-1 font-mono">
                  {svjParseResult && svjParseResult.pickingRowsCount > 0
                    ? `✓ ${svjParseResult.pickingRowsCount} boxů (${svjParseResult.uniqueOrdersPicked} obj.)`
                    : (isCs ? 'Čeká na soubor...' : 'Waiting for file...')}
                </div>
              </div>

              <div className={`p-3 rounded-xl border text-xs ${
                svjParseResult && svjParseResult.sortingRowsCount > 0
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold flex items-center space-x-1.5">
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>2. Sorting</span>
                </div>
                <div className="text-[11px] mt-1 font-mono">
                  {svjParseResult && svjParseResult.sortingRowsCount > 0
                    ? `✓ ${svjParseResult.sortingRowsCount} boxů (${svjParseResult.uniqueOrdersSorted} obj.)`
                    : (isCs ? 'Čeká na soubor...' : 'Waiting for file...')}
                </div>
              </div>

              <div className={`p-3 rounded-xl border text-xs ${
                svjParseResult && svjParseResult.packingRowsCount > 0
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>3. Ruční balení</span>
                </div>
                <div className="text-[11px] mt-1 font-mono">
                  {svjParseResult && svjParseResult.packingRowsCount > 0
                    ? `✓ ${svjParseResult.packingRowsCount} zabalených obj.`
                    : (isCs ? 'Čeká na soubor...' : 'Waiting for file...')}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1 pt-1">
              <span>{isCs ? 'Chcete si stáhnout vzorové 3 soubory SVJ?' : 'Download sample SVJ files?'}</span>
              <button
                type="button"
                onClick={downloadSvjSampleFiles}
                className="text-purple-400 hover:text-purple-300 font-semibold flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isCs ? 'Stáhnout vzorové 3 CSV soubory' : 'Download Sample 3 CSVs'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================
             GATE WAREHOUSE IMPORT (2 HUGE CSV FILES: ORDERS + ORDER ITEMS + OPTIONAL STOCK)
             ======================================================== */
          <div className="mt-4 space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/25 text-xs text-emerald-200 space-y-1.5">
              <strong className="font-bold flex items-center space-x-1.5 text-emerald-300">
                <BarChart3 className="w-4 h-4" />
                <span>
                  {isCs
                    ? 'Proudový import pro sklad Gate (2 CSV soubory – podpora stovek MB)'
                    : 'Streaming Import for Gate Warehouse (2 CSV files – supports hundreds of MBs)'}
                </span>
              </strong>
              <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                {isCs
                  ? 'Vyberte najednou oba CSV soubory (případně i 3. soubor se stavem zásob): 1. Seznam objednávek (order_id, order_created_at, ship_date, packed_at, country, weight_kg, package_type, items_qty, cod_flag...) a 2. Produktový obsah objednávek (order_id, sku, article_code, qty). Soubory se čtou proudově po 6MB blocích přímo v prohlížeči bez přetížení paměti RAM.'
                  : 'Select both CSV files at once: 1. Orders CSV (order_id, dates, country, items_qty...) and 2. Order Items CSV (order_id, sku, article_code, qty). Processed in 6MB streaming chunks.'}
              </p>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => gateFileInputRef.current?.click()}
              className="border-2 border-dashed border-emerald-500/40 hover:border-emerald-400 bg-slate-950/40 hover:bg-slate-950/70 rounded-2xl p-6 text-center cursor-pointer transition-all group"
            >
              <input
                type="file"
                ref={gateFileInputRef}
                onChange={(e) => e.target.files && handleGateFilesChange(e.target.files)}
                accept=".csv,.tsv,.txt"
                multiple
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="mt-2 text-sm font-semibold text-white">
                {gateFiles.length > 0
                  ? (isCs
                      ? `Vybráno ${gateFiles.length} souborů (${(gateFiles.reduce((a, f) => a + f.size, 0) / (1024 * 1024)).toFixed(1)} MB): ${gateFiles.map(f => f.name).join(', ')}`
                      : `${gateFiles.length} files selected: ${gateFiles.map(f => f.name).join(', ')}`)
                  : (isCs
                      ? 'Přetáhněte sem CSV soubory skladu Gate (Objednávky + Položky SKU) nebo klikněte'
                      : 'Drop Gate CSV files (Orders + Order Items SKU) here or click to select')}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                1. Objednávky CSV (`order_id`, `country`, `items_qty`...) + 2. Produktový obsah CSV (`order_id`, `sku`, `qty`) + volitelně 3. Zásoby CSV (`sku`, `stock_qty`)
              </p>
            </div>

            {/* Streaming Progress Bar for Huge CSVs */}
            {isParsing && gateStreamProgress && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-300 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    {gateStreamProgress.phase}
                  </span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {gateStreamProgress.percent}% ({(gateStreamProgress.bytesProcessed / (1024 * 1024)).toFixed(1)} / {(gateStreamProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-150"
                    style={{ width: `${Math.min(100, Math.max(2, gateStreamProgress.percent))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Gate 2+1 Status Slots */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className={`p-3 rounded-xl border text-xs ${
                gateParseResult && gateParseResult.report.ordersFileRows > 0
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  <span>1. Objednávky & Země</span>
                </div>
                <div className="text-[11px] mt-1 font-mono">
                  {gateParseResult && gateParseResult.report.ordersFileRows > 0
                    ? `✓ ${gateParseResult.report.totalOrders.toLocaleString('cs-CZ')} obj. (${gateParseResult.report.countryStats.length} zemí)`
                    : (isCs ? 'order_id, country, items_qty...' : 'Waiting for Orders CSV...')}
                </div>
              </div>

              <div className={`p-3 rounded-xl border text-xs ${
                gateParseResult && gateParseResult.report.itemsFileRows > 0
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold flex items-center space-x-1.5">
                  <Package className="w-3.5 h-3.5" />
                  <span>2. Produktový obsah (SKU)</span>
                </div>
                <div className="text-[11px] mt-1 font-mono">
                  {gateParseResult && gateParseResult.report.itemsFileRows > 0
                    ? `✓ ${gateParseResult.report.itemsFileRows.toLocaleString('cs-CZ')} řádků (${gateParseResult.report.totalActiveSkus.toLocaleString('cs-CZ')} SKU)`
                    : (isCs ? 'order_id, sku, article_code, qty' : 'Waiting for Items CSV...')}
                </div>
              </div>

              <div className={`p-3 rounded-xl border text-xs ${
                gateParseResult && gateParseResult.report.totalCatalogSkus > 0
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}>
                <div className="font-bold flex items-center space-x-1.5">
                  <Boxes className="w-3.5 h-3.5" />
                  <span>3. ABC Zásoby & FTE</span>
                </div>
                <div className="text-[11px] mt-1 font-mono">
                  {gateParseResult
                    ? `✓ ${gateParseResult.report.months.length} měsíců • ${gateParseResult.report.zeroMovementSkus.toLocaleString('cs-CZ')} SKU bez výdeje`
                    : (isCs ? 'Volitelný CSV zásob / kalibrace' : 'Optional Stock CSV')}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 px-1 pt-1">
              <span>{isCs ? 'Chcete si stáhnout vzorové CSV soubory skladu Gate?' : 'Download sample Gate CSV files?'}</span>
              <button
                type="button"
                onClick={downloadGateSampleFiles}
                className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isCs ? 'Stáhnout vzorové CSV soubory Gate' : 'Download Sample Gate CSVs'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {importError && (
          <div className="mt-4 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        {/* Parse Result Summary Banner */}
        {((targetWarehouse === 'ruse' && parseResult) ||
          (targetWarehouse === 'svj' && svjParseResult) ||
          (targetWarehouse === 'gate' && gateParseResult)) && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-white">
              <span>{isCs ? 'Přehled připravených dat k importu:' : 'Prepared import data:'}</span>
              <span className="text-emerald-400 font-mono">
                {targetWarehouse === 'svj'
                  ? `${svjParseResult?.records.length.toLocaleString('cs-CZ')} objednávek (vše připraveno k importu)`
                  : targetWarehouse === 'gate'
                  ? `${gateParseResult?.report.totalOrders.toLocaleString('cs-CZ')} objednávek • ${gateParseResult?.report.totalUnits.toLocaleString('cs-CZ')} ks (${gateParseResult?.report.months.length} měsíců)`
                  : `${parseResult?.records.length.toLocaleString('cs-CZ')} zakázek`}
              </span>
            </div>

            {targetWarehouse === 'svj' && svjParseResult && (
              <div className="text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span>{isCs ? 'Celkem vypickováno v boxech (k importu do DB):' : 'Total picked in boxes (to DB import):'}</span>
                  <span className="font-mono text-emerald-400 font-bold">{svjParseResult.uniqueOrdersPicked.toLocaleString('cs-CZ')} obj.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isCs ? 'Z toho prošlo procesem sortingu:' : 'Processed via sorting:'}</span>
                  <span className="font-mono text-purple-300">
                    {svjParseResult.uniqueOrdersSorted.toLocaleString('cs-CZ')} obj.
                    {svjParseResult.totalUnitsSorted !== undefined && (
                      <span className="text-purple-400 font-semibold ml-1.5">
                        ({svjParseResult.totalUnitsSorted.toLocaleString('cs-CZ')} ks)
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isCs ? 'Z toho ověřené ruční balení (vstup pro packing KPI):' : 'Manual packing (input for packing KPI):'}</span>
                  <span className="font-mono text-indigo-300 font-bold">{svjParseResult.uniqueOrdersPacked.toLocaleString('cs-CZ')} obj.</span>
                </div>
              </div>
            )}

            {targetWarehouse === 'gate' && gateParseResult && (
              <div className="text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span>{isCs ? 'Průměrný počet ks na 1 objednávku:' : 'Avg units per order:'}</span>
                  <span className="font-mono text-emerald-400 font-bold">{gateParseResult.report.avgUnitsPerOrder.toFixed(2)} ks / obj.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isCs ? 'Paretovo pravidlo 80 % produkce / aktivní SKU:' : '80% Pareto SKU / Active SKUs:'}</span>
                  <span className="font-mono text-cyan-300 font-bold">
                    {gateParseResult.report.skusFor80PctTotal.toLocaleString('cs-CZ')} SKU ({gateParseResult.report.skusFor80PctShare.toFixed(1)} %) z {gateParseResult.report.totalActiveSkus.toLocaleString('cs-CZ')} aktivních SKU
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isCs ? 'Nadzásoba nad 3 průměrné měsíce / ležáky bez výdeje:' : 'Excess stock (>3m) / Zero-movement dead stock:'}</span>
                  <span className="font-mono text-amber-300 font-bold">
                    {gateParseResult.report.abcSummary.excessReplenishmentSkus.toLocaleString('cs-CZ')} SKU nadzásoba • {gateParseResult.report.abcSummary.deadStockSkus.toLocaleString('cs-CZ')} SKU bez výdeje
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              {isCs
                ? `Přemazat předchozí data skladu '${warehouseLabel}'`
                : `Replace existing data for '${warehouseLabel}'`}
            </span>
          </label>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              {isCs ? 'Zrušit' : 'Cancel'}
            </button>

            <button
              onClick={handleSubmitImport}
              disabled={
                isImporting ||
                isParsing ||
                (targetWarehouse === 'svj'
                  ? !svjParseResult || svjParseResult.records.length === 0
                  : targetWarehouse === 'gate'
                  ? !gateParseResult || gateParseResult.report.totalOrders === 0
                  : !parseResult || parseResult.records.length === 0)
              }
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-40 transition-all flex items-center space-x-2 cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {importProgress ? `${importProgress.saved} / ${importProgress.total}` : (isCs ? 'Ukládám...' : 'Saving...')}
                  </span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  <span>
                    {isCs
                      ? `Importovat do skladu ${warehouseLabel}`
                      : `Import into ${warehouseLabel}`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
