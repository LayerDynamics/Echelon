/**
 * WASI (WebAssembly System Interface) Implementation for Echelon
 *
 * Provides standardized system interface for WebAssembly modules with
 * capability-based security and Deno permission integration.
 *
 * Based on WASI snapshot_preview1 specification
 * References:
 * - https://github.com/WebAssembly/WASI
 * - https://github.com/caspervonb/deno-wasi
 * - https://docs.deno.com/api/node/wasi/
 */

import { resolve, join, dirname, basename } from 'https://deno.land/std@0.220.0/path/mod.ts';
import { getLogger } from '../telemetry/logger.ts';
import type { WASMCapability } from './wasm_types.ts';

const logger = getLogger();

/**
 * WASI error codes (errno)
 */
export enum WASIErrno {
  SUCCESS = 0,
  TOOBIG = 1,        // Argument list too long
  ACCES = 2,         // Permission denied
  ADDRINUSE = 3,     // Address in use
  ADDRNOTAVAIL = 4,  // Address not available
  AFNOSUPPORT = 5,   // Address family not supported
  AGAIN = 6,         // Resource unavailable
  ALREADY = 7,       // Connection already in progress
  BADF = 8,          // Bad file descriptor
  BADMSG = 9,        // Bad message
  BUSY = 10,         // Device or resource busy
  CANCELED = 11,     // Operation canceled
  CHILD = 12,        // No child processes
  CONNABORTED = 13,  // Connection aborted
  CONNREFUSED = 14,  // Connection refused
  CONNRESET = 15,    // Connection reset
  DEADLK = 16,       // Resource deadlock would occur
  DESTADDRREQ = 17,  // Destination address required
  DOM = 18,          // Mathematics argument out of domain
  DQUOT = 19,        // Reserved
  EXIST = 20,        // File exists
  FAULT = 21,        // Bad address
  FBIG = 22,         // File too large
  HOSTUNREACH = 23,  // Host is unreachable
  IDRM = 24,         // Identifier removed
  ILSEQ = 25,        // Illegal byte sequence
  INPROGRESS = 26,   // Operation in progress
  INTR = 27,         // Interrupted function
  INVAL = 28,        // Invalid argument
  IO = 29,           // I/O error
  ISCONN = 30,       // Socket is connected
  ISDIR = 31,        // Is a directory
  LOOP = 32,         // Too many levels of symbolic links
  MFILE = 33,        // File descriptor value too large
  MLINK = 34,        // Too many links
  MSGSIZE = 35,      // Message too large
  MULTIHOP = 36,     // Reserved
  NAMETOOLONG = 37,  // Filename too long
  NETDOWN = 38,      // Network is down
  NETRESET = 39,     // Connection aborted by network
  NETUNREACH = 40,   // Network unreachable
  NFILE = 41,        // Too many files open in system
  NOBUFS = 42,       // No buffer space available
  NODEV = 43,        // No such device
  NOENT = 44,        // No such file or directory
  NOEXEC = 45,       // Executable file format error
  NOLCK = 46,        // No locks available
  NOLINK = 47,       // Reserved
  NOMEM = 48,        // Not enough space
  NOMSG = 49,        // No message of the desired type
  NOPROTOOPT = 50,   // Protocol not available
  NOSPC = 51,        // No space left on device
  NOSYS = 52,        // Function not supported
  NOTCONN = 53,      // The socket is not connected
  NOTDIR = 54,       // Not a directory
  NOTEMPTY = 55,     // Directory not empty
  NOTRECOVERABLE = 56, // State not recoverable
  NOTSOCK = 57,      // Not a socket
  NOTSUP = 58,       // Not supported
  NOTTY = 59,        // Inappropriate I/O control operation
  NXIO = 60,         // No such device or address
  OVERFLOW = 61,     // Value too large to be stored
  OWNERDEAD = 62,    // Previous owner died
  PERM = 63,         // Operation not permitted
  PIPE = 64,         // Broken pipe
  PROTO = 65,        // Protocol error
  PROTONOSUPPORT = 66, // Protocol not supported
  PROTOTYPE = 67,    // Protocol wrong type for socket
  RANGE = 68,        // Result too large
  ROFS = 69,         // Read-only file system
  SPIPE = 70,        // Invalid seek
  SRCH = 71,         // No such process
  STALE = 72,        // Reserved
  TIMEDOUT = 73,     // Connection timed out
  TXTBSY = 74,       // Text file busy
  XDEV = 75,         // Cross-device link
  NOTCAPABLE = 76,   // Extension: Capabilities insufficient
}

/**
 * WASI file types
 */
export enum WASIFiletype {
  UNKNOWN = 0,
  BLOCK_DEVICE = 1,
  CHARACTER_DEVICE = 2,
  DIRECTORY = 3,
  REGULAR_FILE = 4,
  SOCKET_DGRAM = 5,
  SOCKET_STREAM = 6,
  SYMBOLIC_LINK = 7,
}

