import { useCallback, useEffect, useState } from 'react';
import { SHOP_CART_STORAGE_KEY, cartItemKey, type CartItem } from './shopTypes';

function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(SHOP_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearStoredCart() {
  try {
    localStorage.removeItem(SHOP_CART_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => readCart());

  useEffect(() => {
    try {
      localStorage.setItem(SHOP_CART_STORAGE_KEY, JSON.stringify(items));
    } catch { /* ignore */ }
  }, [items]);

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      const key = cartItemKey(item);
      const existing = prev.find(i => cartItemKey(i) === key);
      if (existing) {
        return prev.map(i => (cartItemKey(i) === key ? { ...i, qty: i.qty + item.qty } : i));
      }
      return [...prev, item];
    });
  }, []);

  const updateQty = useCallback((key: string, qty: number) => {
    setItems(prev =>
      qty <= 0
        ? prev.filter(i => cartItemKey(i) !== key)
        : prev.map(i => (cartItemKey(i) === key ? { ...i, qty } : i))
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems(prev => prev.filter(i => cartItemKey(i) !== key));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    clearStoredCart();
  }, []);

  const count = items.reduce((sum, i) => sum + i.qty, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  return { items, addItem, updateQty, removeItem, clear, count, subtotal };
}
