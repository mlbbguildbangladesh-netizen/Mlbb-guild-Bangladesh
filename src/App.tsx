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
const Database = lazy(() => import('./pages/Database'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Teams = lazy(() => import('./pages/Teams'));
const Registration = lazy(() => import('./pages/Registration'));
const Shop = lazy(() => import('./pages/Shop'));
const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));
const Challenges = lazy(() => import('./pages/Challenges'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Results = lazy(() => import('./pages/Results'));
const Profile = lazy(() => import('./pages/Profile'));
const SoloPlayers = lazy(() => import('./pages/SoloPlayers'));
const TrainingGround = lazy(() => import('./pages/TrainingGround'));
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
      <Toaster position="bottom-right" reverseOrder={false} toastOptions={{
        className: '',
        style: {
          background: 'rgba(26, 29, 35, 0.95)',
          backdropFilter: 'blur(10px)',
          color: '#e2e8f0', // slate-200
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '14px',
          fontWeight: '500',
          letterSpacing: '0.01em',
          borderRadius: '12px',
          padding: '14px 20px',
          boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
        },
        success: {
          iconTheme: {
            primary: '#10b981', // emerald-500
            secondary: '#fff',
          },
          style: {
            borderLeft: '4px solid #10b981',
          }
        },
        error: {
          iconTheme: {
            primary: '#ef4444', // red-500
            secondary: '#fff',
          },
          style: {
            borderLeft: '4px solid #ef4444',
          }
        },
        loading: {
          style: {
            borderLeft: '4px solid #3b82f6', // blue-500
          }
        }
      }} />
      <Router>
        <Layout>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/database" element={<Database />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/results" element={<Results />} />
              <Route path="/teams" element={
                <ProtectedRoute adminOnly>
                  <Teams />
                </ProtectedRoute>
              } />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/registration" element={<Registration />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/solo-players" element={<SoloPlayers />} />
              <Route path="/training" element={<TrainingGround />} />
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
