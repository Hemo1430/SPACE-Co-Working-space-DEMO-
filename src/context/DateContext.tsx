import React, { createContext, useContext, useState, useEffect } from 'react';
import { format } from 'date-fns';

interface DateContextType {
  selectedDate: Date;
  dateString: string; // YYYY-MM-DD
  setSelectedDate: (date: Date) => void;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

export const DateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Demo Mode: Lock to May 2nd, 2026
  const demoDate = new Date(2026, 4, 2);
  const [selectedDate] = useState<Date>(demoDate);
  const [dateString] = useState<string>('2026-05-02');

  const setSelectedDate = () => {
    console.log("Date changes are disabled in demo mode.");
  };

  return (
    <DateContext.Provider value={{ selectedDate, dateString, setSelectedDate }}>
      {children}
    </DateContext.Provider>
  );
};

export const useDate = () => {
  const context = useContext(DateContext);
  if (!context) throw new Error('useDate must be used within DateProvider');
  return context;
};
