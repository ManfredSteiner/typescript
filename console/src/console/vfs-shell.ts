
import * as vfs from './vfs';
import { IVfsEnvironment, IVfsShellCmds, PipeReadable, PipeWritable, VfsShellCommand,
         IParsedCommands, IParsedCommand, IVfsCommandOption, IVfsCommandOptions,
         AppVersion, GitInfo } from './vfs-shell-command';
import { addDefaultCommands } from './commands/vfs-commands';

import * as stream from 'stream';
import { Readable, Writable } from 'stream';
import { CompleterResult } from 'readline';

import * as debugsx from 'debug-sx';
const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:VfsShell');


export class VfsShell {
    private _pwd: vfs.VfsDirectoryNode;
    private _console: IVfsConsole;
    private _name: string;
    private _user: vfs.VfsUser;
    private _commands: { [ key: string ]: VfsShellCommand } = {};
    private _cmdPending: boolean;
    private _lastExitCode: number;
    private _lastError: any;
    private _waitingCommands: string [] = [];
    private _env: IVfsEnvironment;
    private _shellCmds: IVfsShellCmds;
    private _aliases: { [ key: string ]: string []};

    public constructor (console: IVfsConsole, name: string, user: vfs.VfsUser, version?: AppVersion, osFsBase?: string) {
        this._pwd = vfs.getRoot();
        vfs.setUser(user);
        vfs.getDirectory(user.home, user, vfs.getRoot() ).then( result => {
            if (result) {
                this._pwd = result;
            }
        }).catch(err => debug.warn(err));
        this._console = console;
        this._name = name;
        this._user = user;
        this._env = { stdout: process.stdout, stdin: process.stdin, stderr: process.stderr };
        this._lastExitCode = 0;

        vfs.getRoot().addChild(new vfs.VfsOsFsDirectory('osfs', vfs.getRoot(), osFsBase || '/tmp'));
        vfs.getRoot().root.addChild(new VfsDirectorySys('sys', vfs.getRoot(), version));

        this._shellCmds = {
            alias: this.cmdAlias.bind(this),
            cd: this.cmdCd.bind(this),
            completeAsFile: this.cmdCompleteAsFile.bind(this),
            files: this.cmdFiles.bind(this),
            pwd: this.cmdPwd.bind(this),
            version: () => console.version
        }
        this._aliases = { ll: [ 'ls', '-l' ] };

        addDefaultCommands(this._shellCmds, this._commands, this.help.bind(this));
        this.setPrompt();
        this.console.prompt();
    }

    public refresh (): Promise<any> {
        return this._pwd.refreshAll();
    }


    public get console (): IVfsConsole {
        return this._console;
    }

    public get pwd (): vfs.VfsDirectoryNode {
        return this._pwd;
    }

    public setPrompt (): void {
        const promptPre = this._user.name + '@' + this._name + ':';
        const promptPost = this._user.isAdmin ? '# ' : '$ ';
        let path = this._pwd.fullName;
        if (this._user.home !== '/' && path.startsWith(this._user.home)) {
            path = '~' + path.substr(this._user.home.length);
        }
        const prompt = promptPre + path + promptPost;
        this._console.setPrompt(prompt);
    }

