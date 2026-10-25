// Shared Blob conditional-write identity. Classification never retries a write,
// changes an ETag, or exposes an SDK message to a response or diagnostic.
export function isBlobPreconditionFailed(error){
 return error?.name==='BlobPreconditionFailedError'||error?.status===412||/precondition failed.*etag mismatch/i.test(String(error?.message||''));
}
