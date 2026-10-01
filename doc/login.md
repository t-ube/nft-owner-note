# ログインの仕様

Xaman と Joey（WalletConnect）でログインできる。どちらも「サーバーが出した使い捨てのお題に、本人の鍵で署名してもらう」形で、本人のアドレスを確かめる。
台帳に書き込むものは無く、手数料もかからない。

- **Xaman**: SignIn ペイロード（XRPL に送られない疑似トランザクション）に署名してもらい、サーバーが Xaman API から結果を引く。
- **Joey**: サーバーが出したチャレンジを Memo に入れた、**台帳に載り得ない**トランザクションに署名だけしてもらい、サーバーが署名を検証する。

ログインに成功すると、どちらも同じセッション Cookie（`on_session`）を受け取る。

## 旧方式の廃止

以下は危険なため廃止した。利用者がいないため移行措置は取らない。

| 廃止したもの | 理由 |
|---|---|
| `/api/auth/joey/verify`（旧） | 署名と `Account` の一致しか見ておらず、チャレンジも tx の種類も新しさも確かめていなかった。台帳にある過去の tx を拾って送るだけで、任意のアドレスとしてログインできた |
| `/api/auth/xaman/verify` | ブラウザから受け取った Xumm の JWT をアドレスの根拠にしていた。発行元アプリの確認も、値が無いときは素通りする作りだった |
| `/api/auth/sync/session` / `/api/auth/sync/logout` | 上の2つのセッション用 |
| `sync_token` Cookie / `sync_sessions` テーブル / `src/lib/auth/syncSession.ts` | 同上 |
| `SyncSessionContext` の `xumm.authorize()`（PKCE）と `resumePkce()` | ログインを Xaman SDK のブラウザ側の状態に頼らない |
| ブラウザ側の Xumm SDK（`src/lib/xumm/client.ts` の `getXumm()`、`XamanContext` の `new Xumm()`） | 取引の署名もサーバーでペイロードを作る形に移す（「取引の署名（Xaman）」） |

新しい `/api/auth/joey/verify` は旧と同じパスだが、チャレンジ必須の別物。

## 登場するもの

ファイルはこの仕様に沿って作る予定のもの。名前は実装時に変わってもよいが、役割の分け方は守る。

| ファイル | 役割 |
|---|---|
| `src/components/XamanLogin.tsx` | Xaman のログインボタンと、PC 用の QR ダイアログ |
| `src/lib/auth/session-client.ts` | 画面側のログイン状態と API 呼び出し |
| `src/app/api/auth/*/route.ts` | `/api/auth/*` |
| `src/app/api/xaman/webhook/route.ts` | `/api/xaman/webhook` |
| `src/app/api/xaman/payload/**/route.ts` | `/api/xaman/payload`（取引の署名） |
| `src/lib/auth/xaman.ts` | Xaman Platform API。API Secret を持つのはここだけ（サーバー専用） |
| `src/lib/auth/joey.ts` | Joey 用チャレンジ tx の組み立てと検証（サーバー専用） |
| `src/lib/auth/session.ts` | Cookie の署名と検証（HMAC-SHA256、サーバー専用） |
| `src/lib/auth/supabase-admin.ts` | Supabase RPC（`owner_note_login` / `owner_note_touch_token`）。service_role キーを使う（サーバー専用） |
| `src/query/account.sql` | `owner_note.account` と `owner_note.push_token` |

サーバー専用のモジュールはクライアントコンポーネントから import しない。

## 環境変数

| 名前 | 用途 |
|---|---|
| `SESSION_SECRET` | `on_login` / `on_session` の署名鍵 |
| `XAMAN_API_KEY` / `XAMAN_API_SECRET` | Xaman Platform API |
| `SUPABASE_SERVICE_ROLE_KEY` | RPC 呼び出し。`NEXT_PUBLIC_` を付けない |

## Cookie

