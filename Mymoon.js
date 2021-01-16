(function () { 'use strict';

// shortcuts for easier to read formulas

var PI   = Math.PI,
    sin  = Math.sin,
    cos  = Math.cos,
    tan  = Math.tan,
    asin = Math.asin,
    atan = Math.atan2,
    acos = Math.acos,
    rad  = PI / 180;

// sun calculations are based on http://aa.quae.nl/en/reken/zonpositie.html formulas


// date/time constants and conversions

var dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

function toJulian(date) { return date.valueOf() / dayMs - 0.5 + J1970; }
function fromJulian(j)  { return new Date((j + 0.5 - J1970) * dayMs); }
function toDays(date)   { return toJulian(date) - J2000; }


// general calculations for position

var e = rad * 23.4397; // obliquity of the Earth

function rightAscension(l, b) { return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l)); }
function declination(l, b)    { return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l)); }

function azimuth(H, phi, dec)  { return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi)); }
function altitude(H, phi, dec) { return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H)); }

function siderealTime(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }

function astroRefraction(h) {
    if (h < 0) // the following formula works for positive altitudes only.
        h = 0; // if h = -0.08901179 a div/0 would occur.

    // formula 16.4 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
    // 1.02 / tan(h + 10.26 / (h + 5.10)) h in degrees, result in arc minutes -> converted to rad:
    return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

// general sun calculations

function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }

function eclipticLongitude(M) {

    var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)), // equation of center
        P = rad * 102.9372; // perihelion of the Earth

    return M + C + P + PI;
}

function sunCoords(d) {

    var M = solarMeanAnomaly(d),
        L = eclipticLongitude(M);

    return {
        dec: declination(L, 0),
        ra: rightAscension(L, 0)
    };
}

var SunCalc = {};



// calculations for sun times

var J0 = 0.0009;

//function julianCycle(d, lw) { return Math.round(d - J0 - lw / (2 * PI)); }

function approxTransit(Ht, lw, n) { return J0 + (Ht + lw) / (2 * PI) + n; }
function solarTransitJ(ds, M, L)  { return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L); }

function hourAngle(h, phi, d) { return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d))); }
function observerAngle(height) { return -2.076 * Math.sqrt(height) / 60; }

// returns set time for the given sun altitude
function getSetJ(h, lw, phi, dec, n, M, L) {

    var w = hourAngle(h, phi, dec),
        a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
}


// moon calculations, based on http://aa.quae.nl/en/reken/hemelpositie.html formulas

function moonCoords(d) { // geocentric ecliptic coordinates of the moon

    var L = rad * (218.316 + 13.176396 * d), // ecliptic longitude
        M = rad * (134.963 + 13.064993 * d), // mean anomaly
        F = rad * (93.272 + 13.229350 * d),  // mean distance

        l  = L + rad * 6.289 * sin(M), // longitude
        b  = rad * 5.128 * sin(F),     // latitude
        dt = 385001 - 20905 * cos(M);  // distance to the moon in km

    return {
        ra: rightAscension(l, b),
        dec: declination(l, b),
        dist: dt
    };
}

SunCalc.getMoonPosition = function (date, lat, lng) {

    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),

        c = moonCoords(d),
        H = siderealTime(d, lw) - c.ra,
        h = altitude(H, phi, c.dec),
        // formula 14.1 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.
        pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H));

    h = h + astroRefraction(h); // altitude correction for refraction

    return {
        azimuth: azimuth(H, phi, c.dec),
        altitude: h,
        distance: c.dist,
        parallacticAngle: pa
    };
};


// calculations for illumination parameters of the moon,
// based on http://idlastro.gsfc.nasa.gov/ftp/pro/astro/mphase.pro formulas and
// Chapter 48 of "Astronomical Algorithms" 2nd edition by Jean Meeus (Willmann-Bell, Richmond) 1998.

SunCalc.getMoonIllumination = function (date) {

    var d = toDays(date || new Date()),
        s = sunCoords(d),
        m = moonCoords(d),

        sdist = 149598000, // distance from Earth to Sun in km

        phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra)),
        inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi)),
        angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) -
                cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));

    return {
        fraction: (1 + cos(inc)) / 2,
        phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
        angle: angle
    };
};


