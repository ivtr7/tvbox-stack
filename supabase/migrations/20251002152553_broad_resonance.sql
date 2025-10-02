/*
  # DigitalSignage-Lite Database Schema

  1. New Tables
    - `devices`
      - `id` (uuid, primary key)
      - `name` (text, device name)
      - `status` (text, device status: online/offline/blocked)
      - `created_at` (timestamp)
    
    - `content`
      - `id` (uuid, primary key)
      - `device_id` (uuid, foreign key to devices)
      - `file_url` (text, path to uploaded file)
      - `file_type` (text, image or video)
      - `duration` (integer, display duration in seconds)
      - `display_order` (integer, order of content display)
    
    - `pairing_tokens`
      - `token` (text, primary key)
      - `is_used` (boolean, whether token has been used)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for public access (simplified for local use)
*/

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'blocked')),
  created_at timestamptz DEFAULT now()
);

-- Create content table
CREATE TABLE IF NOT EXISTS content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'video')),
  duration integer NOT NULL DEFAULT 10,
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Create pairing_tokens table
CREATE TABLE IF NOT EXISTS pairing_tokens (
  token text PRIMARY KEY,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (simplified for local development)
CREATE POLICY "Allow all operations on devices"
  ON devices
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on content"
  ON content
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on pairing_tokens"
  ON pairing_tokens
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_content_device_id ON content(device_id);
CREATE INDEX IF NOT EXISTS idx_content_display_order ON content(device_id, display_order);
CREATE INDEX IF NOT EXISTS idx_pairing_tokens_used ON pairing_tokens(is_used);

-- Create function to cleanup old unused tokens (optional)
CREATE OR REPLACE FUNCTION cleanup_old_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM pairing_tokens 
  WHERE is_used = false 
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;