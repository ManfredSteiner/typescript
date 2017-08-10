
import { Vfs } from './vfs';
import { VfsAbstractNode, VfsDirectoryNode, VfsDataNode, VfsStaticTextFile } from './vfs-node';
import { IVfsShellUser } from './vfs-shell-user';
import { IVfsEnvironment, IVfsShellCmds, PipeReadable, PipeWritable, VfsShellCommand } from './vfs-shell-command';
import { addDefaultCommands } from './commands/vfs-commands';

import { Readable, Writable } from 'stream';
import { CompleterResult } from 'readline';

import * as debugsx from 'debug-sx';
const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:VfsShell');

export class VfsShell {
    private _pwd: VfsDirectoryNode;
    private _console: IVfsConsole;
    private _name: string;
    private _user: IVfsShellUser;
    private _commands: { [ key: string ]: VfsShellCommand } = {};
    private _cmdPending: boolean;
    private _lastExitCode: number;
    private _waitingCommands: string [] = [];
    private _env: IVfsEnvironment;
    private _shellCmds: IVfsShellCmds;
    private _aliases: { [ key: string ]: string []};

    public constructor (console: IVfsConsole, name: string, user: IVfsShellUser) {
        const home = Vfs.Instance.getHomeDirectory(user);
        this._pwd = home || Vfs.Instance.root;
        this._console = console;
        this._name = name;
        this._user = user;
        this._env = { stdout: process.stdout, stdin: process.stdin, stderr: process.stderr };
        this._lastExitCode = 0;

        Vfs.Instance.root.addChild(new VfsDirectorySys('sys', Vfs.Instance.root));

        this._shellCmds = {
            alias: this.cmdAlias.bind(this),
            cd: this.cmdCd.bind(this),
            files: this.cmdFiles.bind(this),
            pwd: this.cmdPwd.bind(this),
            version: () => console.version
        }
        this._aliases = { ll: [ 'ls', '-l' ] };

        addDefaultCommands(this._shellCmds, this._commands);
        this.setPrompt();
        this.console.prompt();
    }

    public get console (): IVfsConsole {
        return this._console;
    }

    public get pwd (): VfsDirectoryNode {
        return this._pwd;
    }

    public setPrompt (): void {
        const promptPre = this._user.getName() + '@' + this._name + ':';
        const promptPost = this._user.isAdmin ? '# ' : '$ ';
        let path = this._pwd.fullName;
        if (this._user.getHome() !== '/' && path.startsWith(this._user.getHome())) {
            path = '~' + path.substr(this._user.getHome().length);
        }
        const prompt = promptPre + path + promptPost;
        this._console.setPrompt(prompt);
    }

    public handleInput (line?: string): void {
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

        let arg = '', mode = undefined;
        let args: string [] = [];
        for (let i = 0; i < line.length; i++) {
            let c = line[i];
            if (!mode && (c === ' ' || c === '\t' || c === '\0' )) {
                if (arg.length > 0) { args.push(arg); arg = ''; }
            } else if (!mode && (c === '"' || c === '\'')) {
                mode = c;
            } else if (mode && (c === '"' || c === '\'')) {
                mode = undefined;
                if (arg.length > 0) { args.push(arg); arg = ''; }
            } else if (mode === '\'') {
                arg += c;
            } else if (c === '$' && i < (line.length - 1)) {
                c = line[++i];
                if (c === '?') {
                    arg += this._lastExitCode;
                } else {
                    arg += '$' + c;
                }
            } else if (c === '\\' && i < (line.length - 1)) {
                c = line[++i];
                switch (c) {
                   case 'n': arg += '\n'; break;
                   case 'r': arg += '\r'; break;
                   case 't': arg += '\t'; break;
                   case '$': arg += '$'; break;
                   case '0': arg += '\0'; break;
                   default:  arg += '\\' + c;
                }
            } else {
                arg += c;
            }
        }
        if (arg.length > 0) { args.push(arg); arg = ''; }

        // let args = line && line.trim().split(/\s+/);
        if (!Array.isArray(args) || args.length === 0 || (args.length === 1 && args[0] === '')) {
            this._cmdPending = false;
            // this.console.prompt();
            this.handleInput();
            return;
        }
        if (args[0] === 'exit') {
            this.console.exit();
            return;
        }
        if (args[0] === 'help') {
            this.help(args);
            this.handleInput();
            return;
        }

        // const zeroWritable = new Writable( { write: function (chunk, enc, done) { done(); } });
        const cmds: { cmd: VfsShellCommand, args: string [], env?: IVfsEnvironment, promise?: Promise<number> } [] = [];
        do {
            const cmdAlias = this._aliases[args[0]];
            if (cmdAlias) {
                args = cmdAlias.concat(args.slice(1));
            }
            const cmd = this._commands[args[0]];
            if (!cmd) {
                this._console.out.write('Error: unknown command\n');
                this.console.prompt();
                return;
            }
            const i = args.indexOf('|');
            if (i >= 0) {
                const nextArgs = args.splice(i);
                nextArgs.shift();
                cmds.push( { cmd: cmd, args: args });
                args = nextArgs;
            } else {
                cmds.push( { cmd: cmd, args: args });
                args = [];
            }
        } while (args.length > 0);

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
            cmds[i].env = env;
        }

