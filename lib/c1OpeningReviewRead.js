// Only opening projection has a read-only recovery route. Account changes and
// trade recording never use this helper. A lost response cannot replay a write.
import {readC1AccountResponse,c1RefreshResponseError} from './c1RefreshResponse';
import {continueC1ReadOnlyScan} from './c1ScanContinuation';

const OPENING_REVIEW_TIMEOUT_MS = 90000;

export async function readC1OpeningReview(key, isCurrent, fetcher = fetch) {
  let timer, rejectDeadline, expiresAt, timeoutError, lastResponse = null;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  const getTimeoutError = () => timeoutError ??= c1RefreshResponseError(lastResponse, {
    stage:'opening-review', code:'ACCOUNT_RESPONSE_TIMEOUT',
    message:'The opening review timed out and its result is unconfirmed. Reload to check it again.'
  });
  const assertWithinDeadline = () => {
    if (timeoutError || performance.now() >= expiresAt) throw getTimeoutError();
  };
  const startDeadline = () => {
    clearTimeout(timer);
    lastResponse = null;
    expiresAt = performance.now() + OPENING_REVIEW_TIMEOUT_MS;
    timer = setTimeout(() => rejectDeadline(getTimeoutError()), OPENING_REVIEW_TIMEOUT_MS);
  };
  const request = async (recover) => {
    assertWithinDeadline();
    const response = await fetcher(recover ? '/api/c1-account?review=opening' : '/api/c1-account', {
      method: recover ? 'GET' : 'POST',
      headers: {authorization: `Bearer ${key}`, ...(recover ? {} : {'content-type':'application/json'})},
      ...(recover ? {} : {body: JSON.stringify({operation:'prepare-execution'})}),
      cache: 'no-store'
    });
    assertWithinDeadline();
    lastResponse = response;
    let execution;
    try { execution = await readC1AccountResponse(response, {stage:'opening-review'}); }
    catch (error) {
      if (!response.ok) throw new Error('The account opening review failed (HTTP ' + response.status + ').');
      throw error;
    }
    assertWithinDeadline();
    return {response, execution};
  };
  try {
    startDeadline();
    const reads = request(false).catch(error => {
      const interrupted = error?.name === 'TypeError' || error?.code === 'ACCOUNT_RESPONSE_INTERRUPTED';
      if (!interrupted || timeoutError || !isCurrent()) throw error;
      assertWithinDeadline();
      // A lost POST response can leave too little time for the existing GET
      // to finish. Allow one fresh interval for recovery, never per scan pass.
      startDeadline();
      return request(true);
    });
    const continued=reads.then(initial=>continueC1ReadOnlyScan({initial,next:()=>request(true),isCurrent:()=>!timeoutError&&isCurrent(),
      scanOf:result=>result?.execution?.decision?.scan||result?.execution?.scan||result?.execution?.error?.scan}));
    return await Promise.race([continued, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