| 名前 | 中身 | 寿命 |
|---|---|---|
| `on_login` | 待ち受け中のお題と、その HMAC 署名。Xaman はペイロード uuid、Joey はチャレンジ。どちらの経路のものかも入れる | 5分 |
| `on_session` | JWT（HS256）。中身はアドレス（`sub`）、経路（`wallet`: `xaman` / `joey`）、`iat` / `exp` だけ | 30日。残り7日を切ったら `/api/auth/me` で発行し直す |

どちらも `HttpOnly; SameSite=Lax; Path=/` で、https のときだけ `Secure` を付ける。
サーバー側にセッションは持たない。個別に失効はできず、全員を落とすときは `SESSION_SECRET` を差し替える。

`on_login` は経路をまたいで使えない。Xaman 用の `on_login` で Joey の verify は通らず、その逆も同じ。

## API

| メソッド | パス | 用途 | 応答 |
|---|---|---|---|
| POST | `/api/auth/login?lang=` | Xaman・PC 用。ペイロードを作る（戻り先なし） | 200 `{uuid, link, qr, ws}` と `on_login` |
| GET | `/api/auth/start?lang=` | Xaman・スマホ用。ペイロードを作って Xaman へ転送（戻り先あり） | 302 → Xaman と `on_login`。失敗時は 302 → `/{lang}?login=failed` |
| POST | `/api/auth/verify` | Xaman。`on_login` の uuid の署名結果を確かめる | 下表 |
| POST | `/api/auth/joey/challenge` | Joey。本文 `{address}` に対し、署名してもらう tx を作る | 200 `{tx_json}` と `on_login` |
| POST | `/api/auth/joey/verify` | Joey。本文 `{tx_json}`（署名済み）を確かめる | 下表 |
| GET | `/api/auth/me` | 今のログイン状態 | 200 `{account, wallet}`（未ログインは `account: null`） |
| POST | `/api/auth/logout` | 両方の Cookie を消す | 200 `{ok: true}` |
| POST | `/api/xaman/webhook` | Xaman からの通知で user_token を更新 | 常に 200 |
| POST | `/api/xaman/payload` | 取引の署名用ペイロードを作る | 「取引の署名（Xaman）」を参照 |
| GET | `/api/xaman/payload/{uuid}` | 取引の署名結果を確かめる | 同上 |

`lang` は `en` / `ja`。それ以外は `en` として扱う。

`/api/auth/verify`（Xaman）の応答:

| 状態 | 応答 |
|---|---|
| `on_login` が無い・壊れている・Xaman 用でない | 401 `no_pending_login` |
| ペイロードが見つからない | 404 `unknown_payload` |
| 期限切れ・キャンセル・拒否 | 409 `declined`（`on_login` を消す） |
| まだ署名されていない | 202 `pending` |
| アドレスが取れない | 502 `no_account` |
| Supabase への保存に失敗 | 502 `save_failed`（セッションは出さない） |
| 成功 | 200 `{account, push}`。`on_login` を消し `on_session` を発行 |

`/api/auth/joey/verify` の応答:

| 状態 | 応答 |
|---|---|
| `on_login` が無い・壊れている・期限切れ・Joey 用でない | 401 `no_pending_login` |
| tx が下の「Joey のチャレンジ tx」の形と違う | 400 `bad_tx` |
| チャレンジが `on_login` のものと違う | 400 `challenge_mismatch` |
| `Account` が challenge を出したときのアドレスと違う | 400 `account_mismatch` |
| 署名が正しくない、または `SigningPubKey` から導いたアドレスが `Account` と違う | 400 `bad_signature` |
| Supabase への保存に失敗 | 502 `save_failed`（セッションは出さない） |
| 成功 | 200 `{account}`。`on_login` を消し `on_session` を発行 |

共通:

