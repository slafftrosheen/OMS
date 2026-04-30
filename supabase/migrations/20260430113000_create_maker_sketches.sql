-- Create maker_sketches table
CREATE TABLE IF NOT EXISTS public.maker_sketches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled sketch',
    description TEXT,
    code TEXT NOT NULL,
    params JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maker_sketches ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view all sketches" ON public.maker_sketches FOR SELECT USING (true);
CREATE POLICY "Users can insert own sketches" ON public.maker_sketches FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sketches" ON public.maker_sketches FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sketches" ON public.maker_sketches FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER trg_maker_sketches_updated BEFORE UPDATE ON maker_sketches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
