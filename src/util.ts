import {Request} from "express";

const config = require('./config.json');
const states: {[key: string]: AuthState} = {};

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