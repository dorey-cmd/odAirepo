-- Extends the storage-layer mime type allowlist (see 0003) to match the
-- markdown and audio support added to lib/storage/fileRules.ts.

update storage.buckets
set
  allowed_mime_types = array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2',
    'application/x-font-ttf',
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg'
  ]
where id in ('environment-files', 'contract-files');
