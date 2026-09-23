// utils/xrplClient.ts
// XRPL への接続を 1 つだけ作って使い回す。
// リクエストのたびにつなぎ直すと、そのたびに TCP と TLS の手続きが入り、
// 100 件ずつの同期ではその時間が積み上がるため。

import { Client } from 'xrpl';

const XRPL_WEBSOCKET_URL = 'wss://s1.ripple.com';
/** 最後の利用からこの時間つながれたままなら閉じる */
const IDLE_TIMEOUT_MS = 60_000;

let clientPromise: Promise<Client> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** 実行中のリクエスト数（0 になってから待って閉じる） */
let inFlight = 0;

async function connect(): Promise<Client> {
  const client = new Client(XRPL_WEBSOCKET_URL);
  // 相手から切られたら、次の呼び出しでつなぎ直す
  client.on('disconnected', () => {
    if (clientPromise) clientPromise = null;
  });
  await client.connect();
  return client;
}

function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = connect().catch(error => {
      clientPromise = null; // 次の呼び出しでやり直せるようにする
      throw error;
    });
  }
  return clientPromise;
}

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (inFlight > 0) return;
    const pending = clientPromise;
    clientPromise = null;
    void pending?.then(client => client.disconnect()).catch(() => {
      /* 切断の失敗は無視してよい */
    });
  }, IDLE_TIMEOUT_MS);
}

/**
 * 使い回している接続でリクエストを実行する。
 * 失敗したら接続を捨てて、つなぎ直してからやり直す。
 */
export async function withXrplClient<T>(
  requestFn: (client: Client) => Promise<T>,
  { retries = 3, retryDelayMs = 2000 }: { retries?: number; retryDelayMs?: number } = {}
): Promise<T> {
  inFlight++;
  try {
    for (let attempt = 0; ; attempt++) {
      let client: Client | null = null;
      try {
        client = await getClient();
        return await requestFn(client);
      } catch (error) {
        // 接続が壊れている可能性があるので、次の呼び出しではつなぎ直す。
        // 他に実行中のリクエストがあるときは、その邪魔をしないよう切断はしない
        clientPromise = null;
        if (inFlight === 1) {
          void client?.disconnect().catch(() => {
            /* 切断の失敗は無視してよい */
          });
        }
        if (attempt >= retries) throw error;
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  } finally {
    inFlight--;
    scheduleIdleClose();
  }
}
