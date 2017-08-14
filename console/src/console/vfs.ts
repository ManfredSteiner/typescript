import { VfsAbstractNode } from './vfs-filesystem';
import * as fs from 'fs';
import * as stream from 'stream';
import * as events from 'events';
import * as util from 'util';

export type PathLike = fs.PathLike;

export interface Stats {
    uid: number;
    gid: number;
    size: number;
    atime: Date;
    mtime: Date;
    ctime: Date;
    birthtime: Date;
    fsstats: fs.Stats;
    typeChar: string;
    isFile(): boolean;
    isDirectory(): boolean;
    isBlockDevice(): boolean;
    isCharacterDevice(): boolean;
    isSymbolicLink(): boolean;
    isFIFO(): boolean;
    isSocket(): boolean;
    isFsStat(): boolean;
}

export interface ReadStream extends stream.Readable {
    bytesRead: number;
    path: string | Buffer;
    close(): void;
    destroy(): void;
}

export interface WriteStream extends stream.Writable {
    bytesWritten: number;
    path: string | Buffer;
    close(): void;
}

// export function close (fd: number): Promise<void> {
//     return Promise.resolve();
// }

// export function open (path: PathLike, flags: string | number, mode: string | number | undefined | null): Promise<number> {
//     return new Promise<number>( (resolve, reject) => {
//         resolve(-1);
//     });
// }

export function readFile (path: PathLike | number | VfsAbstractNode,
                          options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
    if (path instanceof VfsAbstractNode) {
        return path.readFile(options);
    }
    return new Promise<string | Buffer>( (resolve, reject) => {
        resolve('');
    });
}

export function stat (path: PathLike): Promise<Stats> {
    return new Promise<Stats>( (resolve, reject) => {
        resolve();
    });
}

export function writeFile (path: PathLike | number | VfsAbstractNode, data: any,
                           options: { encoding?: string | null; mode?: number | string; flag?: string; }
                                    | string | undefined | null): Promise<void> {
    return new Promise<void>( (resolve, reject) => {
        resolve();
    });
}

export function createReadStream (path: PathLike | VfsAbstractNode, options?: string | {
        flags?: string;
        encoding?: string;
        fd?: number;
        mode?: number;
        autoClose?: boolean;
        start?: number;
        end?: number;
    }): ReadStream {
    return undefined;
}

export function createWriteStream(path: PathLike | VfsAbstractNode, options?: string | {
        flags?: string;
        defaultEncoding?: string;
        fd?: number;
        mode?: number;
        autoClose?: boolean;
        start?: number;
    }): WriteStream {
    return undefined;
}



export class VfsUser {
  private _uid: number;
  private _gid: number;
  private _name: string;
  private _home: string;
  private _isAdmin: boolean;

  public constructor (uid: number, gid: number, name: string, home: string, isAdmin?: boolean) {
      this._uid = uid;
      this._gid = gid;
      this._name = name;
      this._home = home;
      this._isAdmin = isAdmin;
  }

  public get uid (): number {
      return this._uid;
  }

  public get gid (): number {
      return this._gid;
  }

  public get name (): string {
      return this._name;
  }

  public get home (): string {
      return this._home;
  }

  public isAdmin (): boolean {
      return this._isAdmin === true;
  }
}


export class VfsGroup {
  private _gid: number;
  private _name: string;
  private _members: VfsUser [];


  public constructor (gid: number, name: string, members: VfsUser []) {
      this._gid = gid;
      this._name = name;
      this._members = members;

  }

  public get gid (): number {
      return this._gid;
  }

  public get name (): string {
      return this._name;
  }

  public get members (): VfsUser [] {
      return this._members;
  }
}



