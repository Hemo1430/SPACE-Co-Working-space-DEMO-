import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, Wallet, FileText, Calendar, Search } from 'lucide-react';
import { useDate } from '../context/DateContext';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc,
  query,
  where,
  serverTimestamp 
} from '../lib/firestoreDemo';
import { db, handleFirestoreError, OperationType, AppSettings, DEFAULT_SETTINGS, calculateStepPricing } from '../lib/firebase';

export const Income: React.FC = () => {
  const { dateString, selectedDate } = useDate();
  const [data, setData] = useState({
    notes: '',
    instapay: 0 as string | number,
    cash: 0,
    subsManual: 0,
    roomsManual: 0,
    otherItems: [] as { label: string; amount: string | number }[],
  });
  
  const [stats, setStats] = useState({
    checkInTotal: 0,
    kitchenTotal: 0,
    roomsTotal: 0,
    subscriptionsTotal: 0,
    totalEntries: 0,
    unlinkedKitchenTotal: 0,
  });

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchTerm === 'hemospace1430') {
      const projectId = 'gen-lang-client-0060595329';
      const databaseId = 'ai-studio-85edc624-bd1d-46db-895b-6b4ee4ee7632';
      const url = `https://console.firebase.google.com/project/${projectId}/firestore/databases/${databaseId}/data`;
      window.open(url, '_blank');
      setSearchTerm('');
    }
  }, [searchTerm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Search shortcut (Ctrl + S)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      
      // Ctrl + N shortcut
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    // Separate Settings Sync - only once
    const settingsPath = 'settings/global';
    const settingsUnsubscribe = onSnapshot(doc(db, settingsPath), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as AppSettings);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, settingsPath));

    return () => settingsUnsubscribe();
  }, []);

  useEffect(() => {
    if (!dateString) return;

    // Reset stats when date changes to avoid showing stale data in calculations
    setStats({
      checkInTotal: 0,
      kitchenTotal: 0,
      roomsTotal: 0,
      subscriptionsTotal: 0,
      totalEntries: 0,
      unlinkedKitchenTotal: 0,
    });

    // 1. Sync Summary Data
    const summaryPath = `days/${dateString}`;
    const summaryUnsubscribe = onSnapshot(doc(db, summaryPath), (snapshot) => {
      // Don't overwrite if user is focusing on an input (simple heuristic)
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        // We still check if the date changed though
        return;
      }

      if (snapshot.exists()) {
        const d = snapshot.data();
        setData({
          notes: d.notes || '',
          instapay: d.instapay || 0,
          cash: d.cash || 0,
          subsManual: d.subsManual || 0,
          roomsManual: d.roomsManual || 0,
          otherItems: d.otherItems || [],
        });
      } else {
        setData({ notes: '', instapay: 0, cash: 0, subsManual: 0, roomsManual: 0, otherItems: [] });
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, summaryPath));

    // 2. Aggregate Data from subcollections
    const checkinsUnsubscribe = onSnapshot(collection(db, `days/${dateString}/checkins`), (s) => {
      let seatFeesTotal = 0;
      let traffic = s.size;
      
      const currentSettings = settings || DEFAULT_SETTINGS;
      const standardRate = Number(currentSettings.hourPrices?.standard) || DEFAULT_SETTINGS.hourPrices.standard;
      const maxPrice = Number(currentSettings.hourPrices?.lateNight) || DEFAULT_SETTINGS.hourPrices.lateNight;

      s.docs.forEach(d => {
        const dData = d.data();
        const isCheckedOut = dData.checkOut && dData.checkOut !== '' && dData.checkOut !== '--:--';
        
        if (isCheckedOut && dData.checkIn && dData.checkIn !== '--:--') {
          const [hIn, mIn] = dData.checkIn.split(':').map(Number);
          const [y, m, d_val] = dateString.split('-').map(Number);
          const checkInDate = new Date(y, m - 1, d_val, hIn, mIn);
          
          const [hOut, mOut] = dData.checkOut.split(':').map(Number);
          const endTime = new Date(y, m - 1, d_val, hOut, mOut);

          const diffMs = endTime.getTime() - checkInDate.getTime();
          const totalMinutes = Math.floor(diffMs / 60000);
          
          if (totalMinutes > 0) {
            const seatFee = calculateStepPricing(totalMinutes, standardRate, maxPrice);
            seatFeesTotal += seatFee;
          }
        }
      });
      setStats(prev => ({ ...prev, checkInTotal: seatFeesTotal, totalEntries: traffic }));
    });

    const kitchenUnsubscribe = onSnapshot(collection(db, `days/${dateString}/kitchenSales`), (s) => {
      const docs = s.docs.map(d => d.data());
      const total = docs.reduce((acc, d) => acc + (d.freeDrink ? 0 : (d.price || 0)), 0);
      const unlinked = docs.filter(d => !d.customerId || d.customerId.trim() === '').length;
      setStats(prev => ({ ...prev, kitchenTotal: total, unlinkedKitchenTotal: unlinked }));
    });

    const roomsUnsubscribe = onSnapshot(query(collection(db, 'roomBookings'), where('bookingDate', '==', dateString)), (s) => {
      const total = s.docs.reduce((acc, d) => acc + (d.data().price || 0), 0);
      setStats(prev => ({ ...prev, roomsTotal: total }));
    });

    // 3. Subscriptions created on this date
    const subsUnsubscribe = onSnapshot(query(collection(db, 'subscriptions'), where('start', '==', dateString)), (s) => {
      let total = 0;
      const plans = settings?.subscriptions || DEFAULT_SETTINGS.subscriptions;
      s.docs.forEach(d => {
        const sub = d.data();
        const plan = plans.find(p => p.name === sub.type);
        if (plan) {
          total += Number(plan.price) || 0;
        }
      });
      setStats(prev => ({ ...prev, subscriptionsTotal: total }));
    });

    return () => {
      summaryUnsubscribe();
      checkinsUnsubscribe();
      kitchenUnsubscribe();
      roomsUnsubscribe();
      subsUnsubscribe();
    };
  }, [dateString, settings]);

  const handleSaveSummary = async (updates: Partial<typeof data>) => {
    if (!dateString || dateString === 'NaN-aN-aN') return; // Guard against common invalid date strings
    const path = `days/${dateString}`;
    
    // Convert strings back to numbers for DB storage
    const sanitizedUpdates = { ...updates };
    if (sanitizedUpdates.instapay !== undefined) {
      sanitizedUpdates.instapay = parseFloat(sanitizedUpdates.instapay.toString()) || 0;
    }
    if (sanitizedUpdates.otherItems !== undefined) {
      sanitizedUpdates.otherItems = sanitizedUpdates.otherItems.map(it => ({
        ...it,
        amount: parseFloat(it.amount.toString()) || 0
      }));
    }

    try {
      await setDoc(doc(db, path), {
        ...sanitizedUpdates,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) { 
      // If it's a 404/not found, it's often because the path was malformed
      console.error("Firestore save error at path:", path, e);
      handleFirestoreError(e, OperationType.UPDATE, path); 
    }
  };

  const othersTotal = data.otherItems.reduce((acc, item) => acc + (parseFloat(item.amount.toString()) || 0), 0);
  const revenueTotal = stats.checkInTotal + stats.kitchenTotal + stats.subscriptionsTotal + stats.roomsTotal + othersTotal;

  // Auto-sync Cash field to ensure it always matches (Total Revenue - Instapay)
  // This solves the issue where deleted items (checkins, food, etc) would leave the stored cash value stale.
  useEffect(() => {
    const instapayNum = parseFloat(data.instapay.toString()) || 0;
    const calculatedCash = Math.max(0, revenueTotal - instapayNum);
    // Only update if there's a real difference to avoid redundant writes
    if (Math.abs(data.cash - calculatedCash) > 0.01) {
      setData(prev => ({ ...prev, cash: calculatedCash }));
      // Persist to DB so other clients/refreshes see the corrected value
      handleSaveSummary({ cash: calculatedCash });
    }
  }, [revenueTotal, data.instapay, data.cash, dateString]);

  const totalIncome = revenueTotal;

  return (
    <main className="max-w-[1440px] mx-auto px-6 md:px-12 py-12 flex flex-col gap-12">
      {/* Search Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 -mb-6">
        <h1 className="font-h3 text-white">Daily Income Summary</h1>
        <div className="flex items-center gap-2 text-zinc-500 border border-white/10 px-4 py-2 rounded-lg bg-surface-container-lowest w-full md:w-64">
          <Search size={16} />
          <input
            ref={searchInputRef}
            className="bg-transparent border-none focus:ring-0 text-sm w-full placeholder:text-zinc-600 outline-none"
            placeholder="Search income data... (CTRL+S)"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Header: Stat Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
        {/* Card 1: Check-ins */}
        <div className="bg-surface-container-low/20 backdrop-blur-2xl border border-white/5 rounded-3xl p-6 text-center hover:bg-white/5 transition-all duration-500 group relative overflow-hidden flex flex-col items-center justify-center min-h-[160px] shadow-xl">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
          <span className="font-sans text-[10px] text-zinc-500 font-black tracking-[0.3em] uppercase mb-4 relative z-10 flex items-center gap-2">
            <span className="w-1 h-1 bg-primary rounded-full animate-ping"></span>
            Seat Income
          </span>
          <span className="font-display text-3xl font-bold text-white relative z-10 tabular-nums">
            {stats.checkInTotal.toLocaleString()} <span className="text-xs font-medium text-zinc-600">EGP</span>
          </span>
          <div className="mt-2 text-[10px] text-zinc-600 font-medium relative z-10 uppercase tracking-widest">{stats.totalEntries} Visitors today</div>
        </div>

        {/* Card 2: Kitchen */}
        <div className="bg-surface-container-low/20 backdrop-blur-2xl border border-white/5 rounded-3xl p-6 text-center hover:bg-white/5 transition-all duration-500 group relative overflow-hidden flex flex-col items-center justify-center min-h-[160px] shadow-xl">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-tertiary-container/5 rounded-full blur-2xl group-hover:bg-tertiary-container/10 transition-colors"></div>
          <span className="font-sans text-[10px] text-zinc-500 font-black tracking-[0.3em] uppercase mb-4 relative z-10 flex items-center gap-2">
             <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse"></span>
             Kitchen
          </span>
          <span className="font-display text-3xl font-bold text-white relative z-10 tabular-nums">
            {stats.kitchenTotal.toLocaleString()} <span className="text-xs font-medium text-zinc-600">EGP</span>
          </span>
          <div className="mt-2 text-[10px] text-zinc-600 font-medium relative z-10 uppercase tracking-widest">{stats.unlinkedKitchenTotal.toLocaleString()} Unlinked Sales</div>
        </div>

        {/* Card 3: Subscriptions (Automated) */}
        <div className="bg-surface-container-low/20 backdrop-blur-2xl border border-white/5 rounded-3xl p-6 text-center hover:bg-white/5 transition-all duration-500 group relative overflow-hidden flex flex-col items-center justify-center min-h-[160px] shadow-xl">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors"></div>
          <span className="font-sans text-[10px] text-zinc-500 font-black tracking-[0.3em] uppercase mb-4 relative z-10 flex items-center gap-2">
            <span className="w-1 h-1 bg-white rounded-full"></span>
            Subscriptions
          </span>
          <div className="relative z-10">
            <span className="font-display text-3xl font-bold text-primary tabular-nums">
              {stats.subscriptionsTotal.toLocaleString()} <span className="text-xs font-medium text-zinc-600">EGP</span>
            </span>
          </div>
          <div className="mt-2 text-[10px] text-zinc-600 font-medium relative z-10 uppercase tracking-widest">Calculated from daily sales</div>
        </div>

        {/* Card 4: Rooms (Automated) */}
        <div className="bg-surface-container-low/20 backdrop-blur-2xl border border-white/5 rounded-3xl p-6 text-center hover:bg-white/5 transition-all duration-500 group relative overflow-hidden flex flex-col items-center justify-center min-h-[160px] shadow-xl">
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors"></div>
          <span className="font-sans text-[10px] text-zinc-500 font-black tracking-[0.3em] uppercase mb-4 relative z-10 flex items-center gap-2">
            <span className="w-1 h-1 bg-indigo-500 rounded-full"></span>
            Rooms
          </span>
          <div className="relative z-10">
            <span className="font-display text-3xl font-bold text-white tabular-nums">
              {stats.roomsTotal.toLocaleString()} <span className="text-xs font-medium text-zinc-600">EGP</span>
            </span>
          </div>
          <div className="mt-2 text-[10px] text-zinc-600 font-medium relative z-10 uppercase tracking-widest">Synced with day schedule</div>
        </div>
      </section>

      {/* Body: Grid Layout */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        {/* Column 1: Notes & Cash */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          <div className="bg-surface-container-low/20 backdrop-blur-2xl border border-white/5 rounded-2xl p-6 flex flex-col h-[320px] shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
            <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/5 rounded-lg">
                  <FileText className="text-zinc-400" size={18} />
                </div>
                <h2 className="font-display text-lg font-medium text-white/90 tracking-tight">Other Items</h2>
              </div>
              <button 
                onClick={() => {
                  const newItems = [...data.otherItems, { label: '', amount: 0 }];
                  setData(prev => ({ ...prev, otherItems: newItems }));
                  handleSaveSummary({ otherItems: newItems });
                }}
                className="text-[10px] font-bold text-primary uppercase tracking-widest hover:text-white transition-colors"
              >
                + Add Item
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
              <table className="w-full border-separate border-spacing-y-2">
                <tbody>
                  {data.otherItems.map((item, idx) => (
                    <tr key={idx} className="group">
                      <td className="w-[85%] pr-4">
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => {
                            const newItems = [...data.otherItems];
                            newItems[idx].label = e.target.value;
                            setData(prev => ({ ...prev, otherItems: newItems }));
                          }}
                          onBlur={() => handleSaveSummary({ otherItems: data.otherItems })}
                          placeholder="Item description..."
                          className="w-full bg-transparent border-b border-white/5 text-zinc-300 font-sans text-sm focus:ring-0 focus:border-primary/40 transition-all p-1 outline-none"
                        />
                      </td>
                      <td className="w-[15%]">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.amount}
                            onChange={(e) => {
                              const newItems = [...data.otherItems];
                              newItems[idx].amount = e.target.value;
                              setData(prev => ({ ...prev, otherItems: newItems }));
                            }}
                            onBlur={() => handleSaveSummary({ otherItems: data.otherItems })}
                            className="w-full bg-transparent border-b border-white/5 text-right font-mono text-sm text-primary focus:ring-0 focus:border-primary/40 transition-all p-1 outline-none"
                            placeholder="0"
                          />
                          <span className="text-[10px] text-zinc-600 font-bold uppercase">egp</span>
                        </div>
                      </td>
                      <td className="pl-2">
                        <button 
                          onClick={() => {
                            const newItems = data.otherItems.filter((_, i) => i !== idx);
                            setData(prev => ({ ...prev, otherItems: newItems }));
                            handleSaveSummary({ otherItems: newItems });
                          }}
                          className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.otherItems.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-center py-8 text-zinc-600 text-xs italic">
                        No other items recorded for this shift.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {data.otherItems.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-zinc-500">
                <span className="text-[10px] font-bold uppercase tracking-widest">Table Total</span>
                <span className="font-mono text-sm text-white">{othersTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} EGP</span>
              </div>
            )}
          </div>

          <div className="bg-[#0b2e1a]/20 backdrop-blur-2xl border border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group shadow-[0_20px_50px_rgba(0,0,0,0.3)] min-h-[160px]">
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
            <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg">
                  <DollarSign className="text-emerald-400" size={20} />
                </div>
                <h2 className="font-display text-lg font-medium text-white/90 tracking-tight">Net Cash</h2>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-sans text-[9px] font-black text-emerald-400/80 uppercase tracking-[0.2em] bg-emerald-400/10 px-2 py-0.5 rounded">Calculated</span>
              </div>
            </div>
            
            <div className="flex flex-col items-end relative z-10 mt-auto">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-sm text-emerald-500/40 font-bold uppercase tracking-widest pointer-events-none">EGP</span>
                <input 
                  className="bg-transparent border-0 text-right font-display text-5xl text-emerald-400 font-bold focus:ring-0 transition-all outline-none w-full tabular-nums selection:bg-emerald-500/20 cursor-default" 
                  type="number" 
                  value={data.cash.toFixed(2)}
                  readOnly
                />
              </div>
              <div className="text-[10px] text-emerald-500/40 font-medium mt-1 uppercase tracking-tighter">Automatic: Total Revenue - Instapay</div>
            </div>
          </div>
        </div>

        {/* Column 2: Income Summary & Instapay */}
        <div className="lg:col-span-7 flex flex-col gap-8 h-full">
          {/* Income Summary Table */}
          <div className="bg-surface-container-low/20 backdrop-blur-2xl border border-white/5 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
            <h2 className="font-display text-lg font-medium text-white/90 mb-6 border-b border-white/5 pb-4 tracking-tight text-center">Income Summary</h2>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center py-1 group rounded transition-all">
                <span className="font-sans text-xs text-zinc-500 font-bold uppercase tracking-widest">Seats</span>
                <span className="font-mono text-sm text-white font-medium">{stats.checkInTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center py-1 group rounded transition-all">
                <span className="font-sans text-xs text-zinc-500 font-bold uppercase tracking-widest">Kitchen (Total)</span>
                <span className="font-mono text-sm text-white font-medium">{stats.kitchenTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center py-1 group rounded transition-all">
                <span className="font-sans text-xs text-zinc-500 font-bold uppercase tracking-widest">Subs</span>
                <span className="font-mono text-sm text-white font-medium">{stats.subscriptionsTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center py-1 group rounded transition-all">
                <span className="font-sans text-xs text-zinc-500 font-bold uppercase tracking-widest">Rooms</span>
                <span className="font-mono text-sm text-white font-medium">{stats.roomsTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center py-1 group rounded transition-all">
                <span className="font-sans text-xs text-zinc-500 font-bold uppercase tracking-widest">Others</span>
                <span className="font-mono text-sm text-white font-medium">{othersTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="w-full h-[1px] bg-white/5 my-3"></div>
              <div className="flex flex-col items-center pt-2 gap-1">
                <span className="font-sans text-[10px] font-black text-primary/60 uppercase tracking-[0.3em]">Grand Revenue</span>
                <span className="font-display text-4xl font-bold text-primary tracking-tighter tabular-nums">{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-medium tracking-normal text-zinc-600">EGP</span></span>
              </div>
            </div>
          </div>

          {/* Instapay Square */}
          <div className="bg-[#1a0b2e]/20 backdrop-blur-2xl border border-purple-500/20 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group shadow-[0_20px_50px_rgba(0,0,0,0.3)] min-h-[160px]">
            <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
            <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Wallet className="text-purple-400" size={20} />
                </div>
                <h2 className="font-display text-lg font-medium text-white/90 tracking-tight">Instapay</h2>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-sans text-[9px] font-black text-purple-400/80 uppercase tracking-[0.2em] bg-purple-400/10 px-2 py-0.5 rounded">Manual Input</span>
              </div>
            </div>
            
            <div className="flex flex-col items-end relative z-10 mt-auto">
              <div className="flex items-baseline gap-2 group-focus-within:translate-x-[-4px] transition-all duration-300">
                <span className="font-display text-sm text-purple-500/40 font-bold uppercase tracking-widest pointer-events-none">EGP</span>
                <input 
                  className="bg-transparent border-0 text-right font-display text-5xl text-purple-400 font-bold focus:ring-0 transition-all outline-none w-full tabular-nums placeholder:text-purple-500/10" 
                  placeholder="0.00" 
                  type="text" 
                  inputMode="decimal"
                  value={data.instapay}
                  onChange={(e) => setData(prev => ({ ...prev, instapay: e.target.value }))}
                  onBlur={() => handleSaveSummary({ instapay: data.instapay })}
                />
              </div>
              <div className="w-full h-[2px] bg-purple-500/20 mt-1 origin-right scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500"></div>
            </div>
          </div>
        </div>
      </section>
    </main>

  );
};
