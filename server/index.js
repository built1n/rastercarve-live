const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const http = require('http');
const morgan = require('morgan')
const os = require('os');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const compression = require('compression');
const crypto = require('crypto');
const {check, validationResult} = require('express-validator');
const findRemoveSync = require('find-remove');
const expressStaticGzip = require("express-static-gzip");

const app = express();

app.use(compression({threshold:0}));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(expressStaticGzip('dist', {
    enableBrotli: true,
    serverPrefrence: [ 'br' ]
}))

const minute = 60 * 1000; // ms for setinterval
const purge_interval = 1 * minute;
const cache_lifetime = 15 * minute;

const port = 8080;

const endpoints = {
    preview: '/api/preview',
    preview_precache: '/api/preview/precache',
    gcode: '/api/gcode',
    gcode_precache: '/api/gcode/precache',
    info: '/api/info/precache'
};

// temp directory to cache input and output (NC and SVG)
const OUTDIR="/app/output/";

// location of hashed sample files (stored separately to avoid deletion)
const SAMPLEDIR="/app/samples-hashed/";

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

function send500(res, err) { res.status(500).send(err); }

function buildcmd(body, image, jsonout) {
    console.log("jsonout - buildcmd: " + jsonout);

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

    cmd += ' --json ' + jsonout;

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
        var basename = OUTDIR + hashstring(file.md5 + hashbody(req.body));

        // we know the image is not in cache (the client already tried
        // /precache)
        var ncname =   basename + '.nc';

        if(fs.existsSync(ncname))
        {
            console.log("Cache hit!");
            return res.download(ncname); // hit!
        }

        var jsonname = basename + '.json';
        var imgname = OUTDIR + file.md5;
        file.mv(imgname);

        var cmd = buildcmd(req.body, imgname, jsonname) + ' > ' + ncname;

        exec(cmd, (err, stdout, stderr) =>
             {
                 if(err)
                     send500(res, err);
                 else
                     res.download(ncname);
             });
    } catch(err) {
        send500(res, err);
    }
}

function gcode_precache(req, res) {
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

        // check sample dir, too
        var samplename = SAMPLEDIR + filehash;
        if(fs.existsSync(samplename))
            imgname = samplename;

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
            var ncname = basename + '.nc';

            if(fs.existsSync(ncname))
            {
                console.log("Cache hit!");
                return res.download(ncname); // direct hit!
            }

            var jsonname = basename + '.json';

            // image exists in cache, but G-code does not -- just do
            // G-code
            var cmd = buildcmd(req.body, imgname, jsonname) + ' > ' + ncname;

            exec(cmd, (err, stdout, stderr) =>
                 {
                     if(err)
                         send500(res, err);
                     else
                         res.download(ncname);
                 });
        });
    } catch(err) {
        send500(res, err);
    }
}

function buildpreviewcmd(body) {
    var cmd = 'rastercarve-preview ' + body.toolangle;
    console.log(cmd);
    return cmd;
}

function buildpreviewcmd_fullpipe(body, image, ncout, svgout, jsonout) {
    console.log("fullpipe: " + jsonout);
    return buildcmd(body, image, jsonout) + ' | tee ' + ncout + ' | ' + buildpreviewcmd(body) + ' > ' + svgout;
}

function buildpreviewcmd_cached(body, ncname, svgname) {
    return buildpreviewcmd(body) + ' < ' + ncname + ' > ' + svgname;
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
        var svgname = basename + '.svg';

        if(fs.existsSync(svgname))
        {
            console.log("Cache hit!");
            return res.sendFile(svgname); // hit!
        }

        // see if g-code already exists
        var ncname = basename + '.nc';

        var cmd;
        if(fs.existsSync(ncname))
        {
            // G-code already exists -- just do preview
            cmd = buildpreviewcmd_cached(req.body, ncname, svgname);
        }
        else
        {
            // G-code doesn't exist -- we need to first toolpath and
            // then render with the full pipeline
            var imgname = OUTDIR + file.md5;
            file.mv(imgname);
            console.log(imgname);

            var jsonname = basename + '.json';

            console.log("jsonname: " + jsonname);

            cmd = buildpreviewcmd_fullpipe(req.body, imgname, ncname, svgname, jsonname);
            console.log(cmd);
        }

        exec(cmd, (err, stdout, stderr) =>
             {
                 if(err)
                     send500(res, err);
                 else
                     res.sendFile(svgname);
             });
    } catch(err) {
        send500(res, err);
    }
}

function preview_precache(req, res) {
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

        // check sample dir, too
        var samplename = SAMPLEDIR + filehash;
        if(fs.existsSync(samplename))
            imgname = samplename;

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
            var svgname = basename + '.svg';

            if(fs.existsSync(svgname))
            {
                console.log("Cache hit!");
                return res.sendFile(svgname); // hit!
            }

            // see if g-code already exists
            var ncname = basename + '.nc';

            var cmd;
            if(fs.existsSync(ncname))
            {
                cmd = buildpreviewcmd_cached(req.body, ncname, svgname);
            }
            else
            {
                var jsonname = basename + '.json';
                cmd = buildpreviewcmd_fullpipe(req.body, imgname, ncname, svgname, jsonname);
                console.log(cmd);
            }

            exec(cmd, (err, stdout, stderr) =>
                 {
                     if(err)
                         send500(res, err);
                     else
                         res.sendFile(svgname);
                 });
        });
    } catch(err) {
        send500(res, err);
    }
}

function preupload(req, res) {
    try {
        if(!req.files || !req.files.image)
            return res.status(400).send('no image');
        var file = req.files.file;

        var imgname = OUTDIR + file.md5;

        if(!fs.existsSync(imgname))
            file.mv(imgname);

        res.json({success: true});
    } catch(err) {
        send500(res, err);
    }
}


function info_precache(req, res) {
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

        delete req.body.hash; // normalize req.body so it's the same as the uncached requests

        var basename = OUTDIR + hashstring(filehash + hashbody(req.body));
        var jsonname = basename + '.json';

        console.log("JSON: " + jsonname);

        if(!fs.existsSync(jsonname))
            return res.status(404).send("not in cache");

        res.sendFile(jsonname);
    } catch(err) {
        send500(res, err);
    }
}

function purge() {
    console.log("purging cache: " + OUTDIR);

    var removed = findRemoveSync(OUTDIR, {files:"*.*", age: {seconds: cache_lifetime / 1000}});
    console.log(removed);
}

app.post(endpoints.gcode, checks, gcode)
app.post(endpoints.preview, checks, preview);

app.post(endpoints.gcode_precache, precached_checks, gcode_precache)
app.post(endpoints.preview_precache, precached_checks, preview_precache);

// info can only be used with precache
app.post(endpoints.info, precached_checks, info_precache);

app.post('/api/precache', preupload);

var httpServer = http.createServer(app);
httpServer.listen(port);
console.log("listening on " + port);

setInterval(purge, purge_interval);
