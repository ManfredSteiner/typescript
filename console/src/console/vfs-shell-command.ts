import { sprintf } from 'sprintf-js';
import * as util from 'util';

import * as vfs from './vfs';

import { Readable, Writable } from 'stream';
import * as stream from 'stream';
import { CompleterResult } from 'readline';

import * as debugsx from 'debug-sx';
const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:vfs-shell-command');

export interface CmdCompleterResult {
    completerResult?: CompleterResult;
    isFile?: boolean;
    choices?: string | string [];
    hint?: (argIndex: number, line?: string, parsedCommand?: IParsedCommand) => string | string [];
    help?: () => string | string [];
}


export abstract class VfsShellCommand {
    private static dateFormatter = new Intl.DateTimeFormat('de-AT', {
        weekday: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
    });

    private _name: string;
    private _interrupted = false;
    private _env: IVfsEnvironment;
    private _shellCmds: IVfsShellCmds;
    private _sep: { [ key: string ]: string };

    constructor (name: string, shellCmds: IVfsShellCmds) {
      this._name = name;
      this._shellCmds = shellCmds;
      this._sep = {};
    }

    public get name () {
        return this._name;
    }

    protected get env (): IVfsEnvironment {
        return this._env;
    }

    protected get shellCmds (): IVfsShellCmds {
        return this._shellCmds;
    }

    public abstract execute (args: string [], options: IVfsCommandOptions): Promise<number>;
    public abstract getHelp (): string [] | string;
    public abstract getSyntax (): string [] | string;

    public completer (line: string, parsedCommand: IParsedCommand, argIndex: number): Promise<CmdCompleterResult> {
        return Promise.resolve(undefined);
    }

    public optionConfig (): IVfsCommandOptionConfig {
      return {};
    }

    public interrupt () {
      this._interrupted = true;
    }

    public isInterrupted (): boolean {
        return this._interrupted;
    }

    public async start (args: string [], options: IVfsCommandOptions): Promise<number> {
        const exitCode = await this.execute(args, options);
        if (exitCode !== 0) {
            this.endWithError('', exitCode);
        } else {
            this.destroy();
            return exitCode;
        }
    }


    protected separator (length: number, char?: string): string {
        char = char || '-';
        let sep = this._sep[char + length];
        if (!sep) {
            sep = new Array(length).join(char);
            this._sep[char + length] = sep;
        }
        return sep;
    }

    protected print (format: any, ...param: any[]): void {
        let str: string;
        if (!format) {
            return;
        }
        str = sprintf.apply(null, arguments);
        this._env.stdout.write(str);
    }

    protected println (format?: any, ...param: any[]): void {
        this.print.apply(this, arguments);
        this._env.stdout.write('\n');
    }

    protected toDateString (time: number | Date): string {
        if (time === undefined || time === null || (typeof time === 'number' && time <= 0)) {
            return '';
        }
        const d = time instanceof Date ? time : new Date(time);
        return [ 'So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa' ][d.getDay()] +
                ', ' + d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() +
                sprintf(', %02d:%02d:%02d', d.getHours(), d.getMinutes(), d.getSeconds() );

    }

    protected toPointedInteger (value: number): string {
        let s = '';
        while (value > 0 ) {
            const x = Math.floor(value % 1000);
            value = Math.floor(value / 1000);
            if (value > 0) {
                if (x > 100) {
                    s = x + ( s !== '' ? '.' + s : s);
                } else if (x >  10) {
                    s = '0' + x + ( s !== '' ? '.' + s : s);
                } else if (x >  1)  {
                    s = '00' + x + ( s !== '' ? '.' + s : s);
                } else {
                    s = '000' + ( s !== '' ? '.' + s : s);
                }
            }
        }
        if (!s) {
            s = '' + Math.floor(value);
        }
        return s;
    }


