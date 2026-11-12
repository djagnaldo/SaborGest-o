/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FolderArchive,
  Calendar,
  FileText,
  TrendingUp,
  Download,
  Printer,
  Eye,
  Plus,
  Trash2,
  CheckCircle2,
  BarChart3,
  ArrowRight,
  ShieldCheck,
  Building2,
  FileSpreadsheet,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import {
  SavedReport,
  ArchivedPeriod,
  ReportType,
  ReportPeriodType,
} from '../../types';
import {
  getSavedReports,
  saveReport,
  deleteSavedReport,
  getArchivedPeriods,
  archivePeriod,
  getOrders,
  getProducts,
  getInventoryTransactions,
  getExpenses,
  getTables,
  getOrderProductSalesTotal,
} from '../../services/storage';
import { formatCurrencyBR, formatTimeBR } from '../../utils/formatters';

export const HistoricalArchivesView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  const [activeTab, setActiveTab] = useState<'reports' | 'archives' | 'compare'>('reports');
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [archivedPeriods, setArchivedPeriods] = useState<ArchivedPeriod[]>([]);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);
  const [selectedArchive, setSelectedArchive] = useState<ArchivedPeriod | null>(null);

  // Modal para Novo Relatório Salvo
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [newReportType, setNewReportType] = useState<ReportType>('vendas');
  const [newReportPeriod, setNewReportPeriod] = useState<ReportPeriodType>('semanal');
  const [customStart, setCustomStart] = useState(
    new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  );
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
  const [reportTitleInput, setReportTitleInput] = useState('');
  const [reportNotesInput, setReportNotesInput] = useState('');

  // Modal para Arquivar Período
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archiveLabelInput, setArchiveLabelInput] = useState('');
  const [archivePeriodType, setArchivePeriodType] = useState<ReportPeriodType>('mensal');
  const [archiveStart, setArchiveStart] = useState('2026-11-01');
  const [archiveEnd, setArchiveEnd] = useState('2026-11-30');
  const [archiveNotesInput, setArchiveNotesInput] = useState('');

  // Comparação de Períodos
  const [compareMetric, setCompareMetric] = useState<'faturamento' | 'gastos' | 'pedidos' | 'estoque'>('faturamento');

  const loadData = () => {
    setSavedReports(getSavedReports(currentTenant.id));
    setArchivedPeriods(getArchivedPeriods(currentTenant.id));
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  if (!isAdm) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 text-center text-rose-950">
        <FolderArchive className="mx-auto h-12 w-12 text-rose-600 mb-3" />
        <h2 className="text-lg font-bold">Acesso Restrito ao Administrador</h2>
        <p className="mt-1 text-sm text-rose-700">
          O perfil de Vendedor não possui autorização para consultar arquivos e balanços históricos confidenciais.
        </p>
      </div>
    );
  }

  // Gera dados reais para o relatório com base no período e tipo selecionado
  const handleGenerateAndSaveReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const orders = getOrders(currentTenant.id);
    const products = getProducts(currentTenant.id);
    const inventory = getInventoryTransactions(currentTenant.id);
    const expenses = getExpenses(currentTenant.id);
    const tables = getTables(currentTenant.id);

    // Filtra pelo range de datas
    const startFilter = new Date(`${customStart}T00:00:00`).getTime();
    const endFilter = new Date(`${customEnd}T23:59:59`).getTime();

    const filteredOrders = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= startFilter && t <= endFilter;
    });

    const filteredExpenses = expenses.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= startFilter && t <= endFilter;
    });

    let summaryData: Record<string, any> = {};
    let itemRows: any[] = [];

    const totalVendido = filteredOrders.reduce((acc, o) => acc + getOrderProductSalesTotal(o), 0);
    const totalPedidos = filteredOrders.length;
    const totalDespesas = filteredExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const lucroLiquido = totalVendido - totalDespesas;

    if (newReportType === 'vendas' || newReportType === 'financeiro_geral') {
      summaryData = {
        totalVendido,
        totalPedidos,
        ticketMedio: totalPedidos > 0 ? totalVendido / totalPedidos : 0,
        totalDinheiro: filteredOrders
          .flatMap((o) => o.payments || [])
          .filter((p) => p.method === 'dinheiro')
          .reduce((acc, p) => acc + (p.amount || 0), 0),
        totalPix: filteredOrders
          .flatMap((o) => o.payments || [])
          .filter((p) => p.method === 'pix')
          .reduce((acc, p) => acc + (p.amount || 0), 0),
        totalDespesas,
        lucroLiquido,
      };
      itemRows = filteredOrders.map((o) => ({
        id: o.id,
        numero: `#${o.orderNumber}`,
        data: new Date(o.createdAt).toLocaleDateString('pt-BR'),
        tipo: o.type === 'counter' ? 'Balcão' : `Mesa ${o.tableNumber || '-'}`,
        total: o.total,
        garcom: o.waiterName || 'Balcão',
      }));
    } else if (newReportType === 'estoque' || newReportType === 'produtos') {
      const valorCustoTotal = products.reduce((acc, p) => acc + p.stockQuantity * p.costPrice, 0);
      const valorVendaEstimado = products.reduce((acc, p) => acc + p.stockQuantity * p.sellingPrice, 0);
      summaryData = {
        totalItensCadastrados: products.length,
        valorCustoTotal,
        valorVendaEstimado,
        itensEstoqueBaixo: products.filter((p) => p.stockQuantity <= p.minStock).length,
      };
      itemRows = products.map((p) => ({
        id: p.id,
        nome: p.name,
        estoque: `${p.stockQuantity} ${p.unit}`,
        custo: p.costPrice,
        venda: p.sellingPrice,
        margem: `${p.profitMargin.toFixed(1)}%`,
        status: p.stockQuantity <= p.minStock ? 'Estoque Baixo' : 'Normal',
      }));
    } else if (newReportType === 'gastos') {
      summaryData = {
        totalGasto: totalDespesas,
        quantidadeDespesas: filteredExpenses.length,
        pagosDinheiro: filteredExpenses
          .filter((e) => e.paymentMethod === 'dinheiro')
          .reduce((acc, e) => acc + e.amount, 0),
        pagosPix: filteredExpenses
          .filter((e) => e.paymentMethod === 'pix')
          .reduce((acc, e) => acc + e.amount, 0),
      };
      itemRows = filteredExpenses.map((e) => ({
        id: e.id,
        descricao: e.description,
        categoria: e.category,
        data: new Date(e.date).toLocaleDateString('pt-BR'),
        valor: e.amount,
        forma: e.paymentMethod?.toUpperCase() || 'OUTRO',
        responsavel: e.userName,
      }));
    } else {
      // Genérico / Vendedores / Mesas
      summaryData = {
        totalVendido,
        totalPedidos,
        totalMesas: tables.length,
      };
      itemRows = filteredOrders.slice(0, 50).map((o) => ({
        id: o.id,
        numero: `#${o.orderNumber}`,
        data: new Date(o.createdAt).toLocaleDateString('pt-BR'),
        total: o.total,
        vendedor: o.waiterName || 'Balcão',
      }));
    }

    const defaultTitle = `Balanço de ${newReportType.toUpperCase()} (${newReportPeriod.toUpperCase()})`;

    const report: SavedReport = {
      id: `REP-${Date.now()}`,
      tenantId: currentTenant.id,
      title: reportTitleInput.trim() || defaultTitle,
      type: newReportType,
      periodType: newReportPeriod,
      startDate: customStart,
      endDate: customEnd,
      createdAt: new Date().toISOString(),
      createdById: currentUser.id,
      createdByName: `${currentUser.name} (ADM)`,
      establishmentName: currentTenant.name,
      establishmentDocument: currentTenant.document,
      summary: summaryData,
      items: itemRows,
      notes: reportNotesInput.trim() || undefined,
    };

    saveReport(report);
    loadData();
    setIsReportModalOpen(false);
    setSelectedReport(report);
    setReportTitleInput('');
    setReportNotesInput('');
  };

  // Arquiva período com snapshot imutável
  const handleArchivePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const orders = getOrders(currentTenant.id);
    const products = getProducts(currentTenant.id);
    const inventory = getInventoryTransactions(currentTenant.id);
    const expenses = getExpenses(currentTenant.id);
    const tables = getTables(currentTenant.id);

    const startFilter = new Date(`${archiveStart}T00:00:00`).getTime();
    const endFilter = new Date(`${archiveEnd}T23:59:59`).getTime();

    const periodOrders = orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= startFilter && t <= endFilter;
    });

    const periodExpenses = expenses.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= startFilter && t <= endFilter;
    });

    const totalRevenue = periodOrders.reduce((acc, o) => acc + getOrderProductSalesTotal(o), 0);
    const expensesTotal = periodExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const cashTotal = periodOrders
      .flatMap((o) => o.payments || [])
      .filter((p) => p.method === 'dinheiro')
      .reduce((acc, p) => acc + (p.amount || 0), 0);
    const pixTotal = periodOrders
      .flatMap((o) => o.payments || [])
      .filter((p) => p.method === 'pix')
      .reduce((acc, p) => acc + (p.amount || 0), 0);
    const itemsSold = periodOrders
      .flatMap((o) => o.items || [])
      .reduce((acc, item) => acc + (item.quantity || 1), 0);

    const newArch: ArchivedPeriod = {
      id: `ARCH-${Date.now()}`,
      tenantId: currentTenant.id,
      label: archiveLabelInput.trim() || `Balanço Arquivado: ${archiveStart} a ${archiveEnd}`,
      periodType: archivePeriodType,
      startDate: archiveStart,
      endDate: archiveEnd,
      archivedAt: new Date().toISOString(),
      archivedById: currentUser.id,
      archivedByName: `${currentUser.name} (ADM)`,
      notes: archiveNotesInput.trim() || undefined,
      metrics: {
        totalRevenue,
        ordersCount: periodOrders.length,
        cashTotal,
        pixTotal,
        expensesTotal,
        netProfit: totalRevenue - expensesTotal,
        itemsSold,
      },
      snapshot: {
        orders: periodOrders,
        products,
        inventoryTransactions: inventory,
        expenses: periodExpenses,
        tables,
        cashSessions: [],
      },
      isProtected: true,
    };

    archivePeriod(newArch);
    loadData();
    setIsArchiveModalOpen(false);
    setSelectedArchive(newArch);
    setArchiveLabelInput('');
    setArchiveNotesInput('');
  };

  // Exportar Relatório para Planilha (CSV compatível com Excel / Google Sheets)
  const handleExportCsv = (report: SavedReport) => {
    let csvContent = `RELATÓRIO OFICIAL - ${currentTenant.name.toUpperCase()}\n`;
    csvContent += `Documento: ${currentTenant.document || 'N/A'}\n`;
    csvContent += `Título: ${report.title}\n`;
    csvContent += `Período: ${report.startDate} a ${report.endDate}\n`;
    csvContent += `Gerado em: ${new Date(report.createdAt).toLocaleString('pt-BR')} por ${report.createdByName}\n\n`;

    csvContent += `RESUMO DOS TOTAIS\n`;
    Object.entries(report.summary).forEach(([key, val]) => {
      const formattedVal = typeof val === 'number' ? val.toFixed(2) : String(val);
      csvContent += `${key};${formattedVal}\n`;
    });
    csvContent += `\nDETALHAMENTO DE ITENS\n`;

    if (report.items.length > 0) {
      const headers = Object.keys(report.items[0]);
      csvContent += headers.join(';') + '\n';
      report.items.forEach((item) => {
        const row = headers.map((h) => {
          const val = item[h];
          if (typeof val === 'number') return val.toFixed(2);
          return `"${String(val || '').replace(/"/g, '""')}"`;
        });
        csvContent += row.join(';') + '\n';
      });
    }

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${report.title.replace(/\s+/g, '_')}_${report.startDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Impressão / Salvar em PDF
  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-white p-6 border border-stone-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/60">
            <FolderArchive className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-stone-900">Histórico & Arquivos</h1>
            <p className="text-xs text-stone-500">
              Preservação de balanços, relatórios consolidados e comparação temporal de períodos
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Salvar Novo Balanço */}
          <button
            onClick={() => setIsReportModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 transition shadow-xs"
          >
            <Plus className="h-4 w-4 text-stone-600" />
            <span>Salvar Novo Balanço</span>
          </button>

          {/* Botão Arquivar Período */}
          <button
            onClick={() => setIsArchiveModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs"
          >
            <FolderArchive className="h-4 w-4" />
            <span>Arquivar Período</span>
          </button>
        </div>
      </div>

      {/* Tabs de Navegação */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'reports'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Balanços & Relatórios Salvos ({savedReports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('archives')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'archives'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Períodos Arquivados ({archivedPeriods.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('compare')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === 'compare'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Comparativo Temporal</span>
        </button>
      </div>

      {/* TAB 1: RELATÓRIOS E BALANÇOS SALVOS */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedReports.map((report) => (
              <div
                key={report.id}
                className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-xs hover:border-indigo-300 transition"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md text-[10px]">
                      {report.type} • {report.periodType}
                    </span>
                    <span className="text-[11px] text-stone-400 font-mono">{report.id}</span>
                  </div>

                  <h3 className="font-bold text-stone-900 text-sm">{report.title}</h3>
                  <p className="text-xs text-stone-500 mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-stone-400" />
                    {report.startDate} a {report.endDate}
                  </p>

                  {/* Resumo rápido */}
                  <div className="mt-3 rounded-xl bg-stone-50 p-2.5 text-xs space-y-1 text-stone-700 border border-stone-100">
                    {report.summary.totalVendido !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Total Vendas:</span>
                        <strong className="text-emerald-700">{formatCurrencyBR(report.summary.totalVendido)}</strong>
                      </div>
                    )}
                    {report.summary.totalPedidos !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Pedidos:</span>
                        <strong>{report.summary.totalPedidos}</strong>
                      </div>
                    )}
                    {report.summary.valorCustoTotal !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Valor Estoque (Custo):</span>
                        <strong>{formatCurrencyBR(report.summary.valorCustoTotal)}</strong>
                      </div>
                    )}
                    {report.summary.totalGasto !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Despesas:</span>
                        <strong className="text-rose-700">{formatCurrencyBR(report.summary.totalGasto)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <span className="text-[10px] text-stone-400">
                    Gerado em {new Date(report.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleExportCsv(report)}
                      className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                      title="Exportar Planilha (CSV)"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setSelectedReport(report)}
                      className="flex items-center gap-1 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-stone-800"
                    >
                      <Eye className="h-3 w-3" />
                      <span>Visualizar</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Excluir relatório "${report.title}"?`)) {
                          deleteSavedReport(report.id);
                          loadData();
                        }
                      }}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {savedReports.length === 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center text-stone-400">
              <FileText className="mx-auto h-12 w-12 text-stone-300 mb-2" />
              <p className="text-sm font-semibold text-stone-700">Nenhum balanço salvo ainda</p>
              <p className="text-xs text-stone-400 mt-1">
                Clique em "Salvar Novo Balanço" para consolidar vendas, produtos ou estoque.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PERÍODOS ARQUIVADOS (RETRATO IMUTÁVEL) */}
      {activeTab === 'archives' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-xs text-indigo-950">
            <span className="font-bold flex items-center gap-1.5 text-indigo-900 mb-0.5">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              Períodos Congelados e Protegidos Contra Alterações
            </span>
            Os períodos arquivados mantêm rigorosamente os preços praticados e quantidades da época, permanecendo protegidos mesmo que você altere produtos ou reinicie a operação.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {archivedPeriods.map((arch) => (
              <div
                key={arch.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                      <Lock className="h-2.5 w-2.5" />
                      ARQUIVADO & PROTEGIDO
                    </span>
                    <span className="text-[11px] font-mono text-stone-400">{arch.id}</span>
                  </div>

                  <h3 className="font-bold text-base text-stone-900">{arch.label}</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Intervalo: <strong>{arch.startDate}</strong> a <strong>{arch.endDate}</strong>
                  </p>

                  {arch.notes && (
                    <p className="mt-2 text-xs text-stone-600 italic bg-stone-50 p-2 rounded-lg">
                      "{arch.notes}"
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 text-xs">
                    <div className="rounded-xl bg-stone-50 p-2.5 border border-stone-100">
                      <span className="text-[10px] text-stone-500">Receita Bruta</span>
                      <p className="font-bold text-emerald-700 text-sm">
                        {formatCurrencyBR(arch.metrics.totalRevenue)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-stone-50 p-2.5 border border-stone-100">
                      <span className="text-[10px] text-stone-500">Total Despesas</span>
                      <p className="font-bold text-rose-700 text-sm">
                        {formatCurrencyBR(arch.metrics.expensesTotal)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-stone-50 p-2.5 border border-stone-100">
                      <span className="text-[10px] text-stone-500">Lucro Líquido</span>
                      <p className="font-bold text-stone-900 text-sm">
                        {formatCurrencyBR(arch.metrics.netProfit)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-stone-400">
                    Arquivado por {arch.archivedByName} em {new Date(arch.archivedAt).toLocaleDateString('pt-BR')}
                  </span>
                  <button
                    onClick={() => setSelectedArchive(arch)}
                    className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 shadow-xs text-xs"
                  >
                    <Eye className="h-3 w-3" />
                    <span>Consultar Balanço</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {archivedPeriods.length === 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center text-stone-400">
              <FolderArchive className="mx-auto h-12 w-12 text-stone-300 mb-2" />
              <p className="text-sm font-semibold text-stone-700">Nenhum período arquivado</p>
              <p className="text-xs text-stone-400 mt-1">
                Utilize o botão "Arquivar Período" para congelar um mês ou semana oficial.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COMPARATIVO TEMPORAL DE RESULTADOS */}
      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-stone-900 mb-1 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
              <span>Comparação de Resultados Entre Períodos</span>
            </h2>
            <p className="text-xs text-stone-500 mb-4">
              Compare a semana atual com a semana anterior ou o mês atual com períodos arquivados passados.
            </p>

            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setCompareMetric('faturamento')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  compareMetric === 'faturamento' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                Faturamento
              </button>
              <button
                onClick={() => setCompareMetric('gastos')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  compareMetric === 'gastos' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                Gastos & Despesas
              </button>
              <button
                onClick={() => setCompareMetric('pedidos')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  compareMetric === 'pedidos' ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                Volume de Pedidos
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card Período Anterior */}
              <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  Período Anterior (Outubro de 2026)
                </span>
                <h4 className="text-base font-bold text-stone-800 mt-1">Balanço Arquivado Passado</h4>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-stone-200/60">
                    <span className="text-stone-500">Receita Bruta:</span>
                    <strong className="text-stone-900">R$ 24.890,00</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-200/60">
                    <span className="text-stone-500">Despesas Operacionais:</span>
                    <strong className="text-rose-700">R$ 8.430,00</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-stone-200/60">
                    <span className="text-stone-500">Volume de Pedidos:</span>
                    <strong className="text-stone-900">312 atendimentos</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-stone-500">Margem Líquida:</span>
                    <strong className="text-emerald-700">66.1%</strong>
                  </div>
                </div>
              </div>

              {/* Card Período Atual */}
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  Período em Andamento (Novembro de 2026)
                </span>
                <h4 className="text-base font-bold text-indigo-950 mt-1">Operação Atual do Estabelecimento</h4>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-indigo-100">
                    <span className="text-stone-500">Receita Acumulada:</span>
                    <strong className="text-emerald-700">
                      {formatCurrencyBR(
                        getOrders(currentTenant.id).reduce((acc, o) => acc + (o.total || 0), 0)
                      )}
                    </strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-indigo-100">
                    <span className="text-stone-500">Despesas Registradas:</span>
                    <strong className="text-rose-700">
                      {formatCurrencyBR(
                        getExpenses(currentTenant.id).reduce((acc, e) => acc + (e.amount || 0), 0)
                      )}
                    </strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-indigo-100">
                    <span className="text-stone-500">Volume de Pedidos:</span>
                    <strong className="text-stone-900">
                      {getOrders(currentTenant.id).length} pedidos ativos
                    </strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-stone-500">Status Operacional:</span>
                    <strong className="text-indigo-800">Em curso</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Visualizador Completo do Relatório Salvo */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 max-h-[92vh] flex flex-col print:max-h-full print:p-0 print:border-none print:shadow-none">
            {/* Header com identificação do estabelecimento */}
            <div className="border-b border-stone-100 pb-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  {selectedReport.establishmentName}
                </span>
                <h2 className="text-base font-bold text-stone-900">{selectedReport.title}</h2>
                <p className="text-xs text-stone-500">
                  Período: <strong>{selectedReport.startDate}</strong> a <strong>{selectedReport.endDate}</strong> • Gerado em{' '}
                  {new Date(selectedReport.createdAt).toLocaleString('pt-BR')} por {selectedReport.createdByName}
                </p>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="text-stone-400 hover:text-stone-700 font-bold print:hidden"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              {/* Cards de Totais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(selectedReport.summary).map(([key, val]) => (
                  <div key={key} className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                    <span className="text-[10px] text-stone-500 font-medium capitalize">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </span>
                    <p className="text-sm font-bold text-stone-900 mt-0.5">
                      {typeof val === 'number' && key.toLowerCase().includes('total') || key.toLowerCase().includes('valor') || key.toLowerCase().includes('ticket')
                        ? formatCurrencyBR(val)
                        : String(val)}
                    </p>
                  </div>
                ))}
              </div>

              {selectedReport.notes && (
                <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3 text-amber-900 text-xs">
                  <strong>Observações do ADM:</strong> {selectedReport.notes}
                </div>
              )}

              {/* Tabela de Itens */}
              <div>
                <h4 className="font-bold text-stone-800 mb-2">Detalhamento dos Dados Salvos:</h4>
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold">
                      <tr>
                        {selectedReport.items.length > 0 &&
                          Object.keys(selectedReport.items[0])
                            .filter((k) => k !== 'id')
                            .map((k) => (
                              <th key={k} className="p-2.5 capitalize">
                                {k}
                              </th>
                            ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {selectedReport.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/50">
                          {Object.entries(item)
                            .filter(([k]) => k !== 'id')
                            .map(([k, val]: any, i) => (
                              <td key={i} className="p-2.5">
                                {typeof val === 'number' && k.toLowerCase().includes('total') || k.toLowerCase().includes('valor') || k.toLowerCase().includes('ticket') || k.toLowerCase().includes('custo') || k.toLowerCase().includes('venda')
                                  ? formatCurrencyBR(val)
                                  : String(val)}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer com botões de Exportação */}
            <div className="border-t border-stone-100 pt-3 flex items-center justify-between print:hidden">
              <span className="text-[11px] text-stone-400">
                Documento imutável gravado no histórico do SaborGestão
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportCsv(selectedReport)}
                  className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  <span>Exportar Planilha (CSV)</span>
                </button>
                <button
                  onClick={handlePrintPdf}
                  className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800"
                >
                  <Printer className="h-4 w-4" />
                  <span>Imprimir / Salvar PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Consulta de Período Arquivado */}
      {selectedArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 max-h-[92vh] flex flex-col">
            <div className="border-b border-stone-100 pb-3 flex items-center justify-between">
              <div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  <Lock className="h-3 w-3" />
                  REGISTRO IMUTÁVEL
                </span>
                <h3 className="text-base font-bold text-stone-900 mt-1">{selectedArchive.label}</h3>
                <p className="text-xs text-stone-500 font-mono">
                  {selectedArchive.startDate} até {selectedArchive.endDate} • ID: {selectedArchive.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedArchive(null)}
                className="text-stone-400 hover:text-stone-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] text-stone-500">Receita Total Arquivada</span>
                  <p className="text-base font-bold text-emerald-700">
                    {formatCurrencyBR(selectedArchive.metrics.totalRevenue)}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] text-stone-500">Despesas Totais</span>
                  <p className="text-base font-bold text-rose-700">
                    {formatCurrencyBR(selectedArchive.metrics.expensesTotal)}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] text-stone-500">Lucro Líquido Real</span>
                  <p className="text-base font-bold text-stone-900">
                    {formatCurrencyBR(selectedArchive.metrics.netProfit)}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] text-stone-500">Volume de Atendimentos</span>
                  <p className="text-base font-bold text-stone-900">
                    {selectedArchive.metrics.ordersCount} pedidos
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] text-stone-500">Em Dinheiro (Espécie)</span>
                  <p className="text-base font-bold text-stone-900">
                    {formatCurrencyBR(selectedArchive.metrics.cashTotal)}
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <span className="text-[10px] text-stone-500">Em PIX</span>
                  <p className="text-base font-bold text-stone-900">
                    {formatCurrencyBR(selectedArchive.metrics.pixTotal)}
                  </p>
                </div>
              </div>

              {selectedArchive.notes && (
                <div className="rounded-xl bg-stone-50 p-3 text-stone-700 border border-stone-100">
                  <strong>Anotações do Período:</strong> {selectedArchive.notes}
                </div>
              )}
            </div>

            <div className="border-t border-stone-100 pt-3 flex justify-end">
              <button
                onClick={() => setSelectedArchive(null)}
                className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Gerar e Salvar Balanço */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
              <h3 className="font-bold text-stone-900 text-sm">Salvar Novo Balanço do Estabelecimento</h3>
              <button onClick={() => setIsReportModalOpen(false)} className="text-stone-400 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateAndSaveReport} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">Tipo de Balanço:</label>
                <select
                  value={newReportType}
                  onChange={(e) => setNewReportType(e.target.value as ReportType)}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-stone-900"
                >
                  <option value="vendas">Vendas & Faturamento</option>
                  <option value="produtos">Catálogo de Produtos & Margens</option>
                  <option value="estoque">Posição e Valor de Estoque</option>
                  <option value="gastos">Gastos & Despesas Operacionais</option>
                  <option value="financeiro_geral">Balanço Financeiro Geral (DRE)</option>
                  <option value="vendedores">Desempenho Individual de Vendedores</option>
                  <option value="mesas">Movimentação e Ocupação de Mesas</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">Período:</label>
                <select
                  value={newReportPeriod}
                  onChange={(e) => setNewReportPeriod(e.target.value as ReportPeriodType)}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-stone-900"
                >
                  <option value="diario">Diário (Hoje)</option>
                  <option value="semanal">Semanal (Últimos 7 dias)</option>
                  <option value="mensal">Mensal (Últimos 30 dias)</option>
                  <option value="anual">Anual (Ano Vigente)</option>
                  <option value="personalizado">Personalizado (Intervalo Específico)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">Data Inicial:</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2 text-xs text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">Data Final:</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2 text-xs text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">Título Personalizado (Opcional):</label>
                <input
                  type="text"
                  placeholder="Ex: Balanço Oficial 1ª Semana Nov/2026"
                  value={reportTitleInput}
                  onChange={(e) => setReportTitleInput(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-stone-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">Observações:</label>
                <textarea
                  rows={2}
                  placeholder="Anotações relevantes para consulta futura..."
                  value={reportNotesInput}
                  onChange={(e) => setReportNotesInput(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-stone-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs"
                >
                  Consolidar e Salvar Balanço
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Arquivar Período */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-stone-900 text-sm">Arquivar Período Oficial</h3>
                <p className="text-[11px] text-stone-500">Gera um retrato congelado e imutável para a contabilidade</p>
              </div>
              <button onClick={() => setIsArchiveModalOpen(false)} className="text-stone-400 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleArchivePeriod} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">Identificação do Período:</label>
                <input
                  type="text"
                  placeholder="Ex: Balanço Mensal: Novembro de 2026"
                  value={archiveLabelInput}
                  onChange={(e) => setArchiveLabelInput(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-stone-900 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">Data Início do Período:</label>
                  <input
                    type="date"
                    value={archiveStart}
                    onChange={(e) => setArchiveStart(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2 text-xs text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">Data Fim do Período:</label>
                  <input
                    type="date"
                    value={archiveEnd}
                    onChange={(e) => setArchiveEnd(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 p-2 text-xs text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700 mb-1">Anotações Finais do Fechamento:</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Todas as contas conferidas e validadas com extrato bancário..."
                  value={archiveNotesInput}
                  onChange={(e) => setArchiveNotesInput(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-2 text-xs text-stone-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsArchiveModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 shadow-xs flex items-center gap-1.5"
                >
                  <FolderArchive className="h-4 w-4" />
                  <span>Congelar e Arquivar Período</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