        const cmdPromisses: Promise<number> [] = [];
        for (let i = 0; i < cmds.length; i++) {
           const c = cmds[i];
           (<any>c.cmd)._env = c.env;
           this._cmdPending = true;
           c.promise = c.cmd.execute(c.args);
           cmdPromisses.push(c.promise);
        }

        Promise.all(cmdPromisses).then( () => {
            this._cmdPending = false;
            this._lastExitCode = 0;
            // this.console.prompt();
            this.handleInput();
        }).catch( err => {
            this._cmdPending = false;
            this._lastExitCode = err;
            // this.console.prompt();
            this.handleInput();
        })
    }


    public completer (linePartial: string, callback: (err: any, result: CompleterResult) => void ) {
        const cmds: string [] = [ 'help', 'exit' ];
        for (const c in this._commands) {
            if (!this._commands.hasOwnProperty(c)) { continue; }
            cmds.push(this._commands[c].name);
        }
        cmds.sort();
        if (linePartial === '') {
            callback(null, [ cmds, '']);
        }

        const hits = cmds.filter( c => {
            if (c.indexOf(linePartial) === 0) {
                return c;
            }
        });
        callback(null, [ hits, linePartial]);
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

    private cmdCd (path: string): string {
        if (!path) {
            this._pwd = Vfs.Instance.getHomeDirectory(this._user);
            return undefined;
        }
        const p = Vfs.Instance.getDirectory(path, this._user, this._pwd);
        if (!p) {
            return '\'' + path + '\' not found!';
        }
        this._pwd = p;
        this.setPrompt();
        return undefined;
    }

    private cmdFiles (path: string): VfsAbstractNode [] {
        const p = Vfs.Instance.getChilds(path, this._user, this._pwd);
        return p;
    }

    private cmdPwd (): VfsDirectoryNode {
        return this._pwd;
    }

    private help (args: string []) {
        if (args.length === 1) {
            const cmds = Object.keys(this._commands);
            cmds.push('exit');
            cmds.push('help');
            cmds.sort();
            for (const c of cmds) {
                if (c === 'help') {
                    this._env.stdout.write(c + ' [command]\n');
                    continue;
                }
                if (c === 'exit') {
                    this._env.stdout.write(c + '\n');
                    continue;
                }
                if (!this._commands.hasOwnProperty(c)) { continue; }
                const cmd = this._commands[c];
                this._env.stdout.write(cmd.name + ' ' + cmd.getSyntax() + '\n');
            }
        } else {
            const c = args[1];
            if (c === 'help' ) {
               this._env.stdout.write(c + '\n   this command ...\n');
            } else if (c === 'exit') {
               this._env.stdout.write(c + '\n   exit from program\n');
            } else {
               const cmd = this._commands[c];
               if (!cmd) {
                   this._env.stdout.write('Unknown command\n');
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
        }
    }
}


class VfsDirectorySys extends VfsDirectoryNode {
    constructor (name: string, parent: VfsDirectoryNode) {
        super(name, parent);
        this.addChild(new VfsStaticTextFile('version', this, '1.0'));
    }

    public refresh(): Promise<VfsAbstractNode> {
        return Promise.resolve(this);
    }
}

export interface IVfsConsole {
  version: string;
  out: NodeJS.WritableStream;
  prompt (preserveCursor?: boolean): void;
  setPrompt (prompt: string): void;
  exit (): void;
}


