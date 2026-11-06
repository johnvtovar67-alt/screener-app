// Only opening projection has a read-only recovery route. Account changes and
// trade recording never use this helper. A lost response cannot replay a write.
import {readC1AccountResponse} from './c1RefreshResponse';

export async function readC1OpeningReview(key, isCurrent, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  const request = async (recover) => {
    const response = await fetcher(recover ? '/api/c1-account?review=opening' : '/api/c1-account', {
      method: recover ? 'GET' : 'POST',
      headers: {authorization: `Bearer ${key}`, ...(recover ? {} : {'content-type':'application/json'})},
      ...(recover ? {} : {body: JSON.stringify({operation:'prepare-execution'})}),
      cache: 'no-store', signal: controller.signal
    });
    let execution;
    try { execution = await readC1AccountResponse(response, {stage:'opening-review'}); }
    catch (error) {
      if (!response.ok) throw new Error('The account opening review failed (HTTP ' + response.status + ').');
      throw error;
    }
    return {response, execution};
  };
  try {
    try { return await request(false); }
    catch (error) {
      const interrupted = error?.name === 'TypeError' || error?.code === 'ACCOUNT_RESPONSE_INTERRUPTED';
      if (!interrupted || controller.signal.aborted || !isCurrent()) throw error;
      return await request(true);
    }
  } finally {
    clearTimeout(timer);
  }
}
