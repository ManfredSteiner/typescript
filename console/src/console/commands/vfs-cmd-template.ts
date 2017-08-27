import { VfsShellCommand, IVfsShellCmds, IVfsCommandOptionConfig, IParsedCommand, IVfsCommandOptions,
         CmdCompleterResult } from '../vfs-shell-command';
import { CompleterResult } from 'readline';

export class VfsCmdTemplate extends VfsShellCommand {
    constructor (shellCmds?: IVfsShellCmds) {
        super('template', shellCmds);
    }

    public optionConfig (): IVfsCommandOptionConfig {
      return {
         noLine: { short: 'n', argCnt: 0 },
      };
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length !== 1) {
            this.end('Error (template): invalid arguments');
            return Promise.reject(1);
        }
        return new Promise<number>( (resolve, reject) => {
            this.doit().then( () => {
                this.end();
                resolve(0);
            }).catch( err => this.handleError(err, reject, resolve, 1));
        });
    }

    public getHelp (): string {
        return '...';
    }

    public getSyntax (): string {
        return '...';
    }

    public completer (line: string, parsedCommand: IParsedCommand, argIndex: number): Promise<CmdCompleterResult> {
        return Promise.resolve({ isFile: true });
    }

    private doit (): Promise<void> {
        return new Promise<void>( (resolve, reject) => {
            setTimeout( () => resolve(), 1000);
            // setTimeout( () => reject('Fehler'), 1000);
            // setTimeout( () => reject(new Error('Error by template')), 1000);
        })
    }
}
