import { VfsAbstractNode, VfsDirectoryNode } from './vfs-node';

import { sprintf } from 'sprintf-js';
import * as util from 'util';

import { Readable, Writable } from 'stream';


export abstract class VfsShellCommand {
    private _name: string;
    private _interrupted = false;
    private _env: IVfsEnvironment;

    constructor (name: string) {
      this._name = name;
    }

    public get name () {
        return this._name;
    }

    protected get env (): IVfsEnvironment {
        return this._env;
    }

    public abstract execute (args: string []): Promise<number>;
    public abstract getHelp (): string [] | string;
    public abstract getSyntax (): string [] | string;

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
    files: (path: string) => VfsAbstractNode [],
    pwd: () => VfsDirectoryNode,
    version: () => string

}
