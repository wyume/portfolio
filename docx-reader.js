/* ============================================================
   docx-reader.js — minimal .docx text extractor
   Parses ZIP, decompresses word/document.xml, extracts text.
   No external dependencies. ~2KB.
   ============================================================ */
(function () {
  'use strict';

  function findSig(data, sig, start) {
    for (var i = start || 0; i < data.length - 4; i++) {
      if (data[i] === sig[0] && data[i+1] === sig[1] && data[i+2] === sig[2] && data[i+3] === sig[3]) return i;
    }
    return -1;
  }

  function readU32(data, off) {
    return data[off] | (data[off+1] << 8) | (data[off+2] << 16) | (data[off+3] << 24);
  }
  function readU16(data, off) {
    return data[off] | (data[off+1] << 8);
  }

  function utf8ToStr(data) {
    var s = '', i = 0;
    while (i < data.length) {
      var c = data[i++];
      if (c < 0x80) {
        s += String.fromCharCode(c);
      } else if (c < 0xE0) {
        s += String.fromCharCode(((c & 0x1F) << 6) | (data[i++] & 0x3F));
      } else if (c < 0xF0) {
        s += String.fromCharCode(((c & 0x0F) << 12) | ((data[i++] & 0x3F) << 6) | (data[i++] & 0x3F));
      } else {
        var cp = ((c & 0x07) << 18) | ((data[i++] & 0x3F) << 12) | ((data[i++] & 0x3F) << 6) | (data[i++] & 0x3F);
        if (cp > 0xFFFF) { cp -= 0x10000; s += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); }
        else s += String.fromCharCode(cp);
      }
    }
    return s;
  }

  function extractText(xmlStr) {
    var parts = [];
    var tOpen = '<w:t';
    var tClose = '</w:t>';
    var pClose = '</w:p>';
    var tStart = '<w:t>';
    var space = 'xml:space="preserve"';
    var pos = 0, inP = false;

    // simple streaming parser for w:p and w:t
    while (pos < xmlStr.length) {
      var pEnd = xmlStr.indexOf(pClose, pos);
      if (pEnd < 0) break;
      var seg = xmlStr.substring(pos, pEnd);
      pos = pEnd + pClose.length;
      var line = '';
      var tPos = 0;
      while (tPos < seg.length) {
        var tIdx = seg.indexOf(tOpen, tPos);
        if (tIdx < 0) break;
        var gtPos = seg.indexOf('>', tIdx);
        if (gtPos < 0) break;
        var isSpace = seg.indexOf(space, tIdx) >= 0 && seg.indexOf(space, tIdx) < gtPos;
        var tEnd = seg.indexOf(tClose, gtPos + 1);
        if (tEnd < 0) break;
        var text = seg.substring(gtPos + 1, tEnd);
        if (isSpace) { line += text; } else { line += text.trim(); }
        tPos = tEnd + tClose.length;
      }
      line = line.trim();
      if (line) parts.push('<p>' + escHtml(line) + '</p>');
    }
    return parts.join('\n');
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** _extractDocxText(arrayBuffer, callback)
   *  callback(htmlString) — HTML paragraphs of the document text */
  window._extractDocxText = function (arrayBuffer, callback) {
    try {
      var data = new Uint8Array(arrayBuffer);
      var eocd = findSig(data, [0x50, 0x4B, 0x05, 0x06], Math.max(0, data.length - 65557));
      if (eocd < 0) { callback(null); return; }
      var cdOff = readU32(data, eocd + 16);
      var cdSize = readU32(data, eocd + 12);
      var pos = cdOff, end = cdOff + cdSize, fileOff = 0, compSize = 0, compMeth = 0;
      var fnLen, extraLen, commentLen, fn;
      while (pos < end - 46) {
        if (data[pos] !== 0x50 || data[pos+1] !== 0x4B || data[pos+2] !== 0x01 || data[pos+3] !== 0x02) break;
        fnLen = readU16(data, pos + 28);
        extraLen = readU16(data, pos + 30);
        commentLen = readU16(data, pos + 32);
        fn = utf8ToStr(data.slice(pos + 46, pos + 46 + fnLen));
        if (fn === 'word/document.xml') {
          fileOff = readU32(data, pos + 42);
          compSize = readU32(data, pos + 20);
          compMeth = readU16(data, pos + 10);
          break;
        }
        pos += 46 + fnLen + extraLen + commentLen;
      }
      if (!fileOff || !compSize) { callback(null); return; }
      // skip local file header to get compressed data
      var lfFnLen = readU16(data, fileOff + 26);
      var lfExtraLen = readU16(data, fileOff + 28);
      var compStart = fileOff + 30 + lfFnLen + lfExtraLen;
      var compressed = data.slice(compStart, compStart + compSize);

      function decompressAndExtract() {
        var xml = utf8ToStr(compressed);
        var html = extractText(xml);
        callback(html || null);
      }

      if (compMeth === 0) {
        // stored (no compression)
        decompressAndExtract();
      } else if (compMeth === 8) {
        // deflate
        try {
          var ds = new DecompressionStream('deflate-raw');
          var writer = ds.writable.getWriter();
          var reader = ds.readable.getReader();
          writer.write(compressed);
          writer.close();
          var chunks = [];
          function pump() {
            reader.read().then(function (r) {
              if (r.done) {
                var total = 0, i;
                for (i = 0; i < chunks.length; i++) total += chunks[i].length;
                var out = new Uint8Array(total);
                var off = 0;
                for (i = 0; i < chunks.length; i++) { out.set(chunks[i], off); off += chunks[i].length; }
                var xml = utf8ToStr(out);
                var html = extractText(xml);
                callback(html || null);
              } else {
                chunks.push(new Uint8Array(r.value));
                pump();
              }
            }).catch(function () { callback(null); });
          }
          pump();
        } catch (e) { decompressAndExtract(); }
      } else {
        decompressAndExtract();
      }
    } catch (e) { callback(null); }
  };

})();