- `SESSION_SECRET` が無いと 503 `not_configured`。Xaman の経路は `XAMAN_API_KEY` / `XAMAN_API_SECRET` も必要
- POST は `Origin` が自サイトでなければ 403 `cross_origin`。`Origin` が無い POST も拒否する（webhook を除く）
- POST の本文は `Content-Type: application/json` のときだけ受け付ける（`<form enctype="text/plain">` からの送信を弾く）
- 応答はすべて `Cache-Control: no-store`。Route Handler は動的に扱い、キャッシュさせない
- エラー応答に例外のメッセージ・スタック・DB のエラー内容を載せない。詳細はサーバーのログにだけ出す
- `/api/*` はロケールのリダイレクト（`middleware.ts`）の対象外にする

## Joey のチャレンジ tx

サーバーが組み立てて返し、ブラウザは中身を変えずに Joey に渡す。

```json
{
  "TransactionType": "AccountSet",
  "Account": "<challenge で受け取ったアドレス>",
  "Fee": "0",
  "Sequence": 0,
  "LastLedgerSequence": 1,
  "Memos": [{
    "Memo": {
      "MemoType": "<'owner-note/login' の hex>",
      "MemoData": "<'<ホスト名> <チャレンジ>' の hex>"
    }
  }]
}
```

- Joey には `options: { autofill: false, submit: false }` で渡す。自動補完させると `Fee` / `Sequence` / `LastLedgerSequence` が本物の値に書き換わり、送信できる tx になってしまう。
- `Fee: "0"`、`LastLedgerSequence: 1`（とうに過ぎた台帳）なので、署名済みの tx が漏れても台帳には載らない。
- チャレンジは 32 バイトの乱数。`on_login` に、チャレンジ・アドレス・期限を入れて署名する。
- MemoData にホスト名を入れるのは、署名の画面で「どこへのログインか」が読めるようにするため。

verify で確かめること（すべて満たしたときだけ通す）:

1. `on_login` が正しく署名されていて、Joey 用で、期限内
2. `TransactionType` / `Fee` / `Sequence` / `LastLedgerSequence` / `Memos` が上の形のとおりで、余計なフィールドが無い（`SigningPubKey` / `TxnSignature` を除く）
3. MemoData が `<自分のホスト名> <on_login のチャレンジ>` と一致する
4. `Account` が `on_login` のアドレスと一致する
5. 署名が `SigningPubKey` で検証でき、`deriveAddress(SigningPubKey) === Account`

チャレンジはブラウザに結び付いた `on_login` の中にしか無いので、台帳にある過去の tx や、他のブラウザで作られた署名は通らない。成功したら `on_login` を消す。

**未確認**: Joey が XRPL のメッセージ署名（tx ではない任意の文字列への署名）に対応しているなら、tx を使わずそちらで同じことをするほうがよい。対応状況を Joey のドキュメントで確かめてから決める。
なお、レギュラーキーやマルチシグで運用しているアカウントは、マスターキーで署名しない限りこの方式ではログインできない（`deriveAddress(SigningPubKey) === Account` を満たさないため）。

## 流れ

### Xaman・PC（QR）

1. ログインボタン → ダイアログを開き、`POST /api/auth/login`
2. QR を表示。スマホの Xaman で読み取って署名する
3. 画面は Xaman の WebSocket と3秒ごとのポーリングの両方で `POST /api/auth/verify` を呼ぶ
4. 200 が返ればダイアログを閉じる。5分で期限切れにする

ペイロードに戻り先を付けないので、署名したスマホ側でブラウザは開かない。

### Xaman・スマホ（同じ端末）

判定は `matchMedia("(pointer: coarse)")`。

1. ログインボタン → `sessionStorage` に開始時刻を置き、`/api/auth/start` へページ遷移
2. サーバーがペイロードを作り、`on_login` を付けて Xaman のリンクへ 302
3. 署名後、Xaman が `/{lang}?login=xaman` に戻す → 読み込み時に `verify`
4. Xaman が戻さずアプリ切り替えで戻った場合も、開始から5分以内なら画面が見えた時点で `verify`

