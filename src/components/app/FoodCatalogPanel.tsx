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
} from 'lucide-react';
import type { DishIngredientData, FoodEntryItem } from '@/lib/types';

export default function FoodCatalogPanel() {
  const foodProducts = useAppStore((s) => s.foodProducts);
  const dishes = useAppStore((s) => s.dishes);
  const addFoodProduct = useAppStore((s) => s.addFoodProduct);
  const updateFoodProduct = useAppStore((s) => s.updateFoodProduct);
  const deleteFoodProduct = useAppStore((s) => s.deleteFoodProduct);
  const addDish = useAppStore((s) => s.addDish);
  const updateDish = useAppStore((s) => s.updateDish);
  const deleteDish = useAppStore((s) => s.deleteDish);

  const [tab, setTab] = useState<'products' | 'dishes'>('products');
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
      {/* Tabs */}
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === 'products' ? 'Поиск продуктов...' : 'Поиск блюд...'}
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
    </div>
  );
}
