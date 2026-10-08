// 가짜 문 테스트: 결제 버튼 클릭과 알림 신청을 측정한다. 실제 결제는 받지 않는다.
(function () {
  var C = window.LAB_CONFIG || {};
  var APP = document.body.dataset.app || "hub";

  if (C.GA4_ID) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + C.GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", C.GA4_ID, { app_slug: APP });
  }
  if (C.META_PIXEL_ID) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", C.META_PIXEL_ID);
    fbq("track", "PageView");
  }

  function track(name, extra) {
    var p = Object.assign({ app_slug: APP }, extra || {});
    if (window.gtag) gtag("event", name, p);
    if (window.fbq) fbq("trackCustom", name, p);
  }
  window.labTrack = track;

  var modal = document.getElementById("modal");
  if (!modal) return;
  var price = document.body.dataset.price;

  document.querySelectorAll("[data-cta]").forEach(function (b) {
    b.addEventListener("click", function () {
      track("cta_click", { value: Number(price), currency: "KRW", position: b.dataset.cta });
      if (window.fbq) fbq("track", "InitiateCheckout", { value: Number(price), currency: "KRW" });
      modal.classList.add("on");
    });
  });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.classList.remove("on"); });
  document.getElementById("close").addEventListener("click", function () { modal.classList.remove("on"); });

  document.getElementById("wait").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = document.getElementById("contact").value.trim();
    if (!v) return;
    track("waitlist_submit");
    if (window.fbq) fbq("track", "Lead");
    if (C.WAITLIST_URL) {
      fetch(C.WAITLIST_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ app: APP, contact: v, at: new Date().toISOString() }) }).catch(function () {});
    }
    document.getElementById("wait").innerHTML = "<p><b>신청 완료!</b> 오픈하면 가장 먼저 50% 할인으로 알려드릴게요.</p>";
  });
})();
