-- =============================================================================
-- マイアクティビティ（発行者として、自分の NFT がいくら売れ、自分にいくら入り、誰が買ったか）
-- =============================================================================
--
-- 「自分」は画面で選んだアドレスの組（ログイン中のアドレスに、任意で足したアドレス）。
-- 対象:
--   mint    : nft_mint_history    の issuer が自分。オーナー（owner）→ 次のオーナー（destination）。金額は出さない。
--             オーナーが発行者本人なら手動ミント（manual）、違えばローンチパッド（委任ミント, launchpad）。
--             ローンチパッドは販売として数え、destination を購入者に数える
--             （その後の受け渡しは 0 XRP の転送で、既定では除くので二重には数えない）
--   sale    : nft_sale_history_v2 の issuer が自分で、seller も自分（一次販売）。受取は seller_received
--   secondary: nft_sale_history_v2 の issuer が自分で、seller は他人（二次販売）。受取は royalty_received
--             一次・二次とも、オーナー（seller）→ 次のオーナー（buyer）
--   resale  : nft_sale_history_v2 の seller が自分で、issuer は自分以外（他人の NFT の転売）。受取は seller_received
--   purchase: nft_sale_history_v2 の buyer が自分（自己発行の買い戻しを含む）。支出は buyer_paid
--   transfer: 上の売買のうち、0 での受け渡し（sale_type が transfer か、買い手の支払いが 0）。
--             売買ではないので、販売数・購入者数・受取・支出の合計には入れない
--   payment : nft_payment_v2      の destination が自分。払った人 → 自分。受取は delivered
--   launchpad_revenue: payment のうち、送り元が rNqn2fbyCKJvG2vDjWft1fjR2dV9tfptU2 で memo が 'ALP issuer revenue payment'（ローンチパッドの収益）
--   payment_out: nft_payment_v2   の account が自分。自分 → 送り先。支出は sender_spent（実際に出ていった額）
--
-- 自分の対象アドレスどうしのやり取り（売り手と買い手、送り元と送り先がどちらも自分）は、受取にも支出にも入れない。
-- 種類の指定（p_kinds）は行の種類と同じ名前。ただしミントは 'manual' と 'launchpad' に分けて選ぶ。
-- settlement_status が exact でない行は一覧には出すが、合計からは外す（画面で「未確定」と出す）。
--
-- 金額は通貨ごとに扱う。XRP は drops を XRP 単位に直し currency = 'XRP'、
-- IOU は currency と currency_issuer、MPT は currency = 'MPT' と currency_issuer = issuance id。
--
-- サーバー（service_role）からだけ呼ぶ。台帳の公開情報なので、ログイン中なら任意のアドレスを渡してよい。


