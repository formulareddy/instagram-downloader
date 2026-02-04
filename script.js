/**
 * Instagram Video Downloader — production frontend.
 * Calls live backend at https://instagram-backend-4p93.onrender.com
 * Handles: cold start (Render free tier), retry once, user-friendly errors only.
 * No API keys. HTTPS only. AdSense-safe.
 */

(function () {
  "use strict";

  // Live backend URL (Render). No localhost or relative URLs.
  var API_BASE = "https://instagram-backend-4p93.onrender.com";

  // ========== DOM refs ==========
  var form = document.getElementById("download-form");
  var urlInput = document.getElementById("url-input");
  var submitBtn = document.getElementById("submit-btn");
  var inputWrap = document.querySelector(".input-wrap");
  var urlError = document.getElementById("url-error");
  var urlValidIcon = document.getElementById("url-valid-icon");
  var heroInner = document.getElementById("hero-inner");
  var loadingState = document.getElementById("loading-state");
  var loadingProgressBar = document.getElementById("loading-progress-bar");
  var loadingStep = document.getElementById("loading-step");
  var successState = document.getElementById("success-state");
  var downloadLink = document.getElementById("download-link");
  var copyLinkBtn = document.getElementById("copy-link-btn");
  var errorState = document.getElementById("error-state");
  var errorMessage = document.getElementById("error-message");
  var yearSpan = document.getElementById("year");

  var validationTimer = null;
  var VALIDATION_DEBOUNCE_MS = 280;
  var loadingStepTimeouts = [];

  // ========== Form error ==========
  function hideFormError() {
    if (!urlError) return;
    urlError.hidden = true;
    urlError.textContent = "";
    if (urlInput) urlInput.setAttribute("aria-invalid", "false");
  }

  function showFormError(message) {
    if (!urlError) return;
    urlError.textContent = message || "Invalid Instagram URL";
    urlError.hidden = false;
    if (urlInput) urlInput.setAttribute("aria-invalid", "true");
  }

  // ========== Hero state (idle | loading | success | error) ==========
  function setHeroState(state) {
    if (heroInner) heroInner.dataset.state = state;
  }

  function hideResultStates() {
    if (loadingState) loadingState.hidden = true;
    if (successState) successState.hidden = true;
    if (errorState) errorState.hidden = true;
  }

  /** Animate progress bar and step text. Call complete(downloadUrl) when API resolves. */
  function runLoadingSteps(complete) {
    if (!loadingProgressBar || !loadingStep) return;
    loadingProgressBar.style.width = "0%";
    loadingStep.textContent = "Analyzing link...";

    loadingStepTimeouts.forEach(function (id) { clearTimeout(id); });
    loadingStepTimeouts = [];

    loadingStepTimeouts.push(setTimeout(function () {
      loadingProgressBar.style.width = "30%";
      loadingStep.textContent = "Fetching video...";
    }, 400));
    loadingStepTimeouts.push(setTimeout(function () {
      loadingProgressBar.style.width = "60%";
      loadingStep.textContent = "Preparing download...";
    }, 900));
    loadingStepTimeouts.push(setTimeout(function () {
      loadingProgressBar.style.width = "85%";
    }, 1400));

    if (typeof complete === "function") {
      window._loadingComplete = complete;
    }
  }

  /** Call when API resolves: set 100%, then run complete callback (showSuccess). */
  function setLoadingComplete(downloadUrl) {
    if (loadingProgressBar) loadingProgressBar.style.width = "100%";
    if (loadingStep) loadingStep.textContent = "Ready!";
    loadingStepTimeouts.push(setTimeout(function () {
      if (window._loadingComplete) {
        window._loadingComplete(downloadUrl);
        window._loadingComplete = null;
      }
    }, 350));
  }

  function showLoading() {
    hideResultStates();
    setHeroState("loading");
    if (loadingState) loadingState.hidden = false;
    if (submitBtn) submitBtn.disabled = true;
    runLoadingSteps(function (downloadUrl) {
      setHeroState("success");
      if (loadingState) loadingState.hidden = true;
      if (submitBtn) submitBtn.disabled = false;
      if (downloadLink) {
        downloadLink.href = downloadUrl;
        downloadLink.download = "instagram-video.mp4";
      }
      if (successState) successState.hidden = false;
    });
  }

  function hideLoading() {
    setHeroState("idle");
    if (loadingState) loadingState.hidden = true;
    loadingStepTimeouts.forEach(function (id) { clearTimeout(id); });
    loadingStepTimeouts = [];
    updateSubmitButtonState();
  }

  function showSuccess(downloadUrl) {
    setLoadingComplete(downloadUrl);
  }

  function showApiError(message) {
    hideLoading();
    setHeroState("error");
    if (successState) successState.hidden = true;
    if (errorMessage) {
      errorMessage.textContent = message || "Something went wrong. Please try again.";
    }
    if (errorState) errorState.hidden = false;
  }

  // ========== URL validation ==========
  function isValidInstagramUrl(url) {
    if (!url || typeof url !== "string") return false;
    var trimmed = url.trim();
    if (trimmed.length === 0) return false;
    var re = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels)\/[a-zA-Z0-9_-]+\/?(\?.*)?$/i;
    return re.test(trimmed);
  }

  function updateUrlFeedback() {
    var url = urlInput ? urlInput.value.trim() : "";
    var valid = isValidInstagramUrl(url);

    if (inputWrap) {
      inputWrap.classList.toggle("has-value", url.length > 0);
      inputWrap.classList.toggle("is-valid", valid);
    }
    if (urlValidIcon) {
      urlValidIcon.classList.toggle("visible", valid);
      urlValidIcon.hidden = !valid;
    }
    updateSubmitButtonState();
  }

  function updateSubmitButtonState() {
    if (!submitBtn) return;
    var url = urlInput ? urlInput.value.trim() : "";
    submitBtn.disabled = !isValidInstagramUrl(url);
  }

  function debouncedValidation() {
    if (validationTimer) clearTimeout(validationTimer);
    validationTimer = setTimeout(function () {
      validationTimer = null;
      updateUrlFeedback();
    }, VALIDATION_DEBOUNCE_MS);
  }

  // ========== Backend API — live Render URL only. No keys, no localhost ==========
  function fetchDownloadLink(instagramUrl) {
    var url = API_BASE + "/api/instagram?url=" + encodeURIComponent(instagramUrl);
    return fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Backend unavailable");
        return res.json();
      })
      .then(function (data) {
        if (!data.downloadUrl) {
          throw new Error("No video found or private content");
        }
        return data.downloadUrl;
      });
  }

  // User-friendly messages only. No console stack traces or backend details.
  function toUserMessage(err) {
    var msg = (err && err.message) ? err.message : "";
    if (msg.indexOf("Invalid") !== -1 || msg.indexOf("valid") !== -1) return "Invalid Instagram URL";
    if (msg.indexOf("private") !== -1 || msg.indexOf("not found") !== -1 || msg.indexOf("No video") !== -1) return "Private / unavailable video";
    if (msg.indexOf("Backend unavailable") !== -1 || msg.indexOf("timeout") !== -1 || msg.indexOf("fetch") !== -1) return "Server waking up, please wait.";
    return "Something went wrong. Please try again.";
  }

  // Render free-tier cold start: retry once; show "Server waking up…" on retry (do not treat first delay as error)
  function fetchDownloadLinkWithRetry(instagramUrl, isRetry) {
    if (loadingStep && isRetry) {
      loadingStep.textContent = "Server waking up, please wait a few seconds…";
    }
    return fetchDownloadLink(instagramUrl).catch(function (err) {
      if (!isRetry) {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            fetchDownloadLinkWithRetry(instagramUrl, true).then(resolve, reject);
          }, 2500);
        });
      }
      throw err;
    });
  }

  // ========== Form submit & paste ==========
  function doDownload(url) {
    var inputUrl = (url !== undefined ? url : (urlInput && urlInput.value.trim())) || "";
    hideFormError();
    hideResultStates();
    setHeroState("idle");

    if (!inputUrl.trim()) {
      showFormError("Invalid Instagram URL");
      return;
    }
    if (!isValidInstagramUrl(inputUrl)) {
      showFormError("Invalid Instagram URL");
      return;
    }

    if (urlInput && url !== undefined) urlInput.value = inputUrl;
    updateUrlFeedback();

    showLoading();
    fetchDownloadLinkWithRetry(inputUrl, false)
      .then(function (downloadUrl) {
        setLoadingComplete(downloadUrl);
      })
      .catch(function (err) {
        showApiError(toUserMessage(err));
      });
  }

  function handleSubmit(e) {
    e.preventDefault();
    doDownload();
  }

  /** Paste flash: add class so CSS can animate input */
  function handlePasteEvent() {
    if (inputWrap) {
      inputWrap.classList.add("paste-flash");
      setTimeout(function () {
        inputWrap.classList.remove("paste-flash");
      }, 600);
    }
    setTimeout(function () { updateUrlFeedback(); }, 0);
  }

  function handleInputChange() {
    if (urlError && !urlError.hidden) hideFormError();
    debouncedValidation();
  }

  // ========== Copy link ==========
  function handleCopyLink() {
    if (!downloadLink || !downloadLink.href || downloadLink.href === "#") return;
    var href = downloadLink.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(href).then(function () {
        if (copyLinkBtn) {
          copyLinkBtn.textContent = "Copied!";
          copyLinkBtn.setAttribute("aria-label", "Link copied");
          setTimeout(function () {
            copyLinkBtn.textContent = "Copy link";
            copyLinkBtn.setAttribute("aria-label", "Copy download link");
          }, 2000);
        }
      }).catch(function () { copyLinkFallback(href); });
    } else {
      copyLinkFallback(href);
    }
  }

  function copyLinkFallback(href) {
    var el = document.createElement("textarea");
    el.value = href;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
      if (copyLinkBtn) copyLinkBtn.textContent = "Copied!";
    } catch (e) {}
    document.body.removeChild(el);
  }

  // ========== FAQ accordion ==========
  function initFaq() {
    var triggers = document.querySelectorAll("[data-faq-toggle]");
    triggers.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var expanded = btn.getAttribute("aria-expanded") === "true";
        var id = btn.getAttribute("aria-controls");
        var panel = id ? document.getElementById(id) : null;
        if (panel) {
          panel.hidden = expanded;
          btn.setAttribute("aria-expanded", !expanded);
        }
      });
    });
  }

  // ========== Lazy ads (CLS-safe) ==========
  function initLazyAds() {
    var ads = document.querySelectorAll(".ad[data-ad-slot]");
    if (!window.IntersectionObserver) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("ad--loaded");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "80px", threshold: 0.01 });
    ads.forEach(function (el) { observer.observe(el); });
  }

  // ========== Init ==========
  function init() {
    if (form) form.addEventListener("submit", handleSubmit);
    if (urlInput) {
      urlInput.addEventListener("input", handleInputChange);
      urlInput.addEventListener("change", handleInputChange);
      urlInput.addEventListener("paste", handlePasteEvent);
      setTimeout(function () { urlInput.focus(); }, 150);
    }
    if (copyLinkBtn) copyLinkBtn.addEventListener("click", handleCopyLink);

    updateUrlFeedback();
    initFaq();
    initLazyAds();
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
