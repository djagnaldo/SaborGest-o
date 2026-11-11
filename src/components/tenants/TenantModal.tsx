/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Building2, X, Save, Percent, MapPin, Phone, FileText } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { Tenant, EstablishmentSegment } from '../../types';

interface TenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
}

export const TenantModal: React.FC<TenantModalProps> = ({ isOpen, onClose, mode }) => {
  const { currentTenant, createTenant, updateTenant } = useTenant();

  const [formData, setFormData] = useState({
    name: '',
    tradeName: '',
    document: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    segment: 'hamburgueria' as EstablishmentSegment,
    serviceFeePercentage: 10,
    allowNegativeStock: false,
    printAutoOnOrder: true,
    requireTableWaiter: true,
  });

  useEffect(() => {
    if (mode === 'edit' && currentTenant) {
      setFormData({
        name: currentTenant.name || '',
        tradeName: currentTenant.tradeName || '',
        document: currentTenant.document || '',
        phone: currentTenant.phone || '',
        address: currentTenant.address || '',
        city: currentTenant.settings?.city || '',
        state: currentTenant.settings?.state || '',
        segment: currentTenant.segment || 'restaurante',
        serviceFeePercentage: currentTenant.settings?.serviceFeePercentage ?? 10,
        allowNegativeStock: currentTenant.settings?.allowNegativeStock ?? false,
        printAutoOnOrder: currentTenant.settings?.printAutoOnOrder ?? true,
        requireTableWaiter: currentTenant.settings?.requireTableWaiter ?? true,
      });
    } else {
      setFormData({
        name: '',
        tradeName: '',
        document: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        segment: 'restaurante',
        serviceFeePercentage: 10,
        allowNegativeStock: false,
        printAutoOnOrder: true,
        requireTableWaiter: true,
      });
    }
  }, [mode, currentTenant, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    if (mode === 'create') {
      createTenant({
        name: formData.name,
        tradeName: formData.tradeName || formData.name,
        document: formData.document,
        phone: formData.phone,
        address: `${formData.address}${formData.city ? ` - ${formData.city}/${formData.state}` : ''}`,
        segment: formData.segment,
      });
    } else if (currentTenant) {
      const updated: Tenant = {
        ...currentTenant,
        name: formData.name,
        tradeName: formData.tradeName || formData.name,
        document: formData.document,
        phone: formData.phone,
        address: formData.address,
        segment: formData.segment,
        settings: {
          ...currentTenant.settings,
          serviceFeePercentage: Number(formData.serviceFeePercentage),
          allowNegativeStock: formData.allowNegativeStock,
          printAutoOnOrder: formData.printAutoOnOrder,
          requireTableWaiter: formData.requireTableWaiter,
          city: formData.city,
          state: formData.state,
          phone: formData.phone,
        },
      };
      updateTenant(updated);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900">
                {mode === 'create' ? 'Cadastrar Novo Estabelecimento' : 'Configurações do Estabelecimento'}
              </h3>
              <p className="text-[11px] text-stone-500">
                Gerenciamento multi-loja e preferências operacionais
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700">Nome Fantasia *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Bar do Zé"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Razão Social</label>
              <input
                type="text"
                value={formData.tradeName}
                onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                placeholder="Ex: José Alimentos ME"
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Segmento Principal</label>
              <select
                value={formData.segment}
                onChange={(e) => setFormData({ ...formData, segment: e.target.value as EstablishmentSegment })}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
              >
                <option value="restaurante">Restaurante</option>
                <option value="bar">Bar & Pub</option>
                <option value="hamburgueria">Hamburgueria Artesanal</option>
                <option value="pizzaria">Pizzaria</option>
                <option value="lanchonete">Lanchonete / Fast Food</option>
                <option value="cafeteria">Cafeteria / Confeitaria</option>
                <option value="outro">Outro Estabelecimento</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">CNPJ ou CPF</label>
              <div className="relative mt-1">
                <FileText className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
                <input
                  type="text"
                  value={formData.document}
                  onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                  placeholder="00.000.000/0001-00"
                  className="w-full rounded-xl border border-stone-200 py-2 pl-8 pr-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Telefone / WhatsApp</label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 98765-4321"
                  className="w-full rounded-xl border border-stone-200 py-2 pl-8 pr-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Taxa de Serviço (%)</label>
              <div className="relative mt-1">
                <Percent className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  value={formData.serviceFeePercentage}
                  onChange={(e) => setFormData({ ...formData, serviceFeePercentage: Number(e.target.value) })}
                  className="w-full rounded-xl border border-stone-200 py-2 pl-8 pr-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Endereço Completo</label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3 top-2.5 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Rua, número, bairro..."
                className="w-full rounded-xl border border-stone-200 py-2 pl-8 pr-3 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 space-y-2.5">
            <span className="block text-xs font-bold uppercase tracking-wider text-stone-600">
              Regras Operacionais
            </span>

            <label className="flex items-center gap-2.5 text-xs text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.allowNegativeStock}
                onChange={(e) => setFormData({ ...formData, allowNegativeStock: e.target.checked })}
                className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
              />
              <span>Permitir venda quando produto estiver com estoque zerado/negativo</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requireTableWaiter}
                onChange={(e) => setFormData({ ...formData, requireTableWaiter: e.target.checked })}
                className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
              />
              <span>Exigir garçom identificado ao abrir comandas e mesas</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-stone-800 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.printAutoOnOrder}
                onChange={(e) => setFormData({ ...formData, printAutoOnOrder: e.target.checked })}
                className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
              />
              <span>Habilitar geração de comprovante / impressão ao fechar pedido</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-stone-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition"
            >
              <Save className="h-3.5 w-3.5" />
              {mode === 'create' ? 'Cadastrar Estabelecimento' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
