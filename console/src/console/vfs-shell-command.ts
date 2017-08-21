import { sprintf } from 'sprintf-js';
import * as util from 'util';

import * as vfs from './vfs';

import { Readable, Writable } from 'stream';
import * as stream from 'stream';
import { CompleterResult } from 'readline';

import * as debugsx from 'debug-sx';
const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:vfs-shell-command');



export abstract class VfsShellCommand {
    private _name: string;
    private _interrupted = false;
    private _env: IVfsEnvironment;
    private _shellCmds: IVfsShellCmds;

    constructor (name: string, shellCmds: IVfsShellCmds) {
      this._name = name;
      this._shellCmds = shellCmds;
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

    public completer (linePartial: string, parsedCommand: IParsedCommand): Promise<CompleterResult> {
        const rv: CompleterResult = [ [], linePartial ];
        return Promise.resolve(rv);
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

    public handleError (err: any, reject: Function, resolve?: Function, exitCode?: number) {
        this.env.stderr.write('Error (' + this.name + ')');
        if (typeof err === 'string') {
            this.env.stderr.write(': ' + err + '\n');
            if (resolve) {
                resolve(exitCode || 255);
            } else {
                reject(err);
            }
        } else if (err instanceof Error && err.message) {
            this.env.stderr.write(': ' + err.message + '\n');
            this.env.stderr.write('  ' + err.stack + '\n');
            reject(err);
        } else {
            debug.warn(err);
            this.env.stderr.write(': internal error\n');
            this.env.stderr.write('  ' + err.stack + '\n');
            reject(err);
        }
        this.end();
    }

    protected end (error?: any) {
      if (error) {
          if (typeof(error) === 'string') {
              this.env.stderr.write(error + '\n');
          } else if (error instanceof Error && typeof(error.message) === 'string') {
              this.env.stderr.write(error.message + '\n');
          } else {
              this.env.stderr.write('Error' + '\n');
          }
      }
      this.destroy(error);
    }


    protected print (str: any): void {
        if (!str) {
            return;
        }
        if (str instanceof Error) {
            str = util.format(str);
        } else if (typeof str  === 'object') {
            str = JSON.stringify(str);
        }
        this._env.stdout.write(str);
    }

    protected println (str?: any): void {
        if (str) {
            this.print(str + '\n');
        } else {
            this._env.stdout.write('\n');
        }
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
