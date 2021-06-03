import {Manager} from "./manager";
import {Configuration, requestAuth, Reward, StoredTTVState} from "../util";
const config: Configuration = require('../config.json');

interface RewardsData {
    rewards: Array<any>
}

export default class RewardsManager extends Manager {
    public constructor() {
        super("RewardsManager");
    }

    forceSync(state: StoredTTVState): void {
        console.log("SYNC REWARDS " + state.id);
        let data: RewardsData = this.getManagerData(state);
        if(data.rewards === undefined) data.rewards = [];
        let neededAwards: Array<Reward> = config.rewards[state.username];
        if(neededAwards == null) neededAwards = [];
        requestAuth(state, "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=" + encodeURIComponent(state.id)).then(e => e.json()).then(e => {
            console.dir(e);
            if(e.error !== undefined) {
                console.log("Unable to sync rewards. " + e.message);
                return;
            }
        });
    }

}