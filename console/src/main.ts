import * as nconf from 'nconf';
import * as path from 'path';
import * as fs from 'fs';




nconf.argv().env();
const configFilename = path.join(__dirname, '../config.json');
try {
    fs.accessSync(configFilename, fs.constants.R_OK);
    nconf.file(configFilename);
} catch (err) {
    console.log('Error on config file ' + configFilename + '\n' + err);
    process.exit(1);
}

let debugConfig: any = nconf.get('debug');
if (!debugConfig) {
    debugConfig = { debug: '*::*' };
}
for (const a in debugConfig) {
    if (debugConfig.hasOwnProperty(a)) {
        const name: string = (a === 'enabled') ? 'DEBUG' : 'DEBUG_' + a.toUpperCase();
        if (!process.env[name] && (debugConfig[a] !== undefined || debugConfig[a] !== undefined)) {
            process.env[name] = debugConfig[a] ? debugConfig[a] : debugConfig[a];
        }
    }
}

import * as debugsx from 'debug-sx';
const debug: debugsx.ISimpleLogger = debugsx.createSimpleLogger('console');

debugsx.addHandler(debugsx.createConsoleHandler('stdout'));
const logfileConfig = nconf.get('logfile');
if (logfileConfig) {
    for (const att in logfileConfig) {
        if (logfileConfig.hasOwnProperty(att)) {
           const h = debugsx.createFileHandler( logfileConfig[att])
           console.log('Logging ' + att + ' to ' + logfileConfig[att].filename);
           debugsx.addHandler(h);
        }
    }
}

debug.info('Start');

import { Console } from './console/console';

const configConsole = nconf.get('console');
if (configConsole) {
    const appConsole = new Console(configConsole.name, '0.0');
}

// import * as pipe from './pipes/pipe2';
// pipe.start();
