import { supabase } from "../../lib/supabase";

const AVATAR_BUCKET = "avatars";

export async function uploadAvatarFromUri(input: {
  userId: string;
  uri: string;
  base64: string;
  mimeType?: string;
}) {
  const extension = extensionFromMimeType(input.mimeType) ?? extensionFromUri(input.uri) ?? "jpg";
  const contentType = input.mimeType ?? contentTypeFromExtension(extension);
  const path = `${input.userId}/avatar.${extension}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, base64ToUint8Array(input.base64), {
      contentType,
      upsert: true
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function extensionFromMimeType(mimeType?: string) {
  if (!mimeType) {
    return null;
  }

  if (mimeType.includes("png")) {
    return "png";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  return "jpg";
}

function extensionFromUri(uri: string) {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  return match?.[1]?.toLowerCase();
}

function contentTypeFromExtension(extension: string) {
  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function base64ToUint8Array(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