function hoursLater(date, h) {
    return new Date(date.valueOf() + h * dayMs / 24);
}

// calculations for moon rise/set times are based on http://www.stargazing.net/kepler/moonrise.html article

SunCalc.getMoonTimes = function (date, lat, lng, inUTC) {
    var t = new Date(date);
    if (inUTC) t.setUTCHours(0, 0, 0, 0);
    else t.setHours(0, 0, 0, 0);

    var hc = 0.133 * rad,
        h0 = SunCalc.getMoonPosition(t, lat, lng).altitude - hc,
        h1, h2, rise, set, a, b, xe, ye, d, roots, x1, x2, dx;

    // go in 2-hour chunks, each time seeing if a 3-point quadratic curve crosses zero (which means rise or set)
    for (var i = 1; i <= 24; i += 2) {
        h1 = SunCalc.getMoonPosition(hoursLater(t, i), lat, lng).altitude - hc;
        h2 = SunCalc.getMoonPosition(hoursLater(t, i + 1), lat, lng).altitude - hc;

        a = (h0 + h2) / 2 - h1;
        b = (h2 - h0) / 2;
        xe = -b / (2 * a);
        ye = (a * xe + b) * xe + h1;
        d = b * b - 4 * a * h1;
        roots = 0;

        if (d >= 0) {
            dx = Math.sqrt(d) / (Math.abs(a) * 2);
            x1 = xe - dx;
            x2 = xe + dx;
            if (Math.abs(x1) <= 1) roots++;
            if (Math.abs(x2) <= 1) roots++;
            if (x1 < -1) x1 = x2;
        }

        if (roots === 1) {
            if (h0 < 0) rise = i + x1;
            else set = i + x1;

        } else if (roots === 2) {
            rise = i + (ye < 0 ? x2 : x1);
            set = i + (ye < 0 ? x1 : x2);
        }

        if (rise && set) break;

        h0 = h2;
    }

    var result = {};

    if (rise) result.rise = hoursLater(t, rise);
    if (set) result.set = hoursLater(t, set);

    if (!rise && !set) result[ye > 0 ? 'alwaysUp' : 'alwaysDown'] = true;

    return result;
};


// export as Node module / AMD module / browser variable
if (typeof exports === 'object' && typeof module !== 'undefined') module.exports = SunCalc;
else if (typeof define === 'function' && define.amd) define(SunCalc);
else window.SunCalc = SunCalc;

}());
var chooseLocation, lat, lng, curLat, cutLng, geoPoint, propertyGeoPoint, curLocation = document.getElementById("address");
function lat_card(lat){
  var latitudeCardinal;
  var latitude = lat;
  if(lat >= 0){
    latitudeCardinal = "N";
  }else{
   latitudeCardinal = "S";
   latitude = -1*lat;
  }
 return latitude + "Ëš " + latitudeCardinal
}

function lng_card(lng){
  var longitudeCardinal;
  var longitude = lng;
  if(lng >= 0){
    longitudeCardinal = "E";
  }else{
    longitudeCardinal = "W";
    longitude = -1*lng;
  }
return longitude + "Ëš " + longitudeCardinal
}
function toDegreesMinutesAndSeconds(e) {
    var t = Math.abs(e),
        a = Math.floor(t),
        r = 60 * (t - a),
        o = Math.floor(r),
        i = Math.floor(60 * (r - o));
    return a + String.fromCharCode(176) + " " + o + "' " + i + "\""
}

