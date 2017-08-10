
import { IVfsShellCmds, VfsShellCommand } from '../vfs-shell-command';

export class VfsCmdTemplate extends VfsShellCommand {
    constructor (shellCmds?: IVfsShellCmds) {
        super('template');
    }

    public execute (args: string []): Promise<number> {
        const options = this.parseOptions(args, { noLine: { short: 'n' }});
        if (!options) {
            this.env.stderr.write('Error (template): invalid options');
            this.println();
            this.end();
            return Promise.reject(1);
        }
        if (args.length !== 2) {
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
