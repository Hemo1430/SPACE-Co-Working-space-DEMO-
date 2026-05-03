import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Users, Clock, MessageSquare, Plus, MinusCircle, Search, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  orderBy,
  serverTimestamp 
} from '../lib/firestoreDemo';
import { db, OperationType, handleFirestoreError, AppSettings, DEFAULT_SETTINGS } from '../lib/firebase';

interface Booking {
  id: string;
  customer: string;
  room: string;
  visitors: number;
  checkIn: string;
  checkOut: string;
  comment: string;
  price: number;
  bookingDate?: string;
  borderColor?: string;
  roomType?: string;
  phone?: string;
  roomName?: string;
}

const BORDER_COLORS = [
  { name: 'Blue', value: '#3b82f6', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.5)]' },
  { name: 'Purple', value: '#a855f7', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]' },
  { name: 'Green', value: '#22c55e', glow: 'shadow-[0_0_15px_rgba(34,197,94,0.5)]' },
  { name: 'Orange', value: '#f97316', glow: 'shadow-[0_0_15px_rgba(249,115,22,0.5)]' },
  { name: 'Red', value: '#ef4444', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]' },
  { name: 'Pink', value: '#ec4899', glow: 'shadow-[0_0_15px_rgba(236,72,153,0.5)]' },
];