function convertDMS(e, t) {
    var a = toDegreesMinutesAndSeconds(e),
        r = 0 <= e ? "N" : "S",
        o = toDegreesMinutesAndSeconds(t),
        i = 0 <= t ? "E" : "W";
    geoPoint = a + " " + r + "  " + o + " " + i, propertyGeoPoint = a + " " + r + ";" + o + " " + i, document.getElementById("curLat").value = e, document.getElementById("curLng").value = t, convasChange()
    $('#tagline').val(lat_card(e)+" / "+lng_card(t))
    trigger_change_event('tagline')
}
var feb,
leap,
age,
phases,
visible,
curYear,
curMonth,
curDay,
param,
productName,
swatch,
color,
productNameText,
message,
mainPhoto,
context,
curImageSlider,
months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
n = 31;
    if (0 < 1) {
        if (
         productName = document.getElementsByClassName("product-single__title")[0].textContent,
         swatch = document.getElementsByClassName("product-form")[0], 
         productNameText = productName.indexOf("TELESCOPE"), 
         message = document.getElementById("your-sentence-here"), 
         mainPhoto = document.getElementById("drawingCanvas"), 
         context = mainPhoto.getContext("2d"), 
         curImageSlider = document.getElementsByClassName("slider")[0],
         color = -1 == productNameText ? "#000" : "#fff", function() {
                var e = places({
                        appId: "plQZAAQZXXBP",
                        apiKey: "b3c61c63a87adb4cd3e35ca7f6e0042d",
                        container: document.querySelector("#address")
                    }),
                    t = document.getElementById("address");
                e.on("change", function(a) {
                    var e = a.suggestion.value;
                    lat = a.suggestion.latlng.lat,
                    lng = a.suggestion.latlng.lng,
                    t.textContent = e,
                    chooseLocation = e, 
                    convertDMS(lat, lng);
                    $("#skyMap").text(a.suggestion.name +", "+a.suggestion.country )
                    $('#currentAddress1').val(a.suggestion.name +", "+a.suggestion.country)
                }), e.on("clear", function() {
                    t.textContent = "none", 
                    chooseLocation = " ", 
                    geoPoint = " ", 
                    currentAddress.value = " ", 
                    convasChange()
                })
            }(), 
            
            localStorage.getItem("modify") && (param = localStorage.getItem("modify").split("/")), 
            curYear = document.getElementById("cmbYears"), 
            curMonth = document.getElementById("cmbMonths"), 
            curDay = document.getElementById("cmbDays"), 
            Start(), 
            param
            ) {
                       var e = param[2].split(" ");
            $("#cmbYears").val(e[2]);
            var t = +months.indexOf(e[1].substr(0, 1).toUpperCase() + e[1].substr(1));
            $("#cmbMonths").val(t + 1), 
            $("#cmbDays").val(parseFloat(e[0]));
            var a = e[3].split(":");
            $("#cmbHour").val(a[0]), 
            $("#cmbMin").val(Math.round(a[1])), 
            $("#cmbTime").val(e[4].toUpperCase()), 
            $("#cmbUTC").val(param[3]), 
            $("#address").val(param[4]), 
            chooseLocation = param[4], 
            $("#your-sentence-here").html(param[5]), 
            convertDMS(param[6], param[7]), 
            getAge(), 
            localStorage.removeItem("modify")

        } else {
            var r = new Date().getHours();
            mid = "AM", 12 < r && (r -= 12, mid = "PM");
            var o = new Date().getMinutes();
            document.getElementById("cmbHour").value = r, 
            document.getElementById("cmbMin").value = o, 
            document.getElementById("cmbTime").value = mid, $.ajax({
                url: "https://geoip-db.com/jsonp",
                jsonpCallback: "callback",
                dataType: "jsonp",
                success: function(e) {
                    var t = "",
                        a = "",
                        r = "";
                    e.country_name && (t = e.country_name), 
                    e.state && (a = e.state), 
                    e.city && (r = e.city), 
                    chooseLocation = t + " " + a + " " + r, 
                    curLocation.placeholder = chooseLocation, 
                    convertDMS(e.latitude, e.longitude)
                }
            })
        }

    }
     message.oninput = function() {
        function e(e, a, r, o, i) {
            message.onkeypress = function() {
                return !0
            };
            for (var s = a.split("\n"), l = s.length, d = 0; d < l; d++) t(s[d], r, o, i, d);
            e.textAlign = "center"
        }

        function t(e, t, a, o, s) {
            for (var l = e.split(" "), d = "", c = "", p = a + 40, u = 0; u < l.length; u++) {
                var m = d + l[u] + " ",
                    g = context.measureText(m).width;
                2 > s && (1 == s ? c = c + l[u] + " " : g > o && 1 != s ? (c = c + l[u] + " ", s = 1) : d = m)
            }
            1 == s && (message.onkeypress = function(e) {
                if (13 == e.keyCode) return !1
            }), 2 > s && (context.fillText(d, t, a, o), context.fillText(c, t, p, o), 1 < d.length && ($(".use-line").text("1"), r += "'line1: " + d + "';"), 1 < c.length && ($(".use-line").text("2"), r += "'line2: " + c + "';"), 1 >= d.length && 1 >= c.length && $(".use-line").text("0"))
        }
        var a = message.value,
            r = "";
        context.fillStyle = -1 == productNameText ? "black" : "white", context.fillStyle = color, context.fillRect(34, 950, 950, 200), context.font = "bold 38px Centurygothic", context.fillStyle = -1 == productNameText ? "white" : "black", context.textAlign = "center", e(context, a, 520, 1030, 760, 40), document.querySelector(".custom-textarea").value = a
        $('#currentMessage1').val(r)
    }, curImageSlider && (curImageSlider.onclick = function(e) {
        var t = e.target;
        "IMG" != t.tagName || (color = t.dataset.valueColor, optionValue = t.dataset.variantTitle, $(".single-option-selector:eq(0)").val(optionValue).trigger("change"), convasChange())
    }), $(".product-form input.color").on("change", function() {
        color = $("input.color:checked", ".product-form").data("value-color"), convasChange()
    })

