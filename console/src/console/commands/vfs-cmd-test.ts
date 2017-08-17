
import { VfsShellCommand, IVfsShellCmds, IVfsCommandOptionConfig, IParsedCommand, IVfsCommandOptions } from '../vfs-shell-command';
import { CompleterResult } from 'readline';


export class VfsCmdTest extends VfsShellCommand {
    private _value: string;
    private _repeat: number;
    private _delay: number;
    private _resolve: ( exitValue: number ) => void;
    private _options: IVfsCommandOptions;

    constructor (shell?: IVfsShellCmds) {
        super('test', shell);
    }

    public optionConfig (): IVfsCommandOptionConfig {
      return {
         noLine: { short: 'n', argCnt: 0 },
      };
    }

    public execute (args: string [], options: IVfsCommandOptions): Promise<number> {
        this._options = options;
        if (args.length < 1) {
            this.end('Error (test): invalid arguments');
            return Promise.reject(1);
        }
        this._value = args[0];
        this._repeat = +args[1];
        this._delay = +args[2];
        this._repeat = isNaN(this._repeat) ? 1 : this._repeat;
        this._delay = isNaN(NaN) ? 0 : this._delay * 1000;
        return new Promise<number>( (resolve, reject) => {
            this._resolve = resolve;
            this.printValue();
        });
    }

    public getHelp (): string {
        return 'test commando, prints value x times with delay w';
    }

    public getSyntax (): string {
        return 'value x w';
    }

    public completer (linePartial: string, parsedCommand: IParsedCommand): CompleterResult {
        return this.completeAsFile(linePartial, parsedCommand);
    }


    private printValue () {
        if (this._repeat <= 0)  {
            this.end();
            this._resolve(0);
        } else {
            this._repeat--;
            this.env.stdout.write(this._value + this._options.noLine ? '' : '\n');
            if (this._repeat === 0 || this._delay === 0) {
                this.printValue();
            } else {
                setTimeout(this.printValue.bind(this), this._delay);
            }
        }
    }

}
