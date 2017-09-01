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

    public async execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        if (args.length !== 1) {
            this.endWithError('Error (template): invalid arguments', 1);
        }
        await this.doit();
        return 0;
    }

    public getHelp (): string {
        return '...';
    }

    public getSyntax (): string {
        return '...';
    }

    public async completer (line: string, parsedCommand: IParsedCommand, argIndex: number): Promise<CmdCompleterResult> {
        return { isFile: true };
    }

    private doit (): Promise<void> {
        return new Promise<void>( (resolve, reject) => {
            setTimeout( () => resolve(), 1000);
            // setTimeout( () => reject('Fehler'), 1000);
            // setTimeout( () => reject(new Error('Error by template')), 1000);
        })
    }
}
