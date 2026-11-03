import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Register from './pages/Register';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import Room from './pages/Room';
import Profile from './pages/Profile';
import Privacy from './pages/Privacy';
import ErrorBoundary from './components/ErrorBoundary';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();
  // Muistetaan minne oltiin menossa (esim. kaverin jakama huonelinkki)
  return token ? <>{children}</> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/lobby"
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
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;