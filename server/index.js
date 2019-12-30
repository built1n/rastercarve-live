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
const {check, validationResult} = require('express-validator');

const app = express();

const page = fs.readFileSync('public/index.html');

app.use(express.static('public'));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(compress());

const port = 8080;

const OUTDIR="/app/output/"; // keep trailing slash

// try not to take forever
const limits = {
    max_size: 1000,
    min_toolangle: 5,
    min_depth: .01,
    min_res: .0001
};

const checks = [
    check('dimension').isIn(['width', 'height']),
    check('size').isFloat({gt: 0, max: limits.max_size}),
    check('feed').isFloat({gt: 0}),
    check('plunge').isFloat({gt: 0}),
    check('safez').isFloat({gt: 0}),
    check('endz').isFloat({gt: 0}),
    check('toolangle').isFloat({gt: limits.min_toolangle, lt: 180}),
    check('depth').isFloat({gt: limits.min_depth}),
    check('lineangle').isFloat({min: 0, lt: 90}),
    check('stepover').isFloat({min: 100}),
    check('resolution').isFloat({min: limits.min_res})
];

// returns hash object
function hashfile(path) {
  return new Promise((resolve, reject) => {
      const sha256 = crypto.createHash('sha256');
      const stream = fs.createReadStream(path);
      stream.on('error', err => reject(err));
      stream.on('data', chunk => sha256.update(chunk));
      stream.on('end', () => resolve(sha256));
  });
}

function hashstring(str) {
    const sha256 = crypto.createHash('sha256');
    sha256.update(str);
    return sha256.digest('hex');
}

// hex hash of json body
function hashbody(body) {
    return hashstring(JSON.stringify(body));
}

// generate a hash string to uniquely identify a request (an image and
// associated parameters)
function hashall(imagefile, body) {
    hashfile(imagefile)
}

function send500(res) { res.status(500).send('internal server error'); }

function buildcmd(body, image) {
    var cmd = 'rastercarve -q ';
    if(body.dimension == 'width')
        cmd += '--width ';
    else
        cmd += '--height ';
    cmd += body.size;
    cmd += ' ' + image;
    cmd += ' -f ' + body.feed;
    cmd += ' -p ' + body.plunge;
    cmd += ' -z ' + body.safez;
    cmd += ' --end-z ' + body.endz;
    cmd += ' -d ' + body.depth;
    cmd += ' -t ' + body.toolangle;
    cmd += ' -a ' + body.lineangle;
    cmd += ' -s ' + body.stepover;
    cmd += ' -r ' + body.resolution;

    return cmd;
}

function gcode(req, res) {
    const errors = validationResult(req);
    if(!errors.isEmpty())
        return res.status(422).json(errors.array());

    console.log(req.body);

    try {
        if(!req.files || !req.files.image)
            res.status(400).send('no image');

        // first check cache (key uniquely identifies output g-code)
        var file = req.files.image;
        var outname = OUTDIR + hashstring(file.md5 + hashbody(req.body)) + '.nc';

        if(fs.existsSync(outname))
        {
            console.log("Cache hit!");
            return res.download(outname); // hit!
        }

        var tmpname = uniqueFilename(os.tmpdir());
        file.mv(tmpname);

        var cmd = buildcmd(req.body, tmpname) + ' > ' + outname;

        exec(cmd, (err, stdout, stderr) =>
             {
                 if(err)
                     throw err;
                 res.download(outname);
             });
    } catch(err) {
        //throw err;
        res.status(500).send(err);
    }
}

function buildpreviewcmd(body) {
    var cmd = 'rastercarve-preview ' + body.toolangle;
    console.log(cmd);
    return cmd;
}

function buildpreviewcmd_fullpipe(body, image, ncout, svgout) {
    return buildcmd(body, image, ncout) + ' | tee ' + ncout + ' | ' + buildpreviewcmd(body) + ' > ' + svgout;
}

function buildpreviewcmd_cached(body, ncname, outname) {
    return buildpreviewcmd(body) + ' < ' + ncname + ' > ' + outname;
}

function preview(req, res) {
    const errors = validationResult(req);
    if(!errors.isEmpty())
        return res.status(422).json(errors.array());

    console.log(req.body);

    try {
        if(!req.files || !req.files.image)
            res.status(400).send('no image');

        // first check cache (key uniquely identifies output g-code)
        var file = req.files.image;
        var basename = OUTDIR + hashstring(file.md5 + hashbody(req.body));
        var outname = basename + '.svg';

        if(fs.existsSync(outname))
        {
            console.log("Cache hit!");
            return res.sendFile(outname); // hit!
        }

        // see if g-code already exists
        var ncname = basename + '.nc';

        var cmd;
        if(fs.existsSync(ncname))
        {
            cmd = buildpreviewcmd_cached(req.body, ncname, outname);
        }
        else
        {
            var tmpname = uniqueFilename(os.tmpdir());
            file.mv(tmpname);

            cmd = buildpreviewcmd_fullpipe(req.body, tmpname, ncname, outname);
            console.log(cmd);
        }

        exec(cmd, (err, stdout, stderr) =>
             {
                 if(err) throw err;
                 res.sendFile(outname);
             });
    } catch(err) {
        res.status(500).header('Content-Type', 'text/plain').send(err);
        //throw err;
    }
}

app.post('/gcode', checks, gcode)
app.post('/preview', checks, preview);

var httpServer = http.createServer(app);
httpServer.listen(port);
console.log("listening on " + port);