    protected parseOptions (args: string [],
                            options: { [ key: string ]: { short?: string, argCnt?: number} } ): { [key: string]: string [] } {
        const rv: { [key: string]: string [] } = {};
        let i;
        for (i = 1; i < args.length; i++) {
            const arg = args[i];
            if (arg.startsWith('--')) {
                const optionName = arg.substr(2);
                const o = options[optionName];
                if (o === undefined) {
                    this.env.stderr.write('Option ' + arg + ' unsupported\n');
                } else if (o.argCnt > 0) {
                    if ((i + o.argCnt) >= args.length) {
                        this.env.stderr.write('Option ' + arg + ': missing arguments\n');
                        return undefined; // error
                    }
                    const objectArgs = args.slice(i + 1, o.argCnt);
                    rv[optionName] = objectArgs;
                    i += o.argCnt;
                } else {
                    rv[optionName] = null;
                }

            } else if (arg.startsWith('-') && arg.length > 1) {
                for (let j = 1; j < arg.length; j++) {
                    const shortOption = arg[j];
                    let found = false;
                    for (const k in options) {
                        if (!options.hasOwnProperty(k)) { continue; }
                        const o = options[k];
                        if (o.short !== shortOption) { continue; }
                        found = true;
                        if (o.argCnt > 0) {
                            if ((i + o.argCnt) >= args.length) {
                                this.env.stderr.write('Option ' + arg + ': missing arguments\n');
                                return undefined; // error
                            }
                            const objectArgs = args.slice(i + 1, i + 1 + o.argCnt);
                            rv[k] = objectArgs;
                            i += o.argCnt;
                        } else {
                            rv[k] = [];
                        }
                    }
                    if (!found) {
                        this.env.stderr.write('Option -' + shortOption + ' not supported\n');
                    }
                }
           } else {
                break;
           }
        }
        args.splice(1, i - 1);
        return rv;
    }

    protected completeAsFile (linePartial: string, parsedCommand: IParsedCommand): Promise<CompleterResult> {
        return this._shellCmds.completeAsFile(linePartial, parsedCommand.args);
    }

    protected readObjects (args: string [], acceptOnlyArrays?: boolean): Promise<Object []> {
        return new Promise<Object []>( (resolve, reject) => {
            let p: Promise<string>;
            if (args.length > 0 && args[0] !== '-') {
                p = Promise.resolve(args[0]);
            } else {
                let json = '';
                p = new Promise<string>( (res, rej) => {
                    this.env.stdin.on('error', (err) => rej(err) );
                    this.env.stdin.on('end', () => res(json) );
                    // this.env.stdin.on('close', () => { } );
                    this.env.stdin.on('data', (chunk) => json += chunk );
                    this.env.stdin.resume();
                });
            }
            p.then( (jsonString) => {
                let obj;
                try {
                    obj = JSON.parse(jsonString);
                    if (!Array.isArray(obj)) {
                        if (!acceptOnlyArrays) {
                            resolve( [ obj ]);
                        } else {
                            reject('json is not an array of objects');
                        }
                    } else {
                        resolve(obj);
                    }
                } catch (err) {
                    reject('parsing json error');
                }
            }).catch( err => reject('reading json data fails') );
        });
    }

    protected endWithError (msg: string, exitCode?: number, cause?: Error): never {
        msg = 'Error' + (exitCode ? ' ' + exitCode : '' ) + ' (' + this.name + ')' + (msg ? ': ' + msg : '');
        throw new VfsShellCommandError(msg, exitCode, cause);
    }

    protected question (text: string, options?: IQuestionOptions): Promise<string> {
        return this._shellCmds.question(text, options);
    }


    private destroy (error?: any) {
        if (this.env.stdout !== process.stdout && this.env.stdout !== process.stderr) {
            // check constructor, because using instanceof will not work
            // see https://stackoverflow.com/questions/45772705
            if (PipeWritable.prototype.isPrototypeOf(this.env.stdout)) {
                // (<PipeWritable>this.env.stdout).destroy(error);
                this.env.stdout.end();
            } else {
                if (error) {
                    (<stream.Writable>this.env.stdout).destroy(error);
                } else {
                    this.env.stdout.end();
                }
            }
        }

        if (this.env.stderr !== process.stdout && this.env.stderr !== process.stderr) {
            if (PipeWritable.prototype.isPrototypeOf(this.env.stderr)) {
                // this.env.stderr.destroy(error);
                this.env.stderr.end();
            } else {
                if (error) {
                    (<stream.Writable>this.env.stderr).destroy(error);
                } else {
                    this.env.stderr.end();
                }
            }

        }
    }

}

