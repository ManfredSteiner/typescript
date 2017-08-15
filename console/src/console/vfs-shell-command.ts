import { sprintf } from 'sprintf-js';
import * as util from 'util';

import * as vfs from './vfs';

import { Readable, Writable } from 'stream';
import { CompleterResult } from 'readline';



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

    public completer (linePartial: string, parsedCommand: IParsedCommand): CompleterResult {
        return undefined;
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

    protected completeAsFile (linePartial: string, parsedCommand: IParsedCommand): CompleterResult {
        if (parsedCommand && parsedCommand.args) {
            let filter = '*';
            let fileNamePartial = '';
            if (parsedCommand.args.length > 0) {
                fileNamePartial = parsedCommand.args[parsedCommand.args.length - 1 ]
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
            const files = this._shellCmds.files(filter) || [];
            const hits: string [] = [];
            for (const f of files) {
                if (f instanceof vfs.VfsDirectoryNode) {
                    hits.push(f.name + '/');
                } else {
                    hits.push(f.name);
                }
            }
            return [ hits, fileNamePartial ];
        }
        return undefined;
    }

    private destroy (error?: any) {
        if (this.env.stdout instanceof PipeWritable) {
            if (this.env.stdout !== <any>process.stdout && this.env.stdout !== <any>process.stderr) {
                this.env.stdout.destroy(error);
            }
        }
        if (this.env.stderr instanceof PipeWritable) {
            if (this.env.stderr !== <any>process.stdout && this.env.stderr !== <any>process.stderr) {
                this.env.stderr.destroy(error);
            }
        }
        // does not work, process.stderr is detected as instance of PipeWritable why ?
        // if (this.env.stdout instanceof PipeWritable) {
        //     this.env.stdout.destroy(error);
        // }
        // if (this.env.stderr instanceof PipeWritable) {
        //     this.env.stderr.destroy(error);
        // }
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


export interface IVfsShellCmds {
    alias: (alias: string, args: string []) => string,
    cd: (path: string) => string,
    files: (path: string) => vfs.VfsAbstractNode [],
    pwd: () => vfs.VfsDirectoryNode,
    version: () => string

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


