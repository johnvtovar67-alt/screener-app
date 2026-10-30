// Immutable build identity is inlined into the client, separately from the
// running server's version endpoint. No credentials are exposed here.
export default {
 env:{
  NEXT_PUBLIC_C1_CLIENT_COMMIT:process.env.VERCEL_GIT_COMMIT_SHA||'local',
  NEXT_PUBLIC_C1_CLIENT_ENVIRONMENT:process.env.VERCEL_ENV||'local'
 }
};
