/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserRole, OrderStatus, TableStatus } from '../types';

export function formatBRL(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return 'R$ 0,00';
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function parseBRL(valueStr: string): number {
  if (!valueStr) return 0;
  const clean = valueStr.replace(/[^\d,-]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export function formatDateBR(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

export function formatDateTimeBR(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeBR(dateInput?: string | Date | null): string {
  if (!dateInput) return '--:--';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function calcProfitMargin(costPrice: number, sellingPrice: number): number {
  if (!sellingPrice || sellingPrice <= 0) return 0;
  return Math.round(((sellingPrice - (costPrice || 0)) / sellingPrice) * 100);
}

export function getRoleName(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Administrador';
    case 'manager':
      return 'Gerente';
    case 'cashier':
      return 'Operador de Caixa';
    case 'waiter':
      return 'Garçom / Atendente';
    default:
      return role;
  }
}

export function getOrderStatusLabel(status: OrderStatus): { label: string; color: string } {
  switch (status) {
    case 'received':
      return { label: 'Recebido', color: 'bg-amber-100 text-amber-800 border-amber-300' };
    case 'preparing':
      return { label: 'Em Preparo', color: 'bg-blue-100 text-blue-800 border-blue-300' };
    case 'ready':
      return { label: 'Pronto', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
    case 'closed':
      return { label: 'Finalizado', color: 'bg-gray-100 text-gray-800 border-gray-300' };
    case 'cancelled':
      return { label: 'Cancelado', color: 'bg-rose-100 text-rose-800 border-rose-300' };
    default:
      return { label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' };
  }
}

export function getTableStatusLabel(status: TableStatus): { label: string; badgeClass: string; cardClass: string } {
  switch (status) {
    case 'available':
      return {
        label: 'Livre',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        cardClass: 'border-emerald-200 hover:border-emerald-400 bg-white',
      };
    case 'occupied':
      return {
        label: 'Ocupada',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        cardClass: 'border-amber-300 hover:border-amber-400 bg-amber-50/40',
      };
    case 'reserved':
      return {
        label: 'Reservada',
        badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        cardClass: 'border-indigo-200 hover:border-indigo-400 bg-indigo-50/40',
      };
    case 'closing':
      return {
        label: 'Fechando Conta',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        cardClass: 'border-rose-300 hover:border-rose-400 bg-rose-50/40',
      };
    default:
      return {
        label: status,
        badgeClass: 'bg-gray-100 text-gray-800 border-gray-300',
        cardClass: 'border-gray-200 bg-white',
      };
  }
}

export function formatDocumentBR(doc: string): string {
  const clean = (doc || '').replace(/\D/g, '');
  if (clean.length === 11) {
    // CPF
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (clean.length === 14) {
    // CNPJ
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return doc || '';
}

export function formatPhoneBR(phone: string): string {
  const clean = (phone || '').replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (clean.length === 10) {
    return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone || '';
}
