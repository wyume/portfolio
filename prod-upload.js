/* Product Image Upload with Compression */
(function(){
  var DB=null,queue=[];
  var r=indexedDB.open('ProdDB',1);
  r.onupgradeneeded=function(e){e.target.result.createObjectStore('imgs');};
  r.onsuccess=function(e){DB=e.target.result;queue.forEach(function(f){f();});queue=[];};

  function save(k,a,cb){
    function dosave(){var t=DB.transaction('imgs','readwrite');t.objectStore('imgs').put(a,k);if(cb)cb();}
    if(DB){dosave();}else{queue.push(dosave);}
  }
  function load(k,cb){
    function doload(){var t=DB.transaction('imgs','readonly');var r=t.objectStore('imgs').get(k);r.onsuccess=function(){cb(r.result||[]);};}
    if(DB){doload();}else{queue.push(doload);}
  }
  function compress(file,cb){
    var img=new Image();
    img.onload=function(){
      var c=document.createElement('canvas');
      var mx=2400,w=img.width,h=img.height;
      if(w>mx){h=h*mx/w;w=mx;}
      c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      c.toBlob(function(b){
        var fr=new FileReader();
        fr.onload=function(ev){cb(ev.target.result);};
        fr.readAsDataURL(b);
      },'image/jpeg',0.85);
    };
    img.src=URL.createObjectURL(file);
  }

  window._prodUpload=function(e,k){
    var f=e.target.files;if(!f.length)return;
    load(k,function(ex){var a=ex||[];var t=f.length;var dn=0;
    var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center';
    var rg=document.createElement('div');rg.style.cssText='width:72px;height:72px;border-radius:50%;background:conic-gradient(#10B981 0%,transparent 0%);display:flex;align-items:center;justify-content:center';
    var inn=document.createElement('div');inn.style.cssText='width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--text)';inn.textContent='0%';
    rg.appendChild(inn);ov.appendChild(rg);document.body.appendChild(ov);
    function upd(p){inn.textContent=p+'%';rg.style.background='conic-gradient(#10B981 '+p*3.6+'deg,transparent 0deg)';}
    function finish(){save(k,a,function(){
      if(window.DS&&window.DS.isOnline()){for(var ci=Math.max(0,a.length-t);ci<a.length;ci++){window.DS.uploadCompressedImage(a[ci],'prod',k,'img_'+ci+'.jpg').catch(function(){});}}
      setTimeout(function(){ov.innerHTML='<div style="position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(255,255,255,.55);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.4);border-radius:30px;padding:8px 18px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.6);font-size:12px;color:var(--text)"><span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#10B981;color:#fff;font-size:11px;flex-shrink:0">&#10003;</span><span>上传成功，共 <b>'+a.length+'</b> 张</span></div>';},100);setTimeout(function(){ov.remove();},2000);});}
    for(var i=0;i<f.length;i++){(function(idx){compress(f[idx],function(d){a.push(d);dn++;upd(Math.round(dn/t*100));if(window._prodRebuild)window._prodRebuild(k,a,false);if(dn>=t)finish();});})(i);}
  });};

  window._prodGetImgs=function(k,cb){load(k,cb);};
  window._prodDB=DB;
})();
