import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Monitor, Loader2, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';

function DeviceRegistration() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [deviceName, setDeviceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  const API_BASE = 'http://localhost:3001/api';

  useEffect(() => {
    // Validate token on component mount
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      setIsValidToken(false);
      setError('Token não fornecido');
      return;
    }

    try {
      // You can add a token validation endpoint if needed
      setIsValidToken(true);
    } catch (error) {
      setIsValidToken(false);
      setError('Token inválido ou expirado');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deviceName.trim()) {
      setError('Nome do dispositivo é obrigatório');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE}/register-device`, {
        token,
        deviceName: deviceName.trim()
      });

      const { deviceId, playerUrl } = response.data;
      
      // Redirect to player page
      window.location.href = playerUrl;
      
    } catch (error: any) {
      console.error('Erro no cadastro:', error);
      setError(error.response?.data?.error || 'Erro ao cadastrar dispositivo');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Validando token...</p>
        </div>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Token Inválido</h1>
            <p className="text-gray-600 mb-6">
              {error || 'O link de cadastro é inválido ou expirou.'}
            </p>
            <p className="text-sm text-gray-500">
              Solicite um novo link de cadastro ao administrador.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <div className="bg-blue-100 rounded-full p-3 w-16 h-16 mx-auto mb-4">
            <Monitor className="h-10 w-10 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Cadastrar TV Box
          </h1>
          <p className="text-gray-600">
            Digite um nome para identificar este dispositivo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="deviceName" className="block text-sm font-medium text-gray-700 mb-2">
              Nome do Dispositivo
            </label>
            <input
              type="text"
              id="deviceName"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Ex: TV Recepção, Loja Centro, etc."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              disabled={isLoading}
              maxLength={50}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !deviceName.trim()}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Cadastrando...
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5 mr-2" />
                Cadastrar Dispositivo
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Após o cadastro, você será redirecionado para a tela do player
          </p>
        </div>
      </div>
    </div>
  );
}

export default DeviceRegistration;