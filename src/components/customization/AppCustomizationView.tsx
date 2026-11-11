/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Palette,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  Save,
  Eye,
  Grid2X2,
  Receipt,
  Boxes,
  UtensilsCrossed,
  WalletCards,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme, THEME_COLOR_PRESETS } from '../../contexts/ThemeContext';
import { SystemThemeConfig } from '../../types';
import { DEFAULT_THEME_CONFIG } from '../../services/mock-data';

export const AppCustomizationView: React.FC = () => {
  const { currentUser, isAdm } = useAuth();
  const { theme, updateTheme, resetThemeToDefault, isCustomized } = useTheme();

  // Estado local para rascunho / prévia antes de salvar
  const [draftTheme, setDraftTheme] = useState<SystemThemeConfig>(theme);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isAdm) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-8 text-center text-rose-950">
        <ShieldAlert className="mx-auto h-12 w-12 text-rose-600 mb-3" />
        <h2 className="text-lg font-bold">Acesso Restrito ao Administrador</h2>
        <p className="mt-1 text-sm text-rose-700">
          O perfil de Vendedor não possui autorização para modificar a identidade visual ou paleta de cores do estabelecimento.
        </p>
      </div>
    );
  }

  const handleColorChange = (key: keyof SystemThemeConfig, hex: string) => {
    setDraftTheme((prev) => ({
      ...prev,
      [key]: hex,
    }));
    setSaveSuccess(false);
  };

  const handleSaveTheme = () => {
    updateTheme(draftTheme);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  const handleReset = () => {
    if (window.confirm('Deseja restaurar as cores originais oficiais do SaborGestão?')) {
      resetThemeToDefault();
      setDraftTheme(DEFAULT_THEME_CONFIG);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    }
  };

  const colorSections = [
    {
      key: 'posColor' as const,
      label: 'Seção de Vendas (PDV & Balcão)',
      icon: Receipt,
      description: 'Identificação visual dos pedidos, catálogo e tela de vendas',
    },
    {
      key: 'inventoryColor' as const,
      label: 'Seção de Estoque',
      icon: Boxes,
      description: 'Controle de saldo de mercadorias e auditoria de compras',
    },
    {
      key: 'productsColor' as const,
      label: 'Seção de Produtos & Cardápio',
      icon: UtensilsCrossed,
      description: 'Listagem e cartões de alimentos e bebidas',
    },
    {
      key: 'tablesColor' as const,
      label: 'Seção de Mesas & Atendimento',
      icon: Grid2X2,
      description: 'Mapa do salão, comandas e status das mesas',
    },
    {
      key: 'cashColor' as const,
      label: 'Seção de Caixa',
      icon: WalletCards,
      description: 'Gaveta de valores em espécie e aberturas/fechamentos',
    },
    {
      key: 'expensesColor' as const,
      label: 'Seção de Gastos & Despesas',
      icon: TrendingDown,
      description: 'Saídas operacionais e comprovantes de pagamentos a fornecedores',
    },
    {
      key: 'reportsColor' as const,
      label: 'Seção de Relatórios & DRE',
      icon: TrendingUp,
      description: 'Gráficos de desempenho, faturamento e balanços salvos',
    },
    {
      key: 'primaryButtonColor' as const,
      label: 'Botões Principais de Ação',
      icon: Sparkles,
      description: 'Botões de finalização de venda, confirmações e salvamento',
    },
    {
      key: 'statusColor' as const,
      label: 'Destaque & Identificação de Status',
      icon: Eye,
      description: 'Indicadores de sucesso, prontidão e disponibilidade',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-white p-6 border border-stone-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Palette className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-stone-900">Personalização Visual do Aplicativo</h1>
            <p className="text-xs text-stone-500">
              Defina a paleta de cores corporativa do estabelecimento para a matriz e todos os terminais de vendedores
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Restaurar Originais */}
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 transition shadow-xs"
          >
            <RotateCcw className="h-4 w-4 text-stone-500" />
            <span>Restaurar Cores Originais</span>
          </button>

          {/* Botão Salvar e Sincronizar */}
          <button
            onClick={handleSaveTheme}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-xs"
          >
            <Save className="h-4 w-4" />
            <span>Salvar e Sincronizar Cores</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>
            Tema visual atualizado com sucesso! As novas cores já estão ativas e sincronizadas com todos os dispositivos.
          </span>
        </div>
      )}

      {/* Grid: Editor de Cores à Esquerda e Prévia ao Vivo à Direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor de Cores por Seção */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs">
            <h2 className="text-sm font-bold text-stone-900 mb-1">Cores das Seções do Sistema</h2>
            <p className="text-xs text-stone-500 mb-4">
              Clique em uma cor predefinida ou selecione um tom personalizado para cada módulo:
            </p>

            <div className="space-y-4 divide-y divide-stone-100">
              {colorSections.map((sec) => {
                const Icon = sec.icon;
                const currentColor = draftTheme[sec.key];

                return (
                  <div key={sec.key} className="pt-4 first:pt-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-stone-600" />
                        <div>
                          <p className="text-xs font-bold text-stone-900">{sec.label}</p>
                          <p className="text-[11px] text-stone-500">{sec.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={currentColor}
                          onChange={(e) => handleColorChange(sec.key, e.target.value)}
                          className="h-8 w-8 cursor-pointer rounded-lg border border-stone-200 bg-white p-0.5"
                          title="Seletor de cor hexadecimal livre"
                        />
                        <span className="font-mono text-xs font-bold text-stone-700 uppercase bg-stone-100 px-2 py-1 rounded-md">
                          {currentColor}
                        </span>
                      </div>
                    </div>

                    {/* Paleta rápida de presets recomendados */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {THEME_COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => handleColorChange(sec.key, preset.hex)}
                          className={`h-6 w-6 rounded-full border transition transform active:scale-95 ${
                            currentColor.toLowerCase() === preset.hex.toLowerCase()
                              ? 'ring-2 ring-stone-900 ring-offset-1 scale-110'
                              : 'border-black/10 hover:scale-105'
                          }`}
                          style={{ backgroundColor: preset.hex }}
                          title={preset.name}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Painel de Prévia ao Vivo (Live Preview) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="sticky top-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-stone-900">Prévia ao Vivo (Live Preview)</h3>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                Visualização em Tempo Real
              </span>
            </div>

            {/* Simulação: Botão Principal */}
            <div>
              <span className="text-[11px] font-bold text-stone-600 block mb-1">Botão Principal de Venda:</span>
              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-xs transition"
                style={{ backgroundColor: draftTheme.primaryButtonColor }}
              >
                Concluir Venda (R$ 48,00)
              </button>
            </div>

            {/* Simulação: Card de Mesa */}
            <div>
              <span className="text-[11px] font-bold text-stone-600 block mb-1">Card de Mesa:</span>
              <div className="rounded-xl border border-stone-200 p-3 bg-stone-50/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white font-bold text-xs"
                    style={{ backgroundColor: draftTheme.tablesColor }}
                  >
                    04
                  </span>
                  <div>
                    <p className="text-xs font-bold text-stone-800">Mesa 04 (Salão Principal)</p>
                    <p className="text-[10px] text-stone-500">Atendente: Lucas Vendedor</p>
                  </div>
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: draftTheme.statusColor }}
                >
                  Disponível
                </span>
              </div>
            </div>

            {/* Simulação: Card de Produto do Cardápio */}
            <div>
              <span className="text-[11px] font-bold text-stone-600 block mb-1">Produto no Catálogo:</span>
              <div className="rounded-xl border border-stone-200 p-3 bg-white flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-xs font-bold text-stone-900">Smash Burger Bacon</p>
                  <p className="text-[11px] font-bold" style={{ color: draftTheme.posColor }}>
                    R$ 32,00
                  </p>
                </div>
                <span
                  className="rounded-lg px-2 py-1 text-[10px] font-bold text-white"
                  style={{ backgroundColor: draftTheme.inventoryColor }}
                >
                  15 un em estoque
                </span>
              </div>
            </div>

            {/* Simulação: Card de Gastos e Relatórios */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div
                className="rounded-xl p-3 text-white"
                style={{ backgroundColor: draftTheme.expensesColor }}
              >
                <span className="text-[10px] opacity-80">Gastos Registrados</span>
                <p className="text-sm font-bold mt-0.5">R$ 1.840,00</p>
              </div>

              <div
                className="rounded-xl p-3 text-white"
                style={{ backgroundColor: draftTheme.reportsColor }}
              >
                <span className="text-[10px] opacity-80">Faturamento DRE</span>
                <p className="text-sm font-bold mt-0.5">R$ 12.450,00</p>
              </div>
            </div>

            <div className="rounded-xl bg-stone-50 p-3 text-[11px] text-stone-500 border border-stone-100">
              <p>
                As alterações efetuadas pelo ADM são replicadas automaticamente no aplicativo de todos os vendedores do estabelecimento.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
