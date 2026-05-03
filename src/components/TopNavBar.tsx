import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Trash2, Settings as SettingsIcon } from 'lucide-react';
import { useDate } from '../context/DateContext';
import { format, addDays, subDays } from 'date-fns';
import { RecycleBin } from './RecycleBin';
import { doc, onSnapshot } from '../lib/firestoreDemo';
import { db } from '../lib/firebase';

export const TopNavBar: React.FC = () => {
  const { selectedDate, setSelectedDate } = useDate();
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        setLogo(snap.data().logoBase64);
      }
    });
    return () => unsub();
  }, []);

  const handlePrevDay = () => setSelectedDate(subDays(selectedDate, 1));
  const handleNextDay = () => setSelectedDate(addDays(selectedDate, 1));

  return (
    <header className="flex justify-between items-center w-full px-8 h-16 fixed top-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center gap-12">
        <NavLink to="/" className="flex items-center">
          {logo ? (
            <img 
              src={logo} 
              alt="space" 
              className="h-9 w-auto object-contain" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <h1 className="text-2xl font-black tracking-tighter text-white font-display">SPACE</h1>
          )}
        </NavLink>
        <nav className="hidden md:flex gap-8">
          {[
            { name: 'Check-in', path: '/check-in' },
            { name: 'Kitchen', path: '/kitchen' },
            { name: 'Subs', path: '/subs' },
            { name: 'Rooms', path: '/rooms' },
            { name: 'Income', path: '/income' },
            { name: 'Customers', path: '/customers' },
            { name: 'Review', path: '/mon-review' },
          ].map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) =>
                `font-display tracking-tight uppercase text-xs font-semibold transition-colors ${
                  isActive
                    ? 'text-white border-b border-white pb-1'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`
              }
            >
              {link.name}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg border border-white/10 group cursor-default">
          <div className="relative flex items-center gap-2">
            <span className="text-white font-display text-xs font-bold uppercase tracking-widest whitespace-nowrap">
              {format(selectedDate, 'yyyy/MM/dd')}
            </span>
            <Calendar size={14} className="text-primary transition-colors" />
          </div>
        </div>
        <RecycleBin />
        <NavLink to="/settings" className={({ isActive }) => `p-2 rounded-lg transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-white'}`}>
          <Trash2 size={16} className="hidden" /> {/* Hidden placeholder if needed, but we use the icon directly */}
          <SettingsIcon size={16} />
        </NavLink>
      </div>
    </header>
  );
};
