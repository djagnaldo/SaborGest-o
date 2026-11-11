/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TenantProvider, useTenant } from './contexts/TenantContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Header } from './components/layout/Header';
import { Sidebar, ActiveTab } from './components/layout/Sidebar';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { LocalServerManager } from './components/server/LocalServerManager';
import { SellerControlPanel } from './components/team/SellerControlPanel';
import { PcBrowserAccessModal } from './components/server/PcBrowserAccessModal';
import { ProductsView } from './components/products/ProductsView';
import { TablesView } from './components/tables/TablesView';
import { PosView } from './components/pos/PosView';
import { CashRegisterView } from './components/cash/CashRegisterView';
import { FinancialView } from './components/financial/FinancialView';
import { InventoryView } from './components/inventory/InventoryView';
import { ContactsView } from './components/contacts/ContactsView';
import { SettingsView } from './components/settings/SettingsView';
import { MySalesView } from './components/seller/MySalesView';
import { ExpensesView } from './components/expenses/ExpensesView';
import { BackupManagerView } from './components/backup/BackupManagerView';
import { HistoricalArchivesView } from './components/history/HistoricalArchivesView';
import { AppCustomizationView } from './components/customization/AppCustomizationView';
import { ThemeProvider } from './contexts/ThemeContext';
import { TenantModal } from './components/tenants/TenantModal';
import {
  initLocalDatabase,
  getLocalServerConfig,
  getMatrizInfo,
  getConnectionStatus,
  isServerOnline,
  setServerOnline,
  syncOfflineQueue,
} from './services/local-db';
import {
  Radio,
  Server,
  Monitor,
  Smartphone,
  Wifi,
  WifiOff,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  Grid2X2,
  Receipt,
  WalletCards,
  TrendingDown,
  UtensilsCrossed,
  Menu,
  Users2,
  Award,
  LayoutDashboard,
} from 'lucide-react';
import { formatTimeBR } from './utils/formatters';

