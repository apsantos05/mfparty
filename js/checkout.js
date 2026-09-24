(() => {
  "use strict";

  const config = window.HALLOWEEN_CONFIG || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const ticketOptions = {mulher:{label:'Mulher',price:40,admissions:1},homem:{label:'Homem',price:60,admissions:1},jovem:{label:'+16 anos · Open bar sem álcool (refrigerante, água e energético)',price:25,admissions:1},combo:{label:'Combo Amigo · Unissex',price:80,admissions:2}};

  const state = {
    coupon: "",
    discountRate: 25,
    ticket: "mulher",
    price: 40,
    quantity: 1,
    orderToken: null,
    activePayment: false,
    processingPayment: false,
    checkingStatus: false,
    expiredLocal: false,
    pixExpiresAt: null,
    pollTimer: null,
    lastStatusAttempt: 0,
    requestId: null,
    requestFingerprint: null,
    timer: null
  };

  const ticketButtons = $$("[data-ticket]");
  const qtyMinus = $("#qtyMinus");
  const qtyPlus = $("#qtyPlus");
  const qtyValue = $("#qtyValue");
  const totalValue = $("#totalValue");
  const summaryTicket = $("#summaryTicket");
  const summaryQty = $("#summaryQty");
  const summarySubtotal = $("#summarySubtotal");
  const summaryFee = $("#summaryFee");
  const summaryTotal = $("#summaryTotal");
  const generatePix = $("#generatePix");
  const payButtonText = $("#payButtonText");
  const lotNote = $("#lotNote");
  const pixPanel = $("#pixPanel");
  const successPanel = $("#successPanel");
  const pixAmount = $("#pixAmount");
  const pixQr = $("#pixQr");
  const pixCode = $("#pixCode");
  const copyPix = $("#copyPix");
  const copyPixLarge = $("#copyPixLarge");
  const checkPayment = $("#checkPayment");
  const pixTimer = $("#pixTimer");
  const pixStatus = $("#pixStatus");
  const statusHint = $("#statusHint");
  const toast = $("#toast");

  function brl(value) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function digits(value) {
    return String(value || "").replace(/\D+/g, "");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  function captureUtm() {
    const params = new URLSearchParams(location.search);
    return {
      source: params.get("utm_source") || "",
      medium: params.get("utm_medium") || "",
      campaign: params.get("utm_campaign") || "",
      content: params.get("utm_content") || "",
      term: params.get("utm_term") || "",
      fbclid: params.get("fbclid") || "",
      ttclid: params.get("ttclid") || "",
      gclid: params.get("gclid") || ""
    };
  }

  const validCoupons = ["DOLCE25", "MARIF25", "BRUNOJ25", "PROMO25"];

  function updateSummary() {
    const feePerTicket = Number(config.serviceFeePerTicket || 4.49);
    const admissions = state.quantity * ticketOptions[state.ticket].admissions;
    const subtotal = Math.round(state.price * 100) * state.quantity;
    const serviceFee = Math.round(feePerTicket * 100) * admissions;
    const discount = state.coupon ? Math.round(subtotal * state.discountRate / 100) : 0;
    const total = subtotal - discount + serviceFee;
    $("#discountRow").hidden = !state.coupon;
    $("#discountLabel").textContent = `Desconto ${state.coupon} (${state.discountRate}%)`;
    $("#summaryDiscount").textContent = `− ${brl(discount / 100)}`;
    $("#removeCoupon").hidden = !state.coupon;
    ["#couponCode", "#applyCoupon", "#removeCoupon"].forEach(id => { $(id).disabled = state.activePayment || state.processingPayment; });

    qtyValue.textContent = String(state.quantity);
    totalValue.textContent = brl(total / 100);
    summaryTicket.textContent = `1º Lote · ${ticketOptions[state.ticket].label}`;
    summaryQty.textContent = state.ticket === "combo" ? `${state.quantity} combo(s) · ${admissions} ingressos` : String(admissions);
    $("#quantityLabel").textContent = state.ticket === "combo" ? "QUANTIDADE DE COMBOS" : "QUANTIDADE";
    summarySubtotal.textContent = brl(subtotal / 100);
    summaryFee.textContent = `${brl(serviceFee / 100)} (${brl(feePerTicket)} por ingresso)`;
    summaryTotal.textContent = brl(total / 100);

    qtyMinus.disabled = state.quantity <= 1 || state.activePayment || state.processingPayment;
    qtyPlus.disabled = state.quantity >= (state.ticket === "combo" ? 1 : 5) || state.activePayment || state.processingPayment;
    ticketButtons.forEach(button => { button.disabled = state.activePayment || state.processingPayment; });

    generatePix.disabled = state.activePayment || state.processingPayment;
    payButtonText.textContent = state.activePayment ? "PIX GERADO · AGUARDE" : "GERAR PIX";
    lotNote.textContent = `Pagamento exclusivamente via PIX · taxa de serviço ${brl(feePerTicket)} por ingresso. Abertura oficial do 1º lote em 21/09 às 00h.`;
  }

  function validateForm() {
    const name = $("#customerName").value.trim();
    const email = $("#customerEmail").value.trim();
    const cpf = digits($("#customerCpf").value);
    const phone = digits($("#customerPhone").value);

    if (name.length < 3) return { ok: false, message: "Informe seu nome completo." };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: "Informe um e-mail válido." };
    if (cpf.length !== 11) return { ok: false, message: "Informe um CPF válido com 11 dígitos." };
    if (phone.length < 10 || phone.length > 13) return { ok: false, message: "Informe um WhatsApp válido." };

    return {
      ok: true,
      data: { name, email, cpf, phone }
    };
  }

  function setLoading(loading) {
    state.processingPayment = loading;
    updateSummary();
    generatePix.disabled = loading || state.activePayment;
    payButtonText.textContent = loading ? "GERANDO PIX..." : (state.activePayment ? "PIX GERADO · AGUARDE" : "GERAR PIX");
  }

  function canResumePayment() {
    try {
      const key = "hp10_storage_check";
      sessionStorage.setItem(key, "1");
      const ok = sessionStorage.getItem(key) === "1";
      sessionStorage.removeItem(key);
      return ok;
    } catch { return false; }
  }

  function requestFor(data) {
    const fingerprint = JSON.stringify({ticket:state.ticket,quantity:state.quantity,...(state.coupon?{coupon:state.coupon}:{}),customer:data});
    if (state.requestFingerprint !== fingerprint || !state.requestId) {
      state.requestFingerprint = fingerprint;
      state.requestId = crypto.randomUUID();
      try { sessionStorage.setItem("hp10_payment_draft", JSON.stringify({fingerprint,requestId:state.requestId})); } catch {}
    }
    return state.requestId;
  }

  function queuePoll(seconds=30){
    clearTimeout(state.pollTimer);
    if(!state.orderToken||!state.activePayment||document.hidden||!navigator.onLine)return;
    const delay=Math.max(10,Number(seconds)||30)*1000+Math.floor(Math.random()*6000);
    state.pollTimer=setTimeout(checkStatus,delay);
  }

  async function generatePayment() {
    if (state.processingPayment || state.activePayment) return;
    if (!canResumePayment()) {
      showToast("Não foi possível preservar seu pagamento neste navegador. Habilite os dados do site ou use outra aba normal.");
      return;
    }
    if ($("#couponCode").value.trim().toUpperCase() !== state.coupon) {
      $("#couponStatus").textContent = "Clique em APLICAR para validar o cupom antes de gerar o PIX.";
      $("#applyCoupon").focus();
      return;
    }
    const validation = validateForm();

    if (!validation.ok) {
      showToast(validation.message);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/create-pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: state.ticket,
          quantity: state.quantity,
          coupon: state.coupon,
          customer: validation.data,
          utm: captureUtm(),
          request_id: requestFor(validation.data)
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível gerar o PIX.");
      }

      if (!payload.token || !payload.copy_paste) throw new Error("Resposta PIX incompleta.");
      state.orderToken = payload.token;
      state.requestId = null;
      state.requestFingerprint = null;
      try { sessionStorage.removeItem("hp10_payment_draft"); } catch {}
      state.activePayment = true;
      state.pixExpiresAt = payload.expires_at;
      state.expiredLocal = false;
      try {
        sessionStorage.setItem("hp10_order_token", payload.token);
        sessionStorage.setItem("hp10_pix_display", JSON.stringify({copy_paste:payload.copy_paste,qr_data_url:payload.qr_data_url,expires_at:payload.expires_at,amount_cents:payload.amount_cents,ticket:state.ticket,quantity:state.quantity,coupon:payload.coupon||""}));
      } catch {
        statusHint.textContent = "Mantenha esta aba aberta até a confirmação. O navegador não permitiu preservar a cobrança para retorno.";
      }
      updateSummary();

      pixAmount.textContent = brl(payload.amount_cents / 100);
      pixCode.value = payload.copy_paste || "";

      if (payload.qr_data_url) {
        pixQr.src = payload.qr_data_url;
        $("#qrBox").hidden = false;
      } else {
        $("#qrBox").hidden = true;
      }

      pixPanel.hidden = false;
      successPanel.hidden = true;

      startExpiryTimer(payload.expires_at);
      startPolling();

      pixPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      const text=error.message || "Erro ao gerar PIX.";
      statusHint.textContent=text + " Se a solicitação não respondeu, tente novamente sem alterar os dados.";
      showToast(text);
    } finally {
      setLoading(false);
    }
  }

  async function copyPixCode() {
    const code = pixCode.value;

    if (!code) return;

    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      pixCode.focus();
      pixCode.select();
      copied = document.execCommand("copy");
    }
    showToast(copied ? "Código PIX copiado." : "Selecione e copie o código PIX manualmente.");
  }

  function stopTimers() {
    clearTimeout(state.pollTimer);
    clearInterval(state.timer);
    state.pollTimer = null;
    state.timer = null;
  }

  function startExpiryTimer(expiresAt) {
    clearInterval(state.timer);

    if (!expiresAt) {
      pixTimer.textContent = "consulte seu banco";
      return;
    }

    const target = new Date(expiresAt).getTime();

    const tick = () => {
      const diff = target - Date.now();

      if (diff <= 0) {
        clearInterval(state.timer);
        pixTimer.textContent = "00:00";
        if (!state.expiredLocal) {
          state.expiredLocal = true;
          pixStatus.querySelector("strong").textContent = "PRAZO ENCERRADO";
          statusHint.textContent = "Verificando se o pagamento foi concluído antes de permitir outro PIX.";
          checkStatus();
        }
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      pixTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };

    tick();
    state.timer = setInterval(tick, 1000);
  }

  async function checkStatus() {
    if (!state.orderToken || state.checkingStatus || !navigator.onLine) return;
    state.lastStatusAttempt=Date.now();
    let nextPoll=30;
    state.checkingStatus = true;
    checkPayment.disabled = true;
    checkPayment.textContent = "VERIFICANDO PAGAMENTO...";
    try {
      const response = await fetch("/api/pix-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token: state.orderToken })
      });
      const payload = await response.json();
      if (!response.ok) {
        nextPoll = response.status===429 ? Math.max(30,Number(payload.retry_after)||60) : 90;
        statusHint.textContent = payload.error || "Não foi possível consultar. Tente novamente.";
        return;
      }
      nextPoll=Math.max(25,Number(payload.poll_after)||180);
      const status = String(payload.status || "").toUpperCase();
      if (status === "PAID" && payload.paid === true) {
        stopTimers();
        state.activePayment = false;
        location.assign("obrigado.html");
        return;
      }
      if (["EXPIRED", "FAILED", "CANCELLED", "REFUNDED", "CHARGEBACK"].includes(status)) {
        stopTimers();
        state.activePayment = false;
        try {
          sessionStorage.removeItem("hp10_order_token");
          sessionStorage.removeItem("hp10_pix_display");
        } catch { /* storage unavailable */ }
        state.orderToken = null;
        updateSummary();
        pixStatus.querySelector("strong").textContent = "PAGAMENTO NÃO CONCLUÍDO";
        pixPanel.hidden = true;
        showToast("Cobrança encerrada. Você pode gerar um novo PIX.");
        statusHint.textContent = "Cobrança encerrada. Gere um novo PIX somente se ainda não pagou.";
      } else {
        pixStatus.querySelector("strong").textContent = state.expiredLocal ? "CONFIRMANDO PRAZO" : "AGUARDANDO PAGAMENTO";
        statusHint.textContent = state.expiredLocal
          ? "Prazo local encerrado. Consulte novamente; não gere outro PIX enquanto o banco confirmar esta cobrança."
          : "Aguardando confirmação do banco. Não gere outro PIX enquanto estiver pendente.";
      }
    } catch {
      nextPoll=90;
      statusHint.textContent = "Não foi possível consultar agora. Tente novamente.";
    } finally {
      state.checkingStatus = false;
      checkPayment.disabled = false;
      checkPayment.textContent = "JÁ PAGUEI · VERIFICAR";
      queuePoll(nextPoll);
    }
  }

  function startPolling() {
    clearTimeout(state.pollTimer);
    checkStatus();
  }

  ticketButtons.forEach(button => {
    button.addEventListener("click", () => {
      ticketButtons.forEach(item => {
        item.classList.remove("is-selected");
        item.setAttribute("aria-checked", "false");
      });

      button.classList.add("is-selected");
      button.setAttribute("aria-checked", "true");

      state.ticket = button.dataset.ticket;
      state.price = Number(button.dataset.price);
      state.quantity = 1;

      updateSummary();
    });
  });

  qtyMinus.addEventListener("click", () => {
    state.quantity = Math.max(1, state.quantity - 1);
    updateSummary();
  });

  qtyPlus.addEventListener("click", () => {
    state.quantity = Math.min(state.ticket === "combo" ? 1 : 5, state.quantity + 1);
    updateSummary();
  });

  $("#applyCoupon").addEventListener("click", () => {
    if (state.activePayment || state.processingPayment) return;
    const code = $("#couponCode").value.trim().toUpperCase();
    if (!validCoupons.includes(code)) {
      state.coupon = "";
      $("#couponStatus").textContent = "Cupom inválido. Confira o código ou limpe o campo para continuar sem desconto.";
      $("#couponCode").setAttribute("aria-invalid", "true");
    } else {
      state.coupon = code;
      state.discountRate = 25;
      $("#couponCode").value = code;
      $("#couponCode").removeAttribute("aria-invalid");
      $("#couponStatus").textContent = `Cupom ${code} aplicado: 25% de desconto nos ingressos. Taxa de serviço sem desconto.`;
    }
    updateSummary();
  });
  $("#removeCoupon").addEventListener("click", () => {
    if (state.activePayment || state.processingPayment) return;
    state.coupon = "";
    $("#couponCode").value = "";
    $("#couponCode").removeAttribute("aria-invalid");
    $("#couponStatus").textContent = "Cupom removido.";
    updateSummary();
  });
  $("#couponCode").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); $("#applyCoupon").click(); }
  });
  generatePix.addEventListener("click", generatePayment);
  copyPix.addEventListener("click", copyPixCode);
  copyPixLarge.addEventListener("click", copyPixCode);
  checkPayment.addEventListener("click", () => {
    if(Date.now()-state.lastStatusAttempt<25000){
      statusHint.textContent="Aguarde alguns segundos: a confirmação é consultada automaticamente.";
      return;
    }
    clearTimeout(state.pollTimer);
    checkStatus();
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden)clearTimeout(state.pollTimer);
    else if(state.activePayment)queuePoll(3);
  });
  window.addEventListener("online",()=>{if(state.activePayment)queuePoll(3);});
  window.addEventListener("offline",()=>{clearTimeout(state.pollTimer);statusHint.textContent="Sem conexão. O PIX continua válido; a consulta voltará ao reconectar.";});

  document.querySelectorAll("[data-whatsapp]").forEach(link => {
    link.href = config.whatsappGroupUrl || "#";
  });

  updateSummary();
  try { const draft=JSON.parse(sessionStorage.getItem("hp10_payment_draft")||"null"); if(draft?.requestId&&draft?.fingerprint){state.requestId=draft.requestId;state.requestFingerprint=draft.fingerprint;} } catch {}
  // Reabrir o checkout não cria uma segunda cobrança silenciosamente.
  let previous = null;
  try { previous = sessionStorage.getItem("hp10_order_token"); } catch { /* storage unavailable */ }
  if (previous) {
    state.orderToken = previous;
    state.activePayment = true;
    let stored = null;
    try { stored = sessionStorage.getItem("hp10_pix_display"); } catch { /* storage unavailable */ }
    if(stored){
      try{
        const data=JSON.parse(stored);
        if(data.copy_paste){
          // A seleção exibida após o reload deve refletir a cobrança original.
          // A aprovação permanece exclusiva do servidor; dados locais são somente visuais.
          if (Object.hasOwn(ticketOptions, data.ticket) && Number.isInteger(data.quantity) && data.quantity >= 1 && data.quantity <= 5) {
            const legacyCoupon = ["DOLCE10", "MARIF10", "BRUNOJ10", "PROMO10"].includes(data.coupon);
            state.coupon = validCoupons.includes(data.coupon) || legacyCoupon ? data.coupon : "";
            state.discountRate = legacyCoupon ? 10 : 25;
            $("#couponCode").value = state.coupon;
            if (state.coupon) $("#couponStatus").textContent = `Cupom ${state.coupon} aplicado ao PIX recuperado.`;
            state.ticket = data.ticket;
            state.quantity = data.quantity;
            state.price = ticketOptions[data.ticket].price;
            ticketButtons.forEach(button => {
              const selected = button.dataset.ticket === data.ticket;
              button.classList.toggle("is-selected", selected);
              button.setAttribute("aria-checked", String(selected));
            });
            updateSummary();
          }
          pixCode.value=data.copy_paste;
          pixAmount.textContent=brl(data.amount_cents/100);
          if(data.qr_data_url){pixQr.src=data.qr_data_url;$("#qrBox").hidden=false;}else{$("#qrBox").hidden=true;}
          pixPanel.hidden=false;
          startExpiryTimer(data.expires_at);
        }
      }catch{/* Ainda é possível consultar o pagamento com token válido. */}
    }
    statusHint.textContent = "Consultando seu último pagamento…";
    updateSummary();
    startPolling();
  }
})();
