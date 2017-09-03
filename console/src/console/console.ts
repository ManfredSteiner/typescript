
// Node.js modules
import { ReadLine, createInterface, CompleterResult } from 'readline';
import { EventEmitter } from 'events';

import * as vfs from './vfs';
import { VfsShell, IVfsConsole } from './vfs-shell';
import { AppVersion, IQuestionOptions } from './vfs-shell-command';

import * as debugsx from 'debug-sx';
const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:console');


export class Console extends EventEmitter {
    private _version: AppVersion;
    private _out: NodeJS.WritableStream;
    private _readLine: ReadLine;
    private _shell: VfsShell;
    private _exitCallback: (exitCode: number) => void;
    private _osFsBase: string;
    private _questionTimer: NodeJS.Timer;

    constructor (name: string, version: AppVersion, osFsBase?: string) {
        super();
        this._version = version;
        this._osFsBase = osFsBase || '/tmp';
        this._out = process.stdout;

        this._readLine = createInterface(
            {
                input: process.stdin,
                output: this._out,
                completer: this.completer.bind(this),
                terminal: true
            });
        this._readLine.setPrompt('> ');
        this._readLine.on('line', this.parseInput.bind(this));
        this._shell = new VfsShell(this, name || '?', new vfs.VfsUser(0, 0, 'admin', '/', true), version, osFsBase);
        this.setExitCallback(process.exit);
    }

    public get version () {
        return this._version;
    }

    public get out () {
        return this._out;
    }

    public getShell (): VfsShell {
        return this._shell;
    }

    public refresh (): Promise<any> {
        return this._shell.refresh();
    }

    public prompt (preserveCursor?: boolean): void {
        return this._readLine.prompt(preserveCursor);
    }

    public setPrompt (prompt: string): void {
        this._readLine.setPrompt(prompt);
    }


    public setExitCallback ( callback: (exitCode: number) => void ) {
        this._exitCallback = callback;
    }

    public setHistory (history: string []) {
        (<any>this._readLine).history = history.slice();
    }

    public getHistory (): string [] {
        return (<any>this._readLine).history;
    }

    public exit (done: () => void): void {
        const cb = (answer: string) => {
            if (answer === 'yes') {
                this._exitCallback(0);
            } else if (answer !== 'no') {
                this._out.write('invalid answer, use yes or no: ');
                this.question('really exit (yes/no): ', cb, { notToHistory: true });
            } else {
                done();
            }
        };
        this.question('really exit (yes/no): ', cb, { notToHistory: true })
    }

    public question (query: string, callback: (answer: string) => void, options?: IQuestionOptions) {
        const history = (<any>this._readLine).history;
        const oldHistorySize = Array.isArray(history) ? history.length : undefined;

        if (options.hide ||  options.hideSmart || options.replace ) {
            const stdin = process.stdin;
            const listener = (c: Buffer) => {
                const s = c.toString();
                const rep = (options.replace && options.replace.length > 0) ? options.replace.substr(0, 1) : '*';
                if (this._questionTimer) {
                    clearTimeout(this._questionTimer);
                    this._questionTimer = undefined;
                }
                if (s === '\r' || s === '\n') {
                    stdin.removeListener('data', listener);
                    // delete line with password from screen
                    if (options.deleteOnEnter) {
                        process.stdout.write('\u001b[1A\u001b[2K\u001b[200D');
                    }
                    return;
                } else {
                    process.stdout.write('\u001b[2K\u001b[200D');
                    process.stdout.write(query);
                }

                const input = (<any>this._readLine).line;
                if (options.hideSmart) {
                    let out = input.length < 2 ? '' : new Array(input.length).join(rep);
                    out += (s !== '\u007f' && s !== '\b') ? c : input.substr(input.length - 1, 1);
                    process.stdout.write(out);
                    this._questionTimer = setTimeout( () => {
                        process.stdout.write('\u001b[2K\u001b[200D');
                        process.stdout.write(query);
                        process.stdout.write(new Array((<any>this._readLine).line.length + 1).join(rep));
                        if (this._questionTimer) {
                            clearTimeout(this._questionTimer);
                            this._questionTimer = undefined;
                        }
                    }, 1000);
                } else if (options.replace) {
                    process.stdout.write(new Array((<any>this._readLine).line.length + 1).join(rep));
                }
            }
            stdin.on('data', listener);
        }

        this._readLine.question(query, (answer) => {
            const newHistorySize = Array.isArray(history) ? history.length : 0;
            if (newHistorySize > oldHistorySize &&  options && options.notToHistory) {
                (<any>this._readLine).history = history.slice(newHistorySize - oldHistorySize);
            }
            callback(answer);
        });
    }

    private parseInput (input: string) {
        this.emit('line', input);
        this._shell.handleInput(input);
    }


    private completer (linePartial: string, callback: (err: any, result: CompleterResult) => void) {
        this._shell.completer(linePartial, callback);
    }

}
