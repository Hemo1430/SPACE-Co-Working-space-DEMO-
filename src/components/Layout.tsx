import React from 'react';
import { TopNavBar } from './TopNavBar';
import { motion, AnimatePresence } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  const scrollToBottom = () => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth'
    });
  };

  const stars = React.useMemo(() => {
    return Array.from({ length: 50 }).map((_, i) => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: `${Math.random() * 2 + 1}px`,
      duration: `${Math.random() * 3 + 2}s`,
      opacity: Math.random() * 0.5 + 0.2,
      delay: `${Math.random() * 5}s`
    }));
  }, []);

  return (
    <div className="min-h-screen flex flex-col pt-16 relative overflow-hidden">
      {/* Dynamic Starfield */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {stars.map((star, i) => (
          <div
            key={i}
            className="star"
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              '--duration': star.duration,
              '--opacity': star.opacity,
              animationDelay: star.delay
            } as React.CSSProperties}
          />
        ))}
      </div>

      <TopNavBar />
      <main className="flex-grow relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>

        {/* Scroll to bottom button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1, backgroundColor: '#fff' }}
          whileTap={{ scale: 0.9 }}
          onClick={scrollToBottom}
          className="fixed bottom-6 right-6 z-[100] p-4 bg-white text-black rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.5)] ring-1 ring-white/20 transition-transform group"
          title="Scroll to bottom"
        >
          <ChevronDown size={20} strokeWidth={3} className="text-black group-hover:translate-y-0.5 transition-transform" />
        </motion.button>

        {/* Decorative elements */}
        <div className="fixed bottom-0 right-0 p-8 opacity-10 pointer-events-none hidden lg:block">
          <svg fill="none" height="200" viewBox="0 0 200 200" width="200" xmlns="http://www.w3.org/2000/svg">
            <circle cx="200" cy="200" r="199.5" stroke="white" strokeDasharray="2 4"></circle>
            <circle cx="200" cy="200" r="149.5" stroke="white" strokeDasharray="1 6"></circle>
            <circle cx="200" cy="200" r="99.5" stroke="white" strokeDasharray="4 8"></circle>
            <line stroke="white" strokeOpacity="0.1" x1="200" x2="200" y1="0" y2="200"></line>
            <line stroke="white" strokeOpacity="0.1" x1="0" x2="200" y1="200" y2="200"></line>
          </svg>
        </div>
      </main>
      <footer className="py-6 px-8 border-t border-white/5 bg-black/20 text-center relative z-10">
        <p className="text-zinc-500 text-xs font-medium max-w-2xl mx-auto leading-relaxed">
          Note: This is a demo version. All data shown is for demonstration purposes only and is not real. 
          Some features or functions may be limited as this is a demonstration environment.
        </p>
      </footer>
    </div>
  );
};
