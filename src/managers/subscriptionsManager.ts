import {Manager} from "./manager";
import {appRequest, Configuration, pullState, requestAuth, saveState, StoredTTVState} from "../util";
import {Request} from "express";
import crypto from 'crypto';
const config: Configuration = require('../config.json');

export interface Transport {
    method: string,
    callback: string,
    secret: string
}

export interface Subscription {
    id: string,
    status: string,
    type: string,
    version: string,
    condition: any,
    created_at: string,
    transport: Transport,
    cost: number
}

export default class SubscriptionsManager extends Manager {
    private subscriptions: {[key: string]: Array<Subscription>} = {};
    private tempSecrets = {};
    public constructor() {
        super("SubscriptionsManager");
        appRequest('https://api.twitch.tv/helix/eventsub/subscriptions').then(e => e.json()).then(e => {
            console.dir(e);
            e.data.forEach(e => {
                let bc = this.subscriptions[e.condition.broadcaster_user_id];
                if(bc === undefined) bc = this.subscriptions[e.condition.broadcaster_user_id] = [];
                if(e.status !== "enabled") {
                    appRequest('https://api.twitch.tv/helix/eventsub/subscriptions?id=' + encodeURIComponent(e.id), {method: "DELETE"}).then(e => {
                        console.log("DELETE stale subscription " + e.status);
                    });
                    return;
                }
                bc.push(e);
            });
        });
    }

    forceSync(state: StoredTTVState): void {
        let desiredSubs = Array.from(config.subscribe);
        let actual = this.subscriptions[state.id];
        if(actual === undefined) actual = [];
        actual.forEach(e => {
            let ind = desiredSubs.indexOf(e.type);
            if(ind === -1) {
                this.unsubscribe(e.id);
                return;
            }
            desiredSubs.splice(ind, 1);
        });
        console.log("User has subscribed to ", actual, " // Expecting ", config.subscribe)
        desiredSubs.forEach(e => {
            console.log("SUBSCRIBE " + e + " -> " + state.username);
            this.subscribe(state, e);
        });
        this.processIncoming = this.processIncoming.bind(this);
    }

    private unsubscribe(id: string) {

    }

    private subscribe(state: StoredTTVState, type: string) {
        let data = this.getManagerData(state);
        if(data.secrets == undefined) data.secrets = {};
        let secret = crypto.randomBytes(15).toString("hex");
        appRequest("https://api.twitch.tv/helix/eventsub/subscriptions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                type,
                version: 1,
                condition: {
                    broadcaster_user_id: state.id
                },
                transport: {
                    method: "webhook",
                    callback: config.public_url + "/twitch/incoming",
                    secret
                }
            })
        }).then(e => e.json()).then(e => {
            console.dir(e);
            if(e.error != null) {
                return;
            }
            let sub: Subscription = e.data[0];
            data.secrets[sub.id] = secret;
            this.tempSecrets[sub.id] = secret;
            saveState(state);
        });
    }

    public processIncoming(req, res) {
        // -- UNVERIFIED --
        let id = req.get("Twitch-Eventsub-Message-Id");
        let type = req.get("Twitch-Eventsub-Message-Type");
        let sig = req.get("Twitch-Eventsub-Message-Signature");
        let ts = req.get("Twitch-Eventsub-Message-Timestamp");
        let subtype = req.get("Twitch-Eventsub-Subscription-Type");
        let bd = JSON.parse(req.body);
        console.dir(bd);
        let sub: Subscription = bd.subscription;
        let state = pullState(sub.condition.broadcaster_user_id);
        let data = this.getManagerData(state);
        let secret = data.secrets[sub['id']] ?? this.tempSecrets[sub['id']];
        if(secret == undefined) {
            console.log("COULD NOT GET SECRET");
            res.sendStatus(401);
            return;
        }
        let csig = 'sha256=' + crypto.createHmac('sha256', secret).update(id + ts + req.body).digest('hex');
        if(csig !== sig) {
            console.log("FAILED HMAC " + csig + " != " + sig);
            res.sendStatus(401);
        }

        // -- VERIFIED --

        switch(type) {
            case "webhook_callback_verification":
                res.send(bd.challenge);
                break;
            case "notification":
                res.sendStatus(204);
                break;
            case "revocation":
                console.log("REVOKED");
                res.sendStatus(204);
                break;
        }

    }

}