
import * as vfs from '../vfs';
import { VfsShellCommand, IVfsShellCmds, IVfsCommandOptionConfig, IParsedCommand, IVfsCommandOptions } from '../vfs-shell-command';
import { VfsCmdTest } from './vfs-cmd-test';

import { CompleterResult } from 'readline';
import * as stream from 'stream';

import * as byline from 'byline';

export function addDefaultCommands (shell: IVfsShellCmds,
                                    collection: { [ key: string]: VfsShellCommand },
                                    help: (args: string [], options: IVfsCommandOptions) => number) {
    const cmdAlias = new VfsCmdAlias(shell); if (!collection[cmdAlias.name]) { collection[cmdAlias.name] = cmdAlias; }
    const cmdCat = new VfsCmdCat(shell); if (!collection[cmdCat.name]) { collection[cmdCat.name] = cmdCat; }
    const cmdCd = new VfsCmdCd(shell); if (!collection[cmdCd.name]) { collection[cmdCd.name] = cmdCd; }
    const cmdEcho = new VfsCmdEcho(shell); if (!collection[cmdEcho.name]) { collection[cmdEcho.name] = cmdEcho; }
    const cmdGrep = new VfsCmdGrep(shell); if (!collection[cmdGrep.name]) { collection[cmdGrep.name] = cmdGrep; }
    const cmdHelp = new VfsCmdHelp(shell, help); if (!collection[cmdHelp.name]) { collection[cmdHelp.name] = cmdHelp; }
    const cmdPwd = new VfsCmdPwd(shell); if (!collection[cmdPwd.name]) { collection[cmdPwd.name] = cmdPwd; }
    const cmdLs = new VfsCmdLs(shell); if (!collection[cmdLs.name]) { collection[cmdLs.name] = cmdLs; }
    const cmdWait = new VfsCmdWait(shell); if (!collection[cmdWait.name]) { collection[cmdWait.name] = cmdWait; }

    const cmdTest = new VfsCmdTest(shell); if (!collection[cmdTest.name]) { collection[cmdTest.name] = cmdTest; }
}

class VfsCmdAlias extends VfsShellCommand {

    private _alias: (alias: string, args: string []) => string;

