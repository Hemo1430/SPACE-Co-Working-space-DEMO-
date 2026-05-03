import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Clock, DoorOpen, IdCard, Save, Trash2, Edit, Plus, Image as ImageIcon } from 'lucide-react';
import { doc, onSnapshot, setDoc } from '../lib/firestoreDemo';
import { db, handleFirestoreError, OperationType, DEFAULT_SETTINGS } from '../lib/firebase';
import { motion } from 'motion/react';

interface HourPrices {
  standard: number;
  lateNight: number;
}

interface RoomConfig {
  id: string;
  name: string;
  label: string;
  hourly: number;
  color: string;
  border: string;
  accentColor?: string;
}

interface SubscriptionPlan {
  name: string;
  price: number;
  visits: number;
}

interface AppSettings {
  hourPrices: HourPrices;
  rooms: RoomConfig[];
  subscriptions: SubscriptionPlan[];
  logoBase64?: string;
}

const defaultSettings = DEFAULT_SETTINGS;

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Handle migration from old roomPrices to new rooms array if needed
        if (data.roomPrices && !data.rooms) {
          const rooms: RoomConfig[] = Object.entries(data.roomPrices).map(([key, val]: [string, any]) => ({
            id: key,
            name: key === 'roomP' ? 'Private Room' : key === 'roomA' ? 'Atrium Room' : key === 'roomE' ? 'Executive Room' : 'Roof Garden',
            label: key === 'roomP' ? 'Private' : key === 'roomA' ? 'Atrium' : key === 'roomE' ? 'Executive' : 'Roof',
            hourly: val.hourly || 0,
            color: 'bg-white/5',
            border: 'border-white/10'
          }));
          setSettings({ ...DEFAULT_SETTINGS, ...data, rooms });
        } else {
          setSettings(prev => ({ ...prev, ...data }));
        }
      }
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/global'));

    return () => unsub();
  }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err) {
      setSaveStatus('idle');
      handleFirestoreError(err, OperationType.WRITE, 'settings/global');
    }
  };

  const updateHourPrice = (key: keyof HourPrices, value: string) => {
    const price = parseFloat(value) || 0;
    setSettings(prev => ({
      ...prev,
      hourPrices: { ...prev.hourPrices, [key]: price }
    }));
  };

  const updateRoom = (index: number, field: keyof RoomConfig, value: any) => {
    setSettings(prev => {
      const newRooms = [...prev.rooms];
      newRooms[index] = { ...newRooms[index], [field]: value };
      return { ...prev, rooms: newRooms };
    });
  };

  const addRoom = () => {
    setSettings(prev => ({
      ...prev,
      rooms: [...prev.rooms, { 
        id: `room-${Date.now()}`, 
        name: 'New Room', 
        label: 'Type', 
        hourly: 0,
        color: 'bg-white/5',
        border: 'border-white/10'
      }]
    }));
  };

  const removeRoom = (index: number) => {
    setSettings(prev => ({
      ...prev,
      rooms: prev.rooms.filter((_, i) => i !== index)
    }));
  };

  const updateSubscription = (index: number, field: keyof SubscriptionPlan, value: string) => {
    const val = (field === 'price' || field === 'visits') ? (parseFloat(value) || 0) : value;
    setSettings(prev => {
      const newSubs = [...prev.subscriptions];
      newSubs[index] = { ...newSubs[index], [field]: val };
      return { ...prev, subscriptions: newSubs };
    });
  };

  const addPlan = () => {
    setSettings(prev => ({
      ...prev,
      subscriptions: [...prev.subscriptions, { name: 'New Plan', price: 0, visits: 0 }]
    }));
  };

  const removePlan = (index: number) => {
    setSettings(prev => ({
      ...prev,
      subscriptions: prev.subscriptions.filter((_, i) => i !== index)
    }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size (Firestore has a 1MB limit for document size)
    if (file.size > 800000) {
      alert("Logo image is too large. Please select an image smaller than 800KB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      // Update local state for immediate feedback
      setSettings(prev => ({ ...prev, logoBase64: base64 }));
      // Save branding immediately to Firestore for better UX
      try {
        await setDoc(doc(db, 'settings', 'global'), { ...settings, logoBase64: base64 });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/global (logo)');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetLogo = async () => {
    setSettings(prev => ({ ...prev, logoBase64: '' }));
    try {
      await setDoc(doc(db, 'settings', 'global'), { ...settings, logoBase64: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/global (logo reset)');
    }
  };

  if (loading) return null;

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-12 pb-32">
      {/* Page Title */}
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-zinc-500 font-sans">Manage space utility rates, room configurations, and member plans.</p>
      </div>

      {/* 0. Branding Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <ImageIcon className="text-white" size={24} />
          <h2 className="font-display text-xl font-bold text-white uppercase tracking-widest">Branding</h2>
        </div>
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-2xl space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-48 h-24 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden">
              {settings.logoBase64 ? (
                <img src={settings.logoBase64} alt="Current logo" className="max-w-full max-h-full object-contain p-2" />
              ) : (
                <div className="flex flex-col items-center gap-1 opacity-20">
                   <ImageIcon size={24} />
                   <span className="text-[8px] font-black uppercase tracking-widest">No Logo</span>
                </div>
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-white font-display font-bold text-base uppercase tracking-tight">Space Identity</h3>
                <p className="text-zinc-500 text-xs font-sans">Set the visual signature of your space. This logo appears in the top navigation bar across all screens.</p>
              </div>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-white uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                  <Plus size={14} />
                  UPLOAD LOGO
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
                {settings.logoBase64 && (
                  <button 
                    onClick={handleResetLogo}
                    className="px-6 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] font-bold text-red-400 uppercase tracking-widest hover:bg-red-500/20 transition-all"
                  >
                    RESET
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1. Hour Prices Section */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <Clock className="text-white" size={24} />
          <h2 className="font-display text-xl font-bold text-white uppercase tracking-widest">Hour Prices</h2>
        </div>
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-2xl space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Standard Hour</label>
              <div className="relative group">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-600 group-hover:text-white transition-colors">EGP</span>
                <input 
                   type="number" 
                   value={settings.hourPrices.standard}
                   onChange={(e) => updateHourPrice('standard', e.target.value)}
                   className="w-full bg-transparent border-b border-white/10 focus:border-white focus:ring-0 text-white pl-12 py-3 transition-colors outline-none font-display font-medium text-lg"
                 />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Max Price</label>
              <div className="relative group">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-600 group-hover:text-white transition-colors">EGP</span>
                <input 
                   type="number" 
                   value={settings.hourPrices.lateNight}
                   onChange={(e) => updateHourPrice('lateNight', e.target.value)}
                   className="w-full bg-transparent border-b border-white/10 focus:border-white focus:ring-0 text-white pl-12 py-3 transition-colors outline-none font-display font-medium text-lg"
                 />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Room Prices Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DoorOpen className="text-white" size={24} />
            <h2 className="font-display text-xl font-bold text-white uppercase tracking-widest">Rooms & Prices</h2>
          </div>
          <button 
            onClick={addRoom}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-white uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            <Plus size={14} />
            ADD ROOM
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settings.rooms.map((room, idx) => (
            <div key={room.id} className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 p-6 rounded-2xl flex flex-col justify-between hover:border-white/20 transition-all group">
               <div className="space-y-6">
                 <div className="flex justify-between items-start gap-4">
                   <div className="flex flex-col gap-1 w-full">
                     <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Room Title</label>
                     <input 
                       className="bg-transparent border-none text-white font-display text-xl font-bold uppercase tracking-tight outline-none w-full placeholder:text-white/20"
                       value={room.name}
                       placeholder="Room Name"
                       onChange={(e) => updateRoom(idx, 'name', e.target.value)}
                     />
                   </div>
                   <button 
                     onClick={() => removeRoom(idx)}
                     className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                   >
                     <Trash2 size={16} />
                   </button>
                 </div>

                 <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-1">
                     <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Type Label</label>
                     <input 
                       type="text" 
                       value={room.label}
                       onChange={(e) => updateRoom(idx, 'label', e.target.value)}
                       placeholder="e.g. PRIVATE"
                       className="w-full bg-transparent border-b border-white/10 focus:border-white focus:ring-0 text-white py-2 text-sm outline-none transition-colors"
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Hourly Rate</label>
                     <div className="relative group">
                       <input 
                         type="number" 
                         value={room.hourly}
                         onChange={(e) => updateRoom(idx, 'hourly', parseFloat(e.target.value) || 0)}
                         className="w-full bg-transparent border-b border-white/10 focus:border-white focus:ring-0 text-white py-2 font-display text-base outline-none transition-colors"
                       />
                       <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600">EGP</span>
                     </div>
                   </div>
                 </div>

                 <div className="space-y-4">
                    <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Room Identity Theme</label>
                    <div className="flex items-center gap-6 bg-white/[0.03] p-4 rounded-xl border border-white/5">
                       <div className="relative group cursor-pointer">
                         <div 
                           className="w-12 h-12 rounded-full border-2 border-white/20 shadow-lg transition-transform group-hover:scale-110"
                           style={{ backgroundColor: room.accentColor || '#3b82f6' }}
                         />
                         <input 
                           type="color" 
                           value={room.accentColor || '#3b82f6'}
                           onChange={(e) => updateRoom(idx, 'accentColor', e.target.value)}
                           className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                         />
                       </div>
                       <div className="flex flex-col gap-1">
                         <span className="text-[10px] font-bold text-white uppercase tracking-wider">Choose Theme Color</span>
                         <span className="text-[8px] text-zinc-500 uppercase font-mono tracking-tighter">{room.accentColor || '#3b82f6'}</span>
                       </div>
                    </div>
                 </div>
               </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Subscriptions Section */}
      <section className="space-y-6 relative group/subs" id="subscriptions-section">
        <div className="absolute -inset-4 bg-white/[0.01] rounded-[2rem] -z-10 opacity-0 group-hover/subs:opacity-100 transition-opacity duration-500"></div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IdCard className="text-white" size={24} />
            <h2 className="font-display text-xl font-bold text-white uppercase tracking-widest">Subscriptions</h2>
          </div>
          <button 
            onClick={addPlan}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-white uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            <Plus size={14} />
            ADD PLAN
          </button>
        </div>
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/5">
                <th className="px-8 py-5 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Validity (Days)</th>
                <th className="px-8 py-5 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Price (EGP)</th>
                <th className="px-8 py-5 text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Visits</th>
                <th className="px-8 py-5 text-right font-bold text-zinc-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {settings.subscriptions.map((plan, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 group-hover:bg-white transition-colors"></div>
                      <input 
                        type="number" 
                        value={plan.name}
                        onChange={(e) => updateSubscription(idx, 'name', e.target.value)}
                        placeholder="30"
                        className="bg-transparent border-b border-transparent focus:border-white focus:ring-0 text-white py-1 w-full text-sm font-medium outline-none transition-all"
                      />
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <input 
                      type="number" 
                      value={plan.price}
                      onChange={(e) => updateSubscription(idx, 'price', e.target.value)}
                      className="bg-transparent border-b border-transparent focus:border-white focus:ring-0 text-white py-1 w-24 text-sm font-display font-medium outline-none transition-all"
                    />
                  </td>
                  <td className="px-8 py-6">
                    <input 
                      type="number" 
                      value={plan.visits}
                      onChange={(e) => updateSubscription(idx, 'visits', e.target.value)}
                      placeholder="0 for days"
                      className="bg-transparent border-b border-transparent focus:border-white focus:ring-0 text-white py-1 w-24 text-sm font-display font-medium outline-none transition-all"
                    />
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button 
                      onClick={() => removePlan(idx)}
                      className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Save Actions */}
        <div className="flex justify-end gap-4 pt-8">
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 rounded-xl border border-white/10 text-zinc-500 font-display text-[10px] font-bold tracking-widest hover:text-white hover:bg-white/5 transition-all"
          >
            DISCARD
          </button>
          <button 
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`px-12 py-3 rounded-xl font-display text-[10px] font-bold tracking-widest transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95 ${
              saveStatus === 'saved' ? 'bg-green-500 text-white' : 'bg-white text-black hover:bg-zinc-200'
            }`}
          >
            {saveStatus === 'saving' ? 'SAVING...' : saveStatus === 'saved' ? 'SAVED!' : (
              <>
                <Save size={14} />
                SAVE CHANGES
              </>
            )}
          </button>
        </div>
      </section>
    </main>
  );
};
