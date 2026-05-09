'use client';
import { ProductCard } from 'apps/web-app/components/ProductCard';
import { PurchaseModal } from 'apps/web-app/components/PurchaseModal';
import React, { useState, useEffect, useCallback } from 'react';
import { ProductInfo } from './core/types';

const FlashSaleApp = () => {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Fetch products from API 
  const fetchProducts = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:3333/api/orders/products');
      const result = await response.json();
      if (result.success) {
        setProducts(result.data.products);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSyncAll = async () => {
    if (products.length === 0) return;

    setIsSyncing(true);
    try {
      await Promise.all(
        products.map((p: ProductInfo) =>
          fetch('http://localhost:3333/api/orders/sync-cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: p.productId })
          })
        )
      );
      alert("System Cache Initialized Successfully!");
      await fetchProducts();
    } catch (error) {
      console.error("Sync Error:", error);
      alert("Failed to sync some products.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    const interval = setInterval(fetchProducts, 10000);
    return () => clearInterval(interval);
  }, [fetchProducts]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      <header className="max-w-6xl mx-auto mb-10 text-center relative">
        <h1 className="text-4xl font-black text-orange-500 uppercase italic tracking-tighter">
          Flash Sale Dashboard
        </h1>
        <div className="h-1 w-20 bg-orange-600 mx-auto mt-2"></div>

        <button
          onClick={handleSyncAll}
          disabled={isSyncing || loading}
          className={`absolute right-0 top-0 mt-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border 
            ${isSyncing
              ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-orange-600/10 border-orange-500/50 text-orange-500 hover:bg-orange-600 hover:text-white'}`}
        >
          {isSyncing ? 'Syncing...' : 'System Warm-up'}
        </button>
      </header>

      {loading ? (
        <div className="text-center py-20 animate-pulse text-slate-500 uppercase tracking-widest text-sm">Initializing System...</div>
      ) : (
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product: ProductInfo) => (
            <ProductCard
              key={product.productId}
              product={product}
              onOpenPurchase={() => setSelectedProduct(product)}
            />
          ))}
        </div>
      )}

      {selectedProduct && (
        <PurchaseModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          refreshProducts={fetchProducts}
        />
      )}
    </div>
  );
};




export default FlashSaleApp;