function Start() {
    FillYear(), FillMonth(), getAge()
}

function FillYear() {
    for (var e, t = 1900; 2031 > t; t++) e = new Option(t, t), curYear.add(e, void 0);
    var a = new Date,
        r = a.getFullYear();
    curYear.value = r
}

function FillMonth() {
    for (var e, t = 0; t < months.length; t++) e = new Option(months[t], t + 1), curMonth.add(e, void 0);
    var a = new Date,
        r = a.getMonth();
    curMonth.value = r + 1, GetDays(curMonth)
}

function FillDay() {
    for (var e, t = 1; t < n + 1; t++) e = new Option(t, t), curDay.add(e, void 0);
    var a = new Date,
        r = a.getDate();
    // curDay.value = r
    getAge()
}

function TestLeap() {
    var e = parseInt(curYear.value);
    leap = !(0 != e % 4) && (0 != e % 100 || 0 == e % 400)
}

function GetDays(e) {
    var t = parseInt(e.value);
    2 === t ? (TestLeap(), feb = leap ? 29 : 28, n = feb) : 4 === t || 6 === t || 9 === t || 11 === t ? n = 30 : n = 31;
    curDay.options.length = 0, FillDay()
}

function FebruaryDays() {
    TestLeap(), feb = leap ? 29 : 28, 2 == curMonth.value && (n = feb, curDay.options.length = 0, FillDay()), getAge()
}

function moonage(e, t, a) {
    var o = e % 100;
    return o %= 19, 9 < o && (o -= 19), o = 11 * o % 30 + parseInt(t) + parseInt(a), 3 > t && (o += 2), o -= 2e3 > e ? 4 : 8.3, o = Math.floor(o + .5) % 30, 0 > o ? o + 30 : o
}