export const Rooms: React.FC = () => {
  const { dateString } = useDate();
  const { pushAction, pushDeletion } = useHistory();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSettings(prev => ({ ...prev, ...snap.data() }));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const calculateRoomPrice = (booking: Booking) => {
    if (!booking.checkIn || booking.checkIn === '--:--') return 0;
    
    const [hIn, mIn] = booking.checkIn.split(':').map(Number);
    const [y, m, d] = (booking.bookingDate || dateString).split('-').map(Number);
    const checkInDate = new Date(y, m - 1, d, hIn, mIn);

    let endTime = currentTime;
    if (booking.checkOut && booking.checkOut !== '--:--') {
      const [hOut, mOut] = booking.checkOut.split(':').map(Number);
      endTime = new Date(y, m - 1, d, hOut, mOut);
    }

    let diffMs = endTime.getTime() - checkInDate.getTime();
    if (diffMs < 0) return 0;

    const totalMinutes = Math.floor(diffMs / 60000);
    const roomConfig = settings.rooms.find(r => r.id === booking.roomType);
    
    if (!roomConfig) {
      // Fallback for old data or deleted rooms
      return 0;
    }

    const rate = Number(roomConfig.hourly) || 0;
    // Minute-based pricing: (rate/60) * totalMinutes
    return (totalMinutes / 60) * rate;
  };

  useEffect(() => {
    if (!dateString || dateString === 'NaN-aN-aN') return;
    
    const path = "roomBookings";
    // Filter by the current selected date
    const q = query(
      collection(db, path), 
      where('bookingDate', '==', dateString),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, path));
    return unsubscribe;
  }, [dateString]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Add New shortcut (Ctrl + N)
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        addBooking();
      }

      // Search shortcut (Ctrl + S)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if (e.shiftKey && e.ctrlKey && e.altKey && (e.code === 'Semicolon' || e.key === ';' || e.key === ':')) {
        const active = document.activeElement as HTMLInputElement;
        if (!active || active.tagName !== 'INPUT') return;

        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        const bookingId = active.getAttribute('data-booking-id');
        const field = active.getAttribute('data-field') as keyof Booking;

        if (bookingId && field) {
          e.preventDefault();
          updateBooking(bookingId, { [field]: timeStr });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bookings]);

  const addBooking = async () => {
    const path = "roomBookings";
    const defaultRoom = settings.rooms[0] || { id: 'unknown', name: 'New Room' };
    try {
      await addDoc(collection(db, path), {
        customer: '',
        room: defaultRoom.name,
        visitors: 10,
        checkIn: '09:00',
        checkOut: '10:00',
        comment: '',
        price: 0,
        bookingDate: dateString,
        borderColor: '#3b82f6',
        roomType: defaultRoom.id,
        phone: '',
        roomName: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (e) { handleFirestoreError(e, OperationType.CREATE, path); }
  };

  const updateBooking = async (id: string, updates: Partial<Booking>) => {
    const path = `roomBookings/${id}`;
    const booking = bookings.find(b => b.id === id);
    if (!booking) return;

    let finalUpdates = { ...updates };

    // Auto-calculate price if schedule or room type changes
    if (
      updates.checkIn !== undefined || 
      updates.checkOut !== undefined || 
      updates.roomType !== undefined || 
      updates.bookingDate !== undefined
    ) {
      const tempBooking = { ...booking, ...updates };
      finalUpdates.price = Math.round(calculateRoomPrice(tempBooking));
    }

    // Track for undo/redo
    const before: any = {};
    const after: any = {};
    
    Object.keys(finalUpdates).forEach((key) => {
      const k = key as keyof Booking;
      before[k] = (booking as any)[k];
      after[k] = (finalUpdates as any)[k];
    });

    pushAction({
      collectionPath: 'roomBookings',
      docId: id,
      before,
      after
    });

    try {
      await updateDoc(doc(db, "roomBookings", id), {
        ...finalUpdates,
        updatedAt: serverTimestamp()
      });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, path); }
  };

  const filteredBookings = bookings.filter(b => 
    (b.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.customer || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-[1440px] mx-auto px-12 py-12 flex flex-col gap-12">
      <header className="flex justify-between items-end">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-white uppercase tracking-tighter">Room Reservations</h1>
          <p className="text-on-surface-variant font-display text-sm tracking-widest flex items-center gap-2">
            <Calendar size={14} />
            {dateString.replace(/-/g, '/')} - SCHEDULE VERIFICATION
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-white transition-colors" />
            <input 
              ref={searchInputRef}
              type="text"
              placeholder="Search phone or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none focus:border-primary/50 focus:bg-white/10 transition-all w-64"
            />
          </div>
          <button 
            onClick={addBooking}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition-all flex items-center gap-2 group"
          >
            <Plus size={18} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold uppercase tracking-widest">New Reservation</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {filteredBookings.map((booking) => {
          const colorConfig = BORDER_COLORS.find(c => c.value === booking.borderColor) || BORDER_COLORS[0];
          const roomTypeConfig = settings.rooms.find(r => r.id === booking.roomType);
          
          const cardStyle = roomTypeConfig?.accentColor ? {
            backgroundColor: `${roomTypeConfig.accentColor}12`, // ~7% opacity
            borderColor: `${roomTypeConfig.accentColor}33`,     // ~20% opacity
          } : {};

          return (
            <div 
              key={booking.id} 
              style={cardStyle}
              className={`${!roomTypeConfig?.accentColor ? (roomTypeConfig?.color || 'bg-surface-container/30') : ''} backdrop-blur-md border ${!roomTypeConfig?.accentColor ? (roomTypeConfig?.border || 'border-white/10') : ''} rounded-[2rem] flex flex-col group relative overflow-hidden shadow-2xl transition-all hover:border-white/20 hover:translate-y-[-4px]`}
            >
               {/* Top Bar Highlight */}
               <div 
                 className={`absolute top-0 left-0 w-full h-1.5 transition-all duration-500 ${colorConfig.glow}`}
                 style={{ backgroundColor: booking.borderColor || '#3b82f6' }}
               ></div>
               
               <div className="p-8 flex flex-col gap-8">
                  {/* Room Header & Status */}
                  <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                      <div className="flex flex-col gap-1 w-full">
                        <input 
                          className="bg-transparent border-none text-white font-display text-xl font-bold uppercase tracking-tight outline-none w-full placeholder:text-white/20"
                          value={booking.roomName ?? roomTypeConfig?.name ?? ''}
                          placeholder={roomTypeConfig?.name || 'Unknown Room'}
                          onChange={(e) => updateBooking(booking.id, { roomName: e.target.value })}
                        />
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Sector active</p>
                      </div>
                      <div className={`px-4 py-1 rounded-full text-[10px] font-black tracking-widest text-black bg-white shrink-0`}>
                        {roomTypeConfig?.label.toUpperCase() || 'UNKNOWN'}
                      </div>
                  </div>

                  <div className="flex flex-col gap-8">
                    {/* Identity & Contact Info */}
                    <div className="grid grid-cols-1 gap-6">
                      <div className="flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Customer / Organization</span>
                        <input 
                          className="bg-transparent border-b border-white/10 focus:border-white text-white font-display text-2xl outline-none transition-colors w-full py-2 placeholder:text-zinc-800"
                          type="text"
                          value={booking.customer}
                          placeholder="Enter name..."
                          onChange={(e) => updateBooking(booking.id, { customer: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Phone Number</span>
                        <input 
                          className="bg-transparent border-b border-white/10 focus:border-white text-white font-display text-2xl outline-none transition-colors w-full py-2 placeholder:text-zinc-800"
                          type="tel"
                          value={booking.phone || ''}
                          placeholder="01..."
                          onChange={(e) => updateBooking(booking.id, { phone: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Schedule Details */}
                    <div className="flex flex-col gap-4">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Schedule Details</span>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2 hover:bg-white/10 transition-colors w-full">
                           <Calendar size={18} className="text-zinc-500" />
                           <input 
                             type="date"
                             className="bg-transparent text-sm text-white outline-none focus:text-primary [color-scheme:dark] cursor-pointer font-medium w-full"
                             value={booking.bookingDate || dateString}
                             onChange={(e) => updateBooking(booking.id, { bookingDate: e.target.value })}
                           />
                        </div>

                        <div className="flex items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                const now = new Date();
                                const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                                updateBooking(booking.id, { checkIn: timeStr });
                              }}
                              className="text-zinc-500 hover:text-white transition-colors"
                              title="Set current check-in time"
                            >
                              <Clock size={16} />
                            </button>
                            <input 
                              type="time" 
                              className="bg-transparent border-none text-lg font-display font-bold outline-none [color-scheme:dark] w-20 cursor-pointer"
                              data-booking-id={booking.id}
                              data-field="checkIn"
                              value={booking.checkIn}
                              onChange={(e) => updateBooking(booking.id, { checkIn: e.target.value })}
                            />
                          </div>
                          <span className="text-zinc-700 font-black text-[10px]">→</span>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                const now = new Date();
                                const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                                updateBooking(booking.id, { checkOut: timeStr });
                              }}
                              className="text-zinc-500 hover:text-white transition-colors"
                              title="Set current check-out time"
                            >
                              <Clock size={16} />
                            </button>
                            <input 
                              type="time" 
                              className="bg-transparent border-none text-lg font-display font-bold outline-none [color-scheme:dark] w-20 cursor-pointer"
                              data-booking-id={booking.id}
                              data-field="checkOut"
                              value={booking.checkOut}
                              onChange={(e) => updateBooking(booking.id, { checkOut: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Room Type & Theme Pickers */}
                    <div className="grid grid-cols-1 gap-6 border-t border-white/5 pt-6">
                      <div className="flex flex-col gap-3 relative">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Room Type Selection</span>
                        
                        <RoomTypeSelector 
                          booking={booking} 
                          rooms={settings.rooms} 
                          onSelect={(typeId) => updateBooking(booking.id, { roomType: typeId })}
                        />
                      </div>

                      <div className="flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Identity Theme</span>
                        <div className="flex flex-wrap gap-2">
                          {BORDER_COLORS.map((c) => (
                            <button
                              key={c.value}
                              onClick={() => updateBooking(booking.id, { borderColor: c.value })}
                              className={`w-8 h-8 rounded-full transition-all hover:scale-110 border-2 ${booking.borderColor === c.value ? 'border-white scale-110 shadow-lg' : 'border-white/10 hover:border-white/30'}`}
                              style={{ backgroundColor: c.value }}
                              title={c.name}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Comments */}
                    <div className="flex flex-col gap-3 border-t border-white/5 pt-6">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={14} className="text-zinc-600" />
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Notes</span>
                      </div>
                      <textarea 
                        className="bg-zinc-900/30 border border-white/5 rounded-xl p-4 text-xs text-zinc-300 focus:text-white focus:border-white/20 outline-none w-full min-h-[80px] resize-none transition-all"
                        placeholder="Special requests..."
                        value={booking.comment}
                        onChange={(e) => updateBooking(booking.id, { comment: e.target.value })}
                      />
                    </div>

                    {/* Price and Actions */}
                    <div className="flex flex-col gap-6 border-t border-white/5 pt-6">
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Valuation</span>
                          <div className="flex items-center gap-4">
                            <div className="text-white font-mono font-bold bg-white/5 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-2 group-hover:bg-white/10 transition-colors focus-within:border-white/30 h-12">
                               <input 
                                  type="number"
                                  className="bg-transparent w-24 text-right outline-none text-xl"
                                  value={booking.price}
                                  onChange={(e) => updateBooking(booking.id, { price: parseFloat(e.target.value) || 0 })}
                               />
                               <span className="text-[10px] text-zinc-500 font-sans uppercase">EGP</span>
                            </div>
                            <button 
                              onClick={async () => {
                                try {
                                  const bookingData = bookings.find(b => b.id === booking.id);
                                  if (bookingData) {
                                    pushDeletion("roomBookings", booking.id, bookingData, bookingData.customer || 'Untitled room booking');
                                  }
                                  await deleteDoc(doc(db, "roomBookings", booking.id));
                                } catch (e) {
                                  handleFirestoreError(e, OperationType.DELETE, `roomBookings/${booking.id}`);
                                }
                              }}
                              className="p-3 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                            >
                              <MinusCircle size={20} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
               </div>
            </div>
          );
        })}

        {filteredBookings.length === 0 && (
          <div className="p-32 border-2 border-white/5 border-dashed rounded-[2.5rem] text-center flex flex-col items-center gap-6">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-zinc-600">
              <Calendar size={40} />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-white font-display text-lg">No Active Reservations</p>
              <p className="text-zinc-600 font-display text-xs uppercase tracking-[0.2em]">Ready for initialization</p>
            </div>
            <button 
              onClick={addBooking}
              className="mt-4 px-8 py-4 bg-white text-zinc-950 font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all"
            >
              Initialize First Slot
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface RoomTypeSelectorProps {
  booking: Booking;
  rooms: any[];
  onSelect: (typeId: string) => void;
}

const RoomTypeSelector: React.FC<RoomTypeSelectorProps> = ({ booking, rooms, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedRoom = rooms.find(r => r.id === booking.roomType) || rooms[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={selectedRoom?.accentColor ? { 
          backgroundColor: `${selectedRoom.accentColor}1A`, 
          borderColor: isOpen ? '#ffffff' : `${selectedRoom.accentColor}33` 
        } : {}}
        className={`w-full h-14 px-6 rounded-2xl flex items-center justify-between transition-all border-2 group
          ${!selectedRoom?.accentColor ? (selectedRoom?.color || 'bg-white/5') : ''} 
          ${isOpen && !selectedRoom?.accentColor ? 'border-white ring-4 ring-white/10' : (!selectedRoom?.accentColor ? 'border-white/10 hover:border-white/20' : '')}
          ${isOpen && selectedRoom?.accentColor ? 'ring-4 ring-white/10' : ''}`}
      >
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
             <span className="font-display font-black text-sm text-white">{selectedRoom?.label?.toUpperCase().slice(0, 2)}</span>
          </div>
          <div className="flex flex-col items-start translate-y-[1px]">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] leading-none mb-1">Active Sector</span>
            <span className="text-sm font-bold text-white uppercase tracking-wider">{selectedRoom?.name || 'Unassigned'}</span>
          </div>
        </div>
        <ChevronDown 
          size={18} 
          className={`text-zinc-500 transition-transform duration-500 ${isOpen ? 'rotate-180 text-white' : 'group-hover:text-white'}`} 
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="absolute left-0 right-0 top-16 z-50 bg-zinc-900/95 backdrop-blur-2xl border border-white/20 rounded-[2rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden p-2"
            >
              <div className="flex flex-col gap-1">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => {
                      onSelect(room.id);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between px-6 py-4 rounded-2xl transition-all group
                      ${booking.roomType === room.id 
                        ? 'bg-white/10' 
                        : 'hover:bg-white/5 opacity-60 hover:opacity-100'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        style={room.accentColor ? { backgroundColor: `${room.accentColor}33`, borderColor: `${room.accentColor}66` } : {}}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-black text-xs border ${!room.accentColor ? 'border-white/10' : ''} ${!room.accentColor ? room.color : ''} text-white`}
                      >
                        {room.label.toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">{room.label}</span>
                        <span className="text-sm font-bold text-white uppercase">{room.name}</span>
                      </div>
                    </div>
                    {booking.roomType === room.id && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-6 h-6 bg-white rounded-full flex items-center justify-center"
                      >
                        <Check size={12} className="text-black font-bold" />
                      </motion.div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
