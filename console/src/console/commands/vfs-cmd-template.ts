
import { IVfsShellCmds, VfsShellCommand, IVfsCommandOptionConfig, IVfsCommandOptions } from '../vfs-shell-command';

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
            this.env.stderr.write('invalid arguments\n');
            return Promise.reject(1);
        }
        return new Promise<number>( (resolve, reject) => {
            resolve(0);
        });
    }

    public getHelp (): string {
        return '...';
    }

    public getSyntax (): string {
        return '...';
    }
}