/**
 * WASI file descriptor flags
 */
export enum WASIFdflags {
  APPEND = 0x0001,
  DSYNC = 0x0002,
  NONBLOCK = 0x0004,
  RSYNC = 0x0008,
  SYNC = 0x0010,
}

/**
 * WASI rights (using const bigints instead of enum)
 */
export const WASIRights = {
  FD_DATASYNC: 1n << 0n,
  FD_READ: 1n << 1n,
  FD_SEEK: 1n << 2n,
  FDSTAT_SET_FLAGS: 1n << 3n,
  FD_SYNC: 1n << 4n,
  FD_TELL: 1n << 5n,
  FD_WRITE: 1n << 6n,
  FD_ADVISE: 1n << 7n,
  FD_ALLOCATE: 1n << 8n,
  PATH_CREATE_DIRECTORY: 1n << 9n,
  PATH_CREATE_FILE: 1n << 10n,
  PATH_LINK_SOURCE: 1n << 11n,
  PATH_LINK_TARGET: 1n << 12n,
  PATH_OPEN: 1n << 13n,
  FD_READDIR: 1n << 14n,
  PATH_READLINK: 1n << 15n,
  PATH_RENAME_SOURCE: 1n << 16n,
  PATH_RENAME_TARGET: 1n << 17n,
  PATH_FILESTAT_GET: 1n << 18n,
  PATH_FILESTAT_SET_SIZE: 1n << 19n,
  PATH_FILESTAT_SET_TIMES: 1n << 20n,
  FD_FILESTAT_GET: 1n << 21n,
  FD_FILESTAT_SET_SIZE: 1n << 22n,
  FD_FILESTAT_SET_TIMES: 1n << 23n,
  PATH_SYMLINK: 1n << 24n,
  PATH_REMOVE_DIRECTORY: 1n << 25n,
  PATH_UNLINK_FILE: 1n << 26n,
  POLL_FD_READWRITE: 1n << 27n,
  SOCK_SHUTDOWN: 1n << 28n,
} as const;

/**
 * Clock IDs
 */
export enum WASIClockId {
  REALTIME = 0,
  MONOTONIC = 1,
  PROCESS_CPUTIME_ID = 2,
  THREAD_CPUTIME_ID = 3,
}

/**
 * File open flags
 */
export enum WASIOflags {
  CREAT = 0x0001,
  DIRECTORY = 0x0002,
  EXCL = 0x0004,
  TRUNC = 0x0008,
}

/**
 * Preopened directory configuration
 */
export interface WASIPreopenDirectory {
  /** Virtual path visible to WASM module */
  virtualPath: string;
  /** Physical path on host filesystem */
  hostPath: string;
  /** Read permissions */
  allowRead: boolean;
  /** Write permissions */
  allowWrite: boolean;
}

/**
 * WASI configuration options
 */
export interface WASIOptions {
  /** Command-line arguments passed to WASM module */
  args?: string[];

  /** Environment variables */
  env?: Record<string, string>;

  /** Preopened directories */
  preopenedDirectories?: Map<string, string> | WASIPreopenDirectory[];

  /** Allow read operations */
  allowRead?: boolean;

  /** Allow write operations */
  allowWrite?: boolean;

  /** Allow network operations */
  allowNetwork?: boolean;

  /** Allow environment variable access */
  allowEnv?: boolean;

  /** Standard input */
  stdin?: ReadableStream<Uint8Array>;

  /** Standard output */
  stdout?: WritableStream<Uint8Array>;

  /** Standard error */
  stderr?: WritableStream<Uint8Array>;

  /** Memory instance (will be set from WASM module) */
  memory?: WebAssembly.Memory;

  /** Granted capabilities (Echelon security model) */
  capabilities?: WASMCapability[];
}

/**
 * File descriptor representation
 */
interface FileDescriptor {
  type: 'stdin' | 'stdout' | 'stderr' | 'file' | 'directory';
  file?: Deno.FsFile;
  path?: string;
  virtualPath?: string;
  rights?: bigint;
  inheriting?: bigint;
  flags?: number;
}

/**
 * WASI implementation for Echelon
 *
 * Provides WebAssembly System Interface with capability-based security
 * integrated with Deno's permission system.
 */
export class WASI {
  private args: string[];
  private env: Record<string, string>;
  private preopens: WASIPreopenDirectory[];
  private fds: FileDescriptor[];
  private memory: WebAssembly.Memory | null = null;
  private view: DataView | null = null;
  private capabilities: Set<WASMCapability>;

  // Security flags
  private allowRead: boolean;
  private allowWrite: boolean;
  private allowNetwork: boolean;
  private allowEnv: boolean;

