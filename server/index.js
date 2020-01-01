const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const http = require('http');
const morgan = require('morgan')
const os = require('os');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const compress = require('compression');
const crypto = require('crypto');
const {check, validationResult} = require('express-validator');
const findRemoveSync = require('find-remove');

const app = express();

const page = fs.readFileSync('public/index.html');

app.use(express.static('public'));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(compress());

const minute = 60 * 1000; // ms for setinterval
const purge_interval = 1 * minute;
const cache_lifetime = 15 * minute;

const port = 8080;

// temp directory to cache input and output (NC and SVG)
const OUTDIR="/app/output/";

// try not to take forever
const limits = {
    max_size: 100,
    min_toolangle: 5,
    min_depth: .01,
    min_res: .001
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

const precached_checks = [
    check('hash').isHash('md5'),
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

const query_checks = [
    check('hash').isHash('md5')
];

// return hex digest
function hashfile(path) {
  return new Promise((resolve, reject) => {
      const md5 = crypto.createHash('md5');
      const stream = fs.createReadStream(path);
      stream.on('error', err => reject(err));
      stream.on('data', chunk => md5.update(chunk));
      stream.on('end', () => resolve(md5.digest('hex')));
  });
}

function hashstring(str) {
    const md5 = crypto.createHash('md5');
    md5.update(str);
    return md5.digest('hex');
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

        var tmpname = OUTDIR + file.md5;
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

function gcode_precached(req, res) {
    console.log("G-code Precache request");
    console.log(req.body);

    const errors = validationResult(req);
    if(!errors.isEmpty())
    {
        console.log("failed...");
        return res.status(422).json(errors.array());
    }

    try {
        var filehash = req.body.hash;
        var imgname = OUTDIR + filehash;

        if(!fs.existsSync(imgname))
            return res.status(404).send("not in cache");

        hashfile(imgname).then((hash) => {
            if(hash != filehash) {
                console.log("Not in cache");
                console.log(fs.existsSync(imgname));
                console.log(hash == filehash);
                console.log(hash);
                return res.status(404).send("not in cache");
            }

            delete req.body.hash; // normalize req.body so it's the same as the uncached requests

            // check output cache
            var basename = OUTDIR + hashstring(filehash + hashbody(req.body));
            var outname = basename + '.nc';

            if(fs.existsSync(outname))
            {
                console.log("Cache hit!");
                return res.download(outname); // hit!
            }

            var cmd = buildcmd(req.body, imgname) + ' > ' + outname;

            exec(cmd, (err, stdout, stderr) =>
                 {
                     if(err)
                         throw err;
                     res.download(outname);
                 });
        });
    } catch(err) {
        res.status(500).header('Content-type', 'text/plain').send(err);
        throw err;
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
            return res.status(400).send('no image');

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
            var tmpname = OUTDIR + file.md5;
            file.mv(tmpname);
            console.log(tmpname);

            cmd = buildpreviewcmd_fullpipe(req.body, tmpname, ncname, outname);
            console.log(cmd);
        }

        exec(cmd, (err, stdout, stderr) =>
             {
                 if(err) throw err;
                 res.sendFile(outname);
             });
    } catch(err) {
        res.status(500).header('Content-type', 'text/plain').send(err);
        //throw err;
    }
}

function preview_precached(req, res) {
    console.log("Precache request");
    console.log(req.body);

    const errors = validationResult(req);
    if(!errors.isEmpty())
    {
        console.log("failed...");
        return res.status(422).json(errors.array());
    }

    try {
        var filehash = req.body.hash;
        var imgname = OUTDIR + filehash;

        if(!fs.existsSync(imgname))
            return res.status(404).send("not in cache");

        hashfile(imgname).then((hash) => {
            if(hash != filehash) {
                console.log("Not in cache");
                console.log(fs.existsSync(imgname));
                console.log(hash == filehash);
                console.log(hash);
                return res.status(404).send("not in cache");
            }

            delete req.body.hash; // normalize req.body so it's the same as the uncached requests

            // check output cache
            var basename = OUTDIR + hashstring(filehash + hashbody(req.body));
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
                cmd = buildpreviewcmd_fullpipe(req.body, imgname, ncname, outname);
                console.log(cmd);
            }

            exec(cmd, (err, stdout, stderr) =>
                 {
                     if(err) throw err;
                     res.sendFile(outname);
                 });
        });
    } catch(err) {
        res.status(500).header('Content-type', 'text/plain').send(err);
        throw err;
    }
}

function preupload(req, res) {
    try {
        if(!req.files || !req.files.image)
            return res.status(400).send('no image');
        var file = req.files.file;

        var cachename = OUTDIR + file.md5;

        if(!fs.existsSync(cachename))
            file.mv(cachename);

        res.json({success: true});
    } catch(err) {
        res.status(500).header('Content-type', 'text/plain').send(err);
    }
}

function query(req, res) {
    const errors = validationResult(req);
    if(!errors.isEmpty())
        return res.status(422).json(errors.array());

    try {
        var hash = req.body.hash;
        var path = OUTDIR + hash;
        var ret = { found: false };
        if(fs.existsSync(path) && hashfile(path) == hash) {
            ret.found = true;
        }
        res.json(ret);
    } catch(err) {
        res.status(500).header('Content-type', 'text/plain').send(err);
    }
}

function purge() {
    console.log("purging cache: " + OUTDIR);

    var removed = findRemoveSync(OUTDIR, {files:"*.*", age: {seconds: cache_lifetime / 1000}});
    console.log(removed);
}

app.post('/api/gcode', checks, gcode)
app.post('/api/preview', checks, preview);

app.post('/api/gcode/precache', precached_checks, gcode_precached)
app.post('/api/preview/precache', precached_checks, preview_precached);

app.post('/api/precache', preupload);
app.post('/api/query', query_checks, query);

var httpServer = http.createServer(app);
httpServer.listen(port);
console.log("listening on " + port);

setInterval(purge, purge_interval);
