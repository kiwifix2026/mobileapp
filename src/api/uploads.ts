import { API_BASE, ApiError } from './client';

// Mirrors UploadsController in kiwifix-backend-jobpost — every uploaded
// file (job photos, tradie profile photos, licence docs) lives in one
// private S3 bucket now. POST /uploads returns just the opaque S3 key (not
// a browsable URL); GET /uploads/signed-url mints a short-lived viewable
// URL for it. Deliberately not behind JwtAuthGuard (see the controller's
// own comment) — a job poster can attach photos on job-step1 before
// finishing OTP verification, so there's no token to send here anyway.

// iPhone library photos come back from the picker with a fileName like
// "IMG_1234.HEIC" and a mimeType of "image/heic" even though (with
// quality < 1) the file the picker actually hands us at `uri` has been
// re-encoded to JPEG. The backend only accepts JPG/PNG/WEBP/GIF and decides
// by the MULTIPART content-type + filename, so sending the picker's
// HEIC-flavoured name/type got a perfectly good JPEG rejected. Work out the
// real type from the actual file's extension instead, and rename to match.
function resolveUploadType(uri: string, fileName?: string, mimeType?: string) {
  const uriExt = uri.split('?')[0].split('.').pop()?.toLowerCase() || '';
  const nameExt = (fileName || '').split('.').pop()?.toLowerCase() || '';
  const byExt: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  };
  const isHeic = (e: string) => e === 'heic' || e === 'heif';

  if (isHeic(uriExt)) {
    // The file itself is still HEIC (picker didn't transcode) — the backend
    // can't read it, so fail with a clear message instead of a vague 400.
    throw new Error('This photo is in HEIC format. Please choose a different photo or set your iPhone camera to "Most Compatible".');
  }
  const mime = byExt[uriExt] || (mimeType && !/hei[cf]/i.test(mimeType) ? mimeType : '') || byExt[nameExt] || 'image/jpeg';
  const ext = Object.keys(byExt).find((k) => byExt[k] === mime && k !== 'jpeg') || 'jpg';
  const base = (fileName || uri.split('/').pop() || `photo-${Date.now()}`).replace(/\.[^.]+$/, '');
  return { mime, name: `${base}.${ext}` };
}

export async function uploadPhoto(uri: string, fileName?: string, mimeType?: string): Promise<string> {
  const { mime: type, name } = resolveUploadType(uri, fileName, mimeType);

  // React Native's fetch/FormData used to accept a {uri, name, type} shorthand
  // in place of a real Blob/File, streaming the file straight off the uri.
  // React Native 0.86 (bundled with Expo SDK 57) tightened FormData's part
  // validation and rejects that shorthand outright with "Unsupported
  // FormDataPart implementation" — so we fetch the local file into a real
  // Blob first (RN's fetch supports file:// URIs for this) and append that
  // instead, which both the old and new FormData implementations accept.
  const fileResponse = await fetch(uri);
  const raw = await fileResponse.blob();
  // RN infers a local file Blob's type from its extension and can leave it
  // empty, which multer then sees as application/octet-stream and rejects.
  // slice() with an explicit type pins the correct content-type.
  const blob = raw.slice(0, raw.size, type);

  const form = new FormData();
  form.append('file', blob, name);

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
