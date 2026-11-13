/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import {
  Plus,
  Search,
  AlertTriangle,
  Edit2,
  Trash2,
  ChefHat,
  X,
  Save,
  Camera,
  Image as ImageIcon,
  Upload,
  Sparkles,
  CheckCircle2,
  RotateCw,
  FolderKanban,
  ArrowRightLeft,
} from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { Product, Category } from '../../types';
import {
  getProducts,
  getCategories,
  saveProduct,
  deleteProductSafely,
  saveCategory,
  deleteCategoryWithStrategy,
  addAuditLog,
} from '../../services/storage';
import {
  uploadMediaFile,
  upsertCategoryApi,
  deleteCategoryApi,
  upsertProductApi,
  deleteProductApi,
} from '../../services/sync-client';
import {
  validateMasterAuthority,
  getMatrizInfo,
} from '../../services/local-db';
import { formatBRL, calcProfitMargin } from '../../utils/formatters';
import { processProductImage, PRESET_FOOD_PHOTOS } from '../../utils/image-processor';

export const ProductsView: React.FC = () => {
  const { currentTenant } = useTenant();
  const { isAdm, currentUser, activeView } = useAuth();

  const [products, setProducts] = useState<Product[]>(getProducts(currentTenant.id));
  const [categories, setCategories] = useState<Category[]>(getCategories(currentTenant.id));

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDeleteProd, setConfirmDeleteProd] = useState<Product | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Estados de Imagem e Fotografia
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionBadge, setCompressionBadge] = useState<string | null>(null);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

  // Gerenciamento de Categorias
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [deleteStrategy, setDeleteStrategy] = useState<'transfer' | 'uncategorized'>('uncategorized');
  const [transferTargetCatId, setTransferTargetCatId] = useState('');

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
    allowWeight: boolean;
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
    allowWeight: false,
    isComposite: false,
  });

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const refreshList = () => {
    setProducts(getProducts(currentTenant.id));
    setCategories(getCategories(currentTenant.id));
  };

  React.useEffect(() => {
    refreshList();
    const handleSync = () => refreshList();
    window.addEventListener('sabor_local_sync', handleSync);
    return () => window.removeEventListener('sabor_local_sync', handleSync);
  }, [currentTenant.id]);

  const matrizInfo = getMatrizInfo();

  // Validação prévia de autoridade da Matriz
  const checkMasterAuthority = (action: 'create_product' | 'update_product' | 'delete_product') => {
    const authority = validateMasterAuthority(
      action,
      activeView === 'admin' ? 'adm' : 'seller',
      currentUser?.role || 'waiter'
    );
    if (!authority.allowed) {
      showFeedback(authority.reason || 'Acesso restrito ao Administrador.', 'error');
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
      allowWeight: false,
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
      allowWeight: Boolean(prod.allowWeight || prod.unit === 'kg' || prod.unit === 'g'),
      isComposite: prod.isComposite,
    });
    setIsModalOpen(true);
  };

  const handleRequestDelete = (prod: Product) => {
    if (!checkMasterAuthority('delete_product')) return;
    setConfirmDeleteProd(prod);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteProd) return;
    const prodId = confirmDeleteProd.id;
    const result = deleteProductSafely(prodId);
    try {
      await deleteProductApi(currentTenant.id, prodId, currentUser?.id);
    } catch {
      // fallback offline preservado
    }
    setConfirmDeleteProd(null);
    showFeedback(result.message, result.success ? 'success' : 'error');
    refreshList();
  };

  // Processamento e compressão local de foto (Câmera ou Galeria) + upload para pasta de mídia da Matriz
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const result = await processProductImage(file, 600, 600, 0.82);

      let finalImageUrl = result.dataUrl;
      let persistedOnDisk = false;
      try {
        const uploaded = await uploadMediaFile(result.dataUrl, 'prod', currentUser?.id);
        if (uploaded?.url) {
          finalImageUrl = uploaded.url;
          persistedOnDisk = true;
        }
      } catch {
        // Offline ou servidor parado: mantém dataUrl comprimido localmente
      }

      setFormData((prev) => ({ ...prev, imageUrl: finalImageUrl }));

      const origKb = Math.round(result.originalSizeBytes / 1024);
      const compKb = Math.round(result.compressedSizeBytes / 1024);
      const savedPercent = Math.max(0, Math.round(((origKb - compKb) / Math.max(1, origKb)) * 100));

      setCompressionBadge(
        `Foto comprimida: ${origKb}KB ➔ ${compKb}KB (${savedPercent}% economizado)${
          persistedOnDisk ? ' · Salva no servidor Matriz' : ''
        }`
      );
    } catch (err: any) {
      showFeedback(`Erro ao processar imagem: ${err.message}`, 'error');
    } finally {
      setIsCompressing(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.sellingPrice) return;

    if (!checkMasterAuthority(editingProduct ? 'update_product' : 'create_product')) return;

    const margin = calcProfitMargin(formData.costPrice, formData.sellingPrice);
    const savedProd: Product = editingProduct
      ? {
          ...editingProduct,
          ...formData,
          profitMargin: margin,
        }
      : {
          id: `prod-${Date.now()}`,
          tenantId: currentTenant.id,
          ...formData,
          profitMargin: margin,
          active: true,
          createdAt: new Date().toISOString(),
        };

    saveProduct(savedProd);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: editingProduct ? 'ATUALIZOU_PRODUTO' : 'CRIOU_PRODUTO',
      details: `${editingProduct ? 'Atualizou' : 'Cadastrou'} o produto ${formData.name} na Matriz (${formatBRL(formData.sellingPrice)})`,
    });

    try {
      await upsertProductApi(currentTenant.id, savedProd, currentUser?.id);
    } catch {
      // fallback offline preservado
    }

    setIsModalOpen(false);
    refreshList();
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      tenantId: currentTenant.id,
      name: newCategoryName.trim(),
      order: categories.length + 1,
      active: true,
      createdAt: new Date().toISOString(),
    };
    saveCategory(newCat);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: 'CRIOU_CATEGORIA',
      details: `Criou a categoria "${newCat.name}".`,
    });
    try {
      await upsertCategoryApi(currentTenant.id, newCat, currentUser?.id);
    } catch {
      // fallback offline
    }
    setNewCategoryName('');
    refreshList();
    showFeedback(`Categoria "${newCat.name}" criada com sucesso!`);
  };

  const handleSaveCategoryEdit = async () => {
    if (!editingCategoryId || !editingCategoryName.trim()) return;
    const target = categories.find((c) => c.id === editingCategoryId);
    if (!target) return;
    const updated: Category = { ...target, name: editingCategoryName.trim() };
    saveCategory(updated);
    addAuditLog({
      tenantId: currentTenant.id,
      userId: currentUser?.id || 'admin',
      userName: currentUser?.name || 'Administrador',
      action: 'EDITOU_CATEGORIA',
      details: `Renomeou a categoria "${target.name}" para "${updated.name}".`,
    });
    try {
      await upsertCategoryApi(currentTenant.id, updated, currentUser?.id);
    } catch {
      // fallback offline
    }
    setEditingCategoryId(null);
    setEditingCategoryName('');
    refreshList();
    showFeedback(`Categoria atualizada para "${updated.name}".`);
  };

  const handleOpenDeleteCategory = (cat: Category) => {
    const others = categories.filter((c) => c.id !== cat.id);
    setCategoryToDelete(cat);
    setDeleteStrategy(others.length > 0 ? 'transfer' : 'uncategorized');
    setTransferTargetCatId(others[0]?.id || '');
  };

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const res = deleteCategoryWithStrategy(
      currentTenant.id,
      categoryToDelete.id,
      deleteStrategy,
      deleteStrategy === 'transfer' ? transferTargetCatId : undefined,
      currentUser ? { id: currentUser.id, name: currentUser.name } : undefined
    );
    if (!res.success) {
      showFeedback(res.error || 'Falha ao excluir categoria.', 'error');
      return;
    }
    try {
      await deleteCategoryApi(
        currentTenant.id,
        categoryToDelete.id,
        deleteStrategy,
        deleteStrategy === 'transfer' ? transferTargetCatId : undefined,
        currentUser?.id
      );
    } catch {
      // fallback offline
    }
    if (selectedCategory === categoryToDelete.id) {
      setSelectedCategory('all');
    }
    setCategoryToDelete(null);
    refreshList();
    showFeedback(
      `Categoria removida. ${res.movedProductsCount} produto(s) ${
        deleteStrategy === 'transfer' ? 'transferido(s)' : 'mantido(s) sem categoria'
      }.`
    );
  };

  const uncategorizedCount = products.filter((p) => !p.categoryId).length;
  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === 'all'
        ? true
        : selectedCategory === 'uncategorized'
        ? !p.categoryId
        : p.categoryId === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.internalCode.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-semibold shadow-sm ${
            feedback.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-900'
              : 'border-emerald-300 bg-emerald-50 text-emerald-950'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Cardápio & Catálogo Visual
            </h1>
            <span className="rounded-lg bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 tabular-nums">
              {products.length} itens
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            {isAdm
              ? `Gerenciamento de produtos, preços por unidade/peso (kg/g) e fotos · ${matrizInfo.activeHostLabel}`
              : 'Consulta do Cardápio · Alterações e exclusões restritas ao Administrador'}
          </p>
        </div>

        {isAdm && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-bold text-stone-800 shadow-2xs hover:bg-stone-50 transition"
            >
              <FolderKanban className="h-4 w-4 text-amber-600" />
              <span>Gerenciar Categorias</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Produto</span>
            </button>
          </div>
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
        {uncategorizedCount > 0 && (
          <button
            onClick={() => setSelectedCategory('uncategorized')}
            className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              selectedCategory === 'uncategorized'
                ? 'bg-stone-700 text-white shadow-xs'
                : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
            }`}
          >
            Sem categoria ({uncategorizedCount})
          </button>
        )}
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
          const categoryName = categories.find((c) => c.id === prod.categoryId)?.name || 'Sem categoria';

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
                          title="Editar Produto"
                          className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleRequestDelete(prod)}
                          title="Excluir Produto"
                          className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
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
                      <p className="text-lg font-black text-stone-900 tabular-nums">
                        {formatBRL(prod.sellingPrice)}
                        {prod.unit !== 'un' && (
                          <span className="text-xs font-semibold text-stone-500"> / {prod.unit}</span>
                        )}
                      </p>
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
                  Armazenamento local na Matriz com compressão e sincronização aos terminais
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
                  <label className="block text-xs font-semibold text-stone-700">Categoria</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">Sem categoria</option>
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

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-stone-700">Unidade de Venda *</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => {
                      const nextUnit = e.target.value as Product['unit'];
                      setFormData({
                        ...formData,
                        unit: nextUnit,
                        allowWeight: nextUnit === 'kg' || nextUnit === 'g',
                      });
                    }}
                    className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="g">Grama (g)</option>
                    <option value="l">Litro (l)</option>
                    <option value="ml">Mililitro (ml)</option>
                    <option value="porcao">Porção</option>
                    <option value="fatia">Fatia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Estoque Físico Atual</label>
                  <input
                    type="number"
                    step={formData.unit === 'kg' || formData.unit === 'l' || formData.allowWeight ? '0.01' : '1'}
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700">Estoque Mínimo (Alerta)</label>
                  <input
                    type="number"
                    step={formData.unit === 'kg' || formData.unit === 'l' || formData.allowWeight ? '0.01' : '1'}
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: parseFloat(e.target.value) || 0 })}
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

      {/* MODAL: GERENCIAR CATEGORIAS (CRIAR, RENOMEAR, EXCLUIR COM REATRIBUIÇÃO) */}
      {isCategoryModalOpen && isAdm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl max-h-[88vh] flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-black text-stone-900 text-base">Gerenciar Categorias do Cardápio</h3>
                <p className="text-xs text-stone-500">
                  Crie, edite ou exclua categorias mantendo seus produtos organizados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setEditingCategoryId(null);
                  setCategoryToDelete(null);
                }}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nome da nova categoria..."
                className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newCategoryName.trim()}
                className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-45"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
            </form>

            <div className="flex-1 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded-2xl">
              {categories.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">Nenhuma categoria cadastrada.</div>
              ) : (
                categories.map((cat) => {
                  const linkedCount = products.filter((p) => p.categoryId === cat.id).length;
                  const isEditing = editingCategoryId === cat.id;
                  return (
                    <div key={cat.id} className="p-3 flex items-center justify-between gap-2">
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            className="flex-1 rounded-lg border border-amber-400 px-2.5 py-1.5 text-xs font-bold text-stone-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleSaveCategoryEdit}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCategoryId(null)}
                            className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs text-stone-600"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <p className="font-bold text-stone-900 text-xs truncate">{cat.name}</p>
                            <p className="text-[11px] text-stone-500">{linkedCount} produto(s) vinculado(s)</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(cat.id);
                                setEditingCategoryName(cat.name);
                              }}
                              className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                              title="Renomear categoria"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteCategory(cat)}
                              className="p-1.5 rounded-lg text-stone-500 hover:bg-rose-50 hover:text-rose-600"
                              title="Excluir categoria"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {categoryToDelete && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-950">
                    <p className="font-bold">Excluir categoria "{categoryToDelete.name}"</p>
                    <p className="text-[11px] mt-0.5">
                      Escolha o destino dos{' '}
                      <strong>{products.filter((p) => p.categoryId === categoryToDelete.id).length} produto(s)</strong>{' '}
                      vinculados a esta categoria:
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  {categories.filter((c) => c.id !== categoryToDelete.id).length > 0 && (
                    <label className="flex items-start gap-2 rounded-xl bg-white border border-stone-200 p-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="catDeleteStrategy"
                        checked={deleteStrategy === 'transfer'}
                        onChange={() => setDeleteStrategy('transfer')}
                        className="mt-0.5 text-amber-600"
                      />
                      <div className="flex-1 space-y-1.5">
                        <span className="font-bold text-stone-900 block">
                          Transferir produtos para outra categoria
                        </span>
                        {deleteStrategy === 'transfer' && (
                          <select
                            value={transferTargetCatId}
                            onChange={(e) => setTransferTargetCatId(e.target.value)}
                            className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                          >
                            {categories
                              .filter((c) => c.id !== categoryToDelete.id)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </label>
                  )}

                  <label className="flex items-center gap-2 rounded-xl bg-white border border-stone-200 p-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="catDeleteStrategy"
                      checked={deleteStrategy === 'uncategorized'}
                      onChange={() => setDeleteStrategy('uncategorized')}
                      className="text-amber-600"
                    />
                    <span className="font-bold text-stone-900">
                      Deixar produtos vinculados sem categoria
                    </span>
                  </label>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryToDelete(null)}
                    className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteCategory}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700"
                  >
                    Confirmar Exclusão
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE PRODUTO */}
      {confirmDeleteProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-rose-700 shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-stone-900">Remover Produto</h3>
                <p className="text-xs text-stone-500">{confirmDeleteProd.name}</p>
              </div>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Deseja remover <strong>{confirmDeleteProd.name}</strong> do cardápio ativo? Se houver histórico de vendas, ele será apenas desativado sem apagar nenhum dado anterior.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteProd(null)}
                className="w-1/2 min-h-[44px] rounded-xl border border-stone-200 text-xs font-bold text-stone-700 hover:bg-stone-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="w-1/2 min-h-[44px] rounded-xl bg-rose-600 text-xs font-bold text-white hover:bg-rose-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
