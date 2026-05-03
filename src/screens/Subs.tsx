import React, { useState, useEffect, useRef } from 'react';
import { Check, Calendar, ChevronDown, Plus, Search, UserPlus, MinusCircle } from 'lucide-react';
import { useDate } from '../context/DateContext';
import { useHistory } from '../context/HistoryContext';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  query,
  orderBy,
  serverTimestamp 
} from '../lib/firestoreDemo';
import { db, OperationType, handleFirestoreError, AppSettings, DEFAULT_SETTINGS } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { addDays, format, parseISO } from 'date-fns';

interface Subscription {
  id: string;
  customerId: string;
  customerName?: string;
  type: string;
  start: string;
  expiry: string;
  visits: number;
  remaining: number;
}

export const Subs: React.FC = () => {
  const { dateString } = useDate();
  const { pushAction, pushDeletion } = useHistory();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const defaultFeatures = ['Free Drink', 'Unlimited Internet', 'No Check-in/Out'];

  useEffect(() => {
    // Sync Settings
    const settingsPath = 'settings/global';
    const settingsUnsubscribe = onSnapshot(doc(db, settingsPath), (snap) => {
      if (snap.exists()) {
        setSettings(prev => ({ ...prev, ...snap.data() }));
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, settingsPath));

    // Sync Subscriptions
    const path = 'subscriptions';
    const q = query(collection(db, path), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSubs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Subscription)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, path));

    return () => {
      settingsUnsubscribe();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Add New shortcut (Ctrl + N)
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addSub();
      }

      // Search shortcut (Ctrl + S)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Check for Ctrl+Alt+Shift+;
      if (e.shiftKey && e.ctrlKey && e.altKey && (e.code === 'Semicolon' || e.key === ';' || e.key === ':')) {
        const active = document.activeElement as HTMLInputElement;
        if (!active || active.tagName !== 'INPUT') return;

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const subId = active.getAttribute('data-sub-id');
        const field = active.getAttribute('data-field') as keyof Subscription;

        if (subId && field) {
          e.preventDefault();
          updateSub(subId, { [field]: dateStr });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [subs]);

  const addSub = async (type?: string, initialRemaining?: number) => {
    if (!dateString || dateString === 'NaN-aN-aN') return;
    
    try {
      const activePlans = settings.subscriptions.length > 0 ? settings.subscriptions : DEFAULT_SETTINGS.subscriptions;
      const defaultPlan = activePlans[0];
      const planName = type || (defaultPlan?.name || '30');
      
      const targetPlan = activePlans.find(p => p.name === planName) || defaultPlan;
      const days = parseInt(targetPlan?.name || '30') || 0;
      
      let expiryStr = '';
      if (days > 0) {
        try {
          const startDate = parseISO(dateString);
          if (!isNaN(startDate.getTime())) {
            expiryStr = format(addDays(startDate, days), 'yyyy-MM-dd');
          }
        } catch (err) {
          console.error("Error calculating expiry:", err);
        }
      }
      
      await addDoc(collection(db, 'subscriptions'), {
        customerId: '',
        type: planName,
        start: dateString,
        expiry: expiryStr,
        visits: 0,
        remaining: initialRemaining || targetPlan?.visits || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'subscriptions'); }
  };

  const updateSub = async (id: string, updates: Partial<Subscription>) => {
    const sub = subs.find(s => s.id === id);
    if (!sub) return;

    const before: any = {};
    const after: any = {};
    Object.keys(updates).forEach(key => {
      const k = key as keyof Subscription;
      before[k] = (sub as any)[k];
      after[k] = (updates as any)[k];
    });

    pushAction({
      collectionPath: 'subscriptions',
      docId: id,
      before,
      after
    });

    try {
      await updateDoc(doc(db, 'subscriptions', id), {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, `subscriptions/${id}`); }
  };

  const filteredSubs = subs.filter(s => 
    (s.customerId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.customerName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-[1440px] mx-auto px-12 py-12 flex flex-col gap-12">
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {(settings.subscriptions.length > 0 ? settings.subscriptions : DEFAULT_SETTINGS.subscriptions).map((plan) => (
          <div key={plan.name} className="bg-surface-container/40 backdrop-blur-xl border border-white/10 rounded-2xl p-8 flex flex-col gap-8 hover:border-white/20 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex flex-col gap-2 relative">
              <h3 className="text-2xl font-display font-bold text-white tracking-tight">{plan.name} Days</h3>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                {plan.visits > 0 ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                    {plan.visits} {plan.visits === 1 ? 'Visit' : 'Visits'} Included
                  </>
                ) : (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20"></div>
                    Duration Based Plan
                  </>
                )}
              </span>
            </div>
            
            <ul className="flex flex-col gap-3 text-sm text-zinc-400 relative">
              {defaultFeatures.map(f => (
                <li key={f} className="flex items-center gap-3">
                  <Check size={14} className="text-white/40" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="flex justify-between items-center pt-6 border-t border-white/5 mt-auto relative">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Total Price</span>
                <div className="text-white font-display font-medium text-2xl flex items-baseline gap-1">
                  {plan.price.toFixed(0)}
                  <span className="text-[10px] text-zinc-500 font-bold uppercase transition-colors">EGP</span>
                </div>
              </div>
              <button 
                onClick={() => addSub(plan.name, plan.visits)}
                className="bg-white text-zinc-950 px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5"
              >
                Enroll
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex justify-between items-center px-2">
          <h2 className="text-h3 text-white">Active Subscriptions</h2>
          <div className="flex items-center gap-2 text-zinc-500 border border-white/10 px-4 py-2 rounded-lg bg-surface-container-lowest">
            <Search size={16} />
            <input
              ref={searchInputRef}
              className="bg-transparent border-none focus:ring-0 text-sm w-48 placeholder:text-zinc-600 outline-none"
              placeholder="Search IDs..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="bg-surface-container-low/60 backdrop-blur-md border border-white/10 rounded-xl overflow-x-auto shadow-2xl">
          <table className="w-full text-left whitespace-nowrap border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-surface-container/40">
                <th className="p-5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Customer ID</th>
                <th className="p-5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Subscription Type</th>
                <th className="p-5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Start Date</th>
                <th className="p-5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Expiry Date</th>
                <th className="p-5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-center">Visits</th>
                <th className="p-5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-center">Remaining</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-white/5">
              {filteredSubs.map((sub) => (
                <tr key={sub.id} className="hover:bg-white/5 transition-colors group">
                  <td className="p-5">
                    <input
                      className="bg-transparent border-b border-transparent group-hover:border-white/20 focus:border-white outline-none px-1 py-1 w-32 text-on-surface transition-colors"
                      type="text"
                      value={sub.customerId}
                      placeholder="NEW-ID"
                      onChange={(e) => updateSub(sub.id, { customerId: e.target.value })}
                    />
                  </td>
                  <td className="p-5">
                    <div className="relative group/select">
                      <select
                        className="bg-surface-container/20 border border-white/5 rounded-lg text-white text-sm focus:ring-1 focus:ring-white/20 px-3 py-1.5 cursor-pointer outline-none appearance-none hover:bg-white/5 transition-all pr-8 w-full"
                        value={sub.type}
                        onChange={(e) => {
                          const newType = e.target.value;
                          const plans = settings.subscriptions.length > 0 ? settings.subscriptions : DEFAULT_SETTINGS.subscriptions;
                          const plan = plans.find(p => p.name === newType);
                          
                          if (plan) {
                            const days = parseInt(plan.name) || 0;
                            let expiryStr = sub.expiry;
                            if (days > 0 && sub.start) {
                              try {
                                const startDate = parseISO(sub.start);
                                expiryStr = format(addDays(startDate, days), 'yyyy-MM-dd');
                              } catch (err) {
                                console.error("Error calculating expiry:", err);
                              }
                            }
                            updateSub(sub.id, { 
                              type: newType, 
                              remaining: plan.visits,
                              expiry: expiryStr 
                            });
                          } else {
                            updateSub(sub.id, { type: newType });
                          }
                        }}
                      >
                        {(settings.subscriptions.length > 0 ? settings.subscriptions : DEFAULT_SETTINGS.subscriptions).map(p => (
                          <option key={p.name} className="bg-zinc-950" value={p.name}>
                            {p.name} Days {p.visits > 0 ? `(${p.visits} Visits)` : ''}
                          </option>
                        ))}
                        <option className="bg-zinc-950" value="Unlimited">Unlimited</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-hover/select:text-white transition-colors" />
                    </div>
                  </td>
                  <td className="p-5">
                    <input
                      className="bg-transparent border-none text-on-surface-variant hover:text-white transition-colors text-sm focus:ring-0 px-0 py-1 outline-none [color-scheme:dark]"
                      type="date"
                      data-sub-id={sub.id}
                      data-field="start"
                      value={sub.start}
                      onChange={(e) => updateSub(sub.id, { start: e.target.value })}
                    />
                  </td>
                  <td className="p-5">
                    <input
                      className="bg-transparent border-none text-on-surface-variant hover:text-white transition-colors text-sm focus:ring-0 px-0 py-1 outline-none [color-scheme:dark]"
                      type="date"
                      data-sub-id={sub.id}
                      data-field="expiry"
                      value={sub.expiry}
                      onChange={(e) => updateSub(sub.id, { expiry: e.target.value })}
                    />
                  </td>
                  <td className="p-5 text-center">
                     <div className="flex items-center justify-center gap-4">
                      <button 
                        onClick={() => updateSub(sub.id, { visits: Math.max(0, sub.visits - 1) })}
                        className="text-zinc-600 hover:text-white transition-colors text-xl font-mono"
                      >
                        -
                      </button>
                      <span className="text-on-surface font-mono w-8 text-center">{sub.visits}</span>
                      <button 
                        onClick={() => updateSub(sub.id, { visits: sub.visits + 1 })}
                        className="text-zinc-600 hover:text-white transition-colors text-xl font-mono"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="p-5 text-center">
                    <div className="flex items-center justify-center gap-4">
                      <button 
                        onClick={() => updateSub(sub.id, { remaining: Math.max(0, sub.remaining - 1) })}
                        className="text-zinc-600 hover:text-white transition-colors text-xl font-mono"
                      >
                        -
                      </button>
                      <span className="text-white font-mono font-bold w-8 text-center text-primary">{sub.remaining}</span>
                      <button 
                         onClick={() => updateSub(sub.id, { remaining: sub.remaining + 1 })}
                         className="text-zinc-600 hover:text-white transition-colors text-xl font-mono"
                      >
                        +
                      </button>
                      <button 
                        onClick={async () => {
                          try {
                            const subData = subs.find(s => s.id === sub.id);
                            if (subData) {
                              pushDeletion('subscriptions', sub.id, subData, subData.customerId || 'Untitled subscription');
                            }
                            await deleteDoc(doc(db, 'subscriptions', sub.id));
                          } catch (e) {
                            handleFirestoreError(e, OperationType.DELETE, `subscriptions/${sub.id}`);
                          }
                        }}
                        className="p-1 text-zinc-400 hover:text-red-400 transition-colors opacity-40 group-hover:opacity-100 ml-4"
                      >
                        <MinusCircle size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSubs.length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-zinc-600 uppercase text-xs tracking-widest italic">No active memberships found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button 
          onClick={() => addSub()}
          className="w-full py-4 border border-white/10 border-dashed rounded-lg text-zinc-500 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all mt-4 flex items-center justify-center gap-2 group"
        >
          <Plus size={18} className="group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">Add Manual Subscription Entry</span>
        </button>
      </section>
    </div>
  );
};
