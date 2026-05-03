import React, { useState, useEffect, useRef } from 'react';
import { Search, ShoppingBasket, Plus, MinusCircle, X, Clock, Phone } from 'lucide-react';
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
  orderBy,
  serverTimestamp 
} from '../lib/firestoreDemo';
import { db, OperationType, handleFirestoreError, AppSettings, DEFAULT_SETTINGS, calculateStepPricing } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface Entry {
  id: string;
  customerId: string;
  checkIn: string;
  checkOut: string;
  purchases: number;
  freeDrink: boolean;
  eligibleForFreeDrink?: boolean;
  price: number | 'Pending';
  subVisitCharged?: boolean;
}

interface Customer {
  id: string;
  customId: string;
  name: string;
  phone: string;
  isHtp?: boolean;
  isBlacklisted?: boolean;
  debtAmount?: number;
}

interface Subscription {
  id: string;
  customerId: string;
  type: string;
  start: string;
  expiry: string;
  visits: number;
  remaining: number;
}

interface Sale {
  id: string;
  productId: string;
  productName: string;
  price: number;
  customerId: string;
  freeDrink: boolean;
}

interface Product {
  id: string;
  sku: string;
  freeDrinkEligible: boolean;
}

export const CheckIn: React.FC = () => {
  const { dateString } = useDate();
  const { pushAction, pushDeletion } = useHistory();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [phoneMatch, setPhoneMatch] = useState<{ name: string, id: string, checkedIn: boolean, phone: string }[]>([]);
  const [showPhoneResults, setShowPhoneResults] = useState(false);
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const phoneSearchRef = useRef<HTMLDivElement>(null);
  const [activeBasket, setActiveBasket] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Real-time price calculator
  const calculatePriceFromTime = (checkInStr: string, checkOutStr?: string) => {
    if (!checkInStr || checkInStr === '--:--') return 0;
    
    const [hIn, mIn] = checkInStr.split(':').map(Number);
    const [y, m, d] = dateString.split('-').map(Number);
    const checkInDate = new Date(y, m - 1, d, hIn, mIn);

    let endTime = currentTime;
    if (checkOutStr && checkOutStr !== '--:--') {
      const [hOut, mOut] = checkOutStr.split(':').map(Number);
      endTime = new Date(y, m - 1, d, hOut, mOut);
    }

    let diffMs = endTime.getTime() - checkInDate.getTime();
    if (diffMs < 0) return 0; 

    const totalMinutes = Math.floor(diffMs / 60000);
    
    if (totalMinutes <= 0) return 0;
    
    const standardRate = settings.hourPrices?.standard ?? DEFAULT_SETTINGS.hourPrices.standard;
    const maxPrice = settings.hourPrices?.lateNight ?? DEFAULT_SETTINGS.hourPrices.lateNight; // Labeled as "Max Price" in UI
    
    // Calculate price based on custom step logic
    const calculatedPrice = calculateStepPricing(totalMinutes, Number(standardRate) || 0, Number(maxPrice) || 999);
    
    return calculatedPrice;
  };

  const getTimePriceTotal = (entry: Entry) => {
    return calculatePriceFromTime(entry.checkIn, entry.checkOut);
  };

  const isFullDay = (checkInStr: string, checkOutStr?: string) => {
    if (!checkInStr || checkInStr === '--:--') return false;
    const [hIn, mIn] = checkInStr.split(':').map(Number);
    const [y, m, d] = dateString.split('-').map(Number);
    const checkInDate = new Date(y, m - 1, d, hIn, mIn);
    
    let endTime = currentTime;
    if (checkOutStr && checkOutStr !== '--:--') {
      const [hOut, mOut] = checkOutStr.split(':').map(Number);
      endTime = new Date(y, m - 1, d, hOut, mOut);
    }

    const diffMs = endTime.getTime() - checkInDate.getTime();
    const totalMinutes = Math.floor(diffMs / 60000);
    return totalMinutes >= 300; // 5 hours = 300 mins
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Add New shortcut (Ctrl + N)
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addRow();
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
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        // Find which entry and field we are in
        // We can look at the path/context or just trigger a change event
        // Since these are controlled, we need to call updateEntry
        // I will add data-attributes to identify the entry during render
        const entryId = active.getAttribute('data-entry-id');
        const field = active.getAttribute('data-field') as keyof Entry;

        if (entryId && field) {
          e.preventDefault();
          updateEntry(entryId, { [field]: timeStr });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entries]); // Re-bind when entries change so we have latest context if needed

  useEffect(() => {
    if (phoneSearch.trim().length < 2) {
      setPhoneMatch([]);
      return;
    }
    // Search by partial phone match
    const searchDigits = phoneSearch.replace(/[^0-9]/g, '');
    if (searchDigits.length < 2) {
      setPhoneMatch([]);
      return;
    }

    const matches = customers.filter(c => c.phone && c.phone.replace(/[^0-9]/g, '').includes(searchDigits)).slice(0, 5);
    
    if (matches.length > 0) {
      const results = matches.map(customer => ({
        name: customer.name,
        id: customer.customId,
        phone: customer.phone,
        checkedIn: entries.some(e => e.customerId === customer.customId || e.customerId === customer.id)
      }));
      setPhoneMatch(results);
    } else {
      setPhoneMatch([]);
    }
  }, [phoneSearch, customers, entries]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (phoneSearchRef.current && !phoneSearchRef.current.contains(event.target as Node)) {
        setShowPhoneResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);


  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const path = `days/${dateString}/checkins`;
    const q = query(collection(db, path), orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Entry[];
      setEntries(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    const salesPath = `days/${dateString}/kitchenSales`;
    const salesUnsubscribe = onSnapshot(query(collection(db, salesPath), orderBy('createdAt', 'asc')), (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, salesPath));

    const productsUnsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, sku: d.data().sku, freeDrinkEligible: d.data().freeDrinkEligible } as Product)));
    });

    const subsUnsubscribe = onSnapshot(collection(db, 'subscriptions'), (snapshot) => {
      setSubs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Subscription)));
    });

    const customersUnsubscribe = onSnapshot(collection(db, 'customers'), (snapshot) => {
      setCustomers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });

    return () => {
      unsubscribe();
      salesUnsubscribe();
      productsUnsubscribe();
      subsUnsubscribe();
      customersUnsubscribe();
    };
  }, [dateString]);

  const addRow = async () => {
    const path = `days/${dateString}/checkins`;
    try {
      await addDoc(collection(db, path), {
        customerId: '',
        checkIn: '',
        checkOut: '',
        purchases: 0,
        freeDrink: false,
        price: 'Pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const syncPurchases = async (customerId: string, intentFreeDrink?: boolean) => {
    if (!customerId) return;
    const cleanId = customerId.trim();
    if (!cleanId) return;
    
    // 1. Get check-in docs and products
    const checkinsPath = `days/${dateString}/checkins`;
    const qCheck = query(collection(db, checkinsPath), where("customerId", "==", cleanId));
    
    const [checkSnap, productsSnap] = await Promise.all([
      getDocs(qCheck),
      getDocs(collection(db, 'products'))
    ]);

    if (checkSnap.empty) return;
    const checkinDoc = checkSnap.docs[0];
    const wantFreeDrink = intentFreeDrink !== undefined ? intentFreeDrink : checkinDoc.data().freeDrink;
    
    const allProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // 2. Get customer sales
    const salesPath = `days/${dateString}/kitchenSales`;
    const qSales = query(collection(db, salesPath), where("customerId", "==", cleanId));
    const salesSnap = await getDocs(qSales);
    const customerSales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sale));

    // 3. Find expensive eligible item
    const eligibleSales = customerSales.filter(s => {
      const product = allProducts.find((p: any) => p.sku === s.productId);
      return product?.freeDrinkEligible;
    }).sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));

    // Automated logic: If wantFreeDrink is checked, only grant it if an eligible item exists
    let freeSaleId = null;
    if (wantFreeDrink && eligibleSales.length > 0) {
      freeSaleId = eligibleSales[0].id;
    }

    const eligibleForFreeDrink = eligibleSales.length > 0;

    let total = 0;
    let anyFreeMarked = false;

    for (const sale of customerSales) {
      const salePrice = Number(sale.price) || 0;
      const shouldBeFree = sale.id === freeSaleId;
      
      if (sale.freeDrink !== shouldBeFree) {
        await updateDoc(doc(db, salesPath, sale.id), { freeDrink: shouldBeFree });
      }

      if (shouldBeFree) {
        anyFreeMarked = true;
      } else {
        total += salePrice;
      }
    }

    // 4. Update ALL matching check-in docs
    for (const docSnap of checkSnap.docs) {
      await updateDoc(doc(db, checkinsPath, docSnap.id), {
        purchases: total,
        freeDrink: anyFreeMarked,
        eligibleForFreeDrink: eligibleForFreeDrink,
        updatedAt: serverTimestamp()
      });
    }
  };

  const updateEntry = async (id: string, updates: Partial<Entry>) => {
    const path = `days/${dateString}/checkins/${id}`;
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    // Track for undo/redo
    const before: any = {};
    const after: any = {};
    Object.keys(updates).forEach(key => {
      const k = key as keyof Entry;
      before[k] = (entry as any)[k];
      after[k] = (updates as any)[k];
    });

    pushAction({
      collectionPath: `days/${dateString}/checkins`,
      docId: id,
      before,
      after
    });

    // Local copy to handle immediate UI state if needed, but we rely on Firestore onSnapshot
    const docUpdates: any = { ...updates, updatedAt: serverTimestamp() };

    // Trim ID if being updated and reset purchases to avoid ghost pricing from previous ID
    if (updates.customerId !== undefined) {
      docUpdates.customerId = updates.customerId.trim();
      docUpdates.purchases = 0; 
      docUpdates.freeDrink = false;
      docUpdates.eligibleForFreeDrink = false;
    }

    try {
      await updateDoc(doc(db, `days/${dateString}/checkins`, id), docUpdates);

      // Subscription logic
      if (updates.customerId !== undefined) {
        const oldId = entry.customerId;
        const newId = updates.customerId.trim();

        // If ID changed and it was already charged, refund the old subscription
        if (entry.subVisitCharged && oldId && oldId !== newId) {
          const oldSub = subs.find(s => s.customerId === oldId);
          if (oldSub) {
            await updateDoc(doc(db, 'subscriptions', oldSub.id), {
              visits: Math.max(0, (oldSub.visits || 0) - 1),
              remaining: (oldSub.remaining || 0) + 1,
              updatedAt: serverTimestamp()
            });
            // Reset the charged flag since the ID is changing
            await updateDoc(doc(db, `days/${dateString}/checkins`, id), {
              subVisitCharged: false
            });
          }
        }

        // Charge the new ID if applicable
        const sub = subs.find(s => s.customerId === newId && newId !== '');
        
        if (sub && !docUpdates.subVisitCharged) { // Check docUpdates or refresh flag
          const isExpired = sub.expiry && sub.expiry < dateString;
          const hasNoVisits = sub.remaining <= 0;
          
          if (!isExpired && !hasNoVisits) {
            await updateDoc(doc(db, 'subscriptions', sub.id), {
              visits: (sub.visits || 0) + 1,
              remaining: Math.max(0, (sub.remaining || 0) - 1),
              updatedAt: serverTimestamp()
            });

            await updateDoc(doc(db, `days/${dateString}/checkins`, id), {
              subVisitCharged: true,
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      if (updates.customerId !== undefined || updates.freeDrink !== undefined) {
        const customerToSync = updates.customerId !== undefined ? updates.customerId.trim() : entry.customerId;
        if (customerToSync) {
          await syncPurchases(customerToSync, updates.freeDrink);
        }
        
        if (updates.customerId !== undefined && entry.customerId && updates.customerId.trim() !== entry.customerId) {
          await syncPurchases(entry.customerId);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const filteredEntries = entries.filter(e => {
    const searchLow = searchTerm.toLowerCase();
    const phoneDigits = phoneSearch.replace(/[^0-9]/g, '');
    
    // Filter by ID
    const matchesId = (e.customerId || '').toLowerCase().includes(searchLow);
    
    // Filter by Phone if search is active
    let matchesPhone = true;
    if (phoneDigits.length >= 2) {
      const customer = customers.find(c => c.customId === e.customerId || c.id === e.customerId);
      const customerPhoneDigits = customer?.phone?.replace(/[^0-9]/g, '') || '';
      matchesPhone = customerPhoneDigits.includes(phoneDigits);
    }
    
    return matchesId && matchesPhone;
  });

  return (
    <div className="max-w-[1440px] mx-auto px-12 py-12 overflow-visible">
      <div className="relative border border-white/10 bg-zinc-950/40 rounded-xl backdrop-blur-sm overflow-visible">
        <div className="px-8 py-6 border-b border-white/10 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div>
            <h3 className="text-h3 text-white">Check-in Registry</h3>
            <p className="text-zinc-500 text-xs mt-1 uppercase tracking-widest font-label-sm">Terminal Traffic Log — {dateString.replace(/-/g, '/')}</p>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <div 
              ref={phoneSearchRef}
              onMouseEnter={() => setShowPhoneResults(true)}
              className="flex items-center gap-2 text-zinc-500 border border-white/10 px-4 py-2 rounded-lg bg-surface-container-lowest flex-1 md:flex-initial relative"
            >
              <Phone className="text-zinc-500" size={16} />
              <input
                className="bg-transparent border-none focus:ring-0 text-sm w-full md:w-32 placeholder:text-zinc-600 text-white outline-none"
                placeholder="Search Phone..."
                type="text"
                value={phoneSearch}
                onFocus={() => setShowPhoneResults(true)}
                onChange={(e) => {
                  setPhoneSearch(e.target.value);
                  setShowPhoneResults(true);
                }}
              />
              {phoneSearch && (
                <button 
                  onClick={() => {
                    setPhoneSearch('');
                    setShowPhoneResults(false);
                  }}
                  className="text-zinc-600 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
              <AnimatePresence>
                {showPhoneResults && phoneMatch.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full mt-2 left-0 w-80 bg-zinc-950 border border-white/20 p-5 rounded-xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] z-[100] backdrop-blur-3xl ring-1 ring-white/10"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Phone Lookup Results</span>
                      <button onClick={() => setShowPhoneResults(false)} className="text-zinc-600 hover:text-white">
                        <X size={12} />
                      </button>
                    </div>
                    
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {phoneMatch.map((match, idx) => (
                        <div key={idx} className="pb-4 border-b border-white/5 last:border-0 last:pb-0">
                          <div className="flex justify-between items-center mb-2">
                            <div>
                              <h4 className="text-sm font-display font-bold text-white uppercase tracking-tight">{match.name || 'Anonymous'}</h4>
                              <p className="text-[10px] font-mono text-zinc-500">{match.id} • {match.phone}</p>
                            </div>
                            {match.checkedIn ? (
                              <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-sm border border-emerald-500/30">LOGGED</span>
                            ) : (
                              <span className="text-[8px] font-black bg-red-500/10 text-red-400/60 px-2 py-0.5 rounded-sm border border-red-500/20">AWAY</span>
                            )}
                          </div>
                          <button 
                            onClick={() => {
                              setSearchTerm(match.id);
                              setPhoneSearch('');
                              setShowPhoneResults(false);
                            }}
                            className="w-full py-1.5 bg-white/5 text-white hover:bg-white text-[9px] hover:text-black font-black uppercase tracking-widest rounded-md transition-all active:scale-95 border border-white/10 hover:border-white"
                          >
                            {match.checkedIn ? "Filter to this Resident" : "Focus on Resident"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 text-zinc-500 border border-white/10 px-4 py-2 rounded-lg bg-surface-container-lowest flex-1 md:flex-initial">
              <Search className="text-zinc-500" size={16} />
              <input
                ref={searchInputRef}
                className="bg-transparent border-none focus:ring-0 text-sm w-full md:w-32 placeholder:text-zinc-600 text-white outline-none"
                placeholder="Search ID..."
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="text-zinc-600 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-visible">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-zinc-500 font-label-sm border-b border-white/10">
                <th className="px-8 py-4 font-semibold tracking-wider uppercase text-[10px]">Customer ID</th>
                <th className="px-8 py-4 font-semibold tracking-wider uppercase text-[10px]">Check-In</th>
                <th className="px-8 py-4 font-semibold tracking-wider uppercase text-[10px]">Check-Out</th>
                <th className="px-8 py-4 font-semibold tracking-wider uppercase text-[10px]">Purchases</th>
                <th className="px-8 py-4 font-semibold tracking-wider text-center uppercase text-[10px]">Free Drink</th>
                <th className="px-8 py-4 font-semibold tracking-wider text-right uppercase text-[10px]">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredEntries.map((entry) => {
                const sub = entry.customerId ? subs.find(s => s.customerId === entry.customerId) : null;
                const isExpired = sub && sub.expiry && sub.expiry < dateString;
                const isExhausted = sub && sub.remaining <= 0;
                const isEnded = isExpired || isExhausted;
                const isValidSub = sub && !isEnded;

                let rowStyle = "group transition-all duration-500 relative";
                const isCheckedOut = entry.checkOut && entry.checkOut !== '' && entry.checkOut !== '--:--';
                const customer = entry.customerId ? customers.find(c => c.customId === entry.customerId || c.id === entry.customerId) : null;
                const isHtp = customer?.isHtp;
                const isBlk = customer?.isBlacklisted;

                if (isCheckedOut) {
                  rowStyle += " bg-emerald-900/20 border-l-4 border-l-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.15)] ring-1 ring-inset ring-emerald-500/20";
                } else if (isBlk || isHtp) {
                  rowStyle += " bg-[#0a192f] border-l-4 border-l-indigo-500 shadow-[0_0_40px_rgba(79,70,229,0.2)] ring-1 ring-inset ring-indigo-500/40";
                } else if (isValidSub) {
                  rowStyle += " bg-yellow-400/20 border-l-4 border-l-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.2)] ring-1 ring-inset ring-yellow-400/40 bg-gradient-to-r from-yellow-400/5 via-transparent to-transparent";
                } else if (sub && isEnded) {
                  rowStyle += " bg-red-500/10 border-l-4 border-l-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)] ring-1 ring-inset ring-red-500/20";
                } else {
                  rowStyle += " hover:bg-white/5 border-l-4 border-l-transparent";
                }

                return (
                  <tr 
                    key={entry.id} 
                    className={`${rowStyle} ${hoveredEntry === entry.id ? 'z-[60]' : 'z-0'} transition-all`}
                  >
                      <td 
                        className="px-8 py-4 relative"
                        onMouseEnter={() => entry.customerId && setHoveredEntry(entry.id)}
                        onMouseLeave={() => setHoveredEntry(null)}
                      >
                        <AnimatePresence>
                          {hoveredEntry === entry.id && customer && (
                            <motion.div
                              initial={{ opacity: 0, x: -10, scale: 0.95 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{ opacity: 0, x: -10, scale: 0.95 }}
                              className="absolute left-[105%] top-0 w-64 bg-zinc-950 border border-white/20 rounded-xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] p-5 z-[9999] backdrop-blur-3xl ring-1 ring-white/10"
                            >
                              <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-start">
                                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">Resident Info</span>
                                  <div className="flex gap-1.5">
                                    {isBlk && <span className="text-[7px] bg-red-500 text-white px-1.5 py-0.5 rounded-sm font-black tracking-widest">BLK</span>}
                                    {isHtp && <span className="text-[7px] bg-indigo-500 text-white px-1.5 py-0.5 rounded-sm font-black tracking-widest">HTP</span>}
                                  </div>
                                </div>
                                
                                <div className="mb-1">
                                  <h4 className="text-lg font-display font-bold text-white uppercase tracking-tight leading-loose mb-0.5">{customer.name || 'Anonymous Resident'}</h4>
                                  <p className="text-[11px] font-mono text-zinc-500">{customer.customId}</p>
                                </div>
  
                                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                                  <p className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest mb-1 font-sans">Contact Point</p>
                                  <p className="text-xl font-mono text-white font-black tracking-tight">{customer.phone || '---'}</p>
                                </div>
                                
                                {(isHtp || (customer.debtAmount || 0) > 0) && (
                                  <div className="bg-indigo-500/10 rounded-lg p-3 border border-indigo-500/20">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-[8px] text-indigo-400/70 font-bold uppercase tracking-widest">Debt</span>
                                      <Clock size={10} className="text-indigo-400/40" />
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-2xl font-mono text-indigo-400 font-black tracking-tighter">
                                        {customer.debtAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </span>
                                      <span className="text-[10px] text-indigo-400/60 font-black uppercase tracking-widest">EGP</span>
                                    </div>
                                  </div>
                                )}
                                
                                {isBlk && (
                                  <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/20 flex items-center gap-3">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                    <p className="text-[10px] text-red-400 font-black uppercase tracking-widest">Security Alert: Access Denied</p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="relative">
                          <input
                            className={`bg-transparent border-b border-zinc-800 focus:border-white transition-colors text-sm focus:ring-0 px-0 py-1 w-full max-w-[120px] outline-none relative z-10 ${isValidSub ? 'text-yellow-400 font-black tracking-wider' : 'text-white'}`}
                            type="text"
                            value={entry.customerId}
                            placeholder="ID-0000"
                            onChange={(e) => updateEntry(entry.id, { customerId: e.target.value })}
                          />
                          {isValidSub && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute -top-6 left-0 bg-yellow-400 text-black text-[8px] font-black uppercase px-2 py-0.5 rounded shadow-[0_0_15px_rgba(250,204,21,0.6)] animate-pulse z-20 pointer-events-none"
                            >
                              Member Active
                            </motion.div>
                          )}
                          {sub && isEnded && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute -top-6 left-0 bg-red-600 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded shadow-[0_0_15px_rgba(220,38,38,0.6)] z-20 pointer-events-none"
                            >
                              Subscription Ended
                            </motion.div>
                          )}
                        </div>
                      </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          className={`bg-transparent border-b border-zinc-800 focus:border-white transition-colors text-white text-sm focus:ring-0 px-0 py-1 appearance-none [color-scheme:dark] outline-none ${isValidSub ? 'opacity-20 pointer-events-none' : ''}`}
                          type="time"
                          data-entry-id={entry.id}
                          data-field="checkIn"
                          value={isValidSub ? "" : entry.checkIn}
                          readOnly={isValidSub}
                          onChange={(e) => updateEntry(entry.id, { checkIn: e.target.value })}
                        />
                        {!isValidSub && (
                          <button
                            onClick={() => {
                              const now = new Date();
                              const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                              updateEntry(entry.id, { checkIn: timeStr });
                            }}
                            className="text-zinc-600 hover:text-primary transition-colors p-1"
                            title="Set current time"
                          >
                            <Clock size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          className={`bg-transparent border-b border-zinc-800 focus:border-white transition-colors text-sm focus:ring-0 px-0 py-1 appearance-none [color-scheme:dark] outline-none ${
                            entry.checkOut ? 'text-white' : 'text-zinc-600 italic'
                          } ${isValidSub ? 'opacity-20 pointer-events-none' : ''}`}
                          type="time"
                          data-entry-id={entry.id}
                          data-field="checkOut"
                          value={isValidSub ? "" : entry.checkOut}
                          readOnly={isValidSub}
                          onChange={(e) => updateEntry(entry.id, { checkOut: e.target.value })}
                        />
                        {!isValidSub && (
                          <button
                            onClick={() => {
                              const now = new Date();
                              const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                              updateEntry(entry.id, { checkOut: timeStr });
                            }}
                            className="text-zinc-600 hover:text-primary transition-colors p-1"
                            title="Set current time"
                          >
                            <Clock size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className={`flex items-center relative gap-2 ${activeBasket === entry.id ? 'z-50' : 'z-10'}`}>
                        <span className="text-zinc-600 text-[10px] font-bold uppercase">EGP</span>
                        <input
                          className="bg-transparent border-b border-zinc-800 focus:border-white transition-colors text-white text-sm focus:ring-0 px-0 py-1 w-20 outline-none"
                          type="number"
                          step="0.1"
                          value={entry.purchases}
                          onChange={(e) => updateEntry(entry.id, { purchases: parseFloat(e.target.value) || 0 })}
                        />
                        <div className="relative">
                          <button 
                            onClick={() => setActiveBasket(activeBasket === entry.id ? null : entry.id)}
                            className={`ml-2 p-1 transition-colors flex items-center ${activeBasket === entry.id ? 'text-white' : 'text-zinc-500 hover:text-white'}`}
                          >
                            <ShoppingBasket size={18} />
                          </button>
                          
                          <AnimatePresence>
                            {activeBasket === entry.id && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-zinc-900 border border-white/10 rounded-lg shadow-2xl p-3 backdrop-blur-xl"
                              >
                                <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/5">
                                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Basket Items</span>
                                  <button onClick={() => setActiveBasket(null)} className="text-zinc-600 hover:text-white">
                                    <X size={12} />
                                  </button>
                                </div>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                  {sales.filter(s => s.customerId === entry.customerId).length > 0 ? (
                                    sales.filter(s => s.customerId === entry.customerId).map(s => (
                                      <div key={s.id} className="flex justify-between items-center text-[11px]">
                                        <span className="text-zinc-400 truncate mr-2">{s.productName || s.productId}</span>
                                        <span className={s.freeDrink ? "text-primary font-bold" : "text-zinc-500"}>
                                          {s.freeDrink ? 'FREE' : `${s.price.toFixed(2)} EGP`}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-[10px] text-zinc-600 italic py-2 text-center">No purchases</div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex justify-center h-5">
                        {entry.eligibleForFreeDrink ? (
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={entry.freeDrink}
                              onChange={(e) => updateEntry(entry.id, { freeDrink: e.target.checked })}
                            />
                            <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-white/40"></div>
                          </label>
                        ) : (
                          <span className="text-[9px] text-zinc-800 font-bold uppercase tracking-widest">N/A</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex justify-end items-center gap-4">
                        {isCheckedOut ? (
                          <>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-zinc-600 text-[10px] font-bold uppercase">EGP</span>
                              <button 
                                onClick={() => {
                                  const autoPrice = getTimePriceTotal(entry) + (Number(entry.purchases) || 0);
                                  updateEntry(entry.id, { price: autoPrice });
                                }}
                                className="text-[9px] text-zinc-500 hover:text-white transition-colors bg-white/5 px-2 py-0.5 rounded flex items-center gap-1 group/calc"
                              >
                                <Clock size={10} className="group-hover/calc:rotate-12 transition-transform" />
                                Recalculate
                              </button>
                            </div>
                            <input 
                              className={`bg-transparent border-b border-zinc-800 focus:border-white transition-colors text-right text-sm font-medium px-1 py-1 w-20 outline-none !text-white !opacity-100 ${
                                entry.price === 'Pending' ? 'animate-pulse' : ''
                              }`}
                              placeholder="0.00"
                              value={entry.price === 'Pending' ? (getTimePriceTotal(entry) + (Number(entry.purchases) || 0)).toFixed(2) : entry.price}
                              onChange={(e) => updateEntry(entry.id, { price: e.target.value === '' ? 'Pending' : parseFloat(e.target.value) })}
                            />
                          </>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] text-zinc-800 font-black uppercase tracking-widest italic">Awaiting Exit</span>
                          </div>
                        )}
                        <button 
                          onClick={async () => {
                            try {
                              const entryData = entries.find(e => e.id === entry.id);
                              if (entryData) {
                                pushDeletion(`days/${dateString}/checkins`, entry.id, entryData, entryData.customerId || 'Untitled entry');
                                
                                // Refund visit if entry was charged to a subscription
                                if (entryData.subVisitCharged && entryData.customerId) {
                                  const sub = subs.find(s => s.customerId === entryData.customerId);
                                  if (sub) {
                                    await updateDoc(doc(db, 'subscriptions', sub.id), {
                                      visits: Math.max(0, (sub.visits || 0) - 1),
                                      remaining: (sub.remaining || 0) + 1,
                                      updatedAt: serverTimestamp()
                                    });
                                  }
                                }
                              }
                              await deleteDoc(doc(db, `days/${dateString}/checkins`, entry.id));
                            } catch (e) {
                              handleFirestoreError(e, OperationType.DELETE, `days/${dateString}/checkins/${entry.id}`);
                            }
                          }}
                          className="p-1 text-zinc-400 hover:text-red-400 transition-colors opacity-40 group-hover:opacity-100"
                        >
                          <MinusCircle size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-center text-zinc-600 font-display uppercase tracking-widest text-xs italic">
                    No registry entries for this sector
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button 
          onClick={addRow}
          className="w-full py-4 border border-white/10 border-dashed rounded-lg text-zinc-500 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all mt-4 flex items-center justify-center gap-2 group"
        >
          <Plus size={18} className="group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">Add Registry Entry</span>
        </button>
      </div>
    </div>
  );
};
