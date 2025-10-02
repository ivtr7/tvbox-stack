import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import DeviceRegistration from './pages/DeviceRegistration';
import PlayerPage from './pages/PlayerPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminDashboard />} />
      <Route path="/cadastrar/:token" element={<DeviceRegistration />} />
      <Route path="/player/:deviceId" element={<PlayerPage />} />
    </Routes>
  );
}

export default App;