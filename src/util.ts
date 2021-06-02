import {Request} from "express";
import fs from 'fs';
import fetch from "node-fetch";

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
    scopes: Array<string>,
    force_secure: boolean,
    twitch: TwitchConfig,
    rewards: {[key:string]: Reward}
}

export interface OAuthToken {
    access_token: string,
    expires_in: number,
    refresh_token: string,
    scope: Array<string>,
    token_type: string
}

export interface StoredTTVState {
    token: OAuthToken,
    username: string,
    bitRewards: Array<any>,
    id: number,
    eventSecret: string
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
        eventSecret: null
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
            fetch("https://id.twitch.tv/oauth2/revoke?client_id=" + encodeURIComponent(config.twitch.cid) + "&token=" + encodeURIComponent(state.token.access_token), {method: "POST"}).then(e => {
                console.log("Cleaned up excess token. " + e.status);
            });
            state.token = token; // Reset token
        } else {
            fs.writeFileSync('data/' + state.id + ".json", JSON.stringify(state));
        }
        loadedTTVStates.push(state);
        console.log("Completed load of " + state.id + " / " + state.username);
    });
}

export function requestAuth(state: StoredTTVState, uri: string, params: any = {}) {
    if(params.headers === undefined) {
        params.headers = {};
    }
    params.headers["Authorization"] = "Bearer " + state.token.access_token;
    params.headers["Client-Id"] = config.twitch.cid;
    return fetch(uri, params);
}