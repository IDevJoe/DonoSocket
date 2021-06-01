import express, {Express} from 'express';
import bp from 'body-parser';
import {AuthState, Configuration, genNewState, getExpState, getRedirectUri} from "./util";
import fetch from 'node-fetch';

const config: Configuration = require('./config.json');
const app: Express = express();
app.use(bp.json());

app.get('/', (req, res) => {
    res.json({info: "DonoSocket Server"});
});

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

    res.send('die');
    fetch('https://id.twitch.tv/oauth2/token?client_id=' + encodeURIComponent(config.twitch.cid) +
        "&client_secret=" + encodeURIComponent(config.twitch.secret) +
        "&code=" + encodeURIComponent(req.query.code.toString()) +
        "&grant_type=authorization_code&redirect_uri=" + encodeURIComponent(getRedirectUri(req)), {method: 'POST'}).then(e => e.json()).then(e => {
            console.dir(e);
            console.log(`Completed authorization for ${req.query.code.toString()}`);

    }).catch(e => {
        console.dir(e);
    });
});

app.listen(80);