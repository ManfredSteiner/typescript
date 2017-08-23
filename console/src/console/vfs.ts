
import * as fs from 'fs';
import * as stream from 'stream';
import * as events from 'events';
import * as util from 'util';
import { sprintf } from 'sprintf-js';

export type PathLike = fs.PathLike;

export interface Stats extends fs.Stats {
     typeChar: string;
     isFsStat(): boolean;
}

export function getRoot (): VfsDirectoryNode {
    return vfsfs.root;
}

export function setUser (user: VfsUser): VfsUser {
    return vfsfs.setUser(user);
}

export function getHomeDirectory (user: VfsUser): Promise<VfsDirectoryNode> {
    return vfsfs.getHomeDirectory(user);
}

export function getChild (path: string, user?: VfsUser, start?: VfsDirectoryNode): Promise<VfsAbstractNode> {
    return vfsfs.getChild(path, user, start);
}

export function getChilds (path: string, user?: VfsUser, start?: VfsDirectoryNode): Promise<VfsAbstractNode []> {
    return vfsfs.getChilds(path, user, start);
}

export function getDirectory (path: string, user?: VfsUser, start?: VfsDirectoryNode): Promise<VfsDirectoryNode> {
    return vfsfs.getDirectory(path, user, start);
}

export function getNodes (paths: string []): Promise<VfsAbstractNode []> {
    return vfsfs.getNodes(paths);
}

export function getNode (path: string): Promise<VfsAbstractNode> {
    return vfsfs.getNode(path);
}

export function readFile (path: PathLike | number | VfsAbstractNode,
                          options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
    if (path instanceof VfsAbstractNode) {
        return path.readFile(options);
    }
    if (typeof path === 'string') {
        if (path.startsWith('file://')) {
            path = path.substr(7);
        } else if (path.startsWith('vfs://')) {
            path = path.substr(6);
            throw new Error('not implemented (Promise needed');
        }
    }
    return util.promisify(fs.readFile)(path, options);
}

export function stats (path: PathLike | VfsAbstractNode): Promise<Stats> {
    if (path instanceof VfsAbstractNode) {
        return Promise.resolve(path.stat);
    }
    if (typeof path === 'string') {
        if (path.startsWith('file://')) {
            path = path.substr(7);
        } else if (path.startsWith('vfs://')) {
            path = path.substr(6);
            return new Promise<Stats>( (resolve, reject) => {
                vfsfs.getChild(<string>path).then( (result) => resolve(result.stat) ).catch( (err) => reject(err) );
            });
        }
    }
    return new Promise<Stats>( (resolve, reject) => {
        util.promisify(fs.stat)(<any>path).then( (stat) => {
            resolve( new VfsOsFsStats(stat));
        }).catch( err => reject(err) );
    });
}

