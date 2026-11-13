/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { X, Plus, Minus, Scale, AlertCircle, Check } from 'lucide-react';
import { formatCurrencyBR as formatCurrency } from '../../utils/formatters';

interface QuantitySelectorModalProps {
  product: Product | null;
  allowNegativeStock?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (payload: {
    product: Product;
    quantity: number;
    variationName?: string;
    selectedAddons?: { name: string; price: number }[];
    notes?: string;
    unitPrice: number;
  }) => void;
}

export const QuantitySelectorModal: React.FC<QuantitySelectorModalProps> = ({
  product,
  allowNegativeStock = false,
  confirmLabel = 'Adicionar ao Pedido',
  onClose,
  onConfirm,
}) => {
  const isWeightProduct = Boolean(
    product && (product.allowWeight || product.unit === 'kg' || product.unit === 'g')
  );

  const [quantity, setQuantity] = useState<number>(1);
  const [weightInput, setWeightInput] = useState<string>('0.500');
  const [selectedVariation, setSelectedVariation] = useState<string>('');
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    setError(null);
    setNotes('');
    setSelectedAddonIds([]);
    setSelectedVariation(product.variations?.[0]?.name || '');

    if (product.allowWeight || product.unit === 'kg') {
      const defaultWeight = product.stockQuantity > 0 && product.stockQuantity < 0.5 ? product.stockQuantity : 0.5;
      setQuantity(defaultWeight);
      setWeightInput(defaultWeight.toFixed(3));
    } else if (product.unit === 'g') {
      setQuantity(250);
      setWeightInput('250');
    } else {
      setQuantity(1);
    }
  }, [product]);

  if (!product) return null;

  const basePrice =
    selectedVariation && product.variations?.length
      ? product.variations.find((v) => v.name === selectedVariation)?.price ?? product.sellingPrice
      : product.sellingPrice;

  const selectedAddons = (product.addons || [])
    .filter((a) => selectedAddonIds.includes(a.id))
    .map((a) => ({ name: a.name, price: a.price }));

  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const unitPrice = Number((basePrice + addonsTotal).toFixed(2));
  const totalPrice = Number((unitPrice * quantity).toFixed(2));
  const maxStock = product.stockQuantity ?? 0;

  const handleStep = (delta: number) => {
    setError(null);
    const step = isWeightProduct && product.unit === 'kg' ? 0.1 : isWeightProduct && product.unit === 'g' ? 50 : 1;
    const rawNext = Number((quantity + delta * step).toFixed(3));
    const minVal = isWeightProduct && product.unit === 'kg' ? 0.05 : isWeightProduct && product.unit === 'g' ? 10 : 1;
    const clamped = Math.max(minVal, rawNext);
    if (!allowNegativeStock && clamped > maxStock) {
      setError(`Estoque máximo disponível: ${maxStock} ${product.unit}.`);
      return;
    }
    setQuantity(clamped);
    if (isWeightProduct) {
      setWeightInput(product.unit === 'kg' ? clamped.toFixed(3) : String(Math.round(clamped)));
    }
  };

  const handleWeightTextChange = (val: string) => {
    setError(null);
    setWeightInput(val);
    const parsed = parseFloat(val.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      setQuantity(parsed);
    }
  };

  const handleQuickWeight = (val: number) => {
    setError(null);
    if (!allowNegativeStock && val > maxStock) {
      setError(`Estoque disponível: ${maxStock} ${product.unit}.`);
      return;
    }
    setQuantity(val);
    setWeightInput(product.unit === 'kg' ? val.toFixed(3) : String(val));
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || quantity <= 0) {
      setError('Informe uma quantidade válida maior que zero.');
      return;
    }
    if (!allowNegativeStock && quantity > maxStock) {
      setError(`Estoque insuficiente. Disponível: ${maxStock} ${product.unit}.`);
      return;
    }

    onConfirm({
      product,
      quantity,
      variationName: selectedVariation || undefined,
      selectedAddons: selectedAddons.length > 0 ? selectedAddons : undefined,
      notes: notes.trim() || undefined,
      unitPrice,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-950/60 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-stone-200 overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-200 bg-stone-50">
          <div className="flex items-center gap-3 min-w-0">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-14 h-14 rounded-xl object-cover shrink-0 border border-stone-200"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-stone-200 flex items-center justify-center shrink-0 text-stone-500 font-bold">
                {product.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-bold text-stone-900 leading-snug line-clamp-2">
                {product.name}
              </h3>
              <p className="text-sm font-semibold text-amber-600 tabular-nums mt-0.5">
                {formatCurrency(unitPrice)} / {product.unit}
              </p>
              <p className="text-xs text-stone-500 tabular-nums">
                Estoque disponível: {maxStock} {product.unit}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar seleção"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-500 hover:bg-stone-200/70 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleConfirm} className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Variations */}
          {product.variations && product.variations.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Tamanho / Opção
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.variations.map((v) => {
                  const active = selectedVariation === v.name;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariation(v.name)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        active
                          ? 'border-amber-600 bg-amber-50 text-stone-900 font-semibold'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      <span className="text-sm truncate">{v.name}</span>
                      <span className="text-xs font-bold tabular-nums text-amber-700 shrink-0">
                        {formatCurrency(v.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Addons */}
          {product.addons && product.addons.length > 0 && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Adicionais
              </label>
              <div className="space-y-2">
                {product.addons.map((addon) => {
                  const checked = selectedAddonIds.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() =>
                        setSelectedAddonIds((prev) =>
                          checked ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                        )
                      }
                      className={`w-full min-h-[44px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                        checked
                          ? 'border-amber-600 bg-amber-50 text-stone-900'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span
                          className={`w-5 h-5 rounded flex items-center justify-center border ${
                            checked
                              ? 'bg-amber-600 border-amber-600 text-white'
                              : 'border-stone-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </span>
                        {addon.name}
                      </span>
                      <span className="text-xs font-bold tabular-nums text-stone-700">
                        + {formatCurrency(addon.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity or Weight */}
          {isWeightProduct ? (
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-amber-600" />
                  Pesagem na Balança ({product.unit})
                </span>
                <span className="text-xs text-stone-500 tabular-nums">
                  {formatCurrency(unitPrice)} / {product.unit}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleStep(-1)}
                  className="min-w-[48px] min-h-[48px] rounded-xl bg-white border border-stone-300 flex items-center justify-center text-stone-800 hover:bg-stone-100 cursor-pointer"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <div className="flex-1 relative">
                  <input
                    type="number"
                    step={product.unit === 'kg' ? '0.005' : '1'}
                    min="0.001"
                    value={weightInput}
                    onChange={(e) => handleWeightTextChange(e.target.value)}
                    className="w-full min-h-[48px] text-center text-xl font-bold tabular-nums bg-white border border-stone-300 rounded-xl px-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400 uppercase">
                    {product.unit}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  className="min-w-[48px] min-h-[48px] rounded-xl bg-white border border-stone-300 flex items-center justify-center text-stone-800 hover:bg-stone-100 cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(product.unit === 'kg'
                  ? [
                      { label: '150g', val: 0.15 },
                      { label: '300g', val: 0.3 },
                      { label: '500g', val: 0.5 },
                      { label: '1 kg', val: 1.0 },
                    ]
                  : [
                      { label: '100g', val: 100 },
                      { label: '250g', val: 250 },
                      { label: '500g', val: 500 },
                      { label: '1000g', val: 1000 },
                    ]
                ).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleQuickWeight(preset.val)}
                    className="min-h-[40px] rounded-lg border border-stone-200 bg-white text-xs font-bold text-stone-700 hover:border-amber-500 hover:text-amber-700 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Quantidade ({product.unit})
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleStep(-1)}
                  aria-label="Diminuir quantidade"
                  className="min-w-[52px] min-h-[52px] rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-800 hover:bg-stone-200 active:scale-95 transition-all cursor-pointer"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => {
                    setError(null);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) setQuantity(val);
                  }}
                  className="flex-1 min-h-[52px] text-center text-2xl font-extrabold tabular-nums bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleStep(1)}
                  aria-label="Aumentar quantidade"
                  className="min-w-[52px] min-h-[52px] rounded-xl bg-stone-900 text-white flex items-center justify-center hover:bg-stone-800 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1.5">
              Observação (Opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Sem cebola, ponto da carne, gelo à parte..."
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs font-medium text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <div className="pt-2 border-t border-stone-200 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-stone-500">Subtotal do Item</p>
              <p className="text-xl font-extrabold text-stone-900 tabular-nums">
                {formatCurrency(totalPrice)}
              </p>
            </div>
            <button
              type="submit"
              disabled={!allowNegativeStock && maxStock <= 0}
              className="min-h-[48px] px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 text-white font-bold rounded-xl shadow-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
