/* 聲徑 Studio v2 / 讀譜：MusicXML parser, playback, image/PDF to local Audiveris bridge.
   This module deliberately does NOT claim to be an image recognition engine.
*/
'use strict';
(() => {
  const el = id => document.getElementById(id);
  let data = null, rawXML = '', sourceURL = '', sheetCtx = null, sheetStopTimer = null;
  const MAX_EVENTS = 16000;
  const pcs = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  function direct(node, tag) {return node ? Array.from(node.children).find(c => c.localName === tag) : null;}
  function val(node, tag, fallback='') {return (direct(node, tag)?.textContent || fallback).trim();}
  function has(node, tag) {return !!direct(node, tag);}
  const safe = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bounded = (n,min,max) => Math.max(min,Math.min(max,n));
  function status(message, kind='info') {
    el('scoreStatus').textContent=message;
    el('scoreStatus').dataset.kind=kind;
  }
  function readXML(xml, title='匯入樂譜') {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('為安全起見，不支援含 DTD / 外部實體的 XML。');
    const dom = new DOMParser().parseFromString(xml,'application/xml');
    if (dom.getElementsByTagName('parsererror').length) throw Error('MusicXML 內容無法解析。');
    if (dom.documentElement?.localName !== 'score-partwise') throw Error('目前支援 MusicXML score-partwise（不是 score-timewise）。');
    const names = {};
    for (const p of dom.getElementsByTagName('score-part')) names[p.getAttribute('id')] = val(p,'part-name','鋼琴');
    const events=[];
    let mainBeats=4, mainBeatType=4;
    let bpm=100, tempoSeen=false, longest=0, totalMeasures=0;
    for (const part of Array.from(dom.documentElement.children).filter(x => x.localName==='part')) {
      const partID=part.getAttribute('id')||'part';
      let div=1, measureStart=0, beatsPerBar=4, currentMeasure=0;
      let lastOnset=0;
      for (const measure of Array.from(part.children).filter(x => x.localName==='measure')) {
        let cursor=0,maxCursor=0;
        currentMeasure++;
        for (const item of Array.from(measure.children)) {
          const tag = item.localName;
          if (tag==='attributes') {
            const d=Number(val(item,'divisions'));
            if (Number.isFinite(d)&&d>0)div=d;
            const time=direct(item,'time');
            if (time) {
              const b=Number(val(time,'beats')),type=Number(val(time,'beat-type'));
              if (b>0&&b<=16&&type>0&&type<=16) {
                beatsPerBar=b*4/type;
                if (currentMeasure===1&&totalMeasures===0) {mainBeats=b;mainBeatType=type;}
              }
            }
          } else if (tag==='direction'&&!tempoSeen) {
            const sound=direct(item,'sound');
            const marking=sound?.getAttribute('tempo');
            const metronome=direct(direct(item,'direction-type'),'metronome');
            const found=Number(marking||val(metronome,'per-minute'));
            if (found>10&&found<300) {bpm=found;tempoSeen=true;}
          } else if (tag==='sound'&&!tempoSeen) {
            const found=Number(item.getAttribute('tempo'));
            if (found>10&&found<300) {bpm=found;tempoSeen=true;}
          } else if (tag==='backup') {
            cursor = Math.max(0, cursor-(Number(val(item,'duration'))||0)/div);
          } else if (tag==='forward') {
            cursor += (Number(val(item,'duration'))||0)/div;
            maxCursor=Math.max(maxCursor,cursor);
          } else if (tag==='note') {
            const rawDur=Number(val(item,'duration', '0'));
            const dur=rawDur>0?rawDur/div:0.25;
            const chord=has(item,'chord');
            const onset=chord?lastOnset:cursor;
            if (!chord)lastOnset=cursor;
            const pitch=direct(item,'pitch');
            const step=val(pitch,'step');
            const octave=Number(val(pitch,'octave'));
            const alter=Number(val(pitch,'alter','0'))||0;
            const staff=val(item,'staff','1');
            if (!has(item,'rest') && pcs[step]!==undefined && Number.isFinite(octave)) {
              const midi=bounded((octave+1)*12+pcs[step]+alter,0,127);
              if (events.length>=MAX_EVENTS) throw Error('樂譜音符過多，超過安全上限 16,000 個。');
              events.push({beat:measureStart+onset,duration:bounded(dur,.0625,64),midi,part:partID,staff,partLabel:names[partID]||'鋼琴',measure:currentMeasure,step,octave,alter});
              longest=Math.max(longest,measureStart+onset+dur);
            }
            if (!chord)cursor+=Math.max(0,dur);
            maxCursor=Math.max(maxCursor,cursor,onset+dur);
          }
        }
        measureStart+=Math.max(beatsPerBar,maxCursor);
      }
      totalMeasures=Math.max(totalMeasures,currentMeasure);
      longest=Math.max(longest,measureStart);
    }
    if (!events.length) throw Error('沒有找到可演奏的音符；請核對檔案是否包含鋼琴五線譜。');
    events.sort((a,b)=>a.beat-b.beat||a.midi-b.midi);
    return {title,events,bpm,totalBeats:longest,measures:totalMeasures,timeSig:`${mainBeats}/${mainBeatType}`,parts:[...new Set(events.map(e=>`${e.part}::${e.staff}`))],partNames:names};
  }
  function setData(xml,label,engine) {
    stopScore();
    const parsed=readXML(xml,label);
    data=parsed;rawXML=xml;
    el('scorePlayBtn').disabled=false;
    el('scoreStopBtn').disabled=false;
    el('scoreGridBtn').disabled=false;
    el('scoreExportXMLBtn').disabled=false;
    el('scorePreviewText').textContent=`${data.title} · ${data.measures} 小節 · ${data.events.length} 個音符 · ${data.timeSig} · ${data.bpm} BPM`;
    const grouped=[...new Set(data.events.map(e=>`${e.part}::${e.staff}`))];
    el('scorePart').innerHTML='<option value="">全部音軌（雙手）</option>' + grouped.map(k=>{
      const n=data.events.find(e=>`${e.part}::${e.staff}`===k);
      return `<option value="${safe(k)}">${safe(n.partLabel)}｜聲部 ${safe(n.staff)}</option>`;
    }).join('');
    drawSheet();
    status(`${engine} 已讀取。請先核對音符、節奏與原譜，再按「▶ 演奏樂譜」。`,'success');
  }
  function selectedEvents(){const filter=el('scorePart').value;return filter?data.events.filter(e=>`${e.part}::${e.staff}`===filter):data.events;}
  function midiY(note, mode){
    const octave=Math.floor(note/12)-1, pc=note%12;
    const semis=[0,2,4,5,7,9,11];
    let degree=semis.findIndex(s=>s>=pc);
    if (degree<0)degree=6;
    const diatonic=octave*7+degree;
    const base=mode==='bass'?2*7+4:4*7+2; // bass G2, treble E4 at bottom line
    return (mode==='bass'?183:101) - (diatonic-base)*6;
  }
  function drawSheet(){
    if (!data)return;
    const subset=selectedEvents(), previewBeats=Math.min(16,Math.max(4,data.totalBeats));
    const selected=subset.filter(n=>n.beat<previewBeats).slice(0,300);
    let out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 224" role="img" aria-label="已辨識樂譜前四小節的簡化五線譜"><rect width="1100" height="224" fill="#10152a" rx="9"/>`;
    for (const [staff,top] of [['treble',53],['bass',135]]) {
      for(let l=0;l<5;l++)out+=`<line x1="80" x2="1063" y1="${top+l*12}" y2="${top+l*12}" stroke="#8c96b3" stroke-width="1.2"/>`;
      out+=`<text x="21" y="${top+28}" fill="#cebcff" font-size="15" font-family="Arial">${staff==='treble'?'高音':'低音'}</text>`;
    }
    for(let beat=0;beat<=previewBeats;beat+=4){const x=80+beat/previewBeats*974;out+=`<line x1="${x}" y1="50" x2="${x}" y2="185" stroke="#52617c" stroke-width="1"/><text x="${x+5}" y="18" fill="#8c97b9" font-size="11">${beat/4+1}</text>`;}
    for(const n of selected){
      const bass=(Number(n.staff)>=2) || (n.midi<60);
      const x=83+(n.beat/previewBeats)*969;
      const y=bounded(midiY(n.midi,bass?'bass':'treble'),22,216);
      const color=bass?'#72d8c4':'#d0bbff';
      const lower=bass?183:101, upper=bass?135:53;
      for(let ly=lower+12;ly<=y;ly+=12)out+=`<line x1="${x-11}" x2="${x+11}" y1="${ly}" y2="${ly}" stroke="#697894"/>`;
      for(let ly=upper-12;ly>=y;ly-=12)out+=`<line x1="${x-11}" x2="${x+11}" y1="${ly}" y2="${ly}" stroke="#697894"/>`;
      out+=`<ellipse cx="${x}" cy="${y}" rx="6.3" ry="4.6" transform="rotate(-18 ${x} ${y})" fill="${color}"/><line x1="${x+5.8}" x2="${x+5.8}" y1="${y}" y2="${y-28}" stroke="${color}" stroke-width="1.7"/>`;
    }
    out+='</svg>';
    el('scoreNotation').innerHTML=out;
    el('scoreNotationCaption').textContent=`簡化五線譜：顯示前 ${Math.ceil(previewBeats/4)} 小節（${selected.length} 音符）。此圖僅供音高核對，節奏排版、連音線與升降記號請以原譜為準。`;
  }
  function stopScore(){
    if(sheetStopTimer)clearTimeout(sheetStopTimer);
    sheetStopTimer=null;
    if(sheetCtx){sheetCtx.close().catch(()=>{});sheetCtx=null;}
    el('scorePlayBtn').textContent='▶ 演奏樂譜';
  }
  async function playScore(){
    if (!data) return;
    stopScore();
    try{
      sheetCtx=new(window.AudioContext||window.webkitAudioContext)();
      await sheetCtx.resume();
      const ctx=sheetCtx,secondsPerBeat=60/data.bpm/Number(el('scoreSpeed').value),now=ctx.currentTime+.12;
      let end=0;
      for(const n of selectedEvents()){
        const t=now+n.beat*secondsPerBeat;
        const d=bounded(n.duration*secondsPerBeat*.92,.06,8);
        const freq=440*Math.pow(2,(n.midi-69)/12);
        const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,t);
        gain.gain.linearRampToValueAtTime(.08,t+.018);
        gain.gain.setTargetAtTime(.0001,t+Math.max(.04,d-.09),Math.min(.1,d/5));
        gain.connect(ctx.destination);
        const osc=ctx.createOscillator();osc.type='triangle';osc.frequency.value=freq;
        osc.connect(gain);osc.start(t);osc.stop(t+d+.12);
        end=Math.max(end,n.beat*secondsPerBeat+d);
      }
      el('scorePlayBtn').textContent='↻ 從頭重播';
      status(`正在演奏：${selectedEvents().length} 個音符，預計 ${Math.round(end)} 秒（按 ■ 停止可中斷）。`,'success');
      sheetStopTimer=setTimeout(()=>{stopScore();status('樂譜播放結束。','success');},Math.ceil((end+1)*1000));
    }catch(err){stopScore();status(`無法啟動播放：${err.message}`,'error');}
  }
  async function loadFile(file){
    if(!file)return;
    stopScore();
    if(file.size>20*1024*1024){status('單檔不得超過 20 MB。','error');return;}
    data=null;rawXML='';
    for(const id of ['scorePlayBtn','scoreStopBtn','scoreGridBtn','scoreExportXMLBtn'])el(id).disabled=true;
    el('scorePreviewText').textContent='';el('scoreNotation').innerHTML='';
    if(sourceURL){URL.revokeObjectURL(sourceURL);sourceURL='';}
    el('scoreSource').replaceChildren();
    const type=file.name.split('.').pop().toLowerCase();
    if(!['xml','musicxml'].includes(type)){status('Sites 靜態版目前僅支援 MusicXML；照片、PDF、MXL 需另外部署辨譜後端。','error');return;}
    if(['png','jpg','jpeg','bmp'].includes(type)){
      sourceURL=URL.createObjectURL(file);
      const img=document.createElement('img');img.src=sourceURL;img.alt='原始鋼琴譜';img.className='scan-source-image';el('scoreSource').append(img);
    } else if(type==='pdf'){
      sourceURL=URL.createObjectURL(file);
      const a=document.createElement('a');a.href=sourceURL;a.target='_blank';a.rel='noopener';a.textContent='📄 開啟原始 PDF 核對樂譜';a.className='score-link';el('scoreSource').append(a);
    }
    try{
      let xml, engine;
      if(['xml','musicxml'].includes(type)){
        xml=await file.text();engine='MusicXML';
      } else {
        status(type==='mxl'?'正在解壓 MXL…':'正在呼叫本機 OMR 辨識引擎（較多頁可能需要一些時間）…');
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),245000);
        let res;
        try{
          res=await fetch('/api/recognize',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name)},body:file,signal:controller.signal});
        }finally{clearTimeout(timeout);}
        let result;
        try{result=await res.json();}catch{throw Error('本機讀譜服務無法使用；請透過 run-windows.bat 或 run-linux.sh 啟動網頁。');}
        if(!res.ok)throw Error(result.error||'讀譜引擎處理失敗');
        xml=result.musicxml;engine=result.engine;
      }
      setData(xml,file.name,engine);
    }catch(e){status(`無法完成讀譜：${e.message}`,'error');console.warn('Score import:',e);}
  }
  function addToSequencer(){
    if(!data)return;
    if(!window.confirm('將辨識樂譜的「前四小節」量化為十六分音符，加入現有作品的鋼琴與貝斯音軌？原有音符不會清除。'))return;
    stop();
    if(song.beats!==4){status('目前編曲器只能接收 4/4 四小節樂譜，請先將編曲器拍號改成 4/4。','error');return;}
    let keys=song.tracks.find(t=>t.type==='keys'), bass=song.tracks.find(t=>t.type==='bass');
    if(!keys){keys=newTrack('keys',song.tracks.length);song.tracks.push(keys);}
    if(!bass){bass=newTrack('bass',song.tracks.length);song.tracks.push(bass);}
    let added=0;
    for(const n of selectedEvents()){
      const step=Math.round(n.beat*4);
      if(step<0||step>=64)continue;
      const track=(Number(n.staff)>=2||n.midi<60)?bass:keys;
      if(!track.notes.some(x=>x.step===step&&x.pitch===n.midi)){
        track.notes.push({step,pitch:n.midi});added++;
      }
    }
    selected=song.tracks.indexOf(keys);bar=0;render();saveSoon();
    status(`已匯入 ${added} 個音符到四小節編曲器。提醒：編曲器為固定長度音格，部分音域可能超出可見網格；建議先下載 MusicXML 作完整備份。`,'success');
  }
  function saveXML(){if(!rawXML)return;const name=(data.title||'score').replace(/[\\/:*?"<>|]/g,'_');download(new Blob([rawXML],{type:'application/vnd.recordare.musicxml+xml'}),name+'.musicxml');}
  const DEMO_XML=`<?xml version="1.0" encoding="utf-8"?>
<score-partwise version="4.0"><work><work-title>原創雙手鋼琴讀譜示範</work-title></work><movement-title>原創雙手鋼琴讀譜示範</movement-title><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type><sound tempo="100"/></direction>
<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
<backup><duration>16</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note><note><pitch><step>G</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note></measure>
<measure number="2"><note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note><backup><duration>16</duration></backup><note><pitch><step>A</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note><note><pitch><step>E</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note></measure></part></score-partwise>`;
  el('scoreFile').addEventListener('change',async e=>{await loadFile(e.target.files[0]);e.target.value='';});
  el('scoreDrop').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('over');});
  el('scoreDrop').addEventListener('dragleave',e=>e.currentTarget.classList.remove('over'));
  el('scoreDrop').addEventListener('drop',e=>{e.preventDefault();e.currentTarget.classList.remove('over');loadFile(e.dataTransfer.files[0]);});
  el('scorePickBtn').onclick=()=>el('scoreFile').click();
  el('scoreDemoBtn').onclick=()=>setData(DEMO_XML,'原創雙手鋼琴讀譜示範','內建示範');
  el('scorePlayBtn').onclick=playScore;
  el('scoreStopBtn').onclick=()=>{stopScore();status('已停止樂譜演奏。');};
  el('scoreGridBtn').onclick=addToSequencer;
  el('scoreExportXMLBtn').onclick=saveXML;
  el('scorePart').onchange=()=>{drawSheet();};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopScore();});
  if(location.protocol==='file:')status('MusicXML 可以直接開檔；照片或 PDF 辨識請先使用啟動腳本，不能從 file:// 直接呼叫本機辨識引擎。');
  else fetch('/api/omr-status').then(r=>r.json()).then(s=>{if(!s.ready)status('MusicXML 可直接讀取與演奏。照片／PDF 自動辨識需另裝 Audiveris；點「OMR 安裝說明」了解設定。');}).catch(()=>status('目前只開啟靜態網頁；照片與 PDF 需要 OMR 後端。'));
})();
