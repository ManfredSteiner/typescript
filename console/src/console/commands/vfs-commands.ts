
import { VfsShellCommand, IVfsShellCmds } from '../vfs-shell-command';
import { Vfs } from '../vfs';
import { VfsAbstractNode, VfsDataNode, VfsDirectoryNode } from '../vfs-node';
import { VfsCmdTest } from './vfs-cmd-test';

import * as byline from 'byline';

export function addDefaultCommands (shell: IVfsShellCmds, collection: { [ key: string]: VfsShellCommand }) {
    const cmdAlias = new VfsCmdAlias(shell); if (!collection[cmdAlias.name]) { collection[cmdAlias.name] = cmdAlias; }
    const cmdCat = new VfsCmdCat(shell); if (!collection[cmdCat.name]) { collection[cmdCat.name] = cmdCat; }
    const cmdCd = new VfsCmdCd(shell); if (!collection[cmdCd.name]) { collection[cmdCd.name] = cmdCd; }
    const cmdEcho = new VfsCmdEcho(); if (!collection[cmdEcho.name]) { collection[cmdEcho.name] = cmdEcho; }
    const cmdGrep = new VfsCmdGrep(); if (!collection[cmdGrep.name]) { collection[cmdGrep.name] = cmdGrep; }
    const cmdPwd = new VfsCmdPwd(shell); if (!collection[cmdPwd.name]) { collection[cmdPwd.name] = cmdPwd; }
    const cmdLs = new VfsCmdLs(shell); if (!collection[cmdLs.name]) { collection[cmdLs.name] = cmdLs; }
    const cmdWait = new VfsCmdWait(); if (!collection[cmdWait.name]) { collection[cmdWait.name] = cmdWait; }

    const cmdTest = new VfsCmdTest(shell); if (!collection[cmdTest.name]) { collection[cmdTest.name] = cmdTest; }
}

class VfsCmdAlias extends VfsShellCommand {

    private _alias: (alias: string, args: string []) => string;

    constructor (shellCmds: IVfsShellCmds) {
        super('alias');
        this._alias = shellCmds.alias;
    }

