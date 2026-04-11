/**
 * URL for the Express API when called from Next.js Route Handlers (server).
 * Prefer BACKEND_API_URL; fall back to NEXT_PUBLIC_BACKEND_API_URL so local dev
 * works when only the public env var is set (avoids proxying to Render by mistake).
 */
export function getServerBackendUrl(): string {
  const raw =
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    "https://ai-therapist-agent-backend.onrender.com";
  return raw.replace(/\/$/, "");
}
