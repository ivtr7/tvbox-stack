import { supabase } from '../config/database.js';

const deviceConnections = new Map();
const adminConnections = new Map();

export const setupWebSocket = (wss) => {
  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'DEVICE_REGISTER':
            await handleDeviceRegister(ws, data);
            break;
          case 'ADMIN_REGISTER':
            await handleAdminRegister(ws, data);
            break;
          case 'HEARTBEAT':
            await handleHeartbeat(ws, data);
            break;
          case 'PLAYBACK_LOG':
            await handlePlaybackLog(data);
            break;
          case 'DEVICE_STATUS':
            await handleDeviceStatus(data);
            break;
          case 'SCREENSHOT_RESULT':
            await handleScreenshotResult(data);
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      // Remove connection from maps
      for (const [key, connection] of deviceConnections) {
        if (connection.ws === ws) {
          deviceConnections.delete(key);
          console.log(`Device ${key} disconnected`);
          break;
        }
      }
      
      for (const [key, connection] of adminConnections) {
        if (connection.ws === ws) {
          adminConnections.delete(key);
          console.log(`Admin ${key} disconnected`);
          break;
        }
      }
    });

    // Send initial ping
    ws.send(JSON.stringify({ type: 'CONNECTED' }));
  });

  // Heartbeat to keep connections alive
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    });
  }, 30000);
};

const handleDeviceRegister = async (ws, data) => {
  try {
    const { deviceId, token } = data;

    // Verify device token/authentication
    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('id', deviceId)
      .single();

    if (error || !device) {
      ws.send(JSON.stringify({ 
        type: 'ERROR', 
        message: 'Device not found' 
      }));
      return;
    }

    // Register device connection
    deviceConnections.set(deviceId, {
      ws,
      deviceId,
      lastSeen: new Date(),
      device
    });

    // Update device status
    await supabase
      .from('devices')
      .update({ 
        status: 'online',
        last_seen: new Date().toISOString()
      })
      .eq('id', deviceId);

    // Log connection
    await supabase
      .from('device_logs')
      .insert({
        device_id: deviceId,
        event_type: 'online',
        message: 'Device connected via WebSocket'
      });

    ws.send(JSON.stringify({ 
      type: 'REGISTERED',
      deviceId 
    }));

    // Notify admins
    broadcastToAdmins({
      type: 'DEVICE_ONLINE',
      data: { deviceId, device: device.name }
    }, device.tenant_id);

    console.log(`Device ${deviceId} registered`);
  } catch (error) {
    console.error('Device register error:', error);
  }
};

const handleAdminRegister = async (ws, data) => {
  try {
    const { userId, token } = data;

    // Verify user token
    // In a real implementation, verify JWT token here
    
    adminConnections.set(userId, {
      ws,
      userId,
      lastSeen: new Date()
    });

    ws.send(JSON.stringify({ 
      type: 'REGISTERED',
      userId 
    }));

    console.log(`Admin ${userId} registered`);
  } catch (error) {
    console.error('Admin register error:', error);
  }
};

const handleHeartbeat = async (ws, data) => {
  try {
    const { deviceId } = data;

    if (deviceConnections.has(deviceId)) {
      const connection = deviceConnections.get(deviceId);
      connection.lastSeen = new Date();

      // Update device last seen
      await supabase
        .from('devices')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', deviceId);

      ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK' }));
    }
  } catch (error) {
    console.error('Heartbeat error:', error);
  }
};

const handlePlaybackLog = async (data) => {
  try {
    const { deviceId, contentId, campaignId, duration, startTime, endTime } = data;

    // Log playback
    await supabase
      .from('playback_logs')
      .insert({
        device_id: deviceId,
        content_id: contentId,
        campaign_id: campaignId,
        duration,
        start_time: startTime,
        end_time: endTime
      });

    // Get device info for broadcasting
    const { data: device } = await supabase
      .from('devices')
      .select('tenant_id')
      .eq('id', deviceId)
      .single();

    if (device) {
      // Broadcast to admins
      broadcastToAdmins({
        type: 'PLAYBACK_UPDATE',
        data: { deviceId, contentId, campaignId, duration }
      }, device.tenant_id);
    }
  } catch (error) {
    console.error('Playback log error:', error);
  }
};

const handleDeviceStatus = async (data) => {
  try {
    const { deviceId, status, stats } = data;

    // Update device stats
    await supabase
      .from('device_stats')
      .upsert({
        device_id: deviceId,
        cpu_usage: stats.cpu,
        memory_usage: stats.memory,
        storage_used: stats.storage,
        temperature: stats.temperature,
        updated_at: new Date().toISOString()
      });

    // Get device info
    const { data: device } = await supabase
      .from('devices')
      .select('tenant_id, name')
      .eq('id', deviceId)
      .single();

    if (device) {
      // Broadcast status to admins
      broadcastToAdmins({
        type: 'DEVICE_STATUS_UPDATE',
        data: { deviceId, status, stats, deviceName: device.name }
      }, device.tenant_id);
    }
  } catch (error) {
    console.error('Device status error:', error);
  }
};

const handleScreenshotResult = async (data) => {
  try {
    const { deviceId, screenshot, timestamp } = data;

    // Save screenshot
    await supabase
      .from('device_screenshots')
      .insert({
        device_id: deviceId,
        screenshot_data: screenshot,
        created_at: timestamp || new Date().toISOString()
      });

    // Get device info
    const { data: device } = await supabase
      .from('devices')
      .select('tenant_id')
      .eq('id', deviceId)
      .single();

    if (device) {
      // Notify admins
      broadcastToAdmins({
        type: 'SCREENSHOT_READY',
        data: { deviceId }
      }, device.tenant_id);
    }
  } catch (error) {
    console.error('Screenshot result error:', error);
  }
};

export const broadcastToDevice = (deviceId, message) => {
  const connection = deviceConnections.get(deviceId);
  if (connection && connection.ws.readyState === connection.ws.OPEN) {
    connection.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
};

export const broadcastToAdmins = (message, tenantId) => {
  for (const connection of adminConnections.values()) {
    if (connection.ws.readyState === connection.ws.OPEN) {
      // In a real implementation, check if admin belongs to tenant
      connection.ws.send(JSON.stringify(message));
    }
  }
};

// Cleanup offline devices
setInterval(async () => {
  const now = new Date();
  const timeout = 5 * 60 * 1000; // 5 minutes

  for (const [deviceId, connection] of deviceConnections) {
    if (now - connection.lastSeen > timeout) {
      console.log(`Device ${deviceId} timed out`);
      
      // Update device status
      await supabase
        .from('devices')
        .update({ status: 'offline' })
        .eq('id', deviceId);

      // Log disconnection
      await supabase
        .from('device_logs')
        .insert({
          device_id: deviceId,
          event_type: 'offline',
          message: 'Device disconnected (timeout)'
        });

      // Remove connection
      deviceConnections.delete(deviceId);

      // Notify admins
      if (connection.device) {
        broadcastToAdmins({
          type: 'DEVICE_OFFLINE',
          data: { deviceId, device: connection.device.name }
        }, connection.device.tenant_id);
      }
    }
  }
}, 60000); // Check every minute