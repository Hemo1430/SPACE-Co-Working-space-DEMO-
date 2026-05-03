/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CheckIn } from './screens/CheckIn';
import { Kitchen } from './screens/Kitchen';
import { Subs } from './screens/Subs';
import { Rooms } from './screens/Rooms';
import { Income } from './screens/Income';
import { Customers } from './screens/Customers';
import { Settings } from './screens/Settings';
import { MonthlyReview } from './screens/MonthlyReview';
import { DateProvider } from './context/DateContext';
import { HistoryProvider } from './context/HistoryContext';

export default function App() {
  return (
    <Router>
      <DateProvider>
        <HistoryProvider>
          <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/check-in" replace />} />
            <Route path="/check-in" element={<CheckIn />} />
            <Route path="/kitchen" element={<Kitchen />} />
            <Route path="/subs" element={<Subs />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/income" element={<Income />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/mon-review" element={<MonthlyReview />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
        </HistoryProvider>
      </DateProvider>
    </Router>
  );
}
