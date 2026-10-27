'use client';

import React, { useState, useMemo, useRef } from 'react';
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
import TTSButton from '@/components/ui/TTSButton';
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
  ScanSearch, ChevronDown, ChevronUp, Loader2, Camera, ImageIcon,
} from 'lucide-react';
import type { Dish, DishIngredientData, FoodEntryItem, ProductVerdict, AnalysisDishComponent } from '@/lib/types';
import { PRODUCT_VERDICT_LABELS } from '@/lib/types';
import { compressImageFile } from '@/lib/image-utils';
import { takePhotoNow } from '@/lib/photo-capture';

/** Colored verdict badge styles (light + dark) */
const VERDICT_STYLES: Record<ProductVerdict, string> = {
  suitable: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900',
  caution: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900',
  not_recommended: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900',
};

/** Max photos per one product analysis (keeps the LLM request reasonably small) */
const MAX_ANALYSIS_PHOTOS = 5;

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
  const ttsEnabled = useAppStore((s) => s.ttsEnabled);

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
  const [analysisMode, setAnalysisMode] = useState<'photo' | 'catalog' | 'custom'>('photo');
  // What is analyzed: a grocery product (default) or a dish from the catalog
  const [photoKind, setPhotoKind] = useState<'product' | 'dish'>('product');
  const [catKind, setCatKind] = useState<'product' | 'dish'>('product');
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [selectedCatalogDishId, setSelectedCatalogDishId] = useState<string | null>(null);
  const [dishPortion, setDishPortion] = useState('');
  const [catSearch, setCatSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customIngredients, setCustomIngredients] = useState('');
  const [customNutrients, setCustomNutrients] = useState('');
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  // Photo mode (primary scenario) — like chat attachments
  const [analysisPhotos, setAnalysisPhotos] = useState<string[]>([]);
  const [photoName, setPhotoName] = useState('');
  const [compressingPhotos, setCompressingPhotos] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const analysisFileInputRef = useRef<HTMLInputElement>(null);

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

  // Analyses: filter by name, summary, verdict label and dish components (case-insensitive)
  const filteredAnalyses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return productAnalyses;
    return productAnalyses.filter(
      (a) =>
        a.productName.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        PRODUCT_VERDICT_LABELS[a.verdict].toLowerCase().includes(q) ||
        (a.dishComponents?.some((c) => c.productName.toLowerCase().includes(q)) ?? false)
    );
  }, [productAnalyses, search]);

  // Catalog products available in the new-analysis dialog (searchable)
  const filteredCatProducts = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return foodProducts;
    return foodProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [foodProducts, catSearch]);

  // Catalog dishes available in the new-analysis dialog (searchable)
  const filteredCatDishes = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return dishes;
    return dishes.filter((d) => d.name.toLowerCase().includes(q));
  }, [dishes, catSearch]);

  // The dish currently selected for analysis in the catalog mode
  const selectedCatalogDish: Dish | undefined = useMemo(
    () => dishes.find((d) => d.id === selectedCatalogDishId),
    [dishes, selectedCatalogDishId]
  );

  // Portion composition preview: components recalculated proportionally to the
  // portion weight (same math as adding a dish to the food diary)
  const selectedDishPortionComponents: AnalysisDishComponent[] = useMemo(() => {
    const dish = selectedCatalogDish;
    if (!dish) return [];
    const totalW = dish.ingredients.reduce((s, i) => s + i.weightGrams, 0);
    const portion = Number(dishPortion) > 0 ? Number(dishPortion) : totalW;
    return dish.ingredients.map((ing) => ({
      productName: getProductName(ing.productId),
      grams: totalW > 0 ? Math.round((ing.weightGrams / totalW) * portion) : ing.weightGrams,
    }));
  }, [selectedCatalogDish, dishPortion, foodProducts]);

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
    setAnalysisMode('photo');
    setPhotoKind('product');
    setCatKind('product');
    setSelectedCatalogId(null);
    setSelectedCatalogDishId(null);
    setDishPortion('');
    setCatSearch('');
    setCustomName('');
    setCustomIngredients('');
    setCustomNutrients('');
    setAnalysisPhotos([]);
    setPhotoName('');
    setCompressingPhotos(false);
    setAnalysisError('');
    setAnalysisRunning(false);
    setNewAnalysisOpen(true);
  };

  const closeNewAnalysis = () => {
    setNewAnalysisOpen(false);
    setAnalysisError('');
    setAnalysisRunning(false);
  };

  const handleAttachAnalysisPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file
    if (files.length === 0) return;
    setAnalysisError('');
    try {
      setCompressingPhotos(true);
      const compressed = await Promise.all(files.map((f) => compressImageFile(f)));
      setAnalysisPhotos((prev) => [...prev, ...compressed].slice(0, MAX_ANALYSIS_PHOTOS));
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Не удалось обработать изображение');
    } finally {
      setCompressingPhotos(false);
    }
  };

  // Take a photo with the camera right now and attach it like a gallery pick
  const handleTakeAnalysisPhoto = async () => {
    if (analysisPhotos.length >= MAX_ANALYSIS_PHOTOS) return;
    setAnalysisError('');
    try {
      setCompressingPhotos(true);
      const dataUrl = await takePhotoNow();
      if (!dataUrl) return; // cancelled
      setAnalysisPhotos((prev) => [...prev, dataUrl].slice(0, MAX_ANALYSIS_PHOTOS));
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Не удалось сделать снимок');
    } finally {
      setCompressingPhotos(false);
    }
  };

  const removeAnalysisPhoto = (idx: number) => {
    setAnalysisPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRunAnalysis = async () => {
    if (analysisRunning) return;
    let input: {
      productName: string;
      ingredients?: string;
      nutrientsPer100g?: string;
      sourceProductId?: string;
      sourceDishId?: string;
      kind?: 'product' | 'dish';
      dishComponents?: AnalysisDishComponent[];
      dishTotalWeight?: number;
      photos?: string[];
    } | null = null;

    if (analysisMode === 'photo') {
      if (analysisPhotos.length === 0) return;
      if (photoKind === 'dish') {
        input = {
          productName: photoName.trim(),
          photos: [...analysisPhotos],
          kind: 'dish',
          dishTotalWeight: Number(dishPortion) > 0 ? Number(dishPortion) : undefined,
        };
      } else {
        input = { productName: photoName.trim(), photos: [...analysisPhotos], kind: 'product' };
      }
    } else if (analysisMode === 'catalog') {
      if (catKind === 'dish') {
        const d = dishes.find((x) => x.id === selectedCatalogDishId);
        if (!d) return;
        const totalW = d.ingredients.reduce((s, i) => s + i.weightGrams, 0);
        const portion = Number(dishPortion) > 0 ? Number(dishPortion) : totalW;
        const comps: AnalysisDishComponent[] = d.ingredients.map((ing) => ({
          productName: getProductName(ing.productId),
          grams: totalW > 0 ? Math.round((ing.weightGrams / totalW) * portion) : ing.weightGrams,
        }));
        input = {
          productName: d.name,
          kind: 'dish',
          dishComponents: comps,
          dishTotalWeight: portion,
          sourceDishId: d.id,
          photos: analysisPhotos.length > 0 ? [...analysisPhotos] : undefined,
        };
      } else {
        const p = foodProducts.find((x) => x.id === selectedCatalogId);
        if (!p) return;
        input = { productName: p.name, sourceProductId: p.id, kind: 'product' };
      }
    } else {
      if (!customName.trim()) return;
      input = {
        productName: customName.trim(),
        ingredients: customIngredients.trim() || undefined,
        nutrientsPer100g: customNutrients.trim() || undefined,
        kind: 'product',
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

  // Selecting a dish pre-fills the portion weight with the full dish weight
  const selectCatalogDish = (id: string | null) => {
    setSelectedCatalogDishId(id);
    if (id) {
      const d = dishes.find((x) => x.id === id);
      const totalW = d ? d.ingredients.reduce((s, i) => s + i.weightGrams, 0) : 0;
      setDishPortion(totalW > 0 ? String(totalW) : '');
    } else {
      setDishPortion('');
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
                        <span key={idx} className="text-[10px] rounded bg-muted px-1.5 py-0.5 max-w-full truncate">
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
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-medium truncate">{a.productName}</p>
                        {a.kind === 'dish' && (
                          <Badge variant="secondary" className="text-[9px] shrink-0 gap-0.5">
                            <UtensilsCrossed className="h-2.5 w-2.5" /> Блюдо
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        {a.source === 'photo' && <Camera className="h-3 w-3 shrink-0" />}
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
                    {a.photos && a.photos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {a.photos.map((img, i) => (
                          <img
                            key={i}
                            src={img}
                            alt={`Фото ${i + 1}`}
                            className="h-14 w-14 rounded-md object-cover cursor-pointer border border-border"
                            onClick={() => setViewingImage(img)}
                          />
                        ))}
                      </div>
                    )}
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
                    {a.kind === 'dish' && (a.dishTotalWeight != null || (a.dishComponents && a.dishComponents.length > 0)) && (
                      <div className="text-[10px] text-muted-foreground space-y-1">
                        {a.dishTotalWeight != null && (
                          <p>
                            <span className="font-medium">Порция:</span> {a.dishTotalWeight} г
                          </p>
                        )}
                        {a.dishComponents && a.dishComponents.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {a.dishComponents.map((c, i) => (
                              <span key={i} className="rounded bg-muted px-1.5 py-0.5 max-w-full truncate">
                                {c.productName} {c.grams}г
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <MarkdownRenderer content={a.analysis} className="text-foreground" />
                    <div className="flex items-center justify-end gap-1">
                      <TTSButton
                        text={a.analysis}
                        enabled={ttsEnabled}
                        sourceId={a.id}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="rounded-md p-1.5 hover:bg-destructive/10 text-destructive"
                            title="Удалить анализ"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
                  Нажмите «Новый анализ» и сфотографируйте продукт или блюдо — модель сама
                  определит, подходит ли оно именно вам
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
              Новый анализ
            </DialogTitle>
          </DialogHeader>

          {analysisRunning ? (
            <div className="py-8 flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              <span>Анализирую…</span>
              <span className="text-xs">Обычно это занимает меньше минуты</span>
            </div>
          ) : (
            <div className="space-y-3 py-1 min-w-0">
              {analysisError && (
                <div className="text-xs text-destructive bg-destructive/10 rounded-md p-3 break-words">
                  {analysisError}
                </div>
              )}

              {/* Mode toggle — photo first (primary scenario) */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => setAnalysisMode('photo')}
                  className={`flex-1 flex items-center justify-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                    analysisMode === 'photo'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Camera className="h-3.5 w-3.5 shrink-0" /> Фото
                </button>
                <button
                  onClick={() => setAnalysisMode('catalog')}
                  className={`flex-1 rounded-lg border p-2 text-xs transition-colors ${
                    analysisMode === 'catalog'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Из каталога
                </button>
                <button
                  onClick={() => setAnalysisMode('custom')}
                  className={`flex-1 rounded-lg border p-2 text-xs transition-colors ${
                    analysisMode === 'custom'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Свой продукт
                </button>
              </div>

              {analysisMode === 'photo' ? (
                /* Photo mode — primary scenario: take a shot now or pick 1..N photos.
                   Kind toggle: package (product) vs ready meal (dish). */
                <div className="space-y-3 min-w-0">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPhotoKind('product')}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                        photoKind === 'product'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Package className="h-3.5 w-3.5 shrink-0" /> Продукт (упаковка)
                    </button>
                    <button
                      onClick={() => setPhotoKind('dish')}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                        photoKind === 'dish'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <UtensilsCrossed className="h-3.5 w-3.5 shrink-0" /> Блюдо (готовое)
                    </button>
                  </div>

                  <input
                    ref={analysisFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAttachAnalysisPhotos}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleTakeAnalysisPhoto}
                      disabled={compressingPhotos || analysisPhotos.length >= MAX_ANALYSIS_PHOTOS}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 text-sm text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
                    >
                      {compressingPhotos ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Camera className="h-5 w-5" />
                      )}
                      <span className="font-medium">Сфотографировать</span>
                    </button>
                    <button
                      onClick={() => analysisFileInputRef.current?.click()}
                      disabled={compressingPhotos || analysisPhotos.length >= MAX_ANALYSIS_PHOTOS}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 text-sm text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
                    >
                      {compressingPhotos ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <ImageIcon className="h-5 w-5" />
                      )}
                      <span className="font-medium">Из галереи</span>
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {photoKind === 'dish'
                      ? `Готовое блюдо с разных ракурсов — до ${MAX_ANALYSIS_PHOTOS} фото`
                      : `Этикетка, состав, таблица КБЖУ — до ${MAX_ANALYSIS_PHOTOS} фото`}
                  </p>

                  {analysisPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {analysisPhotos.map((img, idx) => (
                        <div key={idx} className="relative">
                          <img
                            src={img}
                            alt={`Фото ${idx + 1}`}
                            className="h-16 w-16 rounded-md object-cover cursor-pointer border border-border"
                            onClick={() => setViewingImage(img)}
                          />
                          <button
                            onClick={() => removeAnalysisPhoto(idx)}
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive text-white p-0.5 shadow"
                            title="Удалить фото"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Название {photoKind === 'dish' ? 'блюда' : 'продукта'} (необязательно)
                    </Label>
                    <Input
                      value={photoName}
                      onChange={(e) => setPhotoName(e.target.value)}
                      placeholder={photoKind === 'dish' ? 'Модель определит блюдо с фото' : 'Модель определит название с фото'}
                      className="text-sm"
                    />
                  </div>

                  {photoKind === 'dish' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Вес порции, г (необязательно)</Label>
                      <Input
                        type="number"
                        value={dishPortion}
                        onChange={(e) => setDishPortion(e.target.value)}
                        placeholder="Модель оценит вес по фото"
                        className="text-sm"
                      />
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {photoKind === 'dish'
                      ? 'Модель определит блюдо и его составляющие по фотографиям, оценит КБЖУ порции, сопоставит с вашим профилем и даст вердикт — набирать текст не нужно.'
                      : 'Модель сама считает название, состав и КБЖУ с фотографий, сопоставит с вашим профилем и даст вердикт — набирать текст не нужно.'}
                  </p>
                </div>
              ) : analysisMode === 'catalog' ? (
                /* Catalog picker — product or dish */
                <div className="space-y-2 min-w-0">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setCatKind('product'); selectCatalogDish(null); }}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                        catKind === 'product'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Package className="h-3.5 w-3.5 shrink-0" /> Продукт
                    </button>
                    <button
                      onClick={() => { setCatKind('dish'); setSelectedCatalogId(null); }}
                      className={`flex-1 flex items-center justify-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                        catKind === 'dish'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <UtensilsCrossed className="h-3.5 w-3.5 shrink-0" /> Блюдо
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                      value={catSearch}
                      onChange={(e) => setCatSearch(e.target.value)}
                      placeholder={catKind === 'dish' ? 'Найти блюдо в каталоге...' : 'Найти продукт в каталоге...'}
                      className="pl-8 pr-8 h-9 text-sm"
                    />
                    {catSearch && (
                      <button onClick={() => setCatSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {catKind === 'product' ? (
                    <div className="max-h-56 overflow-y-auto overflow-x-hidden rounded-lg border divide-y divide-border">
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
                            <span className="truncate min-w-0 flex-1">{p.name}</span>
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
                  ) : (
                    <>
                      <div className="max-h-44 overflow-y-auto overflow-x-hidden rounded-lg border divide-y divide-border">
                        {filteredCatDishes.map((d) => {
                          const selected = selectedCatalogDishId === d.id;
                          const totalW = d.ingredients.reduce((s, i) => s + i.weightGrams, 0);
                          return (
                            <button
                              key={d.id}
                              onClick={() => selectCatalogDish(selected ? null : d.id!)}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                selected
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                                  : 'hover:bg-muted'
                              }`}
                            >
                              <span className="truncate min-w-0 flex-1">
                                {d.name}
                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                  {d.ingredients.length} ингр.{totalW > 0 ? ` · ${totalW}г` : ''}
                                </span>
                              </span>
                              {selected && <Check className="h-4 w-4 shrink-0" />}
                            </button>
                          );
                        })}
                        {filteredCatDishes.length === 0 && (
                          <div className="py-6 text-center text-xs text-muted-foreground">
                            Нет блюд в каталоге
                          </div>
                        )}
                      </div>

                      {selectedCatalogDish && (
                        <div className="space-y-2.5 rounded-lg border bg-muted/30 p-2.5">
                          <div className="flex items-end gap-2">
                            <div className="space-y-1 flex-1 min-w-0">
                              <Label className="text-xs">Вес порции, г</Label>
                              <Input
                                type="number"
                                value={dishPortion}
                                onChange={(e) => setDishPortion(e.target.value)}
                                placeholder="г"
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                          {selectedDishPortionComponents.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-muted-foreground">
                                Состав порции (пересчитан пропорционально):
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {selectedDishPortionComponents.map((c, idx) => (
                                  <span key={idx} className="text-[10px] rounded bg-muted px-1.5 py-0.5 max-w-full truncate">
                                    {c.productName} {c.grams}г
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Optional dish photo (via the same camera/gallery dialog) */}
                          <input
                            ref={analysisFileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleAttachAnalysisPhotos}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={handleTakeAnalysisPhoto}
                              disabled={compressingPhotos || analysisPhotos.length >= MAX_ANALYSIS_PHOTOS}
                            >
                              {compressingPhotos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                              Фото блюда
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => analysisFileInputRef.current?.click()}
                              disabled={compressingPhotos || analysisPhotos.length >= MAX_ANALYSIS_PHOTOS}
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              Галерея
                            </Button>
                          </div>
                          {analysisPhotos.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {analysisPhotos.map((img, idx) => (
                                <div key={idx} className="relative">
                                  <img
                                    src={img}
                                    alt={`Фото блюда ${idx + 1}`}
                                    className="h-14 w-14 rounded-md object-cover cursor-pointer border border-border"
                                    onClick={() => setViewingImage(img)}
                                  />
                                  <button
                                    onClick={() => removeAnalysisPhoto(idx)}
                                    className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive text-white p-0.5 shadow"
                                    title="Удалить фото"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            Модель оценит КБЖУ порции по составу компонентов и вашему профилю. Фото поможет модели точнее учесть способ приготовления.
                          </p>
                        </div>
                      )}
                    </>
                  )}
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
              disabled={
                analysisRunning ||
                (analysisMode === 'photo' && analysisPhotos.length === 0) ||
                (analysisMode === 'catalog' && catKind === 'product' && !selectedCatalogId) ||
                (analysisMode === 'catalog' && catKind === 'dish' && !selectedCatalogDishId) ||
                (analysisMode === 'custom' && !customName.trim())
              }
            >
              {analysisRunning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1.5 h-4 w-4" />}
              {analysisRunning ? 'Анализирую...' : 'Анализировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen image viewer (photos in dialog and saved analyses) */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewingImage(null)}
        >
          <img
            src={viewingImage}
            alt="Просмотр"
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-3 right-3 rounded-full bg-white/10 text-white p-2 hover:bg-white/20"
            onClick={() => setViewingImage(null)}
            title="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
