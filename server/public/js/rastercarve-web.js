function getData() {
    var e = document.getElementById('main');
    var formData = new FormData(e);
    return formData;
}

function hasFile() {
    return document.getElementById('image').files.length == 1;
}

function getFileName() {
    return document.getElementById('image').files[0].name;
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
    var form = document.getElementById('main');
    $('#fakesubmit').click();
    return form.checkValidity()
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

beforePan = function(oldPan, newPan){
    var stopHorizontal = false
    , stopVertical = false
    , gutterWidth = 100
    , gutterHeight = 100
    // Computed variables
    , sizes = this.getSizes()
    , leftLimit = -((sizes.viewBox.x + sizes.viewBox.width) * sizes.realZoom) + gutterWidth
    , rightLimit = sizes.width - gutterWidth - (sizes.viewBox.x * sizes.realZoom)
    , topLimit = -((sizes.viewBox.y + sizes.viewBox.height) * sizes.realZoom) + gutterHeight
    , bottomLimit = sizes.height - gutterHeight - (sizes.viewBox.y * sizes.realZoom)
    customPan = {}
    customPan.x = Math.max(leftLimit, Math.min(rightLimit, newPan.x))
    customPan.y = Math.max(topLimit, Math.min(bottomLimit, newPan.y))
    return customPan
}

function showPreview(xhr) {
    $('#preview').html(xhr.responseText);
    $('#preview').children().attr("id", "preview-image");
    $('#preview-image').css('height', '100%');
    $('#preview-image').css('width', '100%');

    svgPanZoom('#preview-image',
               {
                   zoomEnabled: true,
                   controlIconsEnabled: true,
                   fit: 1,
                   center: 1,
                   beforePan: beforePan,
                   zoomScaleSensitivity: 0.35,
                   maxZoom: 20,
                   haltEventListeners: ['touchstart', 'touchend', 'touchmove', 'touchleave', 'touchcancel'],
                   init: function(options) {
                       var instance = options.instance
                       , initialScale = 1
                       , pannedX = 0
                       , pannedY = 0
                       // Init Hammer
                       // Listen only for pointer and touch events
                       this.hammer = Hammer(options.svgElement, {
                           inputClass: Hammer.SUPPORT_POINTER_EVENTS ? Hammer.PointerEventInput : Hammer.TouchInput
                       })
                       // Enable pinch
                       this.hammer.get('pinch').set({enable: true})
                       // Handle double tap
                       this.hammer.on('doubletap', function(ev){
                           instance.zoomIn()
                       })
                       // Handle pan
                       this.hammer.on('panstart panmove', function(ev){
                           // On pan start reset panned variables
                           if (ev.type === 'panstart') {
                               pannedX = 0
                               pannedY = 0
                           }
                           // Pan only the difference
                           instance.panBy({x: ev.deltaX - pannedX, y: ev.deltaY - pannedY})
                           pannedX = ev.deltaX
                           pannedY = ev.deltaY
                       })
                       // Handle pinch
                       this.hammer.on('pinchstart pinchmove', function(ev){
                           // On pinch start remember initial zoom
                           if (ev.type === 'pinchstart') {
                               initialScale = instance.getZoom()
                               instance.zoomAtPoint(initialScale * ev.scale, {x: ev.center.x, y: ev.center.y})
                           }
                           instance.zoomAtPoint(initialScale * ev.scale, {x: ev.center.x, y: ev.center.y})
                       })
                       // Prevent moving the page on some devices when panning over SVG
                       options.svgElement.addEventListener('touchmove', function(e){ e.preventDefault(); });
                   },
                   // Destroy custom events handler
                   destroy: function(){
                       this.hammer.destroy()
                   }
               });
}

function downloadFile(data, filename) {
    var blob = new Blob([data]);
    var link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function preview(button, download) {
    console.log('preview');
    if(!verify())
        return false; // warn?

    var formData = getData();

    // disable button
    $(button).prop("disabled", true);
    var oldHtml = $(button).html();
    // add spinner to button
    $(button).html(
        `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>&nbsp;Loading...`
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
                if(download)
                    downloadFile(xhr.responseText, getFileName() + '.svg');
                else
                    showPreview(xhr);
                console.log("Precache hit!");
                $(button).prop("disabled", false);
                $(button).html(oldHtml);
            },
            error: () => {
                // not cached
                $.post({
                    url: '/api/preview',
                    data: getData(),
                    processData: false, // necessary here since it's a FormData object
                    contentType: false,
                    success: (data, status, xhr) => {
                        if(download)
                            downloadFile(xhr.responseText, getFileName() + '.svg');
                        else
                            showPreview(xhr);
                        console.log("Precache miss :(");
                    },
                    error: (err) => alert(err),
                    complete: () => {
                        $(button).prop("disabled", false);
                        $(button).html(oldHtml);
                    }
                });
            },
            complete: () => {
            }
        });
    }).catch((err) => {
        console.log(err);
    });
    return false;
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
        `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>&nbsp;Loading...`
    );

    hashImage().then((res) => {
        var hash = res.hashResult;

        var formData = precacheData(hash);

        $.post({
            url: '/api/gcode/precache',
            data: formData,
            success: (data, status, xhr) => {
                downloadFile(data, getFileName() + '.nc');
                console.log("Precache hit!");
                $(this).prop("disabled", false);
                $(this).html(oldHtml);
            },
            error: () => {
                $.post({
                    url: '/api/gcode',
                    data: getData(),
                    processData: false, // necessary here but not above
                    contentType: false,
                    success: (data, status, xhr) => {
                        downloadFile(data, getFileName() + '.nc');
                        console.log("Precache miss :(");
                    },
                    error: (err) => alert(err),
                    complete: () => {
                        $(this).prop("disabled", false);
                        $(this).html(oldHtml);
                    }
                });
            }
        });
    });

    return false;
}

function init() {
    $('input[type="file"]').change(function(e){
        var fileName = e.target.files[0].name;
        $('.custom-file-label').text(fileName);
    });

    // prefilled by browser?
    if(hasFile())
        $('.custom-file-label').text(getFileName);

    Split(['#one', '#two'], {
        sizes: [50, 50],
        minSize: [300, 200],
        cursor: 'col-resize',
    });

    $("#pbutton").click(() => preview($('#pbutton'), false));
    $('#download-preview').click(() => preview($('#pbutton'), true));
    $("#gbutton").click(gcode);
}

$(document).ready(init);

(function() {
  'use strict';
  window.addEventListener('load', function() {
    // Fetch all the forms we want to apply custom Bootstrap validation styles to
    var forms = document.getElementsByClassName('needs-validation');
    // Loop over them and prevent submission
    var validation = Array.prototype.filter.call(forms, function(form) {
      form.addEventListener('submit', function(event) {
        if (form.checkValidity() === false) {
          event.preventDefault();
          event.stopPropagation();
        }
        form.classList.add('was-validated');
      }, false);
    });
  }, false);
})();