function getAge() {
    var e = parseInt(curDay.value),
        t = parseInt(curMonth.value),
        a = parseInt(curYear.value),
        r = moonage(a, t, e);
    1 == r ? ($("input[name='age']").val(r.toString() + " DAY"), age = r.toString() + " DAY") : (age = r.toString() + " DAYS", $("input[name='age']").val(r.toString() + " DAYS"));
    var o = ["NEW MOON", "WAXING CRESCENT", "WAXING CRESCENT", "WAXING CRESCENT", "WAXING CRESCENT", "WAXING CRESCENT", "WAXING CRESCENT", "WAXING CRESCENT", "FIRST QUARTER", "WAXING GIBBOUS", "WAXING GIBBOUS", "WAXING GIBBOUS", "WAXING GIBBOUS", "WAXING GIBBOUS", "WAXING GIBBOUS", "FULL MOON", "WANING GIBBOUS", "WANING GIBBOUS", "WANING GIBBOUS", "WANING GIBBOUS", "WANING GIBBOUS", "LAST QUARTER", "WANING CRESCENT", "WANING CRESCENT", "WANING CRESCENT", "WANING CRESCENT", "WANING CRESCENT", "WANING CRESCENT", "WANING CRESCENT", "NEW MOON"];
    $("input[name='phases']").val(o[r]), phases = o[r], convasChange()
}

function convasChange() {
    function e(e) {
        return e + (0 < e ? ["th", "st", "nd", "rd"][3 < e && 21 > e || 3 < e % 10 ? 0 : e % 10] : "")
    }

    function t(e, t, r, o, i) {
        message.onkeypress = function() {
            return !0
        };
        for (var s = t.split("\n"), l = s.length, d = 0; d < l; d++) a(s[d], r, o, i, d);
        e.textAlign = "center"
    }

    function a(e, t, a, r, o) {
        for (var s = e.split(" "), d = "", c = "", p = a + 40, u = 0; u < s.length; u++) {
            var m = d + s[u] + " ",
                g = context.measureText(m).width;
            2 > o && (1 == o ? c = c + s[u] + " " : g > r && 1 != o ? (c = c + s[u] + " ", o = 1) : d = m)
        }
        1 == o && (message.onkeypress = function(e) {
            if (13 == e.keyCode) return !1
        }), 2 > o && (context.fillText(d, t, a, r), context.fillText(c, t, p, r), 1 < d.length && ($(".use-line").text("1"), l += "'line1: " + d + "';"), 1 < c.length && ($(".use-line").text("2"), l += "'line2: " + c + "';"), 1 >= d.length && 1 >= c.length && $(".use-line").text("0"))
    }
    var r = curDay.value,
        o = curMonth.value,
        s = curYear.value,
        l = "";
    r = e(r);
    var d = months[o - 1],
        c = document.getElementById("cmbMin").value;
    10 > c && (c = "0" + c);
    var p,
     n =  d.toUpperCase() + " "+ r.toUpperCase() + " " + s.toUpperCase() + "-" + document.getElementById("cmbHour").value + ":" + c + " " + document.getElementById("cmbTime").value,
        u = "AGE OF THE MOON: " + age,
        m = "MOON PHASE: " + phases,
        g = document.getElementById("source");
    switch (parseInt(age)) {
        case 29:
            p = 0;
            break;
        default:
            p = parseInt(age);
    }
    document.getElementById("subtitle").value = n.split("-")[0]
    $('#Selectedtime').val(n.split("-")[1])
    $('#moonAge1').val(u.split(":")[1].trim())
    $('#currentMoonType1').val(m.split(":")[1].trim())
    trigger_change_event('subtitle')
    document.getElementById('custom_add').innerHTML = (m.split(":")[1].trim())
    var h = "https://cdn.shopify.com/s/files/1/0515/7221/1898/files/m_" + p + "_" + phases.split(" ").join("_").toLowerCase() + "_copy.png";
    $('#monn_img').attr('src',h)
    var v = message.value;
    var f = curTimes();
    if (f){ var w = 180 * f.parallacticAngle / Math.PI,
        C = Math.PI / 180;      
     }
      else var C = 0;
      $('#monn_img').css('transform','rotate('+(w * C * 180 )/Math.PI+'deg)'), 
      $('#rotationAngle1').val((w * C * 180 )/Math.PI)
    var S = +document.getElementById("cmbUTC").value;
    document.getElementById("currentTZ").value = S
}

