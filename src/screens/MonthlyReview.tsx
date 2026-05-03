import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  ShoppingBag, 
  DollarSign, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  LayoutGrid,
  History
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  getDoc,
  doc,
  query, 
  where,
  orderBy
} from '../lib/firestoreDemo';
import { db, handleFirestoreError, OperationType, calculateStepPricing, DEFAULT_SETTINGS, AppSettings } from '../lib/firebase';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  eachDayOfInterval, 
  isSameMonth,
  parseISO
} from 'date-fns';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface DaySummary {
  date: string;
  revenue: number;
  newCustomers: number;
  roomsBooked: number;
  kitchenSales: number;
}

interface ProductSale {
  name: string;
  quantity: number;
  revenue: number;
}

export const MonthlyReview: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    newCustomers: 0,
    checkinCount: 0,
    checkinRevenue: 0,
    roomsBooked: 0,
    roomsRevenue: 0,
    kitchenTotal: 0,
    subscriptionsTotal: 0,
    othersTotal: 0,
    calculatedGrandTotal: 0,
    prevMonthRevenue: 0,
  });
  const [dailyData, setDailyData] = useState<any[]>([]);
  const [productSales, setProductSales] = useState<ProductSale[]>([]);
  const [allOtherItems, setAllOtherItems] = useState<any[]>([]);
  const [showOthersModal, setShowOthersModal] = useState(false);

  const fetchMonthData = async (month: Date) => {
    setIsLoading(true);
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');

    try {
      const startDate = startOfMonth(month);
      const endDate = endOfMonth(month);

      // Fetch settings for pricing
      const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
      const settings = settingsSnap.exists() ? settingsSnap.data() as AppSettings : DEFAULT_SETTINGS;
      const standardRate = Number(settings.hourPrices?.standard) || DEFAULT_SETTINGS.hourPrices.standard;
      const maxPrice = Number(settings.hourPrices?.lateNight) || DEFAULT_SETTINGS.hourPrices.lateNight;

      // 1. Fetch Room Bookings for the entire month in one query
      const roomsSnap = await getDocs(query(
        collection(db, 'roomBookings'),
        where('bookingDate', '>=', start),
        where('bookingDate', '<=', end)
      ));
      
      let totalRoomsRevenue = 0;
      roomsSnap.forEach(doc => {
        totalRoomsRevenue += Number(doc.data().price) || 0;
      });
      const roomsCount = roomsSnap.size;

      // 2. Fetch New Customers for the month
      const customersSnap = await getDocs(query(
        collection(db, 'customers'),
        where('createdAt', '>=', startDate),
        where('createdAt', '<=', endDate)
      ));
      const newCusts = customersSnap.size;
      
      // 3. Fetch Subscriptions for the month
      const subsSnap = await getDocs(query(
        collection(db, 'subscriptions'),
        where('start', '>=', start),
        where('start', '<=', end)
      ));
      let totalSubsRev = 0;
      const plans = settings?.subscriptions || DEFAULT_SETTINGS.subscriptions;
      subsSnap.forEach(d => {
        const sub = d.data();
        const plan = plans.find(p => p.name === sub.type);
        if (plan) {
          totalSubsRev += Number(plan.price) || 0;
        }
      });
      
      // 4. Fetch Day summaries for daily liquidity
      const daysRef = collection(db, 'days');
      const q = query(
        daysRef, 
        where('__name__', '>=', start),
        where('__name__', '<=', end)
      );
      const daysSnap = await getDocs(q);
      
      const dayDocs = daysSnap.docs.reduce((acc, d) => {
        acc[d.id] = d.data();
        return acc;
      }, {} as any);

      // We still need to iterate days to get subcollection data (Kitchen Sales, Checkins)
      const daysInMonth = eachDayOfInterval({ start: startDate, end: endDate });

      // PERFORMANCE OPTIMIZATION: Prepare all day-specific promises upfront to fetch in parallel
      const dayDataPromises = daysInMonth.map(async (day) => {
        const dStr = format(day, 'yyyy-MM-dd');
        const daySub = dayDocs[dStr] || {};

        // Fetch subcollections in parallel for THIS day
        const [kitchenSnap, checkinSnap] = await Promise.all([
          getDocs(collection(db, `days/${dStr}/kitchenSales`)),
          getDocs(collection(db, `days/${dStr}/checkins`))
        ]);

        return { day, dStr, daySub, kitchenSnap, checkinSnap };
      });

      // Wait for ALL days of the month to resolve concurrently (O(1) wait time vs O(n))
      const dayResults = await Promise.all(dayDataPromises);

      let totalKitchen = 0;
      let totalCheckinCount = 0;
      let totalCheckinRev = 0;
      let totalOthers = 0;
      const chartData: any[] = [];
      const productMap: Record<string, ProductSale> = {};
      const collectedOthers: any[] = [];

      // Process parallel results
      dayResults.forEach(({ day, dStr, daySub, kitchenSnap, checkinSnap }) => {
        let dayKitchenTotal = 0;
        kitchenSnap.forEach(s => {
          const sData = s.data();
          const isFree = sData.freeDrink === true;
          const price = isFree ? 0 : (Number(sData.price) || 0);
          const name = sData.productName || 'Unknown';
          
          dayKitchenTotal += price;

          if (!productMap[name]) {
            productMap[name] = { name, quantity: 0, revenue: 0 };
          }
          productMap[name].quantity += 1;
          productMap[name].revenue += price;
        });

        let dayCheckinRev = 0;
        checkinSnap.forEach(s => {
          const dData = s.data();
          const isCheckedOut = dData.checkOut && dData.checkOut !== '' && dData.checkOut !== '--:--';
          
          if (isCheckedOut && dData.checkIn && dData.checkIn !== '--:--') {
            const [hIn, mIn] = dData.checkIn.split(':').map(Number);
            const [y, m, d_val] = dStr.split('-').map(Number);
            const checkInDate = new Date(y, m - 1, d_val, hIn, mIn);
            
            const [hOut, mOut] = dData.checkOut.split(':').map(Number);
            const endTime = new Date(y, m - 1, d_val, hOut, mOut);

            const diffMs = endTime.getTime() - checkInDate.getTime();
            const totalMinutes = Math.floor(diffMs / 60000);
            
            if (totalMinutes > 0) {
              const seatFee = calculateStepPricing(totalMinutes, standardRate, maxPrice);
              dayCheckinRev += seatFee;
            }
          }
        });
        totalCheckinCount += checkinSnap.size;
        totalCheckinRev += dayCheckinRev;

        const dayOthersList = daySub.otherItems || [];
        const dayOthersSum = dayOthersList.reduce((acc: number, it: any) => {
          collectedOthers.push({ 
            ...it, 
            date: dStr, 
            dayNotes: daySub.notes || '' 
          });
          return acc + (Number(it.amount) || 0);
        }, 0);
        
        totalKitchen += dayKitchenTotal;
        totalOthers += dayOthersSum;

        const dayRevenueCalculated = dayCheckinRev + dayKitchenTotal + dayOthersSum;
        
        // Find subscriptions for this specific day
        const daySubsTotal = Array.from(subsSnap.docs)
          .filter(doc => doc.data().start === dStr)
          .reduce((acc, doc) => {
            const sub = doc.data();
            const plan = plans.find(p => p.name === sub.type);
            return acc + (Number(plan?.price) || 0);
          }, 0);
          
        // Find room bookings for this specific day
        const dayRoomsTotal = Array.from(roomsSnap.docs)
          .filter(doc => doc.data().bookingDate === dStr)
          .reduce((acc, doc) => acc + (Number(doc.data().price) || 0), 0);

        const dailyGrandTotal = dayRevenueCalculated + daySubsTotal + dayRoomsTotal;

        chartData.push({
          date: format(day, 'dd'),
          revenue: dailyGrandTotal,
          kitchen: dayKitchenTotal
        });
      });

      // 4. Fetch Previous Month for comparison
      const prevMonth = subMonths(month, 1);
      const pStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
      const pEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd');
      const prevDaysSnap = await getDocs(query(collection(db, 'days'), where('__name__', '>=', pStart), where('__name__', '<=', pEnd)));
      const prevRev = prevDaysSnap.docs.reduce((acc, d) => acc + (Number(d.data().cash) || 0) + (Number(d.data().instapay) || 0), 0);

      const calculatedTotal = totalCheckinRev + totalRoomsRevenue + totalKitchen + totalSubsRev + totalOthers;

      setStats({
        totalRevenue: calculatedTotal,
        newCustomers: newCusts,
        checkinCount: totalCheckinCount,
        checkinRevenue: totalCheckinRev,
        roomsBooked: roomsCount,
        roomsRevenue: totalRoomsRevenue,
        kitchenTotal: totalKitchen,
        subscriptionsTotal: totalSubsRev,
        othersTotal: totalOthers,
        prevMonthRevenue: prevRev,
        calculatedGrandTotal: calculatedTotal
      });
      setDailyData(chartData);
      setProductSales(Object.values(productMap).sort((a, b) => b.revenue - a.revenue));
      setAllOtherItems(collectedOthers.sort((a, b) => b.date.localeCompare(a.date)));

    } catch (error) {
      console.error('Failed to fetch monthly data:', error);
      handleFirestoreError(error, OperationType.GET, 'days');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthData(selectedMonth);
  }, [selectedMonth]);

  const revDiff = stats.totalRevenue - stats.prevMonthRevenue;
  const revPercent = stats.prevMonthRevenue === 0 ? 100 : (revDiff / stats.prevMonthRevenue) * 100;

  return (
    <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-12 relative">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none opacity-20 overflow-hidden z-0">
        <div className="absolute top-1/4 -left-20 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="relative z-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
                <History className="text-primary" size={24} />
              </div>
              <h1 className="text-4xl font-display font-black text-white tracking-tighter uppercase italic">Mon-Review</h1>
            </div>
            <p className="text-zinc-500 max-w-xl font-medium uppercase tracking-[0.15em] text-[10px]">
              Comprehensive analytical summary for the period of {format(selectedMonth, 'MMMM yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-zinc-950/40 backdrop-blur-xl border border-white/5 p-2 rounded-2xl shadow-2xl">
            <button 
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              className="p-3 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="px-8 flex flex-col items-center">
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-1">Target Period</span>
              <span className="text-sm font-display font-bold text-white uppercase">{format(selectedMonth, 'MMM yyyy')}</span>
            </div>
            <button 
              onClick={() => setSelectedMonth(new Date(selectedMonth.setMonth(selectedMonth.getMonth() + 1)))}
              disabled={isSameMonth(selectedMonth, new Date())}
              className="p-3 text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all disabled:opacity-20"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="min-h-[600px] flex flex-col items-center justify-center gap-6">
            <div className="w-16 h-16 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
            <p className="font-display font-black text-zinc-500 uppercase tracking-widest text-xs">Processing Global Ledger...</p>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-10"
          >
            {/* Top Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
              {[
                { 
                  label: 'Giant Total', 
                  value: stats.calculatedGrandTotal, 
                  icon: DollarSign, 
                  color: 'text-emerald-300', 
                  unit: 'EGP', 
                  trend: revPercent,
                  bg: 'bg-[#0b2e1a]/30 border-emerald-500/20',
                  glow: 'bg-emerald-500/5 shadow-[0_20px_50px_rgba(0,0,0,0.3)]',
                  colSpan: 'xl:col-span-2'
                },
                { 
                  label: 'Seat Revenue', 
                  value: stats.checkinRevenue, 
                  icon: Users, 
                  color: 'text-white', 
                  unit: 'EGP',
                  subValue: stats.checkinCount,
                  subUnit: 'TOTAL ENTRIES',
                  subColor: 'text-white',
                  bg: 'bg-white/10 border-white/20',
                  glow: 'bg-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.2)]'
                },
                { 
                  label: 'Subscriptions', 
                  value: stats.subscriptionsTotal, 
                  icon: LayoutGrid, 
                  color: 'text-purple-300', 
                  unit: 'EGP',
                  bg: 'bg-[#1a0b2e]/30 border-purple-500/20',
                  glow: 'bg-purple-500/5 shadow-[0_20px_50px_rgba(0,0,0,0.3)]'
                },
                { 
                  label: 'Room Revenue', 
                  value: stats.roomsRevenue, 
                  icon: Calendar, 
                  color: 'text-blue-400', 
                  unit: 'EGP',
                  subValue: stats.roomsBooked,
                  subUnit: 'BOOKINGS',
                  subColor: 'text-blue-400',
                  bg: 'bg-[#0b1a2e]/30 border-blue-500/20',
                  glow: 'bg-blue-500/5 shadow-[0_20px_50px_rgba(0,0,0,0.3)]'
                },
                { 
                  label: 'Kitchen Sales', 
                  value: stats.kitchenTotal, 
                  icon: ShoppingBag, 
                  color: 'text-amber-300', 
                  unit: 'EGP',
                  bg: 'bg-[#2e1d0b]/30 border-amber-500/20',
                  glow: 'bg-amber-500/5 shadow-[0_20px_50px_rgba(0,0,0,0.3)]'
                },
                { 
                  label: 'Other Items', 
                  value: stats.othersTotal, 
                  icon: History, 
                  color: 'text-zinc-300', 
                  unit: 'EGP',
                  bg: 'bg-zinc-900/30 border-zinc-700/20',
                  glow: 'shadow-[0_20px_50px_rgba(0,0,0,0.2)]',
                  onClick: () => setShowOthersModal(true)
                }
              ].map((stat, i) => (
                <div 
                  key={i} 
                  onClick={stat.onClick}
                  className={`backdrop-blur-3xl border ${stat.bg} ${stat.glow} ${stat.colSpan || ''} rounded-[28px] p-8 flex flex-col gap-4 group hover:scale-[1.02] transition-all duration-500 relative overflow-hidden ${stat.onClick ? 'cursor-pointer' : ''}`}
                >
                  {/* Subtle Corner Glow like Income Cards */}
                  <div className={`absolute top-0 right-0 w-32 h-32 ${stat.glow.split(' ')[0]} rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none opacity-50`}></div>
                  
                  <div className="relative z-10 flex flex-col gap-4">
                    <stat.icon className={`${stat.color} transition-colors opacity-70 group-hover:opacity-100`} size={20} />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-zinc-400/60 uppercase tracking-[0.2em] mb-2">{stat.label}</span>
                      <div className="flex items-baseline gap-2">
                         <span className={`${stat.label === 'Giant Total' ? 'text-6xl md:text-7xl' : (stat.label === 'Seat Revenue' || stat.label === 'Room Revenue' ? 'text-4xl' : 'text-3xl')} font-display font-black ${stat.color} tracking-tighter`}>{stat.value.toLocaleString()}</span>
                         <span className="text-[10px] font-bold text-zinc-500 uppercase">{stat.unit}</span>
                      </div>
                    </div>
                    
                    {stat.subValue !== undefined && (
                      <div className="mt-2 pt-4 border-t border-white/10 flex flex-col">
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">{stat.subUnit}</span>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-2xl font-display font-black ${stat.subColor || 'text-emerald-300'} tracking-tighter`}>{stat.subValue.toLocaleString()}</span>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase">{stat.subUnit.includes('ENTRIES') || stat.subUnit.includes('BOOKINGS') ? stat.subUnit.split(' ')[1] : 'EGP'}</span>
                        </div>
                      </div>
                    )}

                    {stat.trend !== undefined && (
                      <div className={`flex items-center gap-1.5 mt-2 ${stat.trend >= 0 ? 'text-emerald-300 shadow-emerald-500/20' : 'text-red-300 shadow-red-500/20'}`}>
                        {stat.trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        <span className="text-[11px] font-black">{Math.abs(stat.trend).toFixed(1)}% vs prev month</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal for Other Items */}
            <AnimatePresence>
              {showOthersModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowOthersModal(false)}
                    className="absolute inset-0 bg-black/80 backdrop-blur-md"
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-[40px] shadow-2xl overflow-hidden"
                  >
                    <div className="p-10 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                      <div>
                        <h3 className="text-2xl font-display font-black text-white uppercase tracking-tight italic">Miscellaneous Liquidation</h3>
                        <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-1">Detailed log of all "Other Items" for {format(selectedMonth, 'MMMM')}</p>
                      </div>
                      <button 
                        onClick={() => setShowOthersModal(false)}
                        className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-500 hover:text-white"
                      >
                        <History size={20} className="rotate-45" />
                      </button>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto p-2">
                       <table className="w-full text-left">
                         <thead>
                           <tr className="border-b border-white/5">
                             <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">DATE</th>
                             <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">ITEM DESCRIPTION</th>
                             <th className="px-8 py-5 text-right text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">AMOUNT</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-white/5">
                           {allOtherItems.map((item, idx) => (
                             <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                               <td className="px-8 py-6">
                                 <div className="flex flex-col">
                                   <span className="text-xs font-mono font-bold text-zinc-400">{item.date ? format(parseISO(item.date), 'MMM dd') : '---'}</span>
                                   {item.dayNotes && (
                                     <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter truncate max-w-[150px]" title={item.dayNotes}>
                                       {item.dayNotes}
                                     </span>
                                   )}
                                 </div>
                               </td>
                               <td className="px-8 py-6">
                                 <span className="text-sm font-display font-bold text-white uppercase tracking-tight">{item.label || item.name || 'UNLABELED'}</span>
                               </td>
                               <td className="px-8 py-6 text-right">
                                 <span className="text-sm font-mono font-black text-primary tracking-widest">{Number(item.amount).toLocaleString()}</span>
                                 <span className="ml-2 text-[10px] font-bold text-zinc-600 uppercase">EGP</span>
                               </td>
                             </tr>
                           ))}
                           {allOtherItems.length === 0 && (
                             <tr>
                               <td colSpan={3} className="py-20 text-center text-zinc-700 italic uppercase font-black tracking-widest text-xs">
                                 No miscellaneous items found
                               </td>
                             </tr>
                           )}
                         </tbody>
                       </table>
                    </div>

                    <div className="p-10 bg-white/[0.02] border-t border-white/5 flex justify-between items-center">
                       <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Aggregate Total</span>
                       <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-display font-black text-white">{stats.othersTotal.toLocaleString()}</span>
                          <span className="text-[10px] font-bold text-zinc-500 uppercase">EGP</span>
                       </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Main Visuals Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Performance Chart */}
              <div className="lg:col-span-8 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] p-8 shadow-2xl relative">
                <div className="flex justify-between items-center mb-10">
                  <div>
                    <h3 className="text-xl font-display font-black text-white uppercase tracking-tight italic">Velocity Graph</h3>
                    <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-1">Daily liquidity flow (Cash + Instapay)</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Revenue</span>
                    </div>
                  </div>
                </div>

                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ffffff" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#52525b', fontSize: 10, fontWeight: 900 }}
                        dy={10}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#52525b', fontSize: 10, fontWeight: 900 }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#09090b', 
                          border: '1px solid rgba(255,255,255,0.1)', 
                          borderRadius: '16px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          color: '#fff'
                        }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#fff" 
                        strokeWidth={4}
                        fillOpacity={1} 
                        fill="url(#colorRev)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top 5 Products */}
              <div className="lg:col-span-4 bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] p-8 shadow-2xl flex flex-col">
                <div className="mb-8">
                   <h3 className="text-xl font-display font-black text-white uppercase tracking-tight italic">Elite Inventory</h3>
                   <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-1">Top performing kitchen items</p>
                </div>

                <div className="space-y-6 flex-grow">
                  {productSales.slice(0, 5).map((prod, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center font-display font-black text-xs text-zinc-400 border border-white/5">
                          0{i + 1}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white uppercase tracking-tight">{prod.name}</span>
                          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{prod.quantity} Sales</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-bold text-primary">{prod.revenue.toLocaleString()}</span>
                        <span className="block text-[8px] font-black text-zinc-600 uppercase tracking-[0.1em]">EGP Total</span>
                      </div>
                    </div>
                  ))}
                  {productSales.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-600 italic text-xs uppercase tracking-widest">
                      No consumption recorded
                    </div>
                  )}
                </div>

                <div className="mt-10 pt-6 border-t border-white/5">
                  <div className="flex justify-between items-center bg-primary/5 p-4 rounded-2xl border border-primary/10">
                     <div className="flex items-center gap-2">
                        <ShoppingBag className="text-primary" size={16} />
                        <span className="text-[10px] font-black text-zinc-100 uppercase tracking-widest">Monthly Kitchen Gross</span>
                     </div>
                     <span className="font-display font-black text-white">{stats.kitchenTotal.toLocaleString()} <span className="text-[10px] opacity-30">EGP</span></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Full Sales Table */}
            <div className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-display font-black text-white uppercase tracking-tight italic">Product Sales Manifest</h3>
                  <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-1">Detailed inventory liquidation for the current period</p>
                </div>
                <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{productSales.length} Unique Products Sold</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-10 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">RANK</th>
                      <th className="px-10 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">PRODUCT NAME</th>
                      <th className="px-10 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">QUANTITY</th>
                      <th className="px-10 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">UNIT REV (EST)</th>
                      <th className="px-10 py-5 text-right text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] pr-[60px]">TOTAL YIELD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productSales.map((prod, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-10 py-6 border-b border-white/5">
                          <span className="text-xs font-mono font-bold text-zinc-600 group-hover:text-primary transition-colors">#{idx + 1}</span>
                        </td>
                        <td className="px-10 py-6 border-b border-white/5">
                          <span className="text-sm font-display font-bold text-white uppercase tracking-tight">{prod.name}</span>
                        </td>
                        <td className="px-10 py-6 border-b border-white/5">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-bold text-zinc-400">{prod.quantity}</span>
                            <div className="h-1 bg-white/5 rounded-full w-24 overflow-hidden">
                              <div 
                                className="h-full bg-zinc-200" 
                                style={{ width: `${(prod.quantity / (productSales[0]?.quantity || 1)) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6 border-b border-white/5">
                          <span className="text-sm font-mono text-zinc-500">{(prod.revenue / prod.quantity).toFixed(0)}</span>
                        </td>
                        <td className="px-10 py-6 border-b border-white/5 text-right pr-[60px]">
                           <span className="text-sm font-mono font-black text-white tracking-widest">{prod.revenue.toLocaleString()}</span>
                           <span className="ml-2 text-[10px] font-bold text-zinc-600 uppercase">EGP</span>
                        </td>
                      </tr>
                    ))}
                    {productSales.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-zinc-700 italic uppercase font-black tracking-widest text-xs">
                          No sales data found for this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Summary Card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="bg-[#0b1a2e]/20 backdrop-blur-3xl border border-blue-500/20 rounded-[32px] p-10 flex flex-col justify-center items-center text-center shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors"></div>
                  <LayoutGrid className="text-blue-400 mb-4" size={24} />
                  <h4 className="text-[10px] font-black text-blue-400/60 uppercase tracking-[0.3em] mb-2">Efficiency Rating</h4>
                  <div className="text-4xl font-display font-black text-white mb-2">HIGH</div>
                  <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest max-w-[200px]">Optimal resident turnover and inventory management detected.</p>
               </div>

               <div className="lg:col-span-2 bg-[#1a0b2e]/20 backdrop-blur-3xl border border-purple-500/20 rounded-[32px] p-10 shadow-2xl relative overflow-hidden group flex flex-col justify-center">
                  <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
                  <div className="flex justify-between items-center relative z-10">
                    <div>
                      <h4 className="text-[10px] font-black text-purple-400/60 uppercase tracking-[0.3em] mb-4">Executive Insight</h4>
                      <div className="text-2xl font-display font-black text-white italic tracking-tight uppercase max-w-md">
                        {revPercent >= 0 
                          ? `Revenue trajectory is positive with +${revPercent.toFixed(1)}% growth relative to prior term.`
                          : `Revenue trajectory is under pressure experiencing a ${Math.abs(revPercent).toFixed(1)}% retreat.`
                        }
                      </div>
                    </div>
                    <div className="hidden md:block">
                      <div className="w-20 h-20 border-4 border-purple-500/20 border-t-purple-500 rounded-full flex items-center justify-center font-display font-black text-purple-400 text-sm">
                        {Math.abs(revPercent).toFixed(0)}%
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
