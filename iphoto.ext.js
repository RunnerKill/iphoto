(function($, undefined) {
IPhoto.import('util/exif.js');
IPhoto.import('util/megapix-image.js');
IPhoto.import('css/iphoto.css');
var 
    defaults = {
        server : null,      // 服务器地址（附件服务器地址），如 http://ip:port
        project : null,     // 所属项目
        multiple: true,     // 可多选
        color: '#ccc',      // 主题色
        onInit : function(cacheId) { // 连接初始化回调
            console.log(cacheId);
        },
        onLoad : function(files) { // 前端预览处理完毕回调
            console.log('images loaded.');
        },
        onError : function(msg) { // 错误提示回调
            console.error(msg);
        }
    }, constants = {
        max_limit : 20,              // 默认最大文件个数
        max_size : 50 * 1024 * 1000, // 默认最大单个文件大小(50MB)
        class_container : "iphoto",
        class_link : "link",
        class_tip : "tip",
        class_input : "input",
        class_view : "view",
        image_width : 1080,
        image_height : 0,
        image_quality: 0.8,       // 图片压缩质量
    };
$.fn.extend({
    iphoto_init : function(options) { // 初始化
        if($(this).length < 1) return false;
        options = $.extend({}, defaults, options);
        var _self = this;
        $(_self)
            .data('project', options.project)
            .addClass(constants.class_container)
            .append($('<div class="' + constants.class_link + '">+</div>').css({
                'color': options.color,
                'border-color': options.color
            }))
            .append('<div class="' + constants.class_tip + '">添加照片</div>')
            .append('<input class="' + constants.class_input + '" type="file" accept="image/*" ' + (options.multiple ? 'multiple="multiple"' : '') + ' capture="photo" />');
        IPhoto({
            server : options.server,
            error : options.onError,
            ready : function(iphoto) {
                options.onInit(iphoto.cache);
                $(_self).data('iphoto', iphoto);
                $(_self).find('.' + constants.class_link).click(function () {
                    $(this).siblings('input').click();
                }).end().find('.' + constants.class_input).change(function (e) {
                    var files = e.target.files || e.dataTransfer.files, // 从事件中获取选中的所有文件
                        msg = checkFiles(files),
                        $container = $(this).closest('.' + constants.class_container);
                    if(msg != null) {
                        options.onError(msg);
                        return false;
                    }
                    createPreview($container, files, options);
                    limitHide($container);
                });
            }
        });
    },
    iphoto_upload : function(options) {
        options = $.extend({}, {
            beforeUpload : function() {return true;},
            onProgress : function(index, done, total) {},
            onUpload : function(index, file) {},
            onComplete : function(files) {}
        }, options);
        $(this).each(function() {
            var _self = this,
            iphoto = $(_self).data('iphoto'),
            $views = $(_self).find('>.' + constants.class_view),
            files = [];
            $views.find('>img').each(function() {
                var dataUrl = $(this).attr('src'),
                    fileName = $(this).attr('title'),
                    file = dataURLtoBlob(dataUrl, fileName);
                files.push(file);
            }).end()
            .find('>i').hide().end()
            .find('>b').css("height", "100%");
            iphoto.upload({
                files : files,
                project : $(_self).data('project'),
                module : $(_self).attr("data-module"),
                beforeUpload : options.beforeUpload,
                onUpload : options.onUpload,
                onComplete : options.onComplete,
                onProgress : function(index, done, total) {
                    var percent = Math.round((total - done) * 100 / total);
                    $views.eq(index).find('>b').css("height", percent + "%");
                    options.onProgress(index, done, total);
                }
            });
        });
    }
});

// 检查已选文件
var checkFiles = function(files) {
    var size_err = '', type_err = '', str = '';
    for (var i = 0; i < files.length; i ++) { // 过滤不符合条件的文件
        var file = files[i];
        if(file.size > constants.max_size) {
            size_err += ',' + file.name;
        }
        if(file.type.indexOf('image') != 0) {
            type_err += ',' + file.name;
        }
    }
    if(size_err.length > 0) str += "文件(" + size_err.substring(1) + ")大小超过50MB\n";
    if(type_err.length > 0) str += "文件(" + type_err.substring(1) + ")类型非图片\n";
    return str.length < 1 ? null : str;
};

//创建预览块
var createPreview = function($container, files, options) {
    $container.find("." + constants.class_tip).hide(); // 隐藏提示文字
    var num = $container.find('>.' + constants.class_view).length,
        limit = getLimit($container),
        len = num + files.length > limit ? limit - num : files.length,
        imgNum = $container.find('>.' + constants.class_view + '>img').length;
    for (var i = 0; i < len; i++) { // 创建预览块
        var $preview = $('<div class="' + constants.class_view + '">处理中</div>').insertBefore($container.find('>.' + constants.class_link));
        loadImage($preview, files[i], function($box, dataUrl, fileName) {
            $box.html('')
                .append('<i></i>')
                .append('<img src="' + dataUrl + '" title="' + fileName + '" />')
                .append('<b></b>')
                .find('>i').click(function () { // 删除
                    $(this).parent().remove();
                    limitHide($container);
                });
            if($container.find('>.' + constants.class_view + '>img').length - imgNum == files.length) {
                $container.find('.' + constants.class_input).val('');
                options.onLoad(files);
            }
        });
    }
};

//处理图片（根据exif旋转并缩放）
var loadImage = function($preview, file, callback) {
    EXIF.getData(file, function () { // 获取exif信息回调
        var orientation = EXIF.getTag(this, 'Orientation');
        var canvas = document.createElement('canvas');
        var mpImg = new MegaPixImage(this);
        var mw = constants.image_width, mh = constants.image_height;
        if (orientation == 6 || orientation == 8) { // 进行了横纵坐标对换
            mh = constants.image_width;
            mw = constants.image_height;
        }
        mpImg.render(canvas, {
            maxWidth: mw,
            maxHeight: mh,
            orientation: orientation
        }, function () {
            var dataUrl = canvas.toDataURL(file.type, constants.image_quality);
            callback($preview, dataUrl, file.name);
        });
    });
};

//此区域超过最大限制文件数，则隐藏添加按钮
var limitHide = function($container) {
    if($container.find(">." + constants.class_view).length >= getLimit($container)) {
        $container.find(">." + constants.class_link).hide();
    } else {
        $container.find(">." + constants.class_link).show();
    }
};

var getLimit = function($container) {
    var limit = $container.attr("data-limit");
    return typeof(limit) == "undefined" ? constants.max_limit : parseInt(limit);
}

var dataURLtoFile = function(dataurl, fileName) {
    var arr = dataurl.split(','),
        mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]),
        n = bstr.length,
        u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    var b = new Blob([u8arr], {
        type: mime
    });
    if (fileName.indexOf(".") == -1) {
        var suffix = mime.substring(mime.lastIndexOf("/") + 1).toLowerCase();
        fileName += "." + suffix;
    }
    b.lastModifiedDate = new Date();
    b.lastModified = new Date().getTime();
    b.name = fileName;
    return b;
};
var dataURLtoBlob = function(data, fileName) {
    var tmp = data.split(',');
    tmp[1] = tmp[1].replace(/\s/g, '');
    var mime = tmp[0].match(/:(.*?);/)[1];
    var binary = atob(tmp[1]);
    var array = [];
    for (var i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
    }
    var b = new newBlob(new Uint8Array(array), mime);
    b.lastModifiedDate = new Date();
    b.lastModified = new Date().getTime();
    b.name = fileName;
    return b;
};
var newBlob = function(data, datatype) {
    var out;
    try {
        out = new Blob([data], {
            type: datatype
        });
    } catch (e) {
        window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder
            || window.MozBlobBuilder || window.MSBlobBuilder;
        if (e.name == 'TypeError' && window.BlobBuilder) {
            var bb = new BlobBuilder();
            bb.append(data.buffer);
            out = bb.getBlob(datatype);
        } else if (e.name == "InvalidStateError") {
            out = new Blob([data], {
                type: datatype
            });
        } else {
        }
    }
    return out;
}
})(jQuery);