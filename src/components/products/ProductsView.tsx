/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  UtensilsCrossed,
  Plus,
  Search,
  AlertTriangle,
  Edit2,
  Trash2,
  Tag,
  Layers,
  ChefHat,
  X,
  Save,
  Camera,
  Image as ImageIcon,
  Upload,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  RotateCw,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Product, Category } from '../../types';
import {
  getProducts,
  getCategories,
  saveProduct,
  deleteProduct,
  deleteProductSafely,
  addAuditLog,
} from '../../services/storage';
import {
  validateMasterAuthority,
  getMatrizInfo,
  isDeviceMatriz,
} from '../../services/local-db';
import { formatBRL, calcProfitMargin } from '../../utils/formatters';
import { processProductImage, PRESET_FOOD_PHOTOS } from '../../utils/image-processor';

export const ProductsView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { isAdm, currentUser, activeView } = useAuth();

  const [products, setProducts] = useState<Product[]>(getProducts(currentTenant.id));
  const categories = getCategories(currentTenant.id);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Estados de Imagem e Fotografia
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionBadge, setCompressionBadge] = useState<string | null>(null);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    internalCode: string;
    categoryId: string;
    description: string;
    imageUrl: string;
    costPrice: number;
    sellingPrice: number;
    stockQuantity: number;
    minStock: number;
    unit: Product['unit'];
    isComposite: boolean;
  }>({
    name: '',
    internalCode: '',
    categoryId: categories[0]?.id || '',
    description: '',
    imageUrl: '',
    costPrice: 0,
    sellingPrice: 0,
    stockQuantity: 10,
    minStock: 5,
    unit: 'un',
    isComposite: false,
  });

  const refreshList = () => {
    setProducts(getProducts(currentTenant.id));
  };

  const matrizInfo = getMatrizInfo();
  const isCurrentMatriz = isDeviceMatriz(activeView === 'admin' ? 'adm' : 'seller');

  // Validação prévia de autoridade da Matriz
  const checkMasterAuthority = (action: 'create_product' | 'update_product' | 'delete_product') => {
    const authority = validateMasterAuthority(
      action,
      activeView === 'admin' ? 'adm' : 'seller',
      currentUser?.role || 'waiter'
    );
    if (!authority.allowed) {
      alert(`⚠️ ${authority.reason}`);
      return false;
    }
    return true;
  };

  const handleOpenCreateModal = () => {
    if (!checkMasterAuthority('create_product')) return;

    setEditingProduct(null);
    setCompressionBadge(null);
    setFormData({
      name: '',
      internalCode: `COD${Math.floor(Math.random() * 900 + 100)}`,
      categoryId: categories[0]?.id || '',
      description: '',
      imageUrl: '',
      costPrice: 0,
      sellingPrice: 0,
      stockQuantity: 20,
      minStock: 5,
      unit: 'un',
      isComposite: false,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (prod: Product) => {
    if (!checkMasterAuthority('update_product')) return;

    setEditingProduct(prod);
    setCompressionBadge(null);
    setFormData({
      name: prod.name,
      internalCode: prod.internalCode,
      categoryId: prod.categoryId,
      description: prod.description || '',
      imageUrl: prod.imageUrl || '',
      costPrice: prod.costPrice,
      sellingPrice: prod.sellingPrice,
      stockQuantity: prod.stockQuantity,
      minStock: prod.minStock,
      unit: prod.unit,
      isComposite: prod.isComposite,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (!checkMasterAuthority('delete_product')) return;

    const prod = products.find((p) => p.id === id);
    if (confirm(`Deseja realmente remover o produto "${prod?.name}"?\n(Se o produto possuir vendas históricas, ele será desativado com segurança do cardápio ativo sem apagar o histórico).`)) {
      const result = deleteProductSafely(id);
      alert(result.message);
      refreshList();
    }
  };

  // Processamento e compressão local de foto (Câmera ou Galeria)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const result = await processProductImage(file, 600, 600, 0.82);

      setFormData((prev) => ({ ...prev, imageUrl: result.dataUrl }));

      const origKb = Math.round(result.originalSizeBytes / 1024);
      const compKb = Math.round(result.compressedSizeBytes / 1024);
      const savedPercent = Math.max(0, Math.round(((origKb - compKb) / origKb) * 100));

      setCompressionBadge(`Foto comprimida: ${origKb}KB ➔ ${compKb}KB (${savedPercent}% economizado p/ SQLite local)`);
    } catch (err: any) {
      alert(`Erro ao processar imagem: ${err.message}`);
    } finally {
      setIsCompressing(false);
      // Limpa input para permitir selecionar o mesmo arquivo se quiser
      if (e.target) e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sellingPrice) return;

    if (!checkMasterAuthority(editingProduct ? 'update_product' : 'create_product')) return;

    const margin = calcProfitMargin(formData.costPrice, formData.sellingPrice);

    if (editingProduct) {
      saveProduct({
        ...editingProduct,
        ...formData,
        profitMargin: margin,
      });
      addAuditLog({
        tenantId: currentTenant.id,
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'Administrador',
        action: 'ATUALIZOU_PRODUTO',
        details: `Atualizou o produto ${formData.name} na Matriz (${formatBRL(formData.sellingPrice)})`,
      });
    } else {
      const newProd: Product = {
        id: `prod-${Date.now()}`,
        tenantId: currentTenant.id,
        ...formData,
        profitMargin: margin,
        active: true,
        createdAt: new Date().toISOString(),
      };
      saveProduct(newProd);
      addAuditLog({
        tenantId: currentTenant.id,
        userId: currentUser?.id || 'admin',
        userName: currentUser?.name || 'Administrador',
        action: 'CRIOU_PRODUTO',
        details: `Cadastrou o produto ${formData.name} com fotografia na Matriz por ${formatBRL(formData.sellingPrice)}`,
      });
    }

    setIsModalOpen(false);
    refreshList();
  };

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.internalCode.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Cardápio & Catálogo Visual
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              {products.length} itens cadastrados
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            {isAdm
              ? `Autoridade Central da Matriz Ativa: ${matrizInfo.activeHostLabel}`
              : 'Terminal de Consulta do Vendedor • Alterações e exclusões restritas à Matriz'}
          </p>
        </div>

        {isAdm && (
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
          >
            <Plus className="h-4 w-4" />
            Cadastrar Produto com Foto
          </button>
        )}
      </div>

      {/* Categorias Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
            selectedCategory === 'all'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
          }`}
        >
          Todos ({products.length})
        </button>
        {categories.map((cat) => {
          const count = products.filter((p) => p.categoryId === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                selectedCategory === cat.id
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-stone-400" />
        <input
          type="text"
          placeholder="Buscar produto por nome ou código interno..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-500 focus:outline-none"
        />
      </div>

      {/* Grid de Produtos Visuais com Fotografia */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.map((prod) => {
          const isLowStock = prod.stockQuantity <= prod.minStock;
          const categoryName = categories.find((c) => c.id === prod.categoryId)?.name || 'Geral';

          return (
            <div
              key={prod.id}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs hover:border-amber-300 transition"
            >
              {/* Fotografia do Produto */}
              <div className="relative h-44 w-full bg-stone-100 overflow-hidden">
                {prod.imageUrl ? (
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center text-stone-400 bg-stone-100">
                    <ImageIcon className="h-8 w-8 text-stone-300 mb-1" />
                    <span className="text-[11px] font-medium">Sem fotografia</span>
                  </div>
                )}

                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  <span className="rounded-lg bg-stone-900/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                    {prod.internalCode}
                  </span>
                  <span className="rounded-lg bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                    {categoryName}
                  </span>
                </div>

                {prod.isComposite && (
                  <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-purple-900/80 px-2 py-0.5 text-[10px] font-bold text-purple-200 backdrop-blur-xs flex items-center gap-1">
                    <ChefHat className="h-3 w-3" /> Ficha Técnica
                  </span>
                )}
              </div>

              {/* Informações */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-stone-900 leading-snug">
                      {prod.name}
                    </h3>

                    {isAdm && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenEditModal(prod)}
                          title="Editar na Matriz"
                          className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(prod.id)}
                          title="Excluir na Matriz"
                          className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-stone-500 line-clamp-2 leading-relaxed">
                    {prod.description || 'Sem descrição cadastrada.'}
                  </p>
                </div>

                <div className="mt-4 border-t border-stone-100 pt-3">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] text-stone-400 font-semibold uppercase">Preço Oficial</span>
                      <p className="text-lg font-black text-stone-900">{formatBRL(prod.sellingPrice)}</p>
                    </div>

                    {isAdm && (
                      <div className="text-right">
                        <span className="text-[10px] text-stone-400 font-semibold uppercase">Custo / Margem</span>
                        <p className="text-xs font-semibold text-stone-700">
                          {formatBRL(prod.costPrice)} •{' '}
                          <span className="text-emerald-600 font-bold">{prod.profitMargin}%</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Status do Estoque */}
                  <div className="mt-2 flex items-center justify-between text-[11px] pt-1">
                    <span className="text-stone-500">
                      Estoque Físico:{' '}
                      <strong className="text-stone-800">
                        {prod.stockQuantity} {prod.unit}
                      </strong>
                    </span>
                    {isLowStock ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        <AlertTriangle className="h-3 w-3" /> Mínimo: {prod.minStock}
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Disponível
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DE CADASTRO / EDIÇÃO VISUAL COM FOTOGRAFIA PELA CÂMERA OU GALERIA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-base">
                  {editingProduct ? 'Editar Produto na Matriz' : 'Cadastrar Produto com Fotografia'}
                </h3>
                <p className="text-xs text-stone-500">
                  Armazenamento local SQLite com compressão e sincronização aos terminais
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* ÁREA DE FOTOGRAFIA DO PRODUTO (Câmera, Galeria, Pré-visualização, Recorte e Compressão) */}
              <div className="rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50/70 p-4">
                <span className="block text-xs font-bold text-stone-800 uppercase tracking-wide">
                  Fotografia do Produto * (Exibida no Cardápio & PDV)
                </span>

                {/* Previews e Ações */}
                <div className="mt-3 flex flex-col sm:flex-row items-center gap-4">
                  {/* Visualizador da Imagem */}
                  <div className="relative h-32 w-32 shrink-0 rounded-2xl bg-white border border-stone-200 overflow-hidden shadow-xs flex items-center justify-center">
                    {formData.imageUrl ? (
                      <img
                        src={formData.imageUrl}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-stone-400 p-2 text-center">
                        <ImageIcon className="h-8 w-8 text-stone-300" />
                        <span className="text-[10px] mt-1 font-medium">Nenhuma foto selecionada</span>
                      </div>
                    )}

                    {isCompressing && (
                      <div className="absolute inset-0 bg-stone-900/60 flex flex-col items-center justify-center text-white">
                        <RotateCw className="h-5 w-5 animate-spin text-amber-400 mb-1" />
                        <span className="text-[10px] font-bold">Comprimindo...</span>
                      </div>
                    )}
                  </div>

                  {/* Botões de Ação de Foto */}
                  <div className="flex-1 space-y-2 w-full">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Botão Câmera */}
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition"
                      >
                        <Camera className="h-4 w-4" />
                        Tirar com Câmera
                      </button>

                      {/* Botão Galeria */}
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 transition"
                      >
                        <Upload className="h-4 w-4 text-stone-500" />
                        Escolher Arquivo
                      </button>
                    </div>

                    <div className="flex gap-2">
                      {/* Botão de Sugestões de Fotos do Banco */}
                      <button
                        type="button"
                        onClick={() => setIsPresetModalOpen(true)}
                        className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                        Galeria de Pratos Prontos
                      </button>

                      {formData.imageUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, imageUrl: '' }));
                            setCompressionBadge(null);
                          }}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                          title="Remover foto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {compressionBadge && (
                      <p className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                        ✓ {compressionBadge}
                      </p>
                    )}

                    <p className="text-[10px] text-stone-400">
                      Imagens são automaticamente comprimidas localmente em ~600x600px para economizar armazenamento no celular da Matriz.
                    </p>
                  </div>
                </div>

                {/* Inputs de arquivo ocultos */}
                <input
                  type="file"
                  ref={cameraInputRef}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <input
                  type="file"
                  ref={galleryInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Campos do Produto */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-stone-700">Nome do Produto *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Burger Bacon Artesanal"
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Código Interno</label>
                  <input
                    type="text"
                    value={formData.internalCode}
                    onChange={(e) => setFormData({ ...formData, internalCode: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Categoria *</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-900">Preço Oficial de Venda (R$) *</label>
                  <input
                    type="number"
                    step="0.10"
                    required
                    value={formData.sellingPrice || ''}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-xl border border-amber-300 bg-amber-50/50 px-3 py-2 text-sm font-black text-amber-950 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Preço de Custo (R$)</label>
                  <input
                    type="number"
                    step="0.10"
                    value={formData.costPrice || ''}
                    onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Estoque Físico Atual</label>
                  <input
                    type="number"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: parseInt(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Estoque Mínimo (Alerta)</label>
                  <input
                    type="number"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-stone-700">Descrição para Atendimento</label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descrição para orientar os garçons e clientes..."
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-amber-700 shadow-sm transition"
                >
                  <Save className="h-4 w-4" />
                  Salvar na Matriz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE PRATOS E FOTOS PRONTAS (PARA TESTES RÁPIDOS) */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h4 className="font-bold text-stone-900 text-sm">Galeria de Pratos Prontos</h4>
                <p className="text-xs text-stone-500">Selecione uma fotografia gastronômica para o produto</p>
              </div>
              <button
                onClick={() => setIsPresetModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              {PRESET_FOOD_PHOTOS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, imageUrl: preset.url }));
                    setCompressionBadge('Foto de alta qualidade selecionada da galeria');
                    setIsPresetModalOpen(false);
                  }}
                  className="group flex flex-col rounded-2xl border border-stone-200 overflow-hidden text-left hover:border-amber-500 hover:ring-2 hover:ring-amber-500/20 transition"
                >
                  <div className="h-28 w-full bg-stone-100 overflow-hidden">
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="h-full w-full object-cover group-hover:scale-105 transition"
                    />
                  </div>
                  <div className="p-2.5 bg-white">
                    <span className="text-[10px] font-semibold text-amber-700 uppercase">{preset.category}</span>
                    <p className="text-xs font-bold text-stone-900 truncate">{preset.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
