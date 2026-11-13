-- ========================================================
-- AI Game Project - Supabase 資料庫綱要 (Database Schema)
-- ========================================================

-- 1. 建立玩家存檔資料表
CREATE TABLE IF NOT EXISTS public.player_data (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pos_x NUMERIC DEFAULT 400 NOT NULL,
    pos_y NUMERIC DEFAULT 300 NOT NULL,
    autosave_interval INTEGER DEFAULT 5000 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. 啟用 Row Level Security (RLS 欄位等級安全性保護)
ALTER TABLE public.player_data ENABLE ROW LEVEL SECURITY;

-- 3. 建立安全性存取策略 (RLS Policies)
-- 確保玩家只能存取並修改屬於自己的遊戲存檔

-- 允許玩家查詢自己的存檔
CREATE POLICY "允許玩家查詢自身存檔"
    ON public.player_data
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- 允許玩家新增自己的存檔
CREATE POLICY "允許玩家新增自身存檔"
    ON public.player_data
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- 允許玩家更新自己的存檔
CREATE POLICY "允許玩家更新自身存檔"
    ON public.player_data
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 4. 建立更新時間觸發器 (自動更新 updated_at 欄位)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_player_data_updated ON public.player_data;

CREATE TRIGGER on_player_data_updated
    BEFORE UPDATE ON public.player_data
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
