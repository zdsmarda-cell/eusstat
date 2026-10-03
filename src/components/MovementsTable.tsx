import React, { useState, useMemo } from 'react';
import { Table, Download, ArrowUpDown, ChevronLeft, ChevronRight, Hash, Box, Package, Clock, BarChart } from 'lucide-react';
import { MovementRecord } from '../types.js';
import { formatTimeValue, getBracketBadgeColor } from '../utils/analytics.js';
import * as XLSX from 'xlsx';

interface MovementsTableProps {
  records: MovementRecord[];
  unit: 'sec' | 'min';
}

type SortField =
  | 'zacatek_pickovani'
  | 'obsah_objednavek'
  | 'pocet_produktu'
  | 'pick_duration_s'
  | 'pack_duration_s'
  | 'pick_per_item_s'
  | 'pack_per_item_s'
  | 'total_per_item_s';

export const MovementsTable: React.FC<MovementsTableProps> = ({ records, unit }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<SortField>('zacatek_pickovani');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'zacatek_pickovani') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [records, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const exportTableToExcel = () => {
    const exportData = sortedRecords.map(r => ({
      'Sběrný box': r.sberny_box,
      'Objednávka': r.obsah_objednavek,
      'Celkem produktů': r.pocet_produktu,
      'EAN produktu': r.ean_produktu,
      'Počet kusů v řádku': r.pocet_ks,
      'Kategorie (kusovost)': `${r.bracket} ks`,
      'Začátek pickování': r.zacatek_pickovani,
      'Konec pickování': r.konec_pickovani,
      'Doba pickování (s)': r.pick_duration_s,
      'Doba pickování na 1 ks (s)': r.pick_per_item_s,
      'Začátek balení': r.zacatek_baleni,
      'Konec balení': r.konec_baleni,
      'Doba balení (s)': r.pack_duration_s,
      'Doba balení na 1 ks (s)': r.pack_per_item_s,
      'Celkem čas procesu na 1 ks (s)': r.total_per_item_s,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Pohyby_Analyza');
    XLSX.writeFile(workbook, `vysledky_sklad_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  const exportTableToCsv = () => {
    const headers = [
      'sberny_box',
      'obsah_objednavek',
      'pocet_produktu',
      'ean_produktu',
      'pocet_ks',
      'bracket',
      'zacatek_pickovani',
      'konec_pickovani',
      'pick_duration_s',
      'pick_per_item_s',
      'zacatek_baleni',
      'konec_baleni',
      'pack_duration_s',
      'pack_per_item_s',
      'total_per_item_s',
    ];

    const rows = sortedRecords.map(r => [
      `"${r.sberny_box}"`,
      `"${r.obsah_objednavek}"`,
      r.pocet_produktu,
      `"${r.ean_produktu}"`,
      r.pocet_ks,
      `"${r.bracket}"`,
      `"${r.zacatek_pickovani}"`,
      `"${r.konec_pickovani}"`,
      r.pick_duration_s,
      r.pick_per_item_s,
      `"${r.zacatek_baleni}"`,
      `"${r.konec_baleni}"`,
      r.pack_duration_s,
      r.pack_per_item_s,
      r.total_per_item_s,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vysledky_sklad_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-4">
      {/* Table Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-slate-800 text-slate-300">
              <Table className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Detailní data pohybů
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Jednotlivé záznamy o pickování a balení vč. přesných časových známek a přepočtu na 1 produkt.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Export buttons */}
          <button
            onClick={exportTableToExcel}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors flex items-center space-x-1.5"
            title="Exportovat aktuálně vyfiltrovaná data do Excelu"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={exportTableToCsv}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-colors flex items-center space-x-1.5"
            title="Exportovat aktuálně vyfiltrovaná data do CSV"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 select-none">
              <th
                onClick={() => handleSort('zacatek_pickovani')}
                className="py-3 px-3.5 font-semibold cursor-pointer hover:text-white"
              >
                <div className="flex items-center space-x-1">
                  <span>Datum & Čas</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-3 font-semibold">Sběrný box</th>
              <th
                onClick={() => handleSort('obsah_objednavek')}
                className="py-3 px-3 font-semibold cursor-pointer hover:text-white"
              >
                <div className="flex items-center space-x-1">
                  <span>Objednávka</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-3 font-semibold">EAN produktu</th>
              <th
                onClick={() => handleSort('pocet_produktu')}
                className="py-3 px-3 font-semibold text-center cursor-pointer hover:text-white"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span>Počet ks</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-3 font-semibold text-center">Kategorie</th>
              <th
                onClick={() => handleSort('pick_duration_s')}
                className="py-3 px-3 font-semibold text-right text-indigo-300 cursor-pointer hover:text-white"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Pick celkem</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort('pick_per_item_s')}
                className="py-3 px-3 font-semibold text-right text-indigo-300 bg-indigo-950/20 cursor-pointer hover:text-white"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Pick / 1 ks</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort('pack_duration_s')}
                className="py-3 px-3 font-semibold text-right text-emerald-300 cursor-pointer hover:text-white"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Balení celkem</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort('pack_per_item_s')}
                className="py-3 px-3 font-semibold text-right text-emerald-300 bg-emerald-950/20 cursor-pointer hover:text-white"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Balení / 1 ks</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th
                onClick={() => handleSort('total_per_item_s')}
                className="py-3 px-3.5 font-semibold text-right text-purple-300 cursor-pointer hover:text-white"
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Celkem / 1 ks</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 font-mono">
            {paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500 text-xs font-sans">
                  Žádné odpovídající záznamy pro zadaný filtr.
                </td>
              </tr>
            ) : (
              paginatedRecords.map((r, i) => {
                const colors = getBracketBadgeColor(r.bracket);
                const pickDate = new Date(r.zacatek_pickovani);
                const formattedDate = `${pickDate.toLocaleDateString('cs-CZ')} ${pickDate.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`;

                return (
                  <tr key={r.id || i} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-semibold">
                      <div className="flex flex-col">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] border border-slate-700 w-fit">
                          {r.sberny_box}
                        </span>
                        {r.box_id && (
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                            ID: {r.box_id}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-white font-medium">
                      <div className="flex flex-col">
                        <span>{r.obsah_objednavek}</span>
                        {r.packer && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            Balič: <strong className="text-slate-300">{r.packer}</strong>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {r.ean_produktu}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-200 font-bold">
                      {r.pocet_produktu}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
                        {r.bracket === '5+' ? '5+ ks' : `${r.bracket} ks`}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-indigo-300">
                      {formatTimeValue(r.pick_duration_s, unit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-indigo-200 bg-indigo-950/20">
                      {formatTimeValue(r.pick_per_item_s, unit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-300">
                      {formatTimeValue(r.pack_duration_s, unit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-200 bg-emerald-950/20">
                      {formatTimeValue(r.pack_per_item_s, unit)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-bold text-purple-300">
                      {formatTimeValue(r.total_per_item_s, unit)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 pt-2">
        <div className="flex items-center space-x-2">
          <span>Zobrazit řádků na stránku:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 focus:outline-none"
          >
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-slate-500">
            (Stránka {currentPage} z {totalPages}, celkem {sortedRecords.length} záznamů)
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 py-1 font-mono font-semibold text-slate-200 bg-slate-950 rounded-lg border border-slate-800">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
