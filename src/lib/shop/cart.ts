'use client';

import { useEffect, useState } from 'react';

/**
 * The cart, in localStorage. Prices are not stored — the checkout route
 * reprices everything from Firestore, so a stale cart can only be wrong
 * about what someone wants, never about what they pay.
 */

export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  variantId: string;
  variantLabel: string;
  quantity: number;
  priceCents: number; // display only
  currency: string;
  image?: string;
  earnedOnly?: boolean;
}

const KEY = 'wf.cart.v1';
const EVENT = 'wf-cart';

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(list) ? list.filter((l) => l && l.productId && l.variantId) : [];
  } catch {
    return [];
  }
}
function write(lines: CartLine[]) {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(line: Omit<CartLine, 'quantity'>, quantity = 1) {
  const lines = read();
  const i = lines.findIndex((l) => l.productId === line.productId && l.variantId === line.variantId);
  if (i >= 0) lines[i].quantity = Math.min(10, lines[i].quantity + quantity);
  else lines.push({ ...line, quantity: Math.min(10, quantity) });
  write(lines);
}
export function setQuantity(productId: string, variantId: string, quantity: number) {
  const lines = read().map((l) => (l.productId === productId && l.variantId === variantId ? { ...l, quantity } : l)).filter((l) => l.quantity > 0);
  write(lines);
}
export function removeFromCart(productId: string, variantId: string) { setQuantity(productId, variantId, 0); }
export function clearCart() { write([]); }

export function useCart(): CartLine[] {
  const [lines, setLines] = useState<CartLine[]>([]);
  useEffect(() => {
    const sync = () => setLines(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  return lines;
}

export function money(cents: number, currency = 'USD'): string {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}
