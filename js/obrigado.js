(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let token=null, busy=false, complete=false, attempts=0, timer;
  try {token=sessionStorage.getItem('hp10_order_token');} catch {}
  const brl=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível consultar agora.');return data;}
  function el(tag,text,className){const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;}
  async function download(ticket,button){
    button.disabled=true;
    try {
      const qr=new Image();qr.src=ticket.qr;await qr.decode();
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=980;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,720,980);ctx.fillStyle='#210e16';ctx.textAlign='center';
      ctx.font='bold 32px Georgia';ctx.fillText('Halloween da Mari Ferro',360,60);ctx.font='18px Arial';ctx.fillText('MF PARTY · 31/10/2026',360,95);
      ctx.drawImage(qr,140,125,440,440);ctx.font='bold 22px Arial';ctx.fillText(`Ingresso ${ticket.index} de ${ticket.total}`,360,605);
      ctx.font='18px Arial';let y=645;
      for(const line of [ticket.category,'Comprador: '+ticket.buyer]){let row='';for(const word of line.split(' ')){if(ctx.measureText(row+word).width>630){ctx.fillText(row,360,y);y+=26;row='';}row+=word+' ';}ctx.fillText(row,360,y);y+=32;}
      ctx.font='16px monospace';ctx.fillText(ticket.code,360,845);ctx.font='17px Arial';ctx.fillText('Uma única entrada por QR Code.',360,895);ctx.fillText('Apresente este ingresso e um documento na portaria.',360,925);
      const link=document.createElement('a');link.download=`MF-PARTY-ingresso-${ticket.index}-${ticket.code.slice(-8)}.png`;link.href=canvas.toDataURL('image/png');link.click();
    } catch {alert('Não foi possível baixar. Use Imprimir / salvar em PDF ou tire uma captura do ingresso.');}
    finally {button.disabled=false;}
  }
  function render(tickets){
    $('ticketList').replaceChildren();
    for(const ticket of tickets){const card=el('article',null,'entry-ticket');card.append(el('h2',`Ingresso ${ticket.index} de ${ticket.total}`),el('p',ticket.category),el('p','Comprador: '+ticket.buyer));const img=el('img');img.src=ticket.qr;img.alt=`QR Code do ingresso ${ticket.index}`;img.width=360;img.height=360;card.append(img,el('code',ticket.code));const button=el('button','BAIXAR INGRESSO (PNG)','thanks-button');button.type='button';button.addEventListener('click',()=>download(ticket,button));card.append(button);$('ticketList').append(card);}
    $('ticketList').hidden=false;$('printTickets').hidden=false;
  }
  async function verify(){
    if(busy||complete)return;
    if(!token){$('thanksTitle').textContent='COMPRA NÃO LOCALIZADA';$('thanksMessage').textContent='Abra a confirmação na mesma aba da compra. Se já salvou o ingresso, use o arquivo baixado. Caso contrário, fale com a organização.';return;}
    busy=true;$('retryStatus').disabled=true;$('retryStatus').hidden=true;let retry=true;
    try {
      $('thanksTitle').textContent='CONFIRMANDO SEU PIX';
      const result=await post('/api/pix-status',{token});
      if(!result.paid||!result.order){$('thanksMessage').textContent='Aguardando a confirmação do pagamento. Seus ingressos aparecerão aqui após a aprovação.';return;}
      const order=result.order;
      $('thanksTitle').textContent='PAGAMENTO APROVADO';$('thanksMessage').textContent='Preparando seus ingressos…';
      $('thanksTicket').textContent=order.ticket;$('thanksQuantity').textContent=order.quantity;$('thanksAmount').textContent=brl(order.amount_cents);$('thanksReference').textContent=order.reference;$('thanksDetails').hidden=false;
      const data=await post('/api/tickets',{token});
      if(!Array.isArray(data.tickets)||!data.tickets.length)throw Error('A emissão não foi concluída. Tente novamente.');
      render(data.tickets);complete=true;retry=false;$('thanksTitle').textContent='SEUS INGRESSOS';$('thanksMessage').textContent='Tudo pronto! Baixe cada ingresso ou salve todos em PDF. Para compras com mais de uma entrada, cada pessoa apresenta um QR Code diferente.';
    } catch(error){$('thanksMessage').textContent=error.message||'A consulta falhou. Tente novamente.';}
    finally {busy=false;$('retryStatus').disabled=false;$('retryStatus').hidden=complete;if(retry&&attempts++<8&&!document.hidden)timer=setTimeout(verify,60000);}
  }
  $('retryStatus').addEventListener('click',()=>{clearTimeout(timer);verify();});
  $('printTickets').addEventListener('click',()=>window.print());
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden&&!complete)verify();});
  verify();
})();
