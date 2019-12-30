function getData() {
    var e = document.getElementById('main');
    var formData = new FormData(e);
    return formData;
}

// from https://stackoverflow.com/questions/768268/how-to-calculate-md5-hash-of-a-file-using-javascript/768295#768295
function calculateMD5Hash(file, bufferSize) {
    var def = Q.defer();

    var fileReader = new FileReader();
    var fileSlicer = File.prototype.slice || File.prototype.mozSlice || File.prototype.webkitSlice;
    var hashAlgorithm = new SparkMD5();
    var totalParts = Math.ceil(file.size / bufferSize);
    var currentPart = 0;
    var startTime = new Date().getTime();

    fileReader.onload = function(e) {
        currentPart += 1;

        def.notify({
            currentPart: currentPart,
            totalParts: totalParts
        });

        var buffer = e.target.result;
        hashAlgorithm.appendBinary(buffer);

        if (currentPart < totalParts) {
            processNextPart();
            return;
        }

        def.resolve({
            hashResult: hashAlgorithm.end(),
            duration: new Date().getTime() - startTime
        });
    };

    fileReader.onerror = function(e) {
        def.reject(e);
    };

    function processNextPart() {
        var start = currentPart * bufferSize;
        var end = Math.min(start + bufferSize, file.size);
        fileReader.readAsBinaryString(fileSlicer.call(file, start, end));
    }

    processNextPart();
    return def.promise;
}

function hashImage() {
    var input = document.getElementById('image');
    if (!input.files.length) {
        return;
    }

    var file = input.files[0];
    var bufferSize = Math.pow(1024, 2) * 10; // 10MB

    return calculateMD5Hash(file, bufferSize); // promise
}

function verify() {
    return true;
}

function precacheData(hash) {
    // we must modify our request a bit
    var formData = $('#main').serializeArray().reduce(function(obj, item) {
        obj[item.name] = item.value;
        return obj;
    }, {});
    formData.hash = hash;
    console.log(formData);
    return formData;
}

function showPreview(xhr) {
    $('#preview').html(xhr.responseText);
}

function preview() {
    console.log('preview');
    if(!verify())
        return false; // warn?

    var formData = getData();
    // disable button
    $(this).prop("disabled", true);
    var oldHtml = $(this).html();
    // add spinner to button
    $(this).html(
        `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...`
    );

    // compute!
    hashImage().then((res) => {
        var hash = res.hashResult;

        console.log(hash);

        var formData = precacheData(hash);

        $.post({
            url: '/api/preview/precache',
            data: formData,
            success: (data, status, xhr) => {
                showPreview(xhr);
                console.log("Precache hit!");
                $(this).prop("disabled", false);
                $(this).html(oldHtml);
            },
            error: () => {
                // not cached
                $.post({
                    url: '/api/preview',
                    data: getData(),
                    processData: false,
                    contentType: false,
                    success: (data, status, xhr) => {
                        showPreview(xhr);
                        console.log("Precache miss :(");
                        $(this).prop("disabled", false);
                        $(this).html(oldHtml);
                    },
                    error: (err) => alert(err)
                });
            }
        });
    }).catch((err) => {
        console.log(err);
    });
    return false;
}

function downloadFile(data) {
    var blob = new Blob([data]);
    var link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = "out.nc";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function gcode() {
    console.log('gcode');
    if(!verify())
        return false; // warn?

    var formData = getData();
    // disable button
    $(this).prop("disabled", true);
    var oldHtml = $(this).html();
    // add spinner to button
    $(this).html(
        `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...`
    );

    hashImage().then((res) => {
        var hash = res.hashResult;

        var formData = precacheData(hash);

        $.post({
            url: '/api/gcode/precache',
            data: formData,
            success: (data, status, xhr) => {
                downloadFile(data);
                console.log("Precache hit!");
                $(this).prop("disabled", false);
                $(this).html(oldHtml);
            },
            error: () => {
                $.post({
                    url: '/api/gcode',
                    data: getData(),
                    processData: false,
                    contentType: false,
                    success: (data, status, xhr) => {
                        downloadFile(data);
                        console.log("Precache miss :(");
                        $(this).prop("disabled", false);
                        $(this).html(oldHtml);
                    },
                    error: (err) => alert(err)
                });
            }
        });
    });

    return false;
}

function init() {
    $('input[type="file"]').change(function(e){
        var fileName = e.target.files[0].name;
        $('.custom-file-label').html(fileName);
    });

    Split(['#one', '#two'], {
        sizes: [50, 50],
        minSize: [300, 100],
        cursor: 'col-resize',
    });

    $("#pbutton").click(preview);
    $("#gbutton").click(gcode);
}

$(document).ready(init);
