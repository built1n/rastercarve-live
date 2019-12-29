const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const http = require('http');
const morgan = require('morgan')
const os = require('os');
const { exec } = require('child_process');
const tmp = require('tmp');
const uniqueFilename = require('unique-filename');
const bodyParser = require('body-parser');
const compress = require('compression');
const crypto = require('crypto');

const app = express();
const page = fs.readFileSync('index.html');

app.use(fileUpload());
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(compress());

const port = 8080;

const OUTDIR="/app/output";

function hash_file(path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(path);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash));
  });
}

function send500(res) { res.status(500); res.send('internal server error'); }

function gcode(req, res) {
    try {
        var file = req.files.image;
        var tmpname = uniqueFilename(os.tmpdir());
        file.mv(tmpname);

        console.log("hashing");
        hash_file(tmpname).then((hashobj) =>
                                {
                                    // hash the given parameters
                                    console.log(req.body);

                                    var imghash = hashobj.digest('hex');
                                    var outname = imghash + '.nc';

                                    if(fs.existsSync(outname)) // cached
                                    {
                                        res.download(outname);
                                        return;
                                    }

                                    var cmd = 'rastercarve --width 4 -q ' + tmpname + ' > ' + outname;
                                    console
                                    exec(cmd, (err, stdout, stderr) =>
                                         {
                                             if(err)
                                                 throw err;
                                             res.download(outname);
                                         });
                                },
                             (err) => { send500(res); });

    } catch(err) {
        send500(res);
    }
}

function preview(req, res) {
    try {
        var file = req.files.image;
        var tmpname = uniqueFilename(os.tmpdir());
        file.mv(tmpname);

        hash_file(tmpname).then((imghash) =>
                                {
                                    var gcodename = imghash + '.nc';

                                    var outname = uniqueFilename(OUTDIR) + '.svg';

                                    var cmd = 'rastercarve --width 4 -q ' + tmpname + ' | tee ' + gcodename + ' | rastercarve-preview > ' + outname;
                                    console.time('generation');
                                    exec(cmd, (err, stdout, stderr) =>
                                         {
                                             console.timeEnd('generation');
                                             if(err)
                                                 throw err;
                                             fs.readFile(outname, (err, data) => {
                                                 if(err)
                                                 {
                                                     res.status(500);
                                                     res.send("Internal server error");
                                                     return;
                                                 }
                                                 res.header("Content-type", "image/svg+xml");
                                                 res.send(data);
                                             });
                                         });
                                },
                                (err) => { send500(res); });
    } catch(err) {
        res.status(500);
        res.send("Bad input");
    }
}

app.get('/', (req, res) => { res.header("Content-type", "text/html");  res.send(page) });

app.post('/gcode', gcode)
app.post('/preview', preview);

var httpServer = http.createServer(app);
httpServer.listen(port);
console.log("listening on " + port);
