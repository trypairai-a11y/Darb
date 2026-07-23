"use client";
import { X } from "lucide-react";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function SlidePanel({ open, onClose, title, subtitle, children }: SlidePanelProps) {
  if (!open) return null;
  return (
    <div className="fixed top-16 left-0 right-0 bottom-0 bg-navy-900/25 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-card border-s border-sand-200 w-full max-w-md h-full shadow-float overflow-y-auto p-6 animate-in slide-in-from-right duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            {subtitle && <span className="text-[11px] uppercase tracking-widest text-sand-600">{subtitle}</span>}
            <h2 className="font-display text-display-sm text-sand-900 mt-0.5">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-pill hover:bg-sand-100 text-sand-700 transition-colors duration-250 ease-sierra-out">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
