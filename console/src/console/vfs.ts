import { VfsAbstractNode } from './vfs-filesystem';
import * as fs from 'fs';
import * as stream from 'stream';
import * as events from 'events';
import * as util from 'util';

export type PathLike = fs.PathLike;

export interface Stats extends fs.Stats {
     typeChar: string;
}



export function readFile (path: PathLike | number | VfsAbstractNode,
                          options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
    if (path instanceof VfsAbstractNode) {
        return path.readFile(options);
    }
    return fs.readFile.__promisify__(path, options);
}

export function stats (path: PathLike | VfsAbstractNode): Promise<fs.Stats> {
    if (path instanceof VfsAbstractNode) {
        return Promise.resolve(path.stats);
    }
    return fs.stat.__promisify__(path);
}

export function writeFile (path: PathLike | number | VfsAbstractNode, data: any,
                           options: { encoding?: string | null; mode?: number | string; flag?: string; }
                                    | string | undefined | null): Promise<void> {
    if (path instanceof VfsAbstractNode) {
        return path.writeFile(data, options);
    }
    return fs.writeFile.__promisify__(path, data, options);
}

export function createReadStream (path: PathLike | VfsAbstractNode,
                                  options?: string |
                                            {
                                                flags?: string;
                                                encoding?: string;
                                                fd?: number;
                                                mode?: number;
                                                autoClose?: boolean;
                                                start?: number;
                                                end?: number;
                                            }): fs.ReadStream {
    if (path instanceof VfsAbstractNode) {
        return path.createReadStream(options);
    }
    return fs.createReadStream(path, options);
}

export function createWriteStream (path: PathLike | VfsAbstractNode,
                                   options?: string |
                                             {
                                                flags?: string;
                                                defaultEncoding?: string;
                                                fd?: number;
                                                mode?: number;
                                                autoClose?: boolean;
                                                start?: number;
                                            }): fs.WriteStream {
    if (path instanceof VfsAbstractNode) {
        return path.createWriteStream(options);
    }
    return fs.createWriteStream(path, options);
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



