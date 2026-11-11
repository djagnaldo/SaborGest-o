/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Settings,
  Building2,
  Trash2,
  RefreshCw,
  ShieldCheck,
  Database,
  Clock,
  Sparkles,
  Camera,
  QrCode,
  Banknote,
  CheckCircle2,
  Activity,
  Layers,
  ArrowDownUp,
  Cpu,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { getAuditLogs, addAuditLog } from '../../services/storage';
import { getDeltaStats, broadcastDeltaUpdate, getMatrizInfo } from '../../services/local-db';
import { formatDateTimeBR } from '../../utils/formatters';

interface SettingsViewProps {
  onOpenEditTenant: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenEditTenant }) => {
  const { currentTenant, updateTenant, clearTenantDemoData, reloadTenantDemoData } = useTenant();
  const { isAdm, currentUser } = useAuth();
  const auditLogs = getAuditLogs(currentTenant.id);
  const matriz = getMatrizInfo();
  const deltaStats = getDeltaStats();

  // Regras de Comprovante
  const [pixRule, setPixRule] = useState<'disabled' | 'optional' | 'required'>(
    currentTenant.settings?.pixReceiptRule || 'optional'
  );
  const [cashRule, setCashRule] = useState<'disabled' | 'optional' | 'required'>(
    currentTenant.settings?.cashReceiptRule || 'optional'
  );
  const [rulesSavedNotice, setRulesSavedNotice] = useState(false);

  const handleSaveReceiptRules = () => {
    const updatedTenant = {
      ...currentTenant,
      settings: {
        ...currentTenant.settings,
        pixReceiptRule: pixRule,
        cashReceiptRule: cashRule,
      },
    };
    updateTenant(updatedTenant);

    // Dispara sincronização delta de prioridade 4 (Permissões & Regras) para todos os terminais
    broadcastDeltaUpdate({
      tenantId: currentTenant.id,
      type: 'permissions_updated',
      title: 'Regras de Comprovante Atualizadas pela Matriz',
      message: `Novas regras definidas: PIX (${pixRule.toUpperCase()}) e Dinheiro (${cashRule.toUpperCase()}).`,
      priority: 4,
      payload: { pixReceiptRule: pixRule, cashReceiptRule: cashRule },
    });

    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'adm',
      userName: currentUser?.name || 'Administrador',
      action: 'ALTERACAO_REGRAS_COMPROVANTE',
      details: `Regras de comprovante alteradas na Matriz. PIX: ${pixRule}, Dinheiro: ${cashRule}.`,
    });

    setRulesSavedNotice(true);
    setTimeout(() => setRulesSavedNotice(false), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
            Configurações & Auditoria
          </h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Sistema
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500 sm:text-sm">
          Preferências operacionais do estabelecimento, status do banco de dados e trilha de auditoria completa.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Dados do Estabelecimento */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-stone-900">Dados do Estabelecimento</h3>
            </div>
            {isAdm && (
              <button
                onClick={onOpenEditTenant}
                className="rounded-lg bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-200 transition"
              >
                Editar Dados
              </button>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-stone-50">
              <span className="text-stone-500">Nome Fantasia:</span>
              <strong className="text-stone-800">{currentTenant.name}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-50">
              <span className="text-stone-500">CNPJ / CPF:</span>
              <strong className="text-stone-800">{currentTenant.document || 'Não informado'}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-50">
              <span className="text-stone-500">Segmento:</span>
              <strong className="text-stone-800 capitalize">{currentTenant.segment}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-50">
              <span className="text-stone-500">Taxa de Serviço Padrão:</span>
              <strong className="text-stone-800">{currentTenant.settings?.serviceFeePercentage}%</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-50">
              <span className="text-stone-500">Permitir Estoque Negativo:</span>
              <strong className="text-stone-800">
                {currentTenant.settings?.allowNegativeStock ? 'Sim (Habilitado)' : 'Não (Bloqueado)'}
              </strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-stone-500">Endereço:</span>
              <span className="text-stone-800 text-right max-w-[240px] truncate">
                {currentTenant.address}
              </span>
            </div>
          </div>
        </div>

        {/* Gerenciamento de Demonstração e Banco */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <Database className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-stone-900">Banco de Dados & Demonstração</h3>
          </div>

          <p className="text-xs text-stone-600 leading-relaxed">
            O sistema suporta alternância entre dados de teste (com a marcação <code>isDemo: true</code>) e dados reais. Você pode limpar a demonstração a qualquer momento.
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => {
                if (confirm('Deseja realmente remover os dados de demonstração deste estabelecimento?')) {
                  clearTenantDemoData();
                  alert('Dados de demonstração removidos com sucesso!');
                }
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
              Limpar Dados de Demonstração
            </button>

            <button
              onClick={() => {
                reloadTenantDemoData();
                alert('Dados de demonstração recarregados com sucesso!');
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition"
            >
              <RefreshCw className="h-4 w-4 text-stone-600" />
              Recarregar Dados de Demonstração
            </button>
          </div>
        </div>
      </div>

      {/* REGRAS DE COMPROVANTE DE PAGAMENTO & TELEMETRIA DELTA SYNC */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Painel de Regras de Comprovantes (Exclusivo ADM na Matriz) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-stone-900">
                Regras de Comprovante de Pagamento
              </h3>
            </div>
            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
              Autoridade Matriz
            </span>
          </div>

          <p className="text-xs text-stone-500 leading-relaxed">
            Configure de forma independente a exigência de comprovantes fotográficos para vendas em <strong>PIX</strong> e <strong>DINHEIRO</strong>. As alterações são sincronizadas imediatamente com todos os terminais.
          </p>

          <div className="space-y-3.5 pt-1">
            {/* Regra PIX */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold text-stone-900">1. Comprovante PIX</span>
                </div>
                <span className="text-[10px] text-stone-500 font-medium">
                  {pixRule === 'required'
                    ? '🔴 Bloqueia sem foto'
                    : pixRule === 'optional'
                    ? '🟡 Vendedor escolhe'
                    : '⚪ Ocultado no app'}
                </span>
              </div>

              <select
                value={pixRule}
                disabled={!isAdm}
                onChange={(e) => setPixRule(e.target.value as any)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-900 focus:border-amber-500 focus:outline-none"
              >
                <option value="disabled">1. Comprovante Desativado (Não apresenta opção)</option>
                <option value="optional">2. Comprovante Opcional (Permite com ou sem foto)</option>
                <option value="required">3. Comprovante Obrigatório (Impede finalizar sem foto)</option>
              </select>
            </div>

            {/* Regra DINHEIRO */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-amber-700" />
                  <span className="text-xs font-bold text-stone-900">2. Comprovante DINHEIRO</span>
                </div>
                <span className="text-[10px] text-stone-500 font-medium">
                  {cashRule === 'required'
                    ? '🔴 Bloqueia sem foto'
                    : cashRule === 'optional'
                    ? '🟡 Vendedor escolhe'
                    : '⚪ Ocultado no app'}
                </span>
              </div>

              <select
                value={cashRule}
                disabled={!isAdm}
                onChange={(e) => setCashRule(e.target.value as any)}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-900 focus:border-amber-500 focus:outline-none"
              >
                <option value="disabled">1. Comprovante Desativado (Não apresenta opção)</option>
                <option value="optional">2. Comprovante Opcional (Permite com ou sem foto)</option>
                <option value="required">3. Comprovante Obrigatório (Impede finalizar sem foto)</option>
              </select>
            </div>
          </div>

          {rulesSavedNotice && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-2.5 text-xs font-bold text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Regras salvas e propagadas para os terminais via Delta Sync (Prioridade 4)!</span>
            </div>
          )}

          {isAdm && (
            <button
              onClick={handleSaveReceiptRules}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
            >
              <CheckCircle2 className="h-4 w-4" />
              Salvar Regras de Comprovante
            </button>
          )}
        </div>

        {/* Telemetria de Consumo de Dados & Economia Delta Sync */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-stone-900">
                Telemetria de Consumo & Delta Sync
              </h3>
            </div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
              96% de Economia
            </span>
          </div>

          <p className="text-xs text-stone-500 leading-relaxed">
            O terminal do vendedor é <strong>90% pré-carregado</strong>. Apenas deltas incrementais (preços, estoque e comprovantes comprimidos) trafegam pela rede local.
          </p>

          {/* Cards de Métricas de Rede */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <span className="text-[10px] uppercase font-bold text-stone-500">
                Dados Trafegados (Deltas)
              </span>
              <p className="mt-1 text-xl font-black text-stone-900">
                {(deltaStats.totalBytesDownloaded / 1024).toFixed(1)} KB
              </p>
              <p className="mt-0.5 text-[10px] text-emerald-600 font-semibold">
                {deltaStats.deltaEventsCount} eventos transmitidos
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <span className="text-[10px] uppercase font-bold text-emerald-700">
                Tráfego Economizado
              </span>
              <p className="mt-1 text-xl font-black text-emerald-800">
                {(deltaStats.totalBytesSaved / 1024).toFixed(1)} KB
              </p>
              <p className="mt-0.5 text-[10px] text-emerald-700 font-semibold">
                Evitou recargas integrais
              </p>
            </div>
          </div>

          {/* Ordem Rigorosa de Prioridade de Sincronização */}
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-stone-800 text-[11px]">
              <Layers className="h-3.5 w-3.5 text-indigo-600" />
              <span>Hierarquia Rigorosa de Atualização Delta:</span>
            </div>
            <ol className="text-[11px] text-stone-600 space-y-0.5 list-decimal list-inside leading-tight">
              <li><strong>Vendas e Pedidos</strong> (Prioridade Máxima)</li>
              <li><strong>Estoque e Disponibilidade</strong> física</li>
              <li><strong>Preços Oficiais</strong> (Atualiza antes de concluir venda)</li>
              <li><strong>Permissões e Regras</strong> de comprovantes</li>
              <li><strong>Cadastros de Produtos</strong> e fichas</li>
              <li><strong>Fotografias</strong> (Comprimidas para &lt;40KB)</li>
              <li><strong>Atualizações Visuais</strong> de sistema</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Trilha de Auditoria Completa */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-stone-900">Registro de Auditoria do Estabelecimento</h3>
          </div>
          <span className="text-xs text-stone-400">{auditLogs.length} eventos registrados</span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-600">
            <thead className="border-b border-stone-200 bg-stone-50/70 text-[10px] font-semibold uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">Data e Hora</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-stone-50">
                  <td className="px-3 py-2 text-stone-400 whitespace-nowrap">
                    {formatDateTimeBR(log.timestamp)}
                  </td>
                  <td className="px-3 py-2 font-medium text-stone-800 whitespace-nowrap">
                    {log.userName}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-stone-600">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