// function curTimes() {
//     var e = document.getElementById("curLat").value,
//         t = document.getElementById("curLng").value,
//         a = document.getElementById("cmbYears").value,
//         r = document.getElementById("cmbMonths").value - 1,
//         o = +document.getElementById("cmbDays").value,
//         i = +document.getElementById("cmbHour").value,
//         s = +document.getElementById("cmbMin").value,
//         n = document.getElementById("cmbTime").value,
//         l = +document.getElementById("cmbUTC").value;
//     if (e) {
//         var p = new Date().getMinutes(),
//             u = new Date().getHours();
//         "PM" == n && 12 != i ? i += 12 : "AM" == n && 12 == i && (i = 0);
//         var g = +new Date().getTimezoneOffset() / 60,
//             h = i - l - g,
//             v = new Date(a, r, 0).getDate();
//         24 < h ? (h -= 24, o -= 1, 1 > o && (0 == r ? (r = 11, a -= 1) : r -= 1, o = new Date(a, r, 0).getDate())) : 0 > h && (h += 24, o += 1, o > v && (o = 1, 11 == r ? (r = 0, a += 1) : r += 1)), curDate = new Date(a, r, o, h, s), curDayMs = curDate.valueOf();
//         var y = SunCalc.getMoonPosition(curDayMs, e, t),
//             b = 180 * y.azimuth / Math.PI + 180,
//             c = 180 * y.altitude / Math.PI,
//             d = SunCalc.getMoonIllumination(curDayMs, e, t);
//         return y
//     }
// }


function curTimes() {
    var e = document.getElementById("curLat").value,
        t = document.getElementById("curLng").value,
        a = document.getElementById("cmbYears").value,
        r = document.getElementById("cmbMonths").value - 1,
        o = +document.getElementById("cmbDays").value,
        i = +document.getElementById("cmbHour").value,
        s = +document.getElementById("cmbMin").value,
        n = document.getElementById("cmbTime").value,
        l = +document.getElementById("cmbUTC").value;
        var newDate = new Date( a, r - 1, o);
        var timeStamp = Math.floor( newDate.getTime());
        setTimeout(()=>{
        $.ajax({
            url: `https://api.timezonedb.com/v2.1/get-time-zone?key=OAPK8QHQLKTM&format=json&by=position&lat=${e}&lng=${t}&time=${timeStamp}`,
            type: 'GET',
            dataType: 'json', // added data type
            success: function(res) {
                l = Math.floor(res.gmtOffset / 3600);
                $(`#cmbUTC option[value=${l}]`).prop('selected',true)
                trigger_change_event("cmbUTC")
            },
            error: function(err){
                console.log(err)
            }
        });
        },100)
                if (e) {
                    var p = new Date().getMinutes(),
                        u = new Date().getHours();
                    "PM" == n && 12 != i ? i += 12 : "AM" == n && 12 == i && (i = 0);
                    var g = +new Date().getTimezoneOffset() / 60,
                        h = i - l - g,
                        v = new Date(a, r, 0).getDate();
                    24 < h ? (h -= 24, o -= 1, 1 > o && (0 == r ? (r = 11, a -= 1) : r -= 1, o = new Date(a, r, 0).getDate())) : 0 > h && (h += 24, o += 1, o > v && (o = 1, 11 == r ? (r = 0, a += 1) : r += 1)), curDate = new Date(a, r, o, h, s), curDayMs = curDate.valueOf();
                    var y = SunCalc.getMoonPosition(curDayMs, e, t),
                        b = 180 * y.azimuth / Math.PI + 180,
                        c = 180 * y.altitude / Math.PI,
                        d = SunCalc.getMoonIllumination(curDayMs, e, t);
                    return y
                }
}


$("#drawingCanvas").bind("contextmenu", function() {
    return !1
});


var maxLength = 30;
$('#your-sentence-here').on('input focus keydown keyup', function() {
    var text = $(this).val();
    var lines = text.split(/(\r\n|\n|\r)/gm); 
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].length > maxLength) {
            lines[i] = lines[i].substring(0, maxLength);
        }
    }
    $(this).val(lines.join(''));
});

$(document).ready(()=>{
   setTimeout(()=>{
    var d = new Date()
    $(`#cmbDays option[value=${d.getDate()}]`).prop('selected',true)
    trigger_change_event("cmbDays")
},65)
})

