/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  HardDriveDownload,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  FileCheck2,
  Trash2,
  Eye,
  Download,
  ShieldAlert,
  FolderArchive,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { SystemBackup } from '../../types';
import {
  getSystemBackups,
  createSystemBackup,
  restoreSystemBackup,
  deleteSystemBackup,
} from '../../services/storage';
import { formatTimeBR } from '../../utils/formatters';
import { ResetOperationModal } from './ResetOperationModal';

interface BackupManagerViewProps {
  onOpenResetModal?: () => void;
}

export const BackupManagerView: React.FC<BackupManagerViewProps> = () => {
  const { currentTenant } = useTenant();
  const { currentUser, isAdm } = useAuth();
  const [backups, setBackups] = useState<SystemBackup[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<SystemBackup | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupNameInput, setBackupNameInput] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isConfirmingRestore, setIsConfirmingRestore] = useState<SystemBackup | null>(null);
  const [confirmingDeleteBackup, setConfirmingDeleteBackup] = useState<SystemBackup | null>(null);
  const [backupBeforeRestore, setBackupBeforeRestore] = useState(true);

  const loadBackups = () => {
    const list = getSystemBackups(currentTenant.id);
    setBackups(list);
  };

  useEffect(() => {
    loadBackups();
    const handleSync = () => loadBackups();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  if (!isAdm) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 text-center text-rose-950">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-600 mb-3" />
        <h2 className="text-lg font-bold">Acesso Restrito ao Administrador</h2>
        <p className="mt-1 text-sm text-rose-700">
          O perfil de Vendedor não possui autorização para criar, restaurar ou exportar cópias de segurança do estabelecimento.
        </p>
      </div>
    );
  }

  const handleCreateManualBackup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsCreatingBackup(true);

    try {
      const name = backupNameInput.trim() || `Backup Manual ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`;
      const newBkp = createSystemBackup(
        currentTenant.id,
        name,
        { id: currentUser.id, name: currentUser.name }
      );
      loadBackups();
      setBackupNameInput('');
      setFeedbackMessage({
        type: 'success',
        text: `Backup "${newBkp.name}" criado com sucesso! (${(newBkp.sizeBytes / 1024).toFixed(1)} KB)`,
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Erro ao gerar cópia de segurança: ${err?.message || 'Falha desconhecida'}`,
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleExportJson = (backup: SystemBackup) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${backup.id}_${currentTenant.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.id || !parsed.payload || !parsed.checksum) {
          throw new Error('Arquivo de backup inválido ou sem a assinatura oficial de integridade.');
        }

        // Validação de estrutura mínima
        if (!parsed.payload.tenant || !Array.isArray(parsed.payload.products)) {
          throw new Error('Estrutura de dados do backup incompleta ou incompatível com o SaborGestão.');
        }

        // Adiciona à lista de backups disponíveis
        const all = getSystemBackups(currentTenant.id);
        const importedBkp: SystemBackup = {
          ...parsed,
          id: `IMP-${Date.now()}`,
          name: `[Importado] ${parsed.name || file.name}`,
          createdAt: new Date().toISOString(),
          createdById: currentUser.id,
          createdByName: `${currentUser.name} (Importação)`,
        };

        const updated = [importedBkp, ...all.filter((b) => b.id !== importedBkp.id)];
        localStorage.setItem('sabor_system_backups', JSON.stringify(updated));
        loadBackups();

        setFeedbackMessage({
          type: 'success',
          text: `Arquivo "${file.name}" importado com integridade validada! Você pode visualizá-lo ou restaurá-lo na lista abaixo.`,
        });
      } catch (err: any) {
        setFeedbackMessage({
          type: 'error',
          text: `Falha ao importar backup: ${err.message}`,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExecuteRestore = () => {
    if (!isConfirmingRestore || !currentUser) return;

    // Se marcado para salvar cópia antes de restaurar
    if (backupBeforeRestore) {
      createSystemBackup(
        currentTenant.id,
        `Backup de Segurança Pré-Restauração (${new Date().toLocaleTimeString('pt-BR')})`,
        { id: currentUser.id, name: currentUser.name },
        'Automático de Proteção'
      );
    }

    const res = restoreSystemBackup(isConfirmingRestore, {
      id: currentUser.id,
      name: currentUser.name,
    });

    if (res.success) {
      setFeedbackMessage({
        type: 'success',
        text: res.message,
      });
      setIsConfirmingRestore(null);
      loadBackups();
    } else {
      setFeedbackMessage({
        type: 'error',
        text: res.message,
      });
    }
  };

  const handleConfirmDelete = () => {
    if (!confirmingDeleteBackup) return;
    deleteSystemBackup(confirmingDeleteBackup.id);
    setConfirmingDeleteBackup(null);
    loadBackups();
    setFeedbackMessage({
      type: 'success',
      text: `Backup removido com sucesso.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header com resumo e ação de Reiniciar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-white p-6 border border-stone-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-stone-900">Central de Backups e Restauração</h1>
              <p className="text-xs text-stone-500">
                Preservação histórica integral dos dados, produtos com fotos e configurações do estabelecimento
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Arquivar PDF e Limpeza e Novo Período */}
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-xs"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Limpeza e Novo Período</span>
          </button>

          {/* Botão de Importar Arquivo JSON */}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 transition shadow-xs">
            <Upload className="h-4 w-4 text-stone-600" />
            <span>Importar Backup (.json)</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportJson}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedbackMessage && (
        <div
          className={`flex items-start justify-between rounded-xl p-4 text-xs font-medium border ${
            feedbackMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-stone-400 hover:text-stone-700 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Card de Criação de Backup Manual */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs">
        <h2 className="text-sm font-bold text-stone-900 mb-1 flex items-center gap-2">
          <HardDriveDownload className="h-4 w-4 text-amber-600" />
          <span>Criar Nova Cópia de Segurança do Estabelecimento</span>
        </h2>
        <p className="text-xs text-stone-500 mb-4">
          Captura um retrato completo contendo: cadastro de produtos com fotos em base64, mesas, cardápio, todas as vendas, despesas, estoque e configurações ativas.
        </p>

        <form onSubmit={handleCreateManualBackup} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Nome ou identificação do backup (ex: Fechamento Semanal 12/11)"
            value={backupNameInput}
            onChange={(e) => setBackupNameInput(e.target.value)}
            className="flex-1 rounded-xl border border-stone-200 px-3.5 py-2.5 text-xs text-stone-900 focus:border-amber-600 focus:outline-hidden"
          />
          <button
            type="submit"
            disabled={isCreatingBackup}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 transition shadow-xs"
          >
            <HardDriveDownload className="h-4 w-4" />
            <span>{isCreatingBackup ? 'Gerando Cópia...' : 'Gerar Backup Agora'}</span>
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
          <span className="flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-emerald-600" />
            Armazenamento Local na Matriz ADM + Exportação JSON
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            Assinatura e Validação Anti-Corrupção de Dados
          </span>
        </div>
      </div>

      {/* Lista de Backups Existentes */}
      <div className="rounded-2xl border border-stone-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-stone-200 bg-stone-50/60 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-stone-900">Histórico de Cópias de Segurança</h3>
            <p className="text-xs text-stone-500">
              {backups.length} {backups.length === 1 ? 'cópia registrada' : 'cópias registradas'} para {currentTenant.name}
            </p>
          </div>
          <button
            onClick={loadBackups}
            className="flex items-center gap-1 text-xs text-stone-600 hover:text-stone-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Atualizar</span>
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="p-12 text-center text-stone-400">
            <FolderArchive className="mx-auto h-12 w-12 text-stone-300 mb-2" />
            <p className="text-sm font-semibold text-stone-700">Nenhum backup registrado ainda</p>
            <p className="text-xs text-stone-400 mt-1">
              Clique em "Gerar Backup Agora" para criar a primeira cópia de segurança oficial.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {backups.map((bkp) => (
              <div
                key={bkp.id}
                className="flex flex-col md:flex-row md:items-center justify-between p-4 sm:p-5 hover:bg-stone-50/60 transition gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-stone-900">{bkp.name}</span>
                    <span className="font-mono rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                      {bkp.id}
                    </span>
                    {bkp.cloudSynced && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                        <HardDrive className="h-3 w-3" />
                        Matriz Local
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-stone-400" />
                      {new Date(bkp.createdAt).toLocaleDateString('pt-BR')} às {formatTimeBR(bkp.createdAt)}
                    </span>
                    <span>• Responsável: <strong>{bkp.createdByName}</strong></span>
                    <span>• Tamanho: <strong>{(bkp.sizeBytes / 1024).toFixed(1)} KB</strong></span>
                    <span>• Escopo: {bkp.scopePeriod || 'Completo'}</span>
                  </div>

                  {/* Resumo de itens preservados */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-stone-600">
                    <span className="rounded bg-stone-100 px-2 py-0.5">
                      <strong>{bkp.stats.productsCount}</strong> produtos
                    </span>
                    <span className="rounded bg-stone-100 px-2 py-0.5">
                      <strong>{bkp.stats.photosCount}</strong> fotos
                    </span>
                    <span className="rounded bg-stone-100 px-2 py-0.5">
                      <strong>{bkp.stats.ordersCount}</strong> vendas
                    </span>
                    <span className="rounded bg-stone-100 px-2 py-0.5">
                      <strong>{bkp.stats.tablesCount}</strong> mesas
                    </span>
                    <span className="rounded bg-stone-100 px-2 py-0.5">
                      <strong>{bkp.stats.expensesCount}</strong> despesas
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Prévia */}
                  <button
                    onClick={() => {
                      setSelectedBackup(bkp);
                      setIsPreviewModalOpen(true);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 shadow-xs"
                    title="Visualizar conteúdo preservado sem restaurar"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Ver Prévia</span>
                  </button>

                  {/* Exportar .json */}
                  <button
                    onClick={() => handleExportJson(bkp)}
                    className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 shadow-xs"
                    title="Baixar arquivo JSON para backup externo / pen drive"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Exportar</span>
                  </button>

                  {/* Restaurar */}
                  <button
                    onClick={() => setIsConfirmingRestore(bkp)}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition"
                    title="Restaurar este estado no estabelecimento"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restaurar</span>
                  </button>

                  {/* Excluir */}
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteBackup(bkp)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition"
                    title="Excluir cópia"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Prévia de Backup */}
      {isPreviewModalOpen && selectedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-stone-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Prévia do Backup: {selectedBackup.name}
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  ID: {selectedBackup.id} • Checksum: {selectedBackup.checksum.slice(0, 16)}...
                </p>
              </div>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                  <span className="text-[10px] text-stone-500 font-medium">Produtos Salvos</span>
                  <p className="text-lg font-bold text-stone-900">{selectedBackup.stats.productsCount}</p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                  <span className="text-[10px] text-stone-500 font-medium">Vendas Históricas</span>
                  <p className="text-lg font-bold text-stone-900">{selectedBackup.stats.ordersCount}</p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                  <span className="text-[10px] text-stone-500 font-medium">Mesas Registradas</span>
                  <p className="text-lg font-bold text-stone-900">{selectedBackup.stats.tablesCount}</p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                  <span className="text-[10px] text-stone-500 font-medium">Fotos Preservadas</span>
                  <p className="text-lg font-bold text-stone-900">{selectedBackup.stats.photosCount}</p>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-stone-800 mb-1">Amostra de Produtos no Backup:</h4>
                <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 overflow-hidden">
                  {selectedBackup.payload.products?.slice(0, 5).map((p) => (
                    <div key={p.id} className="p-2.5 flex items-center justify-between bg-white text-[11px]">
                      <span className="font-semibold text-stone-800">{p.name}</span>
                      <span className="text-stone-500">
                        R$ {p.sellingPrice.toFixed(2)} (Estoque: {p.stockQuantity} {p.unit})
                      </span>
                    </div>
                  ))}
                  {(selectedBackup.payload.products?.length || 0) > 5 && (
                    <div className="p-2 text-center text-stone-400 text-[10px] bg-stone-50">
                      + {(selectedBackup.payload.products?.length || 0) - 5} outros produtos salvos
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-stone-800 mb-1">Identificação do Estabelecimento:</h4>
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-[11px] space-y-1">
                  <p><strong>Nome:</strong> {selectedBackup.payload.tenant?.name}</p>
                  <p><strong>Documento:</strong> {selectedBackup.payload.tenant?.document || 'Não informado'}</p>
                  <p><strong>Criado em:</strong> {new Date(selectedBackup.createdAt).toLocaleString('pt-BR')}</p>
                  <p><strong>Gerado por:</strong> {selectedBackup.createdByName}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Fechar
              </button>
              <button
                onClick={() => {
                  setIsPreviewModalOpen(false);
                  setIsConfirmingRestore(selectedBackup);
                }}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs"
              >
                Prosseguir para Restauração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Restauração */}
      {isConfirmingRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-amber-200">
            <div className="flex items-center gap-3 text-amber-700 mb-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </span>
              <div>
                <h3 className="text-base font-bold text-stone-900">Confirmar Restauração de Dados</h3>
                <p className="text-xs text-stone-500 font-medium">Backup: {isConfirmingRestore.name}</p>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              A restauração irá restabelecer os produtos, mesas, vendas e estoque exatamente como estavam gravados neste arquivo de segurança.
            </p>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-2">
              <label className="flex items-start gap-2 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={backupBeforeRestore}
                  onChange={(e) => setBackupBeforeRestore(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  <strong>Criar um backup de segurança do estado atual antes de restaurar</strong> (Recomendado para evitar perdas acidentais).
                </span>
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsConfirmingRestore(null)}
                className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleExecuteRestore}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition"
              >
                Confirmar e Restaurar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Backup */}
      {confirmingDeleteBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">Excluir Cópia de Segurança</h3>
                <p className="text-xs text-stone-500">
                  Deseja remover o backup "{confirmingDeleteBackup.name}" da lista local?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setConfirmingDeleteBackup(null)}
                className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Limpeza Seletiva e Novo Período */}
      <ResetOperationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onSuccess={() => {
          setIsResetModalOpen(false);
          loadBackups();
          setFeedbackMessage({
            type: 'success',
            text: 'Limpeza seletiva e virada de período concluídas com sucesso! PDF histórico e itens selecionados foram preservados.',
          });
        }}
      />
    </div>
  );
};
