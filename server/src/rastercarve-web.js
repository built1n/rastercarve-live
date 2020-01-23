// Copyright (C) 2019-2020 Franklin Wei
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This software is distributed on an "AS IS" basis, WITHOUT WARRANTY OF ANY
// KIND, either express or implied.

import 'core-js/features/promise';

import $ from 'jquery';
import 'jquery-form';

import 'caman';
import svgPanZoom from 'svg-pan-zoom';
import 'bootstrap';
import Split from 'split.js';
import Q from 'q';
import SparkMD5 from 'spark-md5';

import 'bootstrap/dist/css/bootstrap.min.css';

import dl_icon from './download-icon.svg';
import img_icon from './image-icon.svg';

import './styles.css'; // last to override bootstrap

// choose a sample image by its hash
var filehash = null;

var samples = null; // loaded from samples.json, set by init()
var cursample = -1; // -1 for none
var split_inst = null;
const split_default = [ 75, 25 ];

const endpoints = {
    preview: '/api/preview',
    preview_precache: '/api/preview/precache',
    gcode: '/api/gcode',
    gcode_precache: '/api/gcode/precache',
    info: '/api/info/precache'
};

function getData() {
    var e = document.getElementById('main');
    var formData = new FormData(e);
    return formData;
}

function hasFile() {
    return document.getElementById('image').files.length == 1;
}

function getFilename()
{
    return $('.custom-file-label').text();
}

// set name of uploaded file
function setFilename(filename)
{
    $('.custom-file-label').text(filename);
    $('#image')[0].required = true; // may have been reset by useSample
    filehash = null; // reset

    if($('#main')[0].size.value.length == 0)
        $('#main')[0].size.value = "8"; // arbitrary
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
    if(filehash)
        return new Promise((resolve, reject) => resolve({ hashResult: filehash })); // preview image hash -- server has this file on hand

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
    return form.checkValidity();
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

function createStatsTable(data) {
    var ret = "";
    const fudge = 1.478; // empirical
    ret += (fudge * data.pathtime / 60).toFixed(1) + " minutes, " + data.nlines + " lines (" + data.line_width.toFixed(3) + "\" wide)";
    return ret;
}

function showPreview(xhr, formData) {
    console.log("showpreview")
    console.log(xhr);

    // uncollapse side pane
    console.log(split_inst.getSizes());
    if(split_inst.getSizes()[1] < 2.0) { // it's a float percentage
        split_inst.setSizes(split_default);
    }

    $('#preview').html(xhr.responseText);
    $('#preview').children().attr("id", "preview-image");

    // output stats in bottom pane
    $.post({
        url: endpoints.info,
        data: formData,
        success: (data, status, xhr) => {
            console.log("info retrieved successfully");
            console.log(data);
            console.log(xhr);

            $('#preview').append($('<div/>')
                                 .addClass('bottomleft')
                                 .addClass('translucent')
                                 .addClass('small')
                                 .addClass('p-1')
                                 .append(createStatsTable(data))
                                );
        }
    }).fail((err) => {
        console.log(err);
    });

    $('#preview-image').css('height', '100%');
    $('#preview-image').css('width', '100%');

    svgPanZoom('#preview-image',
               {
                   zoomEnabled: true,
                   controlIconsEnabled: true,
                   fit: 1,
                   center: 1,
                   beforePan: function(oldPan, newPan){
                       var stopHorizontal = false, stopVertical = false, gutterWidth = 100, gutterHeight = 100;
                       // Computed variables
                       var sizes = this.getSizes(),
                           leftLimit = -((sizes.viewBox.x + sizes.viewBox.width) * sizes.realZoom) + gutterWidth,
                           rightLimit = sizes.width - gutterWidth - (sizes.viewBox.x * sizes.realZoom),
                           topLimit = -((sizes.viewBox.y + sizes.viewBox.height) * sizes.realZoom) + gutterHeight,
                           bottomLimit = sizes.height - gutterHeight - (sizes.viewBox.y * sizes.realZoom);
                       var customPan = {};
                       customPan.x = Math.max(leftLimit, Math.min(rightLimit, newPan.x));
                       customPan.y = Math.max(topLimit, Math.min(bottomLimit, newPan.y));
                       return customPan
                   },
                   zoomScaleSensitivity: 0.35,
                   maxZoom: 20
               });
}

function downloadFile(data, filename) {
    var blob = new Blob([data]);

    // MS IE shim
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, filename);
        return;
    }

    var link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function warn(e, msg) {
    e.popover({
        content: msg,
        placement: "bottom",
        trigger: "focus"
    }).on('hidden.bs.popover', function (e) {
        $(this).off('hidden.bs.popover');
        $(this).popover('dispose');
    });
    e.popover('show');
}

