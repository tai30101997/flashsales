"use client";

import React, { useState } from "react";
import { api } from "../src/app/core/axios";
interface Props {
  productId: string;
  saleStatus: string;
  onSuccess: () => void;
}

export default function FlashSaleAction({ productId, saleStatus, onSuccess }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  const handlePurchase = async () => {
    if (!email.trim()) return;
    setIsSubmitting(true);
    setMessage({ text: "Processing...", type: "info" });

    try {
      const { data } = await api.post("/purchase", {
        userEmail: email,
        productId: productId,
      });

      if (data.success) {
        setMessage({ text: "Purchase Successful!", type: "success" });
        setTimeout(() => {
          setIsOpen(false);
          onSuccess();
        }, 2000);
      } else {
        setMessage({ text: data.message, type: "error" });
      }
    } catch (err: any) {
      setMessage({
        text: err.response?.data?.message || "Purchase failed",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        disabled={saleStatus !== 'ACTIVE'}
        onClick={() => setIsOpen(true)}
        className={`px-8 py-3 rounded-2xl font-black text-xs shadow-xl transition-all active:scale-95 uppercase tracking-widest ${saleStatus === 'ACTIVE'
          ? "bg-blue-600 hover:bg-blue-700 text-white"
          : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
      >
        {saleStatus === 'ACTIVE' ? "Buy Now" : `Sale ${saleStatus}`}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase tracking-tighter italic">Confirm Purchase</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-900 font-bold">Close</button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Product ID</p>
                <p className="font-bold text-slate-900">{productId}</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Your Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-2xl bg-slate-50 border-none p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              {message.text && (
                <p className={`text-center text-[11px] font-black uppercase ${message.type === 'success' ? 'text-green-500' : 'text-red-500'
                  }`}>
                  {message.text}
                </p>
              )}

              <button
                onClick={handlePurchase}
                disabled={isSubmitting || !email}
                className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-xs shadow-lg transition disabled:bg-slate-200 uppercase tracking-widest active:scale-95"
              >
                {isSubmitting ? "Processing..." : "Confirm & Pay"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}