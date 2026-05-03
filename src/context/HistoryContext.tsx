import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { doc, updateDoc, setDoc, serverTimestamp } from '../lib/firestoreDemo';
import { db } from '../lib/firebase';

interface HistoryAction {
  collectionPath: string;
  docId: string;
  before: any;
  after: any;
  timestamp: number;
}

interface DeletedItem {
  id: string;
  collectionPath: string;
  data: any;
  timestamp: number;
  label: string;
}

interface HistoryContextType {
  pushAction: (action: Omit<HistoryAction, 'timestamp'>) => void;
  pushDeletion: (collectionPath: string, id: string, data: any, label: string) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  restore: (item: DeletedItem) => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  deletedItems: DeletedItem[];
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export const HistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [undoStack, setUndoStack] = useState<HistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryAction[]>([]);
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);

  // Cleanup old deleted items every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setDeletedItems(prev => prev.filter(item => now - item.timestamp < 30 * 60 * 1000));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const pushAction = useCallback((action: Omit<HistoryAction, 'timestamp'>) => {
    setUndoStack(prev => [...prev, { ...action, timestamp: Date.now() }]);
    setRedoStack([]);
  }, []);

  const pushDeletion = useCallback((collectionPath: string, id: string, data: any, label: string) => {
    setDeletedItems(prev => [
      { id, collectionPath, data, label, timestamp: Date.now() },
      ...prev
    ].slice(0, 50)); // Keep last 50
  }, []);

  const restore = useCallback(async (item: DeletedItem) => {
    try {
      await setDoc(doc(db, item.collectionPath, item.id), {
        ...item.data,
        updatedAt: serverTimestamp()
      });
      setDeletedItems(prev => prev.filter(i => i.id !== item.id));
    } catch (error) {
      console.error('Failed to restore:', error);
    }
  }, []);

  const undo = useCallback(async () => {
    if (undoStack.length === 0) return;

    const action = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);

    try {
      await updateDoc(doc(db, action.collectionPath, action.docId), {
        ...action.before,
        updatedAt: serverTimestamp()
      });
      setUndoStack(newUndoStack);
      setRedoStack(prev => [...prev, action]);
    } catch (error) {
      console.error('Failed to undo:', error);
    }
  }, [undoStack]);

  const redo = useCallback(async () => {
    if (redoStack.length === 0) return;

    const action = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);

    try {
      await updateDoc(doc(db, action.collectionPath, action.docId), {
        ...action.after,
        updatedAt: serverTimestamp()
      });
      setRedoStack(newRedoStack);
      setUndoStack(prev => [...prev, action]);
    } catch (error) {
      console.error('Failed to redo:', error);
    }
  }, [redoStack]);

  return (
    <HistoryContext.Provider value={{ 
      pushAction, 
      pushDeletion,
      undo, 
      redo, 
      restore,
      canUndo: undoStack.length > 0, 
      canRedo: redoStack.length > 0,
      deletedItems
    }}>
      {children}
    </HistoryContext.Provider>
  );
};

export const useHistory = () => {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
};
