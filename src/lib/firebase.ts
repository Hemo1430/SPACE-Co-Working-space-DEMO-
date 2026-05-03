/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface HourPrices {
  standard: number;
  lateNight: number;
}

export interface RoomConfig {
  id: string;
  name: string;
  label: string;
  hourly: number;
  color: string;
  border: string;
  accentColor?: string;
}

export interface SubscriptionPlan {
  name: string;
  price: number;
  visits: number;
}

export interface AppSettings {
  hourPrices: HourPrices;
  rooms: RoomConfig[];
  subscriptions: SubscriptionPlan[];
  logoBase64?: string;
}

export function calculateStepPricing(totalMinutes: number, hourlyRate: number, maxPrice: number) {
  if (totalMinutes < 15) return 0;
  
  // Starting with price for exactly 15 mins
  let price = 0.5 * hourlyRate;
  
  if (totalMinutes >= 30) {
    // At 30 mins, price becomes a full hour
    price = 1.0 * hourlyRate;
    
    // Logic for time after the first 30 minutes
    const remaining = totalMinutes - 30;
    
    // Every 60 mins block adds 1.0h price
    const fullCycles = Math.floor(remaining / 60);
    price += fullCycles * hourlyRate;
    
    // Within the current hour cycle, check if we've reached the 45-min mark for the 0.5h increase
    const minsInLastCycle = remaining % 60;
    if (minsInLastCycle >= 45) {
      price += 0.5 * hourlyRate;
    }
  }
  
  return Math.min(price, maxPrice);
}

export const DEFAULT_SETTINGS: AppSettings = {
  hourPrices: {
    standard: 12,
    lateNight: 15
  },
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
};

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: 'local-admin',
      email: 'admin@space.terminal',
    },
    operationType,
    path
  };
  console.error('Local Store Error: ', JSON.stringify(errInfo));
}

// Mock database and auth for local-first execution
export const db = { type: 'local-store' };
export const auth = {
  currentUser: {
    uid: 'local-admin',
    email: 'admin@space.terminal'
  }
};