  // IO streams
  private stdin: ReadableStream<Uint8Array>;
  private stdout: WritableStream<Uint8Array>;
  private stderr: WritableStream<Uint8Array>;

  constructor(options: WASIOptions = {}) {
    this.args = options.args ?? [];
    this.env = options.env ?? {};
    this.capabilities = new Set(options.capabilities ?? []);

    // Security configuration
    this.allowRead = options.allowRead ?? false;
    this.allowWrite = options.allowWrite ?? false;
    this.allowNetwork = options.allowNetwork ?? false;
    this.allowEnv = options.allowEnv ?? false;

    // IO streams
    this.stdin = options.stdin ?? Deno.stdin.readable;
    this.stdout = options.stdout ?? Deno.stdout.writable;
    this.stderr = options.stderr ?? Deno.stderr.writable;

    // Initialize file descriptors with standard streams
    this.fds = [
      { type: 'stdin' },
      { type: 'stdout' },
      { type: 'stderr' },
    ];

    // Process preopened directories
    this.preopens = [];
    if (options.preopenedDirectories) {
      if (options.preopenedDirectories instanceof Map) {
        for (const [virtualPath, hostPath] of options.preopenedDirectories) {
          this.preopens.push({
            virtualPath,
            hostPath,
            allowRead: options.allowRead ?? false,
            allowWrite: options.allowWrite ?? false,
          });
        }
      } else {
        this.preopens = options.preopenedDirectories;
      }
    }

    if (options.memory) {
      this.memory = options.memory;
      this.view = new DataView(this.memory.buffer);
    }

    logger.debug('WASI initialized', {
      args: this.args.length,
      env: Object.keys(this.env).length,
      preopens: this.preopens.length,
      capabilities: Array.from(this.capabilities),
    });
  }

  /**
   * Get WASI imports for WebAssembly instantiation
   */
  getImports(): WebAssembly.Imports {
    return {
      wasi_snapshot_preview1: {
        // Arguments
        args_get: this.args_get.bind(this),
        args_sizes_get: this.args_sizes_get.bind(this),

        // Environment
        environ_get: this.environ_get.bind(this),
        environ_sizes_get: this.environ_sizes_get.bind(this),

        // Clock
        clock_res_get: this.clock_res_get.bind(this),
        clock_time_get: this.clock_time_get.bind(this),

        // Random
        random_get: this.random_get.bind(this),

        // File Descriptors
        fd_close: this.fd_close.bind(this),
        fd_read: this.fd_read.bind(this),
        fd_write: this.fd_write.bind(this),
        fd_seek: this.fd_seek.bind(this),
        fd_tell: this.fd_tell.bind(this),
        fd_fdstat_get: this.fd_fdstat_get.bind(this),
        fd_fdstat_set_flags: this.fd_fdstat_set_flags.bind(this),
        fd_filestat_get: this.fd_filestat_get.bind(this),
        fd_filestat_set_size: this.fd_filestat_set_size.bind(this),
        fd_filestat_set_times: this.fd_filestat_set_times.bind(this),
        fd_readdir: this.fd_readdir.bind(this),
        fd_sync: this.fd_sync.bind(this),
        fd_datasync: this.fd_datasync.bind(this),
        fd_prestat_get: this.fd_prestat_get.bind(this),
        fd_prestat_dir_name: this.fd_prestat_dir_name.bind(this),

        // Paths
        path_open: this.path_open.bind(this),
        path_filestat_get: this.path_filestat_get.bind(this),
        path_filestat_set_times: this.path_filestat_set_times.bind(this),
        path_create_directory: this.path_create_directory.bind(this),
        path_remove_directory: this.path_remove_directory.bind(this),
        path_readlink: this.path_readlink.bind(this),
        path_rename: this.path_rename.bind(this),
        path_symlink: this.path_symlink.bind(this),
        path_unlink_file: this.path_unlink_file.bind(this),

        // Process
        proc_exit: this.proc_exit.bind(this),

        // Scheduling
        sched_yield: this.sched_yield.bind(this),
      },
    };
  }

  /**
   * Set memory instance (called after WASM instantiation)
   */
  setMemory(memory: WebAssembly.Memory): void {
    this.memory = memory;
    this.view = new DataView(memory.buffer);
  }

