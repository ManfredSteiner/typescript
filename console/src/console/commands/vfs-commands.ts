
import * as vfs from '../vfs';
import { VfsShellCommand, IVfsShellCmds, IVfsCommandOptionConfig, IParsedCommand, IVfsCommandOptions,
         CmdCompleterResult } from '../vfs-shell-command';
import { VfsShell } from '../vfs-shell';
import { VfsCmdTest } from './vfs-cmd-test';

import { CompleterResult } from 'readline';
import * as stream from 'stream';

import * as byline from 'byline';

import * as debugsx from 'debug-sx';
const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:commands:VfsCommands');

export function addDefaultCommands (shell: VfsShell,
                                    collection: { [ key: string]: VfsShellCommand },
                                    help: (args: string [], options: IVfsCommandOptions) => number) {

    const cmdHelp = new VfsCmdHelp(shell.shellCommands, help);
    collection[cmdHelp.name] = cmdHelp;

    const commands = [ VfsCmdAlias, VfsCmdCat, VfsCmdCd, VfsCmdEcho, VfsCmdGrep, VfsCmdPwd, VfsCmdLs, VfsCmdWait,
                       VfsCmdWc, VfsCmdTest ];
    for (const cmdConstructor of commands) {
        const cmd = new cmdConstructor(shell.shellCommands);
        if (shell.addCommand(cmd) !== undefined) {
            debug.warn('command ' + cmd.name + ' overloaded');
        }
    }
}

class VfsCmdAlias extends VfsShellCommand {

    private _alias: (alias: string, args: string []) => string;

    constructor (shellCmds: IVfsShellCmds) {
        super('alias', shellCmds);
        this._alias = shellCmds.alias;
    }

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        const rv = this._alias(args[0], args.length >= 2 ? args.slice(1) : []);
        this.print(rv);
        return 0;
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

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 1) {
          this.endWithError('echo: too much arguments', 1);
        }
        if (args.length === 1) {
            if (options.noLine) {
                this.print(args[0]);
            } else {
                this.println(args[0]);
            }
        }
        return 0;
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

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 1) {
            this.endWithError('Error (help): invalid arguments', 1);
        }
        return this._help(args, options);
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

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length !== 1) {
            this.endWithError('invalid arguments', 1);
        }

        const expr = args[0];
        console.log(expr);
        if (expr.startsWith('/') && expr.endsWith('/')) {
            this._regExp = new RegExp(expr.substr(1, expr.length - 2));
            console.log('regexp');
            console.log(this._regExp);
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
            return 0;
        }
        const rv = await new Promise<number>( (resolve, reject) => {
            // this.env.stdin.on('data', (chunk) => { this.nextLine(chunk); });
            const is = byline.createStream(this.env.stdin);
            this.env.stdin.on('error', (err) => { });
            // this.env.stdin.on('end', () => { resolve(0); });
            is.on('data', this.nextLine.bind(this));
            is.on('end', () => { resolve(0); });
            this.env.stdin.on('close', () => { is.destroy(); } );
            // this.env.stdin.resume();
            // debugger;
            // stream.on('close', () => { debugger; });
            // stream.on('error', () => { debugger; });
        });

        return rv;
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
            this.println(line.toString());
        }
    }
}

class VfsCmdPwd extends VfsShellCommand {
    private _pwd: () => vfs.VfsDirectoryNode;

    constructor (shellCmds: IVfsShellCmds) {
        super('pwd', shellCmds);
        this._pwd = shellCmds.pwd;
    }

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 0) {
            this.endWithError('pwd: too much arguments', 1);
            return Promise.reject(1);
        }
        const pwd = this._pwd();
        this.println(pwd.name);
        return 0;
    }

    public getHelp (): string {
      return 'print working directory';
    }

    public getSyntax (): string {
        return '';
    }

}

class VfsCmdCat extends VfsShellCommand {
    private _files: (path: string) => Promise<vfs.VfsAbstractNode []>;

