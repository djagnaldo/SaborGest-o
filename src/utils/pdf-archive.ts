/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import type {
  ArchivedPeriodPdf,
  CashRegisterSession,
  FinancialTransaction,
  InventoryTransaction,
  Order,
  Tenant,
} from '../types';
import { formatBRL, formatDateTimeBR } from './formatters';

export const ARCHIVE_PDF_DISCLAIMER =
  'DOCUMENTO SOMENTE PARA ARQUIVAMENTO E CONSULTA HISTÓRICA — NÃO É BACKUP RESTAURÁVEL DO SISTEMA.';

export function validateArchivePeriod(startDate: string, endDate: string): {
  valid: boolean;
  days: number;
  error?: string;
} {
  if (!startDate || !endDate) {
    return { valid: false, days: 0, error: 'Selecione a data inicial e a data final.' };
  }
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { valid: false, days: 0, error: 'Datas inválidas para o período.' };
  }
  if (end.getTime() < start.getTime()) {
    return { valid: false, days: 0, error: 'A data final deve ser igual ou posterior à data inicial.' };
  }
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  return { valid: true, days };
}

function getOrderProductsTotal(order: Order): number {
  const extra = Number(order.extraTotal || 0);
  const sub = Number(order.subtotal || 0);
  if (sub > 0) return sub;
  return Math.max(0, Number(order.total || 0) - extra);
}

