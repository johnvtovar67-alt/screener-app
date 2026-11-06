// Only opening projection has a read-only recovery route. Account changes and
// trade recording never use this helper. A lost response cannot replay a write.
import {readC1AccountResponse,c1RefreshResponseError} from './c1RefreshResponse';

export async function readC1OpeningReview(key, isCurrent, fetcher = fetch) {
  let timer, expired = false, lastResponse = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(c1RefreshResponseError(lastResponse, {stage:'opening-review', code:'ACCOUNT_RESPONSE_TIMEOUT',
        message:'The opening review timed out and its result is unconfirmed. Reload to check it again.'}));
    }, 90000);
  });
  const request = async (recover) => {
    const response = await fetcher(recover ? '/api/c1-account?review=opening' : '/api/c1-account', {
      method: recover ? 'GET' : 'POST',
      headers: {authorization: `Bearer ${key}`, ...(recover ? {} : {'content-type':'application/json'})},
      ...(recover ? {} : {body: JSON.stringify({operation:'prepare-execution'})}),
      cache: 'no-store'
    });
    if (expired) return;
    lastResponse = response;
    let execution;
    try { execution = await readC1AccountResponse(response, {stage:'opening-review'}); }
    catch (error) {
      if (!response.ok) throw new Error('The account opening review failed (HTTP ' + response.status + ').');
      throw error;
    }
    return {response, execution};
  };
  try {
    const reads = request(false).catch(error => {
      const interrupted = error?.name === 'TypeError' || error?.code === 'ACCOUNT_RESPONSE_INTERRUPTED';
      if (!interrupted || expired || !isCurrent()) throw error;
      return request(true);
    });
    return await Promise.race([reads, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
