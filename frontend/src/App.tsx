import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { setMusic } from './constants/music';
import { AuthProvider, useAuth } from './context/AuthContext';
import Register from './pages/Register';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import GameHub from './pages/GameHub';
import Room from './pages/Room';
import Profile from './pages/Profile';
import Privacy from './pages/Privacy';
import ResetPassword from './pages/ResetPassword';
import ErrorBoundary from './components/ErrorBoundary';
import ServerWake from './components/ServerWake';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();
  // Muistetaan minne oltiin menossa (esim. kaverin jakama huonelinkki)
  return token ? <>{children}</> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function AppRoutes() {
  const location = useLocation();
  // Valikoissa soi rauhallinen musiikki; pelihuone vaihtaa itse pelimusiikkiin
  useEffect(() => {
    if (!location.pathname.startsWith('/room/')) setMusic('menu');
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/pelit"
        element={
          <ProtectedRoute>
            <GameHub />
          </ProtectedRoute>
        }
      />
      {/* Vanhat linkit (/lobby) ohjataan KPSL:n aulaan */}
      <Route path="/lobby" element={<Navigate to="/kpsl" replace />} />
      <Route
        path="/kpsl"
        element={
          <ProtectedRoute>
            <Lobby />
          </ProtectedRoute>
        }
      />
      <Route
        path="/room/:roomCode"
        element={
          <ProtectedRoute>
            <Room />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="/tietosuoja" element={<Privacy />} />
      <Route path="/palauta" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <ServerWake />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;