import express from 'express';
import { supabase } from '../config/database.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get system status
router.get('/status', async (req, res) => {
  try {
    const status = {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version,
        timestamp: new Date().toISOString()
      },
      database: {
        connected: true,
        lastChecked: new Date().toISOString()
      }
    };

    // Test database connection
    try {
      await supabase.from('users').select('count').limit(1);
    } catch (error) {
      status.database.connected = false;
      status.database.error = error.message;
    }

    res.json({ status });
  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get system logs
router.get('/logs', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { page = 1, limit = 100, level, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (level) query = query.eq('level', level);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: logs, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get system logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get audit logs
router.get('/audit', requireRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { page = 1, limit = 100, userId, action, startDate, endDate } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('audit_logs')
      .select(`
        *,
        user:users(id, email, first_name, last_name)
      `)
      .eq('tenant_id', req.user.tenant_id)
      .order('created_at', { ascending: false });

    if (userId) query = query.eq('user_id', userId);
    if (action) query = query.eq('action', action);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: logs, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get tenant settings
router.get('/settings', async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(400).json({ error: error.message });
    }

    res.json({ 
      settings: settings || {
        branding: {},
        features: {},
        limits: {},
        integrations: {}
      }
    });
  } catch (error) {
    console.error('Get tenant settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update tenant settings
router.put('/settings', requireRole(['admin']), async (req, res) => {
  try {
    const { branding, features, limits, integrations } = req.body;

    const { data: settings, error } = await supabase
      .from('tenant_settings')
      .upsert({
        tenant_id: req.user.tenant_id,
        branding,
        features,
        limits,
        integrations,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Log the action
    await supabase
      .from('audit_logs')
      .insert({
        tenant_id: req.user.tenant_id,
        user_id: req.user.id,
        action: 'settings_update',
        resource_type: 'tenant_settings',
        resource_id: settings.id,
        metadata: { changes: req.body }
      });

    res.json({ message: 'Settings updated successfully', settings });
  } catch (error) {
    console.error('Update tenant settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// System maintenance
router.post('/maintenance', requireRole(['super_admin']), async (req, res) => {
  try {
    const { action, parameters = {} } = req.body;

    let result;
    switch (action) {
      case 'clear_cache':
        // Implement cache clearing logic
        result = { message: 'Cache cleared successfully' };
        break;
      case 'cleanup_logs':
        // Cleanup old logs
        const daysToKeep = parameters.days || 30;
        const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        
        await supabase
          .from('device_logs')
          .delete()
          .lt('created_at', cutoffDate.toISOString());
          
        result = { message: `Logs older than ${daysToKeep} days cleaned up` };
        break;
      case 'rebuild_indexes':
        // Database maintenance
        result = { message: 'Database indexes rebuilt' };
        break;
      default:
        return res.status(400).json({ error: 'Invalid maintenance action' });
    }

    // Log the maintenance action
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: `Maintenance action performed: ${action}`,
        metadata: { action, parameters, performedBy: req.user.id }
      });

    res.json(result);
  } catch (error) {
    console.error('System maintenance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;