const AppContent: React.FC = () => {
  const { currentTenant } = useTenant();
  const { activeView, setActiveView, isAdm, switchUser, users } = useAuth();
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [tenantModalMode, setTenantModalMode] = useState<'create' | 'edit'>('create');
  const [activeDeviceView, setActiveDeviceView] = useState<'adm' | 'pc' | 'seller'>('adm');
  const [connStatus, setConnStatus] = useState(getConnectionStatus());
  const [isPcModalOpen, setIsPcModalOpen] = useState(false);

  // Inicialização do Banco Local Principal
  useEffect(() => {
    initLocalDatabase();

    const handleSyncEvent = () => {
      setConnStatus(getConnectionStatus());
    };

    window.addEventListener('sabor_local_sync', handleSyncEvent);
    const interval = setInterval(() => {
      setConnStatus(getConnectionStatus());
    }, 2000);

    return () => {
      window.removeEventListener('sabor_local_sync', handleSyncEvent);
      clearInterval(interval);
    };
  }, []);

  // Sincroniza visualização com a troca de modo de dispositivo simulado
  const handleDeviceSwitch = (mode: 'adm' | 'pc' | 'seller') => {
    setActiveDeviceView(mode);
    if (mode === 'adm') {
      const admin = users.find((u) => u.role === 'admin') || users[0];
      if (admin) switchUser(admin.id);
      setActiveView('admin');
      setCurrentTab('dashboard');
    } else if (mode === 'pc') {
      const cashier = users.find((u) => u.role === 'cashier') || users[0];
      if (cashier) switchUser(cashier.id);
      setActiveView('admin');
      setCurrentTab('pos');
    } else if (mode === 'seller') {
      const waiter = users.find((u) => u.role === 'waiter') || users[0];
      if (waiter) switchUser(waiter.id);
      setActiveView('vendedor');
      setCurrentTab('my_sales');
    }
  };

  // Sync tab when view mode switches
  useEffect(() => {
    if (activeView === 'vendedor') {
      const allowedSellerTabs: ActiveTab[] = ['my_sales', 'products', 'tables', 'pos'];
      if (!allowedSellerTabs.includes(currentTab)) {
        setCurrentTab('my_sales');
      }
    }
  }, [activeView, currentTab]);

  const handleOpenNewTenant = () => {
    setTenantModalMode('create');
    setIsTenantModalOpen(true);
  };

  const handleOpenEditTenant = () => {
    setTenantModalMode('edit');
    setIsTenantModalOpen(true);
  };

  const handleToggleServerOnline = () => {
    const nextState = !connStatus.isServerOnline;
    setServerOnline(nextState);
    if (nextState) {
      syncOfflineQueue(currentTenant.id);
    }
    setConnStatus(getConnectionStatus());
  };

  const serverConfig = getLocalServerConfig();
  const matriz = getMatrizInfo();

  // Status visual mapping (🟢 Green, 🟡 Yellow, 🔴 Red)
  const statusBadge = () => {
    if (connStatus.status === 'red') {
      return {
        bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        dot: 'bg-rose-500',
        text: '🔴 MATRIZ INDISPONÍVEL (MODO RASCUNHO)',
      };
    }
    if (connStatus.status === 'yellow') {
      return {
        bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        dot: 'bg-amber-400 animate-pulse',
        text: `🟡 ${connStatus.pendingCount} RASCUNHOS EM TRANSMISSÃO`,
      };
    }
    return {
      bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      dot: 'bg-emerald-400 animate-pulse',
      text: '🟢 CONECTADO À MATRIZ',
    };
  };

  const badge = statusBadge();

  return (
    <div className="flex h-screen w-full flex-col bg-stone-100 font-sans text-stone-900 antialiased overflow-hidden">
      {/* Top Barra de Conectividade com a Matriz & Emulador Multi-Dispositivo */}
      <div className="flex flex-wrap items-center justify-between border-b border-stone-800 bg-stone-950 px-3 py-1.5 text-xs text-stone-300 gap-2">
        {/* Lado Esquerdo: Conectividade com a Matriz & Indicador Visual em Tempo Real */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Indicador de Status 🟢 🟡 🔴 */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.bg}`}
            title={`Última comunicação confirmada: ${formatTimeBR(connStatus.lastSyncAt)}`}
          >
            <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
            <span>{badge.text}</span>
          </div>

          <span className="hidden sm:inline text-stone-300">
            Estabelecimento: <strong className="text-white">{currentTenant.name}</strong>
          </span>

          <span className="hidden md:inline text-[11px] text-amber-300">
            • Matriz Ativa: <strong>{matriz.activeHostLabel}</strong> ({matriz.ipAddress})
          </span>

          <span className="hidden lg:inline text-[11px] text-stone-400">
            • Última Comunicação: {formatTimeBR(connStatus.lastSyncAt)}
          </span>

          {/* Botão de Simulação: Ligar/Desligar Matriz */}
          <button
            onClick={handleToggleServerOnline}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase transition ${
              connStatus.isServerOnline
                ? 'bg-rose-950/80 text-rose-300 border border-rose-800 hover:bg-rose-900'
                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
            }`}
            title="Simular perda de sinal / desligamento da Matriz para testar comportamento de terminais"
          >
            {connStatus.isServerOnline ? (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Desligar Matriz</span>
              </>
            ) : (
              <>
                <Wifi className="h-3 w-3" />
                <span>Reconectar Matriz</span>
              </>
            )}
          </button>
        </div>

        {/* Simulador de perspectiva de dispositivo */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-stone-400 uppercase font-semibold hidden xl:inline mr-1">
            Simular Dispositivo:
          </span>
          <button
            onClick={() => handleDeviceSwitch('adm')}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
              activeDeviceView === 'adm'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Server className="h-3 w-3" />
            <span>
              {matriz.activeHost === 'android_phone' ? 'Celular ADM (Matriz)' : 'Celular ADM (Terminal)'}
            </span>
          </button>

          <button
            onClick={() => handleDeviceSwitch('pc')}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
              activeDeviceView === 'pc'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Monitor className="h-3 w-3" />
            <span>
              {matriz.activeHost === 'windows_pc' ? 'PC Windows (Matriz)' : 'PC Windows (Terminal Balcão)'}
            </span>
          </button>

          <button
            onClick={() => handleDeviceSwitch('seller')}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
              activeDeviceView === 'seller'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            <Smartphone className="h-3 w-3" />
            <span>Terminal Garçom</span>
          </button>
        </div>
      </div>

      {/* Alerta de Bloqueio quando no Terminal PC e a Matriz estiver Indisponível */}
      {activeDeviceView === 'pc' && !connStatus.isServerOnline && matriz.activeHost === 'android_phone' && (
        <div className="flex items-center justify-between bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-md animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-200 animate-bounce" />
            <span>
              <strong>AVISO DO TERMINAL WINDOWS:</strong> A Matriz Administrativa ({matriz.activeHostLabel}) está Indisponível na Rede Local. Novas operações oficiais estão bloqueadas até a reconexão.
            </span>
          </div>
          <button
            onClick={handleToggleServerOnline}
            className="rounded bg-rose-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-900 transition flex items-center gap-1"
          >
            <RotateCw className="h-3 w-3" />
            Reconectar Matriz
          </button>
        </div>
      )}

      {/* Top Header Principal */}
      <Header
        onOpenNewTenant={handleOpenNewTenant}
        onOpenEditTenant={handleOpenEditTenant}
        onToggleSidebarMobile={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        onOpenPcAccess={() => setIsPcModalOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {currentTab === 'dashboard' && <OverviewDashboard onNavigate={setCurrentTab} />}
            {currentTab === 'server' && <LocalServerManager />}
            {currentTab === 'team' && <SellerControlPanel />}
            {currentTab === 'products' && <ProductsView />}
            {currentTab === 'tables' && (
              <TablesView
                onStartSaleForTable={(_tableNumber) => {
                  setCurrentTab('pos');
                }}
              />
            )}
            {currentTab === 'pos' && <PosView />}
            {currentTab === 'cash' && <CashRegisterView />}
            {currentTab === 'expenses' && <ExpensesView />}
            {currentTab === 'financial' && <FinancialView />}
            {currentTab === 'history' && <HistoricalArchivesView />}
            {currentTab === 'backup' && <BackupManagerView />}
            {currentTab === 'customization' && <AppCustomizationView />}
            {currentTab === 'inventory' && <InventoryView />}
            {currentTab === 'contacts' && <ContactsView />}
            {currentTab === 'settings' && (
              <SettingsView onOpenEditTenant={handleOpenEditTenant} />
            )}
            {currentTab === 'my_sales' && <MySalesView />}
          </div>
        </main>
      </div>

      {/* Barra de Navegação Inferior para Celular Android (Touch-Friendly e Adaptada ao Perfil) */}
      <nav aria-label="Navegação rápida celular" className="lg:hidden shrink-0 border-t border-stone-200 bg-white/95 px-2 py-1.5 backdrop-blur-md shadow-lg z-30">
        <div className="grid grid-cols-5 gap-1">
          {activeView === 'admin' ? (
            <>
              <button
                onClick={() => setCurrentTab('dashboard')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'dashboard'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <LayoutDashboard className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Início</span>
              </button>

              <button
                onClick={() => setCurrentTab('pos')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'pos'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <Receipt className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Vendas</span>
              </button>

              <button
                onClick={() => setCurrentTab('tables')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'tables'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <Grid2X2 className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Mesas</span>
              </button>

              <button
                onClick={() => setCurrentTab('expenses')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'expenses'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <TrendingDown className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Gastos</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setCurrentTab('my_sales')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'my_sales'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <Award className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Minhas Vendas</span>
              </button>

              <button
                onClick={() => setCurrentTab('pos')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'pos'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <Receipt className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Balcão</span>
              </button>

              <button
                onClick={() => setCurrentTab('tables')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'tables'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <Grid2X2 className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Mesas</span>
              </button>

              <button
                onClick={() => setCurrentTab('products')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'products'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <UtensilsCrossed className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Cardápio</span>
              </button>
            </>
          )}

          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold text-stone-600 hover:bg-stone-100 transition min-h-[48px] active:scale-95"
          >
            <Menu className="h-4 w-4 mb-0.5 text-stone-700" />
            <span className="truncate w-full text-center">Menu</span>
          </button>
        </div>
      </nav>

      {/* Estabelecimento Modal */}
      <TenantModal
        isOpen={isTenantModalOpen}
        onClose={() => setIsTenantModalOpen(false)}
        mode={tenantModalMode}
      />

      {/* Modal de Acesso pelo Navegador do PC (Servidor Local Wi-Fi) */}
      <PcBrowserAccessModal
        isOpen={isPcModalOpen}
        onClose={() => setIsPcModalOpen(false)}
        onSwitchToPcView={() => handleDeviceSwitch('pc')}
      />
    </div>
  );
};

export default function App() {
  return (
    <TenantProvider>
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </TenantProvider>
  );
}