    constructor (shellCmds: IVfsShellCmds) {
        super('cat', shellCmds);
        this._files = shellCmds.files;
    }

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length < 1) {
            this.endWithError('Error (cat): missing arguments', 1);
        }
        const promisses: Promise<vfs.VfsAbstractNode []> [] = [];
        for (let i = 0; i < args.length; i++) {
            promisses.push(this._files(args[i]));
        }

        const results = await Promise.all(promisses);
        for (let i = 0; i < args.length; i++) {
            const resources = results[i];
            if (!Array.isArray(resources) || resources.length === 0) {
                this.endWithError('\'' + args[i] + '\' not found', 2);
            } else if (resources.length > 1) {
                this.endWithError('\'' + args[i] + '\' covers mutiple files, select one!', 3);
            } else if (!resources[0].stat.isFile()) {
                this.endWithError('\'' + args[i] + '\' is not a file', 4);
            } else {
                const rs = vfs.createReadStream(resources[0]);
                await new Promise<void>( (resolve, reject) => {
                    rs.on('end', resolve);
                    rs.on('error', reject);
                    rs.pipe(this.env.stdout).on('error', reject);
                });
            }
        }
        return 0;
    }

    public getHelp (): string {
      return 'concatenate files and print on stdout';
    }

    public getSyntax (): string {
        return ' file1 [...]';
    }

    public async completer (line: string, parsedCommand: IParsedCommand, argIndex: number): Promise<CmdCompleterResult> {
        return { isFile: true };
    }
}


class VfsCmdCd extends VfsShellCommand {
    private _cd: (path: string) => Promise<vfs.VfsDirectoryNode>;

    constructor (shellCmds: IVfsShellCmds) {
        super('cd', shellCmds);
        this._cd = shellCmds.cd;
    }

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 1) {
            this.endWithError('cd: too much arguments', 1);
        }
        const pwd = await this._cd(args[0]);
        return 0;
    }

    public getHelp (): string {
      return 'print working directory';
    }

    public getSyntax (): string {
        return '[~ | .. | . | path | ~/subpath]';
    }

    public async completer (line: string, parsedCommand: IParsedCommand, argIndex: number): Promise<CmdCompleterResult> {
        return { isFile: true };
    }

}

interface VfsCmdLsItem { path: string, node: vfs.VfsAbstractNode, childs?: vfs.VfsAbstractNode [] };

class VfsCmdLs extends VfsShellCommand {
    private _files: (path: string) => Promise<vfs.VfsAbstractNode []>;
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

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        const asLine = options.listing;
        let printSubdirContent = !options.directory;
        if (!Array.isArray(args) || args.length === 0) {
            args = ['.'];
            printSubdirContent = false;
        }
        const promisses: Promise<{ path: string, node: vfs.VfsAbstractNode, childs?: vfs.VfsAbstractNode [] } []> [] = [];
        for (const a of args) {
            promisses.push(this.handleArgument(a, printSubdirContent));
        }
        const presults = await Promise.all(promisses);
        let results: { path: string, node: vfs.VfsAbstractNode, childs?: vfs.VfsAbstractNode [] } [] = [];
        for (const r of presults) {
            results = results.concat(r);
        }
        for (const r of results) {
            const stat = r.node.stat;
            if (stat.isDirectory() && printSubdirContent) {
                if (results.length > 1) {
                    this.println('\n' + r.node.name + ':');
                }
                if (!Array.isArray(r.childs)) { continue };
                for (const c of r.childs) {
                    if (asLine) {
                        this.printLine(c, options, c.stat);
                    } else {
                        this.print(c.name + ' ');
                    }
                }
            } else if (asLine) {
                this.printLine(r.node, options, r.node.stat);
            } else {
                this.print(r.node.name + (stat.isDirectory() ? '/ ' :  ' '));
            }
        }
        if (!asLine) {
            this.println();
        }
        return 0;
    }

    public getHelp (): string {
      return 'concatenate files and print on stdout';
    }

    public getSyntax (): string {
        return '  [ --directory | -d] [ --listing | -l] file1 [...]';
    }


    public async completer (line: string, parsedCommand: IParsedCommand, argIndex: number): Promise<CmdCompleterResult> {
        return { isFile: true };
    }

    private async handleArgument (arg: string, includeChilds: boolean): Promise<VfsCmdLsItem []> {
        const promisses: Promise<VfsCmdLsItem> [] = [];
        const files = await this._files(arg);
        for (const f of files) {
            promisses.push(this.handleNode(arg, f, includeChilds));
        }
        try {
            return await Promise.all(promisses);
        } catch (err) {
            if (typeof err === 'string') {
                this.endWithError(err);
            } else {
                const msg = 'Internal error on \'' + arg + '\'';
                if (err instanceof Error) {
                    this.endWithError(msg, 255, err);
                } else {
                    this.endWithError(msg);
                }
            }
        }
    }

    private async handleNode (path: string, node: vfs.VfsAbstractNode, includeChilds: boolean): Promise<VfsCmdLsItem> {
        const stat = node.stat;
        if (!stat.isDirectory() || !includeChilds) {
            return { path: path, node: node };
        } else {
            return { path: path, node: node, childs: (<vfs.VfsDirectoryNode>node).childs };
        }
    }

    private printLine (item: vfs.VfsAbstractNode, options: IVfsCommandOptions, stats?: vfs.Stats) {
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
}


