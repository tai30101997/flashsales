import { useState } from "react";
import { ProductInfo } from "../src/app/core/types";
interface PurchaseModalProps {
  product: ProductInfo;
  onClose: () => void;
  refreshProducts: () => void;
}
export const PurchaseModal = ({ product, onClose, refreshProducts }: PurchaseModalProps) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('IDLE');
  const [message, setMessage] = useState('');

  const submitOrder = async () => {
    if (!email) return alert("Email is required");
    setStatus('QUEUING');
    try {
      const res = await fetch('http://localhost:3333/api/orders/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail: email, productId: product.productId })
      });
      const data = await res.json();
      if (data.success) {
        pollResult();
      } else {
        setStatus('FAIL');
        setMessage(data.message);
      }
    } catch (e) {
      setStatus('FAIL');
      setMessage("Server connection failed");
    }
  };

  const pollResult = () => {
    let count = 0;
    const interval = setInterval(async () => {
      count++;
      try {
        const res = await fetch(`http://localhost:3333/api/orders/user-order?userEmail=${email}&productId=${product.productId}`);
        const result = await res.json();
        if (result.success && result.data) {
          setStatus('SUCCESS');
          clearInterval(interval);
          refreshProducts();
        } else if (count >= 15) {
          setStatus('FAIL');
          setMessage("High traffic. Order could not be finalized.");
          clearInterval(interval);
        }
      } catch (e) {
        console.error("Polling error", e);
      }
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-sm w-full shadow-2xl">
        {status === 'IDLE' && (
          <div className="space-y-6 text-center">
            <h2 className="text-xl font-bold italic uppercase tracking-tight">Verify Email</h2>
            <input
              type="email"
              className="w-full bg-slate-950 border border-slate-800 p-4 rounded-xl outline-none focus:border-orange-600 transition-colors text-white"
              placeholder="e.g. user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 text-slate-500 font-bold uppercase text-xs">Cancel</button>
              <button onClick={submitOrder} className="flex-2 bg-orange-600 px-6 py-3 rounded-xl font-black uppercase text-white shadow-lg">Confirm</button>
            </div>
          </div>
        )}
        {status === 'QUEUING' && (
          <div className="text-center space-y-4 py-6">
            <div className="w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-orange-500 font-bold animate-pulse uppercase tracking-widest text-sm">Securing your item...</p>
          </div>
        )}
        {status === 'SUCCESS' && (
          <div className="text-center space-y-6">
            <div className="text-5xl">🎉</div>
            <h2 className="text-2xl font-black text-green-500 italic uppercase tracking-tighter">Order Success!</h2>
            <p className="text-slate-400 text-sm">Congratulations! You have secured <b>{product.name}</b>.</p>
            <button onClick={onClose} className="w-full bg-slate-800 py-3 rounded-xl font-bold uppercase text-xs text-white">Continue Shopping</button>
          </div>
        )}
        {status === 'FAIL' && (
          <div className="text-center space-y-6">
            <div className="text-5xl">⚠️</div>
            <h2 className="text-2xl font-black text-red-500 italic uppercase tracking-tighter">Failed</h2>
            <p className="text-slate-400 text-sm">{message}</p>
            <button onClick={() => setStatus('IDLE')} className="w-full bg-slate-800 py-3 rounded-xl font-bold uppercase text-xs text-white">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
};


