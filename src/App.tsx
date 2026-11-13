/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TenantProvider } from './contexts/TenantContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Header } from './components/layout/Header';
import { Sidebar, ActiveTab } from './components/layout/Sidebar';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { LocalServerManager } from './components/server/LocalServerManager';
import { SellerControlPanel } from './components/team/SellerControlPanel';
import { WebPortalGate } from './components/server/WebPortalGate';
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
import { TenantModal } from './components/tenants/TenantModal';
import { initLocalDatabase } from './services/local-db';
import {
  Grid2X2,
  Receipt,
  ShoppingBag,
  Menu,
  Award,
  LayoutDashboard,
} from 'lucide-react';

const AppContent: React.FC = () => {
  const { activeView, isWebPortal, webPortalAuth } = useAuth();
  const [currentTab, setCurrentTab] = useState<ActiveTab>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [tenantModalMode, setTenantModalMode] = useState<'create' | 'edit'>('create');
  const [preselectedTableNumber, setPreselectedTableNumber] = useState<number | null>(null);

  useEffect(() => {
    initLocalDatabase();
  }, []);

  // Garante rota segura quando operador muda para Visão do Vendedor
  useEffect(() => {
    if (activeView === 'vendedor') {
      const allowedSellerTabs: ActiveTab[] = ['my_sales', 'counter', 'tables', 'pos', 'products'];
      if (!allowedSellerTabs.includes(currentTab)) {
        setCurrentTab('my_sales');
      }
    }
  }, [activeView, currentTab]);

  // Se estiver no portal web (?portal=web) sem sessão autenticada via chave, exibe tela de login exclusiva
  if (isWebPortal && !webPortalAuth) {
    return <WebPortalGate />;
  }

  const handleOpenNewTenant = () => {
    setTenantModalMode('create');
    setIsTenantModalOpen(true);
  };

  const handleOpenEditTenant = () => {
    setTenantModalMode('edit');
    setIsTenantModalOpen(true);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-stone-100 font-sans text-stone-900 antialiased overflow-hidden">
      {/* Header Simplificado (Marca + Menu Mobile + Notificações) */}
      <Header onToggleSidebarMobile={() => setMobileSidebarOpen(!mobileSidebarOpen)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onOpenNewTenant={handleOpenNewTenant}
          onOpenEditTenant={handleOpenEditTenant}
        />

        {/* Área Principal de Conteúdo */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-4">

            {currentTab === 'dashboard' && <OverviewDashboard onNavigate={setCurrentTab} />}
            {currentTab === 'server' && <LocalServerManager />}
            {currentTab === 'team' && <SellerControlPanel />}
            {currentTab === 'products' && <ProductsView />}
            {currentTab === 'tables' && (
              <TablesView
                onStartSaleForTable={(tableNumber) => {
                  setPreselectedTableNumber(tableNumber);
                  setCurrentTab('pos');
                }}
                onGoToSales={() => setCurrentTab('pos')}
              />
            )}
            {currentTab === 'pos' && (
              <PosView
                mode="sales"
                preselectedTableNumber={preselectedTableNumber}
                onConsumePreselectedTable={() => setPreselectedTableNumber(null)}
                onNavigateToTables={() => setCurrentTab('tables')}
                onNavigateToCounter={() => setCurrentTab('counter')}
              />
            )}
            {currentTab === 'counter' && (
              <PosView
                mode="counter"
                onNavigateToTables={() => setCurrentTab('tables')}
              />
            )}
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

      {/* Barra de Navegação Inferior Touch-Friendly (Celular / Tablet) */}
      <nav
        aria-label="Navegação principal"
        className="lg:hidden shrink-0 border-t border-stone-200 bg-white/95 px-2 py-1.5 safe-bottom backdrop-blur-md shadow-lg z-30"
      >
        <div className="grid grid-cols-5 gap-1">
          {activeView === 'admin' ? (
            <>
              <button
                type="button"
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
                type="button"
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
                type="button"
                onClick={() => setCurrentTab('counter')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'counter'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <ShoppingBag className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Balcão</span>
              </button>

              <button
                type="button"
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
            </>
          ) : (
            <>
              <button
                type="button"
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
                type="button"
                onClick={() => setCurrentTab('counter')}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-h-[48px] ${
                  currentTab === 'counter'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:bg-stone-100 active:scale-95'
                }`}
              >
                <ShoppingBag className="h-4 w-4 mb-0.5" />
                <span className="truncate w-full text-center">Balcão</span>
              </button>

              <button
                type="button"
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
                type="button"
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
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold text-stone-600 hover:bg-stone-100 transition min-h-[48px] active:scale-95"
          >
            <Menu className="h-4 w-4 mb-0.5 text-stone-700" />
            <span className="truncate w-full text-center">Menu</span>
          </button>
        </div>
      </nav>

      {/* Modais Globais */}
      <TenantModal
        isOpen={isTenantModalOpen}
        onClose={() => setIsTenantModalOpen(false)}
        mode={tenantModalMode}
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
