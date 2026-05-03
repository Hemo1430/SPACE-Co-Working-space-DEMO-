
import { format } from 'date-fns';

export interface MockData {
  summary: {
    notes: string;
    instapay: number;
    cash: number;
    subsManual: number;
    roomsManual: number;
    otherItems: { label: string; amount: number }[];
  };
  checkins: any[];
  kitchenSales: any[];
  roomBookings: any[];
  subscriptions: any[];
  customers: any[];
  products: any[];
}

export const DEMO_DATE = '2026-05-02';

export const mockData: MockData = {
  summary: {
    notes: 'Demo Version - May 2nd Shift Summary',
    instapay: 450,
    cash: 1250,
    subsManual: 0,
    roomsManual: 0,
    otherItems: [
      { label: 'Air Conditioner Repair', amount: 350 },
      { label: 'Office Supplies', amount: 120 }
    ]
  },
  checkins: [
    { id: 'c1', customerId: 'cust1', customerName: 'Ahmed Ali', checkIn: '10:00', checkOut: '14:00', status: 'checked-out', room: 'Private Room' },
    { id: 'c2', customerId: 'cust2', customerName: 'Sara Kamel', checkIn: '11:30', checkOut: '13:00', status: 'checked-out', room: 'Atrium Room' },
    { id: 'c3', customerId: 'cust3', customerName: 'Mona Zaki', checkIn: '12:00', checkOut: '18:00', status: 'checked-out', room: 'Roof Garden' },
    { id: 'c4', customerId: 'cust4', customerName: 'Youssef Omar', checkIn: '14:00', checkOut: '--:--', status: 'active', room: 'Standard' },
    { id: 'c5', customerId: 'cust5', customerName: 'Nour El-Din', checkIn: '15:30', checkOut: '--:--', status: 'active', room: 'Executive Room' }
  ],
  kitchenSales: [
    { id: 'k1', productId: 'p1', productName: 'Cappuccino', price: 35, quantity: 1, customerId: 'cust1', customerName: 'Ahmed Ali' },
    { id: 'k2', productId: 'p2', productName: 'Latte', price: 40, quantity: 1, customerId: 'cust2', customerName: 'Sara Kamel' },
    { id: 'k3', productId: 'p3', productName: 'Turkey Sandwich', price: 65, quantity: 1, customerId: 'cust3', customerName: 'Mona Zaki' },
    { id: 'k4', productId: 'p4', productName: 'Water 500ml', price: 15, quantity: 2, customerId: 'cust4', customerName: 'Youssef Omar' },
    { id: 'k5', productId: 'p5', productName: 'Cold Brew', price: 55, quantity: 1, freeDrink: true, customerId: 'cust5', customerName: 'Nour El-Din' }
  ],
  roomBookings: [
    { id: 'r1', roomName: 'Executive Room', bookingDate: DEMO_DATE, startTime: '10:00', endTime: '12:00', price: 160, customerName: 'Tech Solutions Ltd', phone: '01000000000', customer: 'Tech Solutions Ltd' },
    { id: 'r2', roomName: 'Atrium Room', bookingDate: DEMO_DATE, startTime: '14:00', endTime: '17:00', price: 135, customerName: 'Creative Team', phone: '01111111111', customer: 'Creative Team' }
  ],
  subscriptions: [
    { id: 's1', customerId: 'cust6', customerName: 'Omar Khaled', type: '18 Days Plan', start: DEMO_DATE, status: 'active' }
  ],
  customers: [
    { id: 'cust1', customId: 'A001', name: 'Ahmed Ali', createdAt: new Date(2026, 4, 2), phone: '01012345678' },
    { id: 'cust2', customId: 'A002', name: 'Sara Kamel', createdAt: new Date(2026, 4, 2), phone: '01211223344' },
    { id: 'cust3', customId: 'A003', name: 'Mona Zaki', createdAt: new Date(2026, 4, 2), phone: '01500000000' },
    { id: 'cust4', customId: 'A004', name: 'Youssef Omar', createdAt: new Date(2026, 4, 2), phone: '01099999999' },
    { id: 'cust5', customId: 'A005', name: 'Nour El-Din', createdAt: new Date(2026, 4, 2), phone: '01288888888' },
    { id: 'cust6', customId: 'A006', name: 'Omar Khaled', createdAt: new Date(2026, 4, 2), phone: '01177777777' }
  ],
  products: [
    { id: 'p1', name: 'Cappuccino', sku: 'COF-001', price: 35, freeDrinkEligible: true },
    { id: 'p2', name: 'Latte', sku: 'COF-002', price: 40, freeDrinkEligible: true },
    { id: 'p3', name: 'Turkey Sandwich', sku: 'FOD-001', price: 65, freeDrinkEligible: false },
    { id: 'p4', name: 'Water 500ml', sku: 'DRK-001', price: 15, freeDrinkEligible: false },
    { id: 'p5', name: 'Cold Brew', sku: 'COF-003', price: 55, freeDrinkEligible: true }
  ]
};
