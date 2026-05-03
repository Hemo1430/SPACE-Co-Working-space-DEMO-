import React, { useState } from 'react';
import { Trash2, RotateCcw, X, Clock } from 'lucide-react';
import { useHistory } from '../context/HistoryContext';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export const RecycleBin: React.FC = () => {
  const { deletedItems, restore } = useHistory();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg border transition-all flex items-center gap-2 relative ${
          isOpen ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-zinc-500 hover:text-white'
        }`}
      >
        <Trash2 size={16} />
        {deletedItems.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {deletedItems.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-4 w-80 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Recycle Bin (Last 30m)</span>
                <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">
                  <X size={14} />
                </button>
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {deletedItems.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center gap-3">
                    <Trash2 size={24} className="text-zinc-800" />
                    <p className="text-xs text-zinc-600 font-medium">No recently removed items</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {deletedItems.map((item) => (
                      <div key={item.id + item.timestamp} className="p-4 hover:bg-white/5 transition-colors group">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{item.label}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-bold text-zinc-500 uppercase bg-white/5 px-1.5 py-0.5 rounded">
                                {item.collectionPath.split('/').pop()}
                              </span>
                              <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                                <Clock size={10} />
                                {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <button 
                            onClick={async () => {
                              await restore(item);
                            }}
                            className="bg-white/5 hover:bg-white/20 p-2 rounded-lg text-zinc-400 hover:text-white transition-all transform active:scale-95"
                          >
                            <RotateCcw size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
