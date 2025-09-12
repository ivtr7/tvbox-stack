import express from 'express';
import { supabase } from '../config/database.js';
import { broadcastToDevice } from '../websocket/index.js';

const router = express.Router();

// Get all campaigns
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('campaigns')
      .select(`
        *,
        playlist:playlists(id, name),
        devices:campaign_devices(device:devices(id, name, location))
      `)
      .eq('tenant_id', req.user.tenant_id)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: campaigns, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create campaign
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      playlistId, 
      deviceIds = [], 
      schedule, 
      priority = 1,
      settings = {} 
    } = req.body;

    if (!name || !playlistId) {
      return res.status(400).json({ error: 'Name and playlist are required' });
    }

    // Verify playlist exists
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select('id')
      .eq('id', playlistId)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (playlistError || !playlist) {
      return res.status(400).json({ error: 'Invalid playlist' });
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name,
        description,
        playlist_id: playlistId,
        schedule,
        priority,
        settings,
        tenant_id: req.user.tenant_id,
        created_by: req.user.id,
        status: 'draft',
        is_active: false
      })
      .select()
      .single();

    if (campaignError) {
      return res.status(400).json({ error: campaignError.message });
    }

    // Assign devices to campaign
    if (deviceIds.length > 0) {
      const campaignDevices = deviceIds.map(deviceId => ({
        campaign_id: campaign.id,
        device_id: deviceId
      }));

      const { error: devicesError } = await supabase
        .from('campaign_devices')
        .insert(campaignDevices);

      if (devicesError) {
        return res.status(400).json({ error: devicesError.message });
      }
    }

    res.json({
      message: 'Campaign created successfully',
      campaign
    });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get campaign by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        playlist:playlists(
          id,
          name,
          description,
          playlist_items(
            id,
            content_id,
            duration,
            order_index,
            content(id, title, type, file_name)
          )
        ),
        devices:campaign_devices(device:devices(id, name, location, status))
      `)
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update campaign
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      playlistId, 
      deviceIds, 
      schedule, 
      priority, 
      settings, 
      status 
    } = req.body;

    // Update campaign
    const { data: campaign, error: updateError } = await supabase
      .from('campaigns')
      .update({
        name,
        description,
        playlist_id: playlistId,
        schedule,
        priority,
        settings,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Update device assignments if provided
    if (deviceIds) {
      // Remove existing assignments
      await supabase
        .from('campaign_devices')
        .delete()
        .eq('campaign_id', id);

      // Add new assignments
      if (deviceIds.length > 0) {
        const campaignDevices = deviceIds.map(deviceId => ({
          campaign_id: id,
          device_id: deviceId
        }));

        const { error: devicesError } = await supabase
          .from('campaign_devices')
          .insert(campaignDevices);

        if (devicesError) {
          return res.status(400).json({ error: devicesError.message });
        }
      }

      // Notify affected devices
      deviceIds.forEach(deviceId => {
        broadcastToDevice(deviceId, {
          type: 'CAMPAIGN_UPDATE',
          data: { campaignId: id }
        });
      });
    }

    res.json({ message: 'Campaign updated successfully', campaign });
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Activate/Deactivate campaign
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update({
        is_active: isActive,
        status: isActive ? 'active' : 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Get campaign devices to notify
    const { data: campaignDevices } = await supabase
      .from('campaign_devices')
      .select('device_id')
      .eq('campaign_id', id);

    // Notify devices
    campaignDevices?.forEach(({ device_id }) => {
      broadcastToDevice(device_id, {
        type: isActive ? 'CAMPAIGN_ACTIVATED' : 'CAMPAIGN_DEACTIVATED',
        data: { campaignId: id }
      });
    });

    res.json({ 
      message: `Campaign ${isActive ? 'activated' : 'deactivated'} successfully`,
      campaign 
    });
  } catch (error) {
    console.error('Update campaign status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete campaign
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get campaign devices before deletion
    const { data: campaignDevices } = await supabase
      .from('campaign_devices')
      .select('device_id')
      .eq('campaign_id', id);

    // Delete campaign (cascade will handle related records)
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Notify devices
    campaignDevices?.forEach(({ device_id }) => {
      broadcastToDevice(device_id, {
        type: 'CAMPAIGN_DELETED',
        data: { campaignId: id }
      });
    });

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get campaign analytics
router.get('/:id/analytics', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const { data: analytics, error } = await supabase
      .from('playback_logs')
      .select(`
        *,
        device:devices(name, location),
        content:content(title, type)
      `)
      .eq('campaign_id', id)
      .gte('created_at', startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .lte('created_at', endDate || new Date().toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Process analytics data
    const summary = {
      totalPlays: analytics.length,
      uniqueDevices: new Set(analytics.map(a => a.device_id)).size,
      totalDuration: analytics.reduce((sum, a) => sum + (a.duration || 0), 0),
      byContent: {},
      byDevice: {},
      byHour: Array(24).fill(0)
    };

    analytics.forEach(log => {
      // By content
      const contentId = log.content_id;
      if (!summary.byContent[contentId]) {
        summary.byContent[contentId] = {
          title: log.content?.title || 'Unknown',
          type: log.content?.type || 'unknown',
          plays: 0,
          duration: 0
        };
      }
      summary.byContent[contentId].plays++;
      summary.byContent[contentId].duration += log.duration || 0;

      // By device
      const deviceId = log.device_id;
      if (!summary.byDevice[deviceId]) {
        summary.byDevice[deviceId] = {
          name: log.device?.name || 'Unknown',
          location: log.device?.location || '',
          plays: 0,
          duration: 0
        };
      }
      summary.byDevice[deviceId].plays++;
      summary.byDevice[deviceId].duration += log.duration || 0;

      // By hour
      const hour = new Date(log.created_at).getHours();
      summary.byHour[hour]++;
    });

    res.json({ analytics: summary });
  } catch (error) {
    console.error('Get campaign analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;