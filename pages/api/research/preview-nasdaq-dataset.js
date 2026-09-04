import { get, list } from "@vercel/blob";

export const config = { maxDuration: 60 };

const MANIFEST = "research/pit-nasdaq-index-compiled-checkpoint-v1.json";
const CHUNK_PREFIX = "research/pit-nasdaq-index-compiled-v1/";

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "private, no-store");
  const pathname = String(req.query.path || "");
  if (pathname !== MANIFEST && !pathname.startsWith(CHUNK_PREFIX)) {
    return res.status(400).json({ error: "Path is not allowlisted" });
  }
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) return res.status(404).json({ error: "Artifact not found" });
  const artifact = await get(blob.url, { access: "private", useCache: false });
  if (!artifact) return res.status(404).json({ error: "Artifact unavailable" });
  const bytes = Buffer.from(await new Response(artifact.stream).arrayBuffer());
  res.setHeader("Content-Type", pathname.endsWith(".gz") ? "application/gzip" : "application/json");
  return res.status(200).send(bytes);
}
