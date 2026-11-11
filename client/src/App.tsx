import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Header } from './components/Header';
import { Loading } from './components/common';
import { LoginPage } from './pages/LoginPage';
import { LibraryPage } from './pages/LibraryPage';
import { GamePage } from './pages/GamePage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

// UI-02: neprisijungęs mato prisijungimo ekraną, prisijungęs – biblioteką.
function AppRoutes() {
  const { me } = useAuth();

  if (me === undefined) {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  if (me === null) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LibraryPage />} />
      <Route path="/zaidimai/:appId" element={<GamePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