    public handleInput (line?: string): void {
        const endOnError = (err: any) => {
            if (err instanceof Error) {
                this._env.stderr.write('Internal error' + (err.message ? ': ' + err.message : '') + '\n');
                this._lastExitCode = 255;
                this._lastError = err;
                debug.warn(err);
            } else if (typeof err === 'string') {
                this._env.stderr.write(err + '\n');
                this._lastExitCode = 255;
                this._lastError = err;
            } else if (typeof err === 'number') {
                this._lastExitCode = err;
                this._lastError = undefined;
            } else {
                this._env.stderr.write('Internal error\n');
                this._lastExitCode = 255;
                this._lastError = err;
            }
            this._cmdPending = false;
            this.handleInput();
        };
        const endOk = () => {
            this._cmdPending = false;
            this._lastExitCode = 0;
            this._lastError = undefined;
            this.handleInput();
        };

        let lineFromInput = true;
        if (!line) {
            line = this._waitingCommands.shift();
            lineFromInput = false;
        }
        if (!line) {
            this.console.prompt();
            return;
        }
        if (this._cmdPending) {
            this._waitingCommands.push(line);
            return;
        }

        if (line.trim() === 'exit') {
            this._cmdPending = true;
            this.console.exit(() => {
                this._cmdPending = false;
                this.handleInput();
            });
            return;
        }

        const parsedInput = this.parseInput(line, false);
        if (parsedInput.cmds.length === 0) {
            this._cmdPending = false;
            // this.console.prompt();
            this.handleInput();
            return;
        }
        const cmds: { parsedCmd: IParsedCommand, env?: IVfsEnvironment, promise?: Promise<number> } [] = [];
        for (const c of parsedInput.cmds) {
            if (!c.valid) {
                endOnError('Error: invalid command ' + c.cmdString);
                return;
            }
            cmds.push({ parsedCmd: c });
        }
        if (!parsedInput.valid) {
            endOnError('Error: invalid command');
            return;
        }

        const promisses: Promise<{ parsedCmd: IParsedCommand, env?: IVfsEnvironment, promise?: Promise<number> }> [] = [];
        for (let i = cmds.length - 1; i >= 0; i--) {
            const env: IVfsEnvironment = Object.assign( {}, this._env );
            if (i < (cmds.length - 1)) {
                const nextIn: Readable = <Readable>(cmds[i + 1].env.stdin);
                env.stdout = new PipeWritable(nextIn, true);
                // env.stderr = process.stderr;
            } // if i === cmds.length - 1 --> stdout = default env.stdout (process.stdout) -> no changes needed
            if (i > 0) {
                // env.stdin = new Readable( { objectMode: false, read: function (size) { } });
                env.stdin = new PipeReadable();
            } else {
                env.stdin = new Readable( { read: function (size) { this.push(null); } });
            }

            const redirects = this.parseRedirection(cmds[i].parsedCmd, env);
            cmds[i].env = env
            promisses.push(new Promise<any>( (resolve, reject) => {
                vfs.getNodes(redirects).then( nodes => {
                    env.stdin = nodes[0] ? vfs.createReadStream(nodes[0]) : env.stdin;
                    env.stdout = nodes[1] ? vfs.createWriteStream(nodes[1]) : env.stdout;
                    env.stderr = nodes[2] ? vfs.createWriteStream(nodes[2]) : env.stderr;
                    resolve(cmds[i]);
                }).catch( err => reject(err) );
            }));
        }
        Promise.all(promisses).then( (commands) => {
            const cmdPromisses: Promise<number> [] = [];
            for (let i = 0; i < commands.length; i++) {
                const c = commands[i];
                (<any>c.parsedCmd.cmd)._env = c.env;
                this._cmdPending = true;
                const options: IVfsCommandOptions = {};
                for (const o of c.parsedCmd.options) {
                    options[o.name] = o;
                }
                c.promise = c.parsedCmd.cmd.execute(c.parsedCmd.args, options);
                cmdPromisses.push(c.promise);
            }
            let timeout = 5000;
            Promise.all(cmdPromisses).then( () => {
                timeout = -1;
                endOk();
            }).catch( err => { timeout = -1; endOnError(err) });
            setTimeout(() => { if (timeout !== -1) { endOnError('command hanging'); } }, timeout);
        }).catch( err => endOnError(err) );
    }


