-- Update FAQs table with categories, tags and translations
ALTER TABLE public.faqs 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General',
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '{}';

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_faqs_category ON public.faqs(category);
CREATE INDEX IF NOT EXISTS idx_faqs_tags ON public.faqs USING GIN (tags);