タップから Xaman までを1回のページ遷移にしているのは、fetch を挟むとユーザー操作の扱いが切れてアプリが開かないため。
失敗・拒否の理由はログインボタンの横に出す。

戻り先は localhost では付けない（スマホから見た localhost は自分自身になる）。

### Joey

接続（WalletConnect）とログインは別の段階。接続しただけではログインにならない。

1. Joey を接続する（今の `joeyConnect` のまま）
2. ログインボタン → `POST /api/auth/joey/challenge`（本文は接続中のアドレス）
3. 返ってきた `tx_json` を `signTransaction` に `autofill: false, submit: false` で渡す
4. 署名済みの `tx_json` を `POST /api/auth/joey/verify` に送る
5. 200 が返ればログイン完了

接続中のアドレスと `on_session` のアドレスが違うとき（Joey 側でアカウントを切り替えたとき）は、ログインしていない扱いにして、もう一度ログインボタンを出す。

## ログアウト

- `POST /api/auth/logout` で `on_login` と `on_session` を消す。
- Joey のときは、あわせて WalletConnect も切断する。逆に、WalletConnect の切断だけでなく必ず logout も呼ぶ（旧方式では Cookie が残っていた）。

## 守っていること

- **アドレスはブラウザの申告をそのまま信じない。** Xaman はサーバーが自分の資格情報で `GET /payload/{uuid}` を引き、`response.account` を読む。Joey はサーバーが出したチャレンジへの署名を検証する。WebSocket の「署名された」は確認のきっかけにしか使わない。
- **お題をブラウザに結び付ける。** Xaman の uuid は QR や WebSocket の URL に載り、Joey の署名済み tx も漏れうる。知っている・持っているだけでは `verify` を通せないよう、署名付き Cookie にあるお題しか見ない。
- **署名させるものは台帳に載らない。** Xaman の SignIn は疑似トランザクション、Joey の tx は手数料 0・期限切れの形にしてある。
- **保存に失敗したらログインさせない。** user_token が貯まらないのにセッションだけ出すと、通知が届かないことに誰も気づけない。
- **Xaman に出す文言・Joey に渡す tx はサーバーが作る。** ブラウザから受け取った文字列は出さない。
- **Cookie の検証は `crypto.subtle.verify` に任せる。** 文字列比較によるタイミング攻撃を避ける。
- **秘密はサーバーにだけ置く。** API Secret・service_role キー・`SESSION_SECRET` はクライアントのバンドルに入れない。

## 取引の署名（Xaman）

### 旧方式の問題

旧 `XamanContext.signAndSubmitTransaction` は、ログインの PKCE に二重に依存していた。

- 署名の前に `account` を確かめるが、`account` は `xaman.user.account`（PKCE の JWT）か `xaman.authorize()` でしか入らない。
- `xaman.payload.create()` はブラウザの Xumm SDK で、API Secret の代わりに PKCE の JWT でペイロードを作っていた。ログインしていなければペイロードが作れない。

旧ログインの廃止とあわせて、ペイロードはサーバーが API Secret で作る形に移す。ブラウザ側の Xumm SDK は使わない。

### 流れ

1. 画面が `POST /api/xaman/payload` に、本文 `{txjson, return_path?}` を送る
2. サーバーがペイロードを作り、`{uuid, next, refs, pushed}` を返す
3. 画面は今と同じく QR／`next` のリンクを出し、`refs.websocket_status` の WebSocket で状態を待つ
4. WebSocket で決着が来たら（または期限が来たら）`GET /api/xaman/payload/{uuid}` で結果を確かめる。画面の成功・失敗はこの応答で決める

### `POST /api/xaman/payload`