    public completerLongOption (linePartial: string, callback: (err: any, result: CompleterResult) => void,
                                cmd: VfsShellCommand, parsedCmd: IParsedCommand): boolean {
        const i = linePartial.lastIndexOf('--');
        if (i < 0) { return false; }
        const optPartial = linePartial.substr(i + 2);
        if (optPartial.match(/^[a-zA-Z]*$/)) {
            const before = linePartial.substr(0, i + 1);
            const optConfigs = cmd.optionConfig();
            const hits: string [] = [];
            for (const longName of Object.keys(optConfigs)) {
                if (!optConfigs.hasOwnProperty(longName)) { continue; }
                if (parsedCmd.options.findIndex( o => o.name === longName) === -1) {
                    if (longName.indexOf(optPartial) === 0) {
                        hits.push('--' + longName + ' ');
                    }
                }
            }
            callback(null, [ hits, '--' + optPartial ]);
            return true;
        }
        return false;
    }

    public completerShortOption (linePartial: string, callback: (err: any, result: CompleterResult) => void,
                                 cmd: VfsShellCommand, parsedCmd: IParsedCommand): boolean {
        const i = linePartial.lastIndexOf('-');
        if (i < 0) { return false; }

        const optPartial = linePartial.substr(i + 1);
        if (optPartial.match(/^[a-zA-Z]*$/)) {
            const before = linePartial.substr(0, i + 1);
            const optConfigs = cmd.optionConfig();
            const hits: string [] = [];
            for (const longName of Object.keys(optConfigs)) {
                if (!optConfigs.hasOwnProperty(longName)) { continue; }
                const optConfig = optConfigs[longName];
                if (optPartial.indexOf(optConfig.short) < 0 && parsedCmd.options.findIndex( o => o.name === longName) < 0) {
                    hits.push('-' + optConfig.short + ' (' + longName + ')');
                }
            }
            if (hits.length > 0) {
                hits.push('... type short');
            }
            callback(null, [ hits, '' ]);
            return true;
        }
        return false;
    }


    public completer (linePartial: string, callback: (err: any, result: CompleterResult) => void ) {
        const parsedInput = this.parseInput(linePartial, true);
        const parsedCmd = parsedInput.cmds[0];
        if (parsedCmd && parsedCmd.cmd) {
            const cmd = parsedCmd.cmd;
            if (this.completerLongOption(linePartial, callback, cmd, parsedCmd)) { return; }
            if (this.completerShortOption(linePartial, callback, cmd, parsedCmd)) { return; }
            if (parsedCmd.args.length >= 1) {
                const arg = parsedCmd.args[parsedCmd.args.length - 1];
                if ((arg === '<' || arg === '>' || arg === '1>' || arg === '2>') && linePartial.endsWith(' ')) {
                    this.cmdCompleteAsFile(linePartial, []).then( (completerResult) => {
                        callback(null, completerResult);
                    }).catch( () => callback(null, [[], linePartial]) );
                }
            }
            if (parsedCmd.args.length >= 2) {
                const arg = parsedCmd.args[parsedCmd.args.length - 2];
                if (arg === '<' || arg === '>' || arg === '1>' || arg === '2>') {
                    this.cmdCompleteAsFile(linePartial, []).then( (completerResult) => {
                        callback(null, completerResult);
                    }).catch( () => callback(null, [[], linePartial]) );
                }
            }

            parsedCmd.cmd.completer(linePartial, parsedCmd).then( (completerResult) => {
                callback(null, completerResult);
            }).catch( () => callback(null, [[], linePartial]) );
            return;
        }

        const cmds: string [] = [ 'exit' ];
        for (const c in this._commands) {
            if (!this._commands.hasOwnProperty(c)) { continue; }
            cmds.push(this._commands[c].name);
        }
        cmds.sort();
        if (!parsedCmd || !parsedCmd.cmdString) {
            callback(null, [ cmds, '']);
            return;
        }
        const cmdString = parsedCmd.cmdString;
        const hits = cmds.filter( cmd => {
            if (cmd.indexOf(cmdString) === 0) {
                return cmd;
            }
        });
        callback(null, [ hits, linePartial]);
    }


