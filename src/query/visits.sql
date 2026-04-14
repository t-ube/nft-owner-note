-- アクセスログテーブル
CREATE TABLE visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- 一意なログID
  user_id uuid NOT NULL,                         -- Cookieで割り振ったUUID
  ip inet,                                       -- IPアドレス
  user_agent text,                               -- UA
  path text,                                     -- アクセスパス
  owner_list_count integer,                      -- オーナーリストの件数
  issuer text,                                   -- NFT issuer address
  taxon bigint,                                  -- NFT taxon (unsigned 32-bit)
  created_at timestamptz DEFAULT now()           -- アクセス日時
);

-- 高速化用インデックス
CREATE INDEX visits_created_at_idx ON visits (created_at);
CREATE INDEX visits_user_id_idx ON visits (user_id);
