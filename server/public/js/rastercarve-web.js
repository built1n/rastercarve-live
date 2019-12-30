function getData() {
}

function preview() {
    console.log('preview');
}

function gcode() {
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

    $("form#main").submit(function(e) {
        e.preventDefault();
        var formData = new FormData(this);

        $.post({
            url: '/api/preview',
            data: formData,
            processData: false,
            contentType: false,
            success: (data, status, xhr) => $('#preview').html(xhr.responseText),
            error: () => alert("err")
        });

    });
}

$(document).ready(init);
