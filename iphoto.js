/**
 * @title 移动端异步跨域文件交互工具
 * @version 3.0
 * @author Xiaojie.Xu
 */

(function(window, undefined) {
var 
    defaults = {
        limit: 0,           // 限制图片张数，为0则不限制
        error : function(msg) {     // 错误提示回调，msg - 错误信息
            console.error(msg);
        }
    },
    request_name = "/iphoto",        // 服务器端Controller名
    IPhoto = function(options) {
        return new IPhoto.prototype.init(options);
    },
    base = $('base'),
    root = base ? base.attr('href') : function(){
        var href = location.href;
        var pathname = location.pathname;
        var domain = href.substring(0, href.indexOf(pathname));
        var project = pathname.substring(0, pathname.substr(1).indexOf('/') + 1);
        return domain + project + "/";
    }(),
    $self_file = $('script').last();
IPhoto.prototype = {
    constructor : IPhoto,
    uploader : 0,
    init : function(options) {
        options = $.extend({}, defaults, options);
        if(!options.server) {
            options.error("服务器参数未设置");
            return this;
        }
        this.url_prefix = options.server + request_name;
        this.error = options.error;
        var _self = this;
        this.request('/init', {}, function(obj) {
            _self.cache = obj.key;
            _self.ftype = obj.ftype;
            options.ready(_self);
        });
        return this;
    },
    request : function(action, data, callback) {
        $.ajax({
            url : this.url_prefix + action,
            data : $.extend({}, {
                key : this.cache
            }, data),
            dataType : 'jsonp',
            jsonp : 'callback', // 回调函数名对应的参数名
            jsonpCallback : 'callback' + new Date().getTime(), // 回调函数名
            success : callback,
            error : function(xhr, ajaxOptions, thrownError) {
                console.error("Http status: " + xhr.status + " " + xhr.statusText + "\n" +
                        "server response : " + xhr.responseText);
            }
        });
    },
    get : function(id, cb) {
        this.request("/get", {
            id : id
        }, cb);
    },
    remove : function(id, cb) {
        this.request("/delete", {
            id : id
        }, cb);
    },
    upload : function(options) {
        options = $.extend({}, {
            files : [],
            project : null,
            module : null,
            beforeUpload : function() {return true;},
            onProgress : function(index, done, total) {},
            onUpload : function(index, file) {},
            onComplete : function(files) {}
        }, options);
        if(!options.beforeUpload()) return false;
        for(var i = 0; i < options.files.length; i ++) {
        var index = i,
            uploader = this.uploader ++,
            file = options.files[index],
            file_list = [],
            form_data = needsFormDataShim ? new FormDataShim() : new FormData();
            form_data.append('project', options.project);
            form_data.append('module', options.module);
            form_data.append('key', this.cache);
            form_data.append('file', file, file.name);
            $.ajax({
                type : "post",
                url : this.url_prefix + '/upload?' + this.cache + '-' + uploader,
                data : form_data,
                dataType: 'json',
                contentType: false, //必须
                processData: false,
                success : function(files) {
                    options.onUpload(index, files[0]);
                    file_list.push(files[0]);
                    if(file_list.length >= options.files.length) {
                        options.onComplete(file_list);
                    }
                },
                error : this.error
            });
            if(options.onProgress) this.progress(uploader, index, options.onProgress);
        }
    },
    progress : function(uploader, index, cb) {
        var _self = this;
        this.request("/progress", {
            index : uploader
        }, function(progress) {
            if(progress.bytesRead < progress.contentLength) {
                _self.progress(uploader, index, cb);
            }
            cb(index, progress.bytesRead, progress.contentLength);
        });
    }
};
IPhoto.prototype.init.prototype = IPhoto.prototype;
$.extend(IPhoto, {
    import : function(path) {
        var dir = $self_file.attr('src'),
            dir = dir.substr(0, dir.lastIndexOf('/') + 1);
        path = root + dir + path;
        if (path.match(/.*\.js$/)) {
            document.write('<script src="' + path + '"></script>');
        } else if(path.match(/.*\.css$/)) {
            document.write('<link rel="stylesheet" href="' + path + '" />');
        }
    }
});
// 判断是否需要blobbuilder
var needsFormDataShim = (function () {
    var bCheck = ~navigator.userAgent.indexOf('Android')
        && ~navigator.vendor.indexOf('Google')
        && !~navigator.userAgent.indexOf('Chrome');
    return bCheck
        && navigator.userAgent.match(/AppleWebKit\/(\d+)/).pop() <= 534;
})(), blobConstruct = !!(function () {
    try {
        return new Blob();
    } catch (e) {
    }
})(), XBlob = blobConstruct ? window.Blob
    : function (parts, opts) {
    var bb = new (window.BlobBuilder || window.WebKitBlobBuilder || window.MSBlobBuilder);
    parts.forEach(function (p) {
        bb.append(p);
    });
    return bb.getBlob(opts ? opts.type : undefined);
};
function FormDataShim() {
    // Store a reference to this
    var o = this, parts = [], // Data to be sent
        boundary = Array(5).join('-')
            + (+new Date() * (1e16 * Math.random())).toString(32), oldSend = XMLHttpRequest.prototype.send;
    this.append = function (name, value, filename) {
        parts.push('--' + boundary
                + '\r\nContent-Disposition: form-data; name="'
                + name + '"');
        if (value instanceof Blob) {
            parts.push('; filename="' + (filename || 'blob')
                + '"\r\nContent-Type: ' + value.type + '\r\n\r\n');
            parts.push(value);
        } else {
            parts.push('\r\n\r\n' + value);
        }
        parts.push('\r\n');
    };
    // Override XHR send()
    XMLHttpRequest.prototype.send = function (val) {
        var fr, data, oXHR = this;
        if (val === o) {
            // 注意不能漏最后的\r\n ,否则有可能服务器解析不到参数.
            parts.push('--' + boundary + '--\r\n');
            data = new XBlob(parts);
            fr = new FileReader();
            fr.onload = function () {
                oldSend.call(oXHR, fr.result);
            };
            fr.onerror = function (err) {
                throw err;
            };
            fr.readAsArrayBuffer(data);
            this.setRequestHeader('Content-Type',
                'multipart/form-data; boundary=' + boundary);
            XMLHttpRequest.prototype.send = oldSend;
        } else {
            oldSend.call(this, val);
        }
    };
};
if(typeof window === "object" && typeof window.document === "object") {
    window.IPhoto = IPhoto;
}
})(window);