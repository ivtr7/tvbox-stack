import express from 'express';
import { supabase } from '../config/database.js';

const router = express.Router();

// Get all playlists
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('playlists')
      .select(`
        *,
        playlist_items (
          id,
          content_id,
          duration,
          order_index,
          content (
            id,
            title,
            type,
            file_name
          )
        )
      `)
      .eq('tenant_id', req.user.tenant_id)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: playlists, error, count } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      playlists,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create playlist
router.post('/', async (req, res) => {
  try {
    const { name, description, items = [], settings = {} } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    // Create playlist
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .insert({
        name,
        description,
        settings,
        tenant_id: req.user.tenant_id,
        created_by: req.user.id,
        is_active: true
      })
      .select()
      .single();

    if (playlistError) {
      return res.status(400).json({ error: playlistError.message });
    }

    // Add playlist items
    if (items.length > 0) {
      const playlistItems = items.map((item, index) => ({
        playlist_id: playlist.id,
        content_id: item.contentId,
        duration: item.duration || null,
        order_index: index,
        transition_effect: item.transitionEffect || 'none'
      }));

      const { error: itemsError } = await supabase
        .from('playlist_items')
        .insert(playlistItems);

      if (itemsError) {
        // Rollback playlist creation
        await supabase.from('playlists').delete().eq('id', playlist.id);
        return res.status(400).json({ error: itemsError.message });
      }
    }

    res.json({
      message: 'Playlist created successfully',
      playlist
    });
  } catch (error) {
    console.error('Create playlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get playlist by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: playlist, error } = await supabase
      .from('playlists')
      .select(`
        *,
        playlist_items (
          id,
          content_id,
          duration,
          order_index,
          transition_effect,
          content (
            id,
            title,
            type,
            file_name,
            file_path,
            mime_type,
            duration
          )
        )
      `)
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Sort items by order_index
    playlist.playlist_items.sort((a, b) => a.order_index - b.order_index);

    res.json({ playlist });
  } catch (error) {
    console.error('Get playlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update playlist
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, items, settings, isActive } = req.body;

    // Update playlist
    const { data: playlist, error: updateError } = await supabase
      .from('playlists')
      .update({
        name,
        description,
        settings,
        is_active: isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // Update playlist items if provided
    if (items) {
      // Delete existing items
      await supabase
        .from('playlist_items')
        .delete()
        .eq('playlist_id', id);

      // Add new items
      if (items.length > 0) {
        const playlistItems = items.map((item, index) => ({
          playlist_id: id,
          content_id: item.contentId,
          duration: item.duration || null,
          order_index: index,
          transition_effect: item.transitionEffect || 'none'
        }));

        const { error: itemsError } = await supabase
          .from('playlist_items')
          .insert(playlistItems);

        if (itemsError) {
          return res.status(400).json({ error: itemsError.message });
        }
      }
    }

    res.json({ message: 'Playlist updated successfully', playlist });
  } catch (error) {
    console.error('Update playlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete playlist
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if playlist is used in any campaigns
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('id')
      .eq('playlist_id', id)
      .eq('is_active', true);

    if (campaignError) {
      return res.status(500).json({ error: 'Error checking playlist usage' });
    }

    if (campaigns && campaigns.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete playlist - it is being used by active campaigns' 
      });
    }

    // Delete playlist (items will be deleted by cascade)
    const { error } = await supabase
      .from('playlists')
      .delete()
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Delete playlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Duplicate playlist
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Get original playlist
    const { data: original, error: getError } = await supabase
      .from('playlists')
      .select(`
        *,
        playlist_items (*)
      `)
      .eq('id', id)
      .eq('tenant_id', req.user.tenant_id)
      .single();

    if (getError) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Create new playlist
    const { data: newPlaylist, error: createError } = await supabase
      .from('playlists')
      .insert({
        name: name || `${original.name} (Copy)`,
        description: original.description,
        settings: original.settings,
        tenant_id: req.user.tenant_id,
        created_by: req.user.id,
        is_active: false
      })
      .select()
      .single();

    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    // Copy playlist items
    if (original.playlist_items.length > 0) {
      const newItems = original.playlist_items.map(item => ({
        playlist_id: newPlaylist.id,
        content_id: item.content_id,
        duration: item.duration,
        order_index: item.order_index,
        transition_effect: item.transition_effect
      }));

      const { error: itemsError } = await supabase
        .from('playlist_items')
        .insert(newItems);

      if (itemsError) {
        return res.status(400).json({ error: itemsError.message });
      }
    }

    res.json({
      message: 'Playlist duplicated successfully',
      playlist: newPlaylist
    });
  } catch (error) {
    console.error('Duplicate playlist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;