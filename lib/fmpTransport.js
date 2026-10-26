// Shared FMP I/O boundary. These functions deliberately return the original
// promises: adding async/await here would change endpoint interleavings and the
// moment at which callers capture evidence/cache timestamps. Adapters retain
// status/error interpretation, deadlines, retries, caches and receipt metadata.
// No URLs, credentials, bodies or raw exceptions are retained by this module.
export function fmpApiKey({allowLegacy=false}={}){
  return allowLegacy?process.env.FMP_API_KEY||process.env.FMP_KEY:process.env.FMP_API_KEY;
}
export function fetchFmpResponse(url,options,{fetcher=fetch}={}){
  return arguments.length===1?fetcher(url):fetcher(url,options);
}
export function readFmpJsonResponse(response){
  return response.json();
}
