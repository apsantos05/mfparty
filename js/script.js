(() => {
  "use strict";

  const config = window.HALLOWEEN_CONFIG || {};
  const eventDay = new Date("2026-10-31T00:00:00-03:00").getTime();

  function updateCountdown() {
    const remaining = Math.max(0, eventDay - Date.now());
    const total = Math.floor(remaining / 1000);

    const values = {
      days: Math.floor(total / 86400),
      hours: Math.floor(total / 3600) % 24,
      minutes: Math.floor(total / 60) % 60,
      seconds: total % 60
    };

    Object.entries(values).forEach(([id, value]) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(value).padStart(2, "0");
    });

    if (!remaining) {
      const note = document.getElementById("count-note");
      if (note) note.textContent = "31 de outubro de 2026 · Halloween da Mari Ferro";
    }
  }

  document.querySelectorAll("[data-whatsapp]").forEach(link => {
    link.href = config.whatsappGroupUrl || "#";
  });

  const details = [...document.querySelectorAll(".questions details")];
  details.forEach(detail => {
    detail.addEventListener("toggle", () => {
      if (!detail.open) return;
      details.forEach(other => {
        if (other !== detail) other.open = false;
      });
    });
  });


  // Mostrar CTA compacto somente após o hero, sem cobrir os dois botões iniciais.
  const quickActions = document.getElementById("mobileActions");
  const hero = document.getElementById("inicio");
  const join = document.getElementById("grupo");
  if (quickActions && hero) {
    const updateActions = () => {
      const heroBottom = hero.getBoundingClientRect().bottom;
      const joinRect = join ? join.getBoundingClientRect() : null;
      const joinOnScreen = joinRect && joinRect.top < window.innerHeight - 75 && joinRect.bottom > 75;
      quickActions.classList.toggle("is-visible", heroBottom < 120 && !joinOnScreen);
    };
    updateActions();
    window.addEventListener("scroll", updateActions, { passive: true });
    window.addEventListener("resize", updateActions, { passive: true });
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
})();
