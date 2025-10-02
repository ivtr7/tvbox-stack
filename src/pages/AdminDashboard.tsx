import React, { useState, useEffect } from 'react';
import { Monitor, Plus, Upload, Trash2, Power, PowerOff } from 'lucide-react';
import axios from 'axios';

interface Device {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'blocked';
  created_at: string;
}

interface Content {
  id: string;
  device_id: string;
  file_url: string;
  file_type: 'image' | 'video';
  duration: number;
  display_order: number;
}

function AdminDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [deviceContent, setDeviceContent] = useState<Content[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [pairingLink, setPairingLink] = useState('');
  const [showPairingModal, setPairingLinkModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const API_BASE = 'http://localhost:3001/api';

  useEffect(() => {
    fetchDevices();
    setupWebSocket();
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_BASE}/devices`);
      setDevices(response.data.devices || []);
    } catch (error) {
      console.error('Erro ao buscar dispositivos:', error);
    }
  };

  const setupWebSocket = () => {
    const ws = new WebSocket('ws://localhost:3001');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'DEVICE_REGISTERED') {
        fetchDevices();
      } else if (data.type === 'DEVICE_STATUS_UPDATE') {
        setDevices(prev => prev.map(device => 
          device.id === data.deviceId 
            ? { ...device, status: data.status }
            : device
        ));
      }
    };

    return () => ws.close();
  };

  const generatePairingLink = async () => {
    try {
      setIsLoading(true);
      const response = await axios.post(`${API_BASE}/generate-pairing-token`);
      const link = `http://localhost:5173/cadastrar/${response.data.token}`;
      setPairingLink(link);
      setPairingLinkModal(true);
    } catch (error) {
      console.error('Erro ao gerar link:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openDeviceModal = async (device: Device) => {
    setSelectedDevice(device);
    try {
      const response = await axios.get(`${API_BASE}/devices/${device.id}/content`);
      setDeviceContent(response.data.content || []);
      setShowModal(true);
    } catch (error) {
      console.error('Erro ao buscar conteúdo:', error);
      setShowModal(true);
    }
  };

  const toggleDeviceBlock = async (device: Device) => {
    try {
      await axios.post(`${API_BASE}/devices/${device.id}/toggle-block`);
      // WebSocket will update the status
    } catch (error) {
      console.error('Erro ao alterar bloqueio:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedDevice) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('duration', '10'); // Default 10 seconds
    formData.append('device_id', selectedDevice.id);

    try {
      setIsLoading(true);
      await axios.post(`${API_BASE}/devices/${selectedDevice.id}/content`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Refresh content
      const response = await axios.get(`${API_BASE}/devices/${selectedDevice.id}/content`);
      setDeviceContent(response.data.content || []);
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteContent = async (contentId: string) => {
    try {
      await axios.delete(`${API_BASE}/content/${contentId}`);
      setDeviceContent(prev => prev.filter(c => c.id !== contentId));
    } catch (error) {
      console.error('Erro ao deletar conteúdo:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Monitor className="h-8 w-8 text-blue-600" />
              <h1 className="ml-3 text-2xl font-bold text-gray-900">
                DigitalSignage-Lite
              </h1>
            </div>
            <button
              onClick={generatePairingLink}
              disabled={isLoading}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Plus className="h-4 w-4 mr-2" />
              Gerar Link de Cadastro
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Dispositivos Conectados ({devices.length})
          </h2>
        </div>

        {/* Devices Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {devices.map((device) => (
            <div
              key={device.id}
              className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => openDeviceModal(device)}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Monitor className="h-6 w-6 text-gray-600" />
                  <span className="ml-2 font-medium text-gray-900">
                    {device.name}
                  </span>
                </div>
                <div className={`w-3 h-3 rounded-full ${
                  device.status === 'online' ? 'bg-green-500' : 
                  device.status === 'blocked' ? 'bg-red-500' : 'bg-gray-500'
                }`}></div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className={`text-sm px-2 py-1 rounded-full ${
                  device.status === 'online' 
                    ? 'bg-green-100 text-green-800' 
                    : device.status === 'blocked'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {device.status === 'online' ? 'Online' : 
                   device.status === 'blocked' ? 'Bloqueado' : 'Offline'}
                </span>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDeviceBlock(device);
                  }}
                  className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                  title="Bloquear/Desbloquear"
                >
                  {device.status === 'blocked' ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {devices.length === 0 && (
          <div className="text-center py-12">
            <Monitor className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum dispositivo conectado
            </h3>
            <p className="text-gray-500 mb-4">
              Gere um link de cadastro para conectar sua primeira TV Box
            </p>
          </div>
        )}
      </main>

      {/* Pairing Link Modal */}
      {showPairingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Link de Cadastro Gerado</h3>
            <div className="bg-gray-100 p-3 rounded-lg mb-4">
              <code className="text-sm break-all">{pairingLink}</code>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Acesse este link na TV Box para cadastrá-la no sistema.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => navigator.clipboard.writeText(pairingLink)}
                className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Copiar Link
              </button>
              <button
                onClick={() => setPairingLinkModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device Content Modal */}
      {showModal && selectedDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">
                Gerenciar Conteúdo - {selectedDevice.name}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {/* Upload Section */}
            <div className="mb-6 p-4 border-2 border-dashed border-gray-300 rounded-lg">
              <div className="text-center">
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <label className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">
                    Clique para fazer upload
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isLoading}
                  />
                </label>
                <p className="text-sm text-gray-500 mt-1">
                  Imagens e vídeos (máx. 100MB)
                </p>
              </div>
            </div>

            {/* Content List */}
            <div className="space-y-4">
              {deviceContent.map((content) => (
                <div
                  key={content.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                      {content.file_type === 'image' ? '🖼️' : '🎥'}
                    </div>
                    <div>
                      <p className="font-medium">{content.file_url.split('/').pop()}</p>
                      <p className="text-sm text-gray-500">
                        {content.file_type} • {content.duration}s
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteContent(content.id)}
                    className="p-2 text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {deviceContent.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Nenhum conteúdo adicionado ainda
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;