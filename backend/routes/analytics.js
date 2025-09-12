import express from 'express';
import { supabase } from '../config/database.js';

const router = express.Router();

// Get dashboard overview
router.get('/overview', async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Get basic counts
    const [
      { data: devices },
      { data: content },
      { data: campaigns },
      { data: playlists },
      { data: todayLogs },
      { data: yesterdayLogs },
      { data: weekLogs }
    ] = await Promise.all([
      supabase.from('devices').select('id, status').eq('tenant_id', tenantId),
      supabase.from('content').select('id, type').eq('tenant_id', tenantId),
      supabase.from('campaigns').select('id, status').eq('tenant_id', tenantId),
      supabase.from('playlists').select('id').eq('tenant_id', tenantId),
      supabase.from('playback_logs')
        .select('id, duration')
        .gte('created_at', now.toISOString().split('T')[0]),
      supabase.from('playback_logs')
        .select('id, duration')
        .gte('created_at', yesterday.toISOString().split('T')[0])
        .lt('created_at', now.toISOString().split('T')[0]),
      supabase.from('playback_logs')
        .select('id, duration')
        .gte('created_at', lastWeek.toISOString())
    ]);

    // Calculate device statistics
    const deviceStats = {
      total: devices?.length || 0,
      online: devices?.filter(d => d.status === 'online').length || 0,
      offline: devices?.filter(d => d.status === 'offline').length || 0,
      error: devices?.filter(d => d.status === 'error').length || 0
    };

    // Calculate content statistics
    const contentStats = {
      total: content?.length || 0,
      images: content?.filter(c => c.type === 'image').length || 0,
      videos: content?.filter(c => c.type === 'video').length || 0,
      others: content?.filter(c => !['image', 'video'].includes(c.type)).length || 0
    };

    // Calculate campaign statistics
    const campaignStats = {
      total: campaigns?.length || 0,
      active: campaigns?.filter(c => c.status === 'active').length || 0,
      draft: campaigns?.filter(c => c.status === 'draft').length || 0,
      paused: campaigns?.filter(c => c.status === 'paused').length || 0
    };

    // Calculate playback statistics
    const playbackStats = {
      today: {
        plays: todayLogs?.length || 0,
        duration: todayLogs?.reduce((sum, log) => sum + (log.duration || 0), 0) || 0
      },
      yesterday: {
        plays: yesterdayLogs?.length || 0,
        duration: yesterdayLogs?.reduce((sum, log) => sum + (log.duration || 0), 0) || 0
      },
      week: {
        plays: weekLogs?.length || 0,
        duration: weekLogs?.reduce((sum, log) => sum + (log.duration || 0), 0) || 0
      }
    };

    res.json({
      overview: {
        devices: deviceStats,
        content: contentStats,
        campaigns: campaignStats,
        playlists: { total: playlists?.length || 0 },
        playback: playbackStats
      }
    });
  } catch (error) {
    console.error('Get overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get device analytics
router.get('/devices', async (req, res) => {
  try {
    const { period = '7d', deviceId } = req.query;
    const tenantId = req.user.tenant_id;

    // Calculate date range
    const now = new Date();
    const daysBack = period === '1d' ? 1 : period === '7d' ? 7 : 30;
    const startDate = new Date(now - daysBack * 24 * 60 * 60 * 1000);

    let query = supabase
      .from('device_logs')
      .select(`
        *,
        device:devices(id, name, location)
      `)
      .eq('devices.tenant_id', tenantId)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (deviceId) {
      query = query.eq('device_id', deviceId);
    }

    const { data: logs, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Process logs by device and event type
    const deviceAnalytics = {};

    logs?.forEach(log => {
      const deviceId = log.device_id;
      if (!deviceAnalytics[deviceId]) {
        deviceAnalytics[deviceId] = {
          device: log.device,
          events: {
            online: 0,
            offline: 0,
            error: 0,
            command: 0
          },
          timeline: []
        };
      }

      deviceAnalytics[deviceId].events[log.event_type]++;
      deviceAnalytics[deviceId].timeline.push({
        timestamp: log.created_at,
        event: log.event_type,
        message: log.message
      });
    });

    res.json({ deviceAnalytics });
  } catch (error) {
    console.error('Get device analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get playback analytics
router.get('/playback', async (req, res) => {
  try {
    const { 
      period = '7d', 
      deviceId, 
      campaignId, 
      contentId,
      startDate,
      endDate 
    } = req.query;
    
    const tenantId = req.user.tenant_id;

    // Calculate date range
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      end = new Date();
      const daysBack = period === '1d' ? 1 : period === '7d' ? 7 : 30;
      start = new Date(end - daysBack * 24 * 60 * 60 * 1000);
    }

    let query = supabase
      .from('playback_logs')
      .select(`
        *,
        device:devices(id, name, location),
        campaign:campaigns(id, name),
        content:content(id, title, type)
      `)
      .eq('devices.tenant_id', tenantId)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    // Apply filters
    if (deviceId) query = query.eq('device_id', deviceId);
    if (campaignId) query = query.eq('campaign_id', campaignId);
    if (contentId) query = query.eq('content_id', contentId);

    const { data: logs, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Process analytics
    const analytics = {
      summary: {
        totalPlays: logs?.length || 0,
        totalDuration: logs?.reduce((sum, log) => sum + (log.duration || 0), 0) || 0,
        uniqueDevices: new Set(logs?.map(log => log.device_id)).size || 0,
        avgPlayDuration: 0
      },
      byTime: {},
      byDevice: {},
      byCampaign: {},
      byContent: {},
      timeline: []
    };

    if (logs && logs.length > 0) {
      analytics.summary.avgPlayDuration = analytics.summary.totalDuration / analytics.summary.totalPlays;

      logs.forEach(log => {
        const date = log.created_at.split('T')[0];
        const hour = new Date(log.created_at).getHours();

        // By time
        if (!analytics.byTime[date]) {
          analytics.byTime[date] = { plays: 0, duration: 0, byHour: {} };
        }
        analytics.byTime[date].plays++;
        analytics.byTime[date].duration += log.duration || 0;
        analytics.byTime[date].byHour[hour] = (analytics.byTime[date].byHour[hour] || 0) + 1;

        // By device
        const deviceKey = log.device_id;
        if (!analytics.byDevice[deviceKey]) {
          analytics.byDevice[deviceKey] = {
            device: log.device,
            plays: 0,
            duration: 0
          };
        }
        analytics.byDevice[deviceKey].plays++;
        analytics.byDevice[deviceKey].duration += log.duration || 0;

        // By campaign
        if (log.campaign_id) {
          const campaignKey = log.campaign_id;
          if (!analytics.byCampaign[campaignKey]) {
            analytics.byCampaign[campaignKey] = {
              campaign: log.campaign,
              plays: 0,
              duration: 0
            };
          }
          analytics.byCampaign[campaignKey].plays++;
          analytics.byCampaign[campaignKey].duration += log.duration || 0;
        }

        // By content
        const contentKey = log.content_id;
        if (!analytics.byContent[contentKey]) {
          analytics.byContent[contentKey] = {
            content: log.content,
            plays: 0,
            duration: 0
          };
        }
        analytics.byContent[contentKey].plays++;
        analytics.byContent[contentKey].duration += log.duration || 0;

        // Timeline
        analytics.timeline.push({
          timestamp: log.created_at,
          device: log.device?.name,
          campaign: log.campaign?.name,
          content: log.content?.title,
          duration: log.duration
        });
      });
    }

    res.json({ analytics });
  } catch (error) {
    console.error('Get playback analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export analytics data
router.get('/export', async (req, res) => {
  try {
    const { type, format = 'json', ...filters } = req.query;

    let data;
    switch (type) {
      case 'devices':
        const devicesResponse = await fetch(`${req.protocol}://${req.get('host')}/api/v1/analytics/devices?${new URLSearchParams(filters)}`);
        data = await devicesResponse.json();
        break;
      case 'playback':
        const playbackResponse = await fetch(`${req.protocol}://${req.get('host')}/api/v1/analytics/playback?${new URLSearchParams(filters)}`);
        data = await playbackResponse.json();
        break;
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    if (format === 'csv') {
      // Convert to CSV (simplified)
      const csv = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-analytics.csv`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-analytics.json`);
      res.json(data);
    }
  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  // This is a simplified CSV conversion
  // In a real implementation, you'd want a proper CSV library
  return JSON.stringify(data);
}

export default router;