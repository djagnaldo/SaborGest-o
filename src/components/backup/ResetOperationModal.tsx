/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Calendar,
  Copy,
  Check,
  KeyRound,
  Package,
  Users,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import {
  ArchivedPeriodPdf,
  RegeneratedSellerKeyInfo,
  SelectiveResetOptions,
} from '../../types';
import {
  getOrders,
  getExpenses,
  getInventoryTransactions,
  getCashSessions,
  getProducts,
  getCategories,
  getCustomers,
  getSuppliers,
  getUsers,
  saveArchivedPdfLocal,
  executeCleanPeriodResetLocal,
} from '../../services/storage';
import {
  saveArchivedPdfApi,
  executeResetPeriodApi,
  refreshSnapshotFromServer,
} from '../../services/sync-client';
import {
  ARCHIVE_PDF_DISCLAIMER,
  validateArchivePeriod,
  buildHistoricalPeriodPdf,
  downloadArchivedPdf,
} from '../../utils/pdf-archive';
import { formatBRL, formatDateTimeBR } from '../../utils/formatters';

interface ResetOperationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const toIsoDate = (d: Date) => d.toISOString().split('T')[0];

export const ResetOperationModal: React.FC<ResetOperationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();

  // Período do PDF Histórico
  const [periodStart, setPeriodStart] = useState(() =>
    toIsoDate(new Date(Date.now() - 29 * 86400000))
  );
  const [periodEnd, setPeriodEnd] = useState(() => toIsoDate(new Date()));
  const [generatedPdf, setGeneratedPdf] = useState<ArchivedPeriodPdf | null>(null);

  // Opções de Preservação: Cardápio e Catálogo
  const [keepProducts, setKeepProducts] = useState(true);
  const [keepProductPhotos, setKeepProductPhotos] = useState(true);
  const [keepProductDescriptions, setKeepProductDescriptions] = useState(true);
  const [keepCategories, setKeepCategories] = useState(true);
  const [zeroProductPrices, setZeroProductPrices] = useState(false);
  const [zeroProductStock, setZeroProductStock] = useState(true);

  // Opções de Preservação: Cadastros
  const [keepCustomers, setKeepCustomers] = useState(true);
  const [keepSuppliers, setKeepSuppliers] = useState(true);
  const [keepSellers, setKeepSellers] = useState(true);
  const [rotateSellerKeys, setRotateSellerKeys] = useState(false);

  // Opções de Zerar: Módulos Operacionais
  const [clearOrders, setClearOrders] = useState(true);
  const [clearTables, setClearTables] = useState(true);
  const [clearCashRegisters, setClearCashRegisters] = useState(true);
  const [clearExpenses, setClearExpenses] = useState(true);
  const [clearReceipts, setClearReceipts] = useState(true);
  const [clearStockMovements, setClearStockMovements] = useState(true);
  const [clearSavedReports, setClearSavedReports] = useState(false);
  const [clearOperationalLogs, setClearOperationalLogs] = useState(false);

  const [confirmationText, setConfirmationText] = useState('');
  const [reason, setReason] = useState('Encerramento de ciclo e início de novo período operacional');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedKeys, setCompletedKeys] = useState<RegeneratedSellerKeyInfo[] | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Contagens atuais para contextualizar o resumo
  const counts = useMemo(() => {
    const tid = currentTenant.id;
    return {
      products: getProducts(tid).length,
      categories: getCategories(tid).length,
      customers: getCustomers(tid).length,
      suppliers: getSuppliers(tid).length,
      sellers: getUsers(tid).filter((u) => u.role !== 'admin').length,
      orders: getOrders(tid).length,
      cash: getCashSessions(tid).length,
      financial: getExpenses(tid).length,
      inventory: getInventoryTransactions(tid).length,
    };
  }, [currentTenant.id, isOpen]);

  // Listas dinâmicas do resumo explícito antes da confirmação
  const { willClearList, willPreserveList } = useMemo(() => {
    const clear: string[] = [
      'Todas as mesas e comandas eventualmente abertas serão fechadas e zeradas automaticamente',
    ];
    const preserve: string[] = [
      'Todos os PDFs históricos anteriores (inclusive o PDF gerado nesta etapa)',
      'Dados do estabelecimento, configurações e personalização visual',
      'Perfil e credenciais do Administrador (ADM)',
    ];

    if (!keepProducts) {
      clear.push(`Catálogo completo de produtos (${counts.products} itens)`);
    } else {
      const keptDetails = ['Nomes, códigos e identificadores dos produtos'];
      if (keepProductPhotos) keptDetails.push('fotografias');
      else clear.push('Fotografias dos produtos');
      if (keepProductDescriptions) keptDetails.push('descrições');
      else clear.push('Descrições dos produtos');
      if (zeroProductPrices) clear.push('Preços de venda e custo zerados (R$ 0,00)');
      else keptDetails.push('preços atuais');
      if (zeroProductStock) clear.push('Quantidades de estoque zeradas (0)');
      else keptDetails.push('saldos de estoque atuais');
      preserve.push(`Produtos cadastrados (${counts.products}): ${keptDetails.join(', ')}`);
    }

    if (keepCategories) preserve.push(`Categorias do cardápio (${counts.categories})`);
    else clear.push(`Categorias do cardápio (${counts.categories})`);

    if (keepCustomers) preserve.push(`Clientes cadastrados (${counts.customers})`);
    else clear.push(`Cadastro de clientes (${counts.customers})`);

    if (keepSuppliers) preserve.push(`Fornecedores cadastrados (${counts.suppliers})`);
    else clear.push(`Cadastro de fornecedores (${counts.suppliers})`);

    if (!keepSellers) {
      clear.push(`Vendedores cadastrados (${counts.sellers}) e todas as suas chaves de acesso`);
    } else if (rotateSellerKeys) {
      preserve.push(`Cadastros dos vendedores (${counts.sellers})`);
      clear.push('Chaves antigas de acesso dos vendedores (serão redefinidas e geradas novas chaves)');
    } else {
      preserve.push(`Vendedores cadastrados (${counts.sellers}) e suas chaves atuais`);
    }

    if (clearOrders) clear.push(`Vendas e histórico de pedidos (${counts.orders})`);
    else preserve.push('Histórico de vendas concluídas');

    if (clearTables) clear.push('Histórico de movimentações encerradas de mesas');
    else preserve.push('Histórico arquivado de mesas');

    if (clearCashRegisters) clear.push(`Sessões de caixa e movimentações (${counts.cash})`);
    else preserve.push('Histórico de sessões de caixa');

    if (clearExpenses) clear.push('Gastos e despesas registradas');
    else preserve.push('Gastos e despesas registradas');

    if (clearReceipts) clear.push('Recebimentos financeiros');
    else preserve.push('Recebimentos financeiros');

    if (clearStockMovements) clear.push(`Movimentações de estoque (${counts.inventory})`);
    else preserve.push('Histórico de movimentações de estoque');

    if (clearSavedReports) clear.push('Relatórios operacionais salvos');
    else preserve.push('Relatórios operacionais salvos');

    if (clearOperationalLogs) clear.push('Registros de auditoria e períodos congelados auxiliares');
    else preserve.push('Trilha de auditoria e períodos congelados');

    return { willClearList: clear, willPreserveList: preserve };
  }, [
    counts,
    keepProducts,
    keepProductPhotos,
    keepProductDescriptions,
    keepCategories,
    zeroProductPrices,
    zeroProductStock,
    keepCustomers,
    keepSuppliers,
    keepSellers,
    rotateSellerKeys,
    clearOrders,
    clearTables,
    clearCashRegisters,
    clearExpenses,
    clearReceipts,
    clearStockMovements,
    clearSavedReports,
    clearOperationalLogs,
  ]);

  if (!isOpen) return null;

  if (!isAdm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-rose-600 mb-2" />
          <h3 className="font-bold text-stone-900">Acesso Restrito ao Administrador</h3>
          <p className="text-xs text-stone-500 mt-1 mb-4">
            Apenas o ADM possui permissão para executar arquivamento em PDF e limpeza seletiva de período.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const periodValidation = validateArchivePeriod(periodStart, periodEnd);

  const buildPayload = (pdfId: string): SelectiveResetOptions => ({
    confirmationText: confirmationText.trim(),
    archivePdfId: pdfId,
    keepProducts,
    keepProductPhotos,
    keepProductDescriptions,
    keepCategories,
    zeroProductPrices,
    zeroProductStock,
    keepCustomers,
    keepSuppliers,
    keepSellers,
    rotateSellerKeys: keepSellers && rotateSellerKeys,
    clearOrders,
    clearTables,
    clearCashRegisters,
    clearExpenses,
    clearReceipts,
    clearStockMovements,
    clearSavedReports,
    clearOperationalLogs,
    reason,
  });

  const handleGeneratePdfArchive = async () => {
    if (!currentUser) return;
    setErrorMsg(null);
    if (!periodValidation.valid) {
      setErrorMsg(periodValidation.error || 'Período inválido.');
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdfRecord = buildHistoricalPeriodPdf({
        tenant: currentTenant,
        periodStart,
        periodEnd,
        orders: getOrders(currentTenant.id),
        financial: getExpenses(currentTenant.id),
        inventoryTransactions: getInventoryTransactions(currentTenant.id),
        cashSessions: getCashSessions(currentTenant.id),
        generatedBy: { id: currentUser.id, name: currentUser.name },
      });

      saveArchivedPdfLocal(pdfRecord, { id: currentUser.id, name: currentUser.name });
      try {
        await saveArchivedPdfApi(pdfRecord, currentUser.id);
      } catch {
        // Fallback offline local preservado
      }
      downloadArchivedPdf(pdfRecord);
      setGeneratedPdf(pdfRecord);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao gerar documento PDF histórico.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isProcessing) return;
    setErrorMsg(null);

    if (!generatedPdf) {
      setErrorMsg('Gere e salve primeiro o arquivo PDF histórico do período (etapa obrigatória).');
      return;
    }

    if (confirmationText.trim() !== 'CONFIRMAR LIMPEZA') {
      setErrorMsg('Digite exatamente "CONFIRMAR LIMPEZA" em letras maiúsculas para prosseguir.');
      return;
    }

    setIsProcessing(true);
    const payload = buildPayload(generatedPdf.id);
    let serverRotatedKeys: RegeneratedSellerKeyInfo[] | undefined;

    try {
      const localRes = executeCleanPeriodResetLocal(
        currentTenant.id,
        payload,
        { id: currentUser.id, name: currentUser.name }
      );

      if (!localRes.success) {
        setErrorMsg(localRes.message);
        setIsProcessing(false);
        return;
      }

      try {
        const apiRes = await executeResetPeriodApi(currentTenant.id, payload, currentUser.id);
        serverRotatedKeys = apiRes.regeneratedSellerKeys;
        await refreshSnapshotFromServer(currentTenant.id, currentUser.id);
      } catch {
        // Se servidor estiver parado ou offline, limpeza local já foi concluída
      }

      setConfirmationText('');
      setGeneratedPdf(null);

      if (serverRotatedKeys && serverRotatedKeys.length > 0) {
        setCompletedKeys(serverRotatedKeys);
      } else {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMsg(`Erro na execução: ${err?.message || 'Falha desconhecida'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyKey = (userId: string, key: string) => {
    navigator.clipboard?.writeText(key).catch(() => {});
    setCopiedKeyId(userId);
    setTimeout(() => setCopiedKeyId((prev) => (prev === userId ? null : prev)), 2500);
  };

  // Tela pós-limpeza exibindo as novas chaves individuais dos vendedores caso tenham sido redefinidas
  if (completedKeys) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
        <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-emerald-200 space-y-4">
          <div className="flex items-center gap-3 border-b border-stone-100 pb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Limpeza Concluída · Novas Chaves dos Vendedores
              </h2>
              <p className="text-xs text-stone-500">
                As chaves anteriores foram revogadas. Compartilhe as novas chaves individuais com cada vendedor:
              </p>
            </div>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {completedKeys.map((k) => (
              <div
                key={k.userId}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-bold text-stone-900">{k.userName}</p>
                  <p className="font-mono text-sm font-black text-amber-700 mt-0.5">{k.plainKey}</p>
                  <p className="text-[10px] text-stone-400">
                    Válida até {formatDateTimeBR(k.expiresAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyKey(k.userId, k.plainKey)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100 shrink-0"
                >
                  {copiedKeyId === k.userId ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Copiada</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setCompletedKeys(null);
                onSuccess();
              }}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Concluir e Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <RotateCcw className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Limpeza e Novo Período
              </h2>
              <p className="text-xs text-stone-500">
                Escolha exatamente o que preservar e o que zerar após gerar o PDF histórico de consulta
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleExecute} className="flex-1 overflow-y-auto py-4 space-y-5 text-xs">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-800 font-medium">
              {errorMsg}
            </div>
          )}

          {/* SEÇÃO 1: OPÇÕES DE PRESERVAÇÃO — CARDÁPIO & CATÁLOGO */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-amber-600" />
                <h3 className="font-bold text-stone-900">1. Cardápio e Catálogo (Preservação Seletiva)</h3>
              </div>
              <span className="text-[10px] font-semibold text-stone-500">
                {counts.products} produtos · {counts.categories} categorias
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepProducts}
                  onChange={() => setKeepProducts((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Manter produtos cadastrados</p>
                  <p className="text-[10px] text-stone-500">Preserva nomes, códigos SKU e identificadores</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepCategories}
                  onChange={() => setKeepCategories((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Manter categorias</p>
                  <p className="text-[10px] text-stone-500">Mantém a estrutura de organização do cardápio</p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 ${
                  keepProducts ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!keepProducts}
                  checked={keepProducts && keepProductPhotos}
                  onChange={() => setKeepProductPhotos((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Manter fotografias</p>
                  <p className="text-[10px] text-stone-500">Evita fotografar os produtos novamente</p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 ${
                  keepProducts ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!keepProducts}
                  checked={keepProducts && keepProductDescriptions}
                  onChange={() => setKeepProductDescriptions((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Manter descrições</p>
                  <p className="text-[10px] text-stone-500">Preserva textos descritivos do cardápio</p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 ${
                  keepProducts ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!keepProducts}
                  checked={keepProducts && zeroProductPrices}
                  onChange={() => setZeroProductPrices((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar preços de venda</p>
                  <p className="text-[10px] text-stone-500">Define preço R$ 0,00 para atualização no novo ciclo</p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 ${
                  keepProducts ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!keepProducts}
                  checked={keepProducts && zeroProductStock}
                  onChange={() => setZeroProductStock((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar quantidades de estoque</p>
                  <p className="text-[10px] text-stone-500">Zera o saldo para nova contagem de inventário</p>
                </div>
              </label>
            </div>

            <p className="text-[11px] text-stone-600 bg-white rounded-lg px-3 py-2 border border-stone-200">
              Exemplo: mantendo produtos, fotos e categorias com preços e estoque zerados, itens como{' '}
              <strong>Coca-Cola</strong> continuam cadastrados com foto e categoria, prontos para preencher novo preço e saldo.
            </p>
          </div>

          {/* SEÇÃO 2: CADASTROS — CLIENTES, FORNECEDORES E VENDEDORES */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              <h3 className="font-bold text-stone-900">2. Clientes, Fornecedores e Vendedores</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepCustomers}
                  onChange={() => setKeepCustomers((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Manter clientes cadastrados ({counts.customers})</p>
                  <p className="text-[10px] text-stone-500">Preserva nomes, contatos e documentos</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepSuppliers}
                  onChange={() => setKeepSuppliers((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Manter fornecedores ({counts.suppliers})</p>
                  <p className="text-[10px] text-stone-500">Preserva dados de fornecedores e contatos</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepSellers}
                  onChange={() => setKeepSellers((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Manter vendedores cadastrados ({counts.sellers})</p>
                  <p className="text-[10px] text-stone-500">
                    Desmarque para remover vendedores não-ADM e revogar acessos
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 ${
                  keepSellers ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!keepSellers}
                  checked={keepSellers && rotateSellerKeys}
                  onChange={() => setRotateSellerKeys((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Renovar / redefinir chaves dos vendedores</p>
                  <p className="text-[10px] text-stone-500">
                    Revoga chaves antigas e gera novas chaves individuais (24h)
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* SEÇÃO 3: MÓDULOS OPERACIONAIS A ZERAR */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-rose-600" />
              <h3 className="font-bold text-stone-900">3. Módulos Operacionais (marcar para zerar)</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearOrders}
                  onChange={() => setClearOrders((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar vendas e pedidos ({counts.orders})</p>
                  <p className="text-[10px] text-stone-500">Limpa histórico de pedidos encerrados e balcão</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearTables}
                  onChange={() => setClearTables((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar histórico de mesas</p>
                  <p className="text-[10px] text-stone-500">Mesas abertas sempre são fechadas e liberadas</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearCashRegisters}
                  onChange={() => setClearCashRegisters((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar caixa e movimentações ({counts.cash})</p>
                  <p className="text-[10px] text-stone-500">Limpa sessões, sangrias e reforços anteriores</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearExpenses}
                  onChange={() => setClearExpenses((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar gastos e despesas</p>
                  <p className="text-[10px] text-stone-500">Remove lançamentos de custos e saídas</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearReceipts}
                  onChange={() => setClearReceipts((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar recebimentos</p>
                  <p className="text-[10px] text-stone-500">Limpa entradas financeiras registradas</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearStockMovements}
                  onChange={() => setClearStockMovements((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar movimentações de estoque ({counts.inventory})</p>
                  <p className="text-[10px] text-stone-500">Limpa registro de entradas e saídas anteriores</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearSavedReports}
                  onChange={() => setClearSavedReports((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar relatórios salvos</p>
                  <p className="text-[10px] text-stone-500">Remove balanços operacionais (mantém PDFs)</p>
                </div>
              </label>

              <label className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearOperationalLogs}
                  onChange={() => setClearOperationalLogs((v) => !v)}
                  className="mt-0.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <p className="font-bold text-stone-800">Zerar logs e registros auxiliares</p>
                  <p className="text-[10px] text-stone-500">Limpa histórico auxiliar de auditoria anterior</p>
                </div>
              </label>
            </div>
          </div>

          {/* SEÇÃO 4: PDF HISTÓRICO OBRIGATÓRIO ANTES DA LIMPEZA */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-700 shrink-0" />
                <div>
                  <h3 className="font-bold text-amber-950">
                    4. Gerar PDF Histórico Antes da Limpeza (Obrigatório)
                  </h3>
                  <p className="text-[11px] text-amber-800">
                    Consolida vendas, produtos vendidos, vendedores, caixa, gastos, recebimentos e estoque em arquivo .pdf oficial.
                  </p>
                </div>
              </div>
              {generatedPdf && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 shrink-0">
                  <CheckCircle2 className="h-3 w-3" />
                  PDF Salvo
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Data Inicial:
                </label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => {
                      setPeriodStart(e.target.value);
                      setGeneratedPdf(null);
                    }}
                    className="w-full rounded-xl border border-stone-300 bg-white pl-8 pr-2.5 py-2 text-xs text-stone-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Data Final:
                </label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => {
                      setPeriodEnd(e.target.value);
                      setGeneratedPdf(null);
                    }}
                    className="w-full rounded-xl border border-stone-300 bg-white pl-8 pr-2.5 py-2 text-xs text-stone-900"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={!periodValidation.valid || isGeneratingPdf}
                onClick={handleGeneratePdfArchive}
                className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-40 transition"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isGeneratingPdf ? 'Gerando PDF...' : 'Gerar & Baixar PDF'}</span>
              </button>
            </div>

            {!periodValidation.valid && (
              <p className="text-[11px] font-semibold text-rose-700">{periodValidation.error}</p>
            )}

            <div className="rounded-xl border border-amber-300 bg-white/90 px-3 py-2 text-[11px] font-bold text-amber-900">
              {ARCHIVE_PDF_DISCLAIMER}
            </div>

            {generatedPdf && (
              <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-emerald-800">
                    {generatedPdf.fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadArchivedPdf(generatedPdf)}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    <Download className="h-3 w-3" />
                    Baixar PDF Novamente
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="rounded-lg bg-stone-50 p-2">
                    <span className="text-stone-500 block">Pedidos</span>
                    <strong className="text-stone-900">{generatedPdf.summary.ordersCount}</strong>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <span className="text-stone-500 block">Receita Vendas</span>
                    <strong className="text-emerald-700">
                      {formatBRL(generatedPdf.summary.totalRevenue)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <span className="text-stone-500 block">Gastos / Saídas</span>
                    <strong className="text-rose-700">
                      {formatBRL(generatedPdf.summary.expensesTotal)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-stone-50 p-2">
                    <span className="text-stone-500 block">Resultado Líquido</span>
                    <strong className="text-stone-900">
                      {formatBRL(generatedPdf.summary.netResult)}
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SEÇÃO 5: RESUMO EXPLÍCITO ANTES DA CONFIRMAÇÃO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-rose-950">
              <span className="font-bold flex items-center gap-1.5 text-rose-900 mb-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                O que será apagado / zerado:
              </span>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-900">
                {willClearList.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-emerald-950">
              <span className="font-bold flex items-center gap-1.5 text-emerald-900 mb-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                O que será preservado na Matriz:
              </span>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-emerald-900">
                {willPreserveList.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-[11px] font-bold text-stone-700 mb-1">
              Motivo da Limpeza e Novo Período:
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-stone-200 p-2.5 text-xs text-stone-900 focus:border-rose-500 focus:outline-hidden"
              placeholder="Ex: Virada de mês após arquivamento em PDF"
            />
          </div>

          {/* SEÇÃO 6: CONFIRMAÇÃO EXPLÍCITA DO ADM */}
          <div className="rounded-xl border border-rose-300 bg-rose-50/80 p-3.5 space-y-2">
            <span className="font-bold text-rose-900 flex items-center gap-1.5 text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              5. Confirmação Explícita do Administrador:
            </span>
            <p className="text-[11px] text-rose-800">
              Revise o resumo acima e, após gerar o PDF histórico de consulta, digite exatamente{' '}
              <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-rose-300">
                CONFIRMAR LIMPEZA
              </strong>{' '}
              para executar:
            </p>
            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              className="w-full rounded-xl border border-rose-300 bg-white p-2.5 font-mono text-xs font-bold text-rose-950 focus:border-rose-600 focus:outline-hidden"
              placeholder="CONFIRMAR LIMPEZA"
              autoComplete="off"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                isProcessing || !generatedPdf || confirmationText.trim() !== 'CONFIRMAR LIMPEZA'
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-40 transition shadow-xs"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{isProcessing ? 'Executando Limpeza...' : 'Executar Limpeza Seletiva'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
