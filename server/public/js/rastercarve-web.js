function getData() {
    var e = document.getElementById('main');
    var formData = new FormData(e);
    return formData;
}

function preview() {
    console.log('preview');
    var formData = getData();
    // disable button
    $(this).prop("disabled", true);
    var oldHtml = $(this).html();
    // add spinner to button
    $(this).html(
        `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...`
    );
    $.post({
        url: '/api/preview',
        data: formData,
        processData: false,
        contentType: false,
        success: (data, status, xhr) => $('#preview').html(xhr.responseText),
        error: () => alert("err"),
        complete: () => {
            $(this).prop("disabled", false);
            $(this).html(oldHtml);
        }
    });

    return false;
}

function gcode() {
    console.log('gcode');
    var formData = getData();
    // disable button
    $(this).prop("disabled", true);
    var oldHtml = $(this).html();
    // add spinner to button
    $(this).html(
        `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Loading...`
    );
    $.post({
        url: '/api/gcode',
        data: formData,
        processData: false,
        contentType: false,
        success: (data, status, xhr) => {
            var blob = new Blob([data]);
            var link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = "out.nc";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        },
        error: () => alert("err"),
        complete: () => {
            $(this).prop("disabled", false);
            $(this).html(oldHtml);
        }
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