class VfsCmdWait extends VfsShellCommand {
    constructor (shellCmds: IVfsShellCmds) {
        super('wait', shellCmds);
    }

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length !== 1) {
            this.endWithError('invalid arguments', 1);
        }
        const delay = +args[0];
        if (delay === NaN || delay < 0) {
            this.endWithError('invalid delay seconds', 2);
        }
        return await new Promise<number>( (resolve, reject) => {
            setTimeout( () => {resolve(0); }, delay * 1000);
        });
    }

    public getHelp (): string {
      return 'delay processing for given seconds';
    }

    public getSyntax (): string {
        return '<seconds>';
    }

}

class VfsCmdWc extends VfsShellCommand {
    constructor (shellCmds: IVfsShellCmds) {
        super('wc', shellCmds);
    }

    public optionConfig (): IVfsCommandOptionConfig {
        return {
            chars: { short: 'c', argCnt: 0 },
            lines:   { short: 'l' },
            maxLineLength:  { short: 'L' },
            words:  { short: 'w' }
        };
    }

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length > 1) {
            this.endWithError('to much arguments, see help wc', 1)
        }
        if (!this.env.stdin && (args.length === 0 || args[0] === '-') ) {
            this.endWithError('missing input from file or stdin', 2)
        }

        let cntWord = 0, cntLines = 0, maxLineSize = 0, cntChars = 0;
        const rv = await new Promise<number>( (resolve, reject) => {
            const is = byline.createStream(this.env.stdin);
            this.env.stdin.on('error', (err) => { });
            is.on('end', () => { resolve(0); });
            this.env.stdin.on('close', () => { is.destroy(); } );
            is.on('data', (chunk) => {
                cntLines++;
                const length = chunk.toString().length;
                maxLineSize = Math.max(maxLineSize, length);
                cntChars += length;
                const words = chunk.toString().split(' ');
                cntWord += words.length;
            });
        });

        if (Object.keys(options).length === 0) {
            this.println('%d %d %d', cntLines, cntWord, cntChars);
        } else {
            if (options.lines) {
                this.print('%d', cntLines);
            }
            if (options.words) {
                this.print('%d', cntWord);
            }
            if (options.chars) {
                this.print('%d', cntChars);
            }
            if (options.maxLineLength) {
                this.print('%d', maxLineSize);
            }
            this.println();
        }
        return 0;
    }

    public getHelp (): string {
      return 'print newline, word and char count for file';
    }

    public getSyntax (): string {
        return '[ -c | -l | -w | -L ] [ <file> | - ]';
    }

}
