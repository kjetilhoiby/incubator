const util = require('util');
const { Client } = require('tplink-smarthome-api');
const client = new Client();
const express = require('express');
const { createdb } = require('./src/js/dbschema/strings');
const app = express();
const http = require('http');
const server = http.createServer(app);


var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('test.db');

db.serialize(function () {
    db.run(createdb);

    var stmt = db.prepare("INSERT INTO val VALUES (?)");
    for (var i = 0; i < 10; i++) {
        stmt.run("Ipsum " + i);
    }
    stmt.finalize();

    db.each("SELECT rowid AS id, info FROM val", function (err, row) {
        console.log(row.id + ": " + row.info);
    });
});

db.close();

const status = {
    startTime: new Date(),
    runTime: 0,
    devices: {},
    sessions: [],
    activeSessions: [],
    numberofSessions: 0,
};

app.get('/status', (req, res) => {
    status.runTime = Math.round((new Date().getTime() - new Date(status.startTime).getTime()) / 1000);
    res.json(status);
});

server.listen('3000');

const logEvent = function logEvent(eventName, device, state) {
    const stateString = state != null ? util.inspect(state) : '';
    console.log(
        `${new Date().toISOString()} ${eventName} ${device.alias} ${device.host}:${device.port
        } ${stateString}`
    );
};

// Client events `device-*` also have `bulb-*` and `plug-*` counterparts.
// Use those if you want only events for those types and not all devices.
client.on('device-new', (device) => {
    logEvent('device-new', device);
    device.startPolling(1000);


    // Device (Common) Events
    device.on('emeter-realtime-update', (emeterRealtime) => {
        // logEvent('emeter-realtime-update', device, emeterRealtime);


        updateEmeterStatus(device, emeterRealtime);

    });

    // Plug Events
    device.on('power-on', () => {
        logEvent('power-on', device);
    });
    device.on('power-off', () => {
        logEvent('power-off', device);
    });
    /*  device.on('power-update', (powerOn) => {
          logEvent('power-update', device, powerOn);
      }); */
    device.on('in-use', () => {
        logEvent('in-use', device);
    });
    /*  device.on('not-in-use', () => {
          logEvent('not-in-use', device);
      });*/
    /*  device.on('in-use-update', (inUse) => {
          logEvent('in-use-update', device, inUse);
      }); */

    // Bulb Events
    device.on('lightstate-on', (lightstate) => {
        logEvent('lightstate-on', device, lightstate);
    });
    device.on('lightstate-off', (lightstate) => {
        logEvent('lightstate-off', device, lightstate);
    });
    device.on('lightstate-change', (lightstate) => {
        logEvent('lightstate-change', device, lightstate);
    });
    device.on('lightstate-update', (lightstate) => {
        logEvent('lightstate-update', device, lightstate);
    });
});

client.on('device-online', (device) => {

});
client.on('device-offline', (device) => {
    logEvent('device-offline', device);
});

console.log('Starting Device Discovery');
client.startDiscovery();



function updateEmeterStatus(device, emeterRealtime) {

    if (status.devices[device.alias]) {
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
            newStatus.milliwatts > deviceSettings[device.alias].milliwattThreshold
            && (oldStatus.milliwatts < deviceSettings[device.alias].milliwattThreshold || oldStatus.milliwatts == undefined)
        ) {
            console.log('start!', device.alias);
            newStatus.session = {
                startTime: new Date(),
                min: 10000,
                max: 0,
                updates: 0,
                average: 0
            }

        } else if ( // end session
            newStatus.milliwatts < deviceSettings[device.alias].milliwattThreshold
            && oldStatus.milliwatts > deviceSettings[device.alias].milliwattThreshold
        ) {
            console.log('end!', device.alias);
            oldStatus.session.endTime = new Date();
            oldStatus.session.duration = Math.round((oldStatus.session.endTime.getTime() - oldStatus.session.startTime.getTime()) / 1000);
            oldStatus.session.device = device.alias;

            if (oldStatus.session.duration > 300) {
                status.sessions.push(oldStatus.session);
                status.numberofSessions++;
            } else {

            }

        } else if ( // maintain
            newStatus.milliwatts > deviceSettings[device.alias].milliwattThreshold
            && oldStatus.milliwatts > deviceSettings[device.alias].milliwattThreshold
        ) {
            newStatus = oldStatus;
            newStatus.milliwatts = emeterRealtime.power_mw;
            newStatus.session.updates++;

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

        } else {// no session 
            console.log('no session!', device.alias);

        }
        status.devices[device.alias] = newStatus;

    } else {
        console.log('add device!');
        let newDevice = {
            alias: device.alias,
            milliwatts: emeterRealtime.power_mw,
            session: {
                min: 10000,
                max: 0,
                updates: 0,
                average: 0
            },
        }

        status.devices[device.alias] = newDevice;

    }
}

const deviceSettings = {
    'Tørketrommel': {
        milliwattThreshold: 4500
    }, 'Vaskemaskin': {
        milliwattThreshold: 4500
    }
}