import {StoredTTVState} from "../util";
import ManagerAlreadyRegistered from "../exceptions/managerAlreadyRegistered";

export abstract class Manager {
    protected name: string;
    protected constructor(name: string, register: boolean = true) {
        this.name = name;
        if(register) getCoreManager().registerManager(this);
    }

    public abstract forceSync(state: StoredTTVState): void;

    public getName(): string {
        return this.name;
    }

    protected getManagerData(state: StoredTTVState): any {
        let data = state.managerData[this.name];
        if(data === undefined) data = state.managerData[this.name] = {};
        return data;
    }
}

export class CoreManager extends Manager {
    private managers: {[key: string]:Manager} = {};

    public constructor() {
        super("CoreManager", false);
    }

    public registerManager(manager: Manager): void {
        if(this.managers[manager.getName()] !== undefined) throw new ManagerAlreadyRegistered(manager);
        console.log("Registered new manager: " + manager.getName());
        this.managers[manager.getName()] = manager;
    }

    public getManager(name: string): Manager {
        return this.managers[name];
    }

    public forceSync(state: StoredTTVState): void {
        let keys = Object.keys(this.managers);
        for(let m in keys) {
            let x: Manager = this.managers[keys[m]];
            x.forceSync(state);
        }
        console.log("Completed full sync across managers for " + state.username);
    }

}

let cm: CoreManager = null;

export function getCoreManager(): CoreManager {
    if(cm != null) return cm;
    return cm = new CoreManager();
}