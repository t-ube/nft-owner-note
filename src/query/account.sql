-- =============================================================================
-- ログインしたアカウントと push トークン
-- =============================================================================
--
-- OwnerNote のログイン（Xaman / Joey）。仕様は doc/login.md。
-- 通知（user_token を使った push）の土台で、この時点では通知そのものは実装していない。
--
-- ## 認証の形
--
-- Xaman は SignIn ペイロード（XRPL には送られない疑似トランザクション）に
-- 署名してもらい、サーバー（Next.js の API Route）が Xaman API から結果を引いて
-- response.account を読む。Joey はサーバーが出したチャレンジ入りの tx に署名して
-- もらい、サーバーが検証する。どちらもブラウザの申告をそのまま信じないので、
-- 名乗るだけでは入れない。
--
-- セッションはサーバーが自前で署名した JWT を httpOnly Cookie に入れる。
-- Supabase Auth は使わない。したがってここのテーブルに RLS ポリシーは要らず、
-- service_role のサーバーだけが触る。
--
-- 【注意】旧方式の sync_sessions（sync_token Cookie）は危険なため廃止した。
-- このファイルとは無関係で、テーブルは削除する。
--
-- ## push_token
--
-- Xaman の user_token。署名が済むと application.issued_user_token で返る。
-- 寿命は「最後に署名されてから30日」で、署名のたびに新しい値が来るため
-- 上書きし続ける必要がある。expires_at はその30日後をサーバーが計算して入れる。
--
-- **これだけでは自由な文面の通知は送れない。** xapp/push と xapp/event は
-- XRPL Labs に xApp としてホワイトリスト登録された資格情報専用で、普通の
-- API アプリができるのは「署名リクエストの push」だけ。それでも貯めておくのは、
-- ホワイトリストが通った時点で即使えるようにするため。
--
-- provider を先に持たせたのも同じ理由。通らなければ Web Push に替えることに
-- なるが、そのとき行の形は変わらない（provider = 'webpush'、token に購読情報）。
--
-- ## 通知の購読（未実装）
--
-- 「何を」「いつ」知らせるかを持つテーブルは、通知の送出を作るときに足す。
-- 先に器だけ決めても形が定まらない。


CREATE SCHEMA IF NOT EXISTS owner_note;

CREATE TABLE IF NOT EXISTS owner_note.account (
    address character varying(35) NOT NULL,
    first_login_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone DEFAULT now() NOT NULL,
    login_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS owner_note.push_token (
    address character varying(35) NOT NULL,
    provider text DEFAULT 'xaman'::text NOT NULL,
    token text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone
);

ALTER TABLE ONLY owner_note.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (address);

ALTER TABLE ONLY owner_note.push_token
    ADD CONSTRAINT push_token_pkey PRIMARY KEY (address, provider);

-- 送る相手を集めるとき、生きているトークンだけを舐める。
-- 失効した行は残す（いつ切れたかが分からないと、届かない理由が追えない）。
CREATE INDEX IF NOT EXISTS idx_push_token_live ON owner_note.push_token USING btree (expires_at) WHERE (revoked_at IS NULL);


-- -----------------------------------------------------------------------------
-- サーバーから呼ぶ関数
-- -----------------------------------------------------------------------------
-- 引数に p_ を付けているのは、列名と同じ名前だと upsert の中で
-- どちらを指すか曖昧になるため。
-- Supabase の RPC は public スキーマの関数を呼ぶので、関数は public に置く。


-- ログインの記録とトークンの保存。1回の往復で済ませる。
-- p_token が null なら（Xaman がトークンを発行しなかったとき、Joey でのログイン）触らない。
-- 既にあるトークンを null で潰すと、通知だけが静かに止まる。
CREATE OR REPLACE FUNCTION public.owner_note_login(p_address text, p_token text, p_expires_at timestamptz) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result json;
begin
  insert into owner_note.account as a (address, login_count)
  values (p_address, 1)
  on conflict (address) do update
    set last_login_at = now(),
        login_count = a.login_count + 1
  returning json_build_object(
    'address', a.address,
    'first_login_at', a.first_login_at,
    'login_count', a.login_count
  ) into result;

  if p_token is not null then
    insert into owner_note.push_token (address, provider, token, expires_at)
    values (p_address, 'xaman', p_token, p_expires_at)
    on conflict (address, provider) do update
      set token = excluded.token,
          issued_at = now(),
          expires_at = excluded.expires_at,
          revoked_at = null;
  end if;

  return result;
end;
$$;

-- webhook からのトークン更新。ログインしたことのある相手だけを対象にする。
-- 見知らぬアドレスの行を作らないよう、account が無ければ何もしない。
CREATE OR REPLACE FUNCTION public.owner_note_touch_token(p_address text, p_token text, p_expires_at timestamptz) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with u as (
    insert into owner_note.push_token (address, provider, token, expires_at)
    select p_address, 'xaman', p_token, p_expires_at
    where exists (select 1 from owner_note.account where address = p_address)
    on conflict (address, provider) do update
      set token = excluded.token,
          issued_at = now(),
          expires_at = excluded.expires_at,
          revoked_at = null
    returning 1
  )
  select count(*)::int from u;
$$;


ALTER TABLE owner_note.account ENABLE ROW LEVEL SECURITY;

ALTER TABLE owner_note.push_token ENABLE ROW LEVEL SECURITY;


COMMENT ON COLUMN owner_note.account.login_count IS 'ログインした回数。同じ人が何度も入り直しているのか、別の人が増えているのかを区別するために数えている。';

COMMENT ON COLUMN owner_note.push_token.expires_at IS 'Xaman の user_token が切れる時刻。最後の署名から30日後をサーバーが計算して入れる。過ぎた行に push しても届かない。';

COMMENT ON COLUMN owner_note.push_token.provider IS '通知の経路。xaman は Xaman の user_token。xApp のホワイトリストが通らず Web Push に替える場合は webpush が入り、token に購読情報が入る。';

COMMENT ON COLUMN owner_note.push_token.revoked_at IS 'ユーザーが通知を切った時刻。行は消さない。いつ止めたかが分からないと、届かない理由を追えない。';

COMMENT ON TABLE owner_note.account IS 'Xaman でログインしたアカウント。Supabase Auth は使わず、サーバーが自前の JWT でセッションを持つ。詳しくは doc/login.md。';

COMMENT ON TABLE owner_note.push_token IS '通知の宛先。1アドレス1経路につき1行で、最新のトークンだけを持つ。Xaman の user_token は署名のたびに新しい値が発行されるため上書きし続ける。';


-- 実行権限
-- 関数は既定で PUBLIC に実行権限が付くため、PUBLIC からも外して service_role にだけ渡す。
revoke execute on function public.owner_note_login(p_address text, p_token text, p_expires_at timestamptz) from public, anon, authenticated;
revoke execute on function public.owner_note_touch_token(p_address text, p_token text, p_expires_at timestamptz) from public, anon, authenticated;
grant execute on function public.owner_note_login(p_address text, p_token text, p_expires_at timestamptz) to service_role;
grant execute on function public.owner_note_touch_token(p_address text, p_token text, p_expires_at timestamptz) to service_role;
