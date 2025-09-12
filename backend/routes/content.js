import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, and PDFs
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|html/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Get all content
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, search, status } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('content')
      .select('*')
      .eq('tenant_id', req.user.tenant_id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: content, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      content,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload content
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { title, description, tags, duration } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Determine content type
    const getContentType = (mimetype) => {
      if (mimetype.startsWith('image/')) return 'image';
      if (mimetype.startsWith('video/')) return 'video';
      if (mimetype === 'application/pdf') return 'pdf';
      if (mimetype === 'text/html') return 'html';
      return 'other';
    };

    const contentType = getContentType(file.mimetype);

    // Create content record
    const { data: content, error } = await supabase
      .from('content')
      .insert({
        title: title || file.originalname,
        description,
        type: contentType,
        file_path: file.path,
        file_name: file.filename,
        original_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        duration: duration ? parseInt(duration) : null,
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        tenant_id: req.user.tenant_id,
        uploaded_by: req.user.id,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      message: 'File uploaded successfully',
      content
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: content, error } = await supabase
      .from('content')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Content not found' });
    }

    res.json({ content });
  } catch (error) {
    console.error('Get content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update content
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, tags, duration, status } = req.body;

    const { data: content, error } = await supabase
      .from('content')
      .update({
        title,
        description,
        tags: tags ? tags.split(',').map(t => t.trim()) : undefined,
        duration: duration ? parseInt(duration) : undefined,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Content updated successfully', content });
  } catch (error) {
    console.error('Update content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete content
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get content info first
    const { data: content, error: getError } = await supabase
      .from('content')
      .select('file_path')
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (getError) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Delete from database
    const { error } = await supabase
      .from('content')
      .delete()
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // TODO: Delete physical file
    // fs.unlinkSync(content.file_path);

    res.json({ message: 'Content deleted successfully' });
  } catch (error) {
    console.error('Delete content error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get content stats
router.get('/stats/summary', async (req, res) => {
  try {
    const { data: stats, error } = await supabase
      .from('content')
      .select('type, status')
      .eq('tenant_id', req.user.tenant_id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const summary = {
      total: stats.length,
      byType: {},
      byStatus: {}
    };

    stats.forEach(item => {
      summary.byType[item.type] = (summary.byType[item.type] || 0) + 1;
      summary.byStatus[item.status] = (summary.byStatus[item.status] || 0) + 1;
    });

    res.json({ stats: summary });
  } catch (error) {
    console.error('Get content stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;