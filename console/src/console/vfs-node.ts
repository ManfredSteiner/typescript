
import * as stream from 'stream';

import { IVfsShellUser} from './vfs-shell-user';

// import * as debugsx from 'debug-sx';
// const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:VfsNode');

export abstract class VfsAbstractNode {
    protected static dateFormatter = new Intl.DateTimeFormat('de-AT', {
        weekday: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });


    private _name: string;
    private _parent: VfsDirectoryNode;

    constructor(name: string, parent: VfsDirectoryNode) {
        this._name = name;
        this._parent = parent;
    }

    public abstract refresh(): Promise<VfsAbstractNode>;
    public abstract get typeShortcut(): string;

    public get name(): string {
        return this._name;
    }

    public get parent(): VfsDirectoryNode {
        return this._parent;
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

}

export abstract class VfsDataNode<T> extends VfsAbstractNode {
    constructor(name: string, parent: VfsDirectoryNode) {
        super(name, parent);
    }

    public abstract printData(out: NodeJS.WritableStream, resource?: string): void;
    public abstract getData(resource?: string): T;
    public abstract setData(value: T, resource?: string): Promise<T>;

    public get typeShortcut(): string {
        return '-';
    }

    public toDateString(time: number): string {
        if (time === undefined || time <= 0) {
            return '';
        }
        const d = new Date(time);
        return VfsAbstractNode.dateFormatter.format(time);

    }

}

export abstract class VfsSimpleDataNode extends VfsDataNode<any> {
    constructor(name: string, parent: VfsDirectoryNode) {
        super(name, parent);
    }

    public abstract printData(out: IOutStream, resource?: string): void;

    public refresh(): Promise<VfsAbstractNode> {
        return Promise.resolve(this);
    }

    public getData(resource?: string): any {
        return undefined;
    }

    public setData(value: any, resource?: string): Promise<any> {
        return Promise.reject(new Error('not allowed'));
    }
}

export class VfsStaticTextFile extends VfsSimpleDataNode {

    private _content: string;

    constructor(name: string, parent: VfsDirectoryNode, content: string) {
        super (name, parent);
        this._content = content;
    }

    public getData(): string {
        return this._content;
    }

    public printData (out: NodeJS.WritableStream) {
       out.write(this._content);
    }
}


export abstract class VfsDirectoryNode extends VfsAbstractNode {
    private _childs: VfsAbstractNode[];

    constructor(name: string, parent: VfsDirectoryNode) {
        super(name, parent);
        this._childs = [];
    }

    public get typeShortcut(): string {
        return 'd';
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


    public get childs(): VfsAbstractNode[] {
        return this._childs;
    }


    public getChild(path: string, user: IVfsShellUser): VfsAbstractNode {
      const rv = this.getChilds(path, user);
      if (Array.isArray(rv) && rv.length === 1) {
          return rv[0];
      } else {
          return undefined;
      }
    }

    public getChilds(path: string, user: IVfsShellUser): VfsAbstractNode [] {
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
        const sn = index >= 0 ? path.substr(index + 1) : '';
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
                    return (<VfsDirectoryNode>result[0]).getChilds(index >= 0 ? path.substr(index + 1) : '', user);
                } else {
                    return undefined;
                }
            }
        }
    }

    public addChild(child: VfsAbstractNode) {
        this._childs.push(child);
    }

    public removeChild(child: VfsAbstractNode): boolean {
        const index = this._childs.findIndex(item => child === item);
        if (index < 0) {
            return false;
        }
        this._childs.splice(index, 1);
        return true;
    }

    public clear(): VfsAbstractNode[] {
        const rv = this._childs;
        this._childs = [];
        return rv;
    }
}


export interface IOutStream extends stream.Writable {
    write(chunk: any, cb?: Function): boolean;
    write(chunk: any, encoding?: string, cb?: Function): boolean;
    print(str: any): void;
    println(str?: any): void;
    format(...p: any[]): void;
    formatln(...p: any[]): void;
}


