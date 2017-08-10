
export class VfsShellUser implements IVfsShellUser {
  private _name: string;
  private _isAdmin: boolean;
  private _home: string;

  public constructor (name: string, admin: boolean, home: string) {
    this._name = name;
    this._isAdmin = admin;
    this._home = home;
  }

  public getName (): string {
    return this._name;
  }

  public isAdmin(): boolean {
    return this._isAdmin;
  }

  public getHome(): string {
    return this._home;
  }
}


export interface IVfsShellUser {
    getName(): string;
    isAdmin(): boolean;
    getHome(): string;
}