function preview(button, download) {
    console.log('preview');
    if(!verify())
    {
        console.log("verify failed");
        warn(button, "Invalid parameters.");
        return false;
    }

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
            url: endpoints.preview_precache,
            data: formData,
            success: (data, status, xhr) => {
                if(download)
                    downloadFile(xhr.responseText, getFilename() + '.svg');
                else
                    showPreview(xhr, formData);
                console.log("Precache hit!");
                $(button).prop("disabled", false);
                $(button).html(oldHtml);
            },
            error: () => {
                // not cached
                $.post({
                    url: endpoints.preview,
                    data: getData(),
                    processData: false, // necessary here since it's a FormData object
                    contentType: false,
                    success: (data, status, xhr) => {
                        if(download)
                            downloadFile(xhr.responseText, getFilename() + '.svg');
                        else
                            showPreview(xhr, formData);
                        console.log("Precache miss :(");
                    },
                    error: (err) => warn(button, "Network error. Try refreshing the page."),
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
    {
        console.log("verify failed");
        warn($('#gbutton'), "Invalid parameters.");
        return false;
    }

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
            url: endpoints.gcode_precache,
            data: formData,
            success: (data, status, xhr) => {
                downloadFile(data, getFilename() + '.nc');
                console.log("Precache hit!");
                $(this).prop("disabled", false);
                $(this).html(oldHtml);
            },
            error: () => {
                $.post({
                    url: endpoints.gcode,
                    data: getData(),
                    processData: false, // necessary here but not above
                    contentType: false,
                    success: (data, status, xhr) => {
                        downloadFile(data, getFilename() + '.nc');
                        console.log("Precache miss :(");
                    },
                    error: (err) => warn($('#gbutton'), "Network error. Try refreshing the page."),
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

function basename(str)
{
    var base = new String(str).substring(str.lastIndexOf('/') + 1);
    return base;
}

function getSampleByIndex(idx) {
    var sample_links = $('#sample-gallery')[0].children;
    return $($(sample_links[cursample])[0].children[0]); // hack
}

var img_url = null;
var img_size = null;

// populate the output stats table
function displayDims() {
    var sizeInput = $('input[name="size"]')[0];
    console.log(sizeInput);

    if(!img_size || !sizeInput.validity.valid)
        return; // no can do

    var dim = $('select[name="dimension"]')[0].value; // "width" or "height"
    console.log(dim);
    console.log($('select'));
    var output_size = (dim == "width") ?
        {
            width: parseFloat(sizeInput.value),
            height: sizeInput.value * (img_size.height / img_size.width)
        } : {
            height: parseFloat(sizeInput.value),
            width: sizeInput.value * (img_size.width / img_size.height)
        };

    console.log(dim, dim == "width");
    console.log(output_size);

    var output_area = output_size.width * output_size.height;

    const inch_unit = " in";
    const inch_sq = " in<sup>2</sup>";

    $('#out-width').html(output_size.width.toFixed(2) + inch_unit);
    $('#out-height').html(output_size.height.toFixed(2) + inch_unit);
    $('#out-area').html(output_area.toFixed(2) + inch_sq);
    $('#image-info').collapse('show');
}

// get the dimensions of the selected image for future use
// url can be a blob or remote
function setSelectedImage(url) {
    img_url = url;
    var img = new Image();

    // show preview of uploaded image
    img.onload = function() {
        $('#image-preview').html(this);

        img_size = {
            width:  this.width,
            height: this.height
        };

        console.log($("#uploaded-image"));

        $('#image-preview').collapse('show');

        displayDims();
    }

    img.id = "uploaded-image";
    img.classList.add("img-fluid", "img-thumbnail");
    img.src = url;
}

function useFile(e) {
    var file = e.target.files[0];
    var filename = file.name;
    setFilename(filename);
    cursample = -1; // reset here, not in setFilename, since
    // useSample calls that.

    setSelectedImage(URL.createObjectURL(file));
}

function useSample(event) {
    console.log(event);
    var idx = $(event.currentTarget).data('index');
    console.log(idx);

    // unset blue border
    if(cursample >= 0)
        getSampleByIndex(cursample).removeClass('border-primary');

    cursample = idx;
    getSampleByIndex(idx).addClass('border-primary');

    setFilename(basename(samples[idx].thumbnail));
    filehash = samples[idx].hash;

    // show the image
    setSelectedImage(samples[idx].large);

    // disable verification on the file input for now (will revert
    // back whenever a new file is selected)
    $('#image')[0].required = false;
}

function loadSamples() {
    if(samples)
        return; // already loaded

    // populate sample gallery
    $.getJSON("/samples/index.json")
        .done((data) =>
              {
                  samples = data.samples;
                  console.log(samples);
                  var g = $('#sample-gallery');
                  g.empty();
                  for(var i = 0; i < samples.length; i++)
                      g.append($('<a/>',
                                 {
                                     href: "#",
                                     class: (i != samples.length - 1) ? "mr-2" : "",
                                 })
                               .html($('<img/>',
                                       {
                                           src: samples[i].thumbnail,
                                           class: "img-thumbnail"
                                       }))
                               .prop('title', basename(samples[i].thumbnail))
                               .click(useSample)
                               .data('index', i));
              })
        .fail((err) => console.log("JSON query/loading failed."));
}

function init() {
    $('input[type="file"]').change(useFile);
    $('input[name="size"]').change(displayDims);
    $('select[name="dimension"]').change(displayDims);

    // render icons
    $('#download-icon')[0].src = dl_icon;
    $('#img-icon')[0].src = img_icon;

    // prefilled by browser?
    if(hasFile())
        setFilename(getFilename());

    split_inst = Split(['#one', '#two'], {
        sizes: split_default,
        minSize: 0,
        snapOffset: 100,
        cursor: 'col-resize',
        gutterSize: 8,
    });

    $('#load-samples').click(loadSamples);
    $("#pbutton").click(() => preview($('#pbutton'), false));
    $('#download-preview').click(() => preview($('#pbutton'), true));
    $("#gbutton").click(gcode);
    $(document).on('shown.bs.collapse', function(event){
        if(event.target.id === "privacy-policy" || event.target.id == "disclaimer")
            event.target.scrollIntoView({ behavior: 'smooth' });
    });

    // initialize form validation
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

    // show everything
    $('body')[0].style.visibility = "visible";

    if(window.location.hash == "#samples")
        $('#load-samples').click(); // start with samples open
}

$(document).ready(init);
