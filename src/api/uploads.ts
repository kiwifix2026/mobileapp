import { API_BASE, ApiError } from './client';

// Mirrors UploadsController in kiwifix-backend-jobpost — every uploaded
// file (job photos, tradie profile photos, licence docs) lives in one
// private S3 bucket now. POST /uploads returns just the opaque S3 key (not
// a browsable URL); GET /uploads/signed-url mints a short-lived viewable
// URL for it. Deliberately not behind JwtAuthGuard (see the controller's
// own comment) — a job poster can attach photos on job-step1 before
// finishing OTP verification, so there's no token to send here anyway.

export async function uploadPhoto(uri: string, fileName?: string, mimeType?: string): Promise<string> {
  const name = fileName || uri.split('/').pop() || `photo-${Date.now()}.jpg`;
  const type = mimeType || guessMimeType(name);

  const form = new FormData();
  // React Native's fetch/FormData accepts this {uri, name, type} shape in
  // place of a real Blob/File — RN's networking layer streams the file
  // straight off the uri, not through a base64 conversion in JS.
  form.append('file', { uri, name, type } as unknown as Blob);

  const res = await fetch(`${API_BASE}/uploads`, { method: 'POST', body: form });

  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    } catch {
      // not JSON — keep the generic message
    }
    throw new ApiError(message, res.status);
  }

  const body = await res.json();
  return body.url as string; // opaque S3 key, same field name the backend/web app already use
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

export async function getSignedUrl(key: string): Promise<string> {
  const res = await fetch(`${API_BASE}/uploads/signed-url?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new ApiError(`Could not load photo (${res.status})`, res.status);
  const body = await res.json();
  return body.url as string;
}
