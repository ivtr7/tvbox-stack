import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/database.js';
import { broadcastToDevice } from '../websocket/index.js';

const router = express.Router();

// Get all devices
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, location, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('devices')
      .select(`
        *,
        current_campaign:campaigns(id, name),
        device_stats(*)
      `)
      .eq('tenant_id', req.user.tenant_id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (status) query = query.eq('status', status);
    if (location) query = query.ilike('location', `%${location}%`);
    if (search) {
      query = query.or(`name.ilike.%${search}%,serial_number.ilike.%${search}%`);
    }

    const { data: devices, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      devices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get device by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: device, error } = await supabase
      .from('devices')
      .select(`
        *,
        current_campaign:campaigns(id, name, description),
        device_stats(*),
        device_logs(*) {
          id,
          event_type,
          message,
          created_at
        }
      `)
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ device });
  } catch (error) {
    console.error('Get device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create pairing token
router.post('/pair/token', async (req, res) => {
  try {
    const { name, location, description, tags } = req.body;

    const pairingToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const { data: token, error } = await supabase
      .from('pairing_tokens')
      .insert({
        token: pairingToken,
        name,
        location,
        description,
        tags,
        tenant_id: req.user.tenant_id,
        created_by: req.user.id,
        expires_at: expiresAt.toISOString(),
        is_used: false
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: 'Pairing token created',
      token: token.token,
      expiresAt: token.expires_at,
      pairingUrl: `${process.env.FRONTEND_URL}/pair/${token.token}`
    });
  } catch (error) {
    console.error('Create pairing token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pair device
router.post('/pair/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { serialNumber, model, osVersion, appVersion, specs } = req.body;

    // Get pairing token
    const { data: pairingToken, error: tokenError } = await supabase
      .from('pairing_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_used', false)
      .single();

    if (tokenError || !pairingToken) {
      return res.status(404).json({ error: 'Invalid or expired pairing token' });
    }

    // Check if token is expired
    if (new Date(pairingToken.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Pairing token expired' });
    }

    // Create device
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .insert({
        name: pairingToken.name,
        serial_number: serialNumber,
        model,
        os_version: osVersion,
        app_version: appVersion,
        specs,
        location: pairingToken.location,
        description: pairingToken.description,
        tags: pairingToken.tags,
        tenant_id: pairingToken.tenant_id,
        status: 'online',
        last_seen: new Date().toISOString(),
        paired_at: new Date().toISOString()
      })
      .select()
      .single();

    if (deviceError) {
      return res.status(400).json({ error: deviceError.message });
    }

    // Mark token as used
    await supabase
      .from('pairing_tokens')
      .update({ is_used: true, device_id: device.id })
      .eq('token', token);

    res.json({
      message: 'Device paired successfully',
      device: {
        id: device.id,
        name: device.name,
        serialNumber: device.serial_number
      }
    });
  } catch (error) {
    console.error('Pair device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update device
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, description, tags, campaignId } = req.body;

    const { data: device, error } = await supabase
      .from('devices')
      .update({
        name,
        location,
        description,
        tags,
        campaign_id: campaignId,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Notify device of changes via WebSocket
    broadcastToDevice(id, {
      type: 'CONFIGURATION_UPDATE',
      data: { campaignId }
    });

    res.json({ message: 'Device updated successfully', device });
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send command to device
router.post('/:id/command', async (req, res) => {
  try {
    const { id } = req.params;
    const { command, parameters } = req.body;

    // Validate device exists and belongs to user
    const { data: device, error } = await supabase
      .from('devices')
      .select('id, name, status')
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (error || !device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (device.status !== 'online') {
      return res.status(400).json({ error: 'Device is offline' });
    }

    // Log command
    await supabase
      .from('device_logs')
      .insert({
        device_id: id,
        event_type: 'command_sent',
        message: `Command sent: ${command}`,
        metadata: { command, parameters, sentBy: req.user.id }
      });

    // Send command via WebSocket
    const success = broadcastToDevice(id, {
      type: 'REMOTE_COMMAND',
      data: { command, parameters }
    });

    if (!success) {
      return res.status(503).json({ error: 'Failed to send command - device not connected' });
    }

    res.json({ 
      message: 'Command sent successfully',
      command,
      sentAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Send command error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete device
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get device screenshot
router.get('/:id/screenshot', async (req, res) => {
  try {
    const { id } = req.params;

    // Get latest screenshot
    const { data: screenshot, error } = await supabase
      .from('device_screenshots')
      .select('*')
      .eq('device_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !screenshot) {
      return res.status(404).json({ error: 'No screenshot available' });
    }

    res.json({ screenshot });
  } catch (error) {
    console.error('Get screenshot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;