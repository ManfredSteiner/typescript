
import * as fs from 'fs';
import * as util from 'util';

import * as vfs from './vfs';


export class VfsFilesystem {
    private static _instance: VfsFilesystem;

    public static get Instance (): VfsFilesystem {
        return this._instance || (this._instance = new this());
    }

    // ****************************************************************
    private _root: VfsDirectoryNode;

    private constructor () {
        this._root = new VfsRootDirectory();
    }

    public get root () {
        return this._root;
    }

    public refresh (): Promise<any> {
        return this._root.refreshAll();
    }


    public getChild (path: string, user: vfs.VfsUser, start: VfsDirectoryNode): VfsAbstractNode {
        if (path.startsWith('/')) {
            return this._root.getChild(path.substr(1), user);
        }
        if (path === '~') {
            return this.getHomeDirectory(user);
        }
        if (path.startsWith('~/')) {
            return this.getHomeDirectory(user).getChild(path.substr(2), user);
        }
        return start.getChild(path, user);
    }

    public getChilds (path: string, user: vfs.VfsUser, start: VfsDirectoryNode): VfsAbstractNode [] {
        if (path.startsWith('/')) {
            return this._root.getChilds(path.substr(1), user);
        }
        if (path === '~') {
            return [ this.getHomeDirectory(user) ];
        }
        if (path.startsWith('~/')) {
            return this.getHomeDirectory(user).getChilds(path.substr(2), user);
        }
        return start.getChilds(path, user);
    }

    public getDirectory (path: string, user: vfs.VfsUser, start: VfsDirectoryNode): VfsDirectoryNode {
        const rv = this.getChild (path, user, start);
        if (rv instanceof VfsDirectoryNode) {
            return rv;
        } else {
            return undefined;
        }
    }

    public getHomeDirectory(user: vfs.VfsUser): VfsDirectoryNode {
        return this.getDirectory(user.home, user, undefined) || this._root;
    }

}


// **************************************************************
// *
// **************************************************************

export abstract class VfsAbstractNode {

    public static toDateString (time: number): string {
        if (time === undefined || time <= 0) {
            return '';
        }
        const d = new Date(time);
        return VfsAbstractNode.dateFormatter.format(time);
    }

    protected static dateFormatter = new Intl.DateTimeFormat('de-AT', {
        weekday: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });

    // *****************************************************************

    private _name: string;
    private _parent: VfsDirectoryNode;
    private _stats: vfs.Stats;

    constructor(name: string, parent: VfsDirectoryNode, stats: vfs.Stats) {
        this._name = name;
        this._parent = parent;
        this._stats = stats;
    }

    public abstract refresh (): Promise<VfsAbstractNode>;

    public get name(): string {
        return this._name;
    }

    public get parent(): VfsDirectoryNode {
        return this._parent;
    }

    public get stats(): vfs.Stats {
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
                                                  autoClose?: boolean; start?: number; end?: number; }): fs.ReadStream {
        throw new Error('createReadStream() not supported');
    }

    public createWriteStream (options?: string | { flags?: string; defaultEncoding?: string; fd?: number; mode?: number;
                                                   autoClose?: boolean; start?: number; }): fs.WriteStream {
        throw new Error('createWriteStream() not supported');
    }
}


// **************************************************************
// *
// **************************************************************

export abstract class VfsDirectoryNode extends VfsAbstractNode {
    private _childs: VfsAbstractNode[];