    private splitString (str: string, startIndex: number): string [] {
        const rv: string [] = [];
        let s = '', mode = undefined;
        for (let i = startIndex; i < str.length; i++) {
            let c = str[i];
            if (!mode && (c === ' ' || c === '\t' || c === '\0' )) {
                if (s.length > 0) { rv.push(s); s = ''; }
            } else if (!mode && (c === '"' || c === '\'')) {
                mode = c;
            } else if (mode && (c === '"' || c === '\'')) {
                mode = undefined;
                if (s.length > 0) { rv.push(s); s = ''; }
            } else if (mode === '\'') {
                s += c;
            } else if (c === '$' && i < (rv.length - 1)) {
                c = str[++i];
                if (c === '?') {
                    s += this._lastExitCode;
                } else {
                    s += '$' + c;
                }
            } else if (c === '\\' && i < (str.length - 1)) {
                c = str[++i];
                switch (c) {
                   case 'n': s += '\n'; break;
                   case 'r': s += '\r'; break;
                   case 't': s += '\t'; break;
                   case '$': s += '$'; break;
                   case '0': s += '\0'; break;
                   default:  s += '\\' + c;
                }
            } else {
                s += c;
            }
        }
        if (s.length > 0) {
            rv.push(s);
        }
        return rv;
    }

    private splitArray (strArray: string [], separator: string): string[][] {
        const rv: string[][] = [];
        while (strArray.length > 0) {
            const i = strArray.findIndex( s => s === separator);
            if (i < 0) {
                break;
            }
            rv.push(strArray.splice(0, i));
            strArray.shift();
        }
        rv.push(strArray);
        return rv;
    }

    private parseOption (args: string [], cmd: VfsShellCommand): IVfsCommandOption [] {
        if (!Array.isArray(args) || args.length === 0 || !args[0].startsWith('-') || args[0] === '-') {
            return undefined;
        }
        const optionConfig = cmd && cmd.optionConfig();

        if (args[0].startsWith('--')) {
            const long = args[0].substr(2);
            args.shift();
            const cfg = optionConfig && optionConfig[long];
            if (long === '' || !cmd || !cfg) {
                return [ { valid: false, name: long, long: long } ];
            }
            if (cfg.argCnt && cfg.argCnt > 0) {
                if (args.length < cfg.argCnt) {
                    return [ { valid: false, name: long, long: long } ];
                }
                return [ { valid: true, name: long, long: long, args: args.splice(0, cfg.argCnt) } ];
            }
            return [ { valid: true, name: long, long: long } ];
        }

        const shortOptions = args[0].substr(1);
        args.shift();
        const rv: IVfsCommandOption [] = [];
        outerLoop: for (const o of shortOptions) {
            if (!optionConfig) {
                rv.push( { valid: false, short: o });
            } else {
                const keys = Object.keys(optionConfig);
                for (const k of keys) {
                    if (!optionConfig.hasOwnProperty(k)) { continue; }
                    const cfg = optionConfig[k];
                    if (cfg.short === o) {
                        if (cfg.argCnt && cfg.argCnt > 0) {
                           if (args.length < cfg.argCnt) {
                               rv.push( { valid: false, name: k, short: o } );
                           } else {
                               rv.push( { valid: true, name: k, short: o, args: args.splice(0, cfg.argCnt) } );
                           }
                        } else {
                           rv.push( { valid: true, name: k, short: o } );
                        }
                        continue outerLoop;
                    }
                }
            }
            rv.push( { valid: false, short: o });
        }
        return rv;
    }

    private parseCommand (args: string []): IParsedCommand {
        const rv: IParsedCommand = { valid: false };

        const cmdAlias = this._aliases[args[0]];
        if (cmdAlias) {
            rv.beforeAlias = args;
            args = cmdAlias.concat(args.slice(1));
        }
        const cmd = this._commands[args[0]];
        if (cmd) {
          rv.cmd = cmd;
        }
        rv.cmdString = args[0];
        args.shift();

        rv.options = [];
        while (true) {
            const o = this.parseOption(args, cmd)
            if (!o) { break; }
            rv.options = rv.options.concat(o);
        }

        rv.args = args;
        if (!rv.cmd) {
            return rv;
        }

        rv.valid = true;
        for (const o of rv.options) {
           if (!o.valid) {
               rv.valid = false;
               break;
           }
        }
        return rv;
    }