export function buildHistoricalPeriodPdf(params: {
  tenant: Tenant;
  periodStart: string;
  periodEnd: string;
  orders: Order[];
  financial: FinancialTransaction[];
  inventoryTransactions: InventoryTransaction[];
  cashSessions?: CashRegisterSession[];
  generatedBy: { id: string; name: string };
}): ArchivedPeriodPdf {
  const {
    tenant,
    periodStart,
    periodEnd,
    orders,
    financial,
    inventoryTransactions,
    cashSessions = [],
    generatedBy,
  } = params;
  const startMs = new Date(`${periodStart}T00:00:00`).getTime();
  const endMs = new Date(`${periodEnd}T23:59:59`).getTime();

  const periodOrders = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= startMs && t <= endMs && o.status !== 'cancelled';
  });
  const periodFinancial = financial.filter((f) => {
    const t = new Date(f.date || f.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });
  const periodInventory = inventoryTransactions.filter((m) => {
    const t = new Date(m.createdAt).getTime();
    return t >= startMs && t <= endMs;
  });
  const periodCash = cashSessions.filter((c) => {
    const t = new Date(c.openedAt).getTime();
    return t >= startMs && t <= endMs;
  });

  const paidOrders = periodOrders.filter((o) => o.paid);
  const totalRevenue = Number(
    paidOrders.reduce((acc, o) => acc + getOrderProductsTotal(o), 0).toFixed(2)
  );
  const cashTotal = Number(
    paidOrders
      .flatMap((o) => o.payments || [])
      .filter((p) => p.method === 'dinheiro')
      .reduce((acc, p) => acc + Number(p.amount || 0), 0)
      .toFixed(2)
  );
  const pixTotal = Number(
    paidOrders
      .flatMap((o) => o.payments || [])
      .filter((p) => p.method === 'pix')
      .reduce((acc, p) => acc + Number(p.amount || 0), 0)
      .toFixed(2)
  );

  const receiptsList = periodFinancial.filter(
    (f) => f.type === 'revenue' || f.type === 'deposit'
  );
  const otherReceiptsTotal = Number(
    receiptsList.reduce((acc, f) => acc + Number(f.amount || 0), 0).toFixed(2)
  );

  const expensesList = periodFinancial.filter(
    (f) => f.type === 'expense_fixed' || f.type === 'expense_variable' || f.type === 'withdrawal'
  );
  const expensesTotal = Number(
    expensesList.reduce((acc, f) => acc + Number(f.amount || 0), 0).toFixed(2)
  );

  const itemsSoldCount = periodOrders
    .flatMap((o) => o.items || [])
    .reduce((acc, it) => acc + Number(it.quantity || 0), 0);
  const netResult = Number((totalRevenue + otherReceiptsTotal - expensesTotal).toFixed(2));

  // Agregação de produtos vendidos (nome, quantidade, receita)
  const productAgg = new Map<string, { name: string; qty: number; total: number }>();
  for (const ord of periodOrders) {
    for (const it of ord.items || []) {
      const key = it.productId || it.productName;
      const prev = productAgg.get(key) || { name: it.productName, qty: 0, total: 0 };
      prev.qty += Number(it.quantity || 0);
      prev.total += Number(it.total || it.unitPrice * it.quantity || 0);
      productAgg.set(key, prev);
    }
  }
  const topProducts = Array.from(productAgg.values()).sort((a, b) => b.qty - a.qty);

  // Agregação por vendedor responsável
  const sellerAgg = new Map<string, { name: string; ordersCount: number; total: number }>();
  for (const ord of periodOrders) {
    const sellerName = ord.waiterName || ord.createdByName || 'Matriz ADM';
    const key = ord.waiterId || ord.createdById || sellerName;
    const prev = sellerAgg.get(key) || { name: sellerName, ordersCount: 0, total: 0 };
    prev.ordersCount += 1;
    prev.total += Number(ord.total || 0);
    sellerAgg.set(key, prev);
  }
  const sellersSummary = Array.from(sellerAgg.values()).sort((a, b) => b.total - a.total);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  const ensureSpace = (needed = 10) => {
    if (y + needed > 280) {
      doc.addPage();
      y = 16;
    }
  };

  // Cabeçalho Oficial
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SABORGESTAO - RELATORIO HISTORICO DO PERIODO', margin, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Estabelecimento: ${tenant.name}${tenant.document ? ` (${tenant.document})` : ''}`, margin, y);
  y += 4.5;
  doc.text(`Periodo abrangido: ${periodStart} ate ${periodEnd}`, margin, y);
  y += 4.5;
  doc.text(`Gerado em: ${formatDateTimeBR(new Date())} por ${generatedBy.name} (ADM)`, margin, y);
  y += 6;

  // Aviso obrigatório
  doc.setFillColor(254, 243, 199);
  doc.rect(margin, y, pageWidth - margin * 2, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(ARCHIVE_PDF_DISCLAIMER, margin + 2.5, y + 5.8);
  y += 14;

  // 1. Resumo Financeiro
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. RESUMO FINANCEIRO E TOTAIS DO PERIODO', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const summaryLines = [
    `Vendas concluidas / pagas: ${paidOrders.length} (Total de pedidos: ${periodOrders.length})`,
    `Quantidade total de itens vendidos: ${Number(itemsSoldCount.toFixed(2))}`,
    `Receita de Vendas (Produtos): ${formatBRL(totalRevenue)}`,
    `Recebimentos em Dinheiro: ${formatBRL(cashTotal)} | Recebimentos em PIX: ${formatBRL(pixTotal)}`,
    `Outros Recebimentos / Suprimentos: ${formatBRL(otherReceiptsTotal)} (${receiptsList.length} lancamentos)`,
    `Gastos / Despesas e Sangrias: ${formatBRL(expensesTotal)} (${expensesList.length} lancamentos)`,
    `Resultado Liquido do Periodo: ${formatBRL(netResult)}`,
    `Sessoes de Caixa: ${periodCash.length} | Movimentacoes de Estoque: ${periodInventory.length}`,
  ];
  summaryLines.forEach((line) => {
    ensureSpace(6);
    doc.text(`- ${line}`, margin + 2, y);
    y += 5;
  });
  y += 3;

  // 2. Produtos e Quantidades Vendidos
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. PRODUTOS E QUANTIDADES VENDIDOS', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (topProducts.length === 0) {
    doc.text('Nenhum item vendido neste intervalo.', margin + 2, y);
    y += 6;
  } else {
    topProducts.slice(0, 100).forEach((p) => {
      ensureSpace(5);
      doc.text(
        `- ${p.name}: ${Number(p.qty.toFixed(2))} un/qtd | Subtotal: ${formatBRL(p.total)}`.slice(0, 108),
        margin + 2,
        y
      );
      y += 4.3;
    });
  }
  y += 3;

  // 3. Vendedores Responsáveis
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('3. VENDEDORES RESPONSAVEIS NO PERIODO', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (sellersSummary.length === 0) {
    doc.text('Nenhuma venda por vendedor registrada neste periodo.', margin + 2, y);
    y += 6;
  } else {
    sellersSummary.forEach((s) => {
      ensureSpace(5);
      doc.text(
        `- ${s.name}: ${s.ordersCount} pedido(s) | Total movimentado: ${formatBRL(s.total)}`.slice(0, 108),
        margin + 2,
        y
      );
      y += 4.3;
    });
  }
  y += 3;

  // 4. Vendas Realizadas (Detalhamento)
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('4. VENDAS REALIZADAS (MESA / BALCAO)', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (periodOrders.length === 0) {
    doc.text('Nenhuma venda registrada neste intervalo de datas.', margin + 2, y);
    y += 6;
  } else {
    periodOrders.slice(0, 120).forEach((ord) => {
      ensureSpace(11);
      const modality = ord.type === 'table' ? ord.tableName || `Mesa ${ord.tableNumber || ''}` : 'Balcao';
      const seller = ord.waiterName || ord.createdByName || 'Matriz';
      const headerLine = `#${ord.orderNumber} | ${formatDateTimeBR(ord.createdAt)} | ${modality} | Vendedor: ${seller} | Total: ${formatBRL(ord.total)}`;
      doc.setFont('helvetica', 'bold');
      doc.text(headerLine.slice(0, 108), margin + 2, y);
      y += 4.2;

      doc.setFont('helvetica', 'normal');
      const itemsSummary = (ord.items || [])
        .map((it) => `${it.quantity}x ${it.productName}${it.addedByName ? ` (${it.addedByName})` : ''}`)
        .join(', ');
      const wrapped = doc.splitTextToSize(`   Itens: ${itemsSummary || '-'}`, pageWidth - margin * 2 - 4);
      wrapped.slice(0, 3).forEach((wLine: string) => {
        ensureSpace(5);
        doc.text(wLine, margin + 2, y);
        y += 3.9;
      });
      y += 1.5;
    });
  }
  y += 3;

  // 5. Movimentações de Caixa
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('5. MOVIMENTACOES E SESSOES DE CAIXA', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (periodCash.length === 0) {
    doc.text('Nenhuma sessao de caixa registrada neste intervalo.', margin + 2, y);
    y += 6;
  } else {
    periodCash.slice(0, 60).forEach((cs) => {
      ensureSpace(6);
      const statusLabel = cs.status === 'open' ? 'Aberto' : 'Fechado';
      const salesTotal = (cs.totalCash || 0) + (cs.totalPix || 0);
      const line = `${formatDateTimeBR(cs.openedAt)} | ${cs.openedByName} | ${statusLabel} | Abertura: ${formatBRL(cs.initialAmount)} | Vendas: ${formatBRL(salesTotal)} | Esperado: ${formatBRL(cs.expectedAmount)}`;
      doc.text(line.slice(0, 108), margin + 2, y);
      y += 4.5;
    });
  }
  y += 3;

  // 6. Gastos e Recebimentos
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('6. GASTOS E RECEBIMENTOS FINANCEIROS', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (periodFinancial.length === 0) {
    doc.text('Nenhum lancamento financeiro neste intervalo.', margin + 2, y);
    y += 6;
  } else {
    periodFinancial.slice(0, 120).forEach((fin) => {
      ensureSpace(6);
      const kind =
        fin.type === 'revenue' || fin.type === 'deposit' ? 'RECEBIMENTO' : 'GASTO/SAIDA';
      const line = `${formatDateTimeBR(fin.date || fin.createdAt)} | ${kind} | ${fin.category} | ${fin.description} | ${formatBRL(fin.amount)}`;
      doc.text(line.slice(0, 108), margin + 2, y);
      y += 4.5;
    });
  }
  y += 3;

  // 7. Movimentações de Estoque
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('7. MOVIMENTACOES DE ESTOQUE', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (periodInventory.length === 0) {
    doc.text('Nenhuma movimentacao de estoque neste intervalo.', margin + 2, y);
    y += 6;
  } else {
    periodInventory.slice(0, 100).forEach((inv) => {
      ensureSpace(6);
      const line = `${formatDateTimeBR(inv.createdAt)} | ${inv.type.toUpperCase()} | ${inv.productName} | Qtd: ${inv.quantity} (${inv.previousStock} -> ${inv.newStock}) | ${inv.userName}`;
      doc.text(line.slice(0, 108), margin + 2, y);
      y += 4.5;
    });
  }

  // Rodapé na última página
  ensureSpace(12);
  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(ARCHIVE_PDF_DISCLAIMER, margin, y);

  const dataUri = doc.output('datauristring');
  const pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
  const approxSizeBytes = Math.floor((pdfBase64.length * 3) / 4);
  const safeTenant = tenant.name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 24) || 'estabelecimento';

  return {
    id: `PDF-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    tenantId: tenant.id,
    fileName: `SaborGestao_Historico_${safeTenant}_${periodStart}_a_${periodEnd}.pdf`,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    generatedById: generatedBy.id,
    generatedByName: generatedBy.name,
    establishmentName: tenant.name,
    establishmentDocument: tenant.document,
    restorable: false,
    disclaimer: ARCHIVE_PDF_DISCLAIMER,
    pdfBase64,
    sizeBytes: approxSizeBytes,
    summary: {
      ordersCount: periodOrders.length,
      itemsSoldCount: Number(itemsSoldCount.toFixed(2)),
      totalRevenue,
      cashTotal,
      pixTotal,
      otherReceiptsTotal,
      expensesTotal,
      netResult,
      stockMovementsCount: periodInventory.length,
      cashSessionsCount: periodCash.length,
    },
  };
}

export function downloadArchivedPdf(record: ArchivedPeriodPdf): void {
  const binary = atob(record.pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = record.fileName || `arquivo_${record.periodStart}_${record.periodEnd}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