    constructor (shellCmds: IVfsShellCmds) {
        super('alias', shellCmds);
        this._alias = shellCmds.alias;
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        const rv = this._alias(args[0], args.length >= 2 ? args.slice(1) : []);
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
    constructor (shellCmds: IVfsShellCmds) {
        super('echo', shellCmds);
    }

    public optionConfig (): IVfsCommandOptionConfig {
      return {
         noLine: { short: 'n', argCnt: 0 },
      };
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 1) {
          this.end('echo: too much arguments');
          return Promise.reject(1);
        }
        if (args.length === 1) {
            if (options.noLine) {
                this.print(args[0]);
            } else {
                this.println(args[0]);
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


class VfsCmdHelp extends VfsShellCommand {

    private _help: (args: string [], options: IVfsCommandOptions) => number;

    constructor (shellCmds: IVfsShellCmds, help: (args: string [], options: IVfsCommandOptions) => number) {
        super('help', shellCmds);
        this._help = help;
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 1) {
            this.end('Error (help): invalid arguments');
            return Promise.reject(1);
        }
        return Promise.resolve(this._help(args, options));
    }

    public getHelp (): string {
      return 'more information for commands';
    }

    public getSyntax (): string {
        return '[ <command> ]';
    }

}

class VfsCmdGrep extends VfsShellCommand {
    private _regExp: RegExp;

    constructor (shellCmds: IVfsShellCmds) {
        super('grep', shellCmds);
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length !== 1) {
          this.env.stderr.write('invalid arguments\n');
          return Promise.reject(1);
      }

      const expr = args[0];
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
    private _pwd: () => vfs.VfsDirectoryNode;

    constructor (shellCmds: IVfsShellCmds) {
        super('pwd', shellCmds);
        this._pwd = shellCmds.pwd;
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 0) {
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
    private _files: (path: string) => vfs.VfsAbstractNode [];

    constructor (shellCmds: IVfsShellCmds) {
        super('cat', shellCmds);
        this._files = shellCmds.files;
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length < 1) {
            this.end('Error (cat): missing arguments');
            return Promise.reject(1);
        }
        for (let i = 0; i < args.length; i++) {
            const resources = this._files(args[i]);
            if (Array.isArray(resources) && resources.length === 0) {
                this.end('Error (cat): \'' + args[i] + '\' not found')
                return Promise.reject(2);
            } else if (Array.isArray(resources) && resources.length === 1 && !resources[0].stat.isFile()) {
                this.end('Error (cat): \'' + args[i] + '\' is not a file')
                return Promise.reject(2);
            } else if (Array.isArray(resources) && resources.length === 1 && resources[0].stat.isFile()) {
                return new Promise<number>( (resolve, reject) => {
                    const end = (err?: any) => {
                        if (err) {
                            this.env.stderr.write('Error (cat): ' + err + '\n');
                            this.end();
                            reject(err);
                        } else {
                            // this.env.stdout.write('\n');
                            this.end();
                            resolve();
                        }
                    }
                    const rs = vfs.createReadStream(resources[i]);
                    rs.on('end', end);
                    rs.on('error', end);
                    rs.pipe(this.env.stdout).on('error', end);
                    // const ws = new stream.Writable({ decodeStrings: false, write: (chunk, encoding, done) => {
                    //     this.env.stdout.write(chunk);
                    // }});
                    // rs.pipe(ws);
                });
            } else {
                this.end('Error (cat): \'' + args[i] + '\' multiple files, select one')
                return Promise.reject(2);
            }
        }
    }

    public getHelp (): string {
      return 'concatenate files and print on stdout';
    }

    public getSyntax (): string {
        return ' file1 [...]';
    }

    public completer (linePartial: string, parsedCommand: IParsedCommand): CompleterResult {
        return this.completeAsFile(linePartial, parsedCommand);
    }
}

class VfsCmdCd extends VfsShellCommand {
    private _cd: (path: string) => string;

    constructor (shellCmds: IVfsShellCmds) {
        super('cd', shellCmds);
        this._cd = shellCmds.cd;
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 1) {
            this.end('cd: too much arguments');
            return Promise.reject(2);
        }
        const errmsg = this._cd(args[0]);
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

    public completer (linePartial: string, parsedCommand: IParsedCommand): CompleterResult {
        return this.completeAsFile(linePartial, parsedCommand);
    }

}

class VfsCmdLs extends VfsShellCommand {
    private _files: (path: string) => vfs.VfsAbstractNode [];
    private _pwd: () => vfs.VfsDirectoryNode;

    constructor (shellCmds: IVfsShellCmds) {
        super('ls', shellCmds);
        this._files = shellCmds.files;
        this._pwd = shellCmds.pwd;
    }

    public optionConfig (): IVfsCommandOptionConfig {
        return {
            directory: { short: 'd', argCnt: 0 },
            listing:   { short: 'l' },
            osfspath:  { short: 'e' }
        };
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        let rv = 0;
        const asLine = options.listing;
        for (let i = -1; i < args.length; i++) {
            if (i === -1 && args.length > 0) { continue; }
            const path = i === -1 ? '.' : args[i];
            const resources = this._files(path) ;
            if (!Array.isArray(resources) || resources.length === 0) {
                this.env.stderr.write('Error (ls): \'' + path + '\' not found');
                rv = 2;
            } else {
                for (const r of resources) {
                    const stats = r.stat;
                    if (stats && stats.isDirectory()) {
                        if (options.directory) {
                            this.printLine(r, options, stats);
                        } else {
                            if (args.length > 1) {
                                this.println('\n' + path + ':');
                            }
                            const childs = this._files(path + '/*') || [];
                            for (const c of childs) {
                                this.printLine(c, options);
                            }
                        }
                    } else {
                        this.printLine(r, options, stats);
                    }
                }
            }
        }

        this.env.stdout.write('\n');
        this.end();
        return Promise.resolve(rv);
    }

    public printLine (item: vfs.VfsAbstractNode, options: IVfsCommandOptions, stats?: vfs.Stats) {
        stats = stats || item.stat;
        let name = item.name;
        while (name.length < 20) { name += ' '; }
        name += '   ';
        let ext = '';
        if (stats.isFsStat() && options.osfspath && (<vfs.VfsOsFsNode><any>item).osfsPath) {
            ext += (<vfs.VfsOsFsNode><any>item).osfsPath;
        }
        this.println(stats.typeChar + '   ' + name + ext);


    }

    public getHelp (): string {
      return 'concatenate files and print on stdout';
    }

    public getSyntax (): string {
        return '  [ --directory | -d] [ --listing | -l] file1 [...]';
    }

    public completer (linePartial: string, parsedCommand: IParsedCommand): CompleterResult {
        return this.completeAsFile(linePartial, parsedCommand);
    }

}


class VfsCmdWait extends VfsShellCommand {
    constructor (shellCmds: IVfsShellCmds) {
        super('wait', shellCmds);
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length !== 1) {
            this.end('wait: invalid arguments');
            return Promise.reject(1);
        }
        const delay = +args[0];
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
