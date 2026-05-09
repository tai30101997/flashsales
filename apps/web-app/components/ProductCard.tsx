import { useState, useEffect } from "react";
import { ProductInfo } from "../src/app/core/types";
interface ProductCardProps {
  product: ProductInfo;
  onOpenPurchase: () => void;
}
export const ProductCard = ({ product, onOpenPurchase }: ProductCardProps) => {
  const [timeLeft, setTimeLeft] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const start = new Date(product.start_time).getTime();
      const end = new Date(product.end_time).getTime();

      if (now < start) {
        const diff = start - now;
        setTimeLeft(formatTime(diff));
        setIsReady(false);
      } else if (now >= start && now <= end) {
        setTimeLeft('LIVE NOW');
        setIsReady(true);
      } else {
        setTimeLeft('ENDED');
        setIsReady(false);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [product]);

  const formatTime = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isSoldOut = product.remainingStock <= 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition-transform hover:scale-[1.02]">
      <div className="relative h-44 bg-white flex items-center justify-center p-4">
        <img src={product.image_url} alt={product.name} className="max-h-full object-contain" />
        {isSoldOut && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-white font-bold text-2xl rotate-12 border-4 border-white px-4 py-2 uppercase">Sold Out</span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        <h3 className="font-bold text-lg truncate">{product.name}</h3>
        <div className="flex justify-between items-baseline">
          <span className="text-3xl font-black text-orange-500">${product.price}</span>
          <span className="text-xs text-slate-500 uppercase tracking-widest font-mono">{timeLeft}</span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
            <span>Stock: {product.remainingStock}</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full">
            <div
              className="bg-orange-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${(product.remainingStock / 1000) * 100}%` }}
            ></div>
          </div>
        </div>

        <button
          disabled={!isReady || isSoldOut}
          onClick={onOpenPurchase}
          className={`w-full py-3 rounded-xl font-black uppercase tracking-tighter transition-all ${isReady && !isSoldOut
            ? 'bg-orange-600 hover:bg-orange-500 active:scale-95 text-white'
            : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}
        >
          {isSoldOut ? 'Sold Out' : isReady ? 'Buy Now' : 'Upcoming'}
        </button>
      </div>
    </div>
  );
};


