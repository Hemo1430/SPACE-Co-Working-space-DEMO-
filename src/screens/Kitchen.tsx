import React, { useState, useEffect, useRef } from 'react';
import { Coffee, Droplets, Cake, Utensils, Edit, Plus, MinusCircle, Search } from 'lucide-react';
import { useDate } from '../context/DateContext';
import { useHistory } from '../context/HistoryContext';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query,
  where,
  getDocs,
  increment,
  orderBy,
  serverTimestamp,
  deleteDoc
} from '../lib/firestoreDemo';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  freeDrinkEligible: boolean;
}

interface Sale {
  id: string;
  productId: string;
  productName: string;
  price: number;
  customerId: string;
  freeDrink: boolean;
}

export const Kitchen: React.FC = () => {
  const { dateString } = useDate();
  const { pushAction, pushDeletion } = useHistory();
  const [view, setView] = useState<'products' | 'sales'>('sales');
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Sync Products (Global) - Only once
    const productsPath = 'products';
    const pq = query(collection(db, productsPath), orderBy('createdAt', 'asc'));
    const productsUnsubscribe = onSnapshot(pq, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, productsPath));

    return () => productsUnsubscribe();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Add New shortcut (Ctrl + N)
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (view === 'products') addProduct();
        else addSale();
      }

      // Search shortcut (Ctrl + S)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  useEffect(() => {
    if (!dateString || dateString === 'NaN-aN-aN') return;

    // Sync Sales (Daily)
    const salesPath = `days/${dateString}/kitchenSales`;
    const sq = query(collection(db, salesPath), orderBy('createdAt', 'asc'));
    const salesUnsubscribe = onSnapshot(sq, (snapshot) => {
      setSales(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, salesPath));

    return () => {
      salesUnsubscribe();
    };
  }, [dateString]);

  const addProduct = async () => {
    try {
      await addDoc(collection(db, 'products'), {
        name: 'New Product',
        sku: `SKU-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        price: 0,
        freeDrinkEligible: false,
        createdAt: serverTimestamp()
      });
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'products'); }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    const before: any = {};
    const after: any = {};
    Object.keys(updates).forEach(key => {
      const k = key as keyof Product;
      before[k] = (product as any)[k];
      after[k] = (updates as any)[k];
    });

    pushAction({
      collectionPath: 'products',
      docId: id,
      before,
      after
    });

    try {
      await updateDoc(doc(db, 'products', id), updates);
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, `products/${id}`); }
  };

  const addSale = async () => {
    const path = `days/${dateString}/kitchenSales`;
    try {
      await addDoc(collection(db, path), {
        productId: '',
        productName: '',
        price: 0,
        customerId: '',
        freeDrink: false,
        createdAt: serverTimestamp()
      });
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, path); }
  };

  const updateSale = async (id: string, updates: Partial<Sale>) => {
    const path = `days/${dateString}/kitchenSales/${id}`;
    try {
      const saleDoc = sales.find(s => s.id === id);
      if (!saleDoc) return;

      const before: any = {};
      const after: any = {};
      Object.keys(updates).forEach(key => {
        const k = key as keyof Sale;
        before[k] = (saleDoc as any)[k];
        after[k] = (updates as any)[k];
      });

      pushAction({
        collectionPath: `days/${dateString}/kitchenSales`,
        docId: id,
        before,
        after
      });

      const oldCustomerId = (saleDoc.customerId || '').trim();
      
      // Trim new customer ID if being updated
      if (updates.customerId !== undefined) {
        updates.customerId = updates.customerId.trim();
      }
      
      const newCustomerId = updates.customerId !== undefined ? updates.customerId : oldCustomerId;

      // Special case: If user toggled 'freeDrink' manually in the sales list, 
      // we treat it as toggling the "Want Free Drink" flag for that customer.
      if (updates.freeDrink !== undefined && newCustomerId) {
        const checkSnap = await getDocs(query(collection(db, `days/${dateString}/checkins`), where("customerId", "==", newCustomerId)));
        if (!checkSnap.empty) {
          await updateDoc(doc(db, `days/${dateString}/checkins`, checkSnap.docs[0].id), {
            freeDrink: updates.freeDrink,
            updatedAt: serverTimestamp()
          });
        }
      }

      await updateDoc(doc(db, `days/${dateString}/kitchenSales`, id), {
        ...updates,
        updatedAt: serverTimestamp()
      });

      // Sync old customer if ID changed
      if (oldCustomerId && oldCustomerId !== newCustomerId) {
        await syncCheckin(oldCustomerId);
      }
      
      // Always sync the (current) new customer if it exists
      if (newCustomerId) {
        await syncCheckin(newCustomerId);
      }
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, path); }
  };

  const deleteSale = async (id: string) => {
    const saleDoc = sales.find(s => s.id === id);
    try {
      if (saleDoc) {
        pushDeletion(`days/${dateString}/kitchenSales`, id, saleDoc, `Sale of ${saleDoc.productName || 'product'}`);
      }
      await deleteDoc(doc(db, `days/${dateString}/kitchenSales`, id));
      if (saleDoc?.customerId) {
        await syncCheckin(saleDoc.customerId);
      }
    } catch (e) { handleFirestoreError(e, OperationType.DELETE, `days/${dateString}/kitchenSales/${id}`); }
  };

  const syncCheckin = async (customerId: string) => {
    if (!customerId) return;
    const cleanId = customerId.trim();
    if (!cleanId) return;
    
    // Use fresh lookups to prevent race conditions or state desync
    const [checkSnap, productsSnap] = await Promise.all([
      getDocs(query(collection(db, `days/${dateString}/checkins`), where("customerId", "==", cleanId))),
      getDocs(collection(db, 'products'))
    ]);

    if (checkSnap.empty) return;
    const checkinDoc = checkSnap.docs[0];
    const wantFreeDrink = checkinDoc.data().freeDrink;
    const allProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Get all sales for this customer
    const salesRef = collection(db, `days/${dateString}/kitchenSales`);
    const qSales = query(salesRef, where("customerId", "==", cleanId));
    const salesSnap = await getDocs(qSales);
    const salesData = salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sale));
    
    // Find expensive eligible item
    const eligibleSales = salesData.filter(s => {
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

    for (const sale of salesData) {
      const salePrice = Number(sale.price) || 0;
      const shouldBeFree = sale.id === freeSaleId;

      if (sale.freeDrink !== shouldBeFree) {
        await updateDoc(doc(db, salesRef.path, sale.id), { freeDrink: shouldBeFree });
      }

      if (shouldBeFree) {
        anyFreeMarked = true;
      } else {
        total += salePrice;
      }
    }

    // Update ALL matching check-in docs
    for (const docSnap of checkSnap.docs) {
      await updateDoc(doc(db, `days/${dateString}/checkins`, docSnap.id), {
        purchases: total,
        freeDrink: anyFreeMarked,
        eligibleForFreeDrink: eligibleForFreeDrink,
        updatedAt: serverTimestamp()
      });
    }
  };

  return (
    <div className="relative min-h-full">
      {/* Atmospheric Background */}
      <div className="fixed inset-0 z-[-1] bg-surface pointer-events-none">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-[0.15] mix-blend-screen" 
          style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBxtYuw6i7uVtqe435lXnm88-ujljM5S51UJ5j_DQT-WctMyCwwOOxRZS30V0kwLSXrsdafsexSnmpQlAPr7kD2kGcCTQmyKD-A3CyGnSUB4f2G-grG4nMUi2RuGz75b5akDHKlXuVAb8N6HseAL-AT7w-zg3F3YUIDf20SP7dSUzjaiAJxPhJYDcHzuycDDOTUMGvmdtkIx2Fb2GBL7lKd9jtZ3tl0I0NSOXQn1wfAzVMCoUZfZaubMbYAbHkf1GcgQrPOT09m4Ig')" }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-surface via-transparent to-transparent"></div>
      </div>

      <div className="max-w-[1440px] mx-auto px-margin-mobile md:px-margin-desktop py-12 relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <h1 className="text-h1 text-white mb-3">Kitchen Management</h1>
            <p className="text-lg text-on-surface-variant max-w-xl">
              {view === 'products' ? 'Global Inventory Control' : `Sales terminal for ${dateString.replace(/-/g, '/')}`}
            </p>
          </div>
        </header>

        {/* Toggle Controls */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex space-x-2 bg-surface-container/60 backdrop-blur-md p-1.5 rounded-lg w-max border border-outline-variant/20 shadow-sm">
            <button 
              onClick={() => setView('products')}
              className={`px-8 py-2.5 rounded-md font-label-sm text-label-sm transition-all duration-200 ${
                view === 'products' 
                  ? 'bg-primary text-on-primary shadow-sm' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              PRODUCTS
            </button>
            <button 
              onClick={() => setView('sales')}
              className={`px-8 py-2.5 rounded-md font-label-sm text-label-sm transition-all duration-200 ${
                view === 'sales' 
                  ? 'bg-primary text-on-primary shadow-sm' 
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              SALES
            </button>
          </div>

          <div className="flex items-center gap-2 text-zinc-500 border border-white/10 px-4 py-2 rounded-lg bg-zinc-900/40 backdrop-blur-sm w-full md:w-64">
            <Search size={16} className="text-zinc-500" />
            <input
              ref={searchInputRef}
              className="bg-transparent border-none focus:ring-0 text-sm w-full placeholder:text-zinc-600 outline-none"
              placeholder={view === 'products' ? "Search products..." : "Search sales..."}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {view === 'products' ? (
          <div className="glass-panel overflow-hidden bg-[#0D1117]/60 rounded-xl px-[31px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="px-6 py-4 font-display text-xs uppercase tracking-widest text-slate-400">PRODUCT NAME</th>
                  <th className="px-6 py-4 font-display text-xs uppercase tracking-widest text-slate-400">PRODUCT ID</th>
                  <th className="px-6 py-4 font-display text-xs uppercase tracking-widest text-slate-400">PRICE</th>
                  <th className="px-6 py-4 font-display text-xs uppercase tracking-widest text-slate-400 text-center">FREE DRINK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {products
                  .filter(p => !searchTerm || (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((product) => (
                  <tr key={product.id} className="hover:bg-white/[0.03] transition-colors group">
                    <td className="px-6 py-5 flex items-center gap-3">
                      <div className="flex items-center gap-2 w-full">
                        <input
                          className="bg-transparent border-none p-0 focus:ring-0 text-white font-medium w-full text-sm outline-none"
                          type="text"
                          value={product.name}
                          onChange={(e) => updateProduct(product.id, { name: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 w-full">
                        <input
                          className="bg-transparent border-none p-0 focus:ring-0 text-slate-400 font-mono text-sm w-full tracking-tighter outline-none"
                          type="text"
                          value={product.sku}
                          onChange={(e) => updateProduct(product.id, { sku: e.target.value })}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2 w-full text-sm">
                        <span className="text-zinc-600 text-[10px] font-bold uppercase">EGP</span>
                        <input
                          className="bg-transparent border-none p-0 focus:ring-0 text-white w-full outline-none"
                          type="number"
                          step="0.01"
                          value={product.price}
                          onChange={(e) => updateProduct(product.id, { price: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex justify-center items-center gap-3">
                        <button 
                          onClick={() => updateProduct(product.id, { freeDrinkEligible: !product.freeDrinkEligible })}
                          className={`w-10 h-5 rounded-full relative transition-colors border border-white/10 ${
                          product.freeDrinkEligible ? 'bg-primary/40' : 'bg-white/5'
                        }`}>
                          <div className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                            product.freeDrinkEligible 
                              ? 'translate-x-[20px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' 
                              : 'translate-x-0 bg-slate-600'
                          }`}></div>
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              const productData = products.find(p => p.id === product.id);
                              if (productData) {
                                pushDeletion('products', product.id, productData, productData.name || 'Untitled product');
                              }
                              await deleteDoc(doc(db, 'products', product.id));
                            } catch (e) {
                              handleFirestoreError(e, OperationType.DELETE, `products/${product.id}`);
                            }
                          }}
                          className="p-1 text-zinc-400 hover:text-red-400 transition-colors opacity-40 group-hover:opacity-100"
                        >
                          <MinusCircle size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr><td colSpan={4} className="py-12 text-center text-zinc-600 uppercase text-xs tracking-widest italic">No products registered</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-surface-container-low/40 backdrop-blur-2xl border border-outline-variant/20 rounded-xl overflow-visible shadow-2xl px-[31px]">
            <div className="grid grid-cols-12 gap-4 items-center px-6 py-4 border-b border-outline-variant/20 bg-surface-container-lowest/30 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              <div className="col-span-2">PRODUCT ID</div>
              <div className="col-span-4">PRODUCT NAME</div>
              <div className="col-span-2">PRICE</div>
              <div className="col-span-2 text-center">FREE DRINK</div>
              <div className="col-span-2">CUSTOMER ID</div>
            </div>
            
            {sales
              .filter(s => !searchTerm || (s.productName || '').toLowerCase().includes(searchTerm.toLowerCase()) || (s.productId || '').toLowerCase().includes(searchTerm.toLowerCase()) || (s.customerId || '').toLowerCase().includes(searchTerm.toLowerCase()))
              .map((sale) => {
              const linkedProduct = products.find(p => p.sku === sale.productId);
              
              const handleSkuChange = (sku: string) => {
                const product = products.find(p => p.sku === sku);
                if (product) {
                  updateSale(sale.id, { 
                    productId: sku, 
                    productName: product.name, 
                    price: product.price 
                  });
                } else {
                  updateSale(sale.id, { productId: sku });
                }
              };

              return (
                <div key={sale.id} className="grid grid-cols-12 gap-6 items-center px-6 py-5 border-b border-outline-variant/10 hover:bg-surface-container/50 transition-colors duration-200 group">
                  <div className="col-span-2">
                    <input 
                      className="w-full bg-transparent border-0 border-b border-outline-variant/40 focus:border-primary focus:ring-0 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/40 px-0 py-1.5 transition-colors outline-none" 
                      placeholder="Type SKU..." 
                      type="text"
                      value={sale.productId || ''}
                      onChange={(e) => handleSkuChange(e.target.value)}
                    />
                  </div>
                  <div className="col-span-4">
                    <input 
                      className="w-full bg-transparent border-0 border-b border-outline-variant/10 focus:border-primary focus:ring-0 font-body-md text-body-md text-on-surface px-0 py-1.5 outline-none"
                      value={sale.productName || ''}
                      placeholder="Product Name"
                      onChange={(e) => updateSale(sale.id, { productName: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-zinc-600 mr-2 text-[10px] font-bold uppercase">EGP</span>
                    <input 
                      className={`w-full bg-transparent border-0 border-b border-outline-variant/10 focus:border-primary focus:ring-0 font-body-md text-body-md text-on-surface px-0 py-1.5 outline-none ${sale.freeDrink ? 'opacity-50 line-through' : ''}`}
                      type="number"
                      step="0.01"
                      value={sale.freeDrink ? 0 : sale.price}
                      disabled={sale.freeDrink}
                      onChange={(e) => updateSale(sale.id, { price: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {linkedProduct?.freeDrinkEligible ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          className="sr-only peer" 
                          type="checkbox" 
                          checked={sale.freeDrink} 
                          onChange={(e) => updateSale(sale.id, { freeDrink: e.target.checked })} 
                        />
                        <div className="w-10 h-5 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-white/40"></div>
                      </label>
                    ) : (
                      <div className="text-zinc-800 text-[10px] font-bold uppercase tracking-widest">N/A</div>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <input 
                      className="w-full bg-transparent border-0 border-b border-outline-variant/40 focus:border-primary focus:ring-0 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/40 px-0 py-1.5 transition-colors outline-none" 
                      placeholder="Optional ID..." 
                      type="text"
                      value={sale.customerId || ''}
                      onChange={(e) => updateSale(sale.id, { customerId: e.target.value })}
                    />
                    <button 
                      onClick={() => deleteSale(sale.id)}
                      className="p-1 text-zinc-400 hover:text-red-400 transition-colors opacity-40 group-hover:opacity-100 ml-2"
                    >
                      <MinusCircle size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
            {sales.length === 0 && (
              <div className="py-12 text-center text-zinc-600 uppercase text-xs tracking-widest italic">No sales recorded today</div>
            )}
          </div>
        )}

        <button 
          onClick={view === 'products' ? addProduct : addSale}
          className="w-full py-4 border border-white/10 border-dashed rounded-lg text-zinc-500 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all mt-8 flex items-center justify-center gap-2 group"
        >
          <Plus size={18} className="group-hover:scale-110 transition-transform" />
          <span className="text-xs font-bold uppercase tracking-widest">
            {view === 'products' ? 'Add Inventory Item' : 'Register New Sale'}
          </span>
        </button>
      </div>
    </div>
  );
};
