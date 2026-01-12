-- Add metadata columns to existing tables

ALTER TABLE materials ADD COLUMN metadata JSONB DEFAULT '{}';
ALTER TABLE draft_orders ADD COLUMN metadata JSONB DEFAULT '{}';
ALTER TABLE suppliers ADD COLUMN metadata JSONB DEFAULT '{}';
