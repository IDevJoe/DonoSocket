import {Request} from "express";
import {Response as ResponseFetch} from "node-fetch";
import fs from 'fs';
import fetch from "node-fetch";
import {getCoreManager} from "./managers/manager";

const config: Configuration = require('./config.json');
const states: {[key: string]: AuthState} = {};
let loadedTTVStates: Array<StoredTTVState> = [];

export interface AuthState {
    ip: string,
    created_at: number
}

export interface Reward {
    title: string,
    cost: bigint,
    prompt: string,
    is_enabled: boolean,
    background_color: string,
    is_user_input_required: boolean,
    is_max_per_stream_enabled: boolean,
    max_per_stream: bigint,
    is_max_per_user_per_stream_enabled: boolean,
    max_per_user_per_stream: bigint,
    is_global_cooldown_enabled: boolean,
    global_cooldown_seconds: bigint,
    should_redemptions_skip_request_queue: boolean
}

export interface TwitchConfig {
    cid: string,
    secret: string
}

export interface Configuration {
    authorized_channels: Array<string>,
    public_url: string,
    subscribe: Array<string>,
    ws_secret: string,
    scopes: Array<string>,
    force_secure: boolean,
    twitch: TwitchConfig,
    rewards: {[key:string]: Array<Reward>},
    enable_test: boolean
}

export interface OAuthToken {
    access_token: string,
    expires_in: number,
    refresh_token: string,
    scope: Array<string>,
    token_type: string,
    actual_expiry: number
}

export interface StoredTTVState {
    token: OAuthToken,
    username: string,
    bitRewards: Array<any>,
    id: number,
    eventSecret: string,
    managerData: any
}

export function genNewState(ip): string {
    let state: string = Math.random().toString(36).substring(7);
    states[state] = {
        ip,
        created_at: Date.now()
    }
    return state;
}

export function getExpState(state: string): AuthState {
    let obj: AuthState = states[state];
    delete states[state];
    return obj;
}

export function getRedirectUri(req: Request): string {
    let sec = config.force_secure !== undefined ? config.force_secure : req.secure;
    return (sec ? 'https://' : 'http://') + req.hostname + "/auth2";
}

export function restoreState(token: OAuthToken) {
    let state: StoredTTVState = {
        token,
        username: null,
        id: null,
        bitRewards: [],
        eventSecret: null,
        managerData: {}
    };
    if(!fs.existsSync('data')) fs.mkdirSync('data');
    requestAuth(state, "https://api.twitch.tv/helix/users").then(e => e.json()).then(e => {
        console.dir(e);
        let user = e.data[0];
        state.id = user.id;
        state.username = user.login;
        if(config.authorized_channels.indexOf(user.login) === -1) {
            console.log("Unauthorized user " + user.login + " attempted login.");
            return;
        }
        if(fs.existsSync('data/' + state.id + ".json")) {
            state = JSON.parse(fs.readFileSync('data/' + state.id + ".json").toString());
            if((Date.now()/1000) < state.token.actual_expiry && token.access_token !== state.token.access_token)
                fetch("https://id.twitch.tv/oauth2/revoke?client_id=" + encodeURIComponent(config.twitch.cid) + "&token=" + encodeURIComponent(state.token.access_token), {method: "POST"}).then(e => {
                    console.log("Cleaned up excess token. " + e.status);
                });
            state.token = token; // Reset token
        }
        loadedTTVStates.push(state);
        getCoreManager().forceSync(state);
        fs.writeFileSync('data/' + state.id + ".json", JSON.stringify(state));
        console.log("Completed load of " + state.id + " / " + state.username);
    });
}

export function saveState(state: StoredTTVState) {
    fs.writeFileSync('data/' + state.id + ".json", JSON.stringify(state));
    let ind = loadedTTVStates.indexOf(loadedTTVStates.find(e => e.id == state.id));
    loadedTTVStates.splice(ind, 1);
    loadedTTVStates.push(state);
}

export function pullState(uid: number): StoredTTVState {
    let loaded: StoredTTVState = loadedTTVStates.find(e => e.id === uid);
    if(loaded != null) return loaded;
    console.log("LOAD " + uid);
    if(!fs.existsSync('data/' + uid + '.json')) return null;
    loaded = JSON.parse(fs.readFileSync('data/' + uid + '.json').toString());
    loadedTTVStates.push(loaded);
    return loaded;
}

export function requestAuth(state: StoredTTVState, uri: string, params: any = {}) : Promise<ResponseFetch> {
    let now = Date.now()/1000;
    if(state.token.actual_expiry < now) {
        // Renew expired token
        console.log("Renewing expired token. " + state.token.actual_expiry + " < " + now);
        return new Promise((res, rej) => {
            fetch('https://id.twitch.tv/oauth2/token?grant_type=refresh_token&refresh_token=' + encodeURIComponent(state.token.refresh_token) + "&client_id=" + encodeURIComponent(config.twitch.cid) + "&client_secret=" + encodeURIComponent(config.twitch.secret), {method: 'POST'}).then(e => e.json()).then(e => {
                if(e.access_token == null) return rej('Expired or revoked token.');
                state.token.access_token = e.access_token;
                state.token.refresh_token = e.refresh_token;
                state.token.actual_expiry = now + state.token.expires_in;
                requestAuth(state, uri, params).then(res).catch(rej);
            }).catch(rej);
        });
    }
    if(params.headers === undefined) {
        params.headers = {};
    }
    params.headers["Authorization"] = "Bearer " + state.token.access_token;
    params.headers["Client-Id"] = config.twitch.cid;
    return fetch(uri, params);
}

let currentAppToken = null;

export function appRequest(uri: string, params: any = {}) : Promise<ResponseFetch> {
    return new Promise((res, rej) => {
        if(currentAppToken == null || currentAppToken.expires_at < Date.now()/1000)
            fetch("https://id.twitch.tv/oauth2/token?client_id=" + encodeURIComponent(config.twitch.cid) + "&client_secret=" + encodeURIComponent(config.twitch.secret)
             + "&grant_type=client_credentials", {method: "POST"}).then(e => e.json()).then(e => {
                 currentAppToken = e;
                 e.expires_at = Date.now()/1000 + e.expires_in;
                appRequest(uri, params).then(res).catch(rej);
            }).catch(rej);
        else {
            if(params.headers === undefined) {
                params.headers = {};
            }
            params.headers["Authorization"] = "Bearer " + currentAppToken.access_token;
            params.headers["Client-Id"] = config.twitch.cid;
            fetch(uri, params).then(res).catch(rej);
        }
    });
}