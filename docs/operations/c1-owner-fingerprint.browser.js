// OWNER-RUN ONLY in the existing signed-in production browser after a normal
// successful Reload. Do not run this in an agent browser or send its output in chat.
// Emits only the SHA256 fingerprint. No HTTP, clipboard or storage mutation.
(async () => {
  const origins = new Set([
    'https://screener-app-cq5t.vercel.app',
    'https://screener-app-cq5t-johnvtovar67-7543s-projects.vercel.app',
    'https://screener-app-cq5t-git-main-johnvtovar67-7543s-projects.vercel.app',
  ]);
  if (!origins.has(location.origin)) throw new Error('Use the existing signed-in production app origin.');
  const existing = localStorage.getItem('stock_screener_portfolio_sync_key_v1');
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(existing || '')) throw new Error('An existing connected account is required.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(existing));
  console.info(Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join(''));
})();
