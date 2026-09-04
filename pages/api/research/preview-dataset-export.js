import { get, list } from "@vercel/blob";

export const config = { maxDuration: 60 };

const SP500_MANIFEST = "research/pit-sp500-compiled-checkpoint-v1.json";
const SP500_CHUNK_PREFIX = "research/pit-sp500-compiled-v1/";

function allowedPath(pathname) {
  return (
    pathname === SP500_MANIFEST ||
    (pathname.startsWith(SP500_CHUNK_PREFIX) && pathname.endsWith(".json.gz"))
  );
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === "production")
    return res.status(404).json({ error: "Not found" });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const pathname = String(req.query.path || "");
  if (!allowedPath(pathname))
    return res.status(400).json({ error: "Path is not allowlisted" });

  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find((item) => item.pathname === pathname);
  if (!blob) return res.status(404).json({ error: "Artifact not found" });
  const response = await get(blob.url, { access: "private", useCache: false });
  if (!response) return res.status(404).json({ error: "Artifact not found" });
  const payload = Buffer.from(await new Response(response.stream).arrayBuffer());
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader(
    "Content-Type",
    pathname.endsWith(".gz") ? "application/gzip" : "application/json",
  );
  return res.status(200).send(payload);
}
