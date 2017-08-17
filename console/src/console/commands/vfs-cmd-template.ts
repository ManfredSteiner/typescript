import { VfsShellCommand, IVfsShellCmds, IVfsCommandOptionConfig, IParsedCommand, IVfsCommandOptions } from '../vfs-shell-command';
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
            this.end();
            resolve(0);
        });
    }

    public getHelp (): string {
        return '...';
    }

    public getSyntax (): string {
        return '...';
    }

    public completer (linePartial: string, parsedCommand: IParsedCommand): CompleterResult {
        return this.completeAsFile(linePartial, parsedCommand);
    }
}
