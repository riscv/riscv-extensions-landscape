import React from 'react';
import { X } from 'lucide-react';
import DependencyGraph from './DependencyGraph';

const DependencyModal = ({ isOpen, onClose, data, onSelectExtension }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span className="text-purple-400">📊</span> Extension Dependency Graph
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualize relationships, bundling, and requirements across the RISC-V landscape.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950/50">
          <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-600 px-2 py-1 bg-slate-800 rounded">Interactive</span>
              <span className="text-[10px] uppercase font-bold text-slate-600 px-2 py-1 bg-slate-800 rounded">Navigable</span>
            </div>
            <div className="text-[11px] text-slate-500 italic">
              * Click on any extension node to view its detailed instruction set.
            </div>
          </div>
          
          <DependencyGraph data={data} onSelectExtension={onSelectExtension} />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg border border-slate-700 transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};

export default DependencyModal;
