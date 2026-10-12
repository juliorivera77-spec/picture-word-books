import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SettingsProvider } from './lib/settings';
import { AddBook } from './pages/AddBook';
import { CollectionBookPage } from './pages/CollectionBookPage';
import { Library } from './pages/Library';
import { Reader } from './pages/Reader';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <SettingsProvider>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/new" element={<AddBook />} />
          <Route path="/book/:id" element={<Reader />} />
          <Route path="/collection/:id" element={<CollectionBookPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </HashRouter>
    </SettingsProvider>
  );
}

/** Start each screen at the top instead of keeping the previous screen's scroll position. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}
