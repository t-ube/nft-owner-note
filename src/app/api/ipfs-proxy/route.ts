// app/api/ipfs-proxy/route.ts
import { NextRequest } from 'next/server'

const RETRY_COUNT = 3;
const RETRY_DELAY = 1000; // 1秒待機

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, retries = RETRY_COUNT): Promise<Response> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    // 429エラーの場合、リトライ
    if (response.status === 429 && retries > 0) {
      await sleep(RETRY_DELAY);
      return fetchWithRetry(url, retries - 1);
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      await sleep(RETRY_DELAY);
      return fetchWithRetry(url, retries - 1);
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return Response.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const response = await fetchWithRetry(targetUrl);

    if (!response.ok) {
      // 429の場合、別のゲートウェイを試すようにクライアントに通知
      if (response.status === 429) {
        return Response.json(
          { error: 'Rate limit exceeded', shouldTryNextGateway: true }, 
          { status: 429 }
        );
      }
      throw new Error(`Gateway fetch failed: ${response.status}`);
    }

    const data = await response.json();
    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (error) {
    console.error('Gateway proxy error:', error);
    return Response.json(
      { error: 'Failed to fetch content', shouldTryNextGateway: true }, 
      { status: 500 }
    );
  }
}