export function writeFile (path: PathLike | number | VfsAbstractNode, data: any,
                           options: { encoding?: string | null; mode?: number | string; flag?: string; }
                                    | string | undefined | null): Promise<void> {
    if (path instanceof VfsAbstractNode) {
        return path.writeFile(data, options);
    }
    if (typeof path === 'string') {
        if (path.startsWith('file://')) {
            path = path.substr(7);
        } else if (path.startsWith('vfs://')) {
            path = path.substr(6);
            throw new Error('not implemented (Promise needed');
        }
    }
    return util.promisify(fs.writeFile)(path, options);
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
                                            }): stream.Readable {
    if (path instanceof VfsAbstractNode) {
        return path.createReadStream(options);
    }
    if (typeof path === 'string') {
        if (path.startsWith('file://')) {
            path = path.substr(7);
        } else if (path.startsWith('vfs://')) {
            path = path.substr(6);
            throw new Error('not implemented (Promise needed');
        }
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
                                            }): stream.Writable {
    if (path instanceof VfsAbstractNode) {
        return path.createWriteStream(options);
    }
    if (typeof path === 'string') {
        if (path.startsWith('file://')) {
            path = path.substr(7);
        } else if (path.startsWith('vfs://')) {
            path = path.substr(6);
            throw new Error('not implemented (Promise needed');
        }
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





// **************************************************************
// *
// **************************************************************

export abstract class VfsAbstractNode {

    // public static toDateString (time: number): string {
    //     if (time === undefined || time <= 0) {
    //         return '';
    //     }
    //     const d = new Date(time);
    //     return VfsAbstractNode.dateFormatter.format(time);
    // }

    // protected static dateFormatter = new Intl.DateTimeFormat('de-AT', {
    //     weekday: 'short',
    //     year: 'numeric',
    //     month: 'numeric',
    //     day: 'numeric',
    //     hour: 'numeric',
    //     minute: 'numeric',
    //     second: 'numeric'
    // });

    // *****************************************************************

    private _name: string;
    private _parent: VfsDirectoryNode;
    private _stats: Stats;

    constructor(name: string, parent: VfsDirectoryNode, stat: Stats) {
        this._name = name;
        this._parent = parent;
        this._stats = stat;
    }

    public abstract refresh (): Promise<VfsAbstractNode>;

    public get name(): string {
        return this._name;
    }

    public get parent(): VfsDirectoryNode {
        return this._parent;
    }

    public get stat(): Stats {
        return this._stats;
    }

    public get fullName(): string {
        let rv = this._name;
        let n: VfsAbstractNode = this;
        while (n._parent) {
            n = n._parent;
            rv = (n.name !== '/' ? n.name + '/' : n.name) + rv;
        }
        return rv;
    }

    public readFile (options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
        return Promise.reject('readFile() not supported')
    }

    public writeFile (data: any, options: { encoding?: string | null; mode?: number | string; flag?: string; }
                                          | string | undefined | null): Promise<void> {
        return Promise.reject('writeFile() not supported');
    }

    public createReadStream (options?: string | { flags?: string; encoding?: string; fd?: number; mode?: number;
                                                  autoClose?: boolean; start?: number; end?: number; }): stream.Readable {
        return new stream.Readable({ read: function (size) {
           this.emit('error', new Error('createReadStream not implemented'));
        }});
    }

    public createWriteStream (options?: string | { flags?: string; defaultEncoding?: string; fd?: number; mode?: number;
                                                   autoClose?: boolean; start?: number; }): stream.Writable {
        return new stream.Writable({ write: function (chunk, encoding, callback) {
            this.emit('error', new Error('createWriteStream not implemented'));
        }});
    }
}


// **************************************************************
// *
// **************************************************************

export abstract class VfsDirectoryNode extends VfsAbstractNode {
    private _childs: VfsAbstractNode[];

    constructor(name: string, parent: VfsDirectoryNode, stat?: Stats) {
        super(name, parent, stat ||  new VfsDirectoryNodeStats());
        this._childs = [];
    }


    public readFile (options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
        const err: NodeJS.ErrnoException = new Error('readFile fails on directory');
        return Promise.reject(err);
    }

    public get root(): VfsDirectoryNode {
        if (!this.parent) {
            return this;
        } else {
            return this.parent.root;
        }
    }

    public refreshAll(): Promise<any> {
        const promisses: Promise<any>[] = [this.refresh()];
        for (const c of this._childs) {
            if (c instanceof VfsDirectoryNode) {
                promisses.push(c.refreshAll());
            } else {
                promisses.push(c.refresh());
            }
        }
        return Promise.all(promisses);
    }


    public get childs (): VfsAbstractNode[] {
        return this._childs;
    }


    public getChild (path: string, user: VfsUser): Promise<VfsAbstractNode> {
        return new Promise<VfsAbstractNode>( (resolve, reject) => {
            this.getChilds(path, user).then( nodes => {
                if (Array.isArray(nodes) && nodes.length === 1) {
                    resolve(nodes[0]);
                } else {
                    resolve(undefined);
                }

            }).catch( err => reject(err) );
        });
    }

    public getChilds (path?: string, user?: VfsUser, resultIfNotFound?: VfsAbstractNode): Promise<VfsAbstractNode []> {
        user = user || vfsfs.getUser();
        if (!path || path === '') {
            return new Promise<VfsAbstractNode []>( (resolve, reject) => {
                this.refresh().then( () => resolve( [ this ])).catch(err => reject(err) );
            });
        }
        if (path[0] === '/') {
            // let r: VfsDirectoryNode = this;
            // while (r.parent) {
            //     r = r.parent;
            // }
            // return r.getChild(path.substr(1), user);
            return Promise.resolve([ this.root ]);
        }
        return new Promise<VfsAbstractNode []>( (resolve, reject) => {
            this.refresh().then( () => {
                const index = path.indexOf('/');
                const cn = index >= 0 ? path.substr(0, index) : path;
                let sn = index >= 0 ? path.substr(index + 1) : '';
                while (sn.startsWith('/')) {
                    sn = sn.substr(1);
                    if (sn.startsWith('.') && !sn.startsWith('..')) {
                        sn = sn.substr(1);
                    }
                }
                switch (cn) {
                    case '.': {
                        resolve(this._childs);
                        return;
                    }

                    case '..': {
                        if (this.parent && this.parent instanceof VfsDirectoryNode) {
                            this.parent.getChilds(sn, user).then( (results) => resolve(results) ).catch( err => reject(err));
                        } else if (resultIfNotFound) {
                            resolve([ resultIfNotFound ]);
                        } else {
                            resolve([]);
                        }
                        return;
                    }

                    default: {
                        let x = '^';
                        for (const c of cn) {
                            switch (c) {
                                case '*': x += '.*'; break;
                                case '?': x += '.'; break;
                                case '.': x += '\\.'; break;
                                case '\\': x += '\\\\'; break;
                                default: x += c;
                            }
                        }
                        x += '$';
                        const regExp = new RegExp(x);
                        const result = this._childs.filter(item => {
                            const r = item.name.match(regExp);
                            return Array.isArray(r) && r.length > 0;
                        });
                        if (result.length === 1 && result[0] instanceof VfsDirectoryNode) {
                            (<VfsDirectoryNode>result[0]).getChilds(index >= 0 ? sn : '', user).then( results => resolve(results) )
                                                                                               .catch( err => reject(err) );
                        } else if (result.length > 0 && sn === '') {
                            resolve(result);
                        } else if (resultIfNotFound) {
                            resolve( [ resultIfNotFound ]);
                        } else {
                            reject(path + ' not found');
                        }
                    }
                }
            }).catch(err => reject(err));
        });
    }

    public addChild (child: VfsAbstractNode, position?: number) {
        if (position === undefined || position < 0 || position >= this._childs.length) {
            this._childs.push(child);
        } else {
            this.childs.splice(position, 0, child);
        }
    }

    public removeChild (child: VfsAbstractNode): boolean {
        const index = this._childs.findIndex(item => child === item);
        if (index < 0) {
            return false;
        }
        this._childs.splice(index, 1);
        return true;
    }

    public removeAllChilds (): VfsAbstractNode[] {
        const rv = this._childs;
        this._childs = [];
        return rv;
    }

}


export class VfsRootDirectory extends VfsDirectoryNode {
    constructor () {
        super('/', null);
    }

    public refresh (): Promise<VfsRootDirectory> {
        return Promise.resolve(this);
    }
}

export class VfsStaticTextFile extends VfsAbstractNode {

    private _content: string;

    constructor (name: string, parent: VfsDirectoryNode, content: string) {
        super(name, parent, new VfsFileStats(content.length));
        this._content = content;
    }

    public refresh (): Promise<VfsAbstractNode> {
        return Promise.resolve(this);
    }

    public readFile (options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
        return Promise.resolve(this._content);
    }

    public createReadStream (options?: string | { flags?: string; encoding?: string; fd?: number; mode?: number;
                                                  autoClose?: boolean; start?: number; end?: number; }): stream.Readable {
        const rs = new stream.Readable({ read: function (size) { this.destroy() } });
        rs.push(this._content);
        return rs;
    }
}


export abstract class VfsDynamicTextDataFile extends VfsAbstractNode {

    constructor (name: string, parent: VfsDirectoryNode) {
        super(name, parent, new VfsFileStats(-1));
    }

    public refresh (): Promise<VfsAbstractNode> {
        return Promise.resolve(this);
    }

    public readFile (options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
        let result = '';
        const ws = new stream.Writable({ decodeStrings: false, write: function (chunk, encoding, done) {
            if (typeof(chunk) === 'string') {
                result += chunk;
            } else if (chunk instanceof Buffer) {
                result += chunk.toString();
            }
            done();
        } });
        return new Promise<string>( (resolve, reject) => {
            ws.on('error', (err) => reject(err) );
            ws.on('finish', () => resolve(result) );
            this.createContent(new FormatterStream(ws));
            ws.end();
        });
    }

    public createReadStream (options?: string | { flags?: string; encoding?: string; fd?: number; mode?: number;
                                                  autoClose?: boolean; start?: number; end?: number; }): stream.Readable {
        const rs = new stream.Readable({ objectMode: true, read: function (size) { } });
        const ws = new stream.Writable({ decodeStrings: false, write: function (chunk, encoding, done) {
                                           rs.push(chunk); done();
                                       } });
        const os = new FormatterStream(ws);
        os.on('error', (err) => {
            rs.emit('error', err);
        });
        process.nextTick( () => {
            this.createContent(os);
            rs.destroy();
        })
        return rs;
    }

    protected abstract createContent (out: FormatterStream): void;
}


export interface VfsOsFsNode {
     osfsPath: string
}

export class VfsOsFsDirectory extends VfsDirectoryNode implements VfsOsFsNode {

    private _base: string;

    constructor (name: string, parent: VfsDirectoryNode, base: string, stat?: Stats) {
        super(name, parent, stat || new VfsOsFsStats(fs.statSync(base)));
        this._base = base;
    }

    public getChild (path: string, user: VfsUser): Promise<VfsAbstractNode> {
        this.updateChilds();
        return super.getChild(path, user);
    }

    public getChilds (path?: string, user?: VfsUser): Promise<VfsAbstractNode []> {
        this.updateChilds();
        return super.getChilds(path, user);
    }

    public refresh(): Promise<VfsAbstractNode> {
        return Promise.resolve(this);
    }

    public get osfsPath (): string {
        return this._base;
    }

    private updateChilds () {
        const files = fs.readdirSync(this._base);
        files.sort();
        const childs: string [] = [];
        for (const c of this.childs) {
            childs.push(c.name);
        }
        childs.sort();
        for (let i = 0, j = 0; i < files.length || j < childs.length; i++, j++) {
            const fn = i < files.length ? files[i] : undefined;
            const cn = j < childs.length ? childs[j] : undefined;
            if (!cn || (fn && fn < cn)) {
                const c = this.createChild(fn);
                if (c) {
                    this.addChild(c, j);
                    childs.splice(j, 0, fn);
                } else {
                  j--;
                }
            } else if (!fn || (cn && fn > cn)) {
                this.removeChild(this.childs[j]);
                i--;
            }
        }
    }

    private createChild (name: string): VfsAbstractNode {
        const fileName = this._base + '/' + name;
        const stat = fs.lstatSync(fileName);
        if (stat.isSymbolicLink()) {
            return undefined;
        } else if (stat.isSocket()) {
            return undefined;
        } else if (stat.isCharacterDevice()) {
            return undefined;
        } else if (stat.isBlockDevice()) {
            return undefined;
        } else if (stat.isFIFO()) {
            return undefined;
        } else if (stat.isDirectory()) {
           return new VfsOsFsDirectory(name, this, this._base + '/' + name, new VfsOsFsStats(stat));
        } else if (stat.isFile()) {
            return new VfsOsFsFile(name, this, this._base, new VfsOsFsStats(stat));
        }
        return undefined;
    }

}


class VfsOsFsFile extends VfsAbstractNode implements VfsOsFsNode {

    private _base: string;

    constructor (name: string, parent: VfsDirectoryNode, base: string, stat?: Stats) {
        super(name, parent, stat || new VfsOsFsFileStats(base + '/' + name));
        this._base = base;
    }

    public refresh(): Promise<VfsAbstractNode> {
        return Promise.resolve(this);
    }

    public get osfsPath (): string {
        return this._base + '/' + this.name;
    }

    public readFile (options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
        const fileName = this._base + '/' + this.name;
        return util.promisify(fs.readFile)(fileName, options);
    }

    public writeFile (data: any, options: { encoding?: string | null; mode?: number | string; flag?: string; }
                                          | string | undefined | null): Promise<void> {
        const fileName = this._base + '/' + this.name;
        return util.promisify(fs.writeFile)(fileName, options);
    }


    public createReadStream (options?: string | { flags?: string; encoding?: string; fd?: number; mode?: number;
                                                  autoClose?: boolean; start?: number; end?: number; }): fs.ReadStream {
        const fileName = this._base + '/' + this.name;
        return fs.createReadStream(fileName, options);
    }


    public createWriteStream (options?: string | { flags?: string; defaultEncoding?: string; fd?: number; mode?: number;
                                                   autoClose?: boolean; start?: number; }): fs.WriteStream {
        const fileName = this._base + '/' + this.name;
        return fs.createWriteStream(fileName, options);
    }

}


// class VfsOsFsDirectory extends VfsDirectoryNode {
//     constructor (name: string, parent: VfsDirectoryNode, stats: fs.Stats) {
//         super(name, parent, new VfdOsFsStats(stats));
//     }

//     public refresh (): Promise<VfsRootDirectory> {
//         return Promise.resolve(this);
//     }
// }

abstract class VfsAbstractNodeStats implements Stats {
    protected _atime: Date;
    protected _mtime: Date;
    protected _ctime: Date;
    protected _birthtime: Date;

    constructor () {
        const now = new Date();
        this._atime = now;
        this._mtime = now;
        this._ctime = now;
        this._birthtime = now;
    }

    public abstract get size (): number;
    public abstract get typeChar (): string;

    public get uid (): number { return -1; }
    public get gid (): number { return -1; }
    public get dev (): number { return -1; };
    public get ino (): number { return -1; };
    public get mode (): number { return -1; };
    public get nlink (): number { return -1; };
    public get rdev (): number { return -1; };
    public get blksize (): number { return -1; };
    public get blocks (): number { return -1; };
    public get fsstats (): fs.Stats { return undefined };
    public get atime (): Date { return this._atime; }
    public get atimeMs (): number { return this.atime.getMilliseconds(); }
    public get mtime (): Date { return this._mtime; }
    public get mtimeMs (): number { return this._mtime.getMilliseconds(); }
    public get ctime (): Date { return this._ctime; }
    public get ctimeMs (): number { return this._ctime.getMilliseconds(); }
    public set atime (value: Date) { this._atime = value; }
    public set mtime (value: Date) { this._atime = value; }
    public set ctime (value: Date) { this._atime = value; }
    public get birthtime (): Date { return this._birthtime; }
    public get birthtimeMs (): number { return this._birthtime.getMilliseconds(); }
    public isFile(): boolean { return false; }
    public isDirectory(): boolean { return false; }
    public isBlockDevice(): boolean { return false; }
    public isCharacterDevice(): boolean { return false; }
    public isSymbolicLink(): boolean { return false; }
    public isFIFO(): boolean { return false; }
    public isSocket(): boolean { return false; }
    public isFsStat(): boolean { return false; }
}

class VfsDirectoryNodeStats extends VfsAbstractNodeStats {
    public get size (): number { return -1; }
    public get typeChar (): string { return ' d'; }
    public isDirectory(): boolean { return true; }
}

class VfsFileStats extends VfsAbstractNodeStats {
    private _size: number;

    constructor (size: number) {
        super();
        this._size = size;
    }

    public get size (): number { return this._size; }
    public get typeChar (): string { return ' -'; }
    public isFile(): boolean { return true; }

    public set size (value: number) {
        this._size = value;
    }
}

class VfsOsFsStats extends VfsAbstractNodeStats implements Stats {

    protected _fsstats: fs.Stats;

    constructor (stat: fs.Stats) {
        super();
        this._fsstats = stat;
    }

    public get uid (): number { return this._fsstats.uid; }
    public get gid (): number { return this._fsstats.gid; }
    public get size (): number { return this._fsstats.size; }
    public get atime (): Date { return this._fsstats.atime; }
    public get atimeMs (): number { return this._fsstats.atimeMs; }
    public get mtime (): Date { return this._fsstats.mtime; }
    public get mtimeMs (): number { return this._fsstats.mtimeMs; }
    public get ctime (): Date { return this._fsstats.ctime; }
    public get ctimeMs(): number { return this._fsstats.ctimeMs; }
    public get birthtime (): Date { return this._fsstats.birthtime; }
    public get birthtimeMs(): number { return this._fsstats.birthtimeMs; }
    public get fsstats (): fs.Stats { return this.fsstats; }
    public isFile(): boolean { return this._fsstats.isFile(); }
    public isDirectory(): boolean { return this._fsstats.isDirectory(); }
    public isBlockDevice(): boolean { return this._fsstats.isBlockDevice(); }
    public isCharacterDevice(): boolean { return this._fsstats.isCharacterDevice(); }
    public isSymbolicLink(): boolean { return this._fsstats.isSymbolicLink(); }
    public isFIFO(): boolean { return this._fsstats.isFIFO(); }
    public isSocket(): boolean { return this._fsstats.isSocket(); }
    public isFsStat(): boolean { return true; }

    public get typeChar (): string {
        if (this.isFile())  {
            return ':-';
        } else if (this.isDirectory()) {
            return ':d';
        } else if (this.isBlockDevice()) {
            return ':b';
        } else if (this.isCharacterDevice()) {
            return ':c';
        } else if (this.isSymbolicLink()) {
            return ':l';
        } else if (this.isFIFO()) {
            return ':f';
        } else if (this.isSocket()) {
            return ':s';
        } else {
            return ':?';
        }
    }
}

class VfsOsFsFileStats extends VfsOsFsStats {
    constructor (path: string) {
        super(undefined);
        if (fs.existsSync(path)) {
            this._fsstats = fs.statSync(path);
        } else {
            const fd = fs.openSync(path, 'w');
            fs.closeSync(fd);
            this._fsstats = fs.statSync(path);
        }
    }
}

class VfsFilesystem {
    private _root: VfsDirectoryNode;
    private _whoami: VfsUser;

    public constructor (whoami?: VfsUser) {
        this._root = new VfsRootDirectory();
        this._whoami = whoami;
    }

    public get root () {
        return this._root;
    }

    public getUser (): VfsUser {
        return this._whoami;
    }

    public setUser (user: VfsUser): VfsUser {
        const rv = this._whoami;
        this._whoami = user;
        return rv;
    }

    public refresh (): Promise<any> {
        return this._root.refreshAll();
    }


    public getChild (path: string, user?: VfsUser, start?: VfsDirectoryNode): Promise<VfsAbstractNode> {
        user = user || this._whoami;
        start = start || this._root;
        if (path.startsWith('/')) {
            return this._root.getChild(path.substr(1), user);
        }
        if (path === '~') {
            return Promise.resolve(this.getHomeDirectory(user));
        }
        if (path.startsWith('~/')) {
            return new Promise<VfsAbstractNode>( (resolve, reject) => {
                this.getHomeDirectory(user).then( (result) => {
                    resolve(result.getChild(path.substr(2), user));
                }).catch( err => reject(err));
            });
        }
        return start.getChild(path, user);
    }

    public getChilds (path: string, user?: VfsUser, start?: VfsDirectoryNode): Promise<VfsAbstractNode []> {
        user = user || this._whoami;
        start = start || this._root;
        if (path.startsWith('file://')) {
            return new Promise<VfsAbstractNode []>( (resolve, reject) => {
                    this.getNode(path).then( node => {
                    if (!node) {
                        reject(path + ' not found');
                    }
                    if (!node.stat.isDirectory()) {
                        resolve([]);
                    } else {
                        (<VfsDirectoryNode>node).getChilds().then( childs => {
                            resolve(childs);
                        }).catch( err => reject(err));
                    }

                }).catch( err => reject(err) );
            });
        }
        if (path.startsWith('/')) {
            return this._root.getChilds(path.substr(1), user);
        }
        if (path.startsWith('~/')) {
            return new Promise<VfsAbstractNode []>( (resolve, reject) => {
                this.getHomeDirectory(user).then( (result) => {
                    if (path === '~') {
                        resolve([ result ]);
                    } else {
                        result.getChilds(path.substr(2), user).then( results => {
                            resolve(results);
                        }).catch( errors => reject(errors));
                    }
                }).catch( err => reject(err));
            });
        }
        return start.getChilds(path, user);
    }

    public getDirectory (path: string, user?: VfsUser,
                         start?: VfsDirectoryNode, resultIfNotFound?: VfsDirectoryNode): Promise<VfsDirectoryNode> {
        user = user || this._whoami;
        start = start || this._root;
        return new Promise<VfsDirectoryNode>( (resolve, reject) => {
            this.getChild(path, user, start).then( node => {
                if (node instanceof VfsDirectoryNode) {
                    resolve(node);
                } else {
                    resolve(resultIfNotFound);
                }
            }).catch( err => reject(err) );
        });
    }

    public getNodes (paths: string []): Promise<VfsAbstractNode []> {
        if (!Array.isArray(paths) || paths.length === 0) {
            return Promise.resolve([]);
        }
        const promisses: Promise<VfsAbstractNode> [] = [];
        for (const p of paths) {
            promisses.push(this.getNode(p));
        }
        return Promise.all(promisses);
    }

    public createFileNode (path: string): Promise<VfsAbstractNode> {
        return Promise.reject(new Error('not implemented'));
    }

    public createDirectoryNode (path: string): Promise<VfsDirectoryNode> {
        return Promise.reject(new Error('not implemented'));
    }

    public getNode (path: string): Promise<VfsAbstractNode> {
        if (!path || path === '') {
            return Promise.resolve(undefined);
        }
        if (path.startsWith('file://')) {
            path = path.substr(7);
            let base, name;
            const i = path.lastIndexOf('/');
            if (i < 0) {
                base = '';
                name = path;
            } else {
                base = path.substr(0, i);
                name = path.substr(i + 1);
            }

            if (fs.existsSync(path)) {
                const stat = fs.statSync(path);
                if (stat.isFile()) {
                    return Promise.resolve(new VfsOsFsFile(name, undefined, base));
                } else if (stat.isDirectory()) {
                    return Promise.resolve(new VfsOsFsDirectory('', undefined, path));
                }
                return Promise.reject('file type of \'' + path + '\' not supported')
            } else {
                return Promise.resolve(undefined);
            }
            //     return Promise.resolve(new VfsOsFsFile(name, undefined, base));
            // }
            // try {
            //     return Promise.resolve(new VfsOsFsFile(name, undefined, base));
            // } catch (err) {
            //     if (err instanceof Error && err.message) {
            //         // in case of new file cannot be created
            //         return Promise.reject(err.message);
            //     } else {
            //         return Promise.reject(err);
            //     }
            // }
        }
        if (path.startsWith('vfs://')) {
            path = path.substr(6);
        }
        return this.getChild(path);
    }

    public getHomeDirectory(user: VfsUser): Promise<VfsDirectoryNode> {
        return this.getDirectory(user.home, user, undefined, this._root);
    }

}

export class FormatterStream extends stream.Writable {

    private static dateFormatter = new Intl.DateTimeFormat('de-AT', {
        weekday: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });

    private _out: NodeJS.WritableStream;
    private _isNetbeans: boolean;
    private _enabled: boolean;

    constructor (out?: NodeJS.WritableStream) {
        super({decodeStrings: false});
        this._out = out || process.stdout;
        this._isNetbeans = process.env.NB_EXEC_EXTEXECUTION_PROCESS_UUID !== undefined;
        this._enabled = true;
    }

    public _write (chunk: any, enc: string, next: Function): void {
        if (this._enabled) {
            this._out.write(chunk);
        }
        next();
    }

    public _destroy (error: Error, cb: Function) {
        if (error) {
            this.emit('error', error);
        }
        super._destroy(error, cb);
    }

    public set enabled (value: boolean) {
        this._enabled = value;
    }

    public get enabled (): boolean {
        return this._enabled;
    }

    public set out (out: NodeJS.WritableStream) {
        this._out = out;
    }

    public get out (): NodeJS.WritableStream {
        return this._out;
    }

    public print (str: any): void {
        if (!str) {
            return;
        }
        if (str instanceof Error) {
            str = util.format(str);
        } else if (typeof str  === 'object') {
            str = JSON.stringify(str);
        }
        this.write(str);
        if (this._isNetbeans && !str.endsWith('\\n')) {
            this.write('\n');
        }
    }

    public println (str?: any): void {
        if (str) {
            this.print(str);
        }
        this.write('\n');
    }

    public format (...p: any []): void {
        if (!p || p.length === 0) {
            return;
        }
        // const s = util.format.apply(util, p);
        const s = sprintf.apply(sprintf, p);
        this.write(s);
        if (this._isNetbeans && !p[0].endsWith('\\n')) {
            this.write('\n');
        }
    }

    public formatln (...p: any []): void {
        if (!p || p.length === 0) {
            return;
        }
        // const s = util.format.apply(util, p);
        const s = sprintf.apply(sprintf, p);
        this.write(s);
        if (this._isNetbeans && !p[0].endsWith('\\n')) {
            this.write('\n');
        }
        this.write('\n');
    }

    public toDateString (time: number): string {
        if (time === undefined || time <= 0) {
            return '';
        }
        const d = new Date(time);
        return FormatterStream.dateFormatter.format(time);
    }

}

const vfsfs: VfsFilesystem = new VfsFilesystem ();
