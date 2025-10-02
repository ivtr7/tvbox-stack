import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Monitor, Wifi, WifiOff, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface Content {
  id: string;
  file_url: string;
  file_type: 'image' | 'video';
  duration: number;
  display_order: number;
}

function PlayerPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const [content, setContent] = useState<Content[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const API_BASE = 'http://localhost:3001';

  useEffect(() => {
    if (deviceId) {
      fetchContent();
      setupWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [deviceId]);

  useEffect(() => {
    if (content.length > 0 && !isBlocked) {
      startSlideshow();
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [content, currentIndex, isBlocked]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/devices/${deviceId}/content`);
      setContent(response.data.content || []);
    } catch (error) {
      console.error('Erro ao buscar conteúdo:', error);
      setError('Erro ao carregar conteúdo');
    }
  };

  const setupWebSocket = () => {
    const ws = new WebSocket('ws://localhost:3001');
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Register device with WebSocket server
      ws.send(JSON.stringify({
        type: 'DEVICE_REGISTER',
        deviceId
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'CONTENT_UPDATE':
          if (data.action === 'refresh') {
            fetchContent();
          }
          break;
          
        case 'BLOCK_DEVICE':
          setIsBlocked(true);
          setBlockMessage(data.message || 'Dispositivo bloqueado');
          break;
          
        case 'UNBLOCK_DEVICE':
          setIsBlocked(false);
          setBlockMessage('');
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Try to reconnect after 3 seconds
      setTimeout(() => {
        if (deviceId) {
          setupWebSocket();
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };
  };

  const startSlideshow = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (content.length === 0) return;

    const currentContent = content[currentIndex];
    const duration = currentContent.duration * 1000; // Convert to milliseconds

    timerRef.current = setTimeout(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex === content.length - 1 ? 0 : prevIndex + 1
      );
    }, duration);
  };

  const renderContent = () => {
    if (content.length === 0) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-white">
            <Monitor className="h-24 w-24 mx-auto mb-4 opacity-50" />
            <h2 className="text-2xl font-semibold mb-2">Nenhum conteúdo</h2>
            <p className="text-lg opacity-75">Aguardando conteúdo do administrador...</p>
          </div>
        </div>
      );
    }

    const currentContent = content[currentIndex];
    const fullUrl = currentContent.file_url.startsWith('http') 
      ? currentContent.file_url 
      : `${API_BASE}${currentContent.file_url}`;

    if (currentContent.file_type === 'image') {
      return (
        <img
          src={fullUrl}
          alt="Content"
          className="w-full h-full object-cover"
          onError={(e) => {
            console.error('Erro ao carregar imagem:', fullUrl);
            e.currentTarget.style.display = 'none';
          }}
        />
      );
    } else if (currentContent.file_type === 'video') {
      return (
        <video
          src={fullUrl}
          className="w-full h-full object-cover"
          autoPlay
          muted
          onError={(e) => {
            console.error('Erro ao carregar vídeo:', fullUrl);
            e.currentTarget.style.display = 'none';
          }}
        />
      );
    }

    return null;
  };

  if (error) {
    return (
      <div className="h-screen bg-red-600 flex items-center justify-center text-white">
        <div className="text-center">
          <AlertCircle className="h-24 w-24 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2">Erro</h1>
          <p className="text-xl">{error}</p>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="h-screen bg-red-600 flex items-center justify-center text-white">
        <div className="text-center max-w-2xl px-8">
          <AlertCircle className="h-32 w-32 mx-auto mb-8" />
          <h1 className="text-4xl font-bold mb-4">Dispositivo Bloqueado</h1>
          <p className="text-2xl mb-8">
            {blockMessage || 'Este dispositivo foi bloqueado pelo administrador'}
          </p>
          <p className="text-lg opacity-75">
            Entre em contato com o suporte para mais informações
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black relative overflow-hidden">
      {/* Connection Status */}
      <div className="absolute top-4 right-4 z-10">
        <div className={`flex items-center px-3 py-1 rounded-full text-sm ${
          isConnected 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 mr-1" />
              Online
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 mr-1" />
              Offline
            </>
          )}
        </div>
      </div>

      {/* Device Info */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded-lg text-sm">
          ID: {deviceId?.slice(-8)}
        </div>
      </div>

      {/* Content Display */}
      <div className="w-full h-full">
        {renderContent()}
      </div>

      {/* Content Counter */}
      {content.length > 1 && (
        <div className="absolute bottom-4 right-4 z-10">
          <div className="bg-black bg-opacity-50 text-white px-3 py-1 rounded-lg text-sm">
            {currentIndex + 1} / {content.length}
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerPage;