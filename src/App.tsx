/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Toaster } from 'react-hot-toast';
import { Suspense, lazy } from 'react';

// Lazy load pages
const Home = lazy(() => import('./pages/Home'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Teams = lazy(() => import('./pages/Teams'));
const Registration = lazy(() => import('./pages/Registration'));
const Shop = lazy(() => import('./pages/Shop'));
const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));
const Challenges = lazy(() => import('./pages/Challenges'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Profile = lazy(() => import('./pages/Profile'));
const SoloPlayers = lazy(() => import('./pages/SoloPlayers'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));

const LoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 py-20">
    <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin neon-glow-blue" />
    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] animate-pulse">Synchronizing Data...</p>
  </div>
);
const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { user, loading, isAdmin, isModerator } = useAuth();

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 border-4 border-neon-blue border-t-transparent rounded-full animate-spin neon-glow-blue" />
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] animate-pulse">Initializing Terminal...</p>
    </div>
  );

  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !isAdmin && !isModerator) return <Navigate to="/" />;

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" toastOptions={{
        style: {
          background: '#1a1d23',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '12px',
          fontWeight: '900',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          borderRadius: '12px',
        },
        success: {
          iconTheme: {
            primary: '#00E5FF',
            secondary: '#000',
          },
        },
      }} />
      <Router>
        <Layout>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/teams" element={
                <ProtectedRoute adminOnly>
                  <Teams />
                </ProtectedRoute>
              } />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/registration" element={<Registration />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/solo-players" element={<SoloPlayers />} />
              <Route path="/login" element={<Login />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              
              {/* Protected Routes */}
              <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                  <Admin />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </Layout>
      </Router>
    </AuthProvider>
  );
}
