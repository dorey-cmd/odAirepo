-- Defense-in-depth alongside the app-level checks in lib/storage/fileRules.ts:
-- cap object size and restrict mime types at the storage layer too.

update storage.buckets
set
  file_size_limit = 209715200, -- 200MB, the largest category (video)
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
    'text/plain'
  ]
where id in ('environment-files', 'contract-files');
