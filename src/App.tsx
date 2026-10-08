import { HashRouter, Route, Routes } from 'react-router-dom';
import { SettingsProvider } from './lib/settings';
import { AddBook } from './pages/AddBook';
import { Library } from './pages/Library';
import { Reader } from './pages/Reader';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <SettingsProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/new" element={<AddBook />} />
          <Route path="/book/:id" element={<Reader />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </HashRouter>
    </SettingsProvider>
  );
}
