/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Tenant, EstablishmentSegment } from '../types';
import {
  initLocalStorage,
  getTenants,
  saveTenant,
  getActiveTenantId,
  setActiveTenantId,
  removeDemoData,
  reloadDemoData,
  addAuditLog,
} from '../services/storage';

interface TenantContextType {
  currentTenant: Tenant;
  tenants: Tenant[];
  isLoading: boolean;
  switchTenant: (id: string) => void;
  createTenant: (data: {
    name: string;
    tradeName?: string;
    document: string;
    phone: string;
    address: string;
    segment: EstablishmentSegment;
    ownerEmail?: string;
  }) => Tenant;
  updateTenant: (tenant: Tenant) => void;
  clearTenantDemoData: () => void;
  reloadTenantDemoData: () => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initLocalStorage();
    const storedTenants = getTenants();
    const activeId = getActiveTenantId();
    setTenants(storedTenants);
    
    // Ensure active tenant exists
    const found = storedTenants.find((t) => t.id === activeId);
    if (found) {
      setCurrentTenantId(found.id);
    } else if (storedTenants.length > 0) {
      setCurrentTenantId(storedTenants[0].id);
      setActiveTenantId(storedTenants[0].id);
    }
    setIsLoading(false);
  }, []);

  const switchTenant = (id: string) => {
    const target = tenants.find((t) => t.id === id);
    if (target) {
      setCurrentTenantId(id);
      setActiveTenantId(id);
      addAuditLog({
        tenantId: id,
        userId: 'system',
        userName: 'Sistema',
        action: 'TROCA_ESTABELECIMENTO',
        details: `Alternou para o estabelecimento: ${target.name}`,
      });
    }
  };

  const createTenant = (data: {
    name: string;
    tradeName?: string;
    document: string;
    phone: string;
    address: string;
    segment: EstablishmentSegment;
    ownerEmail?: string;
  }): Tenant => {
    const newTenant: Tenant = {
      id: `tenant-${Date.now()}`,
      name: data.name,
      tradeName: data.tradeName || data.name,
      document: data.document,
      phone: data.phone,
      address: data.address,
      segment: data.segment,
      ownerId: `owner-${Date.now()}`,
      ownerEmail: data.ownerEmail || 'admin@sabor.com.br',
      settings: {
        allowNegativeStock: false,
        serviceFeePercentage: 10,
        printAutoOnOrder: true,
        requireTableWaiter: true,
        currency: 'BRL',
        address: data.address,
        phone: data.phone,
      },
      createdAt: new Date().toISOString(),
      isDemo: false,
    };

    saveTenant(newTenant);
    const updated = getTenants();
    setTenants(updated);
    switchTenant(newTenant.id);
    return newTenant;
  };

  const updateTenant = (tenant: Tenant) => {
    saveTenant(tenant);
    const updated = getTenants();
    setTenants(updated);
  };

  const clearTenantDemoData = () => {
    if (!currentTenantId) return;
    removeDemoData(currentTenantId);
  };

  const reloadTenantDemoData = () => {
    if (!currentTenantId) return;
    reloadDemoData(currentTenantId);
  };

  const currentTenant = tenants.find((t) => t.id === currentTenantId) || tenants[0] || {
    id: 'default',
    name: 'Carregando...',
    tradeName: 'Carregando...',
    document: '',
    phone: '',
    address: '',
    segment: 'restaurante' as EstablishmentSegment,
    ownerId: '',
    ownerEmail: '',
    settings: {
      allowNegativeStock: false,
      serviceFeePercentage: 10,
      printAutoOnOrder: false,
      requireTableWaiter: false,
      currency: 'BRL',
    },
    createdAt: new Date().toISOString(),
  };

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        tenants,
        isLoading,
        switchTenant,
        createTenant,
        updateTenant,
        clearTenantDemoData,
        reloadTenantDemoData,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant deve ser usado dentro de um TenantProvider');
  }
  return context;
};