    public execute (args: string []): Promise<number> {
        const options = this.parseOptions(args, {});
        if (!options) {
            this.env.stderr.write('Error (alias): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }
        const rv = this._alias(args[1], args.length >= 3 ? args.slice(2) : []);
        this.print(rv);
        this.end();
        return Promise.resolve(0);
    }

    public getHelp (): string {
      return 'show aliases or set alias for command';
    }

    public getSyntax (): string {
        return '[ <alias> ] [ <command> [ args ... ]]';
    }

}

class VfsCmdEcho extends VfsShellCommand {
    constructor () {
        super('echo');
    }

    public execute (args: string []): Promise<number> {
        const options = this.parseOptions(args, { noLine: { short: 'n' }});
        if (!options) {
            this.env.stderr.write('Error (cd): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }

        if (args.length > 2) {
          this.end('echo: too much arguments');
          return Promise.reject(1);
        }
        if (args.length === 2) {
            if (options.noLine) {
                this.print(args[1]);
            } else {
                this.println(args[1]);
            }
        }

        this.end();
        return Promise.resolve(0);
    }

    public getHelp (): string {
      return 'echo argument on stdout';
    }

    public getSyntax (): string {
        return '[ --noLine | -n ] <value>';
    }

}


class VfsCmdGrep extends VfsShellCommand {
    private _regExp: RegExp;

    constructor () {
        super('grep');
    }

    public execute (args: string []): Promise<number> {
        const options = this.parseOptions(args, { });
        if (!options) {
            this.env.stderr.write('Error (pwd): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }

        if (args.length < 2) {
          this.env.stderr.write('invalid arguments\n');
          return Promise.reject(1);
      }

      const expr = args[1];
      if (expr.startsWith('/') && expr.endsWith('/')) {
        this._regExp = new RegExp(expr);
      } else {
        let x = '';
        for (const c of expr) {
            switch (c) {
                case '*': x += '.*'; break;
                case '?': x += '.'; break;
                case '.': x += '\\.'; break;
                case '\\': x += '\\\\'; break;
                default: x += c;
            }
        }
        this._regExp = new RegExp(x);
      }
      if (!this.env.stdin) {
        return Promise.resolve(0);
      }
      return new Promise<number>( (resolve, reject) => {
        // this.env.stdin.on('data', (chunk) => { this.nextLine(chunk); });
        const stream = byline.createStream(this.env.stdin);
        this.env.stdin.on('error', (err) => { });
        // this.env.stdin.on('end', () => { resolve(0); });
        stream.on('data', this.nextLine.bind(this));
        stream.on('end', () => { resolve(0); });
        this.env.stdin.on('close', () => { stream.destroy(); } );
        // this.env.stdin.resume();
        // debugger;
        // stream.on('close', () => { debugger; });
        // stream.on('error', () => { debugger; });
      });
    }

    public getHelp (): string {
      return 'grep line by glob pattern or regular expression';
    }

    public getSyntax (): string {
        return 'glob pattern | /regExpr/';
    }

    private nextLine (line: Buffer) {
        const str = line.toString();
        if (str.match(this._regExp)) {
          this.env.stdout.write(line + ' \n');
        }
    }
}

class VfsCmdPwd extends VfsShellCommand {
    private _pwd: () => VfsDirectoryNode;

    constructor (shellCmds: IVfsShellCmds) {
        super('pwd');
        this._pwd = shellCmds.pwd;
    }

    public execute (args: string []): Promise<number> {
        const options = this.parseOptions(args, { });
        if (!options) {
            this.env.stderr.write('Error (pwd): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }

        if (args.length > 1) {
            this.end('pwd: too much arguments');
            return Promise.reject(1);
        }
        const pwd = this._pwd();
        this.println(pwd.name);
        this.end();
        return Promise.resolve(0);
    }

    public getHelp (): string {
      return 'print working directory';
    }

    public getSyntax (): string {
        return '';
    }

}

class VfsCmdCat extends VfsShellCommand {
    private _files: (path: string) => VfsAbstractNode [];

    constructor (shellCmds: IVfsShellCmds) {
        super('cat');
        this._files = shellCmds.files;
    }

    public execute (args: string []): Promise<number> {
        const options = this.parseOptions(args, { });
        if (!options) {
            this.env.stderr.write('Error (cat): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }

        if (args.length < 2) {
            this.end('Error (cat): missing arguments');
            return Promise.reject(1);
        }
        for (let i = 1; i < args.length; i++) {
            const resources = this._files(args[i]);
            if (Array.isArray(resources) && resources.length === 1 && resources[0] instanceof VfsDataNode) {
                (<VfsDataNode<any>>resources[0]).printData(this.env.stdout);
            } else {
                this.end('Error (cat): \'' + args[i] + '\' not found')
                return Promise.reject(2);
            }
        }
        this.env.stdout.write('\n');
        this.end();
        return Promise.resolve(0);
    }

    public getHelp (): string {
      return 'concatenate files and print on stdout';
    }

    public getSyntax (): string {
        return ' file1 [...]';
    }
}

class VfsCmdCd extends VfsShellCommand {
    private _cd: (path: string) => string;

    constructor (shellCmds: IVfsShellCmds) {
        super('cd');
        this._cd = shellCmds.cd;
    }


    public execute (args: string []): Promise<number> {
        const options = this.parseOptions(args, { });
        if (!options) {
            this.env.stderr.write('Error (cd): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }

        if (args.length > 2) {
            this.end('cd: too much arguments');
            return Promise.reject(2);
        }
        const errmsg = this._cd(args[1]);
        if (errmsg) {
            this.end('Error (' + this.name + '): ' + errmsg);
            return Promise.reject(3);
        }
        this.end();
        return Promise.resolve(0);
    }

    public getHelp (): string {
      return 'print working directory';
    }

    public getSyntax (): string {
        return '[~ | .. | . | path | ~/subpath]';
    }

}

class VfsCmdLs extends VfsShellCommand {
    private _files: (path: string) => VfsAbstractNode [];
    private _pwd: () => VfsDirectoryNode;

    constructor (shellCmds: IVfsShellCmds) {
        super('ls');
        this._files = shellCmds.files;
        this._pwd = shellCmds.pwd;
    }

    public execute (args: string []): Promise<number> {
        let rv = 0;
        const options = this.parseOptions(args, {
                                                  directory: { short: 'd', argCnt: 0 },
                                                  listing:   { short: 'l', argCnt: 0 }
                                                });
        if (!options) {
            this.env.stderr.write('Error (ls): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }

        const asLine = options.listing;
        for (let i = 0; i < args.length; i++) {
            if (i === 0 && args.length > 1) { continue; }
            const path = i === 0 ? '.' : args[i];
            const resources = this._files(path) ;
            if (!Array.isArray(resources) || resources.length === 0) {
                this.env.stderr.write('Error (ls): \'' + path + '\' not found');
                rv = 2;
            } else {
                for (const r of resources) {
                    if (r instanceof VfsDirectoryNode) {
                        if (options.directory) {
                            if (asLine) {
                                this.println(r.typeShortcut + '   ' + r.name);
                            } else {
                                this.print(r.name + ' ');
                            }
                        } else {
                            if (args.length > 2) {
                                this.println('\n' + path + ':');
                            }
                            const childs = this._files(path + '/*') || [];
                            for (const c of childs) {
                                if (asLine) {
                                    this.println(c.typeShortcut + '   ' + c.name);
                                } else {
                                    this.print(c.name + ' ');
                                }
                            }
                        }
                    } else {
                        if (asLine) {
                            this.println(r.typeShortcut + '   ' + r.name);
                        } else {
                            this.print(r.name + ' ');
                        }
                    }
                }
            }
        }

        this.env.stdout.write('\n');
        this.end();
        return Promise.resolve(rv);
    }

    public getHelp (): string {
      return 'concatenate files and print on stdout';
    }

    public getSyntax (): string {
        return '  [ --directory | -d] [ --listing | -l] file1 [...]';
    }
}


class VfsCmdWait extends VfsShellCommand {
    constructor () {
        super('wait');
    }

    public execute (args: string []): Promise<number> {
        const options = this.parseOptions(args, { noLine: { short: 'n' }});
        if (!options) {
            this.env.stderr.write('Error (wait): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }
        if (args.length !== 2) {
            this.end('wait: invalid arguments');
            return Promise.reject(1);
        }
        const delay = +args[1];
        if (delay === NaN || delay < 0) {
            this.end('wait: invalid delay seconds');
            return Promise.reject(1);
        }
        return new Promise<number>( (resolve, reject) => {
            setTimeout( () => { this.end(); resolve(0); }, delay * 1000);
        });
    }

    public getHelp (): string {
      return 'delay processing for given seconds';
    }

    public getSyntax (): string {
        return '<seconds>';
    }

}
