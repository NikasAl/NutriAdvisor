'use client';

import React, { useState, useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus, Trash2, Pencil, Search, X, Package, UtensilsCrossed, Check,
  ScanSearch, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import type { DishIngredientData, FoodEntryItem, ProductVerdict } from '@/lib/types';
import { PRODUCT_VERDICT_LABELS } from '@/lib/types';

/** Colored verdict badge styles (light + dark) */
const VERDICT_STYLES: Record<ProductVerdict, string> = {
  suitable: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900',
  caution: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900',
  not_recommended: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900',
};

function formatAnalysisDate(d: Date): string {
  const date = new Date(d);
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

export default function FoodCatalogPanel() {
  const foodProducts = useAppStore((s) => s.foodProducts);
  const dishes = useAppStore((s) => s.dishes);
  const addFoodProduct = useAppStore((s) => s.addFoodProduct);
  const updateFoodProduct = useAppStore((s) => s.updateFoodProduct);
  const deleteFoodProduct = useAppStore((s) => s.deleteFoodProduct);
  const addDish = useAppStore((s) => s.addDish);
  const updateDish = useAppStore((s) => s.updateDish);
  const deleteDish = useAppStore((s) => s.deleteDish);
  const productAnalyses = useAppStore((s) => s.productAnalyses);
  const runProductAnalysis = useAppStore((s) => s.runProductAnalysis);
  const deleteProductAnalysis = useAppStore((s) => s.deleteProductAnalysis);

  const [tab, setTab] = useState<'products' | 'dishes' | 'analysis'>('products');
  const [search, setSearch] = useState('');

  // Product dialog
  const [prodDialogOpen, setProdDialogOpen] = useState(false);
  const [prodName, setProdName] = useState('');
  const [editingProdId, setEditingProdId] = useState<string | null>(null);

  // Dish dialog
  const [dishDialogOpen, setDishDialogOpen] = useState(false);
  const [dishName, setDishName] = useState('');
  const [editingDishId, setEditingDishId] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<DishIngredientData[]>([]);
  const [ingSearch, setIngSearch] = useState('');
  const [showIngDropdown, setShowIngDropdown] = useState(false);

  // Product analysis state
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [newAnalysisOpen, setNewAnalysisOpen] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<'catalog' | 'custom'>('catalog');
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [catSearch, setCatSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customIngredients, setCustomIngredients] = useState('');
  const [customNutrients, setCustomNutrients] = useState('');
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return foodProducts;
    return foodProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [foodProducts, search]);

  const filteredDishes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dishes;
    return dishes.filter((d) => d.name.toLowerCase().includes(q));
  }, [dishes, search]);

  // Analyses: filter by product name, summary and verdict label (case-insensitive)
  const filteredAnalyses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return productAnalyses;
    return productAnalyses.filter(
      (a) =>
        a.productName.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        PRODUCT_VERDICT_LABELS[a.verdict].toLowerCase().includes(q)
    );
  }, [productAnalyses, search]);

  // Catalog products available in the new-analysis dialog (searchable)
  const filteredCatProducts = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return foodProducts;
    return foodProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [foodProducts, catSearch]);

  const filteredIngProducts = useMemo(() => {
    const q = ingSearch.trim().toLowerCase();
    if (!q) return foodProducts.slice(0, 20);
    return foodProducts.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [foodProducts, ingSearch]);

  // Exclude products already in the dish
  const availableIngProducts = useMemo(() => {
    const usedIds = new Set(ingredients.map((i) => i.productId));
    return filteredIngProducts.filter((p) => !usedIds.has(p.id));
  }, [filteredIngProducts, ingredients]);

  const handleSaveProduct = async () => {
    if (!prodName.trim()) return;
    if (editingProdId) {
      await updateFoodProduct(editingProdId, { name: prodName.trim() });
    } else {
      await addFoodProduct(prodName.trim());
    }
    closeProductDialog();
  };

  const openEditProduct = (name: string, id: string) => {
    setProdName(name);
    setEditingProdId(id);
    setProdDialogOpen(true);
  };

  const closeProductDialog = () => {
    setProdDialogOpen(false);
    setProdName('');
    setEditingProdId(null);
  };

  // ── Product analysis handlers ──

  const openNewAnalysis = () => {
    setAnalysisMode('catalog');
    setSelectedCatalogId(null);
    setCatSearch('');
    setCustomName('');
    setCustomIngredients('');
    setCustomNutrients('');
    setAnalysisError('');
    setAnalysisRunning(false);
    setNewAnalysisOpen(true);
  };

  const closeNewAnalysis = () => {
    setNewAnalysisOpen(false);
    setAnalysisError('');
    setAnalysisRunning(false);
  };

  const handleRunAnalysis = async () => {
    if (analysisRunning) return;
    let input: { productName: string; ingredients?: string; nutrientsPer100g?: string; sourceProductId?: string } | null = null;

    if (analysisMode === 'catalog') {
      const p = foodProducts.find((x) => x.id === selectedCatalogId);
      if (!p) return;
      input = { productName: p.name, sourceProductId: p.id };
    } else {
      if (!customName.trim()) return;
      input = {
        productName: customName.trim(),
        ingredients: customIngredients.trim() || undefined,
        nutrientsPer100g: customNutrients.trim() || undefined,
      };
    }

    setAnalysisRunning(true);
    setAnalysisError('');
    try {
      await runProductAnalysis(input);
      closeNewAnalysis();
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Ошибка анализа');
    } finally {
      setAnalysisRunning(false);
    }
  };

  const handleSaveDish = async () => {
    if (!dishName.trim() || ingredients.length === 0) return;
    if (editingDishId) {
      await updateDish(editingDishId, { name: dishName.trim(), ingredients });
    } else {
      await addDish(dishName.trim(), ingredients);
    }
    closeDishDialog();
  };

  const openNewDish = () => {
    setDishName('');
    setIngredients([]);
    setEditingDishId(null);
    setDishDialogOpen(true);
  };

  const openEditDish = (id: string, name: string, ings: DishIngredientData[]) => {
    setDishName(name);
    setIngredients([...ings]);
    setEditingDishId(id);
    setDishDialogOpen(true);
  };

  const closeDishDialog = () => {
    setDishDialogOpen(false);
    setDishName('');
    setIngredients([]);
    setEditingDishId(null);
    setIngSearch('');
  };

  const addIngredient = (productId: string, productName: string) => {
    setIngredients([...ingredients, { productId, weightGrams: 0 }]);
    setIngSearch('');
    setShowIngDropdown(false);
  };

  const removeIngredient = (idx: number) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  const updateIngredientWeight = (idx: number, weight: number) => {
    const next = [...ingredients];
    next[idx] = { ...next[idx], weightGrams: weight };
    setIngredients(next);
  };

  const getProductName = (productId: string) => {
    return foodProducts.find((p) => p.id === productId)?.name ?? 'Неизвестный продукт';
  };

  const totalDishWeight = ingredients.reduce((s, i) => s + i.weightGrams, 0);

  return (
    <div className="space-y-4 pb-4">
      {/* Tabs — row 1: products + dishes, row 2: product analysis (full width) */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => { setTab('products'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg border p-3 transition-colors ${
              tab === 'products' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Package className="h-5 w-5" />
            <span className="text-sm font-medium">Продукты</span>
            <Badge variant="secondary" className="text-[10px]">{foodProducts.length}</Badge>
          </button>
          <button
            onClick={() => { setTab('dishes'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg border p-3 transition-colors ${
              tab === 'dishes' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <UtensilsCrossed className="h-5 w-5" />
            <span className="text-sm font-medium">Блюда</span>
            <Badge variant="secondary" className="text-[10px]">{dishes.length}</Badge>
          </button>
        </div>
        <button
          onClick={() => { setTab('analysis'); setSearch(''); }}
          className={`w-full flex items-center justify-center gap-2 rounded-lg border p-3 transition-colors ${
            tab === 'analysis' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <ScanSearch className="h-5 w-5" />
          <span className="text-sm font-medium">Анализ продуктов</span>
          <Badge variant="secondary" className="text-[10px]">{productAnalyses.length}</Badge>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === 'products' ? 'Поиск продуктов...' : tab === 'dishes' ? 'Поиск блюд...' : 'Поиск анализов...'}
          className="pl-9 pr-8"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Products list */}
      {tab === 'products' && (
        <div className="space-y-1.5">
          {filteredProducts.map((product) => (
            <div key={product.id} className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{product.name}</p>
              </div>
              <button
                onClick={() => openEditProduct(product.name, product.id)}
                className="rounded-md p-1.5 hover:bg-muted text-muted-foreground"
                title="Редактировать"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="rounded-md p-1.5 hover:bg-destructive/10 text-destructive" title="Удалить">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить продукт?</AlertDialogTitle>
                    <AlertDialogDescription>Продукт «{product.name}» будет удалён.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteFoodProduct(product.id)} className="bg-destructive text-destructive-foreground">
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Package className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p>{foodProducts.length === 0 ? 'Нет продуктов' : 'Ничего не найдено'}</p>
            </div>
          )}
        </div>
      )}

      {/* Dishes list */}
      {tab === 'dishes' && (
        <div className="space-y-1.5">
          {filteredDishes.map((dish) => {
            const totalW = dish.ingredients.reduce((s, i) => s + i.weightGrams, 0);
            return (
              <div key={dish.id} className="rounded-lg border px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{dish.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {dish.ingredients.length} ингр.{totalW > 0 ? ` · ${totalW}г` : ''}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {dish.ingredients.map((ing, idx) => (
                        <span key={idx} className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                          {getProductName(ing.productId)} {ing.weightGrams}г
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => openEditDish(dish.id!, dish.name, dish.ingredients)}
                      className="rounded-md p-1.5 hover:bg-muted text-muted-foreground"
                      title="Редактировать"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="rounded-md p-1.5 hover:bg-destructive/10 text-destructive" title="Удалить">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Удалить блюдо?</AlertDialogTitle>
                          <AlertDialogDescription>Блюдо «{dish.name}» будет удалено.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Отмена</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteDish(dish.id!)} className="bg-destructive text-destructive-foreground">
                            Удалить
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredDishes.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <UtensilsCrossed className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p>{dishes.length === 0 ? 'Нет блюд' : 'Ничего не найдено'}</p>
            </div>
          )}
        </div>
      )}

      {/* Product analyses list */}
      {tab === 'analysis' && (
        <div className="space-y-1.5">
          <Button onClick={openNewAnalysis} className="w-full gap-2">
            <ScanSearch className="h-4 w-4" /> Новый анализ
          </Button>

          {filteredAnalyses.map((a) => {
            const expanded = expandedAnalysisId === a.id;
            return (
              <div key={a.id} className="rounded-lg border px-3 py-2.5">
                <button
                  onClick={() => setExpandedAnalysisId(expanded ? null : (a.id ?? null))}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.productName}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatAnalysisDate(a.createdAt)}
                      </p>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${VERDICT_STYLES[a.verdict]}`}>
                      {PRODUCT_VERDICT_LABELS[a.verdict]}
                    </Badge>
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                </button>

                {expanded && (
                  <div className="mt-2 pt-2 border-t space-y-2">
                    {(a.ingredients || a.nutrientsPer100g) && (
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        {a.ingredients && (
                          <p className="break-words">
                            <span className="font-medium">Состав:</span> {a.ingredients}
                          </p>
                        )}
                        {a.nutrientsPer100g && (
                          <p className="break-words">
                            <span className="font-medium">На 100 г:</span> {a.nutrientsPer100g}
                          </p>
                        )}
                      </div>
                    )}
                    <MarkdownRenderer content={a.analysis} className="text-foreground" />
                    <div className="flex justify-end">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="rounded-md p-1.5 hover:bg-destructive/10 text-destructive inline-flex items-center gap-1 text-xs"
                            title="Удалить анализ"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Удалить
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить анализ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Анализ продукта «{a.productName}» будет удалён.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => { if (a.id) { deleteProductAnalysis(a.id); setExpandedAnalysisId(null); } }}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredAnalyses.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <ScanSearch className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p>{productAnalyses.length === 0 ? 'Анализов пока нет' : 'Ничего не найдено'}</p>
              {productAnalyses.length === 0 && (
                <p className="text-xs mt-1 px-4">
                  Нажмите «Новый анализ», чтобы проверить, подходит ли вам продукт из магазина
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* FABs */}
      {tab === 'products' && (
        <Button
          className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={() => { setProdName(''); setEditingProdId(null); setProdDialogOpen(true); }}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
      {tab === 'dishes' && (
        <Button
          className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={openNewDish}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      {/* Product Dialog */}
      <Dialog open={prodDialogOpen} onOpenChange={(o) => { if (!o) closeProductDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingProdId ? 'Редактировать продукт' : 'Новый продукт'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Название</Label>
              <Input
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="Яблоко, помидор, гречка..."
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveProduct()}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Отмена</Button></DialogClose>
            <Button onClick={handleSaveProduct} disabled={!prodName.trim()}>
              <Check className="mr-1.5 h-4 w-4" /> Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dish Dialog */}
      <Dialog open={dishDialogOpen} onOpenChange={(o) => { if (!o) closeDishDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingDishId ? 'Редактировать блюдо' : 'Новое блюдо'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Название блюда</Label>
              <Input
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
                placeholder="Мой чечевичник, овсянка с бананом..."
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ингредиенты ({ingredients.length})</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={ingSearch}
                  onChange={(e) => { setIngSearch(e.target.value); setShowIngDropdown(true); }}
                  onFocus={() => setShowIngDropdown(true)}
                  placeholder="Найти продукт для добавления..."
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {ingSearch && (
                  <button onClick={() => setIngSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {showIngDropdown && availableIngProducts.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border bg-popover p-1 space-y-0.5 shadow-lg">
                    {availableIngProducts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addIngredient(p.id, p.name)}
                        className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors break-words"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ingredients list */}
            {ingredients.length > 0 && (
              <div className="space-y-2 rounded-lg border p-2">
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="flex-1 text-sm min-w-0 truncate">{getProductName(ing.productId)}</span>
                    <Input
                      type="number"
                      value={ing.weightGrams || ''}
                      onChange={(e) => updateIngredientWeight(idx, Number(e.target.value))}
                      placeholder="г"
                      className="w-20 h-8 text-sm text-right"
                    />
                    <span className="text-[10px] text-muted-foreground">г</span>
                    <button
                      onClick={() => removeIngredient(idx)}
                      className="rounded-md p-1 hover:bg-destructive/10 text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {totalDishWeight > 0 && (
                  <div className="text-[10px] text-muted-foreground text-right pt-1 border-t">
                    Итого: {totalDishWeight}г
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Отмена</Button></DialogClose>
            <Button onClick={handleSaveDish} disabled={!dishName.trim() || ingredients.length === 0}>
              <Check className="mr-1.5 h-4 w-4" /> Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Product Analysis Dialog */}
      <Dialog open={newAnalysisOpen} onOpenChange={(o) => { if (!o) closeNewAnalysis(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanSearch className="h-4 w-4" />
              Новый анализ продукта
            </DialogTitle>
          </DialogHeader>

          {analysisRunning ? (
            <div className="py-8 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              <span>Анализирую продукт…</span>
              <span className="text-xs">Обычно это занимает меньше минуты</span>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              {analysisError && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-md p-3 break-words">
                  {analysisError}
                </div>
              )}

              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAnalysisMode('catalog')}
                  className={`flex-1 rounded-lg border p-2 text-sm transition-colors ${
                    analysisMode === 'catalog'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Из каталога
                </button>
                <button
                  onClick={() => setAnalysisMode('custom')}
                  className={`flex-1 rounded-lg border p-2 text-sm transition-colors ${
                    analysisMode === 'custom'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Свой продукт
                </button>
              </div>

              {analysisMode === 'catalog' ? (
                /* Catalog product picker */
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                      placeholder="Найти продукт в каталоге..."
                      className="pl-8 pr-8 h-9 text-sm"
                    />
                    {catSearch && (
                      <button onClick={() => setCatSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-lg border divide-y divide-border">
                    {filteredCatProducts.map((p) => {
                      const selected = selectedCatalogId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedCatalogId(selected ? null : p.id)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                            selected
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          {selected && <Check className="h-4 w-4 shrink-0" />}
                        </button>
                      );
                    })}
                    {filteredCatProducts.length === 0 && (
                      <div className="py-6 text-center text-xs text-muted-foreground">
                        Ничего не найдено
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Custom product form */
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Название продукта</Label>
                    <Input
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Молочный шоколад «Аленка»..."
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Состав (ингредиенты)</Label>
                    <Textarea
                      value={customIngredients}
                      onChange={(e) => setCustomIngredients(e.target.value)}
                      placeholder="сахар, какао-масло, молоко сухое, эмульгатор соевый лецитин..."
                      className="min-h-20 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Пищевая ценность на 100 г (опционально)</Label>
                    <Input
                      value={customNutrients}
                      onChange={(e) => setCustomNutrients(e.target.value)}
                      placeholder="540 ккал, белки 7,6 г, жиры 29 г, углеводы 60 г"
                      className="text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!analysisRunning && (
              <DialogClose asChild><Button variant="outline">Отмена</Button></DialogClose>
            )}
            <Button
              onClick={handleRunAnalysis}
              disabled={analysisRunning || (analysisMode === 'catalog' ? !selectedCatalogId : !customName.trim())}
            >
              {analysisRunning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1.5 h-4 w-4" />}
              {analysisRunning ? 'Анализирую...' : 'Анализировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
