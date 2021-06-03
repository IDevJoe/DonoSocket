import express, {Express} from 'express';
import bp from 'body-parser';
import {
    AuthState,
    Configuration,
    genNewState,
    getExpState,
    getRedirectUri,
    OAuthToken,
    pullState,
    restoreState, StoredTTVState
} from "./util";
import fetch from 'node-fetch';
import fs from 'fs';
import RewardsManager from "./managers/rewardsManager";
import SubscriptionsManager from "./managers/subscriptionsManager";
import {getCoreManager} from "./managers/manager";

const config: Configuration = require('./config.json');
const app: Express = express();

new RewardsManager();
new SubscriptionsManager();

app.use(bp.text({type: "*/*"}));

app.get('/', (req, res) => {
    res.json({info: "DonoSocket Server"});
});

app.post('/force', (req, res) => {
    if(!config.enable_test) return res.json({error: "Not enabled"});
    let state: StoredTTVState = pullState(parseInt(req.query.id.toString()));
    res.json({success: true});
    restoreState(state.token);
})

app.get('/authorize', (req, res) => {
    let sec = config.force_secure !== undefined ? config.force_secure : req.secure;
    let state: string = genNewState(req.ip);
    console.log(`Started authorization for ${req.ip}. State ${state}`);
    res.redirect('https://id.twitch.tv/oauth2/authorize?client_id=' + encodeURIComponent(config.twitch.cid) + "&" +
        "response_type=code&scope=" + encodeURIComponent(config.scopes.join(' ')) +
        "&redirect_uri=" + encodeURIComponent(getRedirectUri(req)) +
        "&force_verify=true&state=" + encodeURIComponent(state));
});

app.get('/auth2', (req, res) => {
    // https://id.twitch.tv/oauth2/token
    let state: AuthState = getExpState(req.query.state.toString());
    if(state == null || state.ip != req.ip || state.created_at + 120000 < Date.now()) {
        res.json({info: "expired state"});
        return;
    }
    if(req.query.code === undefined) {
        res.json({error: "No code supplied."});
        return;
    }

    res.json({info: "Processing authorization"});
    fetch('https://id.twitch.tv/oauth2/token?client_id=' + encodeURIComponent(config.twitch.cid) +
        "&client_secret=" + encodeURIComponent(config.twitch.secret) +
        "&code=" + encodeURIComponent(req.query.code.toString()) +
        "&grant_type=authorization_code&redirect_uri=" + encodeURIComponent(getRedirectUri(req)), {method: 'POST'}).then(e => e.json()).then(e => {
            console.dir(e);
            if(e.access_token === undefined) {
                console.log(`Authorization failed for ${req.query.state}`);
                return;
            }
            console.log(`Completed authorization for ${req.query.state}. Downloading and restoring TTV state.`);
            let x: OAuthToken = e;
            x.actual_expiry = (Date.now()/1000) + x.expires_in;
            restoreState(x);
    }).catch(e => {
        console.dir(e);
    });
});

let subManager : SubscriptionsManager = <SubscriptionsManager> getCoreManager().getManager('SubscriptionsManager');
app.post('/twitch/incoming', (req, res) => subManager.processIncoming(req, res));

app.listen(80);