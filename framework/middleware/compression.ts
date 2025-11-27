/**
 * Compression Middleware
 *
 * Gzip/Brotli response compression for improved transfer efficiency.
 */

import type { LegacyMiddleware } from '../http/types.ts';

export interface CompressionOptions {
  threshold?: number; // Minimum size to compress (bytes)
  contentTypes?: string[]; // Content types to compress
  preferBrotli?: boolean;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  threshold: 1024, // 1KB
  contentTypes: [
    'text/html',
    'text/css',
    'text/plain',
    'text/javascript',
    'application/javascript',
    'application/json',
    'application/xml',
    'image/svg+xml',
  ],
  preferBrotli: true,
};

/**
 * Create compression middleware
 */
export function compressionMiddleware(options: CompressionOptions = {}): LegacyMiddleware {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (req, res, next) => {
    // Get the response from the next middleware/handler
    const response = await next();

    if (!(response instanceof Response)) {
      return response;
    }

    // Check if compression is applicable
    const acceptEncoding = req.header('Accept-Encoding') ?? '';
    const contentType = response.headers.get('Content-Type') ?? '';

    // Skip if content type is not compressible
    const isCompressible = opts.contentTypes!.some((type) =>
      contentType.includes(type)
    );
    if (!isCompressible) {
      return response;
    }

    // Skip if already compressed
    if (response.headers.has('Content-Encoding')) {
      return response;
    }

    // Check content length
    const contentLength = response.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) < opts.threshold!) {
      return response;
    }

    // Determine compression method
    const supportsBrotli = acceptEncoding.includes('br');
    const supportsGzip = acceptEncoding.includes('gzip');

    if (!supportsBrotli && !supportsGzip) {
      return response;
    }

    // Get response body
    const body = await response.arrayBuffer();

    if (body.byteLength < opts.threshold!) {
      return response;
    }

    // Compress the body
    let compressed: Uint8Array;
    let encoding: string;

    if (supportsBrotli && opts.preferBrotli) {
      // Note: Brotli requires additional setup in Deno
      // For now, fall back to gzip
      compressed = await compressGzip(body);
      encoding = 'gzip';
    } else if (supportsGzip) {
      compressed = await compressGzip(body);
      encoding = 'gzip';
    } else {
      return response;
    }

    // Build new response with compressed body
    const headers = new Headers(response.headers);
    headers.set('Content-Encoding', encoding);
    headers.set('Content-Length', compressed.byteLength.toString());
    headers.set('Vary', 'Accept-Encoding');

    return new Response(new Uint8Array(compressed), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/**
 * Compress data with gzip
 */
async function compressGzip(data: ArrayBuffer): Promise<Uint8Array> {
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  await writer.write(new Uint8Array(data));
  await writer.close();

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// Alias for convenience
export const compression = compressionMiddleware;
