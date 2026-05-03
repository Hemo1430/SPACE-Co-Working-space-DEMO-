
import { mockData, DEMO_DATE } from './demoData';

// --- LocalStorage Engine ---

const STORAGE_KEY = 'space_terminal_data';

interface Store {
  [path: string]: any;
}

const getStore = (): Store => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  
  // Seed initial data
  const initialStore: Store = {
    [`days/${DEMO_DATE}`]: mockData.summary,
    [`days/${DEMO_DATE}/checkins`]: mockData.checkins.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {}),
    [`days/${DEMO_DATE}/kitchenSales`]: mockData.kitchenSales.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {}),
    'roomBookings': mockData.roomBookings.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {}),
    'subscriptions': mockData.subscriptions.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {}),
    'customers': mockData.customers.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {}),
    'products': mockData.products.reduce((acc, curr) => ({ ...acc, [curr.id]: curr }), {}),
    'settings/global': {
      hourPrices: { standard: 12, lateNight: 15 },
      rooms: [
        { id: 'room-p', name: 'Private Room', label: 'Private', hourly: 25, color: 'bg-blue-500/10', border: 'border-blue-500/20', accentColor: '#3b82f6' },
        { id: 'room-a', name: 'Atrium Room', label: 'Atrium', hourly: 45, color: 'bg-emerald-500/10', border: 'border-emerald-500/20', accentColor: '#10b981' },
        { id: 'room-e', name: 'Executive Room', label: 'Executive', hourly: 80, color: 'bg-purple-500/10', border: 'border-purple-500/20', accentColor: '#a855f7' },
        { id: 'room-s', name: 'Roof Garden', label: 'Roof', hourly: 40, color: 'bg-orange-500/10', border: 'border-orange-500/20', accentColor: '#f97316' }
      ],
      subscriptions: [
        { name: '9 Days Plan', price: 95, visits: 0 },
        { name: '18 Days Plan', price: 175, visits: 0 },
        { name: '15 Visits Plan', price: 320, visits: 15 }
      ]
    }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialStore));
  return initialStore;
};

const saveStore = (store: Store) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  // Notify all listeners
  window.dispatchEvent(new Event('storage-update'));
};

const listeners: Set<() => void> = new Set();

// --- Firestore Mock Functions ---

export const collection = (db: any, path: string) => ({ path, type: 'collection' });
export const doc = (db: any, path: string, id?: string) => ({ path: id ? `${path}/${id}` : path, type: 'doc' });

export const query = (col: any, ...constraints: any[]) => {
  return { ...col, constraints };
};

export const where = (field: string, op: string, value: any) => ({ type: 'where', field, op, value });
export const orderBy = (field: string, dir: 'asc' | 'desc') => ({ type: 'orderBy', field, dir });
export const serverTimestamp = () => new Date().toISOString();
export const increment = (n: number) => ({ type: 'increment', value: n });

export const onSnapshot = (ref: any, callback: (snap: any) => void, errorCallback?: (error: any) => void) => {
  const handler = () => {
    try {
      const store = getStore();
      const path = ref.path;
      
      if (ref.type === 'doc') {
        const parts = path.split('/');
        const docId = parts.pop();
        const colPath = parts.join('/');
        const col = store[colPath] || {};
        const data = col[docId!] || store[path];
        
        callback({
          exists: () => !!data,
          data: () => data,
        });
      } else {
        let docs: any[] = [];
        const colData = store[path] || {};
        docs = Object.entries(colData).map(([id, data]) => ({ id, ...data as object }));

        // Apply constraints (minimal implementation)
        if (ref.constraints) {
          ref.constraints.forEach((c: any) => {
            if (c.type === 'where') {
              docs = docs.filter(d => {
                if (c.op === '==') return d[c.field] === c.value;
                return true;
              });
            }
            if (c.type === 'orderBy') {
              docs.sort((a, b) => {
                const valA = a[c.field];
                const valB = b[c.field];
                if (valA < valB) return c.dir === 'asc' ? -1 : 1;
                if (valA > valB) return c.dir === 'asc' ? 1 : -1;
                return 0;
              });
            }
          });
        }

        callback({
          docs: docs.map(d => ({
            id: d.id,
            data: () => d
          })),
          size: docs.length,
          empty: docs.length === 0
        });
      }
    } catch (err) {
      if (errorCallback) errorCallback(err);
    }
  };

  window.addEventListener('storage-update', handler);
  handler(); // Initial call

  return () => window.removeEventListener('storage-update', handler);
};

export const getDocs = async (ref: any, errorCallback?: (error: any) => void) => {
  try {
    const store = getStore();
    let docs: any[] = [];
    const colData = store[ref.path] || {};
    docs = Object.entries(colData).map(([id, data]) => ({ id, ...data as object }));

    if (ref.constraints) {
      ref.constraints.forEach((c: any) => {
        if (c.type === 'where') {
          docs = docs.filter(d => d[c.field] === c.value);
        }
      });
    }

    return {
      docs: docs.map(d => ({
        id: d.id,
        data: () => d
      })),
      size: docs.length,
      empty: docs.length === 0,
      forEach: (cb: any) => docs.forEach(d => cb({ id: d.id, data: () => d }))
    };
  } catch (err) {
    if (errorCallback) errorCallback(err);
    throw err;
  }
};

export const getDoc = async (ref: any) => {
  const store = getStore();
  const path = ref.path;
  const parts = path.split('/');
  const docId = parts.pop();
  const colPath = parts.join('/');
  const col = store[colPath] || {};
  const data = col[docId!] || store[path];

  return {
    exists: () => !!data,
    data: () => data
  };
};

export const addDoc = async (colRef: any, data: any) => {
  const store = getStore();
  const id = Math.random().toString(36).substr(2, 9);
  const path = colRef.path;
  
  if (!store[path]) store[path] = {};
  store[path][id] = { ...data, id };
  saveStore(store);
  return { id };
};

export const updateDoc = async (docRef: any, updates: any) => {
  const store = getStore();
  const path = docRef.path;
  const parts = path.split('/');
  const docId = parts.pop();
  const colPath = parts.join('/');

  let currentData = store[colPath]?.[docId!] || store[path] || {};
  
  // Handle increments and nested updates
  const newUpdates = { ...updates };
  Object.keys(newUpdates).forEach(key => {
    if (newUpdates[key]?.type === 'increment') {
      newUpdates[key] = (currentData[key] || 0) + newUpdates[key].value;
    }
  });

  if (store[colPath]) {
    store[colPath][docId!] = { ...currentData, ...newUpdates };
  } else {
    store[path] = { ...currentData, ...newUpdates };
  }

  saveStore(store);
};

export const setDoc = async (docRef: any, data: any, options?: any) => {
  const store = getStore();
  const path = docRef.path;
  const parts = path.split('/');
  const docId = parts.pop();
  const colPath = parts.join('/');

  const existingData = (docId && colPath) ? (store[colPath]?.[docId] || {}) : (store[path] || {});
  const newData = options?.merge ? { ...existingData, ...data } : data;

  if (docId && colPath && store[colPath]) {
    store[colPath][docId] = newData;
  } else {
    store[path] = newData;
  }

  saveStore(store);
};

export const deleteDoc = async (docRef: any) => {
  const store = getStore();
  const path = docRef.path;
  const parts = path.split('/');
  const docId = parts.pop();
  const colPath = parts.join('/');

  if (store[colPath] && store[colPath][docId!]) {
    delete store[colPath][docId!];
  } else if (store[path]) {
    delete store[path];
  }

  saveStore(store);
};