    private parseInput (line?: string, afterLastPipe?: boolean): IParsedCommands {
        const parsedCommands: IParsedCommand [] = [];
        const args = this.splitString(line, afterLastPipe ? line.lastIndexOf('|') + 1 : 0);
        if (args.length === 0 || (args.length === 1 && args[0] === '')) {
            return { valid: false, cmds: parsedCommands };
        }
        const cmds = this.splitArray(args, '|');

        let valid = true;
        for (const a of cmds) {
            const cmd = this.parseCommand(a);
            valid = valid && cmd.valid;
            parsedCommands.push(cmd);
        }

        return { valid: valid, cmds: parsedCommands };
    }

    private cmdAlias (alias: string, args: string []): string {
        if (!alias) {
            let rv = '';
            const keys = Object.keys(this._aliases).sort();
            for (const k of keys) {
                rv += k + ' -> ';
                for (const a of this._aliases[k]) {
                    rv += a + ' ';
                }
                rv += '\n';
            }
            return rv;
        }

        if (!Array.isArray(args) || args.length === 0) {
            if (this._aliases[alias]) {
                delete this._aliases[alias];
                return 'alias ' + alias + ' deleted.\n'
            } else {
                return 'No alias ' + alias + 'defined.\n';
            }
        }

        if (args[0] === 'alias') {
            return 'Error: alias for alias not allowed';
        }

        this._aliases[alias] = args.slice();
        return 'alias' + alias + ' now defined';
    }


    private parseRedirection (cmd: IParsedCommand, env: IVfsEnvironment): string [] {
        const redirect: string [] = [ undefined, undefined, undefined ];
        for (let j = 0; j < cmd.args.length; j++) {
            const arg = cmd.args[j];
            switch (arg) {
                case '>': case '1>': {
                    if (cmd.args.length >= j) {
                        redirect[1] = cmd.args[j + 1];
                        cmd.args.splice(j--, 2);
                    }
                    break;
                }

                case '1>&2': {
                    env.stdout = env.stderr;
                    cmd.args.splice(j--, 1);
                    break;
                }

                case '2>': {
                    if (cmd.args.length >= j) {
                        redirect[2] = cmd.args[j + 1];
                        cmd.args.splice(j--, 2);
                    }
                    break;
                }

                case '2>&1': {
                    env.stderr = env.stdout;
                    cmd.args.splice(j--, 1);
                    break;
                }

                case '<': {
                    if (cmd.args.length >= j) {
                        redirect[0] = cmd.args[j + 1];
                        cmd.args.splice(j--, 2);
                    }
                    break;
                }

                default: break;
            }
        }
        return redirect;
    }


    private cmdCd (path: string): Promise<vfs.VfsDirectoryNode> {
        if (!path) {
            path = '~';
        }
        return new Promise<vfs.VfsDirectoryNode>( (resolve, reject) => {
            vfs.getDirectory(path, this._user, this._pwd).then( (result) => {
                if (result) {
                    this._pwd = result;
                    this.setPrompt();
                    resolve(result);
                } else {
                    reject('\'' + path + '\' not found!');
                }
            }).catch(err => {
                debug.warn(err);
                reject('\'' + path + '\' not found (VFS Error)!');
            });
        });
    }

    private cmdCompleteAsFile (linePartial: string, args: string []): Promise<CompleterResult> {
        if (!args) {
            Promise.resolve( [ [], linePartial] );
        }

        let filter = '*';
        let fileNamePartial = '';
        if (args.length > 0) {
            fileNamePartial = args[args.length - 1 ]
            filter = fileNamePartial + '*';
            const i = fileNamePartial.lastIndexOf('/');
            if (i >= 0) {
                if (fileNamePartial.length !== (i + 1)) {
                    fileNamePartial = fileNamePartial.substr(i + 1);
                } else {
                    fileNamePartial = '';
                }
            }
        }
        return new Promise<CompleterResult>( (resolve, reject) => {
            vfs.getChilds(filter, this._user, this._pwd).then( (files) => {
                const hits: string [] = [];
                for (const f of files) {
                    if (f instanceof vfs.VfsDirectoryNode) {
                        hits.push(f.name + '/');
                    } else {
                        hits.push(f.name);
                    }
                }
                resolve( [ hits, fileNamePartial ] );
            }).catch( (err) => {
                // resolve([ [], linePartial]);
                resolve([ [], linePartial ]);
             });
        });
    }