  /**
   * Initialize preopened directories
   */
  async initializePreopens(): Promise<void> {
    for (const preopen of this.preopens) {
      try {
        // Validate directory exists
        const stat = await Deno.stat(preopen.hostPath);
        if (!stat.isDirectory) {
          logger.warn(`Preopen path is not a directory: ${preopen.hostPath}`);
          continue;
        }

        // Open directory
        const file = await Deno.open(preopen.hostPath, { read: true });

        // Calculate rights based on permissions
        let rights = WASIRights.PATH_OPEN | WASIRights.FD_READDIR | WASIRights.PATH_FILESTAT_GET;
        if (preopen.allowRead) {
          rights |= WASIRights.FD_READ | WASIRights.FD_SEEK | WASIRights.FD_TELL;
        }
        if (preopen.allowWrite) {
          rights |= WASIRights.FD_WRITE | WASIRights.PATH_CREATE_FILE | WASIRights.PATH_CREATE_DIRECTORY;
        }

        // Add file descriptor
        this.fds.push({
          type: 'directory',
          file,
          path: preopen.hostPath,
          virtualPath: preopen.virtualPath,
          rights,
          inheriting: rights,
        });

        logger.debug(`Preopened directory: ${preopen.virtualPath} -> ${preopen.hostPath}`);
      } catch (error) {
        logger.error(`Failed to preopen directory: ${preopen.hostPath}`, error as Error);
      }
    }
  }

  // ============================================================================
  // Arguments
  // ============================================================================

  private args_get(argv: number, argv_buf: number): number {
    if (!this.view) return WASIErrno.INVAL;

    let offset = argv_buf;
    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i];
      const bytes = new TextEncoder().encode(arg + '\0');

      // Write pointer to string
      this.view.setUint32(argv + i * 4, offset, true);