-- 以前の版（アドレス1つ・絞り込み無し）の関数を消す
DROP FUNCTION IF EXISTS public.owner_note_activity(text, timestamptz, text, integer);
DROP FUNCTION IF EXISTS public.owner_note_activity_summary(text);
DROP FUNCTION IF EXISTS public.owner_note_activity_rows(text);
DROP FUNCTION IF EXISTS public.owner_note_activity(text[], text[], timestamptz, timestamptz, timestamptz, text, integer);
DROP FUNCTION IF EXISTS public.owner_note_activity_summary(text[], text[], timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.owner_note_activity_rows(text[], text[], timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.owner_note_activity(text[], text[], timestamptz, timestamptz, text[], timestamptz, text, integer);
DROP FUNCTION IF EXISTS public.owner_note_activity_summary(text[], text[], timestamptz, timestamptz, text[]);
DROP FUNCTION IF EXISTS public.owner_note_activity_rows(text[], text[], timestamptz, timestamptz, text[]);
DROP FUNCTION IF EXISTS public.owner_note_activity(text[], text[], timestamptz, timestamptz, text[], boolean, timestamptz, text, integer);
DROP FUNCTION IF EXISTS public.owner_note_activity_summary(text[], text[], timestamptz, timestamptz, text[], boolean);
DROP FUNCTION IF EXISTS public.owner_note_activity_rows(text[], text[], timestamptz, timestamptz, text[], boolean);
-- 商品別・お客さま別は廃止（日別のまとめ表示に置き換えた）
DROP FUNCTION IF EXISTS public.owner_note_activity_products(text[], text[], timestamptz, timestamptz, text[], boolean, boolean);
DROP FUNCTION IF EXISTS public.owner_note_activity_customers(text[], text[], timestamptz, timestamptz, text[], boolean, boolean);
-- name 列を足したため、同じ引数の rows も作り直す
DROP FUNCTION IF EXISTS public.owner_note_activity_rows(text[], text[], timestamptz, timestamptz, text[], boolean, boolean);


-- 金額の列の組を (currency, currency_issuer, amount) にそろえる
CREATE OR REPLACE FUNCTION public.owner_note_amount(
    p_drops bigint, p_currency text, p_value numeric, p_issuer text, p_mpt text
) RETURNS TABLE (currency text, currency_issuer text, amount numeric)
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select
    case
      when p_drops is not null then 'XRP'
      when p_mpt is not null then 'MPT'
      else p_currency
    end,
    case
      when p_drops is not null then null
      when p_mpt is not null then p_mpt
      else p_issuer
    end,
    case
      when p_drops is not null then p_drops::numeric / 1000000
      else p_value
    end;
$$;


-- uri_cache のキー（大文字の hex）にそろえる。DB の uri は生の hex のこともデコード済みのこともある
CREATE OR REPLACE FUNCTION public.owner_note_uri_key(p_uri text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case
    when p_uri is null then null
    when p_uri ~ '^[0-9A-Fa-f]+$' and length(p_uri) % 2 = 0 then upper(p_uri)
    else upper(encode(convert_to(p_uri, 'UTF8'), 'hex'))
  end;
$$;


-- NFT 名（uri_cache.metadata の name）。無ければ null
CREATE OR REPLACE FUNCTION public.owner_note_nft_name(p_uri text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select nullif(trim(c.metadata ->> 'name'), '')
  from public.uri_cache c
  where c.uri = public.owner_note_uri_key(p_uri);
$$;


-- 一覧の元になる行（mint / sale / payment をそろえた形）。
-- p_kinds が null ならすべての種類（'manual' / 'launchpad' / 'sale' / 'secondary' / 'resale' / 'transfer' / 'payment' / 'launchpad_revenue' / 'payment_out' / 'purchase'）、p_from 以上 p_to 未満の日時だけ（null なら制限なし）。
-- p_parties（対象者）が null でなければ、オーナーか次のオーナー（支払いなら払った人）がその誰かである行だけ。
-- p_exclude_transfers なら、転送（0 での受け渡し）を除く。
-- p_exclude_self_mints なら、手動ミント（オーナーが発行者本人のミント）を除く
CREATE OR REPLACE FUNCTION public.owner_note_activity_rows(
    p_addresses text[],
    p_kinds text[],
    p_from timestamptz,
    p_to timestamptz,
    p_parties text[],
    p_exclude_transfers boolean,
    p_exclude_self_mints boolean
)
RETURNS TABLE (
    kind text,
    -- mint のとき 'manual'（オーナーが発行者本人）か 'launchpad'（委任ミント）。ほかは null
    mint_type text,
    tx_hash text,
    tx_date timestamptz,
    nftoken_id text,
    uri text,
    name text,
    issuer text,
    from_account text,
    to_account text,
    currency text,
    currency_issuer text,
    received numeric,
    -- 支出（purchase / payment_out のとき）
    spent numeric,
    settled boolean,
    memo text
)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  -- ミント: オーナー → 次のオーナー。金額は無し
  select 'mint'::text, case when m.owner = m.issuer then 'manual' else 'launchpad' end, m.tx_hash::text, m.tx_date, m.nftoken_id::text, m.uri, public.owner_note_nft_name(m.uri), m.issuer::text,
         m.owner::text, m.destination::text,
         null::text, null::text, null::numeric, null::numeric,
         true, m.memo
  from public.nft_mint_history m
  where m.issuer = any(p_addresses)
    -- 種類の指定ではミントを 'manual'（手動ミント）と 'launchpad'（ローンチパッド）に分けて選ぶ
    and (p_kinds is null or (case when m.owner = m.issuer then 'manual' else 'launchpad' end) = any(p_kinds))
    and (p_from is null or m.tx_date >= p_from)
    and (p_to is null or m.tx_date < p_to)
    and (p_parties is null or m.owner = any(p_parties) or m.destination = any(p_parties))
    and not (coalesce(p_exclude_self_mints, false) and m.owner = m.issuer)

  union all

  -- 売買: 自分との関わり方で種類を分ける
  --   0 での受け渡し → transfer / 自分が買い手 → purchase（支出）/
  --   自分が発行者 → 自分が売り手なら sale（一次）、そうでなければ secondary（二次）/ それ以外（自分が売り手）→ resale
  --   受取は、自分が売り手なら売り手の受取、自分が発行者ならロイヤリティ
  select k.kind, null::text, s.tx_hash::text, s.tx_date, s.nftoken_id::text, s.uri, public.owner_note_nft_name(s.uri), s.issuer::text,
         s.seller::text, s.buyer::text,
         paid.currency, paid.currency_issuer,
         case when k.kind = 'purchase' or paid.amount is null then null else
           coalesce(case when me.i_sell then seller_amt.amount end, 0)
           + coalesce(case when me.i_issue then royalty.amount end, 0)
         end,
         case when k.kind = 'purchase' then paid.amount end,
         s.settlement_status = 'exact', s.memo
  from public.nft_sale_history_v2 s
  cross join lateral public.owner_note_amount(
    s.buyer_paid_drops, s.buyer_paid_currency, s.buyer_paid_value,
    s.buyer_paid_issuer, s.buyer_paid_mpt_issuance_id) paid
  cross join lateral public.owner_note_amount(
    s.seller_received_drops, s.seller_received_currency, s.seller_received_value,
    s.seller_received_issuer, s.seller_received_mpt_issuance_id) seller_amt
  cross join lateral public.owner_note_amount(
    s.royalty_received_drops, s.royalty_received_currency, s.royalty_received_value,
    s.royalty_received_issuer, s.royalty_received_mpt_issuance_id) royalty
  cross join lateral (
    select s.seller = any(p_addresses) as i_sell,
           s.buyer = any(p_addresses) as i_buy,
           s.issuer = any(p_addresses) as i_issue,
           -- 0 での受け渡しは転送
           coalesce(s.sale_type = 'transfer' or paid.amount = 0, false) as is_transfer
  ) me
  cross join lateral (
    select case
             when me.is_transfer then 'transfer'
             when me.i_buy then 'purchase'
             when me.i_issue and me.i_sell then 'sale'
             when me.i_issue then 'secondary'
             else 'resale'
           end as kind
  ) k
  where (me.i_issue or me.i_sell or me.i_buy)
    -- 自分の対象アドレスどうしの売買は除く
    and not (me.i_sell and me.i_buy)
    and (p_kinds is null or k.kind = any(p_kinds))
    and (p_from is null or s.tx_date >= p_from)
    and (p_to is null or s.tx_date < p_to)
    and (p_parties is null or s.seller = any(p_parties) or s.buyer = any(p_parties))
    and not (coalesce(p_exclude_transfers, false) and me.is_transfer)

  union all

  -- 支払い: 自分宛て（payment, 受取は届いた額）と、自分が送ったもの（payment_out, 支出は出ていった額）
  -- 自分宛てのうちローンチパッドからの収益の支払いは launchpad_revenue
  select k.kind, null::text, p.tx_hash::text, p.tx_date,
         null::text, null::text, null::text, null::text,
         p.account::text, p.destination::text,
         case when me.i_recv then delivered.currency else out_amt.currency end,
         case when me.i_recv then delivered.currency_issuer else out_amt.currency_issuer end,
         case when me.i_recv then delivered.amount end,
         case when me.i_recv then null else out_amt.amount end,
         p.settlement_status = 'exact', p.memo
  from public.nft_payment_v2 p
  cross join lateral public.owner_note_amount(
    p.delivered_drops, p.delivered_currency, p.delivered_value,
    p.delivered_issuer, p.delivered_mpt_issuance_id) delivered
  cross join lateral public.owner_note_amount(
    p.sender_spent_drops, p.sender_spent_currency, p.sender_spent_value,
    p.sender_spent_issuer, p.sender_spent_mpt_issuance_id) out_amt
  cross join lateral (
    select p.destination = any(p_addresses) as i_recv,
           p.account = any(p_addresses) as i_send
  ) me
  cross join lateral (
    select case
             when not me.i_recv then 'payment_out'
             when p.account = 'rNqn2fbyCKJvG2vDjWft1fjR2dV9tfptU2' and p.memo = 'ALP issuer revenue payment' then 'launchpad_revenue'
             else 'payment'
           end as kind
  ) k
  where (me.i_recv or me.i_send)
    -- 自分の対象アドレスどうしの送金は除く
    and not (me.i_recv and me.i_send)
    and (p_kinds is null or k.kind = any(p_kinds))
    and (p_from is null or p.tx_date >= p_from)
    and (p_to is null or p.tx_date < p_to)
    and (p_parties is null or p.account = any(p_parties) or p.destination = any(p_parties));
$$;


-- 一覧。新しい順で、(tx_date, tx_hash) をカーソルにしてページ分けする
CREATE OR REPLACE FUNCTION public.owner_note_activity(
    p_addresses text[],
    p_kinds text[] DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_parties text[] DEFAULT NULL,
    p_exclude_transfers boolean DEFAULT false,
    p_exclude_self_mints boolean DEFAULT false,
    p_before_date timestamptz DEFAULT NULL,
    p_before_hash text DEFAULT NULL,
    p_limit integer DEFAULT 50
) RETURNS SETOF json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select row_to_json(r)
  from public.owner_note_activity_rows(p_addresses, p_kinds, p_from, p_to, p_parties, p_exclude_transfers, p_exclude_self_mints) r
  where p_before_date is null
     or (r.tx_date, r.tx_hash) < (p_before_date, coalesce(p_before_hash, ''))
  order by r.tx_date desc, r.tx_hash desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;


-- 集計。一覧と同じ絞り込みで、確定した（settled）受取と支出を通貨ごとに合計する。
-- あわせて対象者（オーナー・次のオーナー・払った人として登場した相手）を、登場の多い順に上位 50 まで返す。
-- 対象者の一覧は、絞り込みに使うものなので対象者での絞り込みはかけない。自分の対象アドレスは除く。
-- received はその相手が関わった取引で自分に入った額（通貨ごと、確定分のみ）
CREATE OR REPLACE FUNCTION public.owner_note_activity_summary(
    p_addresses text[],
    p_kinds text[] DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_parties text[] DEFAULT NULL,
    p_exclude_transfers boolean DEFAULT false,
    p_exclude_self_mints boolean DEFAULT false
) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with act as (
    select * from public.owner_note_activity_rows(p_addresses, p_kinds, p_from, p_to, p_parties, p_exclude_transfers, p_exclude_self_mints)
  ),
  act_all as (
    select * from public.owner_note_activity_rows(p_addresses, p_kinds, p_from, p_to, null, p_exclude_transfers, p_exclude_self_mints)
  ),
  party_rows as (
    select r.from_account as address, 'owner'::text as role, r.currency, r.currency_issuer, r.received, r.settled
    from act_all r
    where r.from_account is not null and not (r.from_account = any(p_addresses))
    union all
    select r.to_account, 'next'::text, r.currency, r.currency_issuer, r.received, r.settled
    from act_all r
    where r.to_account is not null and not (r.to_account = any(p_addresses))
  ),
  party_counts as (
    select address,
           count(*) filter (where role = 'owner') as owner_count,
           count(*) filter (where role = 'next') as next_owner_count,
           count(*) as total
    from party_rows group by address
  ),
  party_received as (
    select address,
           json_agg(json_build_object('currency', currency, 'currency_issuer', currency_issuer, 'received', total)
                    order by total desc) as received
    from (
      select address, currency, currency_issuer, sum(received) as total
      from party_rows
      where settled and currency is not null and received is not null
      group by address, currency, currency_issuer
    ) x
    group by address
  ),
  parties as (
    select c.address, c.owner_count, c.next_owner_count, coalesce(pr.received, '[]'::json) as received,
           row_number() over (order by c.total desc, c.address) as rn
    from party_counts c
    left join party_received pr on pr.address = c.address
  )
  select json_build_object(
    'currencies', coalesce((
      select json_agg(c order by c.received desc, c.spent desc)
      from (
        select r.currency,
               r.currency_issuer,
               coalesce(sum(r.received), 0) as received,
               coalesce(sum(r.spent), 0) as spent,
               count(*) filter (where r.kind in ('sale', 'secondary')) as sale_count,
               count(*) filter (where r.kind = 'payment') as payment_count
        from act r
        where r.kind in ('sale', 'secondary', 'resale', 'payment', 'launchpad_revenue', 'purchase', 'payment_out') and r.settled and r.currency is not null
        group by r.currency, r.currency_issuer
      ) c
    ), '[]'::json),
    -- 販売数はローンチパッド（委任ミント）を含む。ミントは手動とローンチパッドに分ける
    'manual_mint_count', (select count(*) from act where kind = 'mint' and mint_type = 'manual'),
    'launchpad_mint_count', (select count(*) from act where kind = 'mint' and mint_type = 'launchpad'),
    'sale_count', (select count(*) from act where kind in ('sale', 'secondary') or (kind = 'mint' and mint_type = 'launchpad')),
    'payment_count', (select count(*) from act where kind = 'payment'),
    'launchpad_revenue_count', (select count(*) from act where kind = 'launchpad_revenue'),
    'primary_count', (select count(*) from act where kind = 'sale'),
    'secondary_count', (select count(*) from act where kind = 'secondary'),
    'transfer_count', (select count(*) from act where kind = 'transfer'),
    'resale_count', (select count(*) from act where kind = 'resale'),
    -- 送金（自分が送った Payment）と購入（自分が NFT を買った）
    'payment_out_count', (select count(*) from act where kind = 'payment_out'),
    'purchase_count', (select count(*) from act where kind = 'purchase'),
    'buyer_count', (select count(distinct to_account) from act where (kind in ('sale', 'secondary') or (kind = 'mint' and mint_type = 'launchpad')) and to_account is not null),
    -- 購入者数の内訳（一次・二次・ローンチパッドそれぞれの重複なしの人数。同じ人が複数に入りうるので足しても全体にはならない）
    'primary_buyer_count', (select count(distinct to_account) from act where kind = 'sale' and to_account is not null),
    'secondary_buyer_count', (select count(distinct to_account) from act where kind = 'secondary' and to_account is not null),
    'launchpad_buyer_count', (select count(distinct to_account) from act where kind = 'mint' and mint_type = 'launchpad' and to_account is not null),
    'payer_count', (select count(distinct from_account) from act where kind = 'payment'),
    'unsettled_count', (select count(*) from act where kind in ('sale', 'secondary', 'resale', 'payment', 'launchpad_revenue', 'purchase', 'payment_out') and not settled),
    -- 種類ごとの XRP の受取・支出（確定分）。KPI の収益・支出の内訳に使う
    'xrp_by_kind', coalesce((
      select json_object_agg(x.kind, json_build_object('received', x.received, 'spent', x.spent))
      from (
        select r.kind, coalesce(sum(r.received), 0) as received, coalesce(sum(r.spent), 0) as spent
        from act r
        where r.kind in ('sale', 'secondary', 'resale', 'payment', 'launchpad_revenue', 'purchase', 'payment_out')
          and r.settled and r.currency = 'XRP'
        group by r.kind
      ) x
    ), '{}'::json),
    'parties', coalesce((
      select json_agg(json_build_object(
               'address', address,
               'owner_count', owner_count,
               'next_owner_count', next_owner_count,
               'received', received) order by rn)
      from parties where rn <= 50
    ), '[]'::json)
  );
$$;


-- 日別。p_tz（画面のタイムゾーン）での日付ごとに、受取・支出（通貨ごと、確定分）と件数を返す。新しい日から
CREATE OR REPLACE FUNCTION public.owner_note_activity_daily(
    p_addresses text[],
    p_kinds text[] DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_parties text[] DEFAULT NULL,
    p_exclude_transfers boolean DEFAULT false,
    p_exclude_self_mints boolean DEFAULT false,
    p_tz text DEFAULT 'UTC'
) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with act as (
    select r.*, (r.tx_date at time zone p_tz)::date as day
    from public.owner_note_activity_rows(p_addresses, p_kinds, p_from, p_to, p_parties, p_exclude_transfers, p_exclude_self_mints) r
  ),
  days as (
    select day,
           count(*) filter (where kind = 'mint' and mint_type = 'manual') as manual_mint_count,
           count(*) filter (where kind = 'mint' and mint_type = 'launchpad') as launchpad_mint_count,
           count(*) filter (where kind in ('sale', 'secondary') or (kind = 'mint' and mint_type = 'launchpad')) as sale_count,
           count(*) filter (where kind = 'payment') as payment_count,
           count(*) filter (where kind = 'transfer') as transfer_count,
           count(*) filter (where kind = 'resale') as resale_count,
           count(*) filter (where kind in ('purchase', 'payment_out')) as expense_count,
           count(distinct to_account) filter (where (kind in ('sale', 'secondary') or (kind = 'mint' and mint_type = 'launchpad')) and to_account is not null) as buyer_count,
           -- その日の購入者（自分の対象アドレスは除く）。画面で @X アカウントにしてまとめてコピーする
           coalesce(array_agg(distinct to_account) filter (where (kind in ('sale', 'secondary') or (kind = 'mint' and mint_type = 'launchpad')) and to_account is not null and not (to_account = any(p_addresses))), '{}') as buyers
    from act group by day
  ),
  day_received as (
    -- 通貨ごとの受取と支出（確定分）
    select day,
           json_agg(json_build_object('currency', currency, 'currency_issuer', currency_issuer,
                                      'received', total_received, 'spent', total_spent)
                    order by total_received desc, total_spent desc) as received
    from (
      select day, currency, currency_issuer,
             coalesce(sum(received), 0) as total_received,
             coalesce(sum(spent), 0) as total_spent
      from act
      where kind in ('sale', 'secondary', 'resale', 'payment', 'launchpad_revenue', 'purchase', 'payment_out') and settled and currency is not null
      group by day, currency, currency_issuer
    ) x
    group by day
  )
  select coalesce(json_agg(json_build_object(
           'day', d.day,
           'manual_mint_count', d.manual_mint_count,
           'launchpad_mint_count', d.launchpad_mint_count,
           'sale_count', d.sale_count,
           'payment_count', d.payment_count,
           'transfer_count', d.transfer_count,
           'resale_count', d.resale_count,
           'expense_count', d.expense_count,
           'buyer_count', d.buyer_count,
           'buyers', d.buyers,
           'received', coalesce(r.received, '[]'::json)) order by d.day desc), '[]'::json)
  from days d
  left join day_received r on r.day = d.day;
$$;


-- 月別。p_tz（画面のタイムゾーン）での月ごとに、受取・支出（通貨ごと、確定分）と件数を返す。古い月から。
-- チャート用。範囲は p_from / p_to で区切る（画面は直近 12 か月を渡す）
CREATE OR REPLACE FUNCTION public.owner_note_activity_monthly(
    p_addresses text[],
    p_kinds text[] DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_parties text[] DEFAULT NULL,
    p_exclude_transfers boolean DEFAULT false,
    p_exclude_self_mints boolean DEFAULT false,
    p_tz text DEFAULT 'UTC'
) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with act as (
    select r.*, to_char(r.tx_date at time zone p_tz, 'YYYY-MM') as month
    from public.owner_note_activity_rows(p_addresses, p_kinds, p_from, p_to, p_parties, p_exclude_transfers, p_exclude_self_mints) r
  ),
  months as (
    select month,
           count(*) filter (where kind = 'mint' and mint_type = 'manual') as manual_mint_count,
           count(*) filter (where kind = 'mint' and mint_type = 'launchpad') as launchpad_mint_count,
           count(*) filter (where kind in ('sale', 'secondary') or (kind = 'mint' and mint_type = 'launchpad')) as sale_count,
           count(*) filter (where kind = 'payment') as payment_count,
           count(*) filter (where kind = 'transfer') as transfer_count,
           count(*) filter (where kind = 'resale') as resale_count,
           count(*) filter (where kind in ('purchase', 'payment_out')) as expense_count,
           count(distinct to_account) filter (where (kind in ('sale', 'secondary') or (kind = 'mint' and mint_type = 'launchpad')) and to_account is not null) as buyer_count
    from act group by month
  ),
  month_received as (
    -- 通貨ごとの受取と支出（確定分）
    select month,
           json_agg(json_build_object('currency', currency, 'currency_issuer', currency_issuer,
                                      'received', total_received, 'spent', total_spent)
                    order by total_received desc, total_spent desc) as received
    from (
      select month, currency, currency_issuer,
             coalesce(sum(received), 0) as total_received,
             coalesce(sum(spent), 0) as total_spent
      from act
      where kind in ('sale', 'secondary', 'resale', 'payment', 'launchpad_revenue', 'purchase', 'payment_out') and settled and currency is not null
      group by month, currency, currency_issuer
    ) x
    group by month
  )
  select coalesce(json_agg(json_build_object(
           'month', m.month,
           'manual_mint_count', m.manual_mint_count,
           'launchpad_mint_count', m.launchpad_mint_count,
           'sale_count', m.sale_count,
           'payment_count', m.payment_count,
           'transfer_count', m.transfer_count,
           'resale_count', m.resale_count,
           'expense_count', m.expense_count,
           'buyer_count', m.buyer_count,
           'received', coalesce(r.received, '[]'::json)) order by m.month), '[]'::json)
  from months m
  left join month_received r on r.month = m.month;
$$;


-- 月別の表示（作品ごと・購入者ごと）。一覧と同じ絞り込みで、期間（ふつうは 1 か月）の行をまとめる。
--   groups: NFT のある行。p_by = 'buyer' なら種類と相手、それ以外（'artwork'）なら種類と作品が同じものを 1 つにする。
--           相手は、購入（purchase）なら売り手、それ以外は次のオーナー。作品は NFT 名（完全一致）、名前が無ければ uri。
--           作品の一覧（artworks）は新しい順に 16 点まで（同じ作品は 1 点）
--   others: NFT の無い行（着金・ローンチパッドの収益・送金）。種類と相手（着金などは払った人、送金は送り先）でまとめる
-- 並びは、作品ごとなら件数の多い順（同じなら新しい順）。購入者ごと（と others）なら同じ相手を続けて並べ、
-- 相手は件数の合計の多い順、相手の中は件数の多い順。どちらも 200 まで。金額は通貨ごとの確定分（受取・支出）。
-- まとまりの中の行は owner_note_activity_group_rows で引く（同じキーの作り方: owner_note_activity_group_key）。

-- 行の相手。購入は売り手、着金・ローンチパッドの収益は払った人、それ以外（販売・ミント・送金など）は次のオーナー・送り先
CREATE OR REPLACE FUNCTION public.owner_note_activity_party(p_kind text, p_from_account text, p_to_account text)
RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case when p_kind in ('purchase', 'payment', 'launchpad_revenue') then p_from_account else p_to_account end;
$$;

-- まとまりのキー。種類（ミントは手動・ローンチパッドも）と、NFT の無い行か p_by = 'buyer' なら相手、それ以外は作品
CREATE OR REPLACE FUNCTION public.owner_note_activity_group_key(
    p_kind text, p_mint_type text, p_nftoken_id text, p_from_account text, p_to_account text,
    p_name text, p_uri text, p_by text
) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select p_kind || ':' || coalesce(p_mint_type, '') || '|' ||
         case
           when p_nftoken_id is null or p_by = 'buyer'
             then coalesce(public.owner_note_activity_party(p_kind, p_from_account, p_to_account), '')
           when p_name is not null then 'name:' || p_name
           else 'uri:' || coalesce(p_uri, '')
         end;
$$;

CREATE OR REPLACE FUNCTION public.owner_note_activity_groups(
    p_addresses text[],
    p_kinds text[] DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_parties text[] DEFAULT NULL,
    p_exclude_transfers boolean DEFAULT false,
    p_exclude_self_mints boolean DEFAULT false,
    p_by text DEFAULT 'artwork'
) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with act as (
    select r.*,
           public.owner_note_activity_party(r.kind, r.from_account, r.to_account) as party,
           case when r.name is not null then 'name:' || r.name else 'uri:' || coalesce(r.uri, '') end as product
    from public.owner_note_activity_rows(p_addresses, p_kinds, p_from, p_to, p_parties, p_exclude_transfers, p_exclude_self_mints) r
  ),
  keyed as (
    select a.*,
           public.owner_note_activity_group_key(a.kind, a.mint_type, a.nftoken_id, a.from_account, a.to_account,
                                                a.name, a.uri, p_by) as gid
    from act a
    where a.nftoken_id is not null or a.kind in ('payment', 'launchpad_revenue', 'payment_out')
  ),
  g as (
    select k.gid,
           bool_or(k.nftoken_id is not null) as has_nft,
           min(k.kind) as kind,
           min(k.mint_type) as mint_type,
           (array_agg(k.party order by k.tx_date desc))[1] as address,
           count(*) as cnt,
           count(distinct k.party) filter (where k.party is not null and not (k.party = any(p_addresses))) as people_count,
           count(distinct k.product) filter (where k.nftoken_id is not null) as artwork_count,
           max(k.tx_date) as last_date
    from keyed k
    group by k.gid
  ),
  g_art as (
    select x.gid,
           json_agg(json_build_object('name', x.name, 'uri', x.uri, 'nftoken_id', x.nftoken_id) order by x.tx_date desc) as artworks
    from (
      select d.*, row_number() over (partition by d.gid order by d.tx_date desc) as rn
      from (
        select distinct on (k.gid, k.product) k.gid, k.product, k.name, k.uri, k.nftoken_id, k.tx_date
        from keyed k
        where k.nftoken_id is not null
        order by k.gid, k.product, k.tx_date desc
      ) d
    ) x
    where x.rn <= 16
    group by x.gid
  ),
  g_amt as (
    select y.gid,
           json_agg(json_build_object('currency', y.currency, 'currency_issuer', y.currency_issuer,
                                      'received', y.received, 'spent', y.spent)
                    order by y.received desc, y.spent desc) as amounts
    from (
      select k.gid, k.currency, k.currency_issuer,
             coalesce(sum(k.received), 0) as received,
             coalesce(sum(k.spent), 0) as spent
      from keyed k
      where k.settled and k.currency is not null and (k.received is not null or k.spent is not null)
      group by k.gid, k.currency, k.currency_issuer
    ) y
    group by y.gid
  ),
  g_party as (
    select g.*,
           sum(g.cnt) over (partition by g.has_nft, g.address) as party_total,
           max(g.last_date) over (partition by g.has_nft, g.address) as party_last
    from g
  ),
  rows_out as (
    select g.has_nft,
           row_number() over (
             partition by g.has_nft
             order by
               -- 購入者ごと（と NFT の無い行）は同じ相手を続けて、相手の合計の多い順
               case when p_by = 'buyer' or not g.has_nft then g.party_total else g.cnt end desc,
               case when p_by = 'buyer' or not g.has_nft then g.party_last else g.last_date end desc,
               case when p_by = 'buyer' or not g.has_nft then g.address end,
               g.cnt desc, g.last_date desc
           ) as rn,
           json_build_object(
             'key', g.gid,
             'kind', g.kind,
             'mint_type', g.mint_type,
             'address', g.address,
             'count', g.cnt,
             'people_count', g.people_count,
             'artwork_count', g.artwork_count,
             'last_date', g.last_date,
             'artworks', coalesce(ga.artworks, '[]'::json),
             'amounts', coalesce(gm.amounts, '[]'::json)) as j
    from g_party g
    left join g_art ga on ga.gid = g.gid
    left join g_amt gm on gm.gid = g.gid
  )
  select json_build_object(
    'groups', coalesce((select json_agg(j order by rn) from rows_out where has_nft and rn <= 200), '[]'::json),
    'others', coalesce((select json_agg(j order by rn) from rows_out where not has_nft and rn <= 200), '[]'::json)
  );
$$;


-- 月別の表示のまとまりの中の行（新しい順、500 件まで）。p_key は owner_note_activity_groups が返した key
CREATE OR REPLACE FUNCTION public.owner_note_activity_group_rows(
    p_addresses text[],
    p_kinds text[] DEFAULT NULL,
    p_from timestamptz DEFAULT NULL,
    p_to timestamptz DEFAULT NULL,
    p_parties text[] DEFAULT NULL,
    p_exclude_transfers boolean DEFAULT false,
    p_exclude_self_mints boolean DEFAULT false,
    p_by text DEFAULT 'artwork',
    p_key text DEFAULT NULL
) RETURNS SETOF json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select row_to_json(r)
  from public.owner_note_activity_rows(p_addresses, p_kinds, p_from, p_to, p_parties, p_exclude_transfers, p_exclude_self_mints) r
  where (r.nftoken_id is not null or r.kind in ('payment', 'launchpad_revenue', 'payment_out'))
    and public.owner_note_activity_group_key(r.kind, r.mint_type, r.nftoken_id, r.from_account, r.to_account,
                                             r.name, r.uri, p_by) = p_key
  order by r.tx_date desc, r.tx_hash desc
  limit 500;
$$;


-- 実行権限。中の関数（amount / rows）は SECURITY DEFINER の外側からだけ使う
revoke execute on function public.owner_note_amount(bigint, text, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.owner_note_uri_key(text) from public, anon, authenticated;
revoke execute on function public.owner_note_nft_name(text) from public, anon, authenticated;
revoke execute on function public.owner_note_activity_rows(text[], text[], timestamptz, timestamptz, text[], boolean, boolean) from public, anon, authenticated;
revoke execute on function public.owner_note_activity(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, timestamptz, text, integer) from public, anon, authenticated;
revoke execute on function public.owner_note_activity_summary(text[], text[], timestamptz, timestamptz, text[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.owner_note_activity(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, timestamptz, text, integer) to service_role;
grant execute on function public.owner_note_activity_summary(text[], text[], timestamptz, timestamptz, text[], boolean, boolean) to service_role;
revoke execute on function public.owner_note_activity_daily(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.owner_note_activity_daily(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, text) to service_role;
revoke execute on function public.owner_note_activity_monthly(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.owner_note_activity_monthly(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, text) to service_role;
revoke execute on function public.owner_note_activity_groups(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.owner_note_activity_groups(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, text) to service_role;
revoke execute on function public.owner_note_activity_party(text, text, text) from public, anon, authenticated;
revoke execute on function public.owner_note_activity_group_key(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.owner_note_activity_group_rows(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, text, text) from public, anon, authenticated;
grant execute on function public.owner_note_activity_group_rows(text[], text[], timestamptz, timestamptz, text[], boolean, boolean, text, text) to service_role;