    private cmdFiles (path: string): Promise<vfs.VfsAbstractNode []> {
        const p = vfs.getChilds(path, this._user, this._pwd);
        return p;
    }

    private cmdPwd (): vfs.VfsDirectoryNode {
        return this._pwd;
    }

    private help (args: string [], options: IVfsCommandOptions): number {
        if (args.length === 0) {
            const cmds = Object.keys(this._commands);
            cmds.push('exit');
            cmds.sort();
            for (const c of cmds) {
                if (c === 'exit') {
                    this._env.stdout.write(c + '\n');
                    continue;
                }
                if (!this._commands.hasOwnProperty(c)) { continue; }
                const cmd = this._commands[c];
                this._env.stdout.write(cmd.name + ' ' + cmd.getSyntax() + '\n');
            }
        } else {
            const c = args[0];
            if (c === 'exit') {
               this._env.stdout.write(c + '\n   exit the program');
            }
            const cmd = this._commands[c];
            if (!cmd) {
                this._env.stdout.write('Unknown command\n');
                return 1;
            } else {
                this._env.stdout.write(cmd.name + ' ' + cmd.getSyntax() + '\n');
                const help = cmd.getHelp();
                if (!Array.isArray(help)) {
                    this._env.stdout.write('   ' + help + '\n');
                } else {
                    for (const s of help) {
                        this._env.stdout.write('   ' + s + '\n');
                    }
                }
            }

        }
        return 0;
    }
}

class VfsDirectorySys extends vfs.VfsDirectoryNode {
    constructor (name: string, parent: vfs.VfsDirectoryNode, version: AppVersion) {
        super(name, parent);
        let s = '  main.ts Version ' + version.version + '\n';
        s += '  Started at: ' + version.startedAt.toISOString() + '\n';
        const git = version.git;
        if (git) {
            s += this.gitInfoAsString('GIT:', git, '   ');
        }
        this.addChild(new vfs.VfsStaticTextFile('version', this, s));
    }

    public refresh(): Promise<vfs.VfsAbstractNode> {
        return Promise.resolve(this);
    }

    private gitInfoAsString (name: string, git: GitInfo, prefix: string): string {
        if (!git) {
            return '';
        }
        let s = prefix + name + '\n';
        s += prefix + '    branch: ' + git.branch + '\n';
        s += prefix + '    commit: ' + git.hash + '\n';
        if (git.tag) {
            s += prefix + '       tag: ' + git.tag + '\n';
        }
        for (const r of git.remotes) {
            s += prefix + '    remote: ' + r + '\n';
        }
        if (git.modified.length === 0) {
            s += prefix + '   Status: no files modified\n';
        } else {
            s += prefix + '    Status: ' + git.modified.length + ' files modified\n';
            const sep = prefix + '   ' + new Array(30).join('-') + '\n';
            s += sep;
            for (const m of git.modified) {
                s += prefix + '       ' + m + '\n';
            }
            s += sep;
        }
        if (git.submodules.length > 0) {
            for (const sm of git.submodules) {
                s += this.gitInfoAsString('Submodule ' + sm.path, sm.gitInfo, prefix + '   ');
            }
        }
        return s;
    }
}


export interface IVfsConsole {
  version: AppVersion;
  out: NodeJS.WritableStream;
  prompt (preserveCursor?: boolean): void;
  setPrompt (prompt: string): void;
  exit (done: () => void): void;
}

