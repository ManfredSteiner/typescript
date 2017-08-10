
import * as stream from 'stream';

import { VfsAbstractNode, VfsDirectoryNode } from './vfs-node';
import { IVfsShellUser } from './vfs-shell-user';

// import * as debugsx from 'debug-sx';
// const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:Vfs');

export class Vfs {
    private static _instance: Vfs;

    public static get Instance (): Vfs {
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

    public getChildOld (absolutPath: string): VfsAbstractNode {
        if (!absolutPath.startsWith('/')) {
            return undefined;
        }
        return this._root.getChild(absolutPath.substr(1), null);
    }

    public getChild (path: string, user: IVfsShellUser, start: VfsDirectoryNode): VfsAbstractNode {
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

    public getChilds (path: string, user: IVfsShellUser, start: VfsDirectoryNode): VfsAbstractNode [] {
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

    public getDirectory (path: string, user: IVfsShellUser, start: VfsDirectoryNode): VfsDirectoryNode {
        const rv = this.getChild (path, user, start);
        if (rv instanceof VfsDirectoryNode) {
            return rv;
        } else {
            return undefined;
        }
    }

    public getHomeDirectory(user: IVfsShellUser): VfsDirectoryNode {
        return this.getDirectory(user.getHome(), user, undefined) || this._root;
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


