(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const title=$("thanksTitle"), message=$("thanksMessage"), button=$("receiveTicket"), retry=$("retryStatus");
  let token = null;
  let retries = 0, inFlight=false, retryTimer=null;
  try { token = sessionStorage.getItem("hp10_order_token"); } catch { /* private browsing/storage blocked */ }
  const brl = cents => (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const setPending = text => {title.textContent="CONFIRMAÇÃO EM ANDAMENTO";message.textContent=text;retry.hidden=false;button.hidden=true;$("thanksDetails").hidden=true;$("manualNote").hidden=true;};
  function scheduleRetry(delay=35){
    clearTimeout(retryTimer);
    if(!token||document.hidden||retries>=8)return;
    retryTimer=setTimeout(()=>{retries++;verify();},Math.max(25,delay)*1000);
  }
  async function verify(){
    if(inFlight)return;
    if(!token){setPending("Não encontramos uma cobrança nesta aba. Retorne ao checkout ou fale com a organização.");title.textContent="COBRANÇA NÃO LOCALIZADA";retry.hidden=true;return;}
    inFlight=true;
    retry.disabled=true;title.textContent="VERIFICANDO PAGAMENTO";message.textContent="Consultando a confirmação do PIX…";
    let nextRetry=35;let approved=false;
    try{
      const response=await fetch("/api/pix-status",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({token})});
      const result=await response.json();
      if(!response.ok){nextRetry=response.status===429?Math.max(35,Number(result.retry_after)||60):60;setPending(result.error||"Não foi possível consultar agora.");return;}
      if(result.paid!==true||result.status!=="PAID"||!result.order){nextRetry=Math.max(35,Number(result.poll_after)||35);setPending("Seu PIX ainda não aparece como aprovado. Se já pagou, aguarde a confirmação automática.");return;}
      const order=result.order;
      const messageReady=`Olá! Meu pagamento da Halloween da Mari Ferro foi aprovado e gostaria de receber meu ingresso.

Nome: ${order.name}
Ingresso(s): ${order.quantity} × ${order.ticket}
Valor pago: ${brl(order.amount_cents)}
Referência: ${order.reference}

Aguardo o envio do meu ingresso. Obrigado!`;
      const serviceNumber = window.HALLOWEEN_CONFIG?.whatsappServiceNumber;
      if (!/^55\d{10,11}$/.test(String(serviceNumber || ""))) {
        setPending("Atendimento temporariamente indisponível. Entre em contato com a organização.");
        return;
      }
      button.href=`https://wa.me/${serviceNumber}?text=${encodeURIComponent(messageReady)}`;
      title.textContent="PAGAMENTO APROVADO!";
      message.textContent="Seu pagamento foi confirmado. Para receber seu ingresso, fale com nossa equipe pelo WhatsApp.";
      $("thanksTicket").textContent=order.ticket;
      $("thanksQuantity").textContent=String(order.quantity);
      $("thanksAmount").textContent=brl(order.amount_cents);
      $("thanksReference").textContent=order.reference;
      $("thanksDetails").hidden=false;button.hidden=false;$("manualNote").hidden=false;retry.hidden=true;
      approved=true;clearTimeout(retryTimer);
    }catch{nextRetry=60;setPending("A consulta falhou. Sua compra não foi cancelada; tentaremos novamente.");}
    finally{inFlight=false;retry.disabled=false;if(!approved)scheduleRetry(nextRetry);}
  }
  retry.addEventListener("click",()=>{clearTimeout(retryTimer);verify();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)clearTimeout(retryTimer);else if(button.hidden&&token)verify();});
  verify();
})();
