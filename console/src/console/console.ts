
// Node.js modules
import { ReadLine, createInterface, CompleterResult } from 'readline';

import { VfsShell, IVfsConsole } from './vfs-shell';
import { VfsShellUser, IVfsShellUser } from './vfs-shell-user';

import * as debugsx from 'debug-sx';
const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console:console');

export class Console {
    private _version: string;
    private _out: NodeJS.WritableStream;
    private _readLine: ReadLine;
    private _shell: VfsShell;
    private _exitCallback: (exitCode: number) => void;
    private _waitForResponse: (response: string) => void;

    constructor (name: string, version: string) {

        this._version = version;
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
        this._shell = new VfsShell(this, name || '?', new VfsShellUser('admin', true, '/'));
        this.setExitCallback(process.exit);
    }

    public get version () {
        return this._version;
    }

    public get out () {
        return this._out;
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


    public exit (): void {
        this._out.write('really exit (yes/no): ');
        this._waitForResponse = (response) => {
            if (response === 'yes') {
                // process.exit(0);
                this._exitCallback(0);
            } else if (response === 'no') {
                this._waitForResponse = undefined;
                this._shell.handleInput();
            } else {
                this._out.write('invalid answer, use yes or no: ');
            }
        };
    }


    private parseInput (input: string) {
        if (this._waitForResponse) {
           this._waitForResponse(input);
           return;
        }
        this._shell.handleInput(input);
    }


    private completer (linePartial: string, callback: (err: any, result: CompleterResult) => void ) {
        this._shell.completer(linePartial, callback);
    }

}