export class VfsShellCommandError extends Error {

    private _exitCode: number;
    private _cause: Error;

    constructor (message: string, exitCode?: number, cause?: Error) {
        super(message);
        this._exitCode = exitCode;
        this._cause = cause;
    }

    public get exitCode (): number {
        return this._exitCode || 255;
    }

    public get cause (): Error {
        return this._cause;
    }
}

export interface IVfsEnvironment {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    stdin: NodeJS.ReadableStream;
    [ key: string ]: any;
}

export class PipeReadable extends Readable {
  constructor () {
      super( { objectMode: true } ); // object is one line
      this.pause();
      this.on('error', (err)  => { });
  }

  public _read (size: number) { }
}

/**
 * Attention avoid: obj instanceof PipeWritable
 *     use instead: PipeWritable.prototype.isPrototypeOf(obj)
 *             see: https://stackoverflow.com/questions/45772705
 */
export class PipeWritable extends Writable {
    private _sink: Readable;
    private _destroyOnEnd: boolean;

    constructor (connectedTo: Readable, destroyOnEnd: boolean) {
        super( { objectMode: true } );
        this._sink = connectedTo;
        this._destroyOnEnd = destroyOnEnd;
        this.on('end', () => { if (this._destroyOnEnd) { this._sink.push(null); } });
        this.on('destroy', (err) => { this.destroy(err); } );
        this.on('close', () => { this.destroy(); });
        this.on('error', (err) => { this.destroy(err); });
    }

    public end(): void;
    // tslint:disable-next-line:unified-signatures
    public end(chunk: any, cb?: Function): void;
    // tslint:disable-next-line:unified-signatures
    public end(chunk: any, encoding?: string | Function, cb?: Function): void;
    public end(...args: any[]): void {
        super.end(...args);
        this.destroy();
    }


    _write (chunk: any, encoding?: string, done?: Function): void {
        this._sink.push(chunk, encoding);
        done();
    }

    _destroy(err: Error, callback: Function): void {
        if (this._destroyOnEnd) {
          this._sink.destroy(err);
        }
    }

    _final(done: Function): void {
        done();
    }

}

export interface GitInfo {
    remotes: string [],
    branch: string,
    tag: string,
    hash: string,
    modified: string [],
    submodules: { path: string, gitInfo: GitInfo } []
}

export interface AppVersion {
    version: string,
    startedAt: Date,
    git: GitInfo
}

export interface IVfsShellCmds {
    alias: (alias: string, args: string []) => string,
    cd: (path: string) => Promise<vfs.VfsDirectoryNode>,
    completeAsFile: (linePartial: string, args: string []) => Promise<CompleterResult>;
    files: (path: string) => Promise<vfs.VfsAbstractNode []>,
    question: (text: string, options?: IQuestionOptions) => Promise<string>,
    pwd: () => vfs.VfsDirectoryNode,
    version: () => AppVersion
}

export interface IVfsCommandOptionConfig {
   [ key: string ]: { short?: string, argCnt?: number }
}

export interface IVfsCommandOption {
    valid: boolean;
    name?: string;
    long?: string;
    short?: string;
    args?: string [];
}

export interface IVfsCommandOptions {
   [ key: string ]: IVfsCommandOption;
}

export interface IParsedCommand {
    valid: boolean;
    cmd?: VfsShellCommand,
    options?: IVfsCommandOption [],
    args?: string [],
    cmdString?: string,
    optionPartial?: { option: string, known: boolean, args?: string [] }
    beforeAlias?: string []
}

export interface IParsedCommands {
    valid: boolean,
    cmds: IParsedCommand []
}

export interface IQuestionOptions {
    hide?: boolean;
    hideSmart?: boolean;
    replace?: string;
    notToHistory?: boolean;
    deleteOnEnter?: boolean;
}
