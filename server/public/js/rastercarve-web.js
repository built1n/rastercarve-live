function getData() {
    var e = document.getElementById('main');
    var formData = new FormData(e);
    return formData;
}

function preview() {
    console.log('preview');
    var formData = getData();
    $.post({
        url: '/api/preview',
        data: formData,
        processData: false,
        contentType: false,
        success: (data, status, xhr) => $('#preview').html(xhr.responseText),
        error: () => alert("err")
    });
    return false;
}

function gcode() {
    console.log('gcode');
    var formData = getData();
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
}

$(document).ready(init);