| 状態 | 応答 |
|---|---|
| `on_session` が無い・壊れている | 401 `not_signed_in` |
| `on_session` の `wallet` が `xaman` でない | 403 `wrong_wallet` |
| `txjson.Account` がセッションのアドレスと違う（無ければサーバーがセッションのアドレスを入れる） | 403 `account_mismatch` |
| `TransactionType` が許可リストに無い | 400 `tx_not_allowed` |
| `return_path` が自サイトのパスでない | 400 `bad_return_path` |
| Xaman がペイロードを作れなかった | 502 `payload_failed` |
| 成功 | 200 `{uuid, next, refs, pushed}` |

- `TransactionType` は、このアプリが実際に署名させる種類だけを許可リストにする（実装時に呼び出し元を洗い出して決める）。
- `options.force_network` は `MAINNET`。
- 戻り先（`options.return_url`）はサーバーが組み立てる。ブラウザからは `return_path`（`/` で始まり `//` で始まらないパスとクエリ）だけを受け取り、自分のオリジンを前に付ける。localhost では付けない。
- 期限（`options.expire`）は 5 分。
- `owner_note.push_token` に生きている Xaman の user_token（`revoked_at` が null で `expires_at` が未来）があれば、ペイロードに `user_token` を付ける。Xaman アプリに署名リクエストが push で届き、QR を読む必要がなくなる。届いたかどうかは応答の `pushed` で分かる。
- 応答の `refs` には `websocket_status` と `qr_png` だけを載せる。

### `GET /api/xaman/payload/{uuid}`

| 状態 | 応答 |
|---|---|
| `on_session` が無い・壊れている | 401 `not_signed_in` |
| ペイロードが見つからない | 404 `unknown_payload` |
| ペイロードの `txjson.Account` がセッションのアドレスと違う | 404 `unknown_payload`（他人のペイロードの有無を漏らさない） |
| まだ決着していない | 202 `pending` |
| 期限切れ・キャンセル・拒否 | 200 `{signed: false}` |
| 署名済み | 200 `{signed: true, txid, dispatched_result}` |

- 署名済みで `application.issued_user_token` が付いていれば、`owner_note_touch_token` で user_token を更新する（署名のたびに寿命が延びるため）。
- ブラウザの WebSocket が伝える `txid` は表示のきっかけにだけ使い、結果はこの応答で確かめる。

### 画面側

- `XamanContext` は SDK の初期化・`authorize()`・`user.account` を持たない。ログイン状態とアドレスは `/api/auth/me` から取る。
- `XRPLWalletContext.signAndSubmit` の Xaman 経路は、上の2つの API を呼ぶ形にする。WebSocket の待ち時間は、旧の 60 秒ではなくペイロードの期限（5 分）に合わせる。

## user_token（通知用）

- Xaman だけが持つ。署名が済むと `application.issued_user_token` で返る。寿命は最後の署名から30日で、署名のたびに新しい値になる。
- ログイン時に `owner_note_login` で `owner_note.push_token` に上書き保存する。token が null なら既存の値は潰さない。
- Joey のログインでも `owner_note_login` を token = null で呼び、ログインの記録だけを残す。Joey のユーザーへの通知は、将来 Web Push（`provider = 'webpush'`）を足すまで無い。
- `/api/xaman/webhook` は本文の uuid を手がかりにサーバーが Xaman から引き直し、署名済みのときだけ `owner_note_touch_token` で更新する（ログインしたことのあるアドレスのみ）。
- ログアウトしても user_token は消さない。ブラウザではなく Xaman アプリに紐づくため。
- 普通の API アプリが送れるのは署名リクエストの push だけ。自由な文面の通知（xapp/push）は xApp のホワイトリストが必要。通知の送出は未実装。

## 実装前に確かめること

- **取引の署名で使う `TransactionType` の洗い出し。** `/api/xaman/payload` の許可リストにする。
- **Joey の `signTransaction` が `autofill: false` を守り、`Fee: "0"` / `LastLedgerSequence: 1` の tx に署名できるか。** 拒否されるなら、メッセージ署名に切り替えるか、別の「台帳に載らない」形を探す。
