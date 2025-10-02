import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './config/database.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server
const server = createServer(app);

// WebSocket connections
const deviceConnections = new Map();

// Setup WebSocket
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('Nova conexão WebSocket');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'DEVICE_REGISTER') {
        const { deviceId } = data;
        deviceConnections.set(deviceId, ws);
        
        // Update device status
        await supabase
          .from('devices')
          .update({ status: 'online' })
          .eq('id', deviceId);

        // Broadcast to admin
        broadcastToAdmin({
          type: 'DEVICE_STATUS_UPDATE',
          deviceId,
          status: 'online'
        });

        console.log(`Dispositivo ${deviceId} conectado`);
      }
    } catch (error) {
      console.error('Erro WebSocket:', error);
    }
  });

  ws.on('close', () => {
    // Find and remove disconnected device
    for (const [deviceId, connection] of deviceConnections) {
      if (connection === ws) {
        deviceConnections.delete(deviceId);
        
        // Update device status
        supabase
          .from('devices')
          .update({ status: 'offline' })
          .eq('id', deviceId);

        // Broadcast to admin
        broadcastToAdmin({
          type: 'DEVICE_STATUS_UPDATE',
          deviceId,
          status: 'offline'
        });

        console.log(`Dispositivo ${deviceId} desconectado`);
        break;
      }
    }
  });
});

function broadcastToAdmin(message) {
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function sendToDevice(deviceId, message) {
  const connection = deviceConnections.get(deviceId);
  if (connection && connection.readyState === connection.OPEN) {
    connection.send(JSON.stringify(message));
    return true;
  }
  return false;
}

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// API Routes

// Generate pairing token
app.post('/api/generate-pairing-token', async (req, res) => {
  try {
    const token = uuidv4();
    
    const { error } = await supabase
      .from('pairing_tokens')
      .insert({
        token,
        is_used: false,
        created_at: new Date().toISOString()
      });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ token });
  } catch (error) {
    console.error('Erro ao gerar token:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Register device
app.post('/api/register-device', async (req, res) => {
  try {
    const { token, deviceName } = req.body;

    if (!token || !deviceName) {
      return res.status(400).json({ error: 'Token e nome do dispositivo são obrigatórios' });
    }

    // Verify token
    const { data: tokenData, error: tokenError } = await supabase
      .from('pairing_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_used', false)
      .single();

    if (tokenError || !tokenData) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    // Create device
    const deviceId = uuidv4();
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .insert({
        id: deviceId,
        name: deviceName,
        status: 'offline',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (deviceError) {
      return res.status(400).json({ error: deviceError.message });
    }

    // Mark token as used
    await supabase
      .from('pairing_tokens')
      .update({ is_used: true })
      .eq('token', token);

    // Broadcast new device to admin
    broadcastToAdmin({
      type: 'DEVICE_REGISTERED',
      device
    });

    res.json({ 
      deviceId,
      playerUrl: `http://localhost:3000/player/${deviceId}`
    });
  } catch (error) {
    console.error('Erro ao registrar dispositivo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get all devices
app.get('/api/devices', async (req, res) => {
  try {
    const { data: devices, error } = await supabase
      .from('devices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ devices });
  } catch (error) {
    console.error('Erro ao buscar dispositivos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get device content
app.get('/api/devices/:id/content', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: content, error } = await supabase
      .from('content')
      .select('*')
      .eq('device_id', id)
      .order('display_order', { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ content });
  } catch (error) {
    console.error('Erro ao buscar conteúdo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Upload content to device
app.post('/api/devices/:id/content', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { duration = 10 } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // Get current max order
    const { data: maxOrder } = await supabase
      .from('content')
      .select('display_order')
      .eq('device_id', id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.display_order || 0) + 1;

    // Determine file type
    const fileType = file.mimetype.startsWith('image/') ? 'image' : 'video';

    // Create content record
    const { data: content, error } = await supabase
      .from('content')
      .insert({
        id: uuidv4(),
        device_id: id,
        file_url: `/uploads/${file.filename}`,
        file_type: fileType,
        duration: parseInt(duration),
        display_order: nextOrder
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Notify device of new content
    sendToDevice(id, {
      type: 'CONTENT_UPDATE',
      action: 'refresh'
    });

    res.json({ content });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Delete content
app.delete('/api/content/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get content info first
    const { data: content, error: getError } = await supabase
      .from('content')
      .select('device_id')
      .eq('id', id)
      .single();

    if (getError) {
      return res.status(404).json({ error: 'Conteúdo não encontrado' });
    }

    // Delete content
    const { error } = await supabase
      .from('content')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Notify device
    sendToDevice(content.device_id, {
      type: 'CONTENT_UPDATE',
      action: 'refresh'
    });

    res.json({ message: 'Conteúdo deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar conteúdo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Toggle device block
app.post('/api/devices/:id/toggle-block', async (req, res) => {
  try {
    const { id } = req.params;

    // Get current status
    const { data: device, error: getError } = await supabase
      .from('devices')
      .select('status')
      .eq('id', id)
      .single();

    if (getError) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    const newStatus = device.status === 'blocked' ? 'online' : 'blocked';

    // Update status
    const { error } = await supabase
      .from('devices')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Send block/unblock command to device
    const success = sendToDevice(id, {
      type: newStatus === 'blocked' ? 'BLOCK_DEVICE' : 'UNBLOCK_DEVICE',
      message: newStatus === 'blocked' ? 'Dispositivo bloqueado por falta de pagamento' : null
    });

    // Broadcast status update
    broadcastToAdmin({
      type: 'DEVICE_STATUS_UPDATE',
      deviceId: id,
      status: newStatus
    });

    res.json({ 
      message: `Dispositivo ${newStatus === 'blocked' ? 'bloqueado' : 'desbloqueado'} com sucesso`,
      status: newStatus
    });
  } catch (error) {
    console.error('Erro ao alterar bloqueio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.originalUrl
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 DigitalSignage-Lite Backend rodando na porta ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket server pronto`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});