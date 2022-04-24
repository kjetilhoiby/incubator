const { Client } = require('tplink-smarthome-api');
const client = new Client();
const express = require('express');
const app = express();
const cors = require('cors');
const http = require('http');
const { readFileSync } = require('fs');
const path = require('path');
const { request } =  require('undici');
const { Database } = require('./src/js/database');

const config = JSON.parse(
    readFileSync(
        path.resolve('secrets.json'),
        {encoding: 'utf-8'}
    )
);

const {
    getStatus, 
    logEvent,
    getDevice,
    deviceSettings
} = require('./src/js/utils');

const server = http.createServer(app);


app.use(cors());

const db = new Database('test.db')
const status = getStatus();

app.get('/status', (req, res) => {
    res.json({
        ...status,
        runTime: Math.round((
            Date.now() - new Date(status.startTime).getTime()
        ) / 1000)
    });
});

server.listen('3000');

// Client events `device-*` also have `bulb-*` and `plug-*` counterparts.
// Use those if you want only events for those types and not all devices.
client.on('device-new', (device) => {
    logEvent('device-new', device);
    device.startPolling(1000);

    // Device (Common) Events
    device.on('emeter-realtime-update', (emeterRealtime) => {
        // logEvent('emeter-realtime-update', device, emeterRealtime);
        updateEmeterStatus(device, emeterRealtime);
        notifyServer(device, emeterRealtime);

    });

    // Plug Events
    device.on('power-on', () => {
        logEvent('power-on', device);
    });
    device.on('power-off', () => {
        logEvent('power-off', device);
    });
    device.on('in-use', () => {
        logEvent('in-use', device);
    });
});

client.on('device-online', (device) => {

});
client.on('device-offline', (device) => {
    logEvent('device-offline', device);
});

console.log('Starting Device Discovery');
client.startDiscovery();


async function updateEmeterStatus(device, emeterRealtime) {

    


    const deviceStatus = getDevice(status, device, emeterRealtime);
    const unfinishedJobs = await db.unfinished(device.alias);

    if (unfinishedJobs.length) {
        // Det finnes uavsluttede jobber i databasen.
    }

    const { 
        activeJob, 
        history 
    } = deviceStatus;

    db.insertObservation({
        device: device.alias, 
        value: emeterRealtime.power_mw
    }, null)

    const currentDevice = deviceSettings[device.alias];
    const treshold = currentDevice.milliwattThreshold

    let oldStatus = status.devices[device.alias];
    
    let newStatus = {
        alias: device.alias,
        milliwatts: emeterRealtime.power_mw,
        session: {
            startTime: new Date(),
            min: 10000,
            max: 0,
            updates: 0,
            average: 0
        },
    }

    if ( // start session
        newStatus.milliwatts > treshold
        && (oldStatus.milliwatts < treshold || oldStatus.milliwatts == undefined)
    ) {
        console.log('start!', device.alias);

        message(device.alias + ' har startet')
        
        newStatus.session = {
            startTime: new Date(),
            min: 10000,
            max: 0,
            updates: 0,
            average: 0
        }

    } else if ( // end session
        newStatus.milliwatts < treshold
        && oldStatus.milliwatts > treshold
    ) {
        console.log('end!', device.alias);

        message(device.alias + ' er ferdig')

        oldStatus.session.endTime = new Date();
        oldStatus.session.duration = Math.round((oldStatus.session.endTime.getTime() - oldStatus.session.startTime.getTime()) / 1000);
        oldStatus.session.device = device.alias;

        if (oldStatus.session.duration > 300) {
            status.sessions.push(oldStatus.session);
            status.numberofSessions++;
        } else {

        }

    } else if ( // maintain
        newStatus.milliwatts > treshold
        && oldStatus.milliwatts > treshold
    ) {
        newStatus = oldStatus;
        newStatus.milliwatts = emeterRealtime.power_mw;
        newStatus.session.updates++;

        newStatus.buffer = newStatus.buffer.filter(reading => reading.timestamp > Date.now() - 600*1000)

        newStatus.buffer.push({
            timestamp: Date.now(),
            milliwatts: emeterRealtime.power_mw,
        })

        newStatus.session.average = Math.round(
            ((oldStatus.session.average * oldStatus.session.updates) + oldStatus.milliwatts)
            / (oldStatus.session.updates + 1)
        );

        if (newStatus.milliwatts > oldStatus.session.max) {
            newStatus.session.max = emeterRealtime.power_mw;
        }

        if (newStatus.milliwatts > oldStatus.session.max) {
            newStatus.session.min = emeterRealtime.power_mw;
        }


    } else {
        // no session 
        // console.log('no session!', device.alias);

    }

    status.devices[device.alias] = newStatus;
}

const notifyServer = async (device, emeterRealtime) => {

    request('https://node.hoi.by/incubator/register', {
        method: 'POST',
        headers: {'Content-type': 'application/json'},
        body: JSON.stringify({
            device: {
                alias: device.alias,
                host: device.host,
                port: device.port
            },
            emeterRealtime
        })
    })

}

const message = async (msg) => {

    const {
        slack
    } = config;

    const options = {
        method: 'POST',
        headers: {
            "Content-type": "application/json"
        },
        body: JSON.stringify({"text": msg})
    };

    const {
        statusCode,
        headers,
        body
      } = await request(slack, options)
      
      console.log('response received', statusCode)
      console.log('headers', headers)
      console.log('data', await body.text())
}
