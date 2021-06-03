import {Manager} from "../managers/manager";

export default class ManagerAlreadyRegistered extends Error {
    public constructor(manager: Manager) {
        super();
        this.name = "ManagerAlreadyRegistered";
        this.message = "The requested manager has already been registered. " + manager.getName();
    }
}