    constructor(name: string, parent: VfsDirectoryNode, stats?: vfs.Stats) {
        super(name, parent, stats ||  new VfsDirectoryNodeStats());
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


    public getChild (path: string, user: vfs.VfsUser): VfsAbstractNode {
        const rv = this.getChilds(path, user);
        if (Array.isArray(rv) && rv.length === 1) {
            return rv[0];
        } else {
            return undefined;
        }
    }

    public getChilds(path: string, user: vfs.VfsUser): VfsAbstractNode [] {
        if (!path || path === '') {
            return [ this ];
        }
        if (path[0] === '/') {
            // let r: VfsDirectoryNode = this;
            // while (r.parent) {
            //     r = r.parent;
            // }
            // return r.getChild(path.substr(1), user);
            return [ this.root ];
        }
        const index = path.indexOf('/');
        const cn = index >= 0 ? path.substr(0, index) : path;
        let sn = index >= 0 ? path.substr(index + 1) : '';
        while (sn.startsWith('/')) {
            sn = sn.substr(1);
        }
        switch (cn) {
            case '.': return this.getChilds(sn, user);

            case '..': {
                if (this.parent && this.parent instanceof VfsDirectoryNode) {
                    return this.parent.getChilds(sn, user);
                } else {
                    return undefined;
                }
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
                if (result.length > 0 && sn === '') {
                    return result;
                } else if (result.length === 1 && result[0] instanceof VfsDirectoryNode) {
                    return (<VfsDirectoryNode>result[0]).getChilds(index >= 0 ? sn : '', user);
                } else {
                    return undefined;
                }
            }
        }
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


class VfsRootDirectory extends VfsDirectoryNode {
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
}


export class VfsOsFsDirectory extends VfsDirectoryNode {

    private _base: string;

    constructor (name: string, parent: VfsDirectoryNode, base: string, stats?: vfs.Stats) {
        super(name, parent, stats || new VfsOsFsStats(fs.statSync(base)));
        this._base = base;
    }

    public getChild (path: string, user: vfs.VfsUser): VfsAbstractNode {
        this.updateChilds();
        return super.getChild(path, user);
    }

    public getChilds (path: string, user: vfs.VfsUser): VfsAbstractNode [] {
        this.updateChilds();
        return super.getChilds(path, user);
    }

    public refresh(): Promise<VfsAbstractNode> {
        return Promise.resolve(this);
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
        const stats = fs.lstatSync(fileName);
        if (stats.isSymbolicLink()) {
            return undefined;
        } else if (stats.isSocket()) {
            return undefined;
        } else if (stats.isCharacterDevice()) {
            return undefined;
        } else if (stats.isBlockDevice()) {
            return undefined;
        } else if (stats.isFIFO()) {
            return undefined;
        } else if (stats.isDirectory()) {
           return new VfsOsFsDirectory(name, this, this._base + '/' + name, new VfsOsFsStats(stats));
        } else if (stats.isFile()) {
            return new VfsOsFsFile(name, this, this._base, new VfsOsFsStats(stats));
        }
        return undefined;
    }

}


class VfsOsFsFile extends VfsAbstractNode {

    private _base: string;

    constructor (name: string, parent: VfsDirectoryNode, base: string, stats?: vfs.Stats) {
        super(name, parent, stats || new VfsOsFsStats(fs.statSync(base + '/' + name)));
        this._base = base;
    }

    public refresh(): Promise<VfsAbstractNode> {
        return Promise.resolve(this);
    }

    public readFile (options?: { encoding?: string | null; flag?: string; } | string | undefined | null): Promise<string | Buffer> {
        const fileName = this._base + '/' + this.name;
        return util.promisify(fs.readFile)(fileName, options);
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

abstract class VfsAbstractNodeStats implements vfs.Stats {
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
    public get mtime (): Date { return this._mtime; }
    public get ctime (): Date { return this._ctime; }
    public set atime (value: Date) { this._atime = value; }
    public set mtime (value: Date) { this._atime = value; }
    public set ctime (value: Date) { this._atime = value; }
    public get birthtime (): Date { return this._birthtime; }
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
    public get typeChar (): string { return 'd'; }
    public isDirectory(): boolean { return true; }
}

class VfsFileStats extends VfsAbstractNodeStats {
    private _size: number;

    constructor (size: number) {
        super();
        this._size = size;
    }

    public get size (): number { return this._size; }
    public get typeChar (): string { return '-'; }
    public isFile(): boolean { return true; }

    public set size (value: number) {
        this._size = value;
    }
}

class VfsOsFsStats extends VfsAbstractNodeStats {

    private _fsstats: fs.Stats;

    constructor (stats: fs.Stats) {
        super();
        this._fsstats = stats;
    }

    public get uid (): number { return this._fsstats.uid; }
    public get gid (): number { return this._fsstats.gid; }
    public get size (): number { return this._fsstats.size; }
    public get atime (): Date { return this._fsstats.atime; }
    public get mtime (): Date { return this._fsstats.mtime; }
    public get ctime (): Date { return this._fsstats.ctime; }
    public get birthtime (): Date { return this._fsstats.birthtime; }
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
            return '-';
        } else if (this.isDirectory()) {
            return 'd';
        } else if (this.isBlockDevice()) {
            return 'b';
        } else if (this.isCharacterDevice()) {
            return 'c';
        } else if (this.isSymbolicLink()) {
            return 'l';
        } else if (this.isFIFO()) {
            return 'f';
        } else if (this.isSocket()) {
            return 's';
        } else {
            return '?';
        }
    }
}

