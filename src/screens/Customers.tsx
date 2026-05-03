import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, MinusCircle, UserPlus, Filter, MoreHorizontal, TrendingUp, ChevronLeft, ChevronRight, X } from 'lucide-react';
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
  where,
  getDocs,
  setDoc,
  orderBy,
  serverTimestamp 
} from '../lib/firestoreDemo';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface Customer {
  id: string;
  customId: string;
  name: string;
  phone: string;
  createdAt: any;
  isHtp?: boolean;
  isBlacklisted?: boolean;
  debtAmount?: number;
  debtDate?: string;
  registrationDate?: string;
}

export const Customers: React.FC = () => {
  const { dateString } = useDate();
  const { pushAction, pushDeletion } = useHistory();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchId, setSearchId] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'blk' | 'htp'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sync Customers
    const path = 'customers';
    const q = query(collection(db, path), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, path));

    const handleKeyDown = (e: KeyboardEvent) => {
      // Add New shortcut (Ctrl + N)
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addCustomer();
      }

      // Search shortcut (Ctrl + S)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const syncDebtToIncome = async (customer: Customer, amount: number) => {
    if (!dateString) return;
    const incomeDocRef = doc(db, `days/${dateString}`);
    const summarySnap = await getDocs(query(collection(db, `days`), where("__name__", "==", dateString)));
    
    let otherItems: any[] = [];
    if (!summarySnap.empty) {
      otherItems = summarySnap.docs[0].data().otherItems || [];
    }

    const itemLabel = `DEBT: ${customer.customId} (${customer.name})`;
    const existingIndex = otherItems.findIndex(item => item.label.startsWith(`DEBT: ${customer.customId}`));

    if (amount > 0) {
      const newItem = { label: itemLabel, amount: -amount };
      if (existingIndex > -1) {
        otherItems[existingIndex] = newItem;
      } else {
        otherItems.push(newItem);
      }
    } else {
      if (existingIndex > -1) {
        otherItems.splice(existingIndex, 1);
      }
    }

    try {
      await setDoc(incomeDocRef, { otherItems, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error("Error syncing debt to income:", e);
    }
  };

  const addCustomer = async () => {
    try {
      // Find the highest ID number currently in the database to increment from
      const idNumbers = customers.map(c => {
        const match = c.customId.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      });
      const maxId = idNumbers.length > 0 ? Math.max(...idNumbers) : 921;
      const nextNum = maxId + 1;
      const customId = String(nextNum);
      
      await addDoc(collection(db, 'customers'), {
        customId,
        name: '',
        phone: '',
        createdAt: serverTimestamp(),
        registrationDate: dateString,
        isHtp: false,
        isBlacklisted: false,
        debtAmount: 0,
        debtDate: ''
      });
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'customers'); }
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    const before: any = {};
    const after: any = {};
    Object.keys(updates).forEach(key => {
      const k = key as keyof Customer;
      before[k] = (customer as any)[k];
      after[k] = (updates as any)[k];
    });

    pushAction({
      collectionPath: 'customers',
      docId: id,
      before,
      after
    });

    try {
      await updateDoc(doc(db, 'customers', id), {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, `customers/${id}`); }
  };

  const filteredCustomers = customers.filter(c => {
    const matchesId = (c.customId || '').toLowerCase().includes(searchId.toLowerCase());
    const matchesPhone = (c.phone || '').toLowerCase().includes(searchPhone.toLowerCase());
    const matchesSearch = matchesId && matchesPhone;
    
    if (filterType === 'blk') return matchesSearch && c.isBlacklisted;
    if (filterType === 'htp') return matchesSearch && c.isHtp;
    return matchesSearch;
  });

  const totalMembers = customers.length;
  const htpCount = customers.filter(c => c.isHtp).length;
  const blacklistedCount = customers.filter(c => c.isBlacklisted).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-white selection:text-zinc-950 relative overflow-x-hidden p-8">
      {/* Starry Background Layer Component (Simplified version for consistent look) */}
      <div className="fixed inset-0 pointer-events-none opacity-10 z-0">
         <div className="absolute inset-0 bg-[radial-gradient(1px_1px_at_20px_30px,#ffffff,transparent)] bg-[length:200px_200px]"></div>
         <div className="absolute inset-0 bg-[radial-gradient(1.5px_1.5px_at_40px_70px,#ffffff,transparent)] bg-[length:200px_200px] delay-75"></div>
      </div>

      <main className="max-w-7xl mx-auto relative z-10">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>

            <h1 className="font-display text-5xl font-bold text-white uppercase tracking-tighter italic">IDs database</h1>
            <p className="text-sm text-zinc-500 mt-2 max-w-xl font-medium">
              Manage and view the detailed profiles of all active space residents and community participants.
            </p>
          </div>

        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="p-8 border border-white/10 bg-zinc-900/40 backdrop-blur-xl rounded-sm hover:border-white/20 transition-all group relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"></div>
            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] mb-4 relative z-10">Total Members</p>
            <h3 className="font-display text-4xl font-bold text-white relative z-10">{totalMembers.toLocaleString()}</h3>

          </div>

          <div className="p-8 border border-white/10 bg-zinc-900/40 backdrop-blur-xl rounded-sm hover:border-white/20 transition-all group relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors"></div>
            <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] mb-4 relative z-10">Debt Carryover (HTP)</p>
            <h3 className="font-display text-4xl font-bold text-white relative z-10">{htpCount}</h3>
            <div className="mt-6 flex -space-x-2 relative z-10">
              {customers.filter(c => c.isHtp).slice(0, 4).map((c, i) => (
                <div key={c.id} className="w-8 h-8 rounded-full border-2 border-zinc-950 bg-zinc-800 flex items-center justify-center text-[8px] font-black uppercase overflow-hidden">
                  {c.name ? c.name.split(' ').map(n => n[0]).join('') : '??'}
                </div>
              ))}
              {htpCount > 4 && (
                <div className="w-8 h-8 rounded-full border-2 border-zinc-950 bg-zinc-900 flex items-center justify-center text-[8px] font-black text-zinc-500 uppercase tracking-tight">
                  +{htpCount - 4}
                </div>
              )}
            </div>
          </div>

          <div className="p-8 border border-white/10 bg-zinc-900/40 backdrop-blur-xl rounded-sm hover:border-white/20 transition-all group relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-32 h-32 bg-red-500/5 rounded-full blur-2xl group-hover:bg-red-500/10 transition-colors"></div>
            <div className="relative z-10">
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-[0.3em] mb-4">Black listed</p>
              <h3 className="font-display text-4xl font-bold text-white mb-6 uppercase italic tracking-tighter">{blacklistedCount} <span className="text-sm font-medium text-zinc-600 not-italic">ENTRIES</span></h3>

            </div>
          </div>
        </div>

        {/* Customer Table */}
        <div className="bg-zinc-900/30 backdrop-blur-xl border border-white/10 rounded-sm overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col md:flex-row items-center gap-3 flex-1 w-full md:w-auto">
              <div className="flex items-center gap-3 text-zinc-500 border border-white/10 px-4 py-2 rounded-lg bg-zinc-950/40 flex-1 w-full md:w-auto">
                <Search size={14} />
                <input
                  ref={searchInputRef}
                  className="bg-transparent border-none focus:ring-0 text-xs w-full placeholder:text-zinc-700 text-white outline-none uppercase font-bold tracking-widest"
                  placeholder="ID SEARCH"
                  type="text"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                />
                {searchId && (
                  <button onClick={() => setSearchId('')} className="text-zinc-600 hover:text-white">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 text-zinc-500 border border-white/10 px-4 py-2 rounded-lg bg-zinc-950/40 flex-1 w-full md:w-auto">
                <Search size={14} />
                <input
                  className="bg-transparent border-none focus:ring-0 text-xs w-full placeholder:text-zinc-700 text-white outline-none uppercase font-bold tracking-widest"
                  placeholder="PHONE SEARCH"
                  type="text"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                />
                {searchPhone && (
                  <button onClick={() => setSearchPhone('')} className="text-zinc-600 hover:text-white">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="relative w-full md:w-auto" ref={filterMenuRef}>
                <button 
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className="px-6 py-2 border border-white/10 text-zinc-400 font-bold text-[10px] uppercase tracking-widest hover:bg-white/5 transition-all active:scale-95 flex items-center gap-2 rounded-sm whitespace-nowrap h-full"
                >
                  <Filter size={14} />
                  {filterType === 'all' ? 'All Records' : filterType === 'blk' ? 'Blacklisted' : 'Have to Pay'}
                </button>
                <AnimatePresence>
                  {showFilterMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full right-0 mt-2 w-48 bg-zinc-900 border border-white/10 rounded-sm shadow-2xl z-[100] overflow-hidden"
                    >
                      <button onClick={() => { setFilterType('all'); setShowFilterMenu(false); }} className="w-full text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5">Show All</button>
                      <button onClick={() => { setFilterType('blk'); setShowFilterMenu(false); }} className="w-full text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5">Blacklisted</button>
                      <button onClick={() => { setFilterType('htp'); setShowFilterMenu(false); }} className="w-full text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:bg-white/5 hover:text-white transition-colors">Have to Pay</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="px-8 py-5 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Identification</th>
                <th className="px-8 py-5 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Resident Name</th>
                <th className="px-8 py-5 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Contact Vector</th>
                <th className="px-8 py-5 text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Registration</th>
                <th className="px-8 py-5 text-xs font-black text-zinc-500 uppercase tracking-[0.2em] text-center">Status</th>
                <th className="px-8 py-5 text-xs font-black text-zinc-500 uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-white/[0.03] transition-colors group">
                  <td className="px-8 py-6">
                    <div className="max-w-[120px] overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      <input
                        className="bg-transparent border-none text-white font-mono text-base focus:ring-0 px-0 py-0 w-full outline-none transition-colors"
                        value={customer.customId}
                        onChange={(e) => updateCustomer(customer.id, { customId: e.target.value })}
                        placeholder="0000"
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4 max-w-[200px] overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      <input
                        className="bg-transparent border-none text-white font-display font-medium text-lg focus:ring-0 p-0 outline-none placeholder:text-zinc-800 w-full"
                        value={customer.name}
                        onChange={(e) => updateCustomer(customer.id, { name: e.target.value })}
                        placeholder="Resident Name"
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="max-w-[150px] overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      <input
                        className="bg-transparent border-none text-white transition-colors text-base focus:ring-0 p-0 outline-none font-mono w-full"
                        value={customer.phone}
                        onChange={(e) => updateCustomer(customer.id, { phone: e.target.value })}
                        placeholder="+XX XXXXX XXXXX"
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <input
                      type="date"
                      className="bg-transparent border-none text-sm font-bold text-white uppercase tracking-widest focus:ring-0 p-0 outline-none [color-scheme:dark]"
                      value={customer.registrationDate || (customer.createdAt ? format(typeof customer.createdAt.toDate === 'function' ? customer.createdAt.toDate() : customer.createdAt, 'yyyy-MM-dd') : '')}
                      onChange={(e) => updateCustomer(customer.id, { registrationDate: e.target.value })}
                    />
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center justify-center gap-3">
                      <button 
                         onClick={() => {
                           const newHtp = !customer.isHtp;
                           const updates: Partial<Customer> = { isHtp: newHtp };
                           if (newHtp) {
                             if (!customer.debtDate) updates.debtDate = dateString;
                           } else {
                             syncDebtToIncome(customer, 0); 
                             updates.debtAmount = 0;
                             updates.debtDate = '';
                           }
                           updateCustomer(customer.id, updates);
                         }}
                         className={`px-3 py-1 rounded-sm text-xs font-black uppercase tracking-widest transition-all ${
                          customer.isHtp ? 'bg-indigo-500 text-white' : 'bg-white/5 text-zinc-700 hover:text-zinc-400'
                        }`}>
                        HTP
                      </button>
                      <button 
                        onClick={() => updateCustomer(customer.id, { isBlacklisted: !customer.isBlacklisted })}
                        className={`px-3 py-1 rounded-sm text-xs font-black uppercase tracking-widest transition-all ${
                        customer.isBlacklisted ? 'bg-red-500 text-white' : 'bg-white/5 text-zinc-700 hover:text-zinc-400'
                      }`}>
                        BLK
                      </button>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-4 items-center min-h-[40px]">
                      {customer.isHtp && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                          <input
                            type="number"
                            placeholder="Amount"
                            className="w-20 bg-zinc-950 border border-white/10 rounded-sm text-xs font-mono text-indigo-400 px-2 py-1 outline-none focus:border-indigo-500/50"
                            value={customer.debtAmount || ''}
                            onChange={(e) => updateCustomer(customer.id, { debtAmount: parseFloat(e.target.value) || 0 })}
                            onBlur={(e) => syncDebtToIncome(customer, parseFloat(e.target.value) || 0)}
                          />
                          <input
                            type="date"
                            className="bg-zinc-950 border border-white/10 rounded-sm text-xs font-mono text-white px-2 py-1 outline-none focus:border-indigo-500/50 [color-scheme:dark] w-32"
                            value={customer.debtDate || ''}
                            onChange={(e) => updateCustomer(customer.id, { debtDate: e.target.value })}
                          />
                        </div>
                      )}
                      <button 
                        onClick={async () => {
                          try {
                            pushDeletion('customers', customer.id, customer, customer.name || customer.customId);
                            await deleteDoc(doc(db, 'customers', customer.id));
                          } catch (e) { handleFirestoreError(e, OperationType.DELETE, `customers/${customer.id}`); }
                        }}
                        className="p-2 text-zinc-500 hover:text-red-500 transition-colors opacity-40 group-hover:opacity-100"
                      >
                        <MinusCircle size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                      <UserPlus size={48} className="text-zinc-500" />
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400">Database Entry Required</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="p-8 flex items-center justify-between bg-white/[0.02]">
            <button 
              onClick={addCustomer}
              className="px-8 py-4 border border-white/10 border-dashed rounded-lg text-zinc-500 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all w-full flex items-center justify-center gap-3 group"
            >
              <Plus size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-black uppercase tracking-[0.3em]">New Registry Entry</span>
            </button>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {/* Contextual FAB remains or could be hidden */}
      </AnimatePresence>
    </div>
  );
};
