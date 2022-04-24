var sqlite3 = require('sqlite3').verbose();
const { 
    createJobDB, 
    createObservationDB 
} = require('./dbschema/strings');

class Database {
    
    constructor(fileName) {
        this.db = new sqlite3.Database(fileName);
        this.ensureTables();
    }

    async insertObservation  (observation, job)  {
        
        const now = Date.now();
        const jobId = job ? job.jobId : null;
        
        let elapsed = null;

        if (job && job.startTime) {
            elapsed = Math.round((now - new Date(job.startTime))/1000);
        }

        const sql = `
            INSERT INTO observation
            (jobid, deviceId, value, timestamp, elapsed)
            VALUES
            (?,?,?,?,?)
        `;

        const values = [
            jobId, 
            observation.device,
            observation.value,
            now,
            elapsed

        ]

        this.db.run(sql, values, function (err) {
            console.log(err,this)
        });

        const sql2 = "SELECT * FROM observation"

        this.db.all(sql2, (err, rows) => {
            // console.log(rows);
        });
    }


    unfinished (deviceId) {
        const sql2 = "SELECT * FROM job WHERE deviceId=?"
        return new Promise((resolve, reject) => {

            this.db.all(sql2, [deviceId], (err, rows) => {

                console.log(rows);

                resolve(rows);
            });

        });

    }

    ensureTables() {
        this.db.run(createJobDB);
        this.db.run(createObservationDB);
    }
}

module.exports = {Database};