      // Write string bytes
      new Uint8Array(this.memory!.buffer, offset, bytes.length).set(bytes);
      offset += bytes.length;
    }

    return WASIErrno.SUCCESS;
  }

  private args_sizes_get(argc_ptr: number, argv_buf_size_ptr: number): number {
    if (!this.view) return WASIErrno.INVAL;

    const argc = this.args.length;
    const argv_buf_size = this.args.reduce((sum, arg) => sum + new TextEncoder().encode(arg).length + 1, 0);

    this.view.setUint32(argc_ptr, argc, true);
    this.view.setUint32(argv_buf_size_ptr, argv_buf_size, true);

    return WASIErrno.SUCCESS;
  }

  // ============================================================================
  // Environment
  // ============================================================================

  private environ_get(environ: number, environ_buf: number): number {
    if (!this.view) return WASIErrno.INVAL;
    if (!this.allowEnv && !this.capabilities.has('env')) {
      return WASIErrno.NOTCAPABLE;
    }

    const entries = Object.entries(this.env);
    let offset = environ_buf;

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      const entry = `${key}=${value}\0`;
      const bytes = new TextEncoder().encode(entry);

      // Write pointer
      this.view.setUint32(environ + i * 4, offset, true);

      // Write bytes
      new Uint8Array(this.memory!.buffer, offset, bytes.length).set(bytes);
      offset += bytes.length;
    }

    return WASIErrno.SUCCESS;
  }

  private environ_sizes_get(environc_ptr: number, environ_buf_size_ptr: number): number {
    if (!this.view) return WASIErrno.INVAL;
    if (!this.allowEnv && !this.capabilities.has('env')) {
      return WASIErrno.NOTCAPABLE;
    }

    const entries = Object.entries(this.env);
    const environc = entries.length;
    const environ_buf_size = entries.reduce(
      (sum, [key, value]) => sum + new TextEncoder().encode(`${key}=${value}`).length + 1,
      0
    );

    this.view.setUint32(environc_ptr, environc, true);
    this.view.setUint32(environ_buf_size_ptr, environ_buf_size, true);

    return WASIErrno.SUCCESS;
  }

  // ============================================================================
  // Clock
  // ============================================================================

  private clock_res_get(clock_id: number, resolution_ptr: number): number {
    if (!this.view) return WASIErrno.INVAL;

    // All clocks have nanosecond resolution
    const resolution = 1n;
    this.view.setBigUint64(resolution_ptr, resolution, true);

    return WASIErrno.SUCCESS;
  }

  private clock_time_get(clock_id: number, precision: bigint, time_ptr: number): number {
    if (!this.view) return WASIErrno.INVAL;

    let time: bigint;
    switch (clock_id) {
      case WASIClockId.REALTIME:
        time = BigInt(Date.now()) * 1000000n; // Convert ms to ns
        break;
      case WASIClockId.MONOTONIC:
        time = BigInt(Math.floor(performance.now() * 1000000)); // Convert ms to ns
        break;
      case WASIClockId.PROCESS_CPUTIME_ID:
      case WASIClockId.THREAD_CPUTIME_ID:
        time = BigInt(Math.floor(performance.now() * 1000000));
        break;
      default:
        return WASIErrno.INVAL;
    }

    this.view.setBigUint64(time_ptr, time, true);
    return WASIErrno.SUCCESS;
  }

  // ============================================================================
  // Random
  // ============================================================================

  private random_get(buf: number, buf_len: number): number {
    if (!this.view) return WASIErrno.INVAL;
    if (!this.capabilities.has('crypto')) {
      return WASIErrno.NOTCAPABLE;
    }

    const buffer = new Uint8Array(this.memory!.buffer, buf, buf_len);
    crypto.getRandomValues(buffer);

    return WASIErrno.SUCCESS;
  }

  // ============================================================================
  // File Descriptors - Read/Write
  // ============================================================================

  private async fd_read(fd: number, iovs_ptr: number, iovs_len: number, nread_ptr: number): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    if (!this.allowRead && !this.capabilities.has('file-read')) {
      return WASIErrno.NOTCAPABLE;
    }

    let totalRead = 0;

    try {
      for (let i = 0; i < iovs_len; i++) {
        const iov_ptr = iovs_ptr + i * 8;
        const buf_ptr = this.view.getUint32(iov_ptr, true);
        const buf_len = this.view.getUint32(iov_ptr + 4, true);

        const buffer = new Uint8Array(this.memory!.buffer, buf_ptr, buf_len);

        let nread = 0;
        if (fdEntry.type === 'stdin') {
          // For stdin, we'd need to use a ReadableStreamDefaultReader
          // For now, return 0 to indicate no data available
          nread = 0;
        } else if (fdEntry.file) {
          nread = await fdEntry.file.read(buffer) ?? 0;
        }

        totalRead += nread;
        if (nread < buf_len) break; // EOF or partial read
      }

      this.view.setUint32(nread_ptr, totalRead, true);
      return WASIErrno.SUCCESS;
    } catch (error) {
      logger.error('fd_read error', error as Error);
      return this.mapDenoError(error);
    }
  }

  private async fd_write(fd: number, iovs_ptr: number, iovs_len: number, nwritten_ptr: number): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    if (!this.allowWrite && !this.capabilities.has('file-write')) {
      return WASIErrno.NOTCAPABLE;
    }

    let totalWritten = 0;

    try {
      for (let i = 0; i < iovs_len; i++) {
        const iov_ptr = iovs_ptr + i * 8;
        const buf_ptr = this.view.getUint32(iov_ptr, true);
        const buf_len = this.view.getUint32(iov_ptr + 4, true);

        const buffer = new Uint8Array(this.memory!.buffer, buf_ptr, buf_len);

        let nwritten = 0;
        if (fdEntry.type === 'stdout') {
          // For stdout, we'd need to use a WritableStreamDefaultWriter
          // For now, write to console and return buffer length
          console.log(new TextDecoder().decode(buffer));
          nwritten = buffer.length;
        } else if (fdEntry.type === 'stderr') {
          // For stderr, write to console.error
          console.error(new TextDecoder().decode(buffer));
          nwritten = buffer.length;
        } else if (fdEntry.file) {
          nwritten = await fdEntry.file.write(buffer);
        }

        totalWritten += nwritten;
      }

      this.view.setUint32(nwritten_ptr, totalWritten, true);
      return WASIErrno.SUCCESS;
    } catch (error) {
      logger.error('fd_write error', error as Error);
      return this.mapDenoError(error);
    }
  }

  // ============================================================================
  // File Descriptors - Seek/Tell
  // ============================================================================

  private async fd_seek(fd: number, offset: bigint, whence: number, newoffset_ptr: number): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry || !fdEntry.file) return WASIErrno.BADF;

    try {
      const seekMode = whence === 0 ? Deno.SeekMode.Start : whence === 1 ? Deno.SeekMode.Current : Deno.SeekMode.End;
      const newOffset = await fdEntry.file.seek(Number(offset), seekMode);
      this.view.setBigUint64(newoffset_ptr, BigInt(newOffset), true);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async fd_tell(fd: number, offset_ptr: number): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry || !fdEntry.file) return WASIErrno.BADF;

    try {
      const offset = await fdEntry.file.seek(0, Deno.SeekMode.Current);
      this.view.setBigUint64(offset_ptr, BigInt(offset), true);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  // ============================================================================
  // File Descriptors - Close/Sync
  // ============================================================================

  private fd_close(fd: number): number {
    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    if (fdEntry.file) {
      fdEntry.file.close();
    }

    delete this.fds[fd];
    return WASIErrno.SUCCESS;
  }

  private async fd_sync(fd: number): Promise<number> {
    const fdEntry = this.fds[fd];
    if (!fdEntry || !fdEntry.file) return WASIErrno.BADF;

    try {
      await fdEntry.file.sync();
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async fd_datasync(fd: number): Promise<number> {
    const fdEntry = this.fds[fd];
    if (!fdEntry || !fdEntry.file) return WASIErrno.BADF;

    try {
      await fdEntry.file.sync();
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  // ============================================================================
  // File Descriptors - Stat
  // ============================================================================

  private fd_fdstat_get(fd: number, stat_ptr: number): number {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    const filetype = fdEntry.type === 'directory' ? WASIFiletype.DIRECTORY : WASIFiletype.REGULAR_FILE;
    const rights = fdEntry.rights ?? 0n;
    const inheriting = fdEntry.inheriting ?? 0n;

    this.view.setUint8(stat_ptr, filetype);
    this.view.setUint16(stat_ptr + 2, fdEntry.flags ?? 0, true);
    this.view.setBigUint64(stat_ptr + 8, rights, true);
    this.view.setBigUint64(stat_ptr + 16, inheriting, true);

    return WASIErrno.SUCCESS;
  }

  private fd_fdstat_set_flags(fd: number, flags: number): number {
    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    fdEntry.flags = flags;
    return WASIErrno.SUCCESS;
  }

  private async fd_filestat_get(fd: number, stat_ptr: number): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    try {
      const stat = fdEntry.file ? await fdEntry.file.stat() : await Deno.stat(fdEntry.path!);
      this.writeFilestat(stat_ptr, stat);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async fd_filestat_set_size(fd: number, size: bigint): Promise<number> {
    const fdEntry = this.fds[fd];
    if (!fdEntry || !fdEntry.file) return WASIErrno.BADF;

    try {
      await fdEntry.file.truncate(Number(size));
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async fd_filestat_set_times(
    fd: number,
    atim: bigint,
    mtim: bigint,
    fst_flags: number
  ): Promise<number> {
    const fdEntry = this.fds[fd];
    if (!fdEntry || !fdEntry.path) return WASIErrno.BADF;

    try {
      const atime = fst_flags & 0x01 ? new Date() : new Date(Number(atim / 1000000n));
      const mtime = fst_flags & 0x02 ? new Date() : new Date(Number(mtim / 1000000n));

      await Deno.utime(fdEntry.path, atime, mtime);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  // ============================================================================
  // File Descriptors - Readdir
  // ============================================================================

  private async fd_readdir(
    fd: number,
    buf: number,
    buf_len: number,
    cookie: bigint,
    bufused_ptr: number
  ): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry || fdEntry.type !== 'directory') return WASIErrno.BADF;

    try {
      const entries: Deno.DirEntry[] = [];
      for await (const entry of Deno.readDir(fdEntry.path!)) {
        entries.push(entry);
      }

      let offset = buf;
      let written = 0;

      for (let i = Number(cookie); i < entries.length && written < buf_len; i++) {
        const entry = entries[i];
        const name = new TextEncoder().encode(entry.name);

        // Check if we have space
        const entrySize = 24 + name.length;
        if (written + entrySize > buf_len) break;

        // Write entry
        this.view.setBigUint64(offset, BigInt(i + 1), true); // d_next (cookie)
        offset += 8;

        this.view.setBigUint64(offset, BigInt(i), true); // d_ino
        offset += 8;

        this.view.setUint32(offset, name.length, true); // d_namlen
        offset += 4;

        const filetype = entry.isDirectory ? WASIFiletype.DIRECTORY : WASIFiletype.REGULAR_FILE;
        this.view.setUint32(offset, filetype, true); // d_type
        offset += 4;

        new Uint8Array(this.memory!.buffer, offset, name.length).set(name);
        offset += name.length;

        written += entrySize;
      }

      this.view.setUint32(bufused_ptr, written, true);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  // ============================================================================
  // File Descriptors - Prestat (Preopened Directories)
  // ============================================================================

  private fd_prestat_get(fd: number, prestat_ptr: number): number {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry || fdEntry.type !== 'directory' || !fdEntry.virtualPath) {
      return WASIErrno.BADF;
    }

    const nameLen = new TextEncoder().encode(fdEntry.virtualPath).length;

    this.view.setUint8(prestat_ptr, 0); // PREOPENTYPE_DIR
    this.view.setUint32(prestat_ptr + 4, nameLen, true);

    return WASIErrno.SUCCESS;
  }

  private fd_prestat_dir_name(fd: number, path_ptr: number, path_len: number): number {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry || fdEntry.type !== 'directory' || !fdEntry.virtualPath) {
      return WASIErrno.BADF;
    }

    const name = new TextEncoder().encode(fdEntry.virtualPath);
    if (name.length > path_len) return WASIErrno.NAMETOOLONG;

    new Uint8Array(this.memory!.buffer, path_ptr, name.length).set(name);

    return WASIErrno.SUCCESS;
  }

  // ============================================================================
  // Path Operations
  // ============================================================================

  private async path_open(
    fd: number,
    dirflags: number,
    path_ptr: number,
    path_len: number,
    oflags: number,
    fs_rights_base: bigint,
    fs_rights_inheriting: bigint,
    fdflags: number,
    opened_fd_ptr: number
  ): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry || fdEntry.type !== 'directory') return WASIErrno.BADF;

    try {
      // Read path
      const pathBytes = new Uint8Array(this.memory!.buffer, path_ptr, path_len);
      const path = new TextDecoder().decode(pathBytes);

      // Resolve full path
      const fullPath = resolve(fdEntry.path!, path);

      // Convert WASI flags to Deno open options
      const options: Deno.OpenOptions = {
        read: !!(fs_rights_base & WASIRights.FD_READ),
        write: !!(fs_rights_base & WASIRights.FD_WRITE),
        create: !!(oflags & WASIOflags.CREAT),
        truncate: !!(oflags & WASIOflags.TRUNC),
        append: !!(fdflags & WASIFdflags.APPEND),
      };

      // Security checks
      if (options.read && !this.allowRead && !this.capabilities.has('file-read')) {
        return WASIErrno.NOTCAPABLE;
      }
      if ((options.write || options.create) && !this.allowWrite && !this.capabilities.has('file-write')) {
        return WASIErrno.NOTCAPABLE;
      }

      // Open file
      const file = await Deno.open(fullPath, options);

      // Add to file descriptors
      const newFd = this.fds.length;
      this.fds.push({
        type: 'file',
        file,
        path: fullPath,
        rights: fs_rights_base,
        inheriting: fs_rights_inheriting,
        flags: fdflags,
      });

      this.view.setUint32(opened_fd_ptr, newFd, true);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async path_filestat_get(
    fd: number,
    flags: number,
    path_ptr: number,
    path_len: number,
    stat_ptr: number
  ): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    try {
      const pathBytes = new Uint8Array(this.memory!.buffer, path_ptr, path_len);
      const path = new TextDecoder().decode(pathBytes);
      const fullPath = resolve(fdEntry.path!, path);

      const stat = await Deno.stat(fullPath);
      this.writeFilestat(stat_ptr, stat);

      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async path_filestat_set_times(
    fd: number,
    flags: number,
    path_ptr: number,
    path_len: number,
    atim: bigint,
    mtim: bigint,
    fst_flags: number
  ): Promise<number> {
    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    try {
      const pathBytes = new Uint8Array(this.memory!.buffer, path_ptr, path_len);
      const path = new TextDecoder().decode(pathBytes);
      const fullPath = resolve(fdEntry.path!, path);

      const atime = fst_flags & 0x01 ? new Date() : new Date(Number(atim / 1000000n));
      const mtime = fst_flags & 0x02 ? new Date() : new Date(Number(mtim / 1000000n));

      await Deno.utime(fullPath, atime, mtime);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async path_create_directory(fd: number, path_ptr: number, path_len: number): Promise<number> {
    if (!this.allowWrite && !this.capabilities.has('file-write')) {
      return WASIErrno.NOTCAPABLE;
    }

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    try {
      const pathBytes = new Uint8Array(this.memory!.buffer, path_ptr, path_len);
      const path = new TextDecoder().decode(pathBytes);
      const fullPath = resolve(fdEntry.path!, path);

      await Deno.mkdir(fullPath);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async path_remove_directory(fd: number, path_ptr: number, path_len: number): Promise<number> {
    if (!this.allowWrite && !this.capabilities.has('file-write')) {
      return WASIErrno.NOTCAPABLE;
    }

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    try {
      const pathBytes = new Uint8Array(this.memory!.buffer, path_ptr, path_len);
      const path = new TextDecoder().decode(pathBytes);
      const fullPath = resolve(fdEntry.path!, path);

      await Deno.remove(fullPath, { recursive: false });
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async path_unlink_file(fd: number, path_ptr: number, path_len: number): Promise<number> {
    if (!this.allowWrite && !this.capabilities.has('file-write')) {
      return WASIErrno.NOTCAPABLE;
    }

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    try {
      const pathBytes = new Uint8Array(this.memory!.buffer, path_ptr, path_len);
      const path = new TextDecoder().decode(pathBytes);
      const fullPath = resolve(fdEntry.path!, path);

      await Deno.remove(fullPath);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async path_readlink(
    fd: number,
    path_ptr: number,
    path_len: number,
    buf_ptr: number,
    buf_len: number,
    bufused_ptr: number
  ): Promise<number> {
    if (!this.view) return WASIErrno.INVAL;

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    try {
      const pathBytes = new Uint8Array(this.memory!.buffer, path_ptr, path_len);
      const path = new TextDecoder().decode(pathBytes);
      const fullPath = resolve(fdEntry.path!, path);

      const target = await Deno.readLink(fullPath);
      const targetBytes = new TextEncoder().encode(target);

      if (targetBytes.length > buf_len) return WASIErrno.NAMETOOLONG;

      new Uint8Array(this.memory!.buffer, buf_ptr, targetBytes.length).set(targetBytes);
      this.view.setUint32(bufused_ptr, targetBytes.length, true);

      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async path_rename(
    old_fd: number,
    old_path_ptr: number,
    old_path_len: number,
    new_fd: number,
    new_path_ptr: number,
    new_path_len: number
  ): Promise<number> {
    if (!this.allowWrite && !this.capabilities.has('file-write')) {
      return WASIErrno.NOTCAPABLE;
    }

    const oldFdEntry = this.fds[old_fd];
    const newFdEntry = this.fds[new_fd];
    if (!oldFdEntry || !newFdEntry) return WASIErrno.BADF;

    try {
      const oldPathBytes = new Uint8Array(this.memory!.buffer, old_path_ptr, old_path_len);
      const oldPath = new TextDecoder().decode(oldPathBytes);
      const oldFullPath = resolve(oldFdEntry.path!, oldPath);

      const newPathBytes = new Uint8Array(this.memory!.buffer, new_path_ptr, new_path_len);
      const newPath = new TextDecoder().decode(newPathBytes);
      const newFullPath = resolve(newFdEntry.path!, newPath);

      await Deno.rename(oldFullPath, newFullPath);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  private async path_symlink(
    old_path_ptr: number,
    old_path_len: number,
    fd: number,
    new_path_ptr: number,
    new_path_len: number
  ): Promise<number> {
    if (!this.allowWrite && !this.capabilities.has('file-write')) {
      return WASIErrno.NOTCAPABLE;
    }

    const fdEntry = this.fds[fd];
    if (!fdEntry) return WASIErrno.BADF;

    try {
      const oldPathBytes = new Uint8Array(this.memory!.buffer, old_path_ptr, old_path_len);
      const oldPath = new TextDecoder().decode(oldPathBytes);

      const newPathBytes = new Uint8Array(this.memory!.buffer, new_path_ptr, new_path_len);
      const newPath = new TextDecoder().decode(newPathBytes);
      const newFullPath = resolve(fdEntry.path!, newPath);

      await Deno.symlink(oldPath, newFullPath);
      return WASIErrno.SUCCESS;
    } catch (error) {
      return this.mapDenoError(error);
    }
  }

  // ============================================================================
  // Process
  // ============================================================================

  private proc_exit(code: number): never {
    logger.info(`WASM process exit with code: ${code}`);
    throw new Error(`WASM process exited with code ${code}`);
  }

  // ============================================================================
  // Scheduling
  // ============================================================================

  private sched_yield(): number {
    // No-op in JavaScript (cooperative scheduling)
    return WASIErrno.SUCCESS;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private writeFilestat(ptr: number, stat: Deno.FileInfo): void {
    if (!this.view) return;

    const filetype = stat.isDirectory
      ? WASIFiletype.DIRECTORY
      : stat.isSymlink
      ? WASIFiletype.SYMBOLIC_LINK
      : WASIFiletype.REGULAR_FILE;

    this.view.setBigUint64(ptr, 0n, true); // dev
    this.view.setBigUint64(ptr + 8, 0n, true); // ino
    this.view.setUint8(ptr + 16, filetype); // filetype
    this.view.setBigUint64(ptr + 24, BigInt(stat.nlink ?? 1), true); // nlink
    this.view.setBigUint64(ptr + 32, BigInt(stat.size), true); // size
    this.view.setBigUint64(ptr + 40, BigInt(stat.atime?.getTime() ?? 0) * 1000000n, true); // atim
    this.view.setBigUint64(ptr + 48, BigInt(stat.mtime?.getTime() ?? 0) * 1000000n, true); // mtim
    this.view.setBigUint64(ptr + 56, BigInt(stat.birthtime?.getTime() ?? 0) * 1000000n, true); // ctim
  }

  private mapDenoError(error: unknown): number {
    if (!(error instanceof Error)) return WASIErrno.IO;

    const message = error.message;

    if (message.includes('NotFound')) return WASIErrno.NOENT;
    if (message.includes('PermissionDenied')) return WASIErrno.ACCES;
    if (message.includes('AlreadyExists')) return WASIErrno.EXIST;
    if (message.includes('InvalidData')) return WASIErrno.INVAL;
    if (message.includes('NotConnected')) return WASIErrno.NOTCONN;
    if (message.includes('BrokenPipe')) return WASIErrno.PIPE;
    if (message.includes('WriteZero')) return WASIErrno.NOSPC;
    if (message.includes('TimedOut')) return WASIErrno.TIMEDOUT;
    if (message.includes('Interrupted')) return WASIErrno.INTR;
    if (message.includes('BadResource')) return WASIErrno.BADF;
    if (message.includes('Busy')) return WASIErrno.BUSY;

    logger.warn(`Unmapped Deno error: ${message}`);
    return WASIErrno.IO;
  }
}

/**
 * Create WASI imports with default configuration
 */
export function createWASI(options: WASIOptions = {}): WASI {
  return new WASI(options);
}
