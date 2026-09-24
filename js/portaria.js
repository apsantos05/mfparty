(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d',{willReadFrequently:true});
  let stream=null, timer=null, busy=false, current=null, scanned=false, cameraStarting=false;
  async function api(path,body){
    const r=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','X-MFPARTY':'portaria'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const result=await r.json();return {ok:r.ok,status:r.status,...result};
  }
  function stopCamera(){clearTimeout(timer);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('video').hidden=true;$('stopCamera').hidden=true;$('startCamera').hidden=false;$('cameraHint').hidden=false;}
  function showLogin(message='') {stopCamera();$('loginPanel').hidden=false;$('scannerPanel').hidden=true;$('logout').hidden=true;$('loginMessage').textContent=message;current=null;}
  function showScanner(station){$('loginPanel').hidden=true;$('scannerPanel').hidden=false;$('logout').hidden=false;$('stationName').textContent=station;$('password').value='';}
  function clearResult(){current=null;scanned=false;$('result').hidden=true;$('admitButton').hidden=true;$('ticketCode').value='';$('scanMessage').textContent='';}
  function detail(label,value){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('ticketDetails').append(row);}
  function render(result){
    const state=result.state||'invalid';$('result').dataset.state=state;$('result').hidden=false;$('admitButton').hidden=state!=='valid';
    const titles={valid:'Ingresso válido',admitted:'Entrada confirmada',used:'Ingresso já utilizado',expired:'Ingresso vencido',revoked:'Ingresso cancelado',invalid:'Entrada não autorizada'};
    $('resultLabel').textContent=state==='admitted'?'PODE LIBERAR A ENTRADA':state==='valid'?'CONFIRA ANTES DE CONFIRMAR':'NÃO LIBERE A ENTRADA';
    $('resultTitle').textContent=titles[state]||titles.invalid;
    $('resultMessage').textContent=result.error||(state==='valid'?'Confira o documento e a categoria. Consultar o código ainda não registra a entrada.':'Este ingresso foi registrado e não poderá ser usado novamente.');
    $('ticketDetails').replaceChildren();if(result.ticket){detail('Comprador',result.ticket.buyer);detail('Categoria',result.ticket.category);detail('Entrada',`${result.ticket.index} de ${result.ticket.total}`);}
    if(result.checkin){detail('Registrada em',new Date(result.checkin.at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}));detail('Portaria',result.checkin.station);}
    $('result').scrollIntoView({behavior:'smooth',block:'nearest'});$('resultTitle').focus({preventScroll:true});
  }
  async function check(code,action='preview'){
    if(busy)return;stopCamera();scanned=true;busy=true;current=null;$('admitButton').hidden=true;$('checkButton').disabled=true;$('scanMessage').textContent=action==='admit'?'Registrando entrada…':'Conferindo ingresso…';
    try{const result=await api('/api/gate-check',{code,action});if(result.status===401){showLogin(result.error);return;}render(result);if(result.state==='valid')current=code;$('scanMessage').textContent='';}
    catch{$('scanMessage').textContent='Conexão indisponível. Não libere a entrada. Consulte o mesmo código novamente para verificar se houve registro.';$('result').hidden=true;}
    finally{busy=false;$('checkButton').disabled=false;$('admitButton').disabled=false;}
  }
  function scanFrame(){
    if(!stream||scanned)return;
    const v=$('video');if(v.readyState>=2&&v.videoWidth){const scale=Math.min(1,800/v.videoWidth);canvas.width=Math.round(v.videoWidth*scale);canvas.height=Math.round(v.videoHeight*scale);ctx.drawImage(v,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);const code=jsQR(data.data,data.width,data.height,{inversionAttempts:'dontInvert'});if(code){$('ticketCode').value=code.data;check(code.data);return;}}
    timer=setTimeout(scanFrame,180);
  }
  $('startCamera').addEventListener('click',async()=>{
    if(busy||cameraStarting)return;cameraStarting=true;$('startCamera').disabled=true;clearResult();
    try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Câmera indisponível. Use HTTPS ou envie uma imagem do QR Code.');stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});$('video').srcObject=stream;$('video').hidden=false;await $('video').play();$('startCamera').hidden=true;$('stopCamera').hidden=false;$('cameraHint').hidden=true;scanFrame();}
    catch(error){stopCamera();$('scanMessage').textContent=error.name==='NotAllowedError'?'Permita o acesso à câmera nas configurações do navegador ou envie uma imagem do QR.':error.message;}
    finally{cameraStarting=false;$('startCamera').disabled=false;}
  });
  $('stopCamera').addEventListener('click',stopCamera);
  $('qrFile').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file||busy)return;stopCamera();clearResult();
    if(file.size>12*1024*1024){$('scanMessage').textContent='Escolha uma imagem de até 12 MB.';return;}
    let url;try{url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,1800/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=ctx.getImageData(0,0,canvas.width,canvas.height);const code=jsQR(data.data,data.width,data.height);if(!code)throw Error('QR Code não encontrado. Use uma imagem nítida ou cole o código.');$('ticketCode').value=code.data;await check(code.data);}
    catch(error){$('scanMessage').textContent=error.message||'Não foi possível ler a imagem.';}finally{if(url)URL.revokeObjectURL(url);}
  });
  $('codeForm').addEventListener('submit',event=>{event.preventDefault();check($('ticketCode').value.trim());});
  $('admitButton').addEventListener('click',()=>{if(current&&!busy){$('admitButton').disabled=true;check(current,'admit');}});
  $('nextButton').addEventListener('click',()=>{clearResult();$('startCamera').focus();});
  $('loginForm').addEventListener('submit',async event=>{event.preventDefault();$('loginButton').disabled=true;$('loginMessage').textContent='Entrando…';try{const result=await api('/api/gate-session',{password:$('password').value,station:$('station').value});if(!result.ok)throw Error(result.error);showScanner(result.station);}catch(error){$('loginMessage').textContent=error.message||'Não foi possível entrar.';}finally{$('loginButton').disabled=false;}});
  $('logout').addEventListener('click',async()=>{stopCamera();try{const result=await api('/api/gate-session',{action:'logout'});if(!result.ok)throw Error();showLogin();clearResult();}catch{$('scanMessage').textContent='Não foi possível encerrar a sessão. Tente novamente antes de deixar o aparelho.';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
  window.addEventListener('pagehide',stopCamera);
  api('/api/gate-session').then(result=>{if(result.ok)showScanner(result.station);else showLogin(result.status===503?result.error:'');}).catch(()=>showLogin('Sem conexão com a portaria. Tente novamente.'